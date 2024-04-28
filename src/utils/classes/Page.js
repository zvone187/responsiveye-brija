import Jimp from "jimp";
import FS from "fs";
import config from '../config.js';
import {Builder} from 'selenium-webdriver';
import Chrome from 'selenium-webdriver/chrome.js';
import Firefox from 'selenium-webdriver/firefox.js';
import {
    createBlankBitmap,
    createDirIfDoesntExist,
    delay,
    getUrlParts,
    loadFileAndImportVariables,
    removeDuplicates,
    saveData, sendProgressUpdate, sendScreenshotUpdate
} from '../common.js'
import Layer from "./Layer.js";
import Canvas from "canvas";
import Debug from "../debug.js";
import path from "path";
import FunctionalTesting from "./FunctionalTesting.js";
import Shopify from "./Shopify.js";
import Breaking from "./Breaking.js";

const browserScriptsPath = './src/utils/browser_scripts'

export default class Page {
    constructor({url, vpWidth, vpHeight, resolutionStep, startRes, endRes, s3Location, browser}) {
        this.url = url;
        let urlParts = getUrlParts(url);
        this.urlId = urlParts.id;
        this.urlHost = urlParts.host;
        this.urlPath = urlParts.pathname;
        this.layers = [];
        this.flattened = [];
        this.breakpoints = [];
        this.fixedElementsList = [];
        this.absoluteElementsList = [];
        this.textAffectedElements = [];
        this.skippedElementsList = [];
        this.width = startRes || vpWidth || 1920;
        this.height = vpHeight || 1080;
        this.resolutionStep = resolutionStep || config.processing_resolution_step;
        this.startRes = startRes;
        this.endRes = endRes;
        this.s3Location = s3Location;
        this.browser = browser || 'chrome';
        this.ssDirPath = '/';
        this.exitFunction = async () => { await this.shutDown(); };

        process.on('exit', this.exitFunction);
    }

    setUrl(url) {
        this.url = url;
        let urlParts = getUrlParts(url);
        this.urlId = urlParts.id;
        this.urlHost = urlParts.host;
        this.urlPath = urlParts.pathname;
    }

    setDirPath(dirPath) {
        this.ssDirPath = path.resolve(dirPath);
    }

    setShopifyUrl(url) {
        this.shopifyUrl = url;
    }

    async setUpPageData(returnFormat = 'list') {
        if (config.debug.onlyFindOverlap) {
            let metadata = JSON.parse(FS.readFileSync(`${this.ssResolutionPath}/page_metadata.json`));
            this.HTMLData = metadata.HTMLData;
            this.layers = metadata.layers.map((l, i) => new Layer(i, this));
            for (let [i, l] of this.layers.entries()) await l.setPreprocessedData(metadata.layers[i]);
        } else {
            // TODO refactor HTMLData and leave only eyeId and specialChildElementsToCheck
            this.HTMLData = await this.driver.executeScript(
                loadFileAndImportVariables(
                    browserScriptsPath + '/markLayersOnPage.js',
                    {
                        config,
                        returnFormat,
                        onlySetEyeIds: false
                    }
                )
            );
            await delay(500); // TODO implement smarter delay that knows when the elements are updated
            if (returnFormat === 'list') this.layers = Array.from(Array(this.HTMLData.length)).map((l, i) => new Layer(i, this));
        }
    }

    async createFinalImageWithErrors(saveDataLocally) {
        const imageData = new Canvas.ImageData(
            Uint8ClampedArray.from(this.originalImage.bitmap.data),
            this.originalImage.bitmap.width,
            this.originalImage.bitmap.height
        );
        let canvas = await (new Canvas.createCanvas(this.width, this.height));
        var ctx = canvas.getContext("2d");
        ctx.putImageData(imageData, 0, 0);
        ctx.strokeStyle = "red";
        ctx.beginPath();
        for (let layer of this.layers) {
            for (let overlap of layer.overlaps) {
                let {left, top, bottom, right} = overlap.bounds;
                ctx.rect(left, top, right - left, bottom - top);
                ctx.stroke();

                if (config.debug) {
                    ctx.fillStyle = 'red';
                    ctx.font = 'bold 10pt Menlo';
                    ctx.fillText(`Layer: ${layer.layerNum}\nOverlap Eye Id: ${overlap.eyeId}`, left, top - 20);
                }
            }
        }

        if (saveDataLocally)
            FS.writeFileSync(this.ssResolutionPath + '/errors.png', canvas.toBuffer('image/png'));

        if (config.debug.fullLog) console.log('Saved the composite image to', this.ssResolutionPath + '/errors.png');
        return canvas.toBuffer('image/png');
    }

    async preparePageForOverlapFinding() {
        createDirIfDoesntExist(this.ssResolutionPath + '/elements');

        await delay(2000);
        await this.driver.executeScript(loadFileAndImportVariables(browserScriptsPath + '/removePopups.js'));
        // TODO stop any JS execution after the page initially loads and popups are removed
        await delay(1000);

        this.originalImage = await this.driver.sendAndGetDevToolsCommand('Page.captureScreenshot', {'format': 'png', 'fromSurface': true});
        if (config.debug.fullLog) FS.writeFileSync(`${this.ssResolutionPath}/original.png`, this.originalImage.data, 'base64');
        this.originalImage = await Jimp.read(Buffer.from(this.originalImage.data, 'base64'));
        await this.driver.sendAndGetDevToolsCommand('Emulation.setDefaultBackgroundColorOverride', {'color':{'r':0,'g':0,'b':0,'a':0}});

        await delay(2000);
    }

    async getBreakpoints() {
        return (await this.driver.executeScript(loadFileAndImportVariables(browserScriptsPath + '/getBreakpoints.js')))
            .map(bp => parseInt(bp));
    }

    // !! actual finding of breaking elements is happening in the post processing function !!
    async findBreakingElements() {
        try {
            await this.setUpPageData(config.breakingElements.returnFormat);
            if (this.breakpoints.length === 0) this.breakpoints = await this.getBreakpoints();
        } catch (e) {
            console.log(`Error while getting html json in selenium:`, e);
        } finally {
            return this.HTMLData;
        }
    }

    async getPageLinks() {
        return await this.driver.executeScript(loadFileAndImportVariables(browserScriptsPath + '/getLinksToOtherPages.js', {}, true, ['psl.min.js']));
    }

    async findBreakingElementsPostprocessing(htmlJson) {
        let breakingElements = new Breaking(this);
        return await breakingElements.startProcessing(htmlJson);
    }

    async findOverlappingElements() {
        await this.preparePageForOverlapFinding();
        this.overlapImageAllLayers = await createBlankBitmap(this.width, this.height);

        await this.setUpPageData();

        let maxLayer = config.debug.processSpecificLayers ? config.debug.processSpecificLayers.max : this.HTMLData.length - 1,
            minLayer =  config.debug.processSpecificLayers ? config.debug.processSpecificLayers.min : 0;

        for (let layerNum = maxLayer; layerNum >= minLayer; layerNum--) {
            var layerStartTime = Date.now();
            let layer = this.layers[layerNum];
            if (config.debug.fullLog) console.log(`...layer ${layerNum}...`);
            if (layer.elementsWithPotentialOverlap.length === 0) {
                if (config.debug.fullLog) console.log('No elements with potential overlap...skipping layer...');
                continue;
            }

            if (!config.debug.onlyFindOverlap)
                await layer.process();

            await layer.findOverlaps();

            if (config.debug.fullLog) console.log('Layer processed in (s):', (Date.now() - layerStartTime)/1000);
        }

        if (config.showExactOverlapsOnFinalImage)
            await this.originalImage.composite(await new Jimp(this.overlapImageAllLayers), 0, 0);

        let finalImageData = await this.createFinalImageWithErrors(false);

        let metadata = {
            'HTMLData': this.HTMLData,
            'layers': this.layers.map(l => l.getMetadata())
        };

        return { 'metadata.json': JSON.stringify(metadata), 'errors.png': finalImageData };
    }

    async functionalTesting() {
        await this.driver.manage().window().setRect({width: 1920, height: 1280, x: 0, y: 0}); //todo change hardcoded WxH
        console.log(await this.driver.manage().window().getRect())
        let FT = new FunctionalTesting(this);
        return await FT.startProcessing();
    }

    async shopifyTesting() {
        let shopify = new Shopify(this);
        return await shopify.startProcessing();
    }

    async waitForFileDownload(filePath) {
        return new Promise(async (resolve, reject) => {
            let pageDownloaded = false;

            while (!pageDownloaded) {
                pageDownloaded = FS.existsSync(filePath);
                await delay(500);
            }

            resolve();
        })
    }

    async download() {
        let result;
        await delay(3000);
        await this.driver.executeScript(loadFileAndImportVariables(browserScriptsPath + '/removePopups.js'));
        await this.driver.executeScript(
            loadFileAndImportVariables(
                browserScriptsPath + '/markLayersOnPage.js',
                {config, returnFormat:'list', onlySetEyeIds:true, dontSetPageStyles: true}
            )
        );
        await delay(1000);

        return await new Promise(async (resolve, reject) => {

            let downloadFileName = `${this.width}_${this.browser}`;
            let localDownloadPath = `${this.ssDirPath}/${downloadFileName}.html`;

            if (FS.existsSync(localDownloadPath)) FS.unlinkSync(localDownloadPath);

            if (config.debug.fullLog) console.log('Runnning browser script for downloading page locally');
            try {
                let res = await this.driver.executeAsyncScript(
                    loadFileAndImportVariables(config.downloadPageChromeScriptPath, {downloadFileName})
                );

                // TODO uncomment this for getting browser logs from selenium
                // this.driver.manage().logs().get(logging.Type.BROWSER).then(function(entries) {
                //     entries.forEach(function (entry) {
                //         console.log('--CHROME LOGS--', entry.message);
                //     })
                // });

                await this.waitForFileDownload(localDownloadPath);

                result = {local: localDownloadPath}

                if (res.done && !config.debug.saveDataOnlyLocally) {
                    console.log(`Downloading ${this.url} with ${this.browser} locally is done!`);
                    let localFile = FS.readFileSync(localDownloadPath).toString();
                    localFile = this.appendResponsiveyeStylesAndScripts(localFile);

                    let s3Location = await saveData(
                        localFile,
                        {
                            bucketName: config.s3Buckets.downloadedPages,
                            filePath: `downloaded_pages/${this.urlId}`,
                            name: downloadFileName + '.html',
                            metadata: { ContentType: 'text/html' }
                        },
                        's3'
                    );
                    result['s3'] = s3Location;
                } else if (!res.done) {
                    throw new Error(res);
                }
            } catch (e) {
                console.log(`Downloading ${this.url} locally failed because of`, e);
            }

            resolve(result);
        })
    }

    appendResponsiveyeStylesAndScripts(file) {
        let pageMessageHandlersScript = FS.readFileSync(browserScriptsPath + '/pageMessageHandlers.js').toString();

        pageMessageHandlersScript = `<script type="application/javascript">${pageMessageHandlersScript}</script>`;

        let headTag = file.substring(file.indexOf('<head'), file.indexOf('>', file.indexOf('<head')) + 1);
        file = file.replace(/<head(.*?)>/, `${headTag}${pageMessageHandlersScript}`);

        // fix for images that have incorrect src set
        file = file.replaceAll(/<img(.*?)>/g, function(match, imgAttrs) {
            let currentSrc, src;
            for (let match of imgAttrs.matchAll(/-src="(.*?)"/g)) { src = match[1]; break; }
            for (let match of imgAttrs.matchAll(/-currentsrc="(.*?)"/g)) { currentSrc = match[1]; break; }
            let newAttrs = imgAttrs.replaceAll(/src=""/g, `src="${currentSrc && currentSrc.length > 0 ? currentSrc : src}"`);
            return `<img${newAttrs}>`;
        });

        // fix for background images that have incorrect url set
        file = file.replaceAll(/background-image:(.{0,30}?)page-url=(.*?)\*\/ url\(\)/g, function(match, ...attrs) {
            return `background-image: url('${attrs[1]}')`;
        });

        return file;
    }

    async shutDown() {
        if (this.driver) {
            try {
                console.log('Shutting down webdriver... ', this.urlHost);
                await this.driver.quit();
                delete this.driver;
                process.removeListener('exit', this.exitFunction);
            } catch (e) {
                console.log('Cannot shut down driver because of:', e.message);
            }
        }
    }

    async textScrollSizeGtClientSize() {
        let results = await this.driver.executeScript(loadFileAndImportVariables(browserScriptsPath + '/textScrollSizeGtClientSize.js', {page: this.url, screenSize: `${this.width}x${this.height}`}));
        if (results.length === 0) return;
        let csv = results.map(r => r.join(',')).join('\n') + '\n';
        FS.appendFileSync(this.ssDirPath + '/text_going_outside_the_box.csv', csv);
    }

    async resizePage() {
        let newPageHeight = 0,
            numberOfResizes = 0;
        const maxNumberOfResizes = 10
            , pageHeightScript = 'return document.body.scrollHeight + parseFloat(getComputedStyle(document.body).marginTop)  + parseFloat(getComputedStyle(document.body).marginTop)'
            , maxHeight = 10000; //todo find better solution for calculating page height so it cant go infinite

        await this.driver.manage().window().setRect({width: this.width, height: Math.min(this.height, maxHeight), x: 0, y: 0});

        while (this.height !== newPageHeight && numberOfResizes <= maxNumberOfResizes) {
            try {
                this.height = Math.min(await this.driver.executeScript(pageHeightScript), maxHeight);
                await this.driver.manage().window().setRect({width: this.width, height: this.height, x: 0, y: 0});
                newPageHeight = Math.min(await this.driver.executeScript(pageHeightScript), maxHeight);
            } catch (e) {
                console.log('Error while resizing page:', e.message);
            }
            numberOfResizes++;
        }
    }

    async openPageInSelenium(pageProcessingFunction) {
        console.log(`Opening ${this.url} in Selenium ${this.browser} ${this.width}x${this.height}`);

        let chromeOptions = new Chrome.Options()
            .windowSize({width: this.width, height: this.height || 1})
            .addArguments([
                '--force-device-scale-factor=1',
                '--hide-scrollbars',
                '--no-sandbox',
                '--disable-dev-shm-usage',
                '--verbose',
                '--log-path=chromedriver.log'
            ].concat(config.seleniumBrowserAgent ? [`--user-agent="${config.seleniumBrowserAgent}"`] : []))
            .setUserPreferences({
                "profile.default_content_setting_values.automatic_downloads" : 1,
                'download.default_directory': this.ssDirPath
            })
            .headless();

        let firefoxOptions = new Firefox.Options()
            .windowSize({width: this.width, height: this.height || 1})
            .addArguments([
                '--force-device-scale-factor=1',
                '--hide-scrollbars',
                '--no-sandbox',
                '--disable-dev-shm-usage',
                '--verbose',
                '--log-path=firefoxdriver.log'
            ].concat(config.seleniumBrowserAgent ? [`--user-agent="${config.seleniumBrowserAgent}"`] : []))
            .setPreference("browser.download.folderList", 2)
            .setPreference("browser.download.manager.showWhenStarting", false)
            .setPreference("browser.download.dir", this.ssDirPath)
            .setPreference("browser.helperApps.neverAsk.saveToDisk", "application/x-gzip")
            .headless();

        // TODO uncomment this to get logs from chrome itself
        // var logging_prefs = new logging.Preferences();
        // logging_prefs.setLevel(logging.Type.PERFORMANCE, logging.Level.ALL);
        // chromeOptions.setLoggingPrefs(logging_prefs);

        this.driver = await new Builder()
            .forBrowser(this.browser)
            .setFirefoxOptions(firefoxOptions)
            .setChromeOptions(chromeOptions)
            // TODO uncomment this to get logs from chrome itself
            // .setLoggingPrefs(logging_prefs)
            .setCapability('goog:loggingPrefs', { 'browser':'ALL' })
            .build();

        await this.driver.get(this.s3Location || this.url);

        // TODO uncomment this to get logs from chrome itself
        // this.driver.manage().logs().get('performance').then(function(text) {
        //     console.log('--CHROME LOGS--', text);
        // });

        await this.resizePage();

        await this.driver.wait(() => {
            return this.driver.executeScript('return document.readyState').then(function(readyState) {
                return readyState === 'complete';
            });
        });
    }

    async startProcessingSingleRes(usesResolutionFolder, pageProcessingFunction, preprocessingFunction, postProcessingFunction) {
        let pageStartTime = Date.now();

        this.viewports = [];

        createDirIfDoesntExist(this.ssDirPath);

        this.viewports.push({width: this.width, height: this.height});
        let resolutionStartTime = Date.now();

        if (usesResolutionFolder)
            this.ssResolutionPath = `${this.ssDirPath}/${this.width}x${this.height}`;

        !this.driver ? await this.openPageInSelenium(pageProcessingFunction)
            : await this.resizePage();

        if (preprocessingFunction) await this[preprocessingFunction]();

        let pageProcessingResult = await this[pageProcessingFunction]();

        console.log(`Finished singleRes ${this.url} (${this.width}x${this.height} ${this.browser}) ${pageProcessingFunction} processing in (s):`, (Date.now() - resolutionStartTime) / 1000);

        if (postProcessingFunction) {
            let postProcessingResult = await this[postProcessingFunction](pageProcessingResult);
            console.log(`Page ${pageProcessingFunction} processed with postprocessing after (s):`, (Date.now() - pageStartTime) / 1000);
            return postProcessingResult;
        } else {
            return pageProcessingResult;
        }
    }

    // TODO merge with parallel processing
    async startProcessingMultiRes(usesResolutionFolder, pageProcessingFunction, postProcessingFunction) {
        let pageStartTime = Date.now()
            , viewports = [
            this.startRes || config.lowest_processing_resolution,
            this.endRes || config.highest_processing_resolution
        ]
            , vpWidth = viewports[0] + this.resolutionStep[0]
            , vpHeight = 1
            , pageProcessingResult = []
            , postProcessingResult;

        // if the last resolution is the final one, process it as well
        if (viewports[1] === config.highest_processing_resolution) viewports[1] += this.resolutionStep[0];
        this.viewports = [];

        createDirIfDoesntExist(this.ssDirPath);
        while (vpWidth < viewports[1] - this.resolutionStep[0]) {
            this.viewports.push({width: vpWidth, height: vpHeight});
            let resolutionStartTime = Date.now();

            this.width = vpWidth;
            this.height = vpHeight;
            if (usesResolutionFolder)
                this.ssResolutionPath = `${this.ssDirPath}/${vpWidth}x${vpHeight}`;

            !this.driver ? await this.openPageInSelenium()
                : await this.resizePage();
            pageProcessingResult.push(await this[pageProcessingFunction]());

            console.log(`Finished multiRes ${this.url} (${vpWidth}x${vpHeight} ${this.browser}) ${pageProcessingFunction} processing in (s):`, (Date.now() - resolutionStartTime) / 1000);

            vpWidth += this.resolutionStep[0];
            vpHeight += this.resolutionStep[1];
        }

        if (postProcessingFunction) {
            postProcessingResult = await this[postProcessingFunction](pageProcessingResult);
            console.log(`${this.url} processed ${pageProcessingFunction} in ${this.browser} COMPLETELY after (s):`, (Date.now() - pageStartTime)/1000);
            return postProcessingResult;
        }
    }

}

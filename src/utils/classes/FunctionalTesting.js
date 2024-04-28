import {
    delay,
    loadFileAndImportVariables,
    recursiveDatasetFlattening,
    takeScreenshot,
    createDirIfDoesntExist,
    saveData,
    getUrlParts,
    trim,
    sendProgressUpdate
} from "../common.js";
import {By} from "selenium-webdriver";
import _ from "lodash";
import config from "../config.js";
import Auth from "./Auth.js";
import { v4 as uuidv4 } from 'uuid';
import util from "util";
import {exec} from "child_process";
import FS from "fs";
import Path from "path";
import Jimp from "jimp";

const browserScriptsPath = './src/utils/browser_scripts'

export default class FunctionalTesting {
    constructor(page) {
        this.url = page.url;
        this.urlId = page.urlId;
        this.urlHost = page.urlHost;
        this.urlPath = page.urlPath;
        this.driver = page.driver;
        this.ssDirPath = page.ssDirPath;
        this.browser = page.browser;
        this.progress = {
            totalButtons: 0,
            processedButtons: 0,
            flowsTested: 0,
            errorTriggeringButtons: 0,
            status: 'This page is being processed...'
        };
    }

    isButton(el) {
        return ( ['a', 'button'].includes(el.htmlData.tag)
                || el.htmlData.attributes.role === 'button'
                || el.htmlData.attributes.type === 'button' )
            // todo find better way to ignore buttons that start video, must be some kind of button but not one that plays video (until we find way to stop videos and continue processing page)
            && el.htmlData.attributes.role !== 'video'
            && el.htmlData.attributes.type !== 'video'
            && (!el.htmlData.attributes.class || !/video/i.test(el.htmlData.attributes.class))
    }

    checkAttributes(el1, el2) {
        let changedAttributes = [];
        for (let att in el1.htmlData.attributes) {
            // sometimes elements can have same class multiple times and this is just taking unique classes
            let from = (att === 'class' && el1.htmlData.attributes[att]) ? [...new Set(el1.htmlData.attributes[att].split(' '))].join(' ') : el1.htmlData.attributes[att] || "";
            let to = (att === 'class' && el2.htmlData.attributes[att]) ? [...new Set(el2.htmlData.attributes[att].split(' '))].join(' ') : el2.htmlData.attributes[att] || "";
            if (from.trim().replace('  ', ' ') !== to.trim().replace('  ', ' ')) {
                changedAttributes.push({attribute: att, from, to, el: el1});
            }
        }

        if (el1.htmlData.innerText !== el2.htmlData.innerText) changedAttributes.push({ attribute: 'inner_text', from: el1.htmlData.innerText, to: el2.htmlData.innerText, el: el1});

        return (changedAttributes.length > 0) ? { type: 'attribute_change', change: changedAttributes} : undefined;
    }

    async findHtmlChanges(preClickJson, postClickJson, isHover) {

        // check if new page was opened in the same window
        let url = getUrlParts(await this.driver.getCurrentUrl());
        let urlChanged;
        if (this.urlHost !== url.host || this.urlPath !== url.pathname) urlChanged = true;

        let preClickBodyEyeId = _.keys(preClickJson).find(preClickEyeId => preClickJson[preClickEyeId].htmlData.tag === 'body')
        let postClickBodyEyeId = _.keys(postClickJson).find(eyeId => postClickJson[eyeId].htmlData.tag === 'body');
        if (preClickBodyEyeId !== postClickBodyEyeId && !isHover) {
            if (urlChanged) await this.driver.navigate().back();
            return [{type: 'page_open'}];
        }
        // END of check if new page was opened in the same window

        let postClickChanges = [];
        for (let eyeId in preClickJson) {
            let el1 = preClickJson[eyeId];
            let el2 = postClickJson[eyeId];
            if (!el2) {
                postClickChanges.push({type: 'missing_button', el: el1});
                continue;
            }

            let changedAttributes = this.checkAttributes(el1, el2);

            if (changedAttributes) postClickChanges.push(changedAttributes);
        }

        for (let eyeId in postClickJson) {
            let el1 = preClickJson[eyeId];
            let el2 = postClickJson[eyeId];
            if (!el1) {
                if (this.isButton(el2)) postClickChanges.push({type: 'new_button', button: el2});
                continue;
            }

            let changedAttributes = this.checkAttributes(el2, el1);

            if (changedAttributes) postClickChanges.push(changedAttributes);
        }

        if (urlChanged && postClickChanges.length > 0 && !isHover) {
            await this.driver.navigate().back();
            return [{type: 'page_open'}]
        }

        return postClickChanges
    }

    async scrollToElement(eyeId) {
        await this.driver.executeScript(`
            let el = document.querySelector('[eye-id="${eyeId}"]');
            if (el) el.scrollIntoView({block: "center"});
        `);
        await delay(300); // todo see if we need this or if there is another way to know when scroll + animations (like fade-in) are done
    }

    async scrollToTop() {
        await this.driver.executeScript(`
            window.scroll(0,0);
            document.body.scroll(0,0);
        `);
    }

    async getScrollPosition() {
        return await this.driver.executeScript('return window.pageYOffset + document.body.scrollTop;');
    }

    hasLink(el) {
        return !!(el.htmlData && el.htmlData.attributes && el.htmlData.attributes.href)
    }

    async linkToCurrentUrl(el) {
        let curr = await this.driver.getCurrentUrl();
        return this.hasLink(el) &&
            (el.htmlData.attributes.href.includes('http') ?
                (trim(getUrlParts(el.htmlData.attributes.href).host, '/') + '/' + trim(getUrlParts(el.htmlData.attributes.href).pathname, '/')) === trim(curr, '/') :
                trim(el.htmlData.attributes.href, '/') === trim(getUrlParts(curr).pathname, '/'))
    }

    async checkIfFileDownloaded(el) {
        let href = el.htmlData.attributes.href.split('/')
            , fileName = el.htmlData.attributes.download || href[href.length - 1]
            , filePath = `${this.ssDirPath}/${fileName}`;

        if (!fileName.includes('.') || !FS.existsSync(filePath)) return [];

        FS.unlinkSync(filePath);
        return [{type: 'file_downloaded', button: el}]
    }

    async testButtonFunctionality(eyeId, currentWindowHandle) {
        // todo if you want to force recording or send errorMessage to frontend of flow you can do it like this: return [{ type: 'record_flow', errorMessage: '<a> tag with no href.' }]
        let preClickJson
            , preClickScrollPosition;
        try {
            await this.scrollToElement(eyeId);
            await delay(200);

            preClickJson = await this.getFlatPageData();
            preClickScrollPosition = await this.getScrollPosition();

            // button click
            let button = await this.driver.findElement(By.css(`[eye-id="${eyeId}"]`));

            // hardcoded conditions for removing false positives
            let tag = await button.getTagName();
            let href = await button.getAttribute('href');
            if (
                (tag === 'a' && href && href.indexOf('mailto:') === 0) ||
                (tag === 'a' && href && href.indexOf('tel:') === 0)
            ) return [{ type: 'ignore', message: 'element_to_be_ignored' }];
            // END of hardcoded conditions for removing false positives

            let click = await this.clickElement(button);
            if (click && click.type === 'error') return [click];
        } catch (e) {
            if (e.name === 'ElementClickInterceptedError') return [{ type: 'error', message: 'element_not_reachable' }];
            return [{ type: 'error', message: 'element_not_visible' }];
        }
        // END of button click

        // check if new page was opened in a new window
        let windows = await this.driver.getAllWindowHandles();
        if (windows.length > 1) {
            await this.driver.switchTo().window(windows.find(w => w !== currentWindowHandle));
            await this.driver.close();
            await this.driver.switchTo().window(currentWindowHandle);
            return [{type: 'page_open'}];
        }
        // END of check if new page was opened in a new window

        let postClickScrollPosition = await this.getScrollPosition();
        let res = (preClickScrollPosition !== postClickScrollPosition) ? [{type: 'page_scrolled', from: preClickScrollPosition, to: postClickScrollPosition}] : [];

        let postClickJson = await this.getFlatPageData();

        return res.concat(await this.findHtmlChanges(preClickJson, postClickJson));
    }

    async getFlatPageData(skipInvisibleElements = false) {
        let data = await this.driver.executeScript(
            loadFileAndImportVariables(
                browserScriptsPath + '/markLayersOnPage.js',
                {
                    config,
                    returnFormat: 'json',
                    onlySetEyeIds: false,
                    dontSetPageStyles: true,
                    dontSetLayers: true,
                    getAllElements: true
                }
            )
        );

        return recursiveDatasetFlattening(data, skipInvisibleElements);
    }

    async setElementEyeId(element) {
        try {
            await this.driver.executeScript(`document.querySelector('${element.htmlData.path}').setAttribute('eye-id', '${element.eyeId}')`);
        } catch (e) {
            console.log('Error while setting buttons eyeId inside setElementEyeId()');
        }
    }

    async setupPageEnvironment(pageSetupFlow, buttonToClickAfterSetup, recordPageSetupFlowId) {
        if (recordPageSetupFlowId) await takeScreenshot(this.driver, `./resources/button-click-flow-screenshots/${recordPageSetupFlowId}/${0}.png`);
        for (let [i, setupButton] of pageSetupFlow.entries()) {
            try {
                let setupButtonEyeId = setupButton.button.eyeId;
                await this.setElementEyeId(setupButton.button);

                let button = await this.driver.findElement(By.css(`[eye-id="${setupButtonEyeId}"]`));
                await this.scrollToElement(setupButtonEyeId)
                if (recordPageSetupFlowId) {
                    await this.driver.executeScript(`
                        let el = document.querySelector('[eye-id="${setupButtonEyeId}"]');
                        el.style.backgroundColor = 'rgba(86, 160, 151, 0.2)';
                        el.style.outline = '1px solid rgba(86, 160, 151, 0.8)';
                    `);
                    await this.scrollToElement(setupButtonEyeId)

                    await takeScreenshot(this.driver, `./resources/button-click-flow-screenshots/${recordPageSetupFlowId}/${i + 1}.png`)
                }

                let action = await this[`${setupButton.action}Element`](button);
                if (action && action.type === 'error') {
                    console.log('!!! THIS SHOULDN\'T BE HAPPENING !!!');
                }
            } catch (e) {
                if (e.name === 'ElementClickInterceptedError') console.log('Setup button is not reachable!');
                else console.log('Setup button is not visible! ', setupButton.action);
            }
        }
        if (recordPageSetupFlowId) await takeScreenshot(this.driver, `./resources/button-click-flow-screenshots/${recordPageSetupFlowId}/${pageSetupFlow.length + 1}.png`);

        if (buttonToClickAfterSetup) await this.setElementEyeId(buttonToClickAfterSetup);
    }

    async recordFlowVideo(flow, lastEl) {
        console.log('Recording flow video for ', this.url)
        let recodingId = uuidv4();
        let res;
        let fullDirPath = Path.resolve(`./resources/button-click-flow-screenshots/${recodingId}`);
        createDirIfDoesntExist(fullDirPath);
        await this.reloadPage();
        await this.setupPageEnvironment(flow, lastEl, recodingId);
        const execPromise = util.promisify(exec);
        await execPromise(`ffmpeg -framerate 0.5 -i ${fullDirPath}/%d.png -c:v libx264 -r 30 -pix_fmt yuv420p -vf "pad=ceil(iw/2)*2:ceil(ih/2)*2" ${fullDirPath}/recording.mp4`, {maxBuffer: 5 * 1024 * 1024});
        const length = FS.readdirSync(fullDirPath).length;
        // save to s3 only flows that are fully recorded
        // todo check why sometimes flows cant be recorded fully, eg. cant setup setElementEyeId(), then cant click on button
        if (length >= flow.length + 2) res = await saveData(
            FS.readFileSync(`${fullDirPath}/recording.mp4`),
            {
                bucketName: config.s3Buckets.functionalTesting,
                filePath: `${this.urlId}`,
                name: recodingId + '.mp4',
                metadata: { ContentType: 'video/mp4' }
            },
            's3'
        );
        FS.rmSync(fullDirPath, { recursive: true, force: true });
        if (config.debug.fullLog) console.log('Saved recording of an error flow to:', res);
        return res
    }

    async clickElement(el) {
        if (await el.isDisplayed()) {
            await el.click();
            await delay(1000);
            this.sendScreenshotUpdate();
        } else {
            // element is sometimes invisible to user until you hover over that area but is in DOM so we "see" it
            // try hover and then click, otherwise throw error
            if (!config.debug.skipHoveringElements) await this.hoverElement(el);
            if (await el.isDisplayed()) {
                await el.click();
                await delay(1000);
                this.sendScreenshotUpdate();
            } else {
                if (config.debug.fullLog) console.log(`Element not visible and cant be clicked!`)
                return { type: 'error', message: 'element_not_found' }
            }
        }
    }

    async hoverElement(el) {
        try {
            let actions = this.driver.actions({async: true});
            // .move() -> todo check if that is only/best way to perform hover on element. Seems like sometimes we can go outside of screen
            await actions.move({origin: el}).perform();
            await delay(300); // todo find better way to know when hover rendering is done
            this.sendScreenshotUpdate();
        } catch (e) {
            console.log('Error while hovering element ');
        }
    }

    async hoverAllElements(hoveredElements, clickedElements) {
        let elementAddingButtons = [];
        let hoverStartTime = Date.now();

        let pageData = await this.getFlatPageData(true);

        let hoverCounter = 0;
        for (let elId in pageData) {
            try {
                if (hoveredElements.includes(pageData[elId].htmlData.path) || (pageData[elId].children && pageData[elId].children.length !== 0)) continue;
                hoverCounter++;
                this.progress.status = `Hovering elements on page... (${hoverCounter})`
                await this.scrollToElement(elId);
                let elToHover = await this.driver.findElement(By.css(`[eye-id="${elId}"]`));
                if (!elToHover) continue;
                let preHoverJson = await this.getFlatPageData();
                await this.hoverElement(elToHover);
                hoveredElements.push(pageData[elId].htmlData.path);

                let postHoverJson = await this.getFlatPageData();

                let newButtons = (await this.findHtmlChanges(preHoverJson, postHoverJson, true)).filter((c) => c.type === 'new_button');

                if (newButtons.length > 0 && preHoverJson[elId]) { // todo when preHoverJson[elId] === undefined that means we moved mouse outside of screen, find proper fix
                    elementAddingButtons.push({
                        newButtons: newButtons.map(c => c.button).filter(c => !clickedElements.includes(c.htmlData.path)),
                        button: preHoverJson[elId],
                        action: 'hover',
                    });
                    if (config.debug.fullLog) {
                        console.log('Hovering element added new buttons!');
                        console.log(preHoverJson[elId].htmlData.path);
                    }
                }
            } catch (e) {
                console.log('Error hovering all elements ');
            }
        }

        if (config.debug.fullLog) console.log(`Hovered ${hoverCounter} elements in ${(Date.now() - hoverStartTime)/1000} seconds.`);

        if (elementAddingButtons.length > 0) {
            this.progress.totalButtons += elementAddingButtons.reduce((sum, item) => sum += item.newButtons.length, 0);
            sendProgressUpdate(this.prepareProgressData());
        }
        return {hoveredElements, elementAddingButtons}
    }

    async testButtons(pageSetupFlow, clickableElements, hoveredElements, clickedElements) {
        let errorTriggeringFlows = [];
        let unreachableButtons = [];
        let invisibleButtons = [];
        let elementRemovalButtons = [];
        let elementAddingButtons = [];

        for (let el of clickableElements) {
            await this.reloadPage();
            if (await this.linkToCurrentUrl(el)) continue;

            await this.setupPageEnvironment(pageSetupFlow, el);
            await this.scrollToElement(el.eyeId);

            let currentWindowHandle = await this.driver.getWindowHandle();

            let postClickChanges = await this.testButtonFunctionality(el.eyeId, currentWindowHandle);
            if (postClickChanges.length === 0 && this.hasLink(el)) postClickChanges = await this.checkIfFileDownloaded(el);

            let pageOpened = postClickChanges.find(c => c.type === 'page_open');
            let errorWhileClicking = postClickChanges.find(c => c.type === 'error');
            let pageScrolled = postClickChanges.find(c => c.type !== 'page_scrolled');
            if ( !config.debug.skipHoveringElements && !pageOpened && !errorWhileClicking && pageScrolled && postClickChanges.length ) {
                let hoverResult = await this.hoverAllElements(hoveredElements, clickableElements.concat(clickedElements));
                hoveredElements = hoverResult.hoveredElements;
                elementAddingButtons = hoverResult.elementAddingButtons;
                this.progress.status = 'Testing functionality of all buttons and links on page...'
            }

            let forceFlowRecording = postClickChanges.find(c => c.type === 'record_flow');
            if (postClickChanges.length === 0 || forceFlowRecording) {
                if (config.debug.fullLog) console.log('!! POSSIBLE ERROR DETECTED ', el.htmlData.path);
                this.progress.processedButtons++;
                this.progress.errorTriggeringButtons++;
                clickedElements.push(el.htmlData.path);
                let s3Path = await this.recordFlowVideo(pageSetupFlow.concat([{button: el, action: 'click'}]), el);
                errorTriggeringFlows.push({
                    s3Path,
                    errorMessage: (forceFlowRecording && forceFlowRecording.errorMessage) ? forceFlowRecording.errorMessage : 'Button not working.',
                    flow: pageSetupFlow.concat([{button: el, action: 'click'}])
                });
            } else if (postClickChanges.find(c => c.type === 'error' && c.message === 'element_not_reachable')) {
                unreachableButtons.push(el);
            } else if (postClickChanges.find(c => c.type === 'error' && c.message === 'element_not_visible')) {
                invisibleButtons.push(el);
            } else if (postClickChanges.find(c => c.type === 'error' && c.message === 'element_not_found')) {
                this.progress.processedButtons++;
                console.error('Button not found:', el.htmlData.path);
            } else {
                this.progress.processedButtons++;
                clickedElements.push(el.htmlData.path);
                let newButtons = postClickChanges.filter(c => c.type === 'new_button');
                if (newButtons.length > 0) {
                    elementAddingButtons.push({
                        newButtons: newButtons.map(c => c.button)
                            .filter((b) => !clickedElements.includes(b.htmlData.path)),
                        button: el,
                        action: 'click',
                    });
                }

                let removedButtons = postClickChanges.filter(c => c.type === 'missing_button');
                if (removedButtons.length > 0) {
                    elementRemovalButtons.push({
                        button: el,
                        action: 'click',
                    });
                }
            }

            this.progress.flowsTested++;
            sendProgressUpdate(this.prepareProgressData());
        }

        let buttonsToReprocess = unreachableButtons.concat(invisibleButtons);

        // this is made to click the buttons that are not reachable
        for (let removingEl of elementRemovalButtons) {
            if (buttonsToReprocess.length === 0 || pageSetupFlow.some((el) => el.button.htmlData.path === removingEl.button.htmlData.path)) continue;
            if (config.debug.fullLog) console.log('Going into deeper processing by REMOVING buttons...');
            let deeperLayerData = await this.testButtons(pageSetupFlow.concat([removingEl]), buttonsToReprocess, hoveredElements, clickedElements);
            buttonsToReprocess = deeperLayerData.buttonsToReprocess;
            errorTriggeringFlows = errorTriggeringFlows.concat(deeperLayerData.errorTriggeringFlows);
        }

        // this is made to click the buttons that are not visible
        for (let addingEl of elementAddingButtons) {
            this.progress.totalButtons += addingEl.newButtons.length;
            if (pageSetupFlow.some((el) => el.button.htmlData.path === addingEl.button.htmlData.path)) continue;
            if (config.debug.fullLog) console.log('Going into deeper processing by ADDING buttons...');
            let deeperLayerData = await this.testButtons(pageSetupFlow.concat([addingEl]), addingEl.newButtons, hoveredElements, clickedElements);
            buttonsToReprocess = buttonsToReprocess.concat(deeperLayerData.buttonsToReprocess);
            errorTriggeringFlows = errorTriggeringFlows.concat(deeperLayerData.errorTriggeringFlows);
        }

        return { buttonsToReprocess, errorTriggeringFlows };
    }

    async reloadPage() {
        let cookies = await this.driver.manage().getCookies();
        for (let cookie of cookies) {
            let cookieName = cookie.name.toLowerCase();
            if (!cookieName.match(/(user|token)/)) {
                await this.driver.manage().deleteCookie(cookieName);
            }
        }
        await this.driver.executeScript('return window.localStorage.clear();');
        await this.driver.executeScript('return window.sessionStorage.clear();');
        await this.driver.get(this.url);
        await this.scrollToTop();
        this.sendScreenshotUpdate();
        await delay(1000);
    }

    sendScreenshotUpdate() {
        let self = this;
        this.driver.takeScreenshot().then(function(image) {
            const buffer = Buffer.from(image, "base64");
            Jimp.read(buffer, async function(err, res) {
                res.resize(640, Jimp.AUTO);

                image = await res.getBase64Async(Jimp.AUTO);

                sendProgressUpdate({
                    urlId: self.urlId,
                    type: 'screenshotUpdate',
                    browser: self.browser,
                    url: self.url,
                    progress: self.progress,
                    image: image
                })

            });
        });
    }

    prepareProgressData() {
        return {
            urlId: this.urlId,
            type: 'testingButtons',
            browser: this.browser,
            progress: this.progress,
            url: this.url
        }
    }

    async startProcessing() {
        let auth = new Auth(this);
        await auth.login();
        this.sendScreenshotUpdate();

        // TODO check this delay and make the page wait for automatic elements - capture them and disregard while analyzing button changes
        await delay(5000);
        if (config.debug.onlyRecordFlow) return await this.recordFlowVideo(config.debug.flow, config.debug.flow.at(-1).button);

        let elementsOnPageOpen = await this.getFlatPageData();
        let clickableElements = _.omit(elementsOnPageOpen, _.keys(elementsOnPageOpen).filter(k => !this.isButton(elementsOnPageOpen[k])))
        await delay(1000);
        this.progress.totalButtons = Object.keys(clickableElements).length;

        sendProgressUpdate(this.prepareProgressData());
        this.sendScreenshotUpdate();

        let hoverResult = config.debug.skipHoveringElements ?
            {elementAddingButtons: [], hoveredElements: []}
            : await this.hoverAllElements([], _.values(clickableElements).map(el => el.htmlData.path));

        this.progress.status = 'Testing functionality of all buttons and links on page...'
        let hoverData = { buttonsToReprocess: [], errorTriggeringFlows: []};
        for (let addingEl of hoverResult.elementAddingButtons) {
            console.log(`Starting with ${hoverResult.elementAddingButtons.length} new buttons on hover.`);
            hoverData = await this.testButtons([addingEl], addingEl.newButtons, hoverResult.hoveredElements, _.values(clickableElements).map(el => el.htmlData.path));
        }

        console.log(`Testing ${_.keys(clickableElements).length} buttons functionality...`);

        let data = await this.testButtons([], _.values(clickableElements), hoverResult.hoveredElements, []);

        for (let key in data) {
            data[key] = data[key].concat(hoverData[key]);
        }

        // TODO debug why we cant have this -> (should be number of all buttons) this.progress.processedButtons += data.buttonsToReprocess
        this.progress.processedButtons = this.progress.totalButtons;
        sendProgressUpdate(this.prepareProgressData());

        // TODO save to CSV
        console.log('Error triggering buttons:', _.keys(data.errorTriggeringFlows).length);

        return _.extend({}, data, { progress: this.progress });
    }
}

import {google} from 'googleapis';
import FS from "fs";
import Canvas from "canvas";
import AWS from "./aws.js";
import config from "./config.js";
import https from "https";
import http from "http";
import _ from "lodash";
import fetch from 'node-fetch';
import RedisQueue from "./queue.js";
import Jimp from "jimp";
import {Shopify} from "@shopify/shopify-api";
import ShopifyTestUserService from "../services/shopifytestuser.js";

function arraysEqual(a, b) {
    if (a === b) return true;
    if (a == null || b == null) return false;
    if (a.length !== b.length) return false;

    for (let i = 0; i < a.length; ++i) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}

export const getArgs = () => {
    const processArgs = process.argv.slice(2);
    const args = {};
    processArgs.forEach(arg => {
        arg = arg.split('=')
        args[arg[0]] = arg[1]
    });

    return args;
}

export const logToSheet = async (url, layer, fixNumber, note) => {
    let newRow = [url, layer, fixNumber, note]
    const auth = new google.auth.GoogleAuth({
        keyFile: './resources/config/responsiveye_creds.json',
        scopes: 'https://www.googleapis.com/auth/spreadsheets'
    })

    const client = await auth.getClient()
    const gsheets = google.sheets(({version: 'v4', auth: client}))
    const spreadsheetId = '1FoIUkehnuU6P9KvtSvoH_FuFkCcIzof1UvWxzJbOE6E'
    const sheetName = 'Sheet1'
    const alreadyProcessed = (await gsheets.spreadsheets.values.get({
        auth,
        spreadsheetId,
        range: [`${sheetName}!A:D`],
    })).data.values

    for (let i = 0; i < alreadyProcessed.length; i++) {
        if (arraysEqual(newRow, alreadyProcessed[i])) return
    }

    await gsheets.spreadsheets.values.append({
        auth,
        spreadsheetId,
        range: `${sheetName}!A:D`,
        valueInputOption: 'USER_ENTERED',
        resource: {
            values: [
                newRow
            ]
        }
    })
}

export const delay = (milisec) => {
    return new Promise(resolve => {
        setTimeout(() => { resolve('') }, milisec);
    })
}

export const loadFileAndImportVariables = (filePath, variables, addCommonFunctions, addVendorScripts) => {
    let fileString = FS.readFileSync(filePath).toString();
    for (let varName in variables) {
        fileString = fileString.replaceAll(`--\${${varName}}`, JSON.stringify(variables[varName]));
    }

    fileString = fileString.replace(/--\${(.*?)}/ig, 'undefined');
    if (addCommonFunctions) {
        let commonFunctions = FS.readFileSync('./src/utils/browser_scripts/common.js').toString();
        fileString = commonFunctions + fileString;
    }
    if (addVendorScripts && addVendorScripts.length) {
        for (let vendorScript of addVendorScripts) {
            let script = FS.readFileSync(`./src/utils/browser_scripts/vendor/${vendorScript}`).toString();
            fileString = script + fileString;
        }
    }
    return fileString;
}

export const formatMemoryUsage = (data) => `${Math.round(data / 1024 / 1024 * 100) / 100} MB`

export const logMemoryUsage = (idString) => {
    const memoryData = process.memoryUsage()

    const memoryUsage = {
        rss: `${formatMemoryUsage(memoryData.rss)} -> Resident Set Size - total memory allocated for the process execution`,
        heapTotal: `${formatMemoryUsage(memoryData.heapTotal)} -> total size of the allocated heap`,
        heapUsed: `${formatMemoryUsage(memoryData.heapUsed)} -> actual memory used during the execution`,
        external: `${formatMemoryUsage(memoryData.external)} -> V8 external memory`,
    }

    console.log(idString, memoryUsage);
}

export const createDirIfDoesntExist = (path) => {
    if (!FS.existsSync(path)) FS.mkdirSync(path, { recursive: true });
}

export const createBlankBitmap = async (width, height) => {
    let canvas = await (new Canvas.createCanvas(width, height));
    return canvas.getContext('2d').getImageData(0, 0, width, height);
}

export const overlapArea = (l0, r0, t0, b0, l1, r1, t1, b1)  => {
    return Math.max(0, Math.min(r0, r1) - Math.max(l0, l1)) * Math.max(0, Math.min(b0, b1) - Math.max(t0, t1));
}

export const saveData = async (data, mdata, dest='local') => {
    switch (dest) {
        case 'local': {
            let {ssDirPath, name} = mdata;
            let location = `${ssDirPath}/${name}`;
            FS.writeFileSync(location, data);
            return location;
        }
        case 's3': {
            let aws = new AWS();
            let {bucketName, filePath, name, metadata} = mdata;
            return await aws.uploadToS3(bucketName, `${filePath}/${name}`, data, metadata);
        }
    }
}

export const getUrlParts = (url) => {
    const DOT = '.',
        UDSCR = '_',
        SLASH = '/',
        CLN = ':';
    if (!url.includes('http')) url = `https://${url}`;
    let urlObj = new URL(url.replace('www.', ''));
    let pathname = urlObj.pathname;
    if (pathname[pathname.length - 1] === SLASH) pathname = pathname.substring(0, pathname.length - 1);
    return {
        host: urlObj.host,
        pathname: pathname,
        id: urlObj.host.replaceAll(DOT, UDSCR).replaceAll(CLN, UDSCR) + (pathname ? '-' + pathname.replaceAll(SLASH, UDSCR).replaceAll(DOT, UDSCR) : '')
    }
}

export const downloadFile = (url, dest) => {
    return new Promise(function (resolve, reject) {
        const file = FS.createWriteStream(dest);

        const request = (url.includes('https://') ? https : http).get(url, (response) => {
            if (response.statusCode !== 200) {
                return resolve('Response status was ' + response.statusCode);
            }

            response.pipe(file);
        });

        file.on('finish', () => file.close(resolve));

        request.on('error', (err) => {
            FS.unlink(dest, () => reject(err.message)); // delete the (partial) file and then return the error
        });

        file.on('error', (err) => { // Handle errors
            FS.unlink(dest, () => reject(err.message)); // delete the (partial) file and then return the error
        });
    })
}

export const addPageToVisualProcessing = async (queue, data, forceProcessingFunction, browser) => {
    let processBreakingElements = forceProcessingFunction ? forceProcessingFunction === 'findBreakingElements' : config.breakingElements.enabled;
    if (processBreakingElements) {
        await queue.add('findBreakingElements', _.extend({}, data, {
            resolutionsInParallel: false,
            resolutionsBulkSize: data.endRes - data.startRes,
            step: [config.breakingElements.step, 1],
            browser
        }));
    }

    let processOverlappingElements = forceProcessingFunction ? forceProcessingFunction === 'findOverlappingElements' : config.overlapProcessing.enabled;
    if (processOverlappingElements) {
        for (let i = data.startRes; i <= data.endRes; i += config.overlapProcessing.step) {
            await queue.add('findOverlappingElements', _.extend({}, data, {
                resolutionsInParallel: false,
                startRes: i,
                endRes: i + config.overlapProcessing.step - 1,
                step: [config.overlapProcessing.step, 1],
                browser
            }));
        }
    }
}

export const sendSlackNotification = async (body, url = 'https://hooks.slack.com/services/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') => {
    await fetch(url, {
        method: 'post',
        body: JSON.stringify(body),
        headers: {'Content-Type': 'application/json'}
    });
}

export const skipElement = function(el) {
    return config.breakingElements.skipTags.includes(el.htmlData.tag.toLowerCase());
}

export const invisibleElement = function(el) {
    // not checking for visibility: hidden because some of the children can have visibility: visible and we dont want to skip them
    return el.htmlData.css.display === 'none' || el.htmlData.css.opacity === '0';
}

export const recursiveDatasetFlattening = (json, skipInvisibleElements = false) => {
    let flattened = {};
    if (!json || !json.htmlData) return;
    if (skipElement(json)) return;
    if (skipInvisibleElements && invisibleElement(json)) return;

    flattened[json.eyeId] = _.omit(json, ['children']);
    flattened[json.eyeId]['children'] = [];

    if (json.children && !config.breakingElements.skipTagsParent.includes(json.htmlData.tag.toLowerCase())) {
        json.children.forEach((child, i) => {
            flattened[json.eyeId].children.push(child.eyeId);
            child['parentId'] = json.eyeId;
            flattened = _.extend({}, flattened, recursiveDatasetFlattening(child, skipInvisibleElements));
        })
    }

    return flattened;
}

export const takeScreenshot = async function(driver, path) {
    let image = await driver.takeScreenshot();
    FS.writeFileSync(path, image, 'base64');
}

export const sendPageToProcessing = async  function(url, type = 'visual') {
    let guiProcessingQueue = new RedisQueue(config.workerQueues.GUI_PROCESSING);
    let functionalTestingQueue = new RedisQueue(config.workerQueues.FUNCTIONAL_TESTING);
    let browsersToProcess = ['chrome'];//, 'firefox'];

    // TODO Leon check if types work as intended
    if (type === 'visual') {
        for (let browser of browsersToProcess) {
            await guiProcessingQueue.add('downloadPage', {page: {url, width: 1920, height: 1080, browser}});
        }
    } else if (type === 'functional') {
        //todo move this adding to functionalTestingQueue to for loop above if we need functional testing on all browsers
        await functionalTestingQueue.add('functionalTesting', {
            page: {url, width: 1920, height: 1080, browser: 'chrome'}
        });
    }
}

export const trim = function (s, c) {
    if (!s || !c) return s;
    if (c === "]") c = "\\]";
    if (c === "^") c = "\\^";
    if (c === "\\") c = "\\\\";
    return s.replace(new RegExp(
        "^[" + c + "]+|[" + c + "]+$", "g"
    ), "");
}

export const removeDuplicates = (array) => {
  return [...new Set(array)];
}

export const sendProgressUpdate = (data) => {
    process.send({
        childPid: process.pid,
        type: 'jobProgressUpdate',
        data
    });
}

export const sendScreenshotUpdate = async (driver, otherDataToSend) => {
    let screenshot = await driver.takeScreenshot();

    const buffer = Buffer.from(screenshot, "base64");
    let jimpImg = await Jimp.read(buffer);
    await jimpImg.resize(640, Jimp.AUTO);
    await jimpImg.crop(0, 0, 640, 480);

    screenshot = await jimpImg.getBase64Async(Jimp.AUTO);

    sendProgressUpdate(_.extend({}, otherDataToSend, { screenshot }))

}

export const sendShopifyGraphQLReq = async (shop, query, variables) => {
    let dbUser = await ShopifyTestUserService.getByHost(shop);
    const client = new Shopify.Clients.Graphql(shop, dbUser.session.accessToken);
    let response;
    try {
        response = await client.query({
            data: {
                query,
                variables
            }
        });
    } catch (error) {
        if (error instanceof ShopifyErrors.GraphqlQueryError) {
            // look at error.response for details returned from API,
            // specifically, error.response.errors[0].message
        } else {
            // handle other errors
        }
    } finally {
        return response;
    }
}

export const testFrequencyToMs = (frequency) => {
    // TODO fix this mess
    let number, unit;
    if (frequency.includes('_')) {
        frequency = frequency.split('_');
        number = parseInt(frequency[0]);
        unit = frequency[1];
    } else {
        number = 1;
        unit = frequency;
    }
    return unit.includes('week') ? number * 7 * 24 * 60 * 60 * 1000 :
        unit.includes('day') ? number * 24 * 60 * 60 * 1000 :
        unit.includes('hour') ? number * 60 * 60 * 1000 :
        unit.includes('minute') ? number * 60 * 1000 :
        unit.includes('second') ? number * 1000 : 0;
}


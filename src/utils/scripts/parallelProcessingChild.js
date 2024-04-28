import Page from "../classes/Page.js";
import processingFunctionsSetup from "../processingFunctionsSetup.js";
import mongoInit from "../../models/init.js";
import config from "../config.js";

await mongoInit(config.DATABASE_URL);
process.on('message', async function(msg) {
    let page = new Page({
        url: msg.url,
        vpWidth: msg.vpWidth,
        vpHeight: msg.vpHeight,
        resolutionStep: msg.resolutionStep,
        startRes: msg.startRes,
        endRes: msg.endRes,
        s3Location: msg.pageS3Location,
        browser: msg.browser
    });
    let err = false;
    let result;

    try {
        result = await processingFunctionsSetup[msg.processingFunction](page, msg.conditionFunction);
    } catch (e) {
        console.log(`Skipping ${msg.url} because of error:`, e);
        err = true;
    }

    await page.shutDown();
    process.send({
        childPid: process.pid,
        error: err,
        result: result
    }, function(err){
        console.log(`Disconnecting child process for ${msg.url}`)
        process.disconnect();
    });
});

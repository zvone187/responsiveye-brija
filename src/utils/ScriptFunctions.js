import fs from "fs";
import csv from "csv-parser";
import PageProcessing from "../models/pageprocessing.js";
import Page from "./classes/Page.js";
import config from "./config.js";
import ParallelProcessing from "./ParallelProcessing.js";
import processingFunctionsSetup from "./processingFunctionsSetup.js"
import RedisQueue from "./queue.js"
import {
    addPageToVisualProcessing,
    createDirIfDoesntExist,
    downloadFile,
    getUrlParts,
    logMemoryUsage,
    sendSlackNotification,
    testFrequencyToMs
} from "./common.js";
import PageProcessingService from "../services/pageprocessing.js";
import FS from "fs";
import _ from "lodash";
import AWS from "./aws.js";
import ShopifyTestService from "../services/shopifytest.js";
import {sendMailShopify} from "./mail.js";
import ShopifyTestUserService from "../services/shopifytestuser.js";

export default class ScriptFunctions {
    constructor(args) {
        this.args = args;
    }

    async addPagesForProcessing() {
        if (!this.args['csvPath']) throw new Error('Please provide csvPath')
        await new Promise((resolve, reject) => {
            let queue = new RedisQueue(this.args.queueName);
            var stream = fs.createReadStream(this.args['csvPath'])
                .pipe(csv({headers: false}))
                .on('data', async (row) => {
                    try {
                        stream.pause();
                        let urlParts = getUrlParts(row[0]);
                        if (this.args.dest === 'redis') {
                            let doc = { url: row[0], urlHost: urlParts.host, urlPath: urlParts.pathname, browser: this.args.browser };
                            doc['width'] = parseInt(row[1] || 1920);
                            doc['height'] = parseInt(row[2] || 1080);
                            if (this.args.reprocess) {
                                let docFromDb = await PageProcessingService.getByUrl(urlParts.host, urlParts.pathname, this.args.browser);
                                if (!docFromDb) throw new Error('Page not found in db');
                                let update = {};
                                update[`finalResults.${this.args.processingFunction === 'findBreakingElements' ? 'breakingElements' : 'overlapProcessing'}`] = this.args.processingFunction === 'findBreakingElements' ? [] : {};
                                await Pageprocessing.updateByUrl(docFromDb.urlHost, docFromDb.urlPath, docFromDb.browser, update, 'set');
                                for (let i = 0; i < docFromDb.downloadedCopies.length; i++) {
                                    await addPageToVisualProcessing(queue, docFromDb.downloadedCopies[i], this.args.processingFunction, docFromDb.browser);
                                }
                            } else {
                                await queue.queue.add('processPage', {
                                    page: doc,
                                    processingFunction: this.args.processingFunction,
                                    conditionFunction: this.args.conditionFunction,
                                    resolutionsInParallel: this.args.resolutionsInParallel === 'true'
                                }, {priority: parseInt(this.args['jobPriority']) || config.defaultQueueJobPriority});
                            }
                        } else {
                            await PageProcessing.create({
                                urlHost: urlParts.host,
                                urlPath: urlParts.pathname,
                                status: 'unprocessed',
                                browser: this.args.browser
                            })
                        }
                    } catch (e) {
                        console.log(`Skipping ${row['0']} because of error: { ${e} }`)
                    } finally {
                        stream.resume();
                    }
                })
                .on('error', (e) => {
                    console.log('Error happened while processing CSV', e);
                    reject(e);
                })
                .on('end', () => {
                    console.log('CSV file processed');
                    resolve();
                });
        });
    }

    async startProcessing(doc) {
        console.log('Start processing memory usage');
        logMemoryUsage();
        if (this.args.parallelProcessing) {
            let parallelProcessing = new ParallelProcessing({data: _.extend({page: doc}, this.args)});
            return await parallelProcessing.processPageOnManyResolutions();
        } else {
            let err = false;
            let page = new Page({
                url: doc.url,
                vpWidth: doc.width,
                vpHeight: doc.height,
                resolutionStep: doc.resolutionStep,
                startRes: doc.startRes,
                endRes: doc.endRes,
                browser: this.args.browser
            });

            try {
                await processingFunctionsSetup[this.args.processingFunction](page, this.args.conditionFunction);
            } catch (e) {
                console.log(`Skipping ${doc.url} because of error:`, e);
                err = true;
            }

            await page.shutDown();
            return err;
        }
    }

    async getOnePageAndStartProcessing() {
        let doc = config.debug.testPage ||
            await PageProcessing.findOneAndUpdate({
                status: 'unprocessed'
            }, {
                status: 'processing'
            });
        if (!doc) return false;

        let error = await this.startProcessing(doc);

        await PageProcessing.updateOne({
            _id: doc._id
        }, {
            '$set': {
                'status': error ? 'failed' : 'processed'
            }
        });

        return !config.debug.testPage;
    }

    async processUnprocessedPages() {
        let scriptStartTime = Date.now();
        let cont = true;
        while (cont) {
            cont = await this.getOnePageAndStartProcessing();
        }
        console.log(`Finished script for ${this.args.processingFunction} processing pages in ${(Date.now() - scriptStartTime)/1000} (s)`);
    }

    async processAllPages() {
        let scriptStartTime = Date.now();
        let pages = await PageProcessing.find({});
        for (let doc of pages) {
            console.log(`Starting to process ${doc.url}...`)

            await this.startProcessing(doc);
        }
        console.log(`Finished script for ${this.args.processingFunction} processing pages in ${(Date.now() - scriptStartTime)/1000} (s)`);
    }

    async getProcessedPagesCSV() {
        let csv = 'url,number_of_breakpoints,downloaded_copies,totalBreakingElements,totalBreakingElementsById,numberOfRezolutionsWithOverlaps,totalOverlaps\n';
        let pages = await PageProcessingService.list();

        for (let page of pages) {
            console.log(`Getting data for ${page.urlHost + page.urlPath}`);
            try {
                let totalBreakingElements = 0, totalBreakingElementsByEyeId = 0, resolutionsWithOverlaps = 0,
                    totalOverlaps = 0;
                let breakingElements = page.finalResults ? page.finalResults.breakingElements : [];
                let overlapProcessing = page.finalResults ? page.finalResults.overlapProcessing : [];
                for (let be of breakingElements) {
                    totalBreakingElements += be.errorCount;
                    totalBreakingElementsByEyeId += be.errorCountById;
                }

                resolutionsWithOverlaps = _.keys(overlapProcessing).length;
                for (let rez in overlapProcessing) {
                    totalOverlaps += overlapProcessing[rez].result.length;
                }

                csv += `https://${page.urlHost + page.urlPath},${page.breakpoints.length},${(page.downloadedCopies || []).length},${totalBreakingElements},${totalBreakingElementsByEyeId},${resolutionsWithOverlaps},${totalOverlaps}\n`;
            } catch (e) {
                console.log(`Skipping page ${page.urlHost + page.urlPath}`);
            }
        }

        FS.writeFileSync('./dbResults.csv', csv);
    }

    async debugPageProcessing() {
        let urlParts = getUrlParts(this.args.url);
        let dbPageDoc = await PageProcessingService.getByUrl(urlParts.host, urlParts.pathname, this.args.browser),
            pageUrlId = urlParts.id,
            fullProcessing = this.args.fullProcessing;


        for (let i = 0; i < dbPageDoc.breakpoints.length; i++) {
            let startRes = fullProcessing ? dbPageDoc.breakpoints[i] : this.args.startRes;
            let endRes = fullProcessing ? (i < dbPageDoc.breakpoints.length - 1 ? dbPageDoc.breakpoints[i + 1] : config.highest_processing_resolution) : this.args.endRes;
            if (endRes - startRes < config.processing_resolution_step[0] * 2) continue;
            try {
                let pageBetweenBreakpointsUrl = dbPageDoc.downloadedCopies.find(dc => dc.startRes === startRes).s3Location;

                createDirIfDoesntExist(`src/public/html/${pageUrlId}/`);

                await downloadFile(pageBetweenBreakpointsUrl, `src/public/html/${pageUrlId}/${startRes}.html`);

                await this.startProcessing({ url: `http://localhost:${config.PORT}/public/html/${pageUrlId}/${startRes}.html`, startRes, endRes, browser: this.args.browser });

            } catch (e) {
                console.log(`Cannot find downloaded copy of ${this.args.url} between ${startRes} and ${endRes}`);
                return;
            }

            if (!fullProcessing) break;
        }
    }

    async debugPageDownload() {
        let scriptStartTime = Date.now();
        let page = new Page({
            url: this.args.url,
            vpWidth: this.args.resolutionsToDownload[0],
            vpHeight: 1,
            browser: this.args.browser
        });
        page.setDirPath(`./src/public/html/${page.urlId}`);
        let res = await page.startProcessingSingleRes(false, this.args.conditionFunction);

        console.log(`Page saved at ${res.local} in ${(Date.now() - scriptStartTime)/1000} (s)`);

        for (let i = 1; i < this.args.resolutionsToDownload.length; i++) {
            scriptStartTime = Date.now();
            page.width = this.args.resolutionsToDownload[i];
            await page.resizePage();
            let res = await page.download();
            console.log(`Page saved at ${res.local} in ${(Date.now() - scriptStartTime)/1000} (s)`);
        }

        await page.shutDown();
        console.log('Finished!');

    }

    async debugFunctionalTesting() {
        let scriptStartTime = Date.now();
        let page = new Page({
            url: this.args.url,
            vpWidth: this.args.resolutionsToProcess[0],
            vpHeight: 1,
            browser: this.args.browser
        });
        page.setDirPath(`./src/public/html/${page.urlId}`);
        let res = await page.startProcessingSingleRes(false, this.args.processingFunction);

        console.log(`Debug functional testing done in ${(Date.now() - scriptStartTime)/1000} (s)`);

        for (let i = 1; i < this.args.resolutionsToProcess.length; i++) {
            scriptStartTime = Date.now();
            page.width = this.args.resolutionsToProcess[i];
            await page.resizePage();
            let res = await page.functionalTesting();
            console.log(`Debug functional testing done in ${(Date.now() - scriptStartTime)/1000} (s)`);
        }

        await page.shutDown();
        console.log('Finished debugging functional testing!');

    }

    async debugShopifyTesting() {
        let filename = './shopifyCheckAuto.csv';
        FS.writeFileSync(filename, 'URL,Collections found,Products found,AddToCart buttons found,AddToCarts clickable,Payment\n');
        for (let i = 0; i < this.args.urls.length; i++) {
            let url = this.args.urls[i];
            let page = new Page({
                url: url,
                vpWidth: config.devices.laptop.width,
                vpHeight: config.devices.laptop.height,
                browser: this.args.browser
            });
            page.setDirPath(`./src/public/html/${page.urlId}`);
            let res;
            try {
                res = await page.startProcessingSingleRes(false, this.args.processingFunction);
            } catch (e) {
                console.log(`Error processing ${url}`, e);
                res = {collections: [], products: [], allAddToCartButtons: [], cartCheck: [], paymentResult: [], discount: false}
            }
            FS.appendFileSync(filename, `${url},${res.collections.length},${res.products.length},${res.allAddToCartButtons.length},${res.cartCheck.filter(cc => cc).length},${res.discount},${res.paymentResult.length - 1}\n`);
            await page.shutDown();
        }

        console.log('Finished debugging shopify testing!');

    }

    async getQueueStatus() {
        const guiQueue = new RedisQueue(config.workerQueues.GUI_PROCESSING);
        const taskQueue = new RedisQueue(config.workerQueues.ERROR_PROCESSING);
        const functionalQueue = new RedisQueue(config.workerQueues.FUNCTIONAL_TESTING);
        const shopifyQueue = new RedisQueue(config.workerQueues.SHOPIFY_TEST_PROCESSING);
        console.log({
            visualProcessing: {
                active: await taskQueue.queue.getActiveCount(),
                waiting: await taskQueue.queue.getWaitingCount(),
                stalled: await taskQueue.queue.getStalledCount(),
                completed: await taskQueue.queue.getCompletedCount(),
                failed: await taskQueue.queue.getFailedCount()
            },
            functionalTesting: {
                active: await functionalQueue.queue.getActiveCount(),
                waiting: await functionalQueue.queue.getWaitingCount(),
                stalled: await functionalQueue.queue.getStalledCount(),
                completed: await functionalQueue.queue.getCompletedCount(),
                failed: await functionalQueue.queue.getFailedCount()
            },
            pageDownload: {
                active: await guiQueue.queue.getActiveCount(),
                waiting: await guiQueue.queue.getWaitingCount(),
                stalled: await guiQueue.queue.getStalledCount(),
                completed: await guiQueue.queue.getCompletedCount(),
                failed: await guiQueue.queue.getFailedCount()
            },
            shopify: {
                active: await shopifyQueue.queue.getActiveCount(),
                waiting: await shopifyQueue.queue.getWaitingCount(),
                stalled: await shopifyQueue.queue.getStalledCount(),
                completed: await shopifyQueue.queue.getCompletedCount(),
                failed: await shopifyQueue.queue.getFailedCount()
            }
        });
    }

    async s3Cleanup() {
        throw new Error('Check that you are connected to production database and then comment out this line!');

        let skip = 0
            , limit = 500
            , dbData = []
            , dbRes = []
            , pages = []
            , errors = [];

        do {
            dbRes = await PageProcessing.find().skip(skip).limit(limit);
            dbData = dbData.concat(dbRes);
            skip += limit;
        } while (dbRes && dbRes.length > 0);

        for (let doc of dbData) {
            pages = pages.concat(doc.downloadedCopies.map((d) => d.s3Location));
            if (doc.finalResults.breakingElements) errors = errors.concat(doc.finalResults.breakingElements.map((d) => d.resultsLocation));
            if (doc.finalResults.overlappingElements) errors = errors.concat(doc.finalResults.overlappingElements.map((d) => d.resultsLocation));
        }

        pages = [...new Set(pages)];
        errors = [...new Set(errors)];

        let aws = new AWS()
            , trunc = false
            , Marker = ''
            , Delimiter = ''
            , Prefix = '';

        do { //this do-while is cleaning responsiveyealphapublic, meaning removing all error jsons that are not in use anymore
            let awsObjects = await aws.getFromS3('responsiveyealphapublic', Delimiter, Prefix, Marker);
            trunc = awsObjects.IsTruncated;
            Marker = awsObjects.Contents[awsObjects.Contents.length - 1].Key;

            let objectsToDelete = [];
            let objectsToKeep = [];
            for (let obj of awsObjects.Contents) {
                if (errors.filter((e) => e && e.includes(obj.Key)).length === 0) {
                    objectsToDelete.push({Key: obj.Key})
                } else {
                    objectsToKeep.push({Key: obj.Key})
                }
            }

            await aws.deleteFromS3('responsiveyealphapublic', objectsToDelete)
        } while(trunc);

        console.log('Finished cleaning up S3 responsiveyealphapublic bucket!');

        trunc = false;
        Marker = '';
        Delimiter = '';
        Prefix = '';

        do { //this do-while is cleaning page.responsiveye.com, meaning removing all downloaded pages that are not in use anymore
            let awsObjects = await aws.getFromS3('page.responsiveye.com', Delimiter, Prefix, Marker);
            trunc = awsObjects.IsTruncated;
            Marker = awsObjects.Contents[awsObjects.Contents.length - 1].Key;

            let objectsToDelete = [];
            let objectsToKeep = [];
            for (let obj of awsObjects.Contents) {
                if (pages.filter((e) => e && e.includes(obj.Key)).length === 0) {
                    objectsToDelete.push({Key: obj.Key})
                } else {
                    objectsToKeep.push({Key: obj.Key})
                }
            }

            await aws.deleteFromS3('page.responsiveye.com', objectsToDelete)
        } while(trunc);

        console.log('Finished cleaning up S3 page.responsiveye.com bucket!');
    }

    async runShopifyTest() {
        let users = await ShopifyTestUserService.list({
            uninstalled: {
                $ne: true
            }
        });
        for (let user of users) {
            if (!user.testFrequency) continue;
            let lastTest = (await ShopifyTestService.getByHost(user.shopifyUrl, 1))[0];
            if (!lastTest) continue;
            let toTestOrNotToTest = (Date.now() - lastTest.createdAt) >= testFrequencyToMs(user.testFrequency);
            if (toTestOrNotToTest) {
                await sendSlackNotification({
                    text: `Shopify store ${user.shopifyUrl} needs to be tested!\nLast test: ${user.lastTestAt}\nTest frequency: ${user.testFrequency}`
                });
                const redisQueue = new RedisQueue(config.workerQueues.SHOPIFY_TEST_PROCESSING);
                await redisQueue.add('shopifyTesting', {
                    page: {
                        url: user.shopifyUrl,
                    },
                    resolutionsInParallel: false
                });
            }
        }
    }
}

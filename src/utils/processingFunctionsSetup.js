import config from "./config.js";
import util from "util";
import {exec} from "child_process";
import path from "path";
import AWS from "./aws.js";
import FS from "fs";
import _ from "lodash";
import ML from "./classes/ML.js";
import {createDirIfDoesntExist, delay, saveData, sendSlackNotification} from './common.js'
import Pageprocessing from "../services/pageprocessing.js";
import Page from "./classes/Page.js";
import PageProcessingService from "../services/pageprocessing.js";
import FunctionalTestingService from "../services/functionaltesting.js";
import ShopifyTestService from "../services/shopifytest.js";
import {sendMailShopify} from "./mail.js";
import ShopifyTestUserService from "../services/shopifytestuser.js";

export default {

    findBreakingElements: async (page) => {
        page.setDirPath(`./resources/breaking_elements/${page.urlId}`);
        let results = await page.startProcessingMultiRes(true, 'findBreakingElements', 'findBreakingElementsPostprocessing');

        let localFiles = [];

        for (let name in results) {
            let res = await saveData(results[name], {ssDirPath: page.ssDirPath, name});
            localFiles.push(res);
            results[name] = await saveData(
                results[name],
                {
                    bucketName: config.s3Buckets.debug,
                    filePath: `breaking_elements/${page.urlId}/${page.startRes}-${page.endRes}`,
                    name
                },
                's3'
            );
        }

        if (config.processML) {
            let MLProcessing = new ML();
            let MLdata = await MLProcessing.findBreakingElements(localFiles, page);
            let breakingElementsFilename = `breakingElements_${page.browser}.json`;

            let aws = new AWS(),
                s3ResultsLocation = null,
                errorCount = MLdata.length,
                errorEyeIds = _.uniq(MLdata.map(el => el.eye_id)),
                errorCountById = errorEyeIds.length;

            if (false && config.debug && config.debug.args) {
                await saveData(JSON.stringify(MLdata), { ssDirPath: `resources/breaking_elements/${page.urlId}`, name: breakingElementsFilename});
                return;
            }

            if (MLdata.length > 0) {
                s3ResultsLocation = await aws.uploadToS3(config.s3Buckets.public, `${page.urlId}/${page.startRes}-${page.endRes}/${breakingElementsFilename}`, JSON.stringify(MLdata));
            }

            results = {
                'preprocessedFiles.breakingElements': _.extend({results: results}, _.pick(page, ['startRes', 'endRes'])),
                'finalResults.breakingElements': _.extend({resultsLocation: s3ResultsLocation, errorCount, errorCountById, errorEyeIds}, _.pick(page, ['startRes', 'endRes']))
            };

            await PageProcessingService.updateByUrl(page.urlHost, page.urlPath, page.browser, results, 'push');

            // if (config.NODE_ENV === 'production') {
            //     try {
            //         FS.appendFileSync('./resources/breaking_elements/breaking_elements_results.csv', `${page.url},${MLdata.length},${errorCountById},http://localhost:4200/alpha/${encodeURIComponent(page.url)}\n`);
            //     } catch (e) {
            //         console.log('Can\'t save overlap results file because of', e);
            //     }
            // }
        }

        return _.extend({}, results, {page: {url: page.url, urlHost: page.urlHost, urlPath: page.urlPath, urlId: page.urlId, browser: page.browser}});
    },

    findOverlappingElements: async (page) => {
        page.setDirPath(`./resources/overlap_processing/${page.urlId}`);
        let results = await page.startProcessingSingleRes(
            true,
            'findOverlappingElements'
        );

        let debugResults = [];

        if (config.saveDebugFilesToS3) {
            for (let name in results) {
                debugResults.push(await saveData(
                    results[name],
                    {
                        bucketName: config.s3Buckets.debug,
                        filePath: `overlap_processing/${page.urlId}/${page.width}}`,
                        name
                    },
                    's3'
                ));
            }
        }

        let dbData = {};

        let formattedData = page.layers.map(l => l.overlaps.map(o => {
            return {
                elements: o.elements.map(e => _.pick(e, ['eyeId', 'path'])),
                bounds: o.bounds,
                eyeId: o.eyeId
            };
        })).flat();

        if (debugResults.length > 0) dbData[`preprocessedFiles.overlapProcessing.${page.width}`] = debugResults;
        dbData[`finalResults.overlapProcessing.${page.width}`] = {
            result: formattedData,
            processedAt: new Date()
        };

        await Pageprocessing.updateByUrl(page.urlHost, page.urlPath, page.browser, dbData);

        return {
            page: _.pick(page, ['width', 'url', 'urlId', 'urlHost', 'urlPath', 'browser']),
            overlaps: formattedData,
            type: 'findOverlappingElements'
        };
    },

    functionalTesting: async (page) => {
        var startTime = Date.now();

        await FunctionalTestingService.updateByUrl(page.urlHost, page.urlPath, page.browser, {
            urlHost: page.urlHost,
            urlPath: page.urlPath,
            browser: page.browser,
            progress: {
                totalButtons: 0,
                processedButtons: 0,
                flowsTested: 0
            },
            status: 'processing'
        });

        page.setDirPath(`./resources/functional_testing/${page.urlId}`);
        let data = await page.startProcessingSingleRes(
            true,
            'functionalTesting'
        );

        await FunctionalTestingService.updateByUrl(page.urlHost, page.urlPath, page.browser, {
            urlHost: page.urlHost,
            urlPath: page.urlPath,
            browser: page.browser,
            buttonsFailedToClick: data.buttonsToReprocess,
            errorTriggeringFlows: data.errorTriggeringFlows,
            processingTime:  (Date.now() - startTime)/1000,
            progressData: data.progress,
            status: 'processed'
        });

        return {
            page: _.pick(page, ['width', 'url', 'urlId', 'urlHost', 'urlPath', 'browser']),
            type: 'functionalTesting'
        };
    },

    shopifyTesting: async (page, conditionFunction) => {
        let startTime = Date.now();
        let filename = './shopify.csv';

        page.setDirPath(`./resources/shopify_testing/${page.urlId}`);
        page.setShopifyUrl(page.url);
        page.setUrl(`https://${page.url}`.replace('https://https://', 'https://'));
        let data;
        try {
            data = await page.startProcessingSingleRes(
                true,
                'shopifyTesting'
            );
        } catch (e) {
            console.log(`url: ${page.url} error: ${e}`)
            data = {collections: [], products: [], allAddToCartButtons: [], cartCheck: [], paymentResult: [], discount: false, checkoutToken: []}
        }

        // TODO double check this
        let passed = {
            addToCart: data.cartCheck.reduce((m, c) => m || c, false),
            discount: data.discount,
            checkout: data.paymentResult && data.paymentResult.length === 5
        };

        // TODO we should add a user field here for easier search for tests
        let res = await ShopifyTestService.create({
            shopifyUrl: page.urlHost,
            screenWidth: page.width,
            collectionsProcessed: data.collections,
            productsProcessed: data.products,
            productsAddedToCart: data.allAddToCartButtons,
            passed,
            processingTime:  (Date.now() - startTime)/1000,
        });

        res = res.toJSON();

        if (conditionFunction === 'verification') {
            res.verification = true;

            let dbData = {
                '$set': {
                    cartVerified: passed.addToCart,
                    discountVerified: passed.discount,
                    checkoutVerified: passed.checkout,
                    verifyingStore: false
                }
            };
            // if anything is not passed during the verification process, we need to manually look at it
            // if (Object.entries(passed).some(([key, value]) => !value)) {
            if (!passed.addToCart) {
                res.passed.addToCart = undefined;
                res.passed.discount = undefined;
                res.passed.checkout = undefined;
                dbData = { '$set': { verifyingStore: false } };
            }

            await sendSlackNotification({
                // icon_emoji: ':rotating_light:',
                // username: 'Shopify Verification',
                text: `Shopify store ${page.shopifyUrl} registered!\nCart check: ${passed.addToCart}\nDiscount: ${passed.discount}\nCheckout: ${passed.checkout}`
            });

            await ShopifyTestUserService.updateByHost(page.shopifyUrl, dbData);
        }

        let user = await ShopifyTestUserService.getByHost(page.urlHost)
        console.log(`Shopify testing finished for ${page.urlHost}`)
        FS.appendFileSync(filename, `${page.url},${data.collections.length},${data.products.length},${data.allAddToCartButtons.length},${data.cartCheck.filter(cc => cc).length},${data.paymentResult.length - 1},${data.checkoutToken},${JSON.stringify(data.discount)}\n`);

        if (user && conditionFunction !== 'verification' &&
            Object.entries(passed).some(([key, value]) => !value)) {
            await sendMailShopify({
                from: config.NODEMAILER_SHOPIFY_USER,
                to: user.emails,
                subject: `Check if your store ${page.urlHost} is working`,
                html: '<!DOCTYPE html>'+
                    '<html><head><title>Appointment</title>'+
                    '</head><body><div style="margin:auto;width:100%;max-width:768px;text-align: center;">'+
                    '<img src="https://s3.amazonaws.com/assets.safetytest.io/safetytest_email_logo.jpg" alt="" width="100%">'+
                    `<div style="margin: 30px"><p>SafetyTest CANNOT make a purchase on your store ${page.urlHost}.</p>`+
                    '<br>'+
                    '<p>Please, review your store to make sure it\'s working properly.</p></div>'+
                    '</div></body></html>'
            });
        }

        return {
            data: res,
            type: 'shopifyTesting'
        };
    },

    getElementsViaCondition: async (page, conditionFunction) => {
        page.setDirPath(`./resources/elements_via_condition`)
        return await page.startProcessingSingleRes(false, conditionFunction);
    },

    downloadPage: async (page, conditionFunction) => {
        page.setDirPath(`./src/public/html/${page.urlId}`);
        let pageLocations = await page.startProcessingSingleRes(false, conditionFunction);

        let getBreakpointsStartTime = Date.now();
        let pageToGetBreakpoints = new Page({
            url: `file://${pageLocations.local}?`,
            vpWidth: page.width,
            vpHeight: page.height,
            browser: page.browser
        });
        await pageToGetBreakpoints.openPageInSelenium();
        let breakpoints = _.sortBy(await pageToGetBreakpoints.getBreakpoints());
        await Pageprocessing.updateByUrl(page.urlHost, page.urlPath, page.browser, {
            downloadedCopies: [],
            finalResults: {},
            preprocessedFiles: {},
            breakpoints,
            status: 'processing'
        }, 'set');

        // TODO uncomment this once we're able to properly serve pages vis s3
        // FS.unlinkSync(pageLocations.local);
        console.log(`Downloaded page breakpoints in ${(Date.now() - getBreakpointsStartTime) / 1000}s:`, breakpoints);
        let s3Locations = [pageLocations.s3];

        let lowLimitRes = config.debug && config.debug.startRes ? config.debug.startRes : config.lowest_processing_resolution;
        let highLimitRes = config.debug && config.debug.endRes ? config.debug.endRes : config.highest_processing_resolution;

        breakpoints = [lowLimitRes].concat(
            breakpoints.filter(bp => bp > lowLimitRes && bp < highLimitRes)
        );

        for (let i = 0; i < breakpoints.length; i++) {
            let resolutionStartTime = Date.now();
            page.width = breakpoints[i] + 1;
            page.height = 1;
            await page.resizePage();
            let res = await page.download();
            let pageForRedis = _.pick(page, ['width', 'url', 'urlId', 'browser']);
            pageForRedis.pageS3Location = res.s3;
            s3Locations.push(res.s3);
            let downloadData = {
                page: pageForRedis,
                startRes: breakpoints[i],
                endRes: i < breakpoints.length - 1 ? breakpoints[i + 1] : highLimitRes,
                s3Location: res.s3,
                processedAt: new Date(),
                type: 'downloadPage',
                browser: page.browser
            };

            await Pageprocessing.updateByUrl(page.urlHost, page.urlPath, page.browser, { downloadedCopies: downloadData }, 'push');

            try {
                process.send({
                    childPid: process.pid,
                    type: 'jobProgressUpdate',
                    data: downloadData
                });
            } catch (e) {
                console.log('Nothing special - just an indication that parent process doesn\'t exist');
            }
            console.log(`Resolution ${breakpoints[i]} downloaded in (s):`, (Date.now() - resolutionStartTime) / 1000);
        }

        // TODO why is this breaking page that downloads page locally if ran before
        await pageToGetBreakpoints.shutDown();
        return s3Locations;
    }
}

import ParallelProcessing from "./utils/ParallelProcessing.js";
import Site from "./utils/classes/Site.js";
import RedisQueue from "./utils/queue.js";
import config from "./utils/config.js";
import _ from "lodash";

export async function processPage(job, done) {
    console.log(`Starting ${job.data.processingFunction}  processing for page ${job.data.page.url} in browser ${job.data.page.browser}`);
    let parallelProcessing = new ParallelProcessing(job);
    let result = job.data.resolutionsInParallel ?
        await parallelProcessing.processPageOnManyResolutions() :
        await parallelProcessing.processPageInOneChild();
    done(null, result);
}

/*export async function updateSitePages(job, done) {
    console.log(`Starting getAllSitePages processing for site ${job.data.url}`);
    let site = new Site(job.data.url);
    let result = await site.updateSitePages();
    done(null, result);
}

export async function processSite(job, done) {
    console.log(`Starting to process site ${job.data.url}`);
    let site = new Site(job.data.url);
    await site.syncWithDb();
    let queue = new RedisQueue(config.workerQueues.FUNCTIONAL_TESTING);
    let jobs = [];

    for (let i = 0; i < site.pages.length; i++) {
        let jobPromise = new Promise(async (resolve, reject) => {
            // TODO make sure correct data is being sent
            let job = await queue.add('functionalTesting', _.extend({url: `https://${site.host}${site.pages[i].pathname}`}, {
                resolutionsInParallel: false,
                step: [config.breakingElements.step, 1]
            }));
            let result = await job.finished();
            resolve(result);
        });
        jobs.push(jobPromise);
    }

    await Promise.all(jobs);
    console.log('Finished processing site');
    // TODO ping user with results
    done(null, true);
}*/

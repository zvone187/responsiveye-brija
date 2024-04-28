import Queue from "bull";
import os from "os";
import config from "./config.js";

import * as taskHandlers from "../tasks.js";
import _ from "lodash";

const JOB_DEFINITIONS = {
    'downloadPage': {
        processingFunction: 'downloadPage',
        conditionFunction: 'download',
        resolutionsInParallel: false
    },
    'findOverlappingElements': {
        processingFunction: 'findOverlappingElements',
        conditionFunction: 'findOverlappingElements',
        resolutionsInParallel: true
    },
    'findBreakingElements': {
        processingFunction: 'findBreakingElements',
        conditionFunction: 'findBreakingElements',
        resolutionsInParallel: false
    },
    'functionalTesting': {
        processingFunction: 'functionalTesting',
        conditionFunction: 'functionalTesting',
        resolutionsInParallel: false
    },
    'shopifyTesting': {
        processingFunction: 'shopifyTesting',
        conditionFunction: 'shopifyTesting',
        resolutionsInParallel: false
    }
}

export default class RedisQueue {

    constructor(queueName) {
        let availableCpus = os.cpus().length;
        let numberOfResolutionsPerPage = Math.floor(
            (config.highest_processing_resolution - config.lowest_processing_resolution) /
            config.processing_resolution_step[0]
        ) + 1;
        // TODO temp solution
        this.numberOfParallelWorkers = config.maxParallelSeleniumDrivers;//Math.ceil(Math.floor(availableCpus * 0.8) / numberOfResolutionsPerPage);

        this.queue = new Queue(queueName, { redis: { port: config.REDIS_PORT, host: config.REDIS_HOST, password: config.REDIS_PASS }});
    }

    startWorkers() {
        for (const name in taskHandlers) {
            const handler = taskHandlers[name];
            this.queue.process(name, this.numberOfParallelWorkers, handler);
        }
    }

    addEvtListener(evt, listenerFunction) {
        this.queue.on(evt, listenerFunction);
    }

    async add(jobType, data) {
        return this.queue.add('processPage',
            _.extend({}, JOB_DEFINITIONS[jobType], data),
            {
                priority: config.defaultQueueJobPriority,
                attempts: config.defaultQueueJobAttempts
            }
        );
    }

    async addRaw(name, data) {
        await this.queue.add(name, data, {
            priority: config.defaultQueueJobPriority,
            attempts: config.defaultQueueJobAttempts
        });
    }

    async getJob(jobId) {
        return await this.queue.getJob(jobId);
    }

    async closeConnection() {
        await this.queue.close();
    }

}

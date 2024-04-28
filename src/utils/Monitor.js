import AWS from "./aws.js";
import {delay} from "./common.js";
import RedisQueue from "./queue.js";
import config from "./config.js";

export default class Monitor {
    constructor() {
        this.errorProcessingQueue = new RedisQueue(config.workerQueues.ERROR_PROCESSING);
        this.guiProcessingQueue = new RedisQueue(config.workerQueues.GUI_PROCESSING);
        this.functionalTestingQueue = new RedisQueue(config.workerQueues.FUNCTIONAL_TESTING);
    }

    async startMonitoringWorkerCapacities() {
        console.log('Starting to monitor worker capacities');
        let aws = new AWS();
        while (true) {
            let waitingVisualProcessingCount = await this.errorProcessingQueue.queue.getWaitingCount();
            let activeVisualProcessingCount = await this.errorProcessingQueue.queue.getActiveCount();

            let waitingPageDownloadCount = await this.guiProcessingQueue.queue.getWaitingCount();
            let activePageDownloadCount = await this.guiProcessingQueue.queue.getActiveCount();

            let waitingFunctionalTestingCount = await this.functionalTestingQueue.queue.getWaitingCount();
            let activeFunctionalTestingCount = await this.functionalTestingQueue.queue.getActiveCount();

            let spotFleets = await aws.getWorkerFleetsTargetCapacity();
            let visualFleets = spotFleets.filter(({id}) => id === config.AWS_PAGE_DOWNLOAD_PROCESSING_SPOT_FLEET_ID || id === config.AWS_VISUAL_ERROR_PROCESSING_SPOT_FLEET_ID);
            let functionalFleets = spotFleets.filter(({id}) => id === config.AWS_FUNCTIONAL_TESTING_SPOT_FLEET_ID);
            this.spotFleets = spotFleets;

            // set visual testing fleets
            if (
                (waitingVisualProcessingCount > 0 ||
                    activeVisualProcessingCount > 0 ||
                    waitingPageDownloadCount > 0 ||
                    activePageDownloadCount > 0
                ) && visualFleets.reduce((acc, cur) => acc + cur.targetCapacity, 0) === 0
            ) {
                console.log('Not enough spot fleets, creating new ones');
                await aws.setWorkerFleetsTargetCapacity(1, 1, undefined);
            } else if (
                waitingVisualProcessingCount + activeVisualProcessingCount + waitingPageDownloadCount + activePageDownloadCount === 0
                && visualFleets.reduce((acc, cur) => acc + cur.targetCapacity, 0) > 0
            ) {
                await aws.setWorkerFleetsTargetCapacity(0, 0, undefined);
            }

            // set functional testing fleets
            if ((waitingFunctionalTestingCount > 0 || activeFunctionalTestingCount > 0) && functionalFleets.reduce((acc, cur) => acc + cur.targetCapacity, 0) === 0) {
                console.log('Not enough spot fleets, creating new ones');
                await aws.setWorkerFleetsTargetCapacity(undefined, undefined, 1);
            } else if (waitingFunctionalTestingCount + activeFunctionalTestingCount === 0 && functionalFleets.reduce((acc, cur) => acc + cur.targetCapacity, 0) > 0) {
                await aws.setWorkerFleetsTargetCapacity(undefined, undefined, 0);
            }

            await delay(60000);
        }
    }
}

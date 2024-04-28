import config from "./config.js";
import os from "os";
import _ from "lodash";
import child_process from "child_process";
import {delay} from "./common.js";

export default class ParallelProcessing {
    constructor(job) {
        this.global = {};
        this.url = job.data.page.url;
        this.pageS3Location = job.data.page.pageS3Location;
        this.startRes = job.data.startRes;
        this.processingFunction = job.data.processingFunction;
        this.conditionFunction = job.data.conditionFunction;
        this.queueJob = job;
        this.viewports = [
            job.data.startRes || config.lowest_processing_resolution,
            job.data.endRes || config.highest_processing_resolution
        ];
        this.resolutionsBulkSize = job.data.resolutionsBulkSize || 1;
        this.resolutionStep = job.data.step || config.processing_resolution_step;
        this.browser = job.data.page.browser;
    }

    async sendMessageToChild(child, message) {
        message = _.extend({}, message, {queueJob: this.queueJob});
        if (config.NODE_ENV === 'production') {
            await delay(10000);
            child.send(message)
        }
        else child.on('spawn', () => child.send(message));
    }

    async runChildProcessForManyResolutions(vpWidth, vpHeight, viewports, vpStep, resolve) {
        let child = child_process.fork('./src/utils/scripts/parallelProcessingChild.js');
        this.global.activeProcesses++;

        await this.sendMessageToChild(child, {
            processingFunction: this.processingFunction,
            conditionFunction: this.conditionFunction,
            resolutionStep: this.resolutionStep,
            url: this.url,
            pageS3Location: this.pageS3Location,
            vpWidth: vpWidth,
            vpHeight: 1,
            startRes: vpWidth,
            endRes: (this.startRes + vpStep[0] < this.viewports[1]) ? (this.startRes + vpStep[0]) : this.viewports[1],
            browser: this.browser
        });

        return await new Promise((resolveInner, reject) => {
            child.on('message', async (msg) => {
                if (msg.error) this.global.error = true;

                if (this.queueJob && this.queueJob.progress) this.queueJob.progress(msg.data);

                process.kill(msg.childPid);
                this.global.activeProcesses--;
                if (this.global.vpWidth <= viewports[1]) {

                    let vpWidth = _.clone(this.global.vpWidth), vpHeight = _.clone(this.global.vpHeight);
                    this.global.vpWidth += vpStep[0];
                    this.global.vpHeight += vpStep[1];
                    await this.runChildProcessForManyResolutions(vpWidth, vpHeight, viewports, vpStep, resolveInner);

                }

                resolve();
            });
        });
    }

    async processPageOnManyResolutions() {
        console.log(`Starting to process ${this.url}...`)

        let maxNumberOfParallelProcesses = config.maxParallelSeleniumDrivers === 'max' ? os.cpus().length : config.maxParallelSeleniumDrivers;

        this.global['activeProcesses'] = 0;
        this.global['error'] = false;
        this.global['vpWidth'] = this.viewports[0];
        this.global['vpHeight'] = 1;

        return await new Promise((resolve, reject) => {
            for (let i = 0; i < maxNumberOfParallelProcesses; i++){
                if (this.global.vpWidth > this.viewports[1]) continue;

                this.runChildProcessForManyResolutions(_.clone(this.global.vpWidth), _.clone(this.global.vpHeight), this.viewports, this.resolutionStep.map(rs => rs * this.resolutionsBulkSize), resolve, []);

                this.global.vpWidth += (this.resolutionStep[0] * this.resolutionsBulkSize);
                this.global.vpHeight += (this.resolutionStep[1] * this.resolutionsBulkSize);
            }
        });
    }

    async processPageInOneChild() {
        let child = child_process.fork('./src/utils/scripts/parallelProcessingChild.js');

        let vpStep = this.resolutionStep.map(rs => rs * this.resolutionsBulkSize);

        await this.sendMessageToChild(child, {
            processingFunction: this.processingFunction,
            url: this.url,
            pageS3Location: this.pageS3Location,
            vpWidth: this.startRes || this.queueJob.data.page.width || config.devices['laptop'].width,
            vpHeight: this.queueJob.data.page.height || config.devices['laptop'].height, //todo check this. for functional testing this was hardcoded to 1
            conditionFunction: this.conditionFunction,
            resolutionStep: this.resolutionStep,
            startRes: this.startRes,
            endRes: (this.startRes + vpStep[0] < this.viewports[1]) ? (this.startRes + vpStep[0]) : this.viewports[1],
            browser: this.browser
        });

        return await new Promise((resolve, reject) => {
            child.on('message', (msg) => {
                if (msg.type === 'jobProgressUpdate') {
                    if (this.queueJob && this.queueJob.progress) this.queueJob.progress(msg.data);
                } else {
                    process.kill(msg.childPid);
                    resolve(msg.error || msg.result);
                }
            });
        });
    }
}

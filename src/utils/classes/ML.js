import util from "util";
import {exec} from "child_process";
import config from "../config.js";
import path from "path";
import AWS from "../aws.js";
import FS from "fs";
import _ from "lodash";
import PageProcessingService from "../../services/pageprocessing.js";
import {saveData} from "../common.js";

export default class ML {
    constructor() {

    }

    async findBreakingElements(results, page) {
        const execPromise = util.promisify(exec);
        const { stdout, stderr } = await execPromise(`python3 ${config.MLScriptLocation} --debug=False ` +
            `--file_paths ${results.map(r => path.resolve(r)).join(' --file_paths ')} --page_name ${page.urlId}`, {maxBuffer: 5 * 1024 * 1024});

        return JSON.parse(stdout);
    }
}
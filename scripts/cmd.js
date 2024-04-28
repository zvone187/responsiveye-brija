import repl from 'repl';
import csv from 'csv-parser';
import fs from 'fs';

import config from '../src/utils/config.js';
import {getArgs, logToSheet} from '../src/utils/common.js';
import ScriptFunctions from "../src/utils/ScriptFunctions.js";
import app from '../src/app.js';
import mongoInit from '../src/models/init.js';
import User from '../src/models/user.js';
import PageProcessing from '../src/models/pageprocessing.js';
import UserService from '../src/services/user.js';
import PageProcessingService from '../src/services/pageprocessing.js';

const main = async () => {
    await mongoInit(config.DATABASE_URL);
    process.stdout.write('Database and Express app initialized.\n');
    process.stdout.write('Autoimported modules: config, app, models, services\n');

    const r = repl.start('> ');
    r.context.config = config;
    r.context.app = app;
    r.context.models = {
        User,
        PageProcessing,
    };
    r.context.services = {
        UserService,
        PageProcessingService,
    };

    r.on('exit', () => {
        process.exit();
    });

    r.on('SIGINT', () => {
        process.exit();
    });

    r.setupHistory('.shell_history', () => {});

    startScript();
};

const startScript = async () => {
    let args = config.debug && config.debug.args ? config.debug.args : getArgs();
    console.log(`Starting script with args ${JSON.stringify(args)}`);
    let scriptFunctions = new ScriptFunctions(args);
    await scriptFunctions[args['scriptFunction']]();
    process.exit();
}

main();

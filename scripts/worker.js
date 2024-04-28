import RedisQueue from "../src/utils/queue.js";
import config from "../src/utils/config.js";
import {getArgs} from "../src/utils/common.js";
import mongoInit from "../src/models/init.js";
let args = config.debug && config.debug.args ? config.debug.args : getArgs();
await mongoInit(config.DATABASE_URL);
let queue = new RedisQueue(args.queueName);
queue.startWorkers();

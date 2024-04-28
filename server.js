import http from 'http';
import SocketServer from "./src/utils/socket.js";

import app from './src/app.js';
import config from './src/utils/config.js';
import logger from './src/utils/log.js';
import mongoInit from './src/models/init.js';
import Monitor from "./src/utils/Monitor.js";

const log = logger('server');
const server = http.createServer(app);

process.on('uncaughtException', (err) => {
  log.fatal({ err }, `Unhandled exception ${err}`);
  server.close();
});

process.on('unhandledRejection', (reason) => {
  log.error(`Unhandled promise rejection: ${reason}`);
});

const main = async () => {
  await mongoInit(config.DATABASE_URL);
  log.info(`Listening on 0.0.0.0:${config.PORT}`);
  await server.listen(config.PORT);
  new SocketServer(server);
  if (config.MONITOR) {
    let monitor = new Monitor();
    monitor.startMonitoringWorkerCapacities();
  }
};

main();

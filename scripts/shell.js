import repl from 'repl';

import config from '../src/utils/config.js';
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

  r.setupHistory('.shell_history', () => {});
};

main();

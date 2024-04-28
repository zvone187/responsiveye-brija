import { Router } from 'express';
import swaggerUI from 'swagger-ui-express';

import { authenticateWithToken } from '../middlewares/auth.js';
import { handle404, handleError } from '../middlewares/errors.js';
import authRouter from './auth.js';
import siteRouter from './site.js';
import pageProcessingRouter from './pageprocessing.js';
import shopifyTestRouter from './shopifytest.js';
import shopifyTestUserRouter from './shopifytestuser.js';
import User from './user.js';
import urls from '../urls.js';
import spec from '../openapi.js';
import Shopify from "@shopify/shopify-api";
import ShopifyTestUserService from "../../services/shopifytestuser.js";
import ShopifyTestService from "../../services/shopifytest.js";
import {sendSlackNotification, testFrequencyToMs} from "../../utils/common.js";
import RedisQueue from "../../utils/queue.js";
import config from "../../utils/config.js";

const router = Router();

// Swagger API docs
const swaggerSpecPath = `${urls.swagger.path}/${urls.swagger.spec}`;
const swaggerUIOptions = {
  swaggerOptions: {
    url: swaggerSpecPath
  }
};
router.get(swaggerSpecPath, (req, res) => res.json(spec));
router.use(
  urls.swagger.path,
  swaggerUI.serve,
  swaggerUI.setup(null, swaggerUIOptions)
);

// Authentication
router.use(authenticateWithToken);
router.use(urls.apiPrefix + urls.auth.path, authRouter);

// CRUD API
router.use(urls.apiPrefix + urls.pageProcessing.path, pageProcessingRouter);

router.use(urls.apiPrefix + urls.shopifytest.path, shopifyTestRouter);

router.use(urls.apiPrefix + urls.shopifytestuser.path, shopifyTestUserRouter);

router.use(urls.apiPrefix + urls.user.path, User);

router.use(urls.apiPrefix + urls.site.path, siteRouter);

router.get('/run-safetytest', async (req, res, next) => {
  console.log('Running safety tests...');
  let users = await ShopifyTestUserService.list({
    uninstalled: {
      $ne: true
    }
  });
  const redisQueue = new RedisQueue(config.workerQueues.SHOPIFY_TEST_PROCESSING);
  for (let user of users) {
    if (!user.testFrequency) continue;
    let lastTest = (await ShopifyTestService.getByHost(user.shopifyUrl, 1))[0];
    if (!lastTest) continue;
    let toTestOrNotToTest = (Date.now() - lastTest.createdAt) >= testFrequencyToMs(user.testFrequency);
    if (toTestOrNotToTest) {
      console.log('Adding to queue: ', user.shopifyUrl);
      await redisQueue.add('shopifyTesting', {
        page: {
          url: user.shopifyUrl,
        },
        resolutionsInParallel: false
      });
    }
  }
  await redisQueue.closeConnection();
  res.status(200).json({message: 'ok'});
})

// Error handlers
router.use(handle404);
router.use(handleError);
export default router;

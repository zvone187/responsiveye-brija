import { Router } from 'express';

import ShopifyTestUserService from '../../services/shopifytestuser.js';
import { requireToken } from '../middlewares/auth.js';
import { requireSchema, requireValidId } from '../middlewares/validate.js';
import schema from '../schemas/shopifytestuser.js';
import {sendShopifyGraphQLReq} from "../../utils/common.js";
import {DataType, Shopify} from "@shopify/shopify-api";
import {Order} from "@shopify/shopify-api/dist/rest-resources/2022-10/index.js";
import shopifyConfig from '../../utils/const/shopify.js';
import RedisQueue from "../../utils/queue.js";
import config from "../../utils/config.js";

const router = Router();
const shopifyTestQueue = new RedisQueue(config.workerQueues.SHOPIFY_TEST_PROCESSING);

router.use(requireToken);

/** @swagger
 *
 * tags:
 *   name: ShopifyTestUser
 *   description: API for managing ShopifyTestUser objects
 *
 * /shopify-test-user:
 *   get:
 *     tags: [ShopifyTestUser]
 *     summary: Get all the ShopifyTestUser objects
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of ShopifyTestUser objects
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/ShopifyTestUser'
 */
router.get('', async (req, res, next) => {
  try {
    const results = await ShopifyTestUserService.list();
    res.json(results);
  } catch (error) {
    if (error.isClientError()) {
      res.status(400).json({ error });
    } else {
      next(error);
    }
  }
});

/** @swagger
 *
 * /shopify-test-user:
*   post:
 *     tags: [ShopifyTestUser]
 *     summary: Create a new ShopifyTestUser
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ShopifyTestUser'
 *     responses:
 *       201:
 *         description: The created ShopifyTestUser object
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ShopifyTestUser'
 */
router.post('', requireSchema(schema), async (req, res, next) => {
  try {
    const obj = await ShopifyTestUserService.create(req.validatedBody);
    await shopifyTestQueue.add('shopifyTesting', {
      page: {
        url: req.validatedBody.shopifyUrl
      },
      resolutionsInParallel: false,
      conditionFunction: 'verification'
    });
    res.status(201).json(obj);
  } catch (error) {
    if (error.isClientError()) {
      res.status(400).json({ error });
    } else {
      next(error);
    }
  }
});

router.post('/host', async (req, res, next) => {
  try {
    const obj = await ShopifyTestUserService.getByHost(req.body.host);
    if (obj) {
      res.json(obj);
    } else {
      res.status(200).send('no_store');
    }
  } catch (error) {
    if (error.isClientError()) {
      res.status(400).json({ error });
    } else {
      next(error);
    }
  }
});

router.post('/billing-finished', async (req, res, next) => {
  try {
    await ShopifyTestUserService.updateByHost(req.body.shopifyUrl, {
      '$push': {
        subscriptions: {
          plan: req.body.safetyTestPlanId,
          chargeId: req.body.chargeId,
          status: 'active'
        }
      }
    });

    res.status(200).send('ok');
  } catch (error) {
    if (error.isClientError()) {
      res.status(400).json({ error });
    } else {
      next(error);
    }
  }
});

router.post('/app-uninstalled', async (req, res, next) => {
  try {
    await ShopifyTestUserService.updateByHost(req.body.shopifyUrl, {
      '$set': {
        uninstalled: true
      }
    });

    res.status(200).send('ok');
  } catch (error) {
    if (error.isClientError()) {
      res.status(400).json({ error });
    } else {
      next(error);
    }
  }
});

router.put('/host', requireSchema(schema), async (req, res, next) => {
  try {
    const obj = await ShopifyTestUserService.updateByHost(req.body.shopifyUrl, req.validatedBody);
    if (obj) {
      res.status(200).json(obj);
    } else {
      res.status(404).json({ error: 'Resource not found' });
    }
  } catch (error) {
    if (error.isClientError()) {
      res.status(400).json({ error });
    } else {
      next(error);
    }
  }
});

router.delete('/host', async (req, res, next) => {
  try {
    const success = await ShopifyTestUserService.deleteByHost(req.body.host);
    if (success) {
      res.status(204).send();
    } else {
      res.status(404).json({ error: 'Not found, nothing deleted' });
    }
  } catch (error) {
    if (error.isClientError()) {
      res.status(400).json({ error });
    } else {
      next(error);
    }
  }
});

export default router;

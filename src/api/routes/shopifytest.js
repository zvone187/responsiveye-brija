import { Router } from 'express';

import ShopifyTestService from '../../services/shopifytest.js';
import { requireToken } from '../middlewares/auth.js';
import { requireSchema, requireValidId } from '../middlewares/validate.js';
import schema from '../schemas/shopifytest.js';
import RedisQueue from "../../utils/queue.js";
import config from "../../utils/config.js";

const router = Router();

router.use(requireToken);

/** @swagger
 *
 * tags:
 *   name: ShopifyTest
 *   description: API for managing ShopifyTest objects
 *
 * /shopify-test:
 *   get:
 *     tags: [ShopifyTest]
 *     summary: Get all the ShopifyTest objects
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of ShopifyTest objects
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/ShopifyTest'
 */
router.get('', async (req, res, next) => {
  try {
    const results = await ShopifyTestService.list();
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
 * /shopify-test:
*   post:
 *     tags: [ShopifyTest]
 *     summary: Create a new ShopifyTest
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ShopifyTest'
 *     responses:
 *       201:
 *         description: The created ShopifyTest object
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ShopifyTest'
 */
router.post('', requireSchema(schema), async (req, res, next) => {
  try {
    const obj = await ShopifyTestService.create(req.validatedBody);
    res.status(201).json(obj);
  } catch (error) {
    if (error.isClientError()) {
      res.status(400).json({ error });
    } else {
      next(error);
    }
  }
});

// GET, PUT, DELETE /shopify-test/id/:id

router.get('/:id', requireValidId, async (req, res, next) => {
  try {
    const obj = await ShopifyTestService.get(req.params.id);
    if (obj) {
      res.json(obj);
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

router.put('/id', requireValidId, requireSchema(schema), async (req, res, next) => {
  try {
    const obj = await ShopifyTestService.update(req.body.id, req.validatedBody);
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

router.delete('/id', requireValidId, async (req, res, next) => {
  try {
    const success = await ShopifyTestService.delete(req.body.id);
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

// POST, DELETE /shopify-test/host/

router.post('/host', async (req, res, next) => {
  try {
    let limit = 10;
    if (!req.body.host) res.status(400).json({error: 'Need to provide hostUrl.'});
    if (req.body.limit) limit = parseInt(req.body.limit);
    const obj = await ShopifyTestService.getByHost(req.body.host, limit);
    if (obj) {
      res.json(obj);
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
    if (!req.body.host) res.status(400).json({error: 'Need to provide hostUrl.'});
    const success = await ShopifyTestService.deleteByHost(req.body.host);
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

router.post('/run', async (req, res, next) => {
  try {
    if (!req.body.host) return res.status(400).json({error: 'Need to provide host.'});
    let shopifyTestQueue = new RedisQueue(config.workerQueues.SHOPIFY_TEST_PROCESSING);

    // TODO check if there is already a job in the queue for this host
    if (req.body.device) {
      if (!config.devices[req.body.device]) return res.status(400).json({error: 'Invalid device.'});
      await shopifyTestQueue.add('shopifyTesting', {
        page: {
          url: req.body.host,
          width: config.devices[req.body.device].width,
          height: config.devices[req.body.device].height
        },
        resolutionsInParallel: false
      });

      return res.status(200).send({message: `${req.body.host} sent for processing on ${req.body.device}`});
    } else {
      for (let device in config.devices) {
        await shopifyTestQueue.add('shopifyTesting', {
          page: {
            url: req.body.host,
            width: config.devices[device].width,
            height: config.devices[device].height
          },
          resolutionsInParallel: false
        });
      }
      return res.status(200).send({message: `${req.body.host} sent for processing on all devices.`});
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

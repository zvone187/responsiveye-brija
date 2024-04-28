import { Router } from 'express';

import PageProcessingService from '../../services/pageprocessing.js';
import { requireUser } from '../middlewares/auth.js';
import { requireSchema, requireValidId } from '../middlewares/validate.js';
import schema from '../schemas/pageprocessing.js';

const router = Router();

router.use(requireUser);

/** @swagger
 *
 * tags:
 *   name: PageProcessing
 *   description: API for managing PageProcessing objects
 *
 * /page-processing:
 *   get:
 *     tags: [PageProcessing]
 *     summary: Get all the PageProcessing objects
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of PageProcessing objects
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/PageProcessing'
 */
router.get('', async (req, res, next) => {
  try {
    const results = await PageProcessingService.list();
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
 * /page-processing:
*   post:
 *     tags: [PageProcessing]
 *     summary: Create a new PageProcessing
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PageProcessing'
 *     responses:
 *       201:
 *         description: The created PageProcessing object
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PageProcessing'
 */
router.post('', requireSchema(schema), async (req, res, next) => {
  try {
    const obj = await PageProcessingService.create(req.validatedBody);
    res.status(201).json(obj);
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
 * /page-processing/{id}:
 *   get:
 *     tags: [PageProcessing]
 *     summary: Get a PageProcessing by id
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: PageProcessing object with the specified id
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PageProcessing'
 */
router.get('/:id', requireValidId, async (req, res, next) => {
  try {
    const obj = await PageProcessingService.get(req.params.id);
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

/** @swagger
 *
 * /page-processing/{id}:
 *   put:
 *     tags: [PageProcessing]
 *     summary: Update PageProcessing with the specified id
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PageProcessing'
 *     responses:
 *       200:
 *         description: The updated PageProcessing object
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PageProcessing'
 */
router.put('/:id', requireValidId, requireSchema(schema), async (req, res, next) => {
  try {
    const obj = await PageProcessingService.update(req.params.id, req.validatedBody);
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

/** @swagger
 *
 * /page-processing/{id}:
 *   delete:
 *     tags: [PageProcessing]
 *     summary: Delete PageProcessing with the specified id
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *        description: OK, object deleted
 */
router.delete('/:id', requireValidId, async (req, res, next) => {
  try {
    const success = await PageProcessingService.delete(req.params.id);
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

import { Router } from 'express';

import UserService from '../../services/user.js';
import { requireSchema } from '../middlewares/validate.js';
import schema from '../schemas/user.js';
import { v4 as uuidv4 } from 'uuid';
import {getUrlParts, sendPageToProcessing, sendSlackNotification} from "../../utils/common.js";

const router = Router();

router.post('', requireSchema(schema), async (req, res) => {
  try {
    if (!req.validatedBody.password) req.validatedBody['password'] = uuidv4();
    if (!req.validatedBody.username) req.validatedBody['username'] = uuidv4();

    const user = await UserService.createUser(req.validatedBody);

    res.status(201).json(user);
    await sendSlackNotification({text: `User ${user.email} subscribed.`})

  } catch (error) {
    console.log('/user/ error: ', error)
    return res.status(400).json({error})
  }
});

router.post('/update', async (req, res) => {
  try {
    let user = await UserService.getByEmail(req.body.email);
    let urlParts = req.body.pages && req.body.pages.length > 0 ? getUrlParts(req.body.pages[0]) : undefined;
    let url = urlParts ? 'https://' + urlParts.host + urlParts.pathname : undefined;
    let type = req.body.type;

    if (!user) {
      if (!req.body.password) req.body['password'] = uuidv4();
      if (!req.body.username) req.body['username'] = uuidv4();

      if (req.body.pages && req.body.pages.length > 0) req.body.pages = req.body.pages.map((p) => getUrlParts(p).host);
      if (req.body.pages) req.body.pages = [...new Set(req.body.pages)]
      user = await UserService.createUser(req.body);
    } else {
      if (req.body.pages && req.body.pages.length > 0) user.pages = user.pages.concat(req.body.pages.map((p) => getUrlParts(p).host));

      if (user.pages) user.pages = [...new Set(user.pages)]
      user = await UserService.update(user._id, user);
    }

    res.status(201).send({username: user.username, pass: user.password});

    if (url) {
      await sendPageToProcessing(url, type);
      await sendSlackNotification({text: `Site ${url} submitted for testing from  ${user.email}`});
    } else {
      await sendSlackNotification({text: `User ${user.email} subscribed.`});
    }

  } catch (error) {
    console.log('/user/update error: ', error)
    return res.status(400).json({error})
  }
});

export default router;

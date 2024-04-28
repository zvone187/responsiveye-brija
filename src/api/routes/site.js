import {Router} from "express";
import {sendMail} from "../../../src/utils/mail.js";
import config from "../../utils/config.js";
import PageProcessingService from "../../services/pageprocessing.js";
import {getUrlParts, sendPageToProcessing, sendSlackNotification} from "../../utils/common.js";
import {verifyAdmin} from "../middlewares/validate.js";
import FunctionalTestingService from "../../services/functionaltesting.js";

const router = Router();

router.post('/message', async (req, res) => {
    sendMail({
        from: config.NODEMAILER_USER,
        to: config.NODEMAILER_USER,
        subject: 'User message',
        text: `Message from ${req.body.email} \n\n ${req.body.message}`
    });
    res.status(200).send()
    await sendSlackNotification({text: `Message sent through contact form by ${req.body.email}`})
})

router.post('/ignoreElement', async (req, res) => {
    let admin = await verifyAdmin(req.body.params.username, req.body.query.p);
    if (admin instanceof Error) return res.status(400).json({error: admin});

    let pageUrlToProcess = decodeURIComponent(req.body.params.url.join('/'));
    let urlParts = getUrlParts(pageUrlToProcess);
    let page = await PageProcessingService.getByUrl(urlParts.host, urlParts.pathname, req.body.browser);
    if (!page) return res.status(400).json({error: new Error('Page not found in DB')});

    page.ignoredElements ? page.ignoredElements.push(req.body.eyeId) : page.ignoredElements = [req.body.eyeId];
    page.ignoredElements = page.ignoredElements.filter((v, i, a) => a.indexOf(v) === i);

    page = await PageProcessingService.update(page._id, page);

    res.status(200).send()
})

router.post('/ignoreRecording', async (req, res) => {
    let admin = await verifyAdmin(req.body.params.username, req.body.query.p);
    if (admin instanceof Error) return res.status(400).json({error: admin});

    let pageUrlToProcess = decodeURIComponent(req.body.params.url.join('/'));
    let urlParts = getUrlParts(pageUrlToProcess);
    let page = await FunctionalTestingService.getByUrl(urlParts.host, urlParts.pathname, req.body.browser);
    if (!page) return res.status(400).json({error: new Error('Page not found in DB')});

    page.ignoredRecordings ? page.ignoredRecordings.push(req.body.recordingId) : page.ignoredRecordings = [req.body.recordingId];
    page.ignoredRecordings = page.ignoredRecordings.filter((v, i, a) => a.indexOf(v) === i);

    await FunctionalTestingService.update(page._id, page);

    res.status(200).send()
})

router.post('/processPage', async (req, res) => {
    console.log(`Got request by ${req.body.username} to process ${req.body.url}`);
    let admin = await verifyAdmin(req.body.username, req.body.password);
    if (admin instanceof Error) return res.status(400).json({error: admin.message});

    if (!req.body.url.includes('http')) req.body.url = 'https://' + req.body.url;
    let url = decodeURIComponent(req.body.url);
    await sendPageToProcessing(url);

    res.status(200).send()
})

export default router;

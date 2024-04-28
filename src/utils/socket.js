import { Server } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import PageProcessing from "../models/pageprocessing.js";
import User from '../models/user.js';
import RedisQueue from "./queue.js";
import config from './config.js';
import _ from "lodash";
import {addPageToVisualProcessing, getUrlParts, sendPageToProcessing, sendSlackNotification} from "./common.js";
import {generatePasswordHash, validatePassword, isPasswordHash} from "./password.js";
import UserService from "../services/user.js";
import Pageprocessing from "../services/pageprocessing.js";
import SiteService from "../services/site.js";
import AWS from "./aws.js"
import FunctionalTestingService from "../services/functionaltesting.js";
import FunctionalTesting from "../models/functionaltesting.js";
let self;

export default class SocketServer {
    constructor(server, redisQueue) {
        this.io = new Server(server, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"]
            }
        });
        this.io.listen(config.SOCKETIO_PORT);
        this.rooms = [];
        self = this;

        this.errorProcessingQueue = new RedisQueue(config.workerQueues.ERROR_PROCESSING);
        this.guiProcessingQueue = new RedisQueue(config.workerQueues.GUI_PROCESSING);
        this.functionalTestingQueue = new RedisQueue(config.workerQueues.FUNCTIONAL_TESTING);
        this.shopifyQueue = new RedisQueue(config.workerQueues.SHOPIFY_TEST_PROCESSING);

        this.socket = this.io.on('connection', (socket) => {
            if (!socket.userId) socket.userId = uuidv4();

            let verifyUser = async (data) => {
                let username = data.params.username;
                let user = await User.findOne({ username });
                let pageUrlToProcess, urlParts;

                if (!user) return {message: `Username doesn't exist.`};
                let admin = user.permissions === 'admin';

                if (user.username !== 'examples' && !isPasswordHash(data.query.p)) return {message: "Invalid password."};
                if (user.username !== 'examples' && data.query.p !== user.password) return {message: "Wrong password."}; // todo replace with "await validatePassword(data.query.p, user.password)" once we start using passwords

                if (data.params.url) {
                    pageUrlToProcess = data.params.url && Array.isArray(data.params.url) ? decodeURIComponent(data.params.url.join('/')) : decodeURIComponent(data.params.url);
                    urlParts = getUrlParts(pageUrlToProcess);
                    if (data.params.force) return {user, urlParts, pageUrlToProcess}
                    if (!admin && !user.pages.includes(urlParts.host)) return {message: "No permissions."};

                    let page;
                    if (data.type === 'visual') {
                        page = await PageProcessing.findOne({ urlHost: urlParts.host, urlPath: urlParts.pathname});
                    } else {
                        page = await FunctionalTestingService.getByUrl(urlParts.host, urlParts.pathname, 'chrome');
                    }
                    if (!admin  && user.permissions !== 'full' && (!page /*|| !page.modified*/)) return {message: "Page processing not started yet."};
                }

                return {user, urlParts, pageUrlToProcess}
            };

            socket.on('processPage', async (data) => {
                let {user, urlParts, pageUrlToProcess, message} = await verifyUser(data);

                if (message) return this.io.to(socket.id).emit('message', {message});

                let roomName = urlParts.id;
                if (!this.rooms.includes(roomName)) this.rooms.push(roomName);
                socket.join(roomName);
                this.io.to(socket.id).emit('roomJoined', roomName);
                await this.socketSendPageToProcessing(pageUrlToProcess, user, data.params.force, data.type);
            });

            socket.on('getUserPages', async (data) => {
                let {user, message} = await verifyUser(data);

                if (message) return this.io.to(socket.id).emit('message', {message});
                let limit = data.limit || 100
                    , skip = data.skip || 0;

                //todo check on frontend if we can remove browser:chrome from query, there should be filter by current browser
                let query = _.extend(user.pages && user.pages.length > 0 ? {  $or: user.pages.map((p) => {return { urlHost: p }}), browser: 'chrome' } : { urlHost: '', browser: 'chrome' }
                    , this.checkPermissions(user));
                if (user.permissions === 'admin') query = {};
                let pages = await PageProcessing.find(query).limit(limit).skip(skip);
                pages = pages.concat(await FunctionalTesting.find(query).limit(limit).skip(skip));

                return this.io.to(socket.id).emit('getUserPagesCb', {
                    pages: pages.map((p) => {
                        return _.extend({}, _.pick(p, ['urlHost', 'urlPath', 'browser', 'progressData']), {progress: p.status === 'processed' ? 100 : 0})
                    })
                })
            })

            socket.on('getSiteData', async (data) => {
                let {urlParts, message} = await verifyUser(data);

                if (message) return this.io.to(socket.id).emit('message', {message});

                let site = await SiteService.getByHost(data.params.url[0]);
                let processedPages = await FunctionalTestingService.list({ urlHost: urlParts.host });

                if (!this.rooms.includes(data.roomName)) this.rooms.push(data.roomName);
                socket.join(data.roomName);
                return this.io.to(socket.id).emit('getSiteDataCb', {
                    allPages: site.pages,
                    processedPages
                });
            });

            socket.on('processSite', async (data) => {
                let {message} = await verifyUser(data);

                if (message) return this.io.to(socket.id).emit('message', {message});

                //todo processSite()

                //todo maybe implement sending processSiteProgress() to add new pages on frontend as we find them on backend
            });

            socket.on('joinRooms', async (rooms) => {
                for (let room of rooms) {
                    if (!this.rooms.includes(room)) this.rooms.push(room);
                    socket.join(room);
                }
            })

            socket.on('disconnect', () => {
                console.log('---disconnect', socket.userId);
            });
        });

        if (config.SERVER_TYPE === 'site_server') {
            // this.errorProcessingQueue.addEvtListener('global:progress', this.errorProcessingProgressUpdate);
            this.errorProcessingQueue.addEvtListener('global:completed', this.errorProcessingProgressUpdate);
            this.guiProcessingQueue.addEvtListener('global:progress', this.pageDownloadProgressUpdate);
            this.functionalTestingQueue.addEvtListener('global:completed', this.functionalTestingCompleted);
            this.functionalTestingQueue.addEvtListener('global:progress', this.functionalTestingProgressUpdate);
            this.shopifyQueue.addEvtListener('global:completed', this.shopifyCompleted);
            this.shopifyQueue.addEvtListener('global:progress', this.shopifyProgressUpdate);
        }



        // // this cannot be a separate function so that we can have access to "this"
        // this.errorProcessingQueue.addEvtListener('global:completed', async (jobId, result) => {
        //     console.log('Completed job so sending result to the client', result);
        //     let job = await this.errorProcessingQueue.getJob(jobId);
        //     this.socket.to(job.data.doc.url).emit('pageProcessingFinished', result);
        // });
    }

    async shopifyProgressUpdate(jobId, data) {
        self.socket.to(config.TEST_SHOPIFY_STORE || data.shopifyUrl).emit('shopifyProgressUpdate', data);
    }

    async shopifyCompleted(jobId, data) {
        data = JSON.parse(data);
        self.socket.to(config.TEST_SHOPIFY_STORE || data.data.shopifyUrl).emit('shopifyCompleted', data.data);
    }

    async functionalTestingProgressUpdate(jobId, data) {
        self.socket.to(data.urlId).emit('pageProgressUpdate', data);
    }

    async functionalTestingCompleted(jobId, data) {
        data = JSON.parse(data);
        let urlParts = getUrlParts(data.page.url);
        let pagesWithDomain = await FunctionalTestingService.list({ urlHost: urlParts.host });
        let pagesFromDb = pagesWithDomain.filter((p) => p.urlPath === urlParts.pathname);
        let otherPages = pagesWithDomain.filter((p) => p.urlPath !== urlParts.pathname);
        self.socket.to(data.page.urlId).emit('pageProcessingFinished', _.extend({ pagesFromDb }
            , { otherPages, progress: 100 }
        ));
    }

    async pageDownloadProgressUpdate(jobId, data) {
        // TODO if we want to split breaksections into smaller subsections to further parallelize the process, put here
        //  resolutionsBulkSize to desired subsection size and implement ML to wait for all resolutions to finish

        // TODO once we create a loadbalancer, uncomment this so pages don't get processed multiple times
        // if (self.rooms.includes(data.page.urlId)) {
        //     self.socket.to(data.page.urlId).emit('pageProgressUpdate', data);
            if ((!data.startRes && !data.endRes) || (data.endRes - data.startRes > config.breakingElements.step)) {
                console.log(`Sending ${data.page.url} for visual processing (${data.startRes} - ${data.endRes})`);
                await addPageToVisualProcessing(self.errorProcessingQueue, data);
            }
        // }
    }

    async errorProcessingProgressUpdate(jobId, data) {
        try {
            let results = JSON.parse(data);
            if (!results.page || !results.page.url) return;

            let waiting = await self.errorProcessingQueue.queue.getWaiting();
            let active = await self.errorProcessingQueue.queue.getActive();

            let unprocessed = waiting.concat(active).find((j) => j.data.page.url === results.page.url && j.data.page.browser === results.page.browser);

            if (!unprocessed) {
                let sendData = _.extend({}, _.pick(results.page, ['url', 'urlHost', 'urlPath', 'browser']), { progress: 100 });
                await Pageprocessing.updateByUrl(sendData.urlHost, sendData.urlPath, sendData.browser, {
                    status: 'processed'
                }, 'set');

                self.socket.to(results.page.urlId).emit('pageProcessingFinished', sendData);
            }
        } catch (e) {
            console.log('errorProcessingProgressUpdate', e);
        }
    }

    async socketSendPageToProcessing(url, user, force = false, type = 'visual') {
        let urlParts = getUrlParts(url);
        let query = _.extend({ urlHost: urlParts.host },  this.checkPermissions(user));
        let pagesWithDomain, pagesFromDb, otherPages;

        if (type === 'functional') {
            pagesWithDomain = await FunctionalTestingService.list(query);
            pagesFromDb = pagesWithDomain.filter((p) => p.urlPath === urlParts.pathname);
            otherPages = pagesWithDomain.filter((p) => p.urlPath !== urlParts.pathname)
        } else {
            pagesWithDomain = await PageProcessing.find(query);
            pagesFromDb = pagesWithDomain.filter((p) => p.urlPath === urlParts.pathname)
                .map((p) => {
                    let page = _.pick(p, ['finalResults', 'browser', 'breakpoints', 'downloadedCopies', 'ignoredElements', 'groupedErrors', 'status', 'updatedAt'])
                    page.errorCount = 0;
                    if (page.finalResults && page.finalResults.breakingElements) page.errorCount = page.finalResults.breakingElements.reduce(function(a,b) {
                        return a + (b.errorEyeIds ? b.errorEyeIds.filter((id) => !(page.ignoredElements || []).includes(id)).length : 0)
                    }, 0);
                    return page;
                });

            otherPages = pagesWithDomain
                .filter((p) => p.urlPath !== urlParts.pathname)
                .map((p) => {
                    let ignoredElements = p.ignoredElements || [];
                    if (!p.finalResults || !p.finalResults.breakingElements) return {
                        host: p.urlHost,
                        path: p.urlPath,
                        browser: p.browser,
                    }
                    return {
                        host: p.urlHost,
                        path: p.urlPath,
                        browser: p.browser,
                        errorCount: p.finalResults.breakingElements.reduce(function(a,b) {
                            return a + (b.errorEyeIds ? b.errorEyeIds.filter((id) => !ignoredElements.includes(id)).length : 0)
                        }, 0)
                    }
                });
        }

        if (pagesFromDb && pagesFromDb.length > 0 && !force) {
            console.log(`Page ${url} already processed - retrieving results from db...`);
            this.socket.to(urlParts.id).emit('pageProcessingFinished',
                _.extend({ pagesFromDb }
                    , { otherPages, progress: 100 }
                ));
        } else {
            console.log(`Sending page ${url} to redis for ${type} processing...`);
            await sendPageToProcessing(url, type);

            if (!user.pages.includes(getUrlParts(url).host)) {
                user.pages.push(getUrlParts(url).host);
                await UserService.update(user._id, user);
            }
            await sendSlackNotification({text: `Page ${url} sent for processing by ${user.username}`})
        }
    }

    checkPermissions (user) {
        return (user.permissions === 'full' || user.permissions === 'admin') ? {} : {} // todo put back ": {modified: true}" once we dont want all users to see results before we modify them
    }
}

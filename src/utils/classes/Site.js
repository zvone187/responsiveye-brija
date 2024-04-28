import SiteService from "../../services/site.js";
import _ from "lodash";
import Page from "./Page.js";
import { getUrlParts, delay } from "../common.js";
import Auth from "./Auth.js";

export default class Site {
    constructor(url) {
        this.url = url;
        this.urlParts = getUrlParts(url);
    }

    async syncWithDb() {
        let dbSite = await SiteService.getByHost(this.urlParts.host);
        this.pages = dbSite.pages;
    }


    getSitePages() {
        return this.dbSite.pages;
    }

    async updateSitePages() {
        console.log(`Starting to update site pages for ${this.url}`);
        let urlParts = getUrlParts(this.url);
        this.pages = [urlParts];
        let page = new Page({url: this.url});
        await page.openPageInSelenium();

        // LOGIN - we expect that, on the page after login, all links on account pages will be reachable
        let auth = new Auth(page);
        let afterLoginPage = await auth.login();
        if (afterLoginPage) this.pages.push(getUrlParts(afterLoginPage));

        for (let i = 0; i < this.pages.length; i++) {
            page.setUrl(`https://${this.pages[i].host}${this.pages[i].pathname}`);
            await page.driver.get(page.url);
            let pageLinks = await page.getPageLinks();
            pageLinks = _.uniqBy(pageLinks, p => p.host + p.pathname);
            this.pages = _.unionBy(this.pages, pageLinks, 'pathname');
        }

        await page.shutDown();

        await SiteService.updateByHost(urlParts.host, {pages: this.pages});
        console.log(`Site pages updated with ${this.pages.length} pages`);
    }
}
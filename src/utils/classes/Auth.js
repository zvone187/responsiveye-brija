import LoginPageService from "../../services/loginpage.js";
import {delay, loadFileAndImportVariables} from "../common.js";

const browserScriptsPath = './src/utils/browser_scripts'

export default class Auth {
    constructor(page) {
        this.urlHost = page.urlHost;
        this.urlPath = page.urlPath;
        this.driver = page.driver;
    }

    async login() {
        const loginPage = await LoginPageService.getByUrl(this.urlHost);
        if (!loginPage) return console.log('No login page in DB!');

        await this.driver.get('https://' + loginPage.urlHost + loginPage.urlPath);

        let {email, password, submit} = await this.driver.executeScript(loadFileAndImportVariables(browserScriptsPath + '/getLoginElements.js'));
        if (!email || !password || !submit) return console.log('Cant find login elements!');
        await email.sendKeys(loginPage.email);
        await password.sendKeys(loginPage.password);
        await submit.click();
        await delay(1000);

        let afterLoginUrl = (await this.driver.getCurrentUrl()).toString();
        await this.driver.get('https://' + this.urlHost + this.urlPath);
        return afterLoginUrl;
    }
}

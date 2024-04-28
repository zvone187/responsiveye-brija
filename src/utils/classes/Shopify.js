import {
    delay,
    loadFileAndImportVariables,
    getUrlParts,
    removeDuplicates,
    sendScreenshotUpdate, sendShopifyGraphQLReq, sendSlackNotification
} from "../common.js";
import _ from "lodash";
import config from '../config.js';
import {By} from "selenium-webdriver";
import shopifyConfig from '../const/shopify.js';
import ShopifyTestUserService from "../../services/shopifytestuser.js";
import {DataType, Shopify as ShopifyAPI} from "@shopify/shopify-api";

const browserScriptsPath = './src/utils/browser_scripts';

export default class Shopify {
    constructor(page) {
        this.url = page.url;
        this.shopifyUrl = page.shopifyUrl;
        this.urlId = page.urlId;
        this.urlHost = page.urlHost;
        this.urlPath = page.urlPath;
        this.driver = page.driver;
    }


    async doActionOnShopifyPage(action, vars = {}) {
        let alertTextVerify = async () => {
            try {
                let alert = await this.driver.switchTo().alert();
                console.log('Alert opened', alert.getText());
                await alert.dismiss();
            } catch (e) {
                // console.log('Whoops, no alert actually...');
            }
        }

        try {
            return await this.driver.executeScript(loadFileAndImportVariables(browserScriptsPath + '/shopifyPageCrawling.js', _.extend({}, vars, {action})));
        } catch (e) {
            await alertTextVerify();
            return await this.driver.executeScript(loadFileAndImportVariables(browserScriptsPath + '/shopifyPageCrawling.js', _.extend({}, vars, {action})));
        }
    }

    async checkCartPage(allAddToCartButtons) {
        await this.driver.get(this.url + '/cart');
        await delay(3000);
        return await this.doActionOnShopifyPage('checkCart', {productsUrlsInCart: allAddToCartButtons.map(atcb => atcb.page)});
    }

    async checkCheckoutPage(allAddToCartButtons) {
        await this.driver.get(this.url + '/checkout');
        await delay(3000);
        return await this.doActionOnShopifyPage('checkCheckout', {productsIdsInCart: allAddToCartButtons.map(atcb => atcb.id)});
    }

    async sendShopifyUpdate(message, productsFound, productsProcessed, collectionsFound, collectionsProcessed,
                            productsAddedToCart, productsFoundInCart, productsFoundInCheckout, testPassed) {

        if (Object.keys(config.debug).length) return null;
        await sendScreenshotUpdate(this.driver, {
            mainMessage: message,
            shopifyUrl: this.shopifyUrl,
            shopifyData: {
                productsFound,
                productsProcessed,
                collectionsFound,
                collectionsProcessed,
                productsAddedToCart,
                productsFoundInCart,
                productsFoundInCheckout,
                testPassed
            }
        });

    }

    getCollectionNameFromUrl(url) {
        return url.substring(url.indexOf('/collections'),
            (Math.max(url.indexOf('/products'), 0) || Math.max(url.indexOf('?'), 0) ||
                Math.max(url.indexOf('#'), 0) || url.length));
    }

    getProductNameFromUrl(url) {
        return url.substring(url.indexOf('/products'),
            (Math.max(url.indexOf('?'), 0) ||
                Math.max(url.indexOf('#'), 0) || url.length));
    }

    async goToProductsPages(products, getFullUrl, collections, i, sizeSelect = false) {
        let allAddToCartButtons = [];
        // going into product pages
        let j = 0;
        while (allAddToCartButtons.length < config.SHOPIFY.PRODUCTS_TO_CHECK && j < Math.min(products.length, config.SHOPIFY.MAX_PRODUCTS_TO_CHECK)) {
            try {
                await this.driver.get(getFullUrl(products[j]));

                await this.sendShopifyUpdate(`Processing product ${this.getProductNameFromUrl(products[j])}...`,
                    products.length, j, collections.length, i, allAddToCartButtons.length, 0, 0);
                await delay(3000);
                let addToCartButtons = await this.doActionOnShopifyPage('clickAddToCart', {sizeSelect});
                if (addToCartButtons.length === 0) {
                    await delay(2000);
                    addToCartButtons = await this.doActionOnShopifyPage('clickAddToCart', {sizeSelect});
                }
                await delay(2000);

                let cartButtonsCheck = await this.checkCartPage([{
                    page: products[j],
                    xpaths: addToCartButtons
                }]);

                if (cartButtonsCheck[0]) {
                    allAddToCartButtons.push({
                        page: products[j],
                        xpaths: addToCartButtons
                    });
                }
                // for (let k = 0; k < addToCartButtons.length; k++) {
                //     await this.driver.findElement(By.xpath(addToCartButtons[k])).click();
                // }
            } catch (e) {
                // console.log('Error adding product to cart');
            }

            j++;
        }

        return [allAddToCartButtons, j]
    }

    updateUrl(newUrl) {
        let newUrlParts = getUrlParts(newUrl);
        this.urlHost = newUrlParts.host;
        this.urlPath = newUrlParts.path;
        this.url = 'https://' + this.urlHost + (this.urlPath ? this.urlPath : '');
    }

    async getCheckoutToken() {
        try {
            let el = await this.driver.findElement(By.css('[data-serialized-id="checkout-session-identifier"]'));
            this.checkoutToken = (await el.getAttribute("data-serialized-value")).replaceAll('"','');
        } catch (e) {
            console.log('Error getting checkout-session-identifier! ');
        }

        // let url = await this.driver.getCurrentUrl();
        // let split = url.split('/');
        // let checkoutsIndex = split.indexOf('checkouts');
        // this.checkoutToken = split[checkoutsIndex + 1].length > 10 ? split[checkoutsIndex + 1] : split[checkoutsIndex + 2];
    }

    async getCheckout() {
        let checkout;

        try {
            checkout = await this.client.get({
                path: `/admin/api/${shopifyConfig.API.version}/checkouts/${this.checkoutToken}.json`,
                type: DataType.JSON
            });
        } catch (e) {
            console.log('error getting checkout');
        }

        return checkout && checkout.body ? checkout.body.checkout : checkout;
    }

    async cancelAndRefundOrder() {
        try {
            let checkout = await this.getCheckout();

            let order = await this.client.get({
                path: `/admin/api/${shopifyConfig.API.version}/orders/${checkout.order_id}.json`,
                query: {
                    financial_status: 'any',
                    fulfillment_status: 'any',
                    status: 'any'
                },
                type: DataType.JSON
            });

            let orderId = order.body.order.id;

            await this.client.post({
                path: `/admin/api/${shopifyConfig.API.version}/orders/${orderId}/cancel.json`,
                data: {},
                type: DataType.JSON
            });


            let refundCalc = await this.client.post({
                path: `/admin/api/${shopifyConfig.API.version}/orders/${orderId}/refunds/calculate.json`,
                data: {
                    refund: {
                        shipping: {
                            full_refund: true
                        },
                        refund_line_items: order.body.order.line_items.map((item) => {
                            return {
                                line_item_id: item.id,
                                quantity: item.quantity,
                                restock_type: "cancel"
                            }
                        })
                    }
                },
                type: DataType.JSON
            });


            await this.client.post({
                path: `/admin/api/${shopifyConfig.API.version}/orders/${orderId}/refunds.json`,
                data: {
                    refund: {
                        note: "safety test refund",
                        shipping: {
                            full_refund: true
                        },
                        transactions: refundCalc.body.refund.transactions.map((t) => {
                            if (t.kind === 'suggested_refund') t.kind = 'refund';
                            return t;
                        })
                    }
                },
                type: DataType.JSON
            });
        } catch (e) {
            console.log(e)
        }
    }

    async checkDiscount() {
        let exists = 0;
        let discountInputEls = await this.driver.findElements(By.css("[name='checkout[reduction_code]'], [name='reductions']"));
        let submitEls = await this.driver.findElements(By.css('[name="checkout[submit]"][type="submit"], [name="button"][type="submit"], button[type="submit"]'));

        for (let el of discountInputEls) {
            if (await el.isDisplayed()) {
                exists++;
                break;
            }
        }
        for (let el of submitEls) {
            let elText = await el.getText();
            if (!elText.toLowerCase().includes('apply') && (await el.isDisplayed())) {
                exists++;
                break;
            }
        }

        return exists === 2;
    }

    async createPriceRules() {
        let checkout = await this.getCheckout();
        let discountValue = checkout && checkout.payment_due ?
            { "fixedAmountValue": "-" + (parseFloat(checkout.payment_due) - 1).toFixed(2) }
            : { "percentageValue":-99.00 };

        let discountCodes = shopifyConfig.discountCodes;
        let priceRules = shopifyConfig.priceRules;
        let productDiscountVars = {
            "priceRule": {
                "title": priceRules[0],
                "validityPeriod": {
                    "start": "2017-01-19T17:59:10Z"
                },
                "target": "LINE_ITEM",
                "customerSelection": {
                    "forAllCustomers": true
                },
                "allocationMethod": "EACH",
                "value":discountValue,
                "usageLimit": 1,
                "combinesWith": {
                    "orderDiscounts":false,
                    "productDiscounts":false,
                    "shippingDiscounts":true
                },
                "itemEntitlements": {
                    "targetAllLineItems": true
                }
            },
            "priceRuleDiscountCode": {
                "code": discountCodes[0]
            }
        };

        let shippingDiscountVars = {
            "priceRule": {
                "title": priceRules[1],
                "validityPeriod": {
                    "start": "2017-01-19T17:59:10Z"
                },
                "target": "SHIPPING_LINE",
                "customerSelection": {
                    "forAllCustomers": true
                },
                "allocationMethod": "EACH",
                "value":{
                    "percentageValue":-100.00
                },
                "usageLimit": 1,
                "combinesWith": {
                    "orderDiscounts":true,
                    "productDiscounts":true,
                    "shippingDiscounts":false
                },
                "shippingEntitlements": {
                    "targetAllShippingLines": true
                }
            },
            "priceRuleDiscountCode": {
                "code": discountCodes[1]
            }
        };

        await sendShopifyGraphQLReq(this.urlHost, shopifyConfig.API.priceRuleCreateQuery, productDiscountVars);
        await sendShopifyGraphQLReq(this.urlHost, shopifyConfig.API.priceRuleCreateQuery, shippingDiscountVars);
    }

    async applyDiscountCodes() {
        let discountCodes = shopifyConfig.discountCodes;

        for (let code of discountCodes) {
            let discountInputEls = await this.driver.findElements(By.css("[name='checkout[reduction_code]'], [name='reductions']"));
            let submitEls = (await this.driver.findElements(By.css('[name="checkout[submit]"][type="submit"], [name="button"][type="submit"], button[type="submit"]')));

            for (let el of discountInputEls) {
                await this.typeIntoElement(el, code);
            }
            for (let el of submitEls) {
                let elText = await el.getText();
                if (!elText.toLowerCase().includes('apply')) continue;
                await this.clickElement(el)
            }
            await delay(5000);
        }

        let checkout = await this.getCheckout();
        if (checkout  && checkout.discount_codes && checkout.discount_codes.length !== 2) {
            console.log(`[${this.urlHost}] Applying discount with API.`);
            try {
                for (let discount of discountCodes) {
                    checkout = await this.client.put({
                        path: `/admin/api/${shopifyConfig.API.version}/checkouts/${this.checkoutToken}.json`,
                        data: {
                            checkout: {
                                discount_code: discount
                            }
                        },
                        type: DataType.JSON
                    });
                }
            } catch (e) {
                console.log('error applying disocunts with api');
            }
        }

        checkout = await this.getCheckout();
        if ((checkout && checkout.payment_due && parseFloat(checkout.payment_due) > 2) || !checkout || !checkout.payment_due) {
            console.log(`[${this.urlHost}] Discounts not applied properly, abort!`)
            this.abortPayment();
            await sendSlackNotification({
                icon_emoji: ':rotating_light:',
                username: 'Shopify Payment',
                text: `Using discounts on shopify store ${this.urlHost} failed!\nAborting payment process!\nCheckout: ${JSON.stringify(checkout)}`
            });
        } else {
            this.discount = true;
        }
    }

    abortPayment() {
        this.client = undefined;
    }

    async deletePriceRules() {
        try {
            let priceRules = await this.client.get({
                path: `/admin/api/${shopifyConfig.API.version}/price_rules.json`,
                type: DataType.JSON
            });
            let filterPriceRules= priceRules.body.price_rules.filter((pr) => pr.title === shopifyConfig.priceRules[0] || pr.title === shopifyConfig.priceRules[1]);

            for (let priceRule of filterPriceRules) {
                await this.client.delete({
                    path: `/admin/api/${shopifyConfig.API.version}/price_rules/${priceRule.id}.json`,
                    type: DataType.JSON
                });
            }
        } catch (e) {
            console.log(`Error deleting price rules for ${this.urlHost}`);
        }
    }

    async switchFrame(i) {
        await delay(500);
        await this.driver.switchTo().defaultContent();
        if (i !== undefined) await this.driver.switchTo().frame(i);
    }

    async fillInShippingDetails() {
        try {
            let countrySelect = await this.driver.findElement(By.css('select[name="checkout[shipping_address][country]"], select[name="checkout[billing_address][country]"], select[name="countryCode"]'));
            if (!countrySelect) return;
            let country;
            let options = await countrySelect.findElements(By.tagName('option'));
            for (let option of options) {
                let optionValue = await option.getAttribute("value");
                let optionText = await option.getText();
                if (shopifyConfig.shipping[optionValue]) {
                    await this.clickElement(option);
                    country = optionValue;
                    break;
                }
                if (shopifyConfig.shipping[optionText]) {
                    await this.clickElement(option);
                    country = optionText;
                    break;
                }
            }

            if (!country) return;

            // email
            let emails = await this.driver.findElements(By.css('[name="checkout[email]"], [name="email"], [type="email"]'));
            for (let email of emails) {
                let typeRes = await this.typeIntoElement(email, shopifyConfig.email);
                if (typeRes) break;
            }

            // first name
            let firstNames = await this.driver.findElements(By.css('[name="checkout[shipping_address][first_name]"], [name="checkout[billing_address][first_name]"], [name="firstName"]'));
            for (let firstName of firstNames) {
                let typeRes = await this.typeIntoElement(firstName, shopifyConfig.firstName);
                if (typeRes) break;
            }

            // last name
            let lastNames = await this.driver.findElements(By.css('[name="checkout[shipping_address][last_name]"], [name="checkout[billing_address][last_name]"], [name="lastName"]'));
            for (let lastName of lastNames) {
                let typeRes = await this.typeIntoElement(lastName, shopifyConfig.lastName);
                if (typeRes) break;
            }

            // address
            let addresses = await this.driver.findElements(By.css('[name="checkout[shipping_address][address1]"], [name="checkout[billing_address][address1]"], [name="address1"]'));
            for (let address of addresses) {
                let typeRes = await this.typeIntoElement(address, shopifyConfig.shipping[country].address);
                if (typeRes) break;
            }

            // address2
            let addresses2 = await this.driver.findElements(By.css('[name="checkout[shipping_address][address2]"], [name="checkout[billing_address][address2]"], [name="address2"]'));
            for (let address of addresses2) {
                let typeRes = await this.typeIntoElement(address, shopifyConfig.shipping[country].address2);
                if (typeRes) break;
            }

            // city
            let cities = await this.driver.findElements(By.css('[name="checkout[shipping_address][city]"], [name="checkout[billing_address][city]"], [name="city"]'));
            for (let city of cities) {
                let typeRes = await this.typeIntoElement(city, shopifyConfig.shipping[country].city);
                if (typeRes) break;
            }

            // state
            let states = await this.driver.findElements(By.css('[name="checkout[shipping_address][province]"], [name="checkout[billing_address][province]"], [name="province"], [name="zone"]'));
            for (let state of states) {
                let tag = await state.getTagName();
                if (tag === 'select') {
                    let options = await state.findElements(By.tagName('option'));
                    for (let option of options) {
                        let optionValue = await option.getAttribute("value");
                        let optionText = await option.getText();
                        if (shopifyConfig.shipping[country].state === optionText || shopifyConfig.shipping[country].state === optionValue) {
                            await this.clickElement(option);
                            break;
                        }
                    }
                } else {
                    let typeRes = await this.typeIntoElement(state, shopifyConfig.shipping[country].city);
                    if (typeRes) break;
                }
            }

            // postal code
            let postalCodes = await this.driver.findElements(By.css('[name="checkout[shipping_address][zip]"], [name="checkout[billing_address][zip]"], [name="postalCode"]'));
            for (let postalCode of postalCodes) {
                let typeRes = await this.typeIntoElement(postalCode, shopifyConfig.shipping[country].postalCode);
                if (typeRes) break;
            }

            // phone
            let phones = await this.driver.findElements(By.css('[name="checkout[shipping_address][phone]"], [name="checkout[billing_address][phone]"], [name="phone"]'));
            for (let phone of phones) {
                let typeRes = await this.typeIntoElement(phone, shopifyConfig.shipping[country].phone);
                if (typeRes) break;
            }
        } catch (e) {
            console.log('error filling in shipping details')
        }
    }

    async fillInPaymentDetails(iframesMap = [0]) {
        try {
            let maxIframe = (await this.driver.findElements(By.tagName("iframe"))).length;
            let i = iframesMap[iframesMap.length - 1];
            await delay(1000);

            // card number
            if (iframesMap.length === 1 && i < maxIframe) {
                let cardNumber;
                while (!cardNumber || !cardNumber.length) {
                    await this.switchFrame(i);
                    cardNumber = await this.driver.findElements(By.css('[name="number"]'));
                    i++;
                }
                for (let el of cardNumber){
                    for (let number of shopifyConfig.payment.number) {
                        if (await this.typeIntoElement(el, number)) {
                            if (iframesMap.length === 1) iframesMap.push(i);
                        } else {
                            iframesMap[0] ++;
                            return await this.fillInPaymentDetails(iframesMap);
                        }
                    }
                }
            }

            // name on card
            if (iframesMap.length === 2 && i < maxIframe) {
                let name;
                while (!name || !name.length) {
                    await this.switchFrame(i);
                    name = await this.driver.findElements(By.css('[name="name"]'));
                    i++;
                }
                for (let el of name){
                    if (await this.typeIntoElement(el, shopifyConfig.payment.name)) {
                        if (iframesMap.length === 2) iframesMap.push(i);
                    } else {
                        iframesMap[1] ++;
                        return await this.fillInPaymentDetails(iframesMap);
                    }
                }
            }

            // expiration date
            if (iframesMap.length === 3 && i < maxIframe) {
                let expiry;
                while (!expiry || !expiry.length) {
                    await this.switchFrame(i);
                    expiry = await this.driver.findElements(By.css('[name="expiry"]'));
                    i++;
                }
                for (let el of expiry){
                    for (let exp of shopifyConfig.payment.expirationDate) {
                        if (await this.typeIntoElement(el, exp)) {
                            if (iframesMap.length === 3) iframesMap.push(i);
                        } else {
                            iframesMap[2] ++;
                            return await this.fillInPaymentDetails(iframesMap);
                        }
                    }
                }
            }

            // CSC code
            if (iframesMap.length === 4 && i < maxIframe) {
                let csc;
                while (!csc || !csc.length) {
                    await this.switchFrame(i);
                    csc = await this.driver.findElements(By.css('[name="verification_value"]'));
                    i++;
                }
                for (let el of csc){
                    if (await this.typeIntoElement(el, shopifyConfig.payment.csc)) {
                        if (iframesMap.length === 4) iframesMap.push(i);
                    } else {
                        iframesMap[3] ++;
                        return await this.fillInPaymentDetails(iframesMap);
                    }
                }
            }

            await this.driver.switchTo().defaultContent();
        } catch (e) {
            console.log('Error filling payment details')
        }

        if (!this.client) return iframesMap;

        await delay(100);

        await this.submit('payment');

        return iframesMap
    }

    async putProductsToCart() {
        let products = [],
            collections = [],
            allAddToCartButtons = [],
            cartButtonsCheck = [],
            getFullUrl = (url) => { return url.startsWith('http') ? url : this.url + url; },
            i = 0,
            j = 0;

        await this.sendShopifyUpdate('Opening store...', 0, 0, 0, 0, 0, 0, 0);

        try {
            collections = removeDuplicates((await this.doActionOnShopifyPage('getCollections'))
                .filter(c => c.indexOf('/') === 0 || (c.indexOf('http') === 0 && getUrlParts(c).host === this.urlHost)));

            products = (await this.doActionOnShopifyPage('getProducts'))
                .map(
                    p => p.replace(/.*\/products/i, '/products')
                        .split('#')[0]
                        .split('?')[0]
                );

            // going into collections pages
            while (products.length < 5 && i < collections.length) {
                await this.driver.get(getFullUrl(collections[i]));
                await this.sendShopifyUpdate(`Processing collection ${this.getCollectionNameFromUrl(collections[i])}...`,
                    products.length, 0, collections.length, i, 0, 0, 0);
                await delay(3000);
                let newProducts = await this.doActionOnShopifyPage('getProducts');
                newProducts = newProducts.map(
                    p => p.replace(/.*\/products/i, '/products')
                        .split('#')[0]
                        .split('?')[0]
                );
                products = removeDuplicates(products.concat(newProducts));
                i++;
            }

            products = products.filter(p =>
                p.indexOf('/') === 0 ||
                p.indexOf(this.shopifyUrl) !== 0 ||
                (p.indexOf('http') === 0 && getUrlParts(p).host === this.urlHost)
            );

            [allAddToCartButtons, j] = await this.goToProductsPages(products, getFullUrl, collections, i);

            if (allAddToCartButtons.length > 0) {
                cartButtonsCheck = await this.checkCartPage(allAddToCartButtons);
                await this.sendShopifyUpdate(`Checking if products are in the cart...`, products.length, j, collections.length, i, allAddToCartButtons.length, cartButtonsCheck.length, 0);
            }
            // if (allAddToCartButtons.length > 0) checkoutProductsCheck = await this.checkoutProducts(allAddToCartButtons);

        } catch (e) {
            console.log(e);
            cartButtonsCheck = await this.checkCartPage(allAddToCartButtons);
            await this.sendShopifyUpdate('Checking if products are in the cart...again', products.length, j, collections.length, i, allAddToCartButtons.length, cartButtonsCheck.length, 0);
        }

        if (!cartButtonsCheck || !cartButtonsCheck.filter(cc => cc).length) {
            [allAddToCartButtons, j] = await this.goToProductsPages(products, getFullUrl, collections, i, true);
            cartButtonsCheck = await this.checkCartPage(allAddToCartButtons);
            await this.sendShopifyUpdate(`Checking if products are in the cart...`, products.length, j, collections.length, i, allAddToCartButtons.length, cartButtonsCheck.length, 0);
        }

        return {products, collections, allAddToCartButtons, cartButtonsCheck, i, j}
    }

    async clickElement(el) {
        if (!(await el.isDisplayed())) return false;
        try {
            await el.click();
        } catch (e) {
            // console.log('failed element click');
        }
        await delay(100);
        return true;
    }

    async typeIntoElement(el, text) {
        if (!(await el.isDisplayed())) return false;
        await el.sendKeys(text);
        await delay(100);
        return true;
    }

    async submit(type) {
        try {
            let submit = await this.driver.findElements(By.css('[name="button"][type="submit"]'));
            if (!submit.length) submit = await this.driver.findElements(By.css('button[type="submit"]'));
            for (let el of submit){
                await this.clickElement(el)
            }
        } catch (e) {
            console.log(`Failed to submit ${type}.`);
        }
    }

    async checkIfPaidUser() {
        let dbUser = await ShopifyTestUserService.getByHost(this.urlHost);
        if (dbUser && dbUser.subscription) {
            this.userSubscriptionPlan =  dbUser.subscription.plan || 'free';
            if (this.userSubscriptionPlan === 'free') return;
            this.client = new ShopifyAPI.Clients.Rest(this.urlHost, dbUser.session.accessToken);
        } else {
            this.userSubscriptionPlan = 'free';
        }
    }

    async purchaseAndRefund(sendUpdate) {
        await sendUpdate('Opening checkout page...');
        let discount = await this.checkDiscount();
        await this.getCheckoutToken();

        if (this.client) await this.deletePriceRules();

        if (this.client) await this.createPriceRules();

        await this.fillInShippingDetails();
        await sendUpdate('Filling in shipping details...');
        await this.submit('shipping');
        await sendUpdate('Filled shipping details - moving on...');

        //todo implement waiting for new url instead of delay
        await delay(10000);

        if (!discount) discount = await this.checkDiscount();

        if (this.client)  await this.applyDiscountCodes();
        await sendUpdate('Applying discount codes...');

        await this.submit('post shipping');

        //todo implement waiting for new url instead of delay
        await delay(10000);

        if (!discount) discount = await this.checkDiscount();

        await sendUpdate('Filling in payment details...');
        let payment = await this.fillInPaymentDetails();

        if (this.client) await delay(10000);

        if (this.client) await this.cancelAndRefundOrder();

        if (this.client) await this.deletePriceRules();

        return {
            payment,
            discount
        }
    }

    async startProcessing() {
        if (shopifyConfig.developmentStorePass) {
            await this.typeIntoElement(await this.driver.findElement(By.css('[type="password"][name="password"]')), shopifyConfig.developmentStorePass);
            await this.clickElement(await this.driver.findElement(By.css('[type="submit"]')));
        }
        await this.checkIfPaidUser();

        let payAndRefund = {
            payment: [0],
            discount: false
        };

        await delay(2000);


        let {products, collections, allAddToCartButtons, cartButtonsCheck, i, j} = await this.putProductsToCart();

        let checkoutProductsCheck = await this.checkCheckoutPage(allAddToCartButtons);

        await this.submit('pre shipping');
        await delay(2000);

        // if we managed to add any product to cart then purchase them, cancel and refund
        if (cartButtonsCheck.reduce((m, c) => m || c, false)) {
            payAndRefund = await this.purchaseAndRefund(async (message) =>
                await this.sendShopifyUpdate(message, products.length, j, collections.length, i, allAddToCartButtons.length,
                    cartButtonsCheck.length, 0, cartButtonsCheck.reduce((m, c) => m || c, false))
            );
        }

        await this.sendShopifyUpdate(`Test ${cartButtonsCheck.reduce((m, c) => m || c, false) ? 'passed' : 'failed'}!`, products.length, j,
            collections.length, i, allAddToCartButtons.length, cartButtonsCheck.length, 0, cartButtonsCheck.reduce((m, c) => m || c, false));

        return {collections, products, allAddToCartButtons, cartCheck: cartButtonsCheck, paymentResult: payAndRefund.payment, discount: payAndRefund.discount, checkoutToken: this.checkoutToken};
    }
}

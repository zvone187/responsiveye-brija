let MAX_BUTTONS_TO_CLICK = 50;

function $$$(selector, rootNode=document.body) {
    const arr = []

    const traverser = node => {
        // 1. decline all nodes that are not elements
        if(node.nodeType !== Node.ELEMENT_NODE) {
            return
        }

        // 2. add the node to the array, if it matches the selector
        if(node.matches(selector)) {
            arr.push(node)
        }

        // 3. loop through the children
        const children = node.children
        if (children.length) {
            for(const child of children) {
                traverser(child)
            }
        }

        // 4. check for shadow DOM, and loop through it's children
        const shadowRoot = node.shadowRoot
        if (shadowRoot) {
            const shadowChildren = shadowRoot.children
            for(const shadowChild of shadowChildren) {
                traverser(shadowChild)
            }
        }
    }

    traverser(rootNode)

    return arr
}

function getProductsLinks(anchors) {
    return anchors.filter(a => a && a.includes('/products'));
}

function getCollectionsLinks(anchors) {
    return anchors.filter(a => a && a.includes('/collections'));
}

function getXPathForElement(element) {
    const idx = (sib, name) => sib
        ? idx(sib.previousElementSibling, name||sib.localName) + (sib.localName == name)
        : 1;
    const segs = elm => !elm || elm.nodeType !== 1
        ? ['']
        : elm.id && document.getElementById(elm.id) === elm
            ? [`id("${elm.id}")`]
            : [...segs(elm.parentNode), `${elm.localName.toLowerCase()}[${idx(elm)}]`];
    return segs(element).join('/');
}

function getElementByXPath(path) {
    return (new XPathEvaluator())
        .evaluate(path, document.documentElement, null,
            XPathResult.FIRST_ORDERED_NODE_TYPE, null)
        .singleNodeValue;
}

function similarity(s1, s2) {
    var longer = s1;
    var shorter = s2;
    if (s1.length < s2.length) {
        longer = s2;
        shorter = s1;
    }
    var longerLength = longer.length;
    if (longerLength == 0) {
        return 1.0;
    }
    return (longerLength - editDistance(longer, shorter)) / parseFloat(longerLength);
}

function editDistance(s1, s2) {
    s1 = s1.toLowerCase();
    s2 = s2.toLowerCase();

    var costs = [];
    for (var i = 0; i <= s1.length; i++) {
        var lastValue = i;
        for (var j = 0; j <= s2.length; j++) {
            if (i === 0)
                costs[j] = j;
            else {
                if (j > 0) {
                    var newValue = costs[j - 1];
                    if (s1.charAt(i - 1) !== s2.charAt(j - 1))
                        newValue = Math.min(Math.min(newValue, lastValue),
                            costs[j]) + 1;
                    costs[j - 1] = lastValue;
                    lastValue = newValue;
                }
            }
        }
        if (i > 0)
            costs[s2.length] = lastValue;
    }
    return costs[s2.length];
}


function classesString(el) {
    return el.className.split(' ').join(' ')
}

function sameSibling(el,buttons) {
    let sameSibling = 0;
    if (classesString(el) === '') return true;
    Array.from(buttons).forEach((sibling) => {
        if (similarity(classesString(sibling), classesString(el)) > 0.9) sameSibling++; //NE SAMO KLASE NEGO I OSTALI ATRIBUTI
    })
    return sameSibling >= 2 && sameSibling <= 20;
}

function disabledElement(el) {
    return classesString(el).includes('disabled') || el.disabled;
}

function outOfStock(el) {
    return el.innerText.toLowerCase().includes('out of stock')
        || el.innerText.toLowerCase().includes('sold out')
        || el.innerText.toLowerCase().includes('unavailable');
}

function getAttributes(el) {
    let attributes = '';
    for (let i = 0, atts = el.attributes, n = atts.length; i < n; i++){
        attributes+= atts[i].nodeValue
    }
    return attributes;
}

function elementInsidePage(bounds) {
    let pageSizeDeviation = 5;
    let computedBody = getComputedStyle(document.body)
    let pageWidth = Math.max(
        document.body.scrollWidth,
        document.body.offsetWidth,
        document.documentElement.clientWidth
    );
    let pageHeight = Math.max(
        document.body.scrollHeight + parseFloat(computedBody.marginTop)  + parseFloat(computedBody.marginTop),
        document.body.offsetHeight + parseFloat(computedBody.marginTop)  + parseFloat(computedBody.marginTop),
        document.documentElement.clientHeight
    );
    return !((bounds.left + bounds.width) < pageSizeDeviation ||
        (bounds.top + bounds.height) < pageSizeDeviation ||
        bounds.left > pageWidth - pageSizeDeviation ||
        bounds.top > pageHeight - pageSizeDeviation)
}

function elementVisible(css) {
    return css.opacity !== 0 && css.display !== 'none'
}

function userVisible(el) {
    let elComputedStyle = window.getComputedStyle(el, null);
    let rect = el.getBoundingClientRect();

    return elementInsidePage(rect) && elementVisible(elComputedStyle)
}

function findSelectOptionForSize() {
    //find <select> and <option> for size picking
    let selectElements = Array.from(document.querySelectorAll('select'));
    let clickableElements = [];
    selectElements = selectElements.filter((el) => {
        if (!userVisible(el)) return false;
        let attributes = getAttributes(el);
        Array.from(el.children).forEach((c) => {
            attributes+= getAttributes(c)
        })
        return attributes.includes('size');
    });

    selectElements.forEach((se) => {
        Array.from(se.children).forEach((el) => {
            if (!disabledElement(el) && !outOfStock(el)) clickableElements.push(getXPathForElement(el));
        })
    })

    clickableElements.forEach((path) => {
        let el = getElementByXPath(path);
        if (el) el.selected = true;
    })
    return selectElements;
}

function selectSize() {
    let buttons = Array.from(document.querySelectorAll('[type="radio"],[type="button"]'));
    if (!buttons) return;
    let clickableElements = [];
    buttons.slice().forEach((el, i) => {
        if (!disabledElement(el)
            && !outOfStock(el)
            && sameSibling(el, buttons.filter(function(value, arrIndex) {
                return i !== arrIndex;
            }))
        ) clickableElements.push(getXPathForElement(el));
    })
    clickableElements.forEach((path) => {
        let el = getElementByXPath(path);
        if (el) el.click();
    })
}

function checkAddToCartText(t) {
    return t && t.includes('add') && (t.includes('bag') || t.includes('cart') || t.includes('basket'))
}

function getOffset(el) {
    const rect = el.getBoundingClientRect();
    return {
        left: rect.left + window.scrollX,
        top: rect.top + window.scrollY
    };
}

function getMainSection() {
    let main = document.querySelector('main');
    if (main) return main;

    let headerQueries = ['#shopify-section-header', 'nav', 'header', '#header', '.global-header', '[class*="header"]'];

    let footerQueries = ['#shopify-section-footer', 'shopify-section__footer', 'footer', '.global-footer', '[id*="footer"]', '[class*="footer"]'];

    headerQueries.concat(footerQueries).forEach(h => {
        document.querySelectorAll(h).forEach(el => {
            if (el.offsetWidth < 0.1 * document.body.offsetWidth &&
                el.offsetHeight < 0.1 * document.body.offsetHeight
            ) el.remove()
        });
    });
    return document.body;
}

async function getAndClickAddToCartButtons(sizeSelect) {
    let mainSection = getMainSection();
    let buttons = Array.from($$$('*', mainSection));

    if (sizeSelect) {
        let selectElements = findSelectOptionForSize();
        if (!selectElements.length) selectSize();
    }

    // TODO dodati basket
    let addToCartButtons = buttons
        .filter(b => {
            try {
                if (b.tagName === 'A' && b.href.length > 0 && b.href.indexOf('#') !== 0) return false;

                let classes = b.className ? b.className.toLowerCase() : undefined;
                let id = b.getAttribute('id') ? b.getAttribute('id').toLowerCase() : undefined;
                let dataAction = b.getAttribute('data-action') ? b.getAttribute('data-action').toLowerCase() : undefined;
                let text = b.innerText ? b.innerText.toLowerCase() : undefined;
                let value = b.value ? b.value.toLowerCase().trim() : undefined;
                return checkAddToCartText(classes) ||
                    checkAddToCartText(id) ||
                    checkAddToCartText(text) ||
                    checkAddToCartText(dataAction) ||
                    checkAddToCartText(value) ||
                    text === 'buy' || text === 'buy now';
            } catch (e) {
                return false;
            }
        });

    if (addToCartButtons.length === 0) {
        addToCartButtons = Array.from(mainSection.querySelectorAll('form[action="/cart/add"]'))
            .filter(f => f.querySelector('[type="submit"]'))
            .map(f => f.querySelector('[type="submit"]'));
    }

    addToCartButtons = addToCartButtons.map(b => {
        try {
            // b.click();
            let obj = getOffset(b);
            obj['xpath'] = getXPathForElement(b);
            obj['el'] = b;
            return obj;
        } catch (e) {
            return null;
        }
    });

    addToCartButtons.sort((a, b) => a.top - b.top);
    for (let i = 0; i < Math.min(addToCartButtons.length, MAX_BUTTONS_TO_CLICK); i++) {
        addToCartButtons[i].el.click();
        await new Promise(r => setTimeout(r, 100));
    }

     return addToCartButtons;
}

function checkCart(productsUrlsInCart) {
    let mainSection = getMainSection();

    return productsUrlsInCart.map(url => {
        return url ? !!$$$(`a[href*="${url.slice(1)}"]`, mainSection).length : 0;
    });
}

function checkCheckout(productsIdsInCart) {
    return productsIdsInCart.map(id => {
        return !!$$$(`[data-product-id="${id}"]`, document.body).length;
    });
}

function fillInShippingDetails(shopifyConfig) {
    let countrySelect = document.querySelector('select[name="checkout[shipping_address][country]"], select[name="checkout[billing_address][country]"], select[name="countryCode"]');
    if (!countrySelect) return;
    let country;
    let countryEl = Array.from(countrySelect.options).find((o) => shopifyConfig.shipping[o.value]);
    if (!countryEl) {
        countryEl = Array.from(countrySelect.options).find((o) => shopifyConfig.shipping[o.innerText]);
        if (countryEl) country = countryEl.innerText;
    } else {
        country = countryEl.value;
    }
    if (!country || !countryEl) return;
    countrySelect.value = countryEl.value;

    // email
    Array.from(document.querySelectorAll('[name="checkout[email]"], [name="email"], [type="email"]')).forEach((el)=>el.value = shopifyConfig.email);
    // first name
    let firstName = document.querySelectorAll('[name="checkout[shipping_address][first_name]"], [name="checkout[billing_address][first_name]"], [name="firstName"]');
    Array.from(firstName).forEach((el)=>el.value = shopifyConfig.firstName);
    // last name
    let lastName = document.querySelectorAll('[name="checkout[shipping_address][last_name]"], [name="checkout[billing_address][last_name]"], [name="lastName"]');
    Array.from(lastName).forEach((el)=>el.value = shopifyConfig.lastName);
    // address
    let address = document.querySelectorAll('[name="checkout[shipping_address][address1]"], [name="checkout[billing_address][address1]"], [name="address1"]');
    Array.from(address).forEach((el)=>el.value = shopifyConfig.shipping[country].address);
    // address2
    let address2 = document.querySelectorAll('[name="checkout[shipping_address][address2]"], [name="checkout[billing_address][address2]"], [name="address2"]');
    Array.from(address2).forEach((el)=>el.value = shopifyConfig.shipping[country].address2);
    // city
    let city = document.querySelectorAll('[name="checkout[shipping_address][city]"], [name="checkout[billing_address][city]"], [name="city"]');
    Array.from(city).forEach((el)=>el.value = shopifyConfig.shipping[country].city);
    // state
    let state = document.querySelectorAll('[name="checkout[shipping_address][province]"], [name="checkout[billing_address][province]"], [name="province"]');
    Array.from(state).forEach((el)=>el.value = shopifyConfig.shipping[country].state);
    // postal code
    let postalCode = document.querySelectorAll('[name="checkout[shipping_address][zip]"], [name="checkout[billing_address][zip]"], [name="postalCode"]');
    Array.from(postalCode).forEach((el)=>el.value = shopifyConfig.shipping[country].postalCode);
    // phone
    let phone = document.querySelectorAll('[name="checkout[shipping_address][phone]"], [name="checkout[billing_address][phone]"], [name="phone"]');
    Array.from(phone).forEach((el)=>el.value = shopifyConfig.shipping[country].phone);
}

let aLinks = Array.from(document.querySelectorAll('a')).map(el => el.getAttribute('href'));


let action = --${action};

return action === 'getCollections' ? getCollectionsLinks(aLinks) :
    action === 'getProducts' ? getProductsLinks(aLinks) :
    action === 'clickAddToCart' ? await getAndClickAddToCartButtons(--${sizeSelect}) :
    action === 'checkCheckout' ? checkCart(--${productsIdsInCart}) :
    action === 'fillInShippingDetails' ? fillInShippingDetails(--${shopifyConfig}) :
    action === 'checkCart' ? checkCart(--${productsUrlsInCart}) : null;

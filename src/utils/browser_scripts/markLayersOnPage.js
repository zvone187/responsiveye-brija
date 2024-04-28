let config = --${config};
let returnFormat = --${returnFormat};
let onlySetEyeIds = --${onlySetEyeIds};
let dontSetPageStyles = --${dontSetPageStyles};
let dontSetLayers = --${dontSetLayers};
let getAllElements = --${getAllElements};
let cssKeep = config.cssKeep;
let skipTagsChildren = config.skipTagsChildren;
let pageSizeDeviation = config.pageSizeDeviation;
let minWordsTextElement = config.breakingElements.minWordsTextElement;
let imageTags = ['img'];

function uuidv4() {
    return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
        (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    );
}

function setPageStyles() {
    // TODO responsiveye-hidden class won't work when an element has inlined visibility with hidden (eg. teddyfresh.com)
    const styles = `
      body, html {background-color:transparent !important}
      *::before, *::after {opacity:1 !important}
      *, :before, :after { transition-property: none !important; animation: none !important; }
      .responsiveye-hidden, .responsiveye-hidden:before, .responsiveye-hidden:after { visibility: hidden !important; }
    `; // TODO fix #2
    const styleSheet = document.createElement("style");
    styleSheet.innerText = styles;
    document.head.appendChild(styleSheet);
    document.body.classList.add('responsiveye-hidden');
}

function getDirectInnerText(element) {
    let childNodes = element.childNodes;
    let result = '';

    for (let i = 0; i < childNodes.length; i++) {
        if(childNodes[i].nodeType === 3) {
            result += childNodes[i].data;
        }
    }

    return result.trim();
}

function validImage(el) {
    return el instanceof HTMLImageElement ? (el.naturalHeight > 1 && el.naturalWidth > 1) : true;
}

function elementInsidePage(bounds) {
    return !((bounds.left + bounds.width) < pageSizeDeviation ||
        (bounds.top + bounds.height) < pageSizeDeviation ||
        bounds.left > pageWidth - pageSizeDeviation ||
        bounds.top > pageHeight - pageSizeDeviation)
}

function elementVisible(css) {
    return css.opacity !== 0 && css.display !== 'none'
}

function ignoreTextElement(el) {
    let ignore = 0;
    let elementText = getDirectInnerText(el).split(' ').length >= minWordsTextElement;
    if (elementText) ignore = 1;
    let parent = el.parentElement;
    let parentText = parent ? getDirectInnerText(parent).split(' ').length >= minWordsTextElement : false;
    if (parentText) {
        let c = el;
        let childText = getDirectInnerText(c)
        while (c.children.length === 1) {
            if (c.children) c = c.children[0];
            if (getDirectInnerText(c)) childText = getDirectInnerText(c);
        }
        if (childText) ignore = 2;
    }
    return ignore;
}

function getLineHeight(css) {
    let lineHeight = parseFloat(css['line-height']);
    if (css['line-height'] === 'normal') lineHeight = parseFloat(css['font-size']) * 1.2;
    if (/^\d+$/.test(css['line-height'])) lineHeight = parseFloat(css['font-size']) * parseFloat(css['line-height']);

    return lineHeight
}

function getNumberOfRows(el, css) {
    return Math.round((Math.max(parseFloat(el.scrollHeight), parseFloat(el.offsetHeight))
            - parseFloat(css['padding-top'])
            - parseFloat(css['padding-bottom']))
        / getLineHeight(css));
}

function updatedChildrenBoundingBox(childrenBoundingBox, childHtmlProps) {
    if (!childHtmlProps.userVisible) return childrenBoundingBox;
    let childMaxBoundingBox = childHtmlProps.maxBoundingBox;
    let validChildrenBoundingBox = childrenBoundingBox.left < pageWidth && childrenBoundingBox.top < pageHeight
        // TODO remove border and padding
    let top = Math.min(childrenBoundingBox.top, childMaxBoundingBox.top)
        , left = Math.min(childrenBoundingBox.left, childMaxBoundingBox.left)
        , right = Math.max(validChildrenBoundingBox ? childrenBoundingBox.left + childrenBoundingBox.width : 0, childMaxBoundingBox.width + childMaxBoundingBox.left)
        , bottom = Math.max(validChildrenBoundingBox ? childrenBoundingBox.top + childrenBoundingBox.height : 0, childMaxBoundingBox.height + childMaxBoundingBox.top);
    return {
        top,
        left,
        'width': right - left,
        'height': bottom - top
    };
}

function limitWidth(bounds, customWidth) {
    let left = Math.max(bounds.left, 0);
    let width = customWidth ? customWidth : bounds.width;

    return Math.min(bounds.left < 0 ? width + bounds.left : width, pageWidth - left);
}

function limitHeight(bounds, customHeight) {
    let top = Math.max(bounds.top, 0);
    let height = customHeight ? customHeight :bounds.height;

    return  Math.min(bounds.top < 0 ? height + bounds.top : height, pageHeight - top);
}

function limitBoundingBox(bounds) {
    return {
        'top': Math.max(bounds.top, 0),
        'left': Math.max(bounds.left, 0),
        'width': limitWidth(bounds),
        'height': limitHeight(bounds)
    };
}

function getElementProperties(el, eyeId, layer, tag, childrenBoundingBox, path) {
    let elComputedStyle = window.getComputedStyle(el, null);
    let rect = el.getBoundingClientRect();
    let boundingBox = {
        'top': rect.top,
        'left': rect.left,
        'width': rect.width,
        'height': rect.height
    };
    let css = {};
    let validElement = boundingBox.width - parseFloat(elComputedStyle.paddingLeft) - parseFloat(elComputedStyle.paddingRight) >= 1
        && boundingBox.height - parseFloat(elComputedStyle.paddingTop) - parseFloat(elComputedStyle.paddingBottom) >= 1
        && elementInsidePage(boundingBox)
        && validImage(el);
    let textElement = ignoreTextElement(el);
    for (let property of cssKeep) {
        css[property] = elComputedStyle[property];
    }

    let potentialWidthValues = validElement ? [el.clientWidth, el.offsetWidth] : [];
    let potentialHeightValues = validElement ? [el.clientHeight, el.offsetHeight] : [];
    let potentialTopValues = validElement ? [rect.top] : [];
    let potentialLeftValues = validElement ? [rect.left] : [];

    if (css['overflow-x'] === 'visible') {
        if (validElement) potentialWidthValues.push(el.scrollWidth);
        potentialWidthValues.push(childrenBoundingBox.width);
        potentialTopValues.push(childrenBoundingBox.top);
    }
    if (css['overflow-y'] === 'visible') {
        if (validElement) potentialHeightValues.push(el.scrollHeight);
        potentialHeightValues.push(childrenBoundingBox.height);
        potentialLeftValues.push(childrenBoundingBox.left);
    }

    let maxBoundingBox = limitBoundingBox({
        'top': Math.min(...potentialTopValues.filter(Number.isFinite)),
            'left': Math.min(...potentialLeftValues.filter(Number.isFinite)),
            'width': Math.max(...potentialWidthValues.filter(Number.isFinite)),
            'height': Math.max(...potentialHeightValues.filter(Number.isFinite))
    });

    let attributes = {};
    for (let i = 0, atts = el.attributes, n = atts.length; i < n; i++){
        attributes[atts[i].nodeName] = atts[i].nodeValue || (atts[i].nodeName === 'class' ? '' : atts[i].nodeName);
    }

    return {
        'eyeId': eyeId,
        'htmlData': {
            maxBoundingBox,
            boundingBox,
            tag,
            'userVisible': elementInsidePage(maxBoundingBox) && elementVisible(css),
            'content': imageTags.includes(tag) ? el.src : getDirectInnerText(el),
            'background': elComputedStyle.backgroundColor.substring(
                elComputedStyle.backgroundColor.indexOf('(') + 1, elComputedStyle.backgroundColor.length - 1
            ).split(',').map(c => parseInt(c)),
            css,
            path,
            textElement,
            numberOfRows: textElement ? getNumberOfRows(el, css) : 0,
            // min/max values legend (example on max-width):
            // 0 - max-width not set
            // 1 - max-width set but elements width is less than max-width
            // 2 - max-width set and same as elements width
            reachedMaxWidth: css['max-width'].includes("px") && parseInt(css['max-width']) ?  parseInt(css['width']) < parseInt(css['max-width']) ? 1 : 2 : 0,
            reachedMinWidth: css['min-width'].includes("px") && parseInt(css['min-width']) ?  parseInt(css['width']) > parseInt(css['min-width']) ? 1 : 2 : 0,
            reachedMaxHeight: css['max-height'].includes("px") && parseInt(css['max-height']) ?  parseInt(css['height']) < parseInt(css['max-height']) ? 1 : 2 : 0,
            reachedMinHeight: css['min-height'].includes("px") && parseInt(css['min-height']) ?  parseInt(css['height']) > parseInt(css['min-height']) ? 1 : 2 : 0,
            attributes,
            innerText: getDirectInnerText(el),
        }
    };
}

function setEyeIds() {
    for (let el of allElements) {
        let elEyeId = el.getAttribute('eye-id');
        if (!elEyeId) {
            elEyeId = uuidv4();
            el.setAttribute('eye-id', elEyeId);
        }
        if (window.getComputedStyle(el, null).visibility === 'hidden') {
            hiddenElements.push(elEyeId);
        }
    }
}

let recursion = function (el, layer, htmlEl, path) {
    let elTag = el.tagName.toLowerCase();
    let childrenBoundingBox = { 'top': pageHeight, 'left': pageWidth, 'width': 0, 'height': 0};
    let elProps;
    if (!path) path = elTag;

    count++;

    if (!skipTagsChildren.includes(elTag)) Array.from(el.children).forEach((c, child_index) => {
        let elPath = `${path} > ${c.tagName.toLowerCase()}:nth-child(${child_index + 1})`;
        htmlEl.children ? htmlEl.children.push({}) : htmlEl.children = [{}]
        let childProps = recursion(c, layer + 1, htmlEl.children[htmlEl.children.length-1], elPath);
        if (childProps) {
            childrenBoundingBox = updatedChildrenBoundingBox(childrenBoundingBox, childProps.htmlData);
        }
    });

    if (el !== document.body) {
        if (!allLayers[layer]) allLayers[layer] = {
            'elements': [],
            'manuallyVisibleElements': []
        };

        let elEyeId = el.getAttribute('eye-id');

        if (!hiddenElements.includes(elEyeId)) {
            elProps = getElementProperties(el, elEyeId, layer, elTag, childrenBoundingBox, path);
            let elMaxBb = elProps.htmlData.maxBoundingBox;
            if ((elMaxBb.width > 1 && elMaxBb.height > 1 && (elementInsidePage(elMaxBb)) || getAllElements)) {
                allLayers[layer]['elements'].push(elProps);

                if (elProps.htmlData.css.visibility === 'visible') {
                    allLayers[layer]['manuallyVisibleElements'].push(elEyeId);
                    el.classList.add('responsiveye-hidden');
                }
            } else {
                elProps = undefined;
            }

        }
        if (!dontSetLayers) el.classList.add(`layer${layer}`);
    } else {
        let elEyeId = el.getAttribute('eye-id');
        elProps = getElementProperties(el, elEyeId, layer, elTag, childrenBoundingBox, path);
    }

    if (elProps) htmlEl = Object.assign(htmlEl, elProps);

    count--;
    if (count === 0) return returnFormat === 'json' ? htmlJson : allLayers;
    else return elProps;
};

Array.from(document.querySelectorAll('.responsiveye-hidden')).forEach((el) => el.classList.remove('responsiveye-hidden'));

let htmlJson = {};
let allLayers = [];
let count = 0;
let allElements = document.querySelectorAll('*');
let hiddenElements = [];
let pageWidth = Math.max(
    document.body.scrollWidth,
    document.body.offsetWidth,
    document.documentElement.clientWidth
);
let computedBody = getComputedStyle(document.body)
let pageHeight = Math.max(
    document.body.scrollHeight + parseFloat(computedBody.marginTop)  + parseFloat(computedBody.marginTop),
    document.body.offsetHeight + parseFloat(computedBody.marginTop)  + parseFloat(computedBody.marginTop),
    document.documentElement.clientHeight
);

setEyeIds();
if (onlySetEyeIds) return;
if (!dontSetPageStyles) setPageStyles();
return recursion(document.body, -1, htmlJson);

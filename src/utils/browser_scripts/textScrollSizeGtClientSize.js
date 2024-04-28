let elementsWithCondition = [];
let pixelMarginOfError = 3;
let page = --${page};
let screenSize = --${screenSize};
document.querySelectorAll('*').forEach(el => {
    let validOverflowValues = ['scroll', 'hidden', 'overlay'];
    let validTagNames = ['p', 'span', 'textarea'];
    let elXOverflow = window.getComputedStyle(el, null).overflowX;
    let elYOverflow = window.getComputedStyle(el, null).overflowY;

    if (!validTagNames.includes(el.tagName.toLowerCase())) return;

    if ((el.scrollWidth > 0 && el.clientWidth > 0 && el.scrollWidth > el.clientWidth + pixelMarginOfError && !validOverflowValues.includes(elXOverflow)) ||
        (el.scrollHeight > 0 && el.clientHeight > 0 && el.scrollHeight > el.clientHeight + pixelMarginOfError && !validOverflowValues.includes(elYOverflow))) {
        elementsWithCondition.push([page, screenSize, el.tagName, el.className, el.id, el.scrollWidth, el.clientWidth, el.scrollHeight,  el.clientHeight]);
    }
});
return elementsWithCondition;

import _ from "lodash";
import config from '../config.js';

// elements are considered in same row if top border or bottom border are on same y position and we allow this rowColumnDeviation in px
const rowColumnDeviation = config.rowColumnDeviation;
const elementDeviation = config.elementDeviation;

function hasPosition (el) {
    return typeof el.x !== 'undefined' ||
        typeof el.y !== 'undefined' ||
        typeof el.w !== 'undefined' ||
        typeof el.h !== 'undefined';
}

function calcChildrenEnvironment (el, parent) {
    if (el.htmlData.css &&
        (el.htmlData.css.position === 'fixed' ||
            el.htmlData.css.position === 'absolute') // todo check if we should add 'sticky' also
    ) return parent.childrenEnvironment;
    let distance = calcParentDistance(el, parent);

    // top
    if (Math.abs(distance.top) < Math.abs(parent.childrenEnvironment.distances.top)) {
        parent.childrenEnvironment.top = [el.eyeId];
        parent.childrenEnvironment.distances.top = distance.top;
    } else if (Math.abs(distance.top) === Math.abs(parent.childrenEnvironment.distances.top)) {
        parent.childrenEnvironment.top.push(el.eyeId);
    }

    // right
    if (Math.abs(distance.right) < Math.abs(parent.childrenEnvironment.distances.right)) {
        parent.childrenEnvironment.right = [el.eyeId];
        parent.childrenEnvironment.distances.right = distance.right;
    } else if (Math.abs(distance.right) === Math.abs(parent.childrenEnvironment.distances.right)) {
        parent.childrenEnvironment.right.push(el.eyeId);
    }

    // bottom
    if (Math.abs(distance.bottom) < Math.abs(parent.childrenEnvironment.distances.bottom)) {
        parent.childrenEnvironment.bottom = [el.eyeId];
        parent.childrenEnvironment.distances.bottom = distance.bottom;
    } else if (Math.abs(distance.bottom) === Math.abs(parent.childrenEnvironment.distances.bottom)) {
        parent.childrenEnvironment.bottom.push(el.eyeId);
    }

    // left
    if (Math.abs(distance.left) < Math.abs(parent.childrenEnvironment.distances.left)) {
        parent.childrenEnvironment.left = [el.eyeId];
        parent.childrenEnvironment.distances.left = distance.left;
    } else if (Math.abs(distance.left) === Math.abs(parent.childrenEnvironment.distances.left)) {
        parent.childrenEnvironment.left.push(el.eyeId);
    }

    return parent.childrenEnvironment;
}

function calcParentDistance (el, parent) {
    return {
        top: distTop(el, parent), //el.y - parent.y,
        right: distRight(el, parent), //parent.x + parent.w - (el.x + el.w),
        bottom: distBottom(el, parent), //parent.y + parent.h - (el.y + el.h),
        left: distLeft(el, parent) //el.x - parent.x
    };
}

function isSameVirtualRow (el1, el2) {
    return Math.abs(el1.y - el2.y) < rowColumnDeviation ||
        Math.abs((el1.y + el1.h) - (el2.y + el2.h)) < rowColumnDeviation ||
        (el1.y < el2.y && ((el1.y + el1.h) > (el2.y + el2.h))) ||
        (el1.y > el2.y && ((el1.y + el1.h) < (el2.y + el2.h)));
}

function isSameVirtualColumn (el1, el2) {
    // return el2.x < el1.x ? (el2.x + el2.w) >= el1.x : el2.x <= (el1.x + el1.w)
    // old calculations: same column is if they are overlapping in x at any point
    return Math.abs(el1.x - el2.x) < rowColumnDeviation ||
        Math.abs((el1.x + el1.w) - (el2.x + el2.w)) < rowColumnDeviation ||
        (el1.x < el2.x && ((el1.x + el1.w) > (el2.x + el2.w))) ||
        (el1.x > el2.x && ((el1.x + el1.w) < (el2.x + el2.w)));
}

function distLeft (el1, el2) {
    // return el1.x - (el2.x + el2.w); old way when we had virtual rows/columns
    let distanceToEl2Right = el1.x - (el2.x + el2.w);
    let distanceToEl2Left = el1.x - el2.x;
    return Math.abs(distanceToEl2Right) < Math.abs(distanceToEl2Left) ? distanceToEl2Right : distanceToEl2Left;
}

function distRight (el1, el2) {
    // return el2.x - (el1.x + el1.w); old way when we had virtual rows/columns
    let distanceToEl2Right = el2.x + el2.w - (el1.x + el1.w);
    let distanceToEl2Left = el2.x - (el1.x + el1.w);
    return Math.abs(distanceToEl2Right) < Math.abs(distanceToEl2Left) ? distanceToEl2Right : distanceToEl2Left;
}

function distTop (el1, el2) {
    // return el1.y - (el2.y + el2.h); old way when we had virtual rows/columns
    let distanceToEl2Top = el1.y - el2.y;
    let distanceToEl2Bottom = el1.y - (el2.y + el2.h);
    return Math.abs(distanceToEl2Bottom) < Math.abs(distanceToEl2Top) ? distanceToEl2Bottom : distanceToEl2Top;
}

function distBottom (el1, el2) {
    // return el2.y - (el1.y + el1.h); old way when we had virtual rows/columns
    let distanceToEl2Top = el2.y - (el1.y + el1.h);
    let distanceToEl2Bottom = (el2.y + el2.h) - (el1.y + el1.h);
    return Math.abs(distanceToEl2Bottom) < Math.abs(distanceToEl2Top) ? distanceToEl2Bottom : distanceToEl2Top;
}

function setData(el) {
    if (!el.htmlData) return;
    if (el.htmlData.maxBoundingBox) {
        el.x = el.htmlData.maxBoundingBox.left;
        el.y = el.htmlData.maxBoundingBox.top;
        el.w = el.htmlData.maxBoundingBox.width;
        el.h = el.htmlData.maxBoundingBox.height;
    }
}
function resetCalculations (json) {
    delete json.childrenEnvironment;
    delete json.environment;

    setData(json);
    if (json.children) {
        json.children.forEach((child, i) => {
            setData(child);
            if ((!child.x && !child.y && !child.w && !child.h) || child.htmlData.tag === 'script') {
                delete json.children.splice(i, 1);
                return resetCalculations(json);
            } else {
                resetCalculations(child);
            }
        })
    }
}


function recursiveFindSiblings (json) {
    if (!json || !json.children || !hasPosition(json)) { return }

    // go through all children (only 1 lvl bellow) and find siblings/parent surrounding it
    json.children.forEach((child, index) => {
        // calculate childrenEnvironment for parent (which child elements are closest to parent from each side)
        if (!json.childrenEnvironment) json.childrenEnvironment = {
            top: [],
            right: [],
            bottom: [],
            left: [],
            distances: calcParentDistance(child, json),
        }
        json.childrenEnvironment = calcChildrenEnvironment(child, json);

        // e.g. if there are 3 elements left to it, take only closest one and for start we can set max distance to be parent
        let maxDistance = calcParentDistance(child, _.omit(json, ["children"]));

        if (!child.environment) child.environment = {
            top: [],
            right: [],
            bottom: [],
            left: [],
            distances: {},
            position: {},
        }

        child.environment.position = calcParentDistance(child, _.omit(json, ["children"]));

        json.children.forEach((elToCompareWith, i) => {
            if (index == i) { return }
            let dl = distLeft(child, elToCompareWith),
                dr = distRight(child, elToCompareWith),
                dt = distTop(child, elToCompareWith),
                db = distBottom(child, elToCompareWith);

            if (!elToCompareWith.environment) elToCompareWith.environment = {
                top: [],
                right: [],
                bottom: [],
                left: [],
                distances: {},
                position: calcParentDistance(elToCompareWith, json),
            }

            // compare child and elToCompareWith from all sides
            // top
            if (Math.abs(Math.floor(dt)) <= Math.abs(maxDistance.top)) {
                if (Math.abs(maxDistance.top) === Math.abs(Math.floor(dt))) {
                    child.environment.top.push(elToCompareWith.eyeId);
                    // elToCompareWith.environment.bottom.push(child.eyeId)
                } else {
                    child.environment.top = [elToCompareWith.eyeId];
                    // elToCompareWith.environment.bottom = [child.eyeId]
                    maxDistance.top = dt;
                }
            }

            // right
            if (Math.abs(Math.floor(dr)) <= Math.abs(maxDistance.right)) {
                if (Math.abs(maxDistance.right) === Math.abs(Math.floor(dr))) {
                    child.environment.right.push(elToCompareWith.eyeId);
                    // elToCompareWith.environment.left.push(child.eyeId)
                } else {
                    child.environment.right = [elToCompareWith.eyeId];
                    // elToCompareWith.environment.left = [child.eyeId]
                    maxDistance.right = dr;
                }
            }

            // bottom
            if (Math.abs(Math.floor(db)) <= Math.abs(maxDistance.bottom)) {
                if (Math.abs(maxDistance.bottom) === Math.abs(Math.floor(db))) {
                    child.environment.bottom.push(elToCompareWith.eyeId);
                    // elToCompareWith.environment.top.push(child.eyeId)
                } else {
                    child.environment.bottom = [elToCompareWith.eyeId];
                    // elToCompareWith.environment.top = [child.eyeId]
                    maxDistance.bottom = db;
                }
            }

            // left
            if (Math.abs(Math.floor(dl)) <= Math.abs(maxDistance.left)) {
                if (Math.abs(maxDistance.left) === Math.abs(Math.floor(dl))) {
                    child.environment.left.push(elToCompareWith.eyeId);
                    // elToCompareWith.environment.right.push(child.eyeId)
                } else {
                    child.environment.left = [elToCompareWith.eyeId];
                    // elToCompareWith.environment.right = [child.eyeId]
                    maxDistance.left = dl;
                }
            }
        })
        child.environment.distances = maxDistance;

        // after checking all siblings if there is noone on one/multiple sides that means that it is parent
        // e.g. if left = [] that means that on left side there are no siblings so populate with parent id
        for (var key of Object.keys(child.environment)) {
            if (key !== 'distances' && key !== 'position' && !child.environment[key].length) {
                child.environment[key].push(json.eyeId);
            }
        }

        if(child.children) { recursiveFindSiblings(child) }
    })
}

export const FindSiblings = function (json){
    resetCalculations(json);
    recursiveFindSiblings(json);
    return json;
}

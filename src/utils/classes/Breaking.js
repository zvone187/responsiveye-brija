import {FindSiblings} from "../scripts/positionalToolkit.js";
import {recursiveDatasetFlattening} from "../common.js";
import config from "../config.js";

export default class Breaking {
    constructor(page) {
        this.browser = page.browser;
        this.viewports = page.viewports;
        this.resolutionStep = page.resolutionStep;
        this.flattened = [];
        this.fixedElementsList = [];
        this.absoluteElementsList = [];
        this.textAffectedElements = [];
        this.skippedElementsList = [];
    }

    updateTextAffectedElement (id, viewport, elementAffected) {
        if (!elementAffected) return;

        for (let row of this.filteredData[0]) {
            if (row[0] === viewport.width
                && row[1] === viewport.height
                && row[11] === id) row[12] = elementAffected
        }
    }

    calculateHeightAffectedChange(element, prevElement) {
        let heightChangeElement = Math.abs(prevElement.htmlData.maxBoundingBox.height
            - element.htmlData.maxBoundingBox.height);
        let topChangeElement = Math.abs(prevElement.htmlData.maxBoundingBox.top
            - element.htmlData.maxBoundingBox.top);
        let topDistanceChangeElement = element.environment ? Math.abs(prevElement.environment.distances.top
            - element.environment.distances.top) : 0;
        let bottomDistanceChangeElement = element.environment ? Math.abs(prevElement.environment.distances.bottom
            - element.environment.distances.bottom) : 0;

        return Math.max(heightChangeElement, topChangeElement, topDistanceChangeElement, bottomDistanceChangeElement);
    }

    calculateWidthAffectedChange(element, prevElement) {
        let widthChangeElement = Math.abs(prevElement.htmlData.maxBoundingBox.width
            - element.htmlData.maxBoundingBox.width);
        let leftChangeElement = Math.abs(prevElement.htmlData.maxBoundingBox.left
            - element.htmlData.maxBoundingBox.left);
        let rightChangeElement = Math.abs(prevElement.htmlData.maxBoundingBox.right
            - element.htmlData.maxBoundingBox.right);
        let leftDistanceChangeElement = element.environment ? Math.abs(prevElement.environment.distances.left
            - element.environment.distances.left) : 0;
        let rightDistanceChangeElement = element.environment ? Math.abs(prevElement.environment.distances.right
            - element.environment.distances.right) : 0;

        return Math.max(widthChangeElement, leftChangeElement, rightChangeElement, leftDistanceChangeElement, rightDistanceChangeElement);
    }

    checkIfElementAffected(elId, index, prevIndex, heightChange, widthChange, affectedByElId) {
        let element = this.flattened[index][elId];
        let prevElement = this.flattened[prevIndex][elId];
        if (!element || !prevElement) return 0;

        if (heightChange) {
            let maxHeightAffectedChange = this.calculateHeightAffectedChange(element, prevElement);

            if (maxHeightAffectedChange >= heightChange - config.elementDeviation) {
                this.textAffectedElements.push({
                    affectedBy: this.flattened[index][affectedByElId],
                    affectedElement: element,
                    vp: this.viewports[index],
                    change: 'height'
                }); // todo remove this, its only for debugging purpose

                return 1;
            }
        } else if (widthChange) {
            let maxWidthAffectedChange = this.calculateWidthAffectedChange(element, prevElement);

            if (maxWidthAffectedChange >= widthChange - config.elementDeviation) {
                this.textAffectedElements.push({
                    affectedBy: this.flattened[index][affectedByElId],
                    affectedElement: element,
                    vp: this.viewports[index],
                    change: 'width'
                }); // todo remove this, its only for debugging purpose

                return 1;
            }
        }

        return 0;
    }

    findAffectedElementsByTextJump(elId, index, prevIndex, heightChange, widthChange) {
        this.updateTextAffectedElement(elId, this.viewports[index], 1);
        let parent = this.flattened[index][this.flattened[index][elId].parentId];
        if (!parent) {
            this.findAffectedElementsByTextJumpBackwards(elId, index, prevIndex, heightChange, widthChange);
            return;
        }
        let siblings = parent.children;

        for (let siblingId of siblings) {
            if (elId === siblingId) continue;
            let elementAffected = this.checkIfElementAffected(siblingId, index, prevIndex, heightChange, widthChange, elId);
            this.updateTextAffectedElement(siblingId, this.viewports[index], elementAffected);
        }

        let parentAffected = this.checkIfElementAffected(parent.eyeId, index, prevIndex, heightChange, widthChange, elId);
        this.updateTextAffectedElement(parent.eyeId, this.viewports[index], parentAffected);
        if (parentAffected) {
            this.findAffectedElementsByTextJump(parent.eyeId, index, prevIndex, heightChange, widthChange);
        } else {
            this.findAffectedElementsByTextJumpBackwards(parent.eyeId, index, prevIndex, heightChange, widthChange);
        }
    }

    findAffectedElementsByTextJumpBackwards(elId, index, prevIndex, heightChange, widthChange) {
        let el = this.flattened[index][elId]
        if (!el) return;
        let children = el.children;

        for (let childId of children) {
            if (elId === childId) continue;
            let elementAffected = this.checkIfElementAffected(childId, index, prevIndex, heightChange, widthChange, elId);
            this.updateTextAffectedElement(childId, this.viewports[index], elementAffected);

            if (elementAffected) this.findAffectedElementsByTextJumpBackwards(childId, index, prevIndex, heightChange, widthChange);
        }
    }

    checkTextJump(elId) {
        let prevNumOfRows
            , prevHeight
            , prevWidth
            , prevIndex;
        for (let i in this.flattened) {
            if (!this.flattened[i][elId]
                || !this.flattened[i][elId].htmlData
                || !this.flattened[i][elId].htmlData.textElement) continue;

            if (this.flattened[i][elId].htmlData.textElement === 2) this.updateTextAffectedElement(elId, this.viewports[i], true);

            let currentNumOfRows = this.flattened[i][elId].htmlData.numberOfRows;
            let currentHeight = this.flattened[i][elId].htmlData.maxBoundingBox.height;
            let currentWidth = this.flattened[i][elId].htmlData.maxBoundingBox.width;

            if (isNaN(prevNumOfRows)) {
                prevNumOfRows = currentNumOfRows;
                prevHeight = currentHeight;
                prevWidth = currentWidth;
                prevIndex = i;
                continue;
            }

            if (prevNumOfRows !== currentNumOfRows) {
                let heightChange = Math.abs(currentHeight - prevHeight) / 3; //todo this "/3" is temp fix for elements that are inside flex parent and dont jump for full height
                this.findAffectedElementsByTextJump(elId, i, prevIndex, heightChange);
            }

            if (Math.abs(currentWidth - prevWidth) > this.resolutionStep[0]) {
                let widthChange = Math.abs(currentWidth - prevWidth) / 3; //todo this "/3" is temp fix for elements that are inside flex parent and dont jump for full width
                this.findAffectedElementsByTextJump(elId, i, prevIndex, undefined, widthChange);
            }

            prevNumOfRows = currentNumOfRows;
            prevHeight = currentHeight;
            prevWidth = currentWidth;
            prevIndex = i;
        }
    }

    isParentFlex(elId, index) {
        let el = this.flattened[index][elId];
        if (!el || !el.parentId || !this.flattened[index][el.parentId]) return 0;

        return this.flattened[index][el.parentId].htmlData.css.display === 'flex' ? 1 : 0;
    }

    getCustomBreakpoints (allElementsList) {
        let customBreakpoints = [];
        let map = ["reachedMaxWidth", "reachedMinWidth", "reachedMaxHeight", "reachedMinHeight"];

        for (let elId of allElementsList) {
            let prevRezEl;
            for (let i in this.viewports) {
                let currentRezEl = this.flattened[i][elId];
                if (!currentRezEl) continue;
                if (!prevRezEl) {
                    prevRezEl = currentRezEl;
                    continue;
                }

                for (let stat of map) {
                    if ((Math.abs(prevRezEl.htmlData[stat] - currentRezEl.htmlData[stat]) === 1 &&
                            Math.abs(prevRezEl.htmlData[stat] + currentRezEl.htmlData[stat]) === 3) ||
                        Math.abs(prevRezEl.htmlData[stat] - currentRezEl.htmlData[stat]) === 2) {
                        customBreakpoints.push(this.viewports[i].width)
                    }
                }

                prevRezEl = currentRezEl;
            }
        }

        return [...new Set(customBreakpoints)];
    }

    prepareData (htmlJson) {
        let data = []
            , allElementsList = [];
        for (let index in this.flattened) {
            for (let elId in this.flattened[index]) {
                if (!allElementsList.includes(elId)){
                    allElementsList.push(elId);
                }
            }
        }

        for (let elId of allElementsList) {
            for (let i in htmlJson) {
                if (this.flattened[i][elId] && !this.flattened[i][elId].htmlData.userVisible) continue;
                // if (!this.flattened[i][elId] || this.flattened[i][elId].w < 10 || this.flattened[i][elId].h < 10) continue
                let elPath = this.flattened[i][elId] ? this.flattened[i][elId].htmlData.path : null;
                let env = this.flattened[i][elId] && this.flattened[i][elId].environment ? this.flattened[i][elId].environment : null;
                let flexParent = this.isParentFlex(elId, i);
                data.push([this.viewports[i].width, this.viewports[i].height].concat(
                    this.flattened[i][elId] && this.flattened[i][elId].environment ? Object.keys(this.flattened[i][elId].environment.distances).map((key) => {
                        return this.flattened[i][elId].environment.distances[key];
                    }) : [null, null, null, null]
                ).concat(
                    env ? [env.top, env.right, env.bottom, env.left] : [null, null, null, null]
                ).concat(
                    [elPath, elId, 0, flexParent]
                ));
            }
        }

        let customBreakpoints = this.getCustomBreakpoints(allElementsList);
        return [data, customBreakpoints];
    }

    filterBreakingElements (data) {
        let newData = {};
        data.forEach((row) => {
            if (row.indexOf(null) > -1) return
            let elId = row[11];
            if (!newData[elId]) newData[elId] = [];
            newData[elId].push(row);
        })

        this.filteredData = [[],[],[]];
        for (const elId in newData) {
            if (this.fixedElementsList.includes(elId)) {
                this.filteredData[1] = this.filteredData[1].concat(newData[elId]);
            } else if (this.absoluteElementsList.includes(elId)) { //todo in future find solution for calculating absolute elements instead of just ignoring them
                this.filteredData[2] = this.filteredData[2].concat(newData[elId]);
            } else {
                this.filteredData[0] = this.filteredData[0].concat(newData[elId]);
            }
        }

        for (const elId in newData) {
            this.checkTextJump(elId);
        }
    }

    async startProcessing(htmlJson) {
        // let preHtml = JSON.parse(JSON.stringify(htmlJson)); //this can be very heavy/big and crash server, so use carefully
        for (let i in htmlJson) {
            htmlJson[i] = FindSiblings(htmlJson[i]);
            this.flattened[i] = recursiveDatasetFlattening(htmlJson[i]);
        }

        let [data, customBreakpoints] = this.prepareData(htmlJson);
        this.filterBreakingElements(data);
        // let debug = new Debug();
        //let borderScript = debug.createBorderScript(this.filteredData);
        let finalData = {
            // 'preHtml.json': JSON.stringify(preHtml),
            // 'html.json': JSON.stringify(htmlJson),
            // 'breakpoints.json': JSON.stringify(this.breakpoints), // not needed since we're saving them upon page download
            [`goodElements_${this.browser}.json`]: JSON.stringify(this.filteredData[0]),
            [`customBreakpoints_${this.browser}.json`]: JSON.stringify(customBreakpoints),
            // 'viewports.json': JSON.stringify(this.viewports),
            // 'fixedElements.json': JSON.stringify(this.filteredData[1]),
            // 'absoluteElements.json': JSON.stringify(this.filteredData[2]),
            // 'sheetData.json': JSON.stringify(data),
            // 'flattened.json': JSON.stringify(this.flattened),
            // 'borderScript.txt': borderScript
        }

        console.log('Finished finding breaking elements postprocessing');

        return finalData;
    }
}

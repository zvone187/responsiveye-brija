import FS from "fs";
import Jimp from "jimp";
import _ from "lodash";
import config from '../config.js';
import {createBlankBitmap, delay, overlapArea} from '../common.js'
import Element from "./Element.js";
import Overlap from "./Overlap.js";

export default class Layer {

    constructor(layerNum, page) {
        this.layerNum = layerNum;
        this.page = page;
        this.elements = [];
        this.overlaps = [];

        this.elementsWithPotentialOverlap = this.filterElementsByBoundingBoxOverlap(this.page.HTMLData[this.layerNum]['elements']);
    }

    getMetadata() {
        return {
            'compositeImagePath': this.compositeImagePath,
            'elements': this.elements.map(el => el.getMetadata())
        }
    }

    findOverlapAtPosition(x, y) {
        // TODO optimize processing
        let overlap = new Overlap();
        for (let el of this.elements) {
            let {left, top, bottom, right} = el.bounds;
            if (
                x + config.overlapMarginOfError > left &&
                x - config.overlapMarginOfError < right &&
                y + config.overlapMarginOfError > top &&
                y - config.overlapMarginOfError < bottom
            ) overlap.elements.push(el);
        }
        overlap.createId();
        return overlap;
    }

    doesOverlapExistInDeeperLayers(x, y, idx) {
        if (this.page.overlapImageAllLayers.data[idx + 3] !== 0) return true;

        let overlapsFromDeeperLayers = this.page.layers.filter(l => l.layerNum > this.layerNum).map(l => l.overlaps).flat();
        for (let overlap of overlapsFromDeeperLayers) {
            let {left, top, bottom, right} = overlap.bounds;
            if (
                x + config.overlapMarginOfError >= left &&
                x - config.overlapMarginOfError <= right &&
                y + config.overlapMarginOfError >= top &&
                y - config.overlapMarginOfError <= bottom
            ) return true;
        }

        return false;
    }

    scanLayerImageForOverlaps() {
        let self = this;
        if (config.debug.fullLog) console.log(`...scanning for overlaps...`);

        this.compositeImage.scan(0, 0, this.compositeImage.bitmap.width, this.compositeImage.bitmap.height, function (x, y, idx) {
            let alpha = this.bitmap.data[idx + 3];

            if (alpha > 200) return; // TODO FIX #1

            let isOverlap = alpha > Math.ceil(255 * config.threshold_opacity);

            if (isOverlap) {
                if (config.debug) {
                    self.overlapImage.data[idx] = config.overlap_error_rgba[0];
                    self.overlapImage.data[idx + 1] = config.overlap_error_rgba[1];
                    self.overlapImage.data[idx + 2] = config.overlap_error_rgba[2];
                    self.overlapImage.data[idx + 3] = config.overlap_error_rgba[3];
                }

                if (!self.doesOverlapExistInDeeperLayers(x, y, idx)) {
                    // if (isAbsolute) {
                    //     // TODO change this error to warning
                    // }

                    let overlap = self.findOverlapAtPosition(x, y);
                    // TODO optimize this - it shouldn't be processed for every pixel once the overlap is found
                    if (!self.overlaps.find(o => o.eyeId === overlap.eyeId) && overlap.isValid()) {
                        overlap.calculateBoundingBox();
                        self.overlaps.push(overlap);
                    }

                    self.page.overlapImageAllLayers.data[idx] = config.overlap_error_rgba[0];
                    self.page.overlapImageAllLayers.data[idx + 1] = config.overlap_error_rgba[1];
                    self.page.overlapImageAllLayers.data[idx + 2] = config.overlap_error_rgba[2];
                    self.page.overlapImageAllLayers.data[idx + 3] = config.overlap_error_rgba[3];
                }
            }
        });
    }

    filterElementsByBoundingBoxOverlap(elements){
        let elementsToCheck = [];

        for (let i = 0; i < elements.length; i++) {
            let bb1 = elements[i].htmlData.maxBoundingBox;
            for (let j = i + 1; j < elements.length; j++) {
                let bb2 = elements[j].htmlData.maxBoundingBox;
                let overlap = overlapArea(bb1.left, bb1.left + bb1.width, bb1.top, bb1.top + bb1.height,
                    bb2.left, bb2.left + bb2.width, bb2.top, bb2.top + bb2.height);

                if (overlap > 0) {
                    elementsToCheck.push(elements[i]);
                    elementsToCheck.push(elements[j]);
                }

            }
        }

        return _.uniqBy(elementsToCheck, 'eyeId');
    }

    async setPreprocessedData(preprocessedData) {
        this.elements = preprocessedData.elements.map(el => new Element(el.eyeId, el.path, this.layerNum, this.page, el.bounds, el.area));
        this.compositeImagePath = preprocessedData.compositeImagePath;
        if (this.compositeImagePath) this.compositeImage = await Jimp.read(this.compositeImagePath);
    }

    async saveCompositeImage() {
        this.compositeImagePath = `${this.page.ssResolutionPath}/layer_${this.layerNum}.png`;
        await this.compositeImage.writeAsync(this.compositeImagePath);
    }

    async saveOverlapImage() {
        await new Promise((resolve) => {
            (new Jimp(this.overlapImage)).write(`${this.page.ssResolutionPath}/layer_${this.layerNum}_errors.png`, resolve);
        });
    }

    async findOverlaps() {
        this.overlapImage = await createBlankBitmap(this.page.width, this.page.height);

        this.scanLayerImageForOverlaps();

        if (config.debug.saveLayerErrorsImage) await this.saveOverlapImage();
    }

    async process() {
        let makeElementsVisibleJS = FS.readFileSync('./src/utils/browser_scripts/makeElementVisible.js').toString(); //todo replace with loadFileAndImportVariables()
        let childElementsToCheck = this.page.HTMLData[this.layerNum + 1] ?
            this.page.HTMLData.slice(this.layerNum + 1).map(l => l.manuallyVisibleElements).reduce((acc, val) => acc.concat(val), []) :
            [];

        this.compositeImage = await new Jimp(await createBlankBitmap(this.page.width, this.page.height));
        makeElementsVisibleJS = makeElementsVisibleJS.replaceAll('${childElementsToCheck}', JSON.stringify(childElementsToCheck));

        for (let data of this.elementsWithPotentialOverlap) {
            let element = new Element(data.eyeId, data.htmlData.path, data.htmlData, this.layerNum, this.page);
            await element.makeVisible(makeElementsVisibleJS);
            let processedElSs = await element.takeScreenshot();
            await element.makeInvisible();

            await this.compositeImage.composite(processedElSs, element.htmlData.maxBoundingBox.left, element.htmlData.maxBoundingBox.top);
            this.elements.push(element);
        }

        if (config.debug.saveLayerCompositeImage) await this.saveCompositeImage();

    }
}
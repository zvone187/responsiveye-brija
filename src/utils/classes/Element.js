import config from "../config.js";
import FS from "fs";
import Jimp from "jimp";
import {createBlankBitmap, delay} from '../common.js'

export default class Element {

    constructor(eyeId, path, htmlData, layerNum, page, bounds, area) {
        this.eyeId = eyeId;
        this.path = path;
        this.htmlData = htmlData;
        this.layerNum = layerNum;
        this.page = page;
        this.ssAlpha = Math.round(config.threshold_opacity * 255);

        this.area = area || 0;
        this.bounds = bounds || {
            left: page.width,
            top: page.height,
            bottom: 0,
            right: 0
        };
    }

    getMetadata() {
        return {
            'eyeId': this.eyeId,
            'area': this.area,
            'bounds': this.bounds
        }
    }

    updateBounds(x, y) {
        let bounds = {};
        bounds.left = Math.min(this.htmlData.maxBoundingBox.left + x, this.bounds.left);
        bounds.top = Math.min(this.htmlData.maxBoundingBox.top + y, this.bounds.top);
        bounds.right = Math.max(this.htmlData.maxBoundingBox.left + x, this.bounds.right);
        bounds.bottom = Math.max(this.htmlData.maxBoundingBox.top + y, this.bounds.bottom);

        return bounds;
    }

    overlapArea(l0, r0, t0, b0, l1, r1, t1, b1) {
        return Math.max(0, Math.min(r0, r1) - Math.max(l0, l1)) * Math.max(0, Math.min(b0, b1) - Math.max(t0, t1));
    }

    getPercentageOfElementOverlap(sibling) {
        const intersectionArea = this.overlapArea(
            this.bounds.left, this.bounds.right, this.bounds.top, this.bounds.bottom,
            sibling.bounds.left, sibling.bounds.right, sibling.bounds.top, sibling.bounds.bottom
        );
        return intersectionArea / this.area;
    }

    isInsideAnySibling(siblings) {
        for (let sibling of siblings) {
            if (sibling.eyeId !== this.eyeId &&
                this.getPercentageOfElementOverlap(sibling) > config.ignoreOverlapThreshold) return true;
        }

        return false;
    }

    async makeVisible(makeElementsVisibleJS) {
        this.specialChildElements = await this.page.driver.executeScript(
            makeElementsVisibleJS
                .replaceAll('${elEyeId}', this.eyeId)
        );
    }

    async makeInvisible() {
        let makeElementsInvisibleJS = `document.querySelector('[eye-id="${this.eyeId}"]').style.visibility='inherit';`;
        for (let childEyeId of this.specialChildElements)
            makeElementsInvisibleJS += `document.querySelector('[eye-id="${childEyeId}"]').style.visibility='inherit';`;

        await this.page.driver.executeScript(makeElementsInvisibleJS);
        await delay(500); // TODO apply proper delay based on callback once DOM is updated
    }

    async processPixels(elImage) {
        let processedElSs = await createBlankBitmap(elImage.bitmap.width, elImage.bitmap.height),
            foundArtefact = false,
            self = this;

        elImage.scan(0, 0, elImage.bitmap.width, elImage.bitmap.height, function (x, y, idx) {
            let alpha = this.bitmap.data[idx + 3];
            if (alpha > config.imgArtefactsThreshold) {
                foundArtefact = true;
                self.bounds = self.updateBounds(x, y);

                processedElSs.data[idx] = this.bitmap.data[idx + 0];
                processedElSs.data[idx + 1] = this.bitmap.data[idx + 1];
                processedElSs.data[idx + 2] = this.bitmap.data[idx + 2];
                processedElSs.data[idx + 3] = self.ssAlpha;
            }
        });

        if (!foundArtefact) {
            this.bounds = {
                left: undefined,
                top: undefined,
                bottom: undefined,
                right: undefined
            }
        } else {
            this.area = (this.bounds.right - this.bounds.left) * (this.bounds.bottom - this.bounds.top);
        }

        return await new Jimp(processedElSs);
    }

    async takeScreenshot() {
        let elScreenshot = await this.page.driver.sendAndGetDevToolsCommand('Page.captureScreenshot', {
            'format': 'png',
            'fromSurface': true,
            'clip': {
                'x': Math.round(this.htmlData.maxBoundingBox.left),
                'y': Math.round(this.htmlData.maxBoundingBox.top),
                'width': Math.round(this.htmlData.maxBoundingBox.width),
                'height': Math.round(this.htmlData.maxBoundingBox.height),
                'scale': 1
            }
        });
        if (config.debug.saveElScreenshots) {
            FS.writeFileSync(`${this.page.ssResolutionPath}/elements/layer_${this.layerNum}_el_${this.eyeId}.png`, elScreenshot.data, 'base64');
        }

        let elImage = await Jimp.read(Buffer.from(elScreenshot.data, 'base64'));
        let processedElSs = await this.processPixels(elImage);
        return processedElSs;
    }
}
export default class Overlap {
    constructor() {
        this.elements = [];
    }

    createId() {
        this.eyeId = this.elements.map(el => el.eyeId).sort().join('|');
    }

    isValid() {
        for (let i = this.elements.length - 1; i >= 0; i--) {
            if (this.elements[i].isInsideAnySibling(this.elements)) {
                this.elements.splice(i, 1);
            }
        }

        return this.elements.length > 1;
    }

    calculateBoundingBox() {
        this.bounds = {
            'left': -Infinity,
            'top': -Infinity,
            'bottom': Infinity,
            'right': Infinity
        }

        for (let element of this.elements) {
            if (element.bounds.left > this.bounds.left) this.bounds.left = element.bounds.left;
            if (element.bounds.right < this.bounds.right) this.bounds.right = element.bounds.right;
            if (element.bounds.top > this.bounds.top) this.bounds.top = element.bounds.top;
            if (element.bounds.bottom < this.bounds.bottom) this.bounds.bottom = element.bounds.bottom;
        }
    }
}
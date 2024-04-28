let layer = --${maxLayer};
let skipTags = --${skipTags};
let boundsMap = {};

while (layer) {
  let layerElements = Array.from(document.getElementsByClassName(`layer${layer}`));
  layerElements.forEach((el) => {
    let elTag = el.tagName.toLowerCase();
    if (skipTags.includes(elTag)) return;

    let x = Infinity,
      y = Infinity,
      b = 0,
      r = 0,
      children = Array.from(el.children);

    if (children.length > 0) {
      children.forEach((child) => {
        let cx = child.getAttribute('x');
        let cy = child.getAttribute('y');
        let cb = child.getAttribute('b');
        let cr = child.getAttribute('r');
        if ([cy, cb, cr].every(function(v) { return v === cx; })) return;
        x = Math.min(x, cx);
        y = Math.min(y, cy);
        b = Math.max(y, cb);
        r = Math.max(x, cr);
      });
    } else {
      let bounds = el.getBoundingClientRect();
      x = bounds.x;
      y = bounds.y;
      b = bounds.bottom;
      r = bounds.right;
    }
    if (x === Infinity) x = 0;
    if (y === Infinity) y = 0;
    el.setAttribute('x', x);
    el.setAttribute('y', y);
    el.setAttribute('b', b);
    el.setAttribute('r', r);
    boundsMap[el.getAttribute('eye-id')] = {x, y, b, r, tag:elTag};
  })
  layer--;
}

return boundsMap;

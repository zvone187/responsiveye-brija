let currentProcessingElement = document.querySelector('[eye-id="${elEyeId}"]');
let childElementsToCheck = ${childElementsToCheck};
let specialChildElements = [];

currentProcessingElement.style.visibility="visible";

for (let childEyeId of childElementsToCheck) {
    let el = document.querySelector('[eye-id="' + childEyeId + '"]');
    if (currentProcessingElement.contains(el)) {
        el.style.visibility = 'inherit';
        specialChildElements.push(childEyeId);
    }
}

return specialChildElements;
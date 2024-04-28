let keywords = [
    'dialog',
    'popup'
];

keywords.map(c => `[class*="${c}"]`)
    .concat(keywords.map(c => `[id*="${c}"]`))
    .concat([
        '[role="dialog"]',
        '[id="onetrust-consent-sdk"]',
        '.consent-page',
        '.consent-overlay',
        '.overlay_close'
    ])
    .forEach(query => {
        console.log(query)
        // let submitButton = document.querySelector(query + ' button[type="submit"]');
        // if (submitButton) submitButton.click();
        let els = document.querySelectorAll(query + ':not(body)');
        els.forEach(el  => {
            try {
                el.click();
                el.remove();
            } catch (e) {

            }
        });
    });

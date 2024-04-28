let currentUrl = psl.parse(window.location.host);
let pages = [];
document.querySelectorAll('a[href]').forEach(
    (el)=> {
        let page = getUrlParts(el.getAttribute('href'));
        if (page.error) return;
        let subdomainParser = psl.parse(page.host);
        if (subdomainParser.subdomain) {
            page.host = subdomainParser.domain;
            page.subdomain = subdomainParser.subdomain;
        }
        if (page.host === currentUrl.domain) pages.push(page);
    }
);
return pages;
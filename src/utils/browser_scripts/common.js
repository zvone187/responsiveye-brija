function getUrlParts(url) {
    const DOT = '.',
        UDSCR = '_',
        SLASH = '/',
        CLN = ':';
    if (url.indexOf('/') === 0) url = `https://${window.location.host}${url}`;
    else if (url.indexOf('#') === 0) url = `https://${window.location.host}${window.location.pathname}${url}`;
    else if (url.indexOf(window.location.host) === 0) url = `https://${url}`;
    else if (url.indexOf('http') !== 0) return {error: new Error(`Invalid url: ${url}`)};
    let urlObj = new URL(url.replace('www.', ''));
    let pathname = urlObj.pathname;
    if (pathname[pathname.length - 1] === SLASH) pathname = pathname.substring(0, pathname.length - 1);
    return {
        host: urlObj.host,
        pathname: pathname,
        id: urlObj.host.replaceAll(DOT, UDSCR).replaceAll(CLN, UDSCR) + (pathname ? '-' + pathname.replaceAll(SLASH, UDSCR).replaceAll(DOT, UDSCR) : '')
    }
}

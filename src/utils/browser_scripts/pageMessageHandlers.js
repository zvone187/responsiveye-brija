function getElWidth(el, type) {
    if (type === 'inner')
        return el.clientWidth;
    else if (type === 'outer')
        return el.offsetWidth;

    let s = window.getComputedStyle(el, null);

    if (type === 'wo/padding')
        return el.clientWidth - parseInt(s.getPropertyValue('padding-left')) - parseInt(s.getPropertyValue('padding-right'));
    else if (type === 'full')
        return el.offsetWidth + parseInt(s.getPropertyValue('margin-left')) + parseInt(s.getPropertyValue('margin-right'));

    return null;
}

function appendResponsiveyeScript(content) {
    console.log('appending script');
    var po = document.createElement('script');
    po.type = 'text/javascript';
    po.innerHTML = content;
    var s = document.getElementsByTagName('script')[0];
    s.parentNode.insertBefore(po, s);
}

window.addEventListener('message', function(e) {
    switch (e.data.type) {
        case 'responsiveye-exec-script':
            appendResponsiveyeScript(e.data.script);
            break;
    }
});
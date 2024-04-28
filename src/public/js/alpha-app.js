let minScreenWidth = 320;
let maxScreenWidth = 1920;
let numberOfVisibleResolutionMarkers = 10;
let currentPageWidth;
let currentResolutionMarker;
let currentResolution;
let screenSizeToPageWidth;
let markerLeftOffset;
let iframeWidthExtras;
let iframeEl;
let maxIframeWrapperWidth;
let pageData = [];

let resolutionMarkerHtml = `<div class="resolution-marker"><span class="resolution">$resolutionpx</span><div class="marker"></div></div>`;
let breakMarkerHtml = `<div class="breaking-elements error-marker" eye-screen-width="$screenWidth" eye-path="$path" eye-id="$eyeId" map='$map' style="left: $leftOffsetpx"><div class="exclmark">!</div><div class="marker"></div></div>`;
let overlapMarkerHtml = `<div class="overlap-processing error-marker" data-screen-width="$screenWidth" data-elements='$elements' data-top="$top" data-bottom="$bottom" data-left="$left" data-right="$right"' style="left: $leftOffsetpx"><div class="exclmark">!</div><div class="marker"></div></div>`;

$(document).ready(function () {
    let timelineEl = $('.timeline');
    iframeEl = $('#page-window iframe')[0];
    currentPageWidth = $(iframeEl).width();
    currentResolutionMarker = $('.current-resolution');
    screenSizeToPageWidth = (timelineEl.width() - 2 * 92) / (maxScreenWidth - minScreenWidth);
    markerLeftOffset = timelineEl.width() * ((timelineEl.width() - (numberOfVisibleResolutionMarkers + 2) * 2)/timelineEl.width()) / (numberOfVisibleResolutionMarkers + 2);
    for (let m = 0; m <= numberOfVisibleResolutionMarkers; m++) {
        $('.resolutions').append(resolutionMarkerHtml.replace('$resolution', Math.round(minScreenWidth + ((maxScreenWidth - minScreenWidth)/numberOfVisibleResolutionMarkers) * m)));
    }
    $('.resolution-marker').css('margin-left', `${markerLeftOffset}px`);

    initResizingElement();
    setTimeout(() => {
        var cssStyle = document.createElement("style");
        cssStyle.innerHTML = '.responsiveye-outline {outline: 5px solid greenyellow;} .responsiveye-outline-flex {outline: 5px solid orange;}';
        cssStyle.type = "text/css";
        frames["responsiveye-iframe"].contentWindow.document.head.appendChild(cssStyle);
    }, 1000)

    maxIframeWrapperWidth = $('.page-wrapper').width() - $('.resize-drag-wrapper').outerWidth(true) - 5;
    $(window).on('resize', function(){
        maxIframeWrapperWidth = $('.page-wrapper').width() - $('.resize-drag-wrapper').outerWidth(true) - 5;
    });

    let iframeLoaded = function () {
        iframeWidthExtras = $(iframeEl).outerWidth() - $(iframeEl.contentWindow.document.body).outerWidth();
        currentPageWidth = currentPageWidth - iframeWidthExtras;
        positionCurrentResolutionMarker();
    }

    var iframeLoadedTimer = setInterval(function () {
        var iframeDoc = iframeEl.contentDocument || iframeEl.contentWindow.document;
        if (iframeDoc.readyState === 'complete' || iframeDoc.readyState === 'interactive') {
            iframeLoaded();
            clearInterval(iframeLoadedTimer);
        }
    }, 500);
});

function positionCurrentResolutionMarker() {
    let leftMargin = Math.ceil(parseFloat(document.querySelector('.resolution-marker').style.marginLeft));
    let left = Math.max(markerLeftOffset + (currentPageWidth - minScreenWidth) * screenSizeToPageWidth, leftMargin)
    currentResolutionMarker.css('left', `${left}px`);
}

function showResolution(width) {
    currentPageWidth = width;
    currentResolution = !iframeWidthExtras ? width : Math.min(maxScreenWidth - iframeWidthExtras, Math.max(minScreenWidth + iframeWidthExtras, currentPageWidth + iframeWidthExtras))
    document.querySelector('#responsiveyeResolution').innerHTML = `${currentPageWidth}px`;
    loadPageData();
}

function showDebugLog(elPath, elEyeId) {
    console.log('---- showing element ----');
    console.log(elPath);
    console.log(elEyeId);
    console.log('---')
    console.log(`iframeEl.contentWindow.document.body.querySelector('${elPath}');`)
    console.log('-------------------------')
}

function getOverlayEl() {
    return $('<div />', {
        class: 'eye-error-overlay',
        css: {
            position: 'absolute',
            backgroundColor: 'rgba(207, 0, 15, 0.3)',
            border: '1px solid rgb(207, 0, 15)',
            borderRadius: '10px',
            zIndex: 99999999,
            pointerEvents: 'none'
        }
    });
}

function setOverlayPosition(el, top, left, width, height) {
    el.css({
        top: top,
        left: left,
        width: width,
        height: height,
    });
}

function showErrorOverlay(el) {
    el.scrollIntoView();
    $(el).addClass('responsiveye-outline');

    // TODO position is not correctly calculated before we scroll the element into view (mostly because of removing header)
    setTimeout(() => {

        var offset = $(el).offset();
        var posY = offset.top;
        var posX = offset.left;
        let eyeOverlay = $(iframeEl.contentWindow.document.body).find('.eye-error-overlay');
        if (!eyeOverlay[0]) {
            eyeOverlay = getOverlayEl();
            $(iframeEl.contentWindow.document.body).append(eyeOverlay);
        }

        setOverlayPosition(eyeOverlay, posY, posX, $(el).outerWidth(), $(el).outerHeight());

    }, 1000);
}

function showErrorOnPage(screenWidth, elPath, elEyeId, map) {
    Array.from(iframeEl.contentWindow.document.querySelectorAll('.responsiveye-outline')).forEach((e) => e.classList.remove('responsiveye-outline'))
    Array.from(iframeEl.contentWindow.document.querySelectorAll('.responsiveye-outline-flex')).forEach((e) => e.classList.remove('responsiveye-outline-flex'));
    document.querySelector('#responsiveyeNumOfErrors').innerHTML = `${map.length} error${map.length > 1 ? 's' : ''}`;
    showResolution(screenWidth);
    positionCurrentResolutionMarker();
    showDebugLog(elPath, elEyeId);
    $(iframeEl).css('width', currentResolution + 'px');
    $('#page-window').css('width', Math.min(maxIframeWrapperWidth, Math.max(minScreenWidth + iframeWidthExtras, currentPageWidth + iframeWidthExtras)) + 'px');

    let scale = Math.min(1, (maxIframeWrapperWidth)/(currentPageWidth + iframeWidthExtras));
    $(iframeEl).css({
        '-ms-zoom': scale,
        '-moz-transform': `scale(${scale})`,
        '-moz-transform-origin': '0 0',
        '-o-transform': `scale(${scale})`,
        '-o-transform-origin': '0 0',
        '-webkit-transform': `scale(${scale})`,
        '-webkit-transform-origin': '0 0'
    });

    let errorElement = iframeEl.contentWindow.document.querySelector(elPath);
    if (errorElement) showErrorOverlay(errorElement);
    console.log(map);
    map.forEach((path) => {
        let el = iframeEl.contentWindow.document.querySelector(path)
        let parent = el.parentElement
        if (el) {
            parent && getComputedStyle(parent).display === 'flex' ?
                el.classList.add('responsiveye-outline-flex') :
                el.classList.add('responsiveye-outline');
        } else {
            console.log('ERROR: NO ELEMENT WITH PATH: ' + path)
        }
    })
}

function showOverlapError(screenWidth, elements, overlayBounds) {
    Array.from(iframeEl.contentWindow.document.querySelectorAll('.responsiveye-outline')).forEach((e) => e.classList.remove('responsiveye-outline'));
    Array.from(iframeEl.contentWindow.document.querySelectorAll('.responsiveye-outline-flex')).forEach((e) => e.classList.remove('responsiveye-outline-flex'));
    showResolution(screenWidth);
    positionCurrentResolutionMarker();
    console.log('----bounds----', overlayBounds);
    iframeEl.contentWindow.window.scrollTo(0, overlayBounds.top - 30);
    elements.forEach(el => showDebugLog(el.path, el.eyeId));
    $(iframeEl).css('width', currentResolution + 'px');
    $('#page-window').css('width', Math.min(maxIframeWrapperWidth, Math.max(minScreenWidth + iframeWidthExtras, currentPageWidth + iframeWidthExtras)) + 'px');

    let scale = Math.min(1, (maxIframeWrapperWidth)/(currentPageWidth + iframeWidthExtras));
    $(iframeEl).css({
        '-ms-zoom': scale,
        '-moz-transform': `scale(${scale})`,
        '-moz-transform-origin': '0 0',
        '-o-transform': `scale(${scale})`,
        '-o-transform-origin': '0 0',
        '-webkit-transform': `scale(${scale})`,
        '-webkit-transform-origin': '0 0'
    });

    // for (let el of elements) {
    //     let errorElement = iframeEl.contentWindow.document.querySelector(el.path);
    //     if (errorElement) showErrorOverlay(errorElement);
    // }
    let eyeOverlay = getOverlayEl();
    setOverlayPosition(
        eyeOverlay,
        overlayBounds.top,
        overlayBounds.left,
        overlayBounds.right - overlayBounds.left,
        overlayBounds.bottom - overlayBounds.top
    );
    $(iframeEl.contentWindow.document.body).append(eyeOverlay);
}

function addOverlapErrorsOnTimeline(overlapData) {
    for (let screenWidth in overlapData) {
        let leftOffset = markerLeftOffset + (parseInt(screenWidth) - minScreenWidth) * screenSizeToPageWidth;
        for (let error of overlapData[screenWidth].result) {
            $('.errors').append(overlapMarkerHtml
                .replace('$leftOffset', leftOffset)
                .replace('$screenWidth', screenWidth)
                .replace('$elements', JSON.stringify(error.elements))
                .replace('$top', error.bounds.top)
                .replace('$bottom', error.bounds.bottom)
                .replace('$left', error.bounds.left)
                .replace('$right', error.bounds.right)
            );
        }
    }

    $('.overlap-processing .exclmark').on('click', function (e) {
        let el = $(this).parents('.error-marker');
        let bounds = {
            top: parseFloat(el.data('top')),
            bottom: parseFloat(el.data('bottom')),
            left: parseFloat(el.data('left')),
            right: parseFloat(el.data('right'))
        }
        showOverlapError(parseInt(el.data('screen-width')), el.data('elements'), bounds);
    });
}

function addBreakingErrorsOnTimeline(errors) {
    let errorsMap = {};
    for (let error of errors) {
        if (!errorsMap[error.break_screen_width]) errorsMap[error.break_screen_width] = [];
        if (!errorsMap[error.break_screen_width].includes(error.el_path))errorsMap[error.break_screen_width].push(error.el_path);
        let leftOffset = markerLeftOffset + (error.break_screen_width - minScreenWidth) * screenSizeToPageWidth;
        $('.errors').append(breakMarkerHtml
            .replace('$leftOffset', leftOffset)
            .replace('$screenWidth', error.break_screen_width)
            .replace('$path', error.el_path)
            .replace('$eyeId', error.eye_id)
            .replace('$map', JSON.stringify(errorsMap[error.break_screen_width]))
        );
    }

    $('.breaking-elements .exclmark').on('click', function (e) {
        let el = $(this).parents('.error-marker');
        showErrorOnPage(parseInt(el.attr('eye-screen-width')), el.attr('eye-path'), el.attr('eye-id'), JSON.parse(el.attr('map')));
    });
}

function initResizingElement() {
    console.log('Initializing resizing element');
    var pos1 = 0, pos3 = 0;
    $('.resize-drag')[0].onmousedown = dragMouseDown;

    function dragMouseDown(e) {
        e = e || window.event;
        e.preventDefault();

        pos3 = e.clientX;
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
        $(iframeEl).css('pointer-events', 'none');
    }

    function elementDrag(e) {
        e = e || window.event;
        e.preventDefault();

        pos1 = pos3 - e.clientX;
        pos3 = e.clientX;

        showResolution(currentPageWidth - pos1);

        $(iframeEl).css('width', currentResolution + 'px');
        $('#page-window').css('width', Math.min(maxIframeWrapperWidth, Math.max(minScreenWidth + iframeWidthExtras, currentPageWidth + iframeWidthExtras)) + 'px');

        positionCurrentResolutionMarker();
        let scale = Math.min(1, (maxIframeWrapperWidth)/(currentPageWidth + iframeWidthExtras));
        $(iframeEl).css({
            '-ms-zoom': scale,
            '-moz-transform': `scale(${scale})`,
            '-moz-transform-origin': '0 0',
            '-o-transform': `scale(${scale})`,
            '-o-transform-origin': '0 0',
            '-webkit-transform': `scale(${scale})`,
            '-webkit-transform-origin': '0 0'
        });

    }

    function closeDragElement() {
        document.onmouseup = null;
        document.onmousemove = null;
        $(iframeEl).css('pointer-events', 'all');
    }
}

function loadPageData() {
    for (let data of pageData) {
        if (iframeEl.getAttribute('src') !== data.s3Location &&
            data.startRes <= currentResolution && data.endRes >= currentResolution) {
            // TODO show loader until the new page loads
            iframeEl.setAttribute('src', data.s3Location);
            // TODO uncomment for debugging
            // iframeEl.setAttribute('src', data.s3Location.replace('https://s3.amazonaws.com/page.responsiveye.com/downloaded_pages', '/public/html'));
        }
    }
}

function setDownloadedPage(data) {
    pageData.push(data);
    if (!iframeEl.getAttribute('src')) showResolution(data.startRes);
}
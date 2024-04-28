const socket = io();

socket.on('pageProgressUpdate', function (data) {
    console.log('pageProgressUpdate', data);
    setDownloadedPage(data);
});

socket.on('processingFinished', function (data) {
    console.log('processingFinished', data);
    if (data.breakingElements) {
        $.ajax({
            url: data.breakingElements,
            dataType: 'json',
            success: function (result, status, xhr) {
                console.log('....', result);
                addBreakingErrorsOnTimeline(result);
            },
            error: function (xhr, status, err) {
                console.log('Can\'t get file from s3 because of', err);
            }
        });
    }

    if (data.overlapProcessing) addOverlapErrorsOnTimeline(data.overlapProcessing);
});

socket.emit('processPage', pageUrlIdToProcess);

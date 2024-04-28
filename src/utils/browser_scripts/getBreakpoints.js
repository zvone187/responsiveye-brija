let breakpoints = [];
let hrefs = [];
let recursiveRules = function(rules) {
    Array.from(rules).forEach((rule)=> {
        try{
            if(rule.cssRules) {
                recursiveRules(rule.cssRules)
            }
            if (rule.styleSheet && rule.styleSheet.cssRules) recursiveRules(rule.styleSheet.cssRules)
            if (rule.media && rule.media[0]) breakpoints = breakpoints.concat(rule.media[0])
        } catch{} finally {
            if (rule.href) hrefs.push(rule.href)
        }
    })
}

recursiveRules(document.styleSheets)
let uniqueBreakpoints = [...new Set(breakpoints.map((b)=> b.match(/(?<=min-width: ).*?\)|(?<=max-width: ).*?\)|(?<=min-device-width: ).*?\)|(?<=max-device-width: ).*?\)/gm)).flat())].map((e)=> e ? e.replace('px)','') : NaN).sort().filter((e) => !isNaN(e));
return uniqueBreakpoints

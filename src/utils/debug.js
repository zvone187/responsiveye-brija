export default class Debug {
    constructor() {
    }

    createBorderScript(data) {
        let pathIndex = data[0][0].findIndex((element) => (typeof element === 'string' || element instanceof String) && element.includes('body'));
        let paths = [];
        for (let row of data[0]) {
            if (!paths.includes(row[pathIndex])) paths.push(row[pathIndex])
        }
        return `let paths = ${JSON.stringify(paths)};
        for (let path of paths) {
            let el = document.querySelector(path);
            if(el) el.style.border = '3px orange solid';
        }`
    }
}

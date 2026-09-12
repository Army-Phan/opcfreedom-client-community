const fs = require('fs');
const html = fs.readFileSync('dialog_html.txt', 'utf8');

const match = html.match(/.{0,300}Dat Phan.{0,300}/);
console.log("\nSnippet around Dat Phan:");
console.log(match ? match[0] : 'Not found');

const match2 = html.match(/.{0,300}BizTada.{0,300}/);
console.log("\nSnippet around BizTada:");
console.log(match2 ? match2[0] : 'Not found');
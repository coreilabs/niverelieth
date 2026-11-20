// Run once after local CSS/JS edits. Tokens are publication values, never per request.
const fs = require('fs');
const crypto = require('crypto');
let html = fs.readFileSync('index.html','utf8');
for (const file of ['styles.css','app.js']) {
  const token = crypto.randomBytes(8).toString('hex');
  const pattern = new RegExp(file.replace('.', '\\.') + '\\?v=[^"\\s]+','g');
  html = html.replace(pattern,`${file}?v=${token}`);
}
if (process.argv.includes('--og')) {
  const token = crypto.randomBytes(8).toString('hex');
  html = html.replace(/assets\/opengraph\.jpg\?v=[^"\s]+/g,`assets/opengraph.jpg?v=${token}`);
}
fs.writeFileSync('index.html',html);
console.log('Publication tokens renewed.');

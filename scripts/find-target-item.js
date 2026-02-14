
import fs from 'fs';
const data = JSON.parse(fs.readFileSync('static/data/laundyklin.json', 'utf8'));
const item = data.find(i => i.url && i.url.includes('ChIJr84w7qznaC4RVA_DrfHC4Ug'));
console.log(JSON.stringify(item, null, 2));

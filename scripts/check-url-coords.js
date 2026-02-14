
import fs from 'fs';
const data = JSON.parse(fs.readFileSync('static/data/laundyklin.json', 'utf8'));

const coordRegex = /@(-?\d+\.\d+),(-?\d+\.\d+)/;
const dataWithUrlCoords = data.filter(i => i.url && coordRegex.test(i.url));

console.log(`Total items: ${data.length}`);
console.log(`Items with coords in URL: ${dataWithUrlCoords.length}`);

if (dataWithUrlCoords.length > 0) {
    const sample = dataWithUrlCoords[0];
    const match = sample.url.match(coordRegex);
    console.log(`Sample: ${sample.title}`);
    console.log(`URL: ${sample.url}`);
    console.log(`URL Coords: ${match[1]}, ${match[2]}`);
    console.log(`JSON Coords: ${sample.location?.lat}, ${sample.location?.lng}`);
} else {
    console.log("No items found with @lat,lng in URL");
}

const searchPageWithCoords = data.filter(i => i.searchPageUrl && coordRegex.test(i.searchPageUrl));
console.log(`Items with coords in searchPageUrl: ${searchPageWithCoords.length}`);
if (searchPageWithCoords.length > 0) {
    const sample = searchPageWithCoords[0];
    const match = sample.searchPageUrl.match(coordRegex);
    console.log(`Sample Search: ${sample.title}`);
    console.log(`Search URL: ${sample.searchPageUrl}`);
    console.log(`Search Coords: ${match[1]}, ${match[2]}`);
    console.log(`JSON Coords: ${sample.location?.lat}, ${sample.location?.lng}`);
}

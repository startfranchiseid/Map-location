import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_FILE = path.join(__dirname, '../static/data/brand_locations.json');
const BRAND_NAME = 'Barber Smart';

async function geocodeAddress(address, city) {
    const query = `${address}, ${city}, Indonesia`;
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`;

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'BrandMapLocationFixer/1.0'
            }
        });
        const data = await response.json();
        if (data && data.length > 0) {
            return {
                lat: parseFloat(data[0].lat),
                lng: parseFloat(data[0].lon)
            };
        }
    } catch (error) {
        console.error(`Error geocoding ${query}:`, error.message);
    }
    return null;
}

async function main() {
    console.log(`Reading data from ${DATA_FILE}...`);
    // Use fs.readFileSync with utf8 encoding
    const rawData = fs.readFileSync(DATA_FILE, 'utf8');
    const data = JSON.parse(rawData);

    const brand = data.brands.find(b => b.brandName === BRAND_NAME);
    if (!brand) {
        console.error(`Brand "${BRAND_NAME}" not found!`);
        return;
    }

    console.log(`Found ${brand.outlets.length} outlets for ${BRAND_NAME}. Starting geocoding...`);

    let updatedCount = 0;

    for (const outlet of brand.outlets) {
        console.log(`Geocoding: ${outlet.name} - ${outlet.address}, ${outlet.city}...`);

        const coords = await geocodeAddress(outlet.address, outlet.city);

        if (coords) {
            console.log(`  -> Found: ${coords.lat}, ${coords.lng}`);
            outlet.coordinates = coords;
            updatedCount++;
        } else {
            console.log(`  -> Not found. Keeping original.`);
        }

        // Respect rate limit (1 second is polite for OSM)
        await new Promise(resolve => setTimeout(resolve, 1500));
    }

    if (updatedCount > 0) {
        console.log(`Updated ${updatedCount} outlets. Saving file...`);
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        console.log('Done!');
    } else {
        console.log('No updates made.');
    }
}

main();

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_FILE = path.join(__dirname, '../static/data/brand_locations.json');

// Helper delay function
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function geocodeAddress(address, city) {
    if (!address || address.length < 3) return null;

    // Construct query
    // Prefer: "Address, City, Indonesia"
    const query = `${address}, ${city}, Indonesia`;
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`;

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'BrandMapLocationFixer/2.0 (Generalized)'
            }
        });

        if (!response.ok) {
            if (response.status === 429) {
                console.warn(`   ⚠️ Rate limited. Waiting longer...`);
                await delay(5000);
                return geocodeAddress(address, city); // Retry once
            }
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        if (data && data.length > 0) {
            return {
                lat: parseFloat(data[0].lat),
                lng: parseFloat(data[0].lon)
            };
        }
    } catch (error) {
        console.error(`   ❌ Error geocoding "${query}":`, error.message);
    }
    return null;
}

async function processOutlets(outlets) {
    let count = 0;
    for (const outlet of outlets) {
        // Log progress
        process.stdout.write(`   Processing: ${outlet.name.padEnd(30)} \r`);

        const coords = await geocodeAddress(outlet.address, outlet.city);

        if (coords) {
            // Check if coordinates significantly changed (optional logic)
            // For now, simply update to ensure accuracy as requested
            outlet.coordinates = coords;
            count++;
            console.log(`   ✓ Found: ${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)} | ${outlet.address}, ${outlet.city}`);
        } else {
            console.log(`   ⚠️ Not found: ${outlet.address}, ${outlet.city} (Keeping original)`);
        }

        // Polite delay for OSM
        await delay(1200);
    }
    return count;
}

async function main() {
    console.log(`\n🌍 Global Brand Data Correction Script`);
    console.log(`   Target: ${DATA_FILE}`);
    console.log('='.repeat(60));

    const rawData = fs.readFileSync(DATA_FILE, 'utf8');
    const data = JSON.parse(rawData);

    let totalUpdated = 0;

    for (const brand of data.brands) {
        console.log(`\n🏢 Brand: ${brand.brandName}`);

        // Handle flattened outlets
        if (brand.outlets && brand.outlets.length > 0) {
            console.log(`   Processing ${brand.outlets.length} outlets (Direct)...`);
            totalUpdated += await processOutlets(brand.outlets);
        }

        // Handle regional outlets
        if (brand.regions && brand.regions.length > 0) {
            for (const region of brand.regions) {
                if (region.outlets && region.outlets.length > 0) {
                    console.log(`   Processing ${region.outlets.length} outlets in ${region.region}...`);
                    totalUpdated += await processOutlets(region.outlets);
                }
            }
        }
    }

    console.log('\n' + '='.repeat(60));
    if (totalUpdated > 0) {
        console.log(`✅ Updated ${totalUpdated} locations total.`);
        console.log(`💾 Saving existing data to backup: brand_locations.before_global.json`);
        fs.writeFileSync(DATA_FILE.replace('.json', '.before_global.json'), rawData);

        console.log(`💾 Writing new data to: brand_locations.json`);
        // Use 2-space indentation for readability
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        console.log('🎉 Done!');
    } else {
        console.log('ℹ️ No updates were made.');
    }
}

main();

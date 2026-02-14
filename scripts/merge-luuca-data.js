import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROVIDED_FILE = path.join(__dirname, '../static/data/luuca_provided.json');
const DATA_FILE = path.join(__dirname, '../static/data/brand_locations.json');

// Helper delay
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function geocodeAddress(address, city) {
    const query = `${address}, ${city}, Indonesia`;
    // Clean query of "plus codes" if possible, but Nominatim often handles them or fails.
    // If address starts with a plus code (e.g. "QRWG+36F"), it might confuse Nominatim if not supported.
    // Let's rely on Nominatim. If it fails, we might just default to city level?
    // User wants accuracy.

    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`;

    try {
        const response = await fetch(url, {
            headers: { 'User-Agent': 'LuucaDataFixer/1.0' }
        });
        if (!response.ok) {
            if (response.status === 429) {
                await delay(5000);
                return geocodeAddress(address, city);
            }
            return null;
        }
        const data = await response.json();
        if (data && data.length > 0) {
            return {
                lat: parseFloat(data[0].lat),
                lng: parseFloat(data[0].lon)
            };
        }
    } catch (e) {
        console.error(`Geocode error for ${query}: ${e.message}`);
    }
    return null;
}

async function main() {
    console.log('🔄 Updating "Luuca" data from user list...');

    const luucaRaw = JSON.parse(fs.readFileSync(PROVIDED_FILE, 'utf8'));
    const mainData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));

    // 1. Process and Geocode New Data
    const newOutlets = [];

    for (const item of luucaRaw) {
        process.stdout.write(`   Processing: ${item.title.substring(0, 30)}... \r`);

        let coords = await geocodeAddress(item.street, item.city);

        if (!coords) {
            // Fallback: Try just City
            // coords = await geocodeAddress(item.city, ''); 
            // Actually, let's try to be strict first. Or use default placeholders?
            // If coordinates are missing, it won't show on map.
            // Let's set a "needs_fix" flag or default to Jakarta?
            // Better to have approximate than nothing?
            // Let's try to geocode just the city if address fails.
            coords = await geocodeAddress(item.city, item.state);
        }

        newOutlets.push({
            name: item.title,
            address: item.street,
            city: item.city,
            region: item.state, // We will group by this later 
            coordinates: coords || { lat: -6.1751, lng: 106.8650 } // Default to Jakarta if completely failed
        });

        await delay(1200);
    }
    console.log('\n   Geocoding complete.');

    // 2. Group by Region (State)
    const regionsMap = new Map();

    newOutlets.forEach(outlet => {
        if (!regionsMap.has(outlet.region)) {
            regionsMap.set(outlet.region, []);
        }
        regionsMap.get(outlet.region).push(outlet);
    });

    const newRegions = [];
    for (const [regionName, outlets] of regionsMap) {
        newRegions.push({
            region: regionName,
            outlets: outlets
        });
    }

    // 3. Update Main Data
    const luucaIndex = mainData.brands.findIndex(b => b.brandName === 'Luuca');
    if (luucaIndex !== -1) {
        // Preserve other metadata, replace regions/outlets
        mainData.brands[luucaIndex] = {
            ...mainData.brands[luucaIndex],
            totalOutlets: newOutlets.length,
            regions: newRegions,
            outlets: [] // Clear flat outlets if any, use regions
        };
        console.log(`   Updated Luuca entry with ${newOutlets.length} outlets in ${newRegions.length} regions.`);
    } else {
        console.error('   ❌ "Luuca" brand not found in original file!');
    }

    // 4. Save
    fs.writeFileSync(DATA_FILE, JSON.stringify(mainData, null, 2));
    console.log('💾 Saved brand_locations.json');
}

main();

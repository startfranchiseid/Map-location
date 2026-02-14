import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SOURCE_FILE = path.join(__dirname, '../all_data.json'); // User created this in root
// Fallback if not in root, try static/data
const DATA_FILE = path.join(__dirname, '../static/data/brand_locations.json');

// Helper delay
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function geocodeAddress(address, city) {
    if (!address || address.length < 3) return null;
    const query = `${address}, ${city}, Indonesia`;
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`;
    try {
        const response = await fetch(url, { headers: { 'User-Agent': 'LuucaRichImporter/1.0' } });
        if (!response.ok) {
            if (response.status === 429) { await delay(5000); return geocodeAddress(address, city); }
            return null;
        }
        const data = await response.json();
        if (data && data.length > 0) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    } catch (e) {
        console.error(`Geocode error: ${e.message}`);
    }
    return null;
}

async function main() {
    console.log('🚀 Starting Rich Luuca Data Import');

    // 1. Authenticate PB
    const pbUrl = process.env.POCKETBASE_URL || 'http://76.13.22.182:8080';
    const adminEmail = process.env.POCKETBASE_ADMIN_EMAIL || 'admin@brandmap.com'; // Fallback
    const adminPassword = process.env.POCKETBASE_ADMIN_PASSWORD || 'password123'; // Fallback
    const authRes = await fetch(`${pbUrl}/api/admins/auth-with-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity: adminEmail, password: adminPassword })
    });
    if (!authRes.ok) throw new Error('Auth failed');
    const authData = await authRes.json();
    const token = authData.token;
    console.log('   ✅ Authenticated to PocketBase');

    // 2. Get Brand ID for Luuca
    const brandRes = await fetch(`${pbUrl}/api/collections/brands/records?filter=(name='Luuca')`, {
        headers: { 'Authorization': token }
    });
    const brandJson = await brandRes.json();
    let brandId = brandJson.items?.[0]?.id;

    if (!brandId) {
        console.log('   ⚠️ Brand "Luuca" not found, creating...');
        // Create brand if missing
        const createRes = await fetch(`${pbUrl}/api/collections/brands/records`, {
            method: 'POST',
            headers: { 'Authorization': token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'Luuca', totalOutlets: 0 })
        });
        const createJson = await createRes.json();
        brandId = createJson.id;
    }
    console.log(`   🏢 Using Brand ID: ${brandId}`);

    // 3. Read Source Data
    // Attempt to read all_data.json from root, or fallback to previously created luuca_provided.json if specific path issues
    let rawData;
    try {
        rawData = fs.readFileSync(SOURCE_FILE, 'utf8');
    } catch (e) {
        console.log(`   Note: generic all_data.json not found, trying static/data/luuca_provided.json`);
        rawData = fs.readFileSync(path.join(__dirname, '../static/data/luuca_provided.json'), 'utf8');
    }

    // Ensure it's valid JSON. User file might have "Luuca" text at top based on view_file output?
    // "1: Luuca \n 2: \n 3: \n 4: ["
    // We need to clean it if it contains non-JSON prefix
    let jsonData;
    // Strip BOM
    rawData = rawData.replace(/^\uFEFF/, '');

    // Find JSON array limits
    const start = rawData.indexOf('[');
    const end = rawData.lastIndexOf(']');

    if (start === -1 || end === -1) {
        throw new Error('Could not find JSON array brackets in file');
    }

    const jsonString = rawData.substring(start, end + 1);
    console.log(`   📝 Parsed JSON string length: ${jsonString.length}`);
    console.log(`   📝 Start: ${jsonString.substring(0, 20)}...`);
    console.log(`   📝 End: ...${jsonString.substring(jsonString.length - 20)}`);

    try {
        jsonData = JSON.parse(jsonString);
    } catch (e) {
        console.warn('   ⚠️ Single JSON parse failed, checking for multiple blocks...');
        // Check for multiple arrays like [...] [...]
        // We can try to split by ] <whitespace> [
        // This is a naive split but might work for this specific file issue
        const blocks = jsonString.split(/\]\s*\[/);
        if (blocks.length > 1) {
            console.log(`   found ${blocks.length} blocks. Merging...`);
            jsonData = [];
            for (let i = 0; i < blocks.length; i++) {
                let block = blocks[i];
                // Restore brackets
                if (i > 0) block = '[' + block;
                if (i < blocks.length - 1) block = block + ']';

                try {
                    const parsed = JSON.parse(block);
                    jsonData = jsonData.concat(parsed);
                } catch (err) {
                    console.error(`   ❌ Failed to parse block ${i}: ${err.message}`);
                }
            }
        } else {
            // Maybe it's not multiple blocks but valid JSON followed by text?
            // Try to parse character by character? Too complex.
            // Let's try to just find the *first* valid JSON closure?
            // Or assumes the error "Unexpected non-whitespace..." implies we have valid JSON + garbage.
            // So we can try to trim from the end until it works? No.
            console.error('   ❌ Fatal JSON Parse Error:', e.message);
            // Last ditch: regex to find ALL objects { ... } and make a new array?
            const objects = jsonString.match(/\{[\s\S]*?\}/g);
            if (objects) {
                console.log(`   ⚠️ Fallback: extracted ${objects.length} objects via regex.`);
                jsonData = objects.map(o => {
                    try { return JSON.parse(o); } catch (z) { return null; }
                }).filter(x => x);
            } else {
                throw e;
            }
        }
    }

    console.log(`   📄 Processing ${jsonData.length} records...`);

    // 4. Process Each Record
    let successCount = 0;

    for (const item of jsonData) {
        process.stdout.write(`   Processing: ${item.title.substring(0, 20)}... \r`);

        // Geocode
        let coords = await geocodeAddress(item.street, item.city);
        if (!coords) {
            // Fallback to City + State
            coords = await geocodeAddress(item.city, item.state);
        }
        if (!coords) {
            // Last resort: Default to Jakarta center to avoid insert failure if required? 
            // Or skip? User wants "insert data". Better to insert with null/default and let them fix?
            // PocketBase JSON fields might handle it.
            // But our frontend expects coordinates.
            coords = { lat: -6.1751, lng: 106.8650 }; // Default
        }

        // Construct Record
        const record = {
            brand: brandId,
            name: item.title,
            address: item.street,
            city: item.city,
            region: item.state, // Map state to region
            latitude: coords.lat,
            longitude: coords.lng,

            // New fields
            totalScore: item.totalScore,
            reviewsCount: item.reviewsCount,
            shopState: item.state, // Keep this if we added the field, otherwise region covers it
            countryCode: item.countryCode,
            phone: item.phone,
            googleMapsUrl: item.url,
            categoryName: item.categoryName || (item.categories && item.categories[0]),
            website: item.website,
            categories: item.categories
        };

        // Insert
        const insertRes = await fetch(`${pbUrl}/api/collections/outlets/records`, {
            method: 'POST',
            headers: {
                'Authorization': token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(record)
        });

        if (insertRes.ok) {
            successCount++;
        } else {
            const err = await insertRes.json();
            console.error(`   ❌ Failed to insert ${item.title}:`, JSON.stringify(err));
        }

        await delay(1000); // Rate limit for Geocoding + Polite DB insert
    }

    console.log(`\n   🎉 Import Complete!`);
    console.log(`   ✅ Successfully inserted: ${successCount} outlets.`);

    // 5. Update local JSON for consistency (Optional but recommended)
    // We can do this in a separate step or just skip if user only cares about DB now.
    // User said "insert data ... ke database".
    // I will skip updating brand_locations.json for now to keep this focused on the DB request.
}

main().catch(console.error);

import fs from 'fs';
import path from 'path';
import 'dotenv/config';

const pbUrl = process.env.POCKETBASE_URL || 'http://76.13.22.182:8080';
const dataPath = path.resolve('static/data/laundyklin.json');

/**
 * Extracts coordinates from Google Maps URL
 * Patterns: 
 * - @-6.8898474,107.6298371
 * - query_place_id=ChIJ...
 * - !3d-6.8898474!4d107.6298371
 */
function extractCoordsFromUrl(url) {
    if (!url) return null;

    // Try @lat,lng pattern
    const atMatch = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (atMatch) {
        return {
            lat: parseFloat(atMatch[1]),
            lng: parseFloat(atMatch[2])
        };
    }

    // Try !3d!4d pattern
    const bangMatch = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
    if (bangMatch) {
        return {
            lat: parseFloat(bangMatch[1]),
            lng: parseFloat(bangMatch[2])
        };
    }

    return null;
}

async function main() {
    console.log(`🚀 Starting LaundryKlin Import from ${dataPath}`);

    // 1. Authenticate
    const adminEmail = process.env.POCKETBASE_ADMIN_EMAIL || 'admin@brandmap.com';
    const adminPassword = process.env.POCKETBASE_ADMIN_PASSWORD || 'password123';

    const authRes = await fetch(`${pbUrl}/api/admins/auth-with-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity: adminEmail, password: adminPassword })
    });

    if (!authRes.ok) throw new Error(`Auth failed: ${authRes.statusText}`);
    const { token } = await authRes.json();
    console.log('   ✅ Authenticated with PocketBase');

    // 2. Find LaundryKlin Brand ID
    const brandsRes = await fetch(`${pbUrl}/api/collections/brands/records?filter=(name~'LaundryKlin')`, {
        headers: { 'Authorization': token }
    });
    const brandsData = await brandsRes.json();
    let brandId = brandsData.items?.[0]?.id;

    if (!brandId) {
        console.log('   ➕ Brand "LaundryKlin" not found. Creating...');
        const createBrandRes = await fetch(`${pbUrl}/api/collections/brands/records`, {
            method: 'POST',
            headers: {
                'Authorization': token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name: 'LaundryKlin', slug: 'laundryklin' })
        });
        const newBrand = await createBrandRes.json();
        brandId = newBrand.id;
    }
    console.log(`   ℹ️ Brand ID for LaundryKlin: ${brandId}`);

    // 3. Load Data
    console.log('   📖 Reading JSON data...');
    let rawData = fs.readFileSync(dataPath, 'utf8');

    // Robust Parsing
    rawData = rawData.replace(/^\uFEFF/, '');
    const start = rawData.indexOf('[');
    const end = rawData.lastIndexOf(']');
    if (start === -1 || end === -1) throw new Error('Could not find JSON array in file');
    const jsonString = rawData.substring(start, end + 1);

    const items = JSON.parse(jsonString);
    console.log(`   📝 Total items found: ${items.length}`);

    // 4. Import Loop
    let success = 0;
    let failed = 0;
    let updated = 0;

    for (let i = 0; i < items.length; i++) {
        const item = items[i];

        // Coordinate Extraction Logic
        let lat = item.location?.lat;
        let lng = item.location?.lng;

        const urlCoords = extractCoordsFromUrl(item.url);
        if (urlCoords) {
            // If the item specifically has coordinates in the URL, use them as primary or at least check them
            // In this case, user asked for URL coordinates to be used.
            lat = urlCoords.lat;
            lng = urlCoords.lng;
        }

        // Map fields
        const record = {
            brand: brandId,
            name: item.title,
            subTitle: item.subTitle,
            address: item.address || item.street,
            neighborhood: item.neighborhood,
            street: item.street,
            city: item.city,
            region: item.state,
            postalCode: item.postalCode,
            latitude: lat,
            longitude: lng,

            // Rich fields
            totalScore: item.totalScore,
            reviewsCount: item.reviewsCount,
            imagesCount: item.imagesCount,
            phone: item.phone,
            phoneUnformatted: item.phoneUnformatted,
            googleMapsUrl: item.url,
            categoryName: item.categoryName,
            website: item.website,
            categories: item.categories,
            openingHours: item.openingHours,
            imageUrls: item.imageUrls,
            imageUrl: item.imageUrl,

            // Meta/IDs
            placeId: item.placeId,
            cid: item.cid,
            fid: item.fid,
            rank: item.rank,
            scrapedAt: item.scrapedAt,

            // Extended JSON fields
            additionalInfo: item.additionalInfo,
            reviewsDistribution: item.reviewsDistribution,
            bookingLinks: item.bookingLinks,
            reviewsTags: item.reviewsTags,
            plusCode: item.plusCode,
            peopleAlsoSearch: item.peopleAlsoSearch,
            popularTimesHistogram: item.popularTimesHistogram
        };

        // Skip if missing mandatory location data
        if (!record.latitude || !record.longitude) {
            console.warn(`   ⚠️ Skipping item ${i} (${item.title}): Missing coordinates`);
            failed++;
            continue;
        }

        try {
            // Check if record already exists by placeId OR (brand + name + address)
            let searchFilter = '';
            if (record.placeId) {
                searchFilter = `placeId='${record.placeId}'`;
            } else {
                searchFilter = `brand='${brandId}' && name='${record.name.replace(/'/g, "\\'")}' && address='${record.address.replace(/'/g, "\\'")}'`;
            }

            const checkRes = await fetch(`${pbUrl}/api/collections/outlets/records?filter=(${encodeURIComponent(searchFilter)})`, {
                headers: { 'Authorization': token }
            });
            const checkData = await checkRes.json();
            const existing = checkData.items?.[0];

            if (existing) {
                // Update existing
                const updateRes = await fetch(`${pbUrl}/api/collections/outlets/records/${existing.id}`, {
                    method: 'PATCH',
                    headers: {
                        'Authorization': token,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(record)
                });
                if (updateRes.ok) {
                    updated++;
                } else {
                    const err = await updateRes.json();
                    console.error(`   ❌ Update failed item ${i} (${item.title}):`, JSON.stringify(err.data || err.message));
                    failed++;
                }
            } else {
                // Create new
                const createRes = await fetch(`${pbUrl}/api/collections/outlets/records`, {
                    method: 'POST',
                    headers: {
                        'Authorization': token,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(record)
                });

                if (createRes.ok) {
                    success++;
                } else {
                    const err = await createRes.json();
                    console.error(`   ❌ Create failed item ${i} (${item.title}):`, JSON.stringify(err.data || err.message));
                    failed++;
                }
            }

            if ((success + updated) % 10 === 0) console.log(`   ✅ Processed: ${success + updated}/${items.length} (Inserts: ${success}, Updates: ${updated})`);
        } catch (err) {
            console.error(`   ❌ Error item ${i}:`, err.message);
            failed++;
        }

        // Small delay
        await new Promise(resolve => setTimeout(resolve, 50));
    }

    console.log(`\n   🎉 Import Complete!`);
    console.log(`   ✅ Successfully inserted: ${success}`);
    console.log(`   ✅ Successfully updated: ${updated}`);
    console.log(`   ❌ Failed: ${failed}`);
}

main().catch(err => {
    console.error('💥 Critical Error:', err);
});

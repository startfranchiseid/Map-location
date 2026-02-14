// Script to update PocketBase outlets with imageUrl and imageUrls from original JSON files
const PocketBase = require('pocketbase');
const fs = require('fs');
const path = require('path');

const PB_URL = 'https://pocketbase.startfranchise.id';
const ADMIN_EMAIL = 'startfranchise.id@gmail.com';
const ADMIN_PASSWORD = 'Admin.startfranchise@123';

const brandFiles = [
    { file: 'baliren.json', brand: 'Ba Li Ren' },
    { file: 'baso_goreng_gg.json', brand: 'Baso Goreng GG' },
    { file: 'bingxue.json', brand: 'Bingxue' },
    { file: 'chifry.json', brand: 'Chifry' },
    { file: 'deft_barber.json', brand: 'Deft Barber' },
    { file: 'E&W_Burgers.json', brand: 'E&W Burgers' },
    { file: 'icanread.json', brand: 'I Can Read' },
    { file: 'kumon.json', brand: 'Kumon' },
    { file: 'laundry_klin.json', brand: 'Laundry Klin' },
    { file: 'luuca.json', brand: 'Luuca' },
    { file: 'sambal_bakar.json', brand: 'Sambal Bakar' },
    { file: 'umc_ucmas.json', brand: 'UMC UCMAS Indonesia' },
    { file: 'zhengda.json', brand: 'Zhengda' },
];

async function main() {
    const pb = new PocketBase.default(PB_URL);

    // Auth
    console.log('Authenticating...');
    const authRes = await fetch(`${PB_URL}/api/admins/auth-with-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity: ADMIN_EMAIL, password: ADMIN_PASSWORD })
    });
    const authData = await authRes.json();
    if (!authData.token) {
        console.error('Auth failed:', authData);
        return;
    }
    const token = authData.token;
    console.log('Authenticated successfully');

    // Fetch all outlets from PB
    console.log('Fetching all outlets...');
    let allOutlets = [];
    let page = 1;
    while (true) {
        const res = await fetch(`${PB_URL}/api/collections/outlets/records?page=${page}&perPage=500&fields=id,name,latitude,longitude,imageUrl,imageUrls`, {
            headers: { 'Authorization': token }
        });
        const data = await res.json();
        allOutlets.push(...data.items);
        if (data.page >= data.totalPages) break;
        page++;
    }
    console.log(`Fetched ${allOutlets.length} outlets from PocketBase`);

    let updated = 0;
    let skipped = 0;
    let notFound = 0;

    for (const bf of brandFiles) {
        const filePath = path.join(__dirname, '..', bf.file);
        if (!fs.existsSync(filePath)) {
            console.log(`  ⚠ File not found: ${bf.file}`);
            continue;
        }

        const jsonData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        console.log(`\n📦 ${bf.brand} (${bf.file}): ${jsonData.length} items`);

        for (const item of jsonData) {
            // Support both formats: item.latitude/longitude or item.location.lat/lng
            const lat = item.latitude || (item.location && item.location.lat);
            const lng = item.longitude || (item.location && item.location.lng);
            if (!lat || !lng) continue;

            const imageUrl = item.imageUrl || '';
            const imageUrls = item.imageUrls || [];
            
            if (!imageUrl && imageUrls.length === 0) {
                skipped++;
                continue;
            }

            // Match by coordinates (most reliable)
            const match = allOutlets.find(o => 
                Math.abs(o.latitude - lat) < 0.0001 && 
                Math.abs(o.longitude - lng) < 0.0001
            );

            if (!match) {
                notFound++;
                continue;
            }

            // Skip if already has images
            if (match.imageUrl || (match.imageUrls && match.imageUrls.length > 0)) {
                skipped++;
                continue;
            }

            // Update the record
            try {
                const updateRes = await fetch(`${PB_URL}/api/collections/outlets/records/${match.id}`, {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': token
                    },
                    body: JSON.stringify({
                        imageUrl: imageUrl,
                        imageUrls: imageUrls
                    })
                });

                if (updateRes.ok) {
                    updated++;
                    // Update local cache too
                    match.imageUrl = imageUrl;
                    match.imageUrls = imageUrls;
                } else {
                    const err = await updateRes.json();
                    console.log(`  ✗ Failed to update ${match.name}: ${JSON.stringify(err)}`);
                }
            } catch (e) {
                console.log(`  ✗ Error updating ${match.name}: ${e.message}`);
            }

            // Small delay to avoid rate limiting
            if (updated % 50 === 0 && updated > 0) {
                console.log(`  ... ${updated} updated so far`);
                await new Promise(r => setTimeout(r, 200));
            }
        }
    }

    console.log(`\n✅ Done! Updated: ${updated}, Skipped: ${skipped}, Not found: ${notFound}`);
}

main().catch(console.error);

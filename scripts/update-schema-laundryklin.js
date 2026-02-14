import 'dotenv/config';

async function main() {
    const pbUrl = process.env.POCKETBASE_URL || 'http://76.13.22.182:8080';
    console.log(`🚀 Updating schema for LaundryKlin at ${pbUrl}`);

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
    console.log('   ✅ Authenticated');

    // 2. Get current schema
    console.log('📦 Fetching "outlets" collection info...');
    const colRes = await fetch(`${pbUrl}/api/collections/outlets`, {
        headers: { 'Authorization': token }
    });
    if (!colRes.ok) throw new Error(`Failed to fetch collection: ${colRes.statusText}`);
    const collection = await colRes.json();

    // v0.22- uses 'schema', v0.23+ uses 'fields'
    const isV23 = !!collection.fields;
    const existingFields = collection.fields || collection.schema || [];
    const collectionId = collection.id;

    console.log(`   ℹ️ Detected PB Version: ${isV23 ? 'v0.23+' : 'v0.22-'}`);

    // 3. Define new fields to add based on LaundryKlin rich data
    const targetFields = [
        { name: 'subTitle', type: 'text', required: false },
        { name: 'neighborhood', type: 'text', required: false },
        { name: 'street', type: 'text', required: false },
        { name: 'city', type: 'text', required: false },
        { name: 'region', type: 'text', required: false },
        { name: 'postalCode', type: 'text', required: false },
        { name: 'phone', type: 'text', required: false },
        { name: 'phoneUnformatted', type: 'text', required: false },
        { name: 'totalScore', type: 'number', required: false },
        { name: 'reviewsCount', type: 'number', required: false },
        { name: 'imagesCount', type: 'number', required: false },
        { name: 'placeId', type: 'text', required: false },
        { name: 'cid', type: 'text', required: false },
        { name: 'fid', type: 'text', required: false },
        { name: 'rank', type: 'number', required: false },
        { name: 'scrapedAt', type: 'text', required: false },
        { name: 'imageUrl', type: 'text', required: false },
        { name: 'website', type: 'text', required: false },
        { name: 'plusCode', type: 'text', required: false },
        { name: 'categories', type: 'json', required: false, options: { maxSize: 2000000 } },
        { name: 'openingHours', type: 'json', required: false, options: { maxSize: 2000000 } },
        { name: 'imageUrls', type: 'json', required: false, options: { maxSize: 2000000 } },
        { name: 'additionalInfo', type: 'json', required: false, options: { maxSize: 2000000 } },
        { name: 'reviewsDistribution', type: 'json', required: false, options: { maxSize: 2000000 } },
        { name: 'bookingLinks', type: 'json', required: false, options: { maxSize: 2000000 } },
        { name: 'reviewsTags', type: 'json', required: false, options: { maxSize: 2000000 } },
        { name: 'peopleAlsoSearch', type: 'json', required: false, options: { maxSize: 2000000 } },
        { name: 'popularTimesHistogram', type: 'json', required: false, options: { maxSize: 2000000 } }
    ];

    // Re-fetch latest collection state
    const latestRes = await fetch(`${pbUrl}/api/collections/${collectionId}`, {
        headers: { 'Authorization': token }
    });
    const latestCol = await latestRes.json();
    const currentFields = latestCol.fields || latestCol.schema || [];

    let updated = false;
    for (const field of targetFields) {
        if (!currentFields.find(f => f.name === field.name)) {
            console.log(`   ➕ Queueing field: ${field.name}`);
            currentFields.push(field);
            updated = true;
        }
    }

    if (updated) {
        console.log(`💾 Saving batch updates for collection ID: ${collectionId}...`);
        const updateBody = isV23 ? { fields: currentFields } : { schema: currentFields };

        const saveRes = await fetch(`${pbUrl}/api/collections/${collectionId}`, {
            method: 'PATCH',
            headers: {
                'Authorization': token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(updateBody)
        });

        if (!saveRes.ok) {
            const err = await saveRes.json();
            console.error(`   ❌ Failed to save batch update:`, JSON.stringify(err, null, 2));
            if (err.data) {
                for (const key in err.data) {
                    console.error(`      Error in "${key}":`, JSON.stringify(err.data[key]));
                }
            }
        } else {
            console.log(`   ✅ Batch update successful!`);
        }
    } else {
        console.log(`   ℹ️ All fields already exist.`);
    }

    console.log('🏁 Schema update process complete.');
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});

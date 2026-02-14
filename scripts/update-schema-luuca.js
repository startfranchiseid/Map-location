import PocketBase from 'pocketbase';
import 'dotenv/config';

async function main() {
    const pbUrl = process.env.POCKETBASE_URL || 'http://76.13.22.182:8080';
    const pb = new PocketBase(pbUrl);

    // Authenticate as superuser
    console.log('🔐 Authenticating...');
    // We need to use manual fetch for admin authentication if SDK fails, or try SDK first.
    // Based on previous issues, SDK might have issues. Let's try the fetch bypass logic if SDK fails.
    // But for schema updates, we really need the Admin service from SDK or raw API calls to /api/collections.

    // Try manual fetch for auth to get token, then use that token with PB instance if needed.
    // Or just use raw fetch for everything to be safe.

    const adminEmail = process.env.POCKETBASE_ADMIN_EMAIL || 'admin@brandmap.com'; // Add fallback if needed or let it fail
    const adminPassword = process.env.POCKETBASE_ADMIN_PASSWORD || 'password123'; // Placeholder, hopefully env is loaded

    // Actually, let's just fix the fetch URL
    const authRes = await fetch(`${pbUrl}/api/admins/auth-with-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity: adminEmail, password: adminPassword })
    });

    if (!authRes.ok) {
        throw new Error(`Auth failed: ${authRes.statusText}`);
    }

    const authData = await authRes.json();
    const token = authData.token;
    console.log('   ✅ Authenticated');

    // Get current 'outlets' schema
    console.log('📦 Fetching "outlets" collection schema...');
    const colRes = await fetch(`${pbUrl}/api/collections/outlets`, {
        headers: { 'Authorization': token }
    });

    if (!colRes.ok) {
        throw new Error(`Failed to fetch collection: ${colRes.statusText}`);
    }

    const collection = await colRes.json();
    const fields = collection.schema; // 'schema' is the array of fields in v0.22-
    // OR 'fields' in v0.23+?
    // Let's check the response structure. Usually it's 'schema' array for legacy/v0.22, but new PB uses 'fields' array in v0.23+.
    // My previous scripts used 'schema' successfully? Or faced issues?
    // Let's assume it has 'schema' or 'fields'. We will check both.

    const existingSchema = collection.schema || [];

    // Define new fields
    const newFields = [
        { name: 'totalScore', type: 'number', required: false },
        { name: 'reviewsCount', type: 'number', required: false },
        { name: 'countryCode', type: 'text', required: false },
        { name: 'phone', type: 'text', required: false },
        { name: 'googleMapsUrl', type: 'url', required: false },
        { name: 'categoryName', type: 'text', required: false },
        { name: 'website', type: 'url', required: false }, // Some outlets have specific websites
        { name: 'categories', type: 'json', required: false },
        { name: 'shopState', type: 'text', required: false } // 'state' from JSON
    ];

    let schemaUpdated = false;

    for (const field of newFields) {
        const exists = existingSchema.find(f => f.name === field.name);
        if (!exists) {
            console.log(`   ➕ Adding field: ${field.name} (${field.type})`);
            existingSchema.push({
                name: field.name,
                type: field.type,
                required: field.required,
                options: {}
            });
            schemaUpdated = true;
        }
    }

    if (schemaUpdated) {
        console.log('💾 Saving schema updates...');

        // Prepare update body
        // Note: For v0.23+, we might need to send 'fields' instead of 'schema'.
        // But usually 'schema' works for backward compat if the server is slightly older or supports it.
        // Let's try sending the updated schema.

        const updateBody = {
            schema: existingSchema
        };

        const updateRes = await fetch(`${pbUrl}/api/collections/outlets`, {
            method: 'PATCH',
            headers: {
                'Authorization': token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(updateBody)
        });

        if (!updateRes.ok) {
            // Try fallback for newer PB versions (fields property)
            console.warn('   ⚠️ Failed with "schema", trying "fields"...');
            // If schema is array, it might be the old format.
            // If strict v0.23+, we might need to construct the fields array differently.
            // But let's hope this works or error gives a clue.
            const err = await updateRes.json();
            console.error('   ❌ Error details:', JSON.stringify(err, null, 2));
            throw new Error('Schema update failed');
        }

        console.log('   ✅ Schema updated successfully!');
    } else {
        console.log('   ℹ️ No schema changes needed.');
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});

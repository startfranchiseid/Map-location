/**
 * Phase 1: Setup Collections - Attempt 3
 * Reverted to using 'schema' property as 'fields' failed with blank validation
 */

import PocketBase from 'pocketbase';

const PB_URL = 'http://76.13.22.182:8080';
const ADMIN_EMAIL = 'startfranchise.id@gmail.com';
const ADMIN_PASSWORD = 'Admin.startfranchise@123';

const pb = new PocketBase(PB_URL);

async function main() {
    console.log('🚀 Phase 1: Setup Collections (Attempt 3)');
    console.log('='.repeat(50));

    // 1. Authenticate
    console.log('\n🔐 Authenticating...');
    const authRes = await fetch(`${PB_URL}/api/admins/auth-with-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity: ADMIN_EMAIL, password: ADMIN_PASSWORD })
    });

    if (!authRes.ok) throw new Error(`Auth failed: ${authRes.statusText}`);
    const authData = await authRes.json();
    pb.authStore.save(authData.token, authData.admin);
    console.log('   ✅ Authenticated');

    // 2. Delete Existing
    console.log('\n🗑️  Cleaning up...');
    try {
        const collections = await pb.collections.getFullList().catch(() => []);
        const outletsCol = collections.find(c => c.name === 'outlets');
        const brandsCol = collections.find(c => c.name === 'brands');

        if (outletsCol) await pb.collections.delete(outletsCol.id);
        if (brandsCol) await pb.collections.delete(brandsCol.id);
        console.log('   ✓ Deleted existing');
    } catch (e) { }

    // 3. Create Brands
    console.log('\n📦 Creating Brands Collection...');
    let brandsCol;
    try {
        // Fallback to 'schema' property
        brandsCol = await pb.collections.create({
            name: 'brands',
            type: 'base',
            schema: [
                { name: 'name', type: 'text', required: true },
                { name: 'category', type: 'text', required: false },
                { name: 'website', type: 'url', required: false },
                { name: 'logo', type: 'file', options: { maxSelect: 1, maxSize: 5242880, mimeTypes: ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] } },
                { name: 'color', type: 'text', required: false },
                { name: 'icon', type: 'text', required: false },
                { name: 'total_outlets', type: 'number', required: false }
            ]
        });
        console.log(`   ✅ Created Brands (ID: ${brandsCol.id})`);
    } catch (e) {
        console.error('   ❌ Brands Error:', e.message);
        if (e.data) console.error('   Data:', JSON.stringify(e.data, null, 2));
        return;
    }

    // 4. Create Outlets
    console.log('\n📦 Creating Outlets Collection...');
    try {
        const outletsCol = await pb.collections.create({
            name: 'outlets',
            type: 'base',
            schema: [
                {
                    name: 'brand',
                    type: 'relation',
                    required: true,
                    options: {
                        collectionId: brandsCol.id,
                        cascadeDelete: true,
                        maxSelect: 1,
                        displayFields: ['name']
                    }
                },
                { name: 'name', type: 'text', required: true },
                { name: 'address', type: 'text', required: false },
                { name: 'city', type: 'text', required: false },
                { name: 'region', type: 'text', required: false },
                { name: 'latitude', type: 'number', required: true },
                { name: 'longitude', type: 'number', required: true }
            ]
        });
        console.log(`   ✅ Created Outlets (ID: ${outletsCol.id})`);
    } catch (e) {
        console.error('   ❌ Outlets Error:', e.message);
        if (e.data) console.error('   Data:', JSON.stringify(e.data, null, 2));
    }
}

main().catch(console.error);

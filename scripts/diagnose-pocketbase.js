/**
 * PocketBase Diagnostics & Setup
 * Checks connection, lists collections, and creates missing ones
 */

import PocketBase from 'pocketbase';

const PB_URL = 'http://76.13.22.182';
const ADMIN_EMAIL = 'startfranchise.id@gmail.com';
const ADMIN_PASSWORD = 'Admin.startfranchise@123';

const pb = new PocketBase(PB_URL);

async function main() {
    console.log('🔍 PocketBase Diagnostics');
    console.log('='.repeat(50));
    console.log(`📡 URL: ${PB_URL}`);

    // Test health
    console.log('\n1️⃣ Testing connection...');
    try {
        const health = await fetch(`${PB_URL}/api/health`);
        const data = await health.json();
        console.log('   ✅ Health check passed:', data);
    } catch (e) {
        console.log('   ❌ Health check failed:', e.message);
    }

    // Authenticate
    console.log('\n2️⃣ Authenticating...');
    try {
        await pb.collection('_superusers').authWithPassword(ADMIN_EMAIL, ADMIN_PASSWORD);
        console.log('   ✅ Authenticated as superuser');
    } catch (e) {
        console.log('   ⚠️  Superuser auth failed, trying legacy...');
        try {
            await pb.admins.authWithPassword(ADMIN_EMAIL, ADMIN_PASSWORD);
            console.log('   ✅ Authenticated as admin (legacy)');
        } catch (e2) {
            console.log('   ❌ Authentication failed:', e2.message);
            console.log('   Response:', JSON.stringify(e2.response || e2.data || {}, null, 2));
            return;
        }
    }

    // List all collections
    console.log('\n3️⃣ Listing collections...');
    try {
        const collections = await pb.collections.getFullList();
        console.log(`   Found ${collections.length} collections:`);
        for (const col of collections) {
            const fieldNames = col.schema?.map(f => f.name) || [];
            console.log(`   - ${col.name} (${col.id}): [${fieldNames.join(', ')}]`);
        }
    } catch (e) {
        console.log('   ❌ Failed to list collections:', e.message);
    }

    // Check categories collection
    console.log('\n4️⃣ Checking "categories" collection...');
    let categoriesId = null;
    try {
        const categories = await pb.collections.getOne('categories');
        categoriesId = categories.id;
        console.log(`   ✅ Exists (ID: ${categories.id})`);
        console.log('   Fields:', categories.schema?.map(f => `${f.name}(${f.type})`).join(', ') || 'none');
    } catch {
        console.log('   ⚠️  Does not exist. Creating...');
        try {
            const created = await pb.collections.create({
                name: 'categories',
                type: 'base',
                schema: [
                    { name: 'name', type: 'text', required: true },
                    { name: 'description', type: 'text' },
                    { name: 'icon', type: 'text' },
                    { name: 'color', type: 'text' }
                ],
                listRule: '',
                viewRule: ''
            });
            categoriesId = created.id;
            console.log(`   ✅ Created (ID: ${created.id})`);
        } catch (e) {
            console.log('   ❌ Failed to create:', e.message);
            console.log('   Data:', JSON.stringify(e.data || e.response || {}, null, 2));
        }
    }

    // Check brands collection
    console.log('\n5️⃣ Checking "brands" collection...');
    let brandsId = null;
    try {
        const brands = await pb.collections.getOne('brands');
        brandsId = brands.id;
        console.log(`   ✅ Exists (ID: ${brands.id})`);
        console.log('   Fields:', brands.schema?.map(f => `${f.name}(${f.type})`).join(', ') || 'none');
    } catch {
        console.log('   ⚠️  Does not exist. Creating...');
        try {
            const created = await pb.collections.create({
                name: 'brands',
                type: 'base',
                schema: [
                    { name: 'name', type: 'text', required: true },
                    { name: 'category', type: 'relation', options: { collectionId: categoriesId, cascadeDelete: false, maxSelect: 1 } },
                    { name: 'website', type: 'url' },
                    { name: 'logo', type: 'file', options: { maxSelect: 1, maxSize: 5242880, mimeTypes: ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] } },
                    { name: 'color', type: 'text' },
                    { name: 'icon', type: 'text' },
                    { name: 'total_outlets', type: 'number' }
                ],
                listRule: '',
                viewRule: ''
            });
            brandsId = created.id;
            console.log(`   ✅ Created (ID: ${created.id})`);
        } catch (e) {
            console.log('   ❌ Failed to create:', e.message);
            console.log('   Data:', JSON.stringify(e.data || e.response || {}, null, 2));
        }
    }

    // Check outlets collection
    console.log('\n6️⃣ Checking "outlets" collection...');
    try {
        const outlets = await pb.collections.getOne('outlets');
        console.log(`   ✅ Exists (ID: ${outlets.id})`);
        console.log('   Fields:', outlets.schema?.map(f => `${f.name}(${f.type})`).join(', ') || 'none');
    } catch {
        console.log('   ⚠️  Does not exist. Creating...');
        if (!brandsId) {
            console.log('   ❌ Cannot create outlets without brands collection ID');
            return;
        }
        try {
            const created = await pb.collections.create({
                name: 'outlets',
                type: 'base',
                schema: [
                    { name: 'brand', type: 'relation', required: true, options: { collectionId: brandsId, cascadeDelete: false, maxSelect: 1 } },
                    { name: 'name', type: 'text', required: true },
                    { name: 'address', type: 'text' },
                    { name: 'city', type: 'text' },
                    { name: 'region', type: 'text' },
                    { name: 'latitude', type: 'number', required: true },
                    { name: 'longitude', type: 'number', required: true }
                ],
                listRule: '',
                viewRule: ''
            });
            console.log(`   ✅ Created (ID: ${created.id})`);
        } catch (e) {
            console.log('   ❌ Failed to create:', e.message);
            console.log('   Data:', JSON.stringify(e.data || e.response || {}, null, 2));
        }
    }

    // Count records
    console.log('\n7️⃣ Counting records...');
    try {
        const brands = await pb.collection('brands').getFullList();
        console.log(`   Brands: ${brands.length}`);
    } catch (e) {
        console.log('   Brands: Error -', e.message);
    }
    try {
        const outlets = await pb.collection('outlets').getFullList();
        console.log(`   Outlets: ${outlets.length}`);
    } catch (e) {
        console.log('   Outlets: Error -', e.message);
    }

    console.log('\n' + '='.repeat(50));
    console.log('✅ Diagnostics complete!');
}

main().catch(console.error);

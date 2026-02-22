/**
 * PocketBase Schema Update Script v3
 * Uses 'fields' instead of 'schema' for PocketBase v0.23+
 */

import PocketBase from 'pocketbase';

const PB_URL = 'http://76.13.22.182';
const ADMIN_EMAIL = 'startfranchise.id@gmail.com';
const ADMIN_PASSWORD = 'Admin.startfranchise@123';

const pb = new PocketBase(PB_URL);

// Field definitions for PocketBase v0.23+ format
const categoryFields = [
    { name: 'name', type: 'text', required: true },
    { name: 'description', type: 'text', required: false },
    { name: 'icon', type: 'text', required: false },
    { name: 'color', type: 'text', required: false }
];

const brandFields = (categoriesId) => [
    { name: 'name', type: 'text', required: true },
    {
        name: 'category',
        type: 'relation',
        required: false,
        options: {
            collectionId: categoriesId,
            cascadeDelete: false,
            maxSelect: 1
        }
    },
    { name: 'website', type: 'url', required: false },
    {
        name: 'logo',
        type: 'file',
        required: false,
        options: {
            maxSelect: 1,
            maxSize: 5242880,
            mimeTypes: ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml']
        }
    },
    { name: 'color', type: 'text', required: false },
    { name: 'icon', type: 'text', required: false },
    { name: 'total_outlets', type: 'number', required: false }
];

async function main() {
    console.log('🔧 PocketBase Schema Update v3 (for v0.23+)');
    console.log('='.repeat(50));

    // Authenticate
    console.log('\n🔐 Authenticating...');
    try {
        await pb.collection('_superusers').authWithPassword(ADMIN_EMAIL, ADMIN_PASSWORD);
        console.log('   ✅ Authenticated');
    } catch (e) {
        console.error('   ❌ Auth failed:', e.message);
        return;
    }

    // Delete existing empty collections and recreate
    console.log('\n�️ Deleting existing empty collections...');

    const allCollections = await pb.collections.getFullList();
    const categoriesCol = allCollections.find(c => c.name === 'categories');
    const brandsCol = allCollections.find(c => c.name === 'brands');
    const outletsCol = allCollections.find(c => c.name === 'outlets');

    // Delete outlets first (has foreign key to brands)
    if (outletsCol) {
        try {
            await pb.collections.delete(outletsCol.id);
            console.log('   Deleted outlets');
        } catch (e) {
            console.log('   Could not delete outlets:', e.message);
        }
    }

    // Delete brands
    if (brandsCol) {
        try {
            await pb.collections.delete(brandsCol.id);
            console.log('   Deleted brands');
        } catch (e) {
            console.log('   Could not delete brands:', e.message);
        }
    }

    // Wait a moment
    await new Promise(r => setTimeout(r, 1000));

    // Delete categories
    if (categoriesCol) {
        try {
            await pb.collections.delete(categoriesCol.id);
            console.log('   Deleted categories');
        } catch (e) {
            console.log('   Could not delete categories:', e.message);
        }
    }

    // Create categories collection
    console.log('\n📦 Creating "categories" collection...');
    let categoriesId;
    try {
        const result = await pb.collections.create({
            name: 'categories',
            type: 'base',
            fields: categoryFields,
            listRule: '',
            viewRule: ''
        });
        categoriesId = result.id;
        console.log(`   ✅ Created with ID: ${result.id}`);
    } catch (e) {
        console.error('   ❌ Failed with fields:', e.message);
        console.log('   Trying with schema property...');
        try {
            const result = await pb.collections.create({
                name: 'categories',
                type: 'base',
                schema: categoryFields,
                listRule: '',
                viewRule: ''
            });
            categoriesId = result.id;
            console.log(`   ✅ Created with ID: ${result.id}`);
        } catch (e2) {
            console.error('   ❌ Also failed with schema:', e2.message);
            console.error('   Data:', JSON.stringify(e2.data || {}, null, 2));
        }
    }

    if (!categoriesId) {
        console.log('\n❌ Could not create categories collection. Aborting.');
        return;
    }

    // Create brands collection with 'fields' property (v0.23+ API)
    console.log('\n📦 Creating "brands" collection...');
    let brandsId;
    try {
        // Try with 'fields' property (v0.23+)
        const result = await pb.collections.create({
            name: 'brands',
            type: 'base',
            fields: brandFields(categoriesId),
            listRule: '',
            viewRule: ''
        });
        brandsId = result.id;
        console.log(`   ✅ Created with ID: ${result.id}`);
        console.log(`   Fields property: ${result.fields?.length || 'undefined'}`);
        console.log(`   Schema property: ${result.schema?.length || 'undefined'}`);
    } catch (e) {
        console.error('   ❌ Failed with fields:', e.message);

        // Fallback to 'schema' property
        console.log('   Trying with schema property...');
        try {
            const result = await pb.collections.create({
                name: 'brands',
                type: 'base',
                schema: brandFields(categoriesId),
                listRule: '',
                viewRule: ''
            });
            brandsId = result.id;
            console.log(`   ✅ Created with ID: ${result.id}`);
        } catch (e2) {
            console.error('   ❌ Also failed with schema:', e2.message);
            console.error('   Data:', JSON.stringify(e2.data || {}, null, 2));
        }
    }

    if (!brandsId) {
        console.log('\n❌ Could not create brands collection. Aborting.');
        return;
    }

    // Create outlets collection
    console.log('\n📦 Creating "outlets" collection...');
    const outletFields = [
        {
            name: 'brand',
            type: 'relation',
            required: true,
            options: {
                collectionId: brandsId,
                cascadeDelete: false,
                maxSelect: 1
            }
        },
        { name: 'name', type: 'text', required: true },
        { name: 'address', type: 'text', required: false },
        { name: 'city', type: 'text', required: false },
        { name: 'region', type: 'text', required: false },
        { name: 'latitude', type: 'number', required: true },
        { name: 'longitude', type: 'number', required: true }
    ];

    try {
        const result = await pb.collections.create({
            name: 'outlets',
            type: 'base',
            fields: outletFields,
            listRule: '',
            viewRule: ''
        });
        console.log(`   ✅ Created with ID: ${result.id}`);
    } catch (e) {
        console.error('   ❌ Failed:', e.message);

        // Fallback
        try {
            const result = await pb.collections.create({
                name: 'outlets',
                type: 'base',
                schema: outletFields,
                listRule: '',
                viewRule: ''
            });
            console.log(`   ✅ Created with schema property: ${result.id}`);
        } catch (e2) {
            console.error('   ❌ Also failed:', e2.message);
        }
    }

    // Final verification
    console.log('\n📊 Final verification...');
    const finalCollections = await pb.collections.getFullList();
    for (const col of finalCollections) {
        if (col.name === 'brands' || col.name === 'outlets') {
            const fieldCount = col.fields?.length || col.schema?.length || 0;
            const fieldNames = (col.fields || col.schema || []).map(f => f.name);
            console.log(`   ${col.name}: ${fieldCount} fields [${fieldNames.join(', ')}]`);
        }
    }

    console.log('\n' + '='.repeat(50));
    console.log('✅ Done!');
}

main().catch(console.error);

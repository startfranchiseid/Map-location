/**
 * PocketBase Collection Setup Script
 * Creates collections with proper schema for Brand Map application.
 * 
 * Run: node scripts/create-collections.js
 */

import PocketBase from 'pocketbase';

// Configuration
const PB_URL = process.env.POCKETBASE_URL || 'http://76.13.22.182';
const ADMIN_EMAIL = process.env.POCKETBASE_ADMIN_EMAIL || 'startfranchise.id@gmail.com';
const ADMIN_PASSWORD = process.env.POCKETBASE_ADMIN_PASSWORD || 'Admin.startfranchise@123';

const pb = new PocketBase(PB_URL);

async function main() {
    console.log('🚀 PocketBase Collection Setup');
    console.log(`📡 Target: ${PB_URL}`);
    console.log('='.repeat(50));

    // 1. Authenticate
    console.log('\n🔐 Authenticating...');
    try {
        // Try superuser auth (PocketBase v0.23+)
        try {
            await pb.collection('_superusers').authWithPassword(ADMIN_EMAIL, ADMIN_PASSWORD);
            console.log('✅ Authenticated as superuser (v0.23+)');
        } catch (err) {
            // Fallback to old admin auth
            console.log('   (Trying legacy admin auth...)');
            await pb.admins.authWithPassword(ADMIN_EMAIL, ADMIN_PASSWORD);
            console.log('✅ Authenticated as admin (legacy)');
        }
    } catch (e) {
        console.error('❌ Authentication failed:', e.message);
        console.error('   Please check your admin credentials.');
        process.exit(1);
    }

    // 2. Create Collections
    const categoriesId = await createCategoriesCollection();
    const brandsId = await createBrandsCollection(categoriesId);
    await createOutletsCollection(brandsId);

    console.log('\n' + '='.repeat(50));
    console.log('✅ Collection Setup Complete!');
    console.log('   You can now import data or upload logos via the Admin UI.');
}

async function createCategoriesCollection() {
    console.log('\n📦 Setting up "categories" collection...');

    try {
        const existing = await pb.collections.getOne('categories');
        console.log(`  ⚠️  Collection "categories" already exists (ID: ${existing.id})`);
        console.log('      Updating schema...');

        await pb.collections.update(existing.id, {
            schema: [
                { name: 'name', type: 'text', required: true },
                { name: 'description', type: 'text', required: false },
                { name: 'icon', type: 'text', required: false },
                { name: 'color', type: 'text', required: false }
            ],
            listRule: '', // Public read
            viewRule: '',
            createRule: null, // Admin only
            updateRule: null,
            deleteRule: null
        });
        console.log('  ✅ Updated "categories" schema');
        return existing.id;
    } catch {
        console.log('  🆕 Creating "categories" collection...');
        const created = await pb.collections.create({
            name: 'categories',
            type: 'base',
            schema: [
                { name: 'name', type: 'text', required: true },
                { name: 'description', type: 'text', required: false },
                { name: 'icon', type: 'text', required: false },
                { name: 'color', type: 'text', required: false }
            ],
            listRule: '', // Public read
            viewRule: '',
            createRule: null, // Admin only
            updateRule: null,
            deleteRule: null
        });
        console.log(`  ✅ Created "categories" (ID: ${created.id})`);
        return created.id;
    }
}

async function createBrandsCollection(categoriesId) {
    console.log('\n📦 Setting up "brands" collection...');

    // Check if collection exists
    try {
        const existing = await pb.collections.getOne('brands');
        console.log(`  ⚠️  Collection "brands" already exists (ID: ${existing.id})`);
        console.log('      Updating schema...');

        // Update the collection to ensure all fields exist
        await pb.collections.update(existing.id, {
            schema: [
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
            ],
            listRule: '', // Public read
            viewRule: '',
            createRule: null, // Admin only
            updateRule: null,
            deleteRule: null
        });
        console.log('  ✅ Updated "brands" schema');
        return existing.id;
    } catch {
        // Collection doesn't exist, create it
        console.log('  🆕 Creating "brands" collection...');
        const created = await pb.collections.create({
            name: 'brands',
            type: 'base',
            schema: [
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
            ],
            listRule: '', // Public read
            viewRule: '',
            createRule: null, // Admin only
            updateRule: null,
            deleteRule: null
        });
        console.log(`  ✅ Created "brands" (ID: ${created.id})`);
        return created.id;
    }
}

async function createOutletsCollection(brandsCollectionId) {
    console.log('\n📦 Setting up "outlets" collection...');

    // Get brands collection ID for the relation
    console.log(`  ℹ️  Brands collection ID: ${brandsCollectionId}`);

    // Check if collection exists
    try {
        const existing = await pb.collections.getOne('outlets');
        console.log(`  ⚠️  Collection "outlets" already exists (ID: ${existing.id})`);
        console.log('      Updating schema...');

        // Update the collection to ensure all fields exist
        await pb.collections.update(existing.id, {
            schema: [
                {
                    name: 'brand',
                    type: 'relation',
                    required: true,
                    options: {
                        collectionId: brandsCollectionId,
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
            ],
            listRule: '', // Public read
            viewRule: '',
            createRule: null, // Admin only
            updateRule: null,
            deleteRule: null
        });
        console.log('  ✅ Updated "outlets" schema');
    } catch {
        // Collection doesn't exist, create it
        console.log('  🆕 Creating "outlets" collection...');
        const created = await pb.collections.create({
            name: 'outlets',
            type: 'base',
            schema: [
                {
                    name: 'brand',
                    type: 'relation',
                    required: true,
                    options: {
                        collectionId: brandsCollectionId,
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
            ],
            listRule: '', // Public read
            viewRule: '',
            createRule: null, // Admin only
            updateRule: null,
            deleteRule: null
        });
        console.log(`  ✅ Created "outlets" (ID: ${created.id})`);
    }
}

main();

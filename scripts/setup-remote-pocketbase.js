/**
 * Remote PocketBase Setup & Migration Script
 * Connects to remote PB, creates collections, and migrates data.
 * 
 * Run: node scripts/setup-remote-pocketbase.js
 */

import PocketBase from 'pocketbase';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuration
const PB_URL = 'http://76.13.22.182';
const ADMIN_EMAIL = 'startfranchise.id@gmail.com';
const ADMIN_PASSWORD = 'Admin.startfranchise@123';

const pb = new PocketBase(PB_URL);

async function main() {
    console.log('🚀 Remote PocketBase Setup & Migration');
    console.log(`📡 Target: ${PB_URL}`);
    console.log('='.repeat(50));

    // 1. Authenticate
    console.log('\n🔐 Authenticating...');
    try {
        try {
            // Try standard admin auth (works for < v0.23)
            // or new superuser auth (works for >= v0.23) via collection
            try {
                await pb.collection('_superusers').authWithPassword(ADMIN_EMAIL, ADMIN_PASSWORD);
                console.log('✅ Authenticated as superuser (v0.23+)');
            } catch (err) {
                // Fallback to old admin auth if _superusers collection doesn't exist or fails
                console.log('   (Superuser auth failed, trying legacy admin auth...)');
                await pb.admins.authWithPassword(ADMIN_EMAIL, ADMIN_PASSWORD);
                console.log('✅ Authenticated as admin (legacy)');
            }
        } catch (e) {
            console.error('❌ Authentication failed:', e.message);
            console.error('   URL:', e.url);
            console.error('   Status:', e.status);
            process.exit(1);
        }

        // 2. Create/Update Collections
        await setupCollections();

        // 3. Migrate Data
        await migrateData();

        console.log('\n' + '='.repeat(50));
        console.log('✅ Setup & Migration Complete!');

    } catch (error) {
        console.error('❌ Unexpected Error:', JSON.stringify(error, null, 2));
    }
}

async function setupCollections() {
    console.log('\n📦 Setting up collections...');

    // --- Categories Collection ---
    try {
        await pb.collections.getOne('categories');
        console.log('  ℹ️  Collection "categories" already exists.');
    } catch {
        console.log('  🆕 Creating "categories" collection...');
        await pb.collections.create({
            name: 'categories',
            type: 'base',
            schema: [
                { name: 'name', type: 'text', required: true },
                { name: 'description', type: 'text' },
                { name: 'icon', type: 'text' },
                { name: 'color', type: 'text' }
            ],
            listRule: '', // Public read
            viewRule: '',
        });
        console.log('  ✅ Created "categories"');
    }

    // --- Brands Collection ---
    try {
        await pb.collections.getOne('brands');
        console.log('  ℹ️  Collection "brands" already exists.');
    } catch {
        console.log('  🆕 Creating "brands" collection...');
        const categoriesCol = await pb.collections.getOne('categories');
        await pb.collections.create({
            name: 'brands',
            type: 'base',
            schema: [
                { name: 'name', type: 'text', required: true },
                { name: 'category', type: 'relation', options: { collectionId: categoriesCol.id, cascadeDelete: false, maxSelect: 1 } },
                { name: 'website', type: 'url' },
                { name: 'logo', type: 'file', options: { maxSelect: 1, maxSize: 5242880, mimeTypes: ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'] } },
                { name: 'color', type: 'text' },
                { name: 'icon', type: 'text' },
                { name: 'total_outlets', type: 'number' }
            ],
            listRule: '', // Public read
            viewRule: '',
        });
        console.log('  ✅ Created "brands"');
    }

    // --- Outlets Collection ---
    let brandsCollectionId;
    try {
        const col = await pb.collections.getOne('brands');
        brandsCollectionId = col.id;
    } catch (e) {
        throw new Error("Could not find brands collection ID after creation/check");
    }

    try {
        await pb.collections.getOne('outlets');
        console.log('  ℹ️  Collection "outlets" already exists.');
    } catch {
        console.log('  🆕 Creating "outlets" collection...');
        await pb.collections.create({
            name: 'outlets',
            type: 'base',
            schema: [
                { name: 'brand', type: 'relation', required: true, options: { collectionId: brandsCollectionId, cascadeDelete: false, maxSelect: 1 } },
                { name: 'name', type: 'text', required: true },
                { name: 'address', type: 'text' },
                { name: 'city', type: 'text' },
                { name: 'region', type: 'text' },
                { name: 'latitude', type: 'number', required: true },
                { name: 'longitude', type: 'number', required: true }
            ],
            // indexes removed to prevent SQL error during creation
            listRule: '', // Public read
            viewRule: '',
        });
        console.log('  ✅ Created "outlets"');
    }
}

async function migrateData() {
    console.log('\n📊 Migrating Data...');

    // Load JSON data
    const jsonPath = path.join(__dirname, '..', 'static', 'data', 'brand_locations.json');
    console.log(`  📂 Reading data from: ${jsonPath}`);
    const jsonData = JSON.parse(await fs.readFile(jsonPath, 'utf-8'));

    // Check if data exists - shallow check
    const existingBrands = await pb.collection('brands').getFullList();
    if (existingBrands.length > 0) {
        console.log(`  ⚠️  Found ${existingBrands.length} existing brands. Skipping full import to avoid duplicates.`);
        console.log('      (If you want to re-import, please delete the collections or records via Admin UI)');
        return;
    }

    // Colors and Icons mapping
    const brandMeta = {
        'Luuca': { color: '#f87171', icon: 'fa-mug-hot' },
        'Barber Smart': { color: '#34d399', icon: 'fa-scissors' },
        'UMC UCMAS Indonesia': { color: '#fbbf24', icon: 'fa-graduation-cap' },
        'Laundry Klin': { color: '#60a5fa', icon: 'fa-shirt' }
    };

    // 1. Import Categories
    console.log('  Start importing categories...');
    const existingCategories = await pb.collection('categories').getFullList().catch(() => []);
    const categoryMap = new Map(existingCategories.map((c) => [c.name, c.id]));

    for (const brand of jsonData.brands) {
        const categoryName = (brand.category || 'Umum').trim();
        if (categoryMap.has(categoryName)) continue;
        try {
            const created = await pb.collection('categories').create({
                name: categoryName,
                icon: 'fa-tag',
                color: '#8b5cf6'
            });
            categoryMap.set(categoryName, created.id);
        } catch (e) {
            console.error(`    ❌ Failed to create category ${categoryName}:`, e.message);
        }
    }

    // 2. Import Brands
    console.log('  Start importing brands...');
    const brandMap = new Map(); // Name -> ID

    for (const brand of jsonData.brands) {
        const meta = brandMeta[brand.brandName] || { color: '#667eea', icon: 'fa-store' };
        const categoryName = (brand.category || 'Umum').trim();
        const categoryId = categoryMap.get(categoryName) || '';

        try {
            const record = await pb.collection('brands').create({
                name: brand.brandName,
                category: categoryId,
                website: brand.website,
                total_outlets: brand.totalOutlets,
                color: meta.color,
                icon: meta.icon
            });
            brandMap.set(brand.brandName, record.id);
            console.log(`    ✓ Brand: ${brand.brandName}`);
        } catch (e) {
            console.error(`    ❌ Failed to create brand ${brand.brandName}:`, e.message);
        }
    }

    // 2. Import Outlets
    console.log('  Start importing outlets...');
    let outletCount = 0;

    for (const brand of jsonData.brands) {
        const brandId = brandMap.get(brand.brandName);
        if (!brandId) {
            console.log(`    ⚠️  Skipping outlets for ${brand.brandName} (Brand ID not found)`);
            continue;
        }

        const outletsToCreate = [];

        // Helper to collect outlets
        const collect = (list, regionName) => {
            if (!list) return;
            for (const item of list) {
                if (item.coordinates && item.coordinates.lat && item.coordinates.lng) {
                    outletsToCreate.push({
                        brand: brandId,
                        name: item.name,
                        address: item.address,
                        city: item.city,
                        region: regionName || item.region || '',
                        latitude: item.coordinates.lat,
                        longitude: item.coordinates.lng
                    });
                }
            }
        };

        // Flat outlets
        collect(brand.outlets, '');

        // Nested regions
        if (brand.regions) {
            for (const reg of brand.regions) {
                collect(reg.outlets, reg.region);
            }
        }

        // Batch create (concurrently but limited) - PocketBase doesn't have a bulk insert API yet, so we loop
        console.log(`    Processing ${outletsToCreate.length} outlets for ${brand.brandName}...`);

        // Simple loop await for safety against rate limits, though connection is remote
        for (const out of outletsToCreate) {
            await pb.collection('outlets').create(out);
            outletCount++;
        }
    }
    console.log(`  ✅ Imported ${outletCount} total outlets.`);
}

main();

/**
 * Full Reset & Migration Script
 * 1. Deletes existing 'brands' and 'outlets' collections
 * 2. Re-creates them with proper schema (v0.23+ compatible)
 * 3. Imports data from brand_locations.json
 * 
 * Run with: node scripts/reset-migration.js
 */

import PocketBase from 'pocketbase';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv'; // We might need to load .env if not auto-loaded

// Load .env manually since we are running a script isolated
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '..', '.env');

async function loadEnv() {
    try {
        const envContent = await fs.readFile(envPath, 'utf-8');
        const envConfig = dotenv.parse(envContent);
        for (const k in envConfig) {
            process.env[k] = envConfig[k];
        }
    } catch (e) {
        console.log('⚠️  Could not load .env file, relying on process.env');
    }
}

async function main() {
    await loadEnv();

    const PB_URL = process.env.PUBLIC_POCKETBASE_URL || 'http://76.13.22.182';
    const ADMIN_EMAIL = process.env.POCKETBASE_ADMIN_EMAIL || 'startfranchise.id@gmail.com';
    const ADMIN_PASSWORD = process.env.POCKETBASE_ADMIN_PASSWORD || 'Admin.startfranchise@123';

    console.log('🚀 Full Reset & Migration');
    console.log(`📡 URL: ${PB_URL}`);
    console.log('='.repeat(50));

    const pb = new PocketBase(PB_URL);
    const loadCategories = async () => {
        const categories = await pb.collection('categories').getFullList({
            fields: 'id,name',
        }).catch(() => []);
        return new Map(categories.map((c) => [c.name, c.id]));
    };
    const getCategoryId = async (categoryName, categoryMap) => {
        if (!categoryName) return '';
        if (categoryMap.has(categoryName)) return categoryMap.get(categoryName);
        const created = await pb.collection('categories').create({
            name: categoryName,
            icon: 'fa-tag',
            color: '#8b5cf6',
        });
        categoryMap.set(created.name, created.id);
        return created.id;
    };

    // 1. Authenticate
    console.log('\n🔐 Authenticating...');
    // 1. Authenticate
    console.log('\n🔐 Authenticating...');
    try {
        // Manual fetch bypass because SDK is failing with 404
        const authRes = await fetch(`${PB_URL}/api/admins/auth-with-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identity: ADMIN_EMAIL, password: ADMIN_PASSWORD })
        });

        if (!authRes.ok) {
            throw new Error(`Auth failed with status ${authRes.status}`);
        }

        const authData = await authRes.json();
        pb.authStore.save(authData.token, authData.admin);
        console.log('   ✅ Authenticated (Manual fetch bypass)');
    } catch (e) {
        console.error('   ❌ Auth failed:', e.message);
        console.error('      Ensure POCKETBASE_ADMIN_EMAIL and POCKETBASE_ADMIN_PASSWORD are correct in .env');
        process.exit(1);
    }

    // 2. Delete existing collections
    console.log('\n🗑️  Cleaning up old collections...');
    try {
        const collections = await pb.collections.getFullList();
        const outletsCol = collections.find(c => c.name === 'outlets');
        const brandsCol = collections.find(c => c.name === 'brands');

        if (outletsCol) {
            await pb.collections.delete(outletsCol.id);
            console.log('   ✓ Deleted "outlets"');
        }
        if (brandsCol) {
            await pb.collections.delete(brandsCol.id);
            console.log('   ✓ Deleted "brands"');
        }
    } catch (e) {
        console.error('   ⚠️  Cleanup warning:', e.message);
    }

    // 3. Create Categories Collection
    console.log('\n📦 Creating "categories" collection...');
    let categoriesId;
    try {
        const existing = await pb.collections.getOne('categories');
        categoriesId = existing.id;
        console.log(`   ✅ Exists (ID: ${categoriesId})`);
    } catch {
        try {
            const created = await pb.collections.create({
                name: 'categories',
                type: 'base',
                fields: [
                    { name: 'name', type: 'text', required: true },
                    { name: 'description', type: 'text', required: false },
                    { name: 'icon', type: 'text', required: false },
                    { name: 'color', type: 'text', required: false }
                ],
                listRule: '',
                viewRule: ''
            });
            categoriesId = created.id;
            console.log(`   ✅ Created (ID: ${categoriesId})`);
        } catch (e) {
            console.error('   ❌ Failed to create categories:', e.message);
            console.log(JSON.stringify(e.data, null, 2));
            process.exit(1);
        }
    }

    // 4. Create Brands Collection
    console.log('\n📦 Creating "brands" collection...');
    let brandsId;
    try {
        const col = await pb.collections.create({
            name: 'brands',
            type: 'base',
            fields: [
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
            listRule: '',
            viewRule: ''
        });
        brandsId = col.id;
        console.log(`   ✅ Created (ID: ${brandsId})`);
    } catch (e) {
        console.error('   ❌ Failed to create brands:', e.message);
        console.log(JSON.stringify(e.data, null, 2));
        process.exit(1);
    }

    // 5. Create Outlets Collection
    console.log('\n📦 Creating "outlets" collection...');
    try {
        const col = await pb.collections.create({
            name: 'outlets',
            type: 'base',
            fields: [
                {
                    name: 'brand',
                    type: 'relation',
                    required: true,
                    options: {
                        collectionId: brandsId,
                        cascadeDelete: true, // Auto delete outlets when brand is deleted
                        maxSelect: 1,
                        displayFields: ['name']
                    }
                },
                // Add duplicate id field for compatibility/debugging if needed
                { name: 'brand_id', type: 'text', required: false },
                { name: 'name', type: 'text', required: true },
                { name: 'address', type: 'text', required: false },
                { name: 'city', type: 'text', required: false },
                { name: 'region', type: 'text', required: false },
                { name: 'latitude', type: 'number', required: true },
                { name: 'longitude', type: 'number', required: true }
            ],
            listRule: '',
            viewRule: ''
        });
        console.log(`   ✅ Created (ID: ${col.id})`);
    } catch (e) {
        console.error('   ❌ Failed to create outlets:', e.message);
        console.log(JSON.stringify(e.data, null, 2));
        process.exit(1);
    }

    // 6. Import Data
    console.log('\n📥 Importing Data...');

    // Load JSON
    const jsonPath = path.join(__dirname, '..', 'data', 'brand_locations.json');
    // Also try static path if root one fails
    const staticJsonPath = path.join(__dirname, '..', 'static', 'data', 'brand_locations.json');

    let jsonData;
    try {
        // Try root data folder first
        try {
            jsonData = JSON.parse(await fs.readFile(jsonPath, 'utf-8'));
        } catch {
            jsonData = JSON.parse(await fs.readFile(staticJsonPath, 'utf-8'));
        }
        console.log(`   ✓ Loaded JSON with ${jsonData.brands.length} brands`);
    } catch (e) {
        console.error('   ❌ Could not load brand_locations.json');
        process.exit(1);
    }

    const brandMeta = {
        'Luuca': { color: '#f87171', icon: 'fa-mug-hot' },
        'Barber Smart': { color: '#34d399', icon: 'fa-scissors' },
        'UMC UCMAS Indonesia': { color: '#fbbf24', icon: 'fa-graduation-cap' },
        'Laundry Klin': { color: '#60a5fa', icon: 'fa-shirt' }
    };

    const brandMap = new Map();
    const categoryMap = await loadCategories();

    // Import Brands
    for (const brand of jsonData.brands) {
        const meta = brandMeta[brand.brandName] || { color: '#667eea', icon: 'fa-store' };

        try {
            const categoryId = await getCategoryId(brand.category || 'Umum', categoryMap);
            const record = await pb.collection('brands').create({
                name: brand.brandName,
                category: categoryId,
                website: brand.website || '',
                color: meta.color,
                icon: meta.icon,
                total_outlets: brand.totalOutlets || 0
            });
            brandMap.set(brand.brandName, record.id);
            console.log(`     ✓ Created Brand: ${brand.brandName}`);
        } catch (e) {
            console.error(`     ❌ Error creating ${brand.brandName}:`, e.message);
        }
    }

    // Import Outlets
    let outletCount = 0;

    for (const brand of jsonData.brands) {
        const pbBrandId = brandMap.get(brand.brandName);
        if (!pbBrandId) continue;

        const outlets = [];
        const processList = (list, region) => {
            if (!list) return;
            for (const item of list) {
                if (item.coordinates?.lat && item.coordinates?.lng) {
                    outlets.push({
                        brand: pbBrandId,
                        brand_id: pbBrandId, // Store in text field too just in case
                        name: item.name,
                        address: item.address || '',
                        city: item.city || '',
                        region: region || item.region || '',
                        latitude: item.coordinates.lat,
                        longitude: item.coordinates.lng
                    });
                }
            }
        };

        if (brand.regions) {
            for (const reg of brand.regions) {
                processList(reg.outlets, reg.region);
            }
        }
        processList(brand.outlets, '');

        console.log(`     Importing ${outlets.length} outlets for ${brand.brandName}...`);

        // Parallel imports for speed
        const promises = outlets.map(data =>
            pb.collection('outlets').create(data).catch(e => {
                console.error(`       Failed outlet ${data.name}:`, e.message);
            })
        );

        await Promise.all(promises);
        outletCount += outlets.length;
    }

    console.log('\n' + '='.repeat(50));
    console.log(`✅ Migration Complete!`);
    console.log(`   Brands: ${brandMap.size}`);
    console.log(`   Outlets: ${outletCount}`);
}

main().catch(console.error);

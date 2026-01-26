/**
 * PocketBase Setup Script
 * Creates collections and migrates data from brand_locations.json
 * 
 * Run with: node scripts/setup-pocketbase.js
 */

import PocketBase from 'pocketbase';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PB_URL = process.env.POCKETBASE_URL || 'http://76.13.22.182';
const ADMIN_EMAIL = process.env.POCKETBASE_ADMIN_EMAIL || 'startfranchise.id@gmail.com';
const ADMIN_PASSWORD = process.env.POCKETBASE_ADMIN_PASSWORD || 'admin.startfranchise@123';

const pb = new PocketBase(PB_URL);

async function main() {
    console.log('🚀 PocketBase Setup Script');
    console.log('='.repeat(50));

    try {
        // Authenticate as admin
        console.log('\n📝 Authenticating as admin...');
        try {
            await pb.admins.authWithPassword(ADMIN_EMAIL, ADMIN_PASSWORD);
            console.log('✅ Authenticated successfully');
        } catch (e) {
            console.log('  ⚠️  Could not authenticate as admin. Trying to proceed anyway (maybe already authenticated/public)...');
            console.error(e);
        }

        // Create collections
        await createCollections();

        // Migrate data
        await migrateData();

        console.log('\n' + '='.repeat(50));
        console.log('✅ Setup complete!');
    } catch (error) {
        console.error('❌ Error:', error);
        if (error.data) {
            console.error('Data:', JSON.stringify(error.data, null, 2));
        }
        process.exit(1);
    }
}

async function createCollections() {
    console.log('\n📦 Creating collections...');

    // Check if brands collection exists
    try {
        await pb.collections.getOne('brands');
        console.log('  ⚠️  brands collection already exists');
    } catch {
        // Create brands collection
        await pb.collections.create({
            name: 'brands',
            type: 'base',
            schema: [
                { name: 'name', type: 'text', required: true },
                { name: 'category', type: 'text' },
                { name: 'website', type: 'url' },
                { name: 'logo', type: 'file', options: { maxSelect: 1, maxSize: 5242880, mimeTypes: ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'] } },
                { name: 'color', type: 'text' },
                { name: 'icon', type: 'text' }
            ],
            listRule: '',
            viewRule: '',
            createRule: null,
            updateRule: null,
            deleteRule: null
        });
        console.log('  ✅ Created brands collection');


        // Wait for propagation
        await new Promise(resolve => setTimeout(resolve, 3000));

        let brandsCollectionId = 'brands';
        try {
            const brandsCollection = await pb.collections.getOne('brands');
            brandsCollectionId = brandsCollection.id;
            console.log(`  ✅ Verified brands collection exists (ID: ${brandsCollectionId})`);
        } catch (e) {
            console.error('  ❌ Failed to verify brands collection exists. Outlets creation might fail.');
            console.error(e);
        }

        // Check if outlets collection exists
        try {
            await pb.collections.getOne('outlets');
            console.log('  ⚠️  outlets collection already exists');
        } catch {
            // Create outlets collection
            console.log('  Creating outlets collection...');
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
                listRule: '',
                viewRule: '',
                createRule: null,
                updateRule: null,
                deleteRule: null,
                indexes: [
                    'CREATE INDEX idx_outlets_brand ON outlets (brand)',
                    'CREATE INDEX idx_outlets_city ON outlets (city)'
                ]
            });
            console.log('  ✅ Created outlets collection');
        }
    }
}

async function migrateData() {
    console.log('\n📊 Migrating data from JSON...');

    // Load JSON data
    const jsonPath = path.join(__dirname, '..', '..', 'data', 'brand_locations.json');
    const jsonData = JSON.parse(await fs.readFile(jsonPath, 'utf-8'));

    const brandColors = {
        'Luuca': '#f87171',
        'Barber Smart': '#34d399',
        'UMC UCMAS Indonesia': '#fbbf24',
        'Laundry Klin': '#60a5fa'
    };

    const brandIcons = {
        'Luuca': 'fa-mug-hot',
        'Barber Smart': 'fa-scissors',
        'UMC UCMAS Indonesia': 'fa-graduation-cap',
        'Laundry Klin': 'fa-shirt'
    };

    // Check if data already exists
    const existingBrands = await pb.collection('brands').getFullList();
    if (existingBrands.length > 0) {
        console.log('  ⚠️  Data already exists. Skipping migration.');
        console.log(`      Found ${existingBrands.length} brands`);
        const existingOutlets = await pb.collection('outlets').getFullList();
        console.log(`      Found ${existingOutlets.length} outlets`);
        return;
    }

    // Insert brands
    const brandIdMap = new Map();
    let brandCount = 0;

    for (const brand of jsonData.brands) {
        try {
            const record = await pb.collection('brands').create({
                name: brand.brandName,
                category: brand.category || '',
                website: brand.website || '',
                color: brandColors[brand.brandName] || '#667eea',
                icon: brandIcons[brand.brandName] || 'fa-store'
            });
            brandIdMap.set(brand.brandName, record.id);
            brandCount++;
            console.log(`  ✅ Created brand: ${brand.brandName}`);
        } catch (err) {
            console.error(`  ❌ Error creating brand ${brand.brandName}:`, err.message);
        }
    }

    console.log(`\n  📍 Inserting outlets...`);
    let outletCount = 0;
    let errorCount = 0;

    for (const brand of jsonData.brands) {
        const brandId = brandIdMap.get(brand.brandName);
        if (!brandId) continue;

        const processOutlets = async (outlets, region = '') => {
            for (const outlet of outlets) {
                if (outlet.coordinates?.lat && outlet.coordinates?.lng) {
                    try {
                        await pb.collection('outlets').create({
                            brand: brandId,
                            name: outlet.name,
                            address: outlet.address || '',
                            city: outlet.city || '',
                            region: region,
                            latitude: outlet.coordinates.lat,
                            longitude: outlet.coordinates.lng
                        });
                        outletCount++;
                    } catch (err) {
                        errorCount++;
                    }
                }
            }
        };

        if (brand.regions) {
            for (const region of brand.regions) {
                await processOutlets(region.outlets, region.region);
            }
        }
        if (brand.outlets) {
            await processOutlets(brand.outlets);
        }

        console.log(`  ✅ Processed ${brand.brandName}`);
    }

    console.log(`\n  📊 Migration Summary:`);
    console.log(`      Brands created: ${brandCount}`);
    console.log(`      Outlets created: ${outletCount}`);
    if (errorCount > 0) {
        console.log(`      Errors: ${errorCount}`);
    }
}

main();

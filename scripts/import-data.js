/**
 * PocketBase Data Import Script
 * Imports brands and outlets from brand_locations.json
 */

import PocketBase from 'pocketbase';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PB_URL = 'http://76.13.22.182';
const ADMIN_EMAIL = 'startfranchise.id@gmail.com';
const ADMIN_PASSWORD = 'Admin.startfranchise@123';

const pb = new PocketBase(PB_URL);

// Brand metadata
const brandMeta = {
    'Luuca': { color: '#f87171', icon: 'fa-mug-hot' },
    'Barber Smart': { color: '#34d399', icon: 'fa-scissors' },
    'UMC UCMAS Indonesia': { color: '#fbbf24', icon: 'fa-graduation-cap' },
    'Laundry Klin': { color: '#60a5fa', icon: 'fa-shirt' }
};

async function main() {
    console.log('📊 PocketBase Data Import');
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

    // Load JSON data
    console.log('\n📂 Loading JSON data...');
    const jsonPath = path.join(__dirname, '..', '..', 'data', 'brand_locations.json');
    console.log(`   Path: ${jsonPath}`);

    let jsonData;
    try {
        jsonData = JSON.parse(await fs.readFile(jsonPath, 'utf-8'));
        console.log(`   ✅ Loaded ${jsonData.brands?.length || 0} brands`);
    } catch (e) {
        console.error('   ❌ Failed to load JSON:', e.message);
        return;
    }

    // Check if data already exists
    const existingBrands = await pb.collection('brands').getFullList();
    if (existingBrands.length > 0) {
        console.log(`\n⚠️  Found ${existingBrands.length} existing brands.`);
        console.log('   Skipping import to prevent duplicates.');
        console.log('   Delete existing records first if you want to re-import.');

        const existingOutlets = await pb.collection('outlets').getFullList();
        console.log(`   Existing outlets: ${existingOutlets.length}`);
        return;
    }

    // Import brands
    console.log('\n📥 Importing brands...');
    const brandMap = new Map(); // name -> PocketBase ID

    for (const brand of jsonData.brands) {
        const meta = brandMeta[brand.brandName] || { color: '#667eea', icon: 'fa-store' };

        try {
            const record = await pb.collection('brands').create({
                name: brand.brandName,
                category: brand.category || '',
                website: brand.website || '',
                color: meta.color,
                icon: meta.icon,
                total_outlets: brand.totalOutlets || 0
                // logo will be uploaded manually via Admin UI
            });
            brandMap.set(brand.brandName, record.id);
            console.log(`   ✓ ${brand.brandName} (ID: ${record.id})`);
        } catch (e) {
            console.error(`   ❌ Failed to create ${brand.brandName}:`, e.message);
        }
    }

    // Import outlets
    console.log('\n📥 Importing outlets...');
    let outletCount = 0;
    let errorCount = 0;

    for (const brand of jsonData.brands) {
        const brandId = brandMap.get(brand.brandName);
        if (!brandId) {
            console.log(`   ⚠️  Skipping outlets for ${brand.brandName} (no brand ID)`);
            continue;
        }

        const outlets = [];

        // Collect outlets from regions
        if (brand.regions) {
            for (const region of brand.regions) {
                if (region.outlets) {
                    for (const outlet of region.outlets) {
                        if (outlet.coordinates?.lat && outlet.coordinates?.lng) {
                            outlets.push({
                                brand: brandId,
                                name: outlet.name,
                                address: outlet.address || '',
                                city: outlet.city || '',
                                region: region.region || '',
                                latitude: outlet.coordinates.lat,
                                longitude: outlet.coordinates.lng
                            });
                        }
                    }
                }
            }
        }

        // Collect flat outlets
        if (brand.outlets) {
            for (const outlet of brand.outlets) {
                if (outlet.coordinates?.lat && outlet.coordinates?.lng) {
                    outlets.push({
                        brand: brandId,
                        name: outlet.name,
                        address: outlet.address || '',
                        city: outlet.city || '',
                        region: outlet.region || '',
                        latitude: outlet.coordinates.lat,
                        longitude: outlet.coordinates.lng
                    });
                }
            }
        }

        console.log(`   Processing ${outlets.length} outlets for ${brand.brandName}...`);

        for (const outlet of outlets) {
            try {
                await pb.collection('outlets').create(outlet);
                outletCount++;
            } catch (e) {
                errorCount++;
                if (errorCount <= 5) {
                    console.error(`      ❌ Failed: ${outlet.name} - ${e.message}`);
                }
            }
        }
    }

    console.log('\n' + '='.repeat(50));
    console.log('📊 Import Summary:');
    console.log(`   Brands imported: ${brandMap.size}`);
    console.log(`   Outlets imported: ${outletCount}`);
    if (errorCount > 0) {
        console.log(`   Errors: ${errorCount}`);
    }
    console.log('\n✅ Import complete!');
    console.log('   Upload brand logos via Admin UI at: http://76.13.22.182/_/');
}

main().catch(console.error);

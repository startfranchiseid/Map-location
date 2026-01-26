/**
 * Import Outlets Only
 * Imports outlets data without touching brands
 */

import PocketBase from 'pocketbase';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const pb = new PocketBase('http://76.13.22.182');

async function main() {
    console.log('📊 Import Outlets Only');
    console.log('='.repeat(50));

    // Auth
    await pb.collection('_superusers').authWithPassword('startfranchise.id@gmail.com', 'Admin.startfranchise@123');
    console.log('✅ Authenticated\n');

    // Load JSON
    const jsonPath = path.join(__dirname, '..', '..', 'data', 'brand_locations.json');
    const jsonData = JSON.parse(await fs.readFile(jsonPath, 'utf-8'));
    console.log(`Loaded ${jsonData.brands.length} brands from JSON\n`);

    // Get existing brands from PocketBase
    const existingBrands = await pb.collection('brands').getFullList();
    console.log(`Found ${existingBrands.length} brands in PocketBase`);

    // Create a map: brand name -> PocketBase ID
    const brandMap = new Map();
    for (const brand of existingBrands) {
        brandMap.set(brand.name, brand.id);
        console.log(`  ${brand.name} -> ${brand.id}`);
    }

    // Check outlets collection fields
    const cols = await pb.collections.getFullList();
    const outletsCol = cols.find(c => c.name === 'outlets');
    const fieldNames = (outletsCol?.fields || []).map(f => f.name);
    console.log(`\nOutlets collection fields: ${fieldNames.join(', ')}`);

    // Determine if we use 'brand' or 'brand_id' field
    const brandFieldName = fieldNames.includes('brand') ? 'brand' : 'brand_id';
    console.log(`Using field: ${brandFieldName}`);

    // Import outlets
    console.log('\n📥 Importing outlets...');
    let count = 0;
    let errors = 0;

    for (const brand of jsonData.brands) {
        const brandId = brandMap.get(brand.brandName);
        if (!brandId) {
            console.log(`⚠️  No ID found for brand: ${brand.brandName}`);
            continue;
        }

        const outlets = [];

        // Collect from regions
        if (brand.regions) {
            for (const region of brand.regions) {
                for (const outlet of (region.outlets || [])) {
                    if (outlet.coordinates?.lat && outlet.coordinates?.lng) {
                        outlets.push({
                            [brandFieldName]: brandId,
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

        // Collect flat outlets
        for (const outlet of (brand.outlets || [])) {
            if (outlet.coordinates?.lat && outlet.coordinates?.lng) {
                outlets.push({
                    [brandFieldName]: brandId,
                    name: outlet.name,
                    address: outlet.address || '',
                    city: outlet.city || '',
                    region: outlet.region || '',
                    latitude: outlet.coordinates.lat,
                    longitude: outlet.coordinates.lng
                });
            }
        }

        console.log(`Processing ${outlets.length} outlets for ${brand.brandName}...`);

        for (const outlet of outlets) {
            try {
                await pb.collection('outlets').create(outlet);
                count++;
            } catch (e) {
                errors++;
                if (errors <= 3) {
                    console.log(`  ❌ Error: ${e.message}`);
                    console.log(`     Data: ${JSON.stringify(outlet)}`);
                }
            }
        }
    }

    console.log('\n' + '='.repeat(50));
    console.log(`✅ Imported ${count} outlets`);
    if (errors > 0) console.log(`❌ ${errors} errors`);
}

main().catch(console.error);

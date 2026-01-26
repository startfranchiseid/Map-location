
import PocketBase from 'pocketbase';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PB_URL = 'http://31.97.48.9:30090';
const ADMIN_EMAIL = 'startfranchise.id@gmail.com';
const ADMIN_PASSWORD = 'admin.startfranchise@123';

const pb = new PocketBase(PB_URL);

async function main() {
    console.log('🚀 Force Inserting Outlet Data');

    try {
        // Authenticate
        await pb.admins.authWithPassword(ADMIN_EMAIL, ADMIN_PASSWORD);
        console.log('✅ Authenticated');

        // Load JSON data
        const jsonPath = path.join(__dirname, '..', '..', 'data', 'brand_locations.json');
        const jsonData = JSON.parse(await fs.readFile(jsonPath, 'utf-8'));
        console.log(`📖 Loaded JSON data for ${jsonData.brands.length} brands`);

        // Get existing brands map
        const brands = await pb.collection('brands').getFullList();
        const brandMap = new Map(brands.map(b => [b.name, b.id]));
        console.log(`✅ Found ${brands.length} existing brands in DB`);

        // Insert Outlets
        let count = 0;
        let errors = 0;

        for (const brandData of jsonData.brands) {
            const brandId = brandMap.get(brandData.brandName);
            if (!brandId) {
                console.warn(`⚠️ Brand not found in DB: ${brandData.brandName}, skipping outlets...`);
                continue;
            }

            console.log(`Processing ${brandData.brandName}...`);

            const processOutlets = async (outlets, region = '') => {
                for (const outlet of outlets) {
                    if (outlet.coordinates?.lat && outlet.coordinates?.lng) {
                        try {
                            // Check uniqueness if needed, or just insert
                            // For speed, just inserting. If you need idempotency, we'd check first.
                            await pb.collection('outlets').create({
                                brand: brandId,
                                name: outlet.name,
                                address: outlet.address || '',
                                city: outlet.city || '',
                                region: region,
                                latitude: outlet.coordinates.lat,
                                longitude: outlet.coordinates.lng
                            }, { requestKey: null }); // disable auto cancellation
                            process.stdout.write('.');
                            count++;
                        } catch (err) {
                            process.stdout.write('x');
                            errors++;
                        }
                    }
                }
            };

            if (brandData.regions) {
                for (const region of brandData.regions) {
                    await processOutlets(region.outlets, region.region);
                }
            }
            if (brandData.outlets) {
                await processOutlets(brandData.outlets);
            }
            console.log(' Done');
        }

        console.log('='.repeat(50));
        console.log(`✅ Migration Complete`);
        console.log(`   Inserted: ${count} outlets`);
        console.log(`   Errors:   ${errors}`);

    } catch (e) {
        console.error('❌ Error:', e);
    }
}

main();

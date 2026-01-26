
import PocketBase from 'pocketbase';

const PB_URL = 'http://31.97.48.9:30090';
const ADMIN_EMAIL = 'startfranchise.id@gmail.com';
const ADMIN_PASSWORD = 'admin.startfranchise@123';

const pb = new PocketBase(PB_URL);

// Mapping of Brand Name to New Category
const categoryMapping = {
    'Luuca': 'F&B',
    'Barber Smart': 'SALON & SPA',
    'UMC UCMAS Indonesia': 'Educational Centre',
    'Laundry Klin': 'Cleaning, Laundry Service'
};

async function main() {
    console.log('🚀 Updating Brand Categories...');

    try {
        await pb.admins.authWithPassword(ADMIN_EMAIL, ADMIN_PASSWORD);
        console.log('✅ Authenticated');

        const brands = await pb.collection('brands').getFullList();
        console.log(`📋 Found ${brands.length} brands`);

        for (const brand of brands) {
            const newCategory = categoryMapping[brand.name];
            if (newCategory) {
                if (brand.category !== newCategory) {
                    await pb.collection('brands').update(brand.id, {
                        category: newCategory
                    });
                    console.log(`✅ Updated ${brand.name}: ${brand.category} -> ${newCategory}`);
                } else {
                    console.log(`info: ${brand.name} already has correct category (${newCategory})`);
                }
            } else {
                console.warn(`⚠️ No category mapping found for: ${brand.name}`);
            }
        }

    } catch (e) {
        console.error('❌ Error:', e);
    }
}

main();

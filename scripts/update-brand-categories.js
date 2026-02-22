
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

        const categories = await pb.collection('categories').getFullList({
            fields: 'id,name',
        }).catch(() => []);
        const categoryMap = new Map(categories.map((c) => [c.name, c.id]));
        const categoryIds = new Set(categories.map((c) => c.id));
        const brands = await pb.collection('brands').getFullList({
            fields: 'id,name,category',
        });
        console.log(`📋 Found ${brands.length} brands`);

        for (const brand of brands) {
            const mappedName = categoryMapping[brand.name];
            const current = brand.category;
            const categoryName =
                mappedName ||
                (typeof current === 'string' && !categoryIds.has(current)
                    ? current.trim()
                    : '');
            if (!categoryName) continue;
            if (!categoryMap.has(categoryName)) {
                const created = await pb.collection('categories').create({
                    name: categoryName,
                    icon: 'fa-tag',
                    color: '#8b5cf6',
                });
                categoryMap.set(categoryName, created.id);
                categoryIds.add(created.id);
            }
            const categoryId = categoryMap.get(categoryName);
            if (categoryId && brand.category !== categoryId) {
                await pb.collection('brands').update(brand.id, {
                    category: categoryId,
                });
                console.log(`✅ Updated ${brand.name}: ${brand.category} -> ${categoryName}`);
            }
        }

    } catch (e) {
        console.error('❌ Error:', e);
    }
}

main();

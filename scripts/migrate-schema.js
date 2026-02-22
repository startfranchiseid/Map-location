
import PocketBase from 'pocketbase';

const PB_URL = 'http://76.13.22.182';
const ADMIN_EMAIL = 'startfranchise.id@gmail.com';
const ADMIN_PASSWORD = 'Admin.startfranchise@123';

const pb = new PocketBase(PB_URL);

// Defined Schemas
const categorySchema = [
    { name: 'name', type: 'text', required: true },
    { name: 'description', type: 'text' },
    { name: 'icon', type: 'text' },
    { name: 'color', type: 'text' }
];

const brandSchema = (categoriesId) => [
    { name: 'name', type: 'text', required: true },
    { name: 'category', type: 'relation', options: { collectionId: categoriesId, cascadeDelete: false, maxSelect: 1 } },
    { name: 'website', type: 'url' },
    { name: 'color', type: 'text' },
    { name: 'icon', type: 'text' },
    { name: 'total_outlets', type: 'number' }
];

const outletSchema = (brandId) => [
    { name: 'brand', type: 'relation', required: true, options: { collectionId: brandId, cascadeDelete: false, maxSelect: 1 } },
    { name: 'name', type: 'text', required: true },
    { name: 'address', type: 'text' },
    { name: 'city', type: 'text' },
    { name: 'region', type: 'text' },
    { name: 'latitude', type: 'number', required: true },
    { name: 'longitude', type: 'number', required: true }
];

async function main() {
    console.log('🚀 Migrating PocketBase Schema...');

    // Auth
    try {
        try {
            await pb.collection('_superusers').authWithPassword(ADMIN_EMAIL, ADMIN_PASSWORD);
        } catch {
            await pb.admins.authWithPassword(ADMIN_EMAIL, ADMIN_PASSWORD);
        }
        console.log('✅ Authenticated');
    } catch (e) {
        console.error('❌ Auth Failed', e.message);
        process.exit(1);
    }

    // 1. Migrate Categories
    let categoriesCol;
    try {
        categoriesCol = await pb.collections.getOne('categories');
        console.log(`📦 Updating existing "categories" collection (${categoriesCol.id})...`);
        await pb.collections.update(categoriesCol.id, {
            schema: categorySchema
        });
        console.log('✅ Categories schema updated.');
    } catch (e) {
        if (e.status === 404) {
            console.log('📦 Creating "categories" collection...');
            categoriesCol = await pb.collections.create({
                name: 'categories',
                type: 'base',
                schema: categorySchema
            });
            console.log('✅ Categories collection created.');
        } else {
            console.error('❌ Error dealing with categories:', e);
            throw e;
        }
    }

    // 2. Migrate Brands
    let brandCol;
    try {
        brandCol = await pb.collections.getOne('brands');
        console.log(`📦 Updating existing "brands" collection (${brandCol.id})...`);
        await pb.collections.update(brandCol.id, {
            schema: brandSchema(categoriesCol.id)
        });
        console.log('✅ Brands schema updated.');
    } catch (e) {
        if (e.status === 404) {
            console.log('📦 Creating "brands" collection...');
            brandCol = await pb.collections.create({
                name: 'brands',
                type: 'base',
                schema: brandSchema(categoriesCol.id)
            });
            console.log('✅ Brands collection created.');
        } else {
            console.error('❌ Error dealing with brands:', e);
            throw e;
        }
    }

    // 3. Migrate Outlets
    try {
        const outletCol = await pb.collections.getOne('outlets');
        console.log(`📦 Updating existing "outlets" collection (${outletCol.id})...`);
        await pb.collections.update(outletCol.id, {
            schema: outletSchema(brandCol.id)
        });
        console.log('✅ Outlets schema updated.');
    } catch (e) {
        if (e.status === 404) {
            console.log('📦 Creating "outlets" collection...');
            await pb.collections.create({
                name: 'outlets',
                type: 'base',
                schema: outletSchema(brandCol.id)
            });
            console.log('✅ Outlets collection created.');
        } else {
            console.error('❌ Error dealing with outlets:', e);
            throw e;
        }
    }
}

main();

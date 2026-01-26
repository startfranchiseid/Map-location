
import PocketBase from 'pocketbase';

const PB_URL = 'http://31.97.48.9:30090';
const ADMIN_EMAIL = 'startfranchise.id@gmail.com';
const ADMIN_PASSWORD = 'admin.startfranchise@123';

const pb = new PocketBase(PB_URL);

async function main() {
    console.log('🚀 Creating Outlets Collection');

    try {
        await pb.admins.authWithPassword(ADMIN_EMAIL, ADMIN_PASSWORD);
        console.log('✅ Authenticated');

        const brands = await pb.collections.getOne('brands');
        console.log(`✅ Found brands collection: ${brands.id}`);

        try {
            const outlets = await pb.collections.getOne('outlets');
            console.log(`⚠️ Outlets collection already exists: ${outlets.id}`);
            // If it exists but is empty/broken, maybe delete it?
            // await pb.collections.delete('outlets');
        } catch (e) {
            console.log('Creating outlets collection...');
            const record = await pb.collections.create({
                name: 'outlets',
                type: 'base',
                schema: [
                    { name: 'brand', type: 'relation', required: true, options: { collectionId: brands.id, cascadeDelete: false, maxSelect: 1 } },
                    { name: 'name', type: 'text', required: true },
                    { name: 'address', type: 'text' },
                    { name: 'city', type: 'text' },
                    { name: 'region', type: 'text' },
                    { name: 'latitude', type: 'number', required: true },
                    { name: 'longitude', type: 'number', required: true }
                ],
                indexes: [
                    'CREATE INDEX idx_outlets_brand ON outlets (brand)',
                    'CREATE INDEX idx_outlets_city ON outlets (city)'
                ]
            });
            console.log(`✅ Created outlets collection: ${record.id}`);
        }

    } catch (e) {
        console.error('❌ Error:', e);
        if (e.data) console.error(JSON.stringify(e.data, null, 2));
    }
}

main();

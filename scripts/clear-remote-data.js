
import PocketBase from 'pocketbase';

const PB_URL = 'http://76.13.22.182';
const ADMIN_EMAIL = 'startfranchise.id@gmail.com';
const ADMIN_PASSWORD = 'Admin.startfranchise@123';

const pb = new PocketBase(PB_URL);

async function main() {
    console.log('🚀 Clearing all remote data...');

    // Auth
    try {
        try {
            await pb.collection('_superusers').authWithPassword(ADMIN_EMAIL, ADMIN_PASSWORD);
        } catch {
            await pb.admins.authWithPassword(ADMIN_EMAIL, ADMIN_PASSWORD);
        }
    } catch (e) {
        console.error('❌ Auth Failed', e.message);
        process.exit(1);
    }

    // Delete Outlets first
    try {
        const outlets = await pb.collection('outlets').getFullList();
        console.log(`🗑️ Deleting ${outlets.length} outlets...`);
        for (const r of outlets) {
            await pb.collection('outlets').delete(r.id);
            process.stdout.write('.');
        }
        console.log('\n✅ Outlets deleted.');
    } catch (e) {
        console.log('Error deleting outlets (maybe empty):', e.message);
    }

    // Delete Brands
    try {
        const brands = await pb.collection('brands').getFullList();
        console.log(`🗑️ Deleting ${brands.length} brands...`);
        for (const r of brands) {
            await pb.collection('brands').delete(r.id);
            process.stdout.write('.');
        }
        console.log('\n✅ Brands deleted.');
    } catch (e) {
        console.log('Error deleting brands:', e.message);
    }
}

main();

/**
 * Quick status check for collections
 */
import PocketBase from 'pocketbase';

const pb = new PocketBase('http://76.13.22.182');

async function main() {
    // Auth
    await pb.collection('_superusers').authWithPassword('startfranchise.id@gmail.com', 'Admin.startfranchise@123');
    console.log('✅ Authenticated\n');

    // Get collections
    const cols = await pb.collections.getFullList();

    for (const col of cols) {
        if (col.name === 'brands' || col.name === 'outlets') {
            const fieldNames = (col.fields || []).map(f => `${f.name}(${f.type})`);
            console.log(`${col.name}: ${fieldNames.length} fields`);
            console.log(`  Fields: ${fieldNames.join(', ') || 'none'}`);
        }
    }

    // Count records
    console.log('\nRecord counts:');
    const brands = await pb.collection('brands').getFullList();
    console.log(`  Brands: ${brands.length}`);

    const outlets = await pb.collection('outlets').getFullList();
    console.log(`  Outlets: ${outlets.length}`);

    if (outlets.length > 0) {
        console.log('\nSample outlet record:');
        console.log(JSON.stringify(outlets[0], null, 2));
    }
}

main().catch(console.error);

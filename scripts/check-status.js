/**
 * Quick status check for collections
 */
import PocketBase from 'pocketbase';

const pb = new PocketBase('http://76.13.22.182:8080');

async function main() {
    // Auth (Manual fetch bypass)
    console.log('🔐 Authenticating...');
    const authRes = await fetch('http://76.13.22.182:8080/api/admins/auth-with-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity: 'startfranchise.id@gmail.com', password: 'Admin.startfranchise@123' })
    });

    if (!authRes.ok) throw new Error(`Auth failed: ${authRes.statusText}`);
    const authData = await authRes.json();
    pb.authStore.save(authData.token, authData.admin);
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

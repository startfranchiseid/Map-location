/**
 * Verify imported data
 */

import PocketBase from 'pocketbase';

const PB_URL = 'https://pocketbase.startfranchise.id';
const ADMIN_EMAIL = 'startfranchise.id@gmail.com';
const ADMIN_PASSWORD = 'Admin.startfranchise@123';

const pb = new PocketBase(PB_URL);

async function main() {
    // Authenticate
    const authRes = await fetch(`${PB_URL}/api/admins/auth-with-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity: ADMIN_EMAIL, password: ADMIN_PASSWORD })
    });
    const authData = await authRes.json();
    pb.authStore.save(authData.token, authData.admin);
    
    console.log('📊 Data Verification Report');
    console.log('═'.repeat(55));
    
    const brands = await pb.collection('brands').getFullList({ sort: 'name' });
    
    console.log('\n' + 'Brand'.padEnd(35) + ' | Outlets');
    console.log('─'.repeat(55));
    
    let totalOutlets = 0;
    
    for (const brand of brands) {
        try {
            const outlets = await pb.collection('outlets').getList(1, 1, { 
                filter: `brand="${brand.id}"` 
            });
            totalOutlets += outlets.totalItems;
            console.log(brand.name.padEnd(35) + ' | ' + outlets.totalItems);
        } catch (e) {
            console.log(brand.name.padEnd(35) + ' | Error');
        }
    }
    
    console.log('─'.repeat(55));
    console.log('TOTAL'.padEnd(35) + ' | ' + totalOutlets);
    console.log('═'.repeat(55));
    
    // Show sample outlets
    console.log('\n📍 Sample Outlets (first 5):');
    const sample = await pb.collection('outlets').getList(1, 5);
    for (const o of sample.items) {
        console.log(`  - ${o.name} (${o.city})`);
    }
}

main().catch(console.error);

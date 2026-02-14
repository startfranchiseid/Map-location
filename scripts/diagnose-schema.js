/**
 * Check current outlets schema and diagnose issues
 */

import PocketBase from 'pocketbase';

const PB_URL = 'https://pocketbase.startfranchise.id';
const ADMIN_EMAIL = 'startfranchise.id@gmail.com';
const ADMIN_PASSWORD = 'Admin.startfranchise@123';

const pb = new PocketBase(PB_URL);

async function main() {
    console.log('🔍 Diagnosing PocketBase Schema...\n');
    
    // Authenticate
    try {
        const authRes = await fetch(`${PB_URL}/api/admins/auth-with-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identity: ADMIN_EMAIL, password: ADMIN_PASSWORD })
        });
        
        if (authRes.ok) {
            const authData = await authRes.json();
            pb.authStore.save(authData.token, authData.admin);
            console.log('✅ Authenticated\n');
        }
    } catch (e) {
        console.error('Auth failed:', e.message);
        return;
    }

    // Get brands collection details
    console.log('📦 BRANDS Collection Schema:');
    console.log('─'.repeat(50));
    try {
        const brandsCol = await pb.collections.getOne('brands');
        for (const field of brandsCol.schema) {
            console.log(`  ${field.name}: ${field.type}${field.required ? ' (required)' : ''}`);
            if (field.options && Object.keys(field.options).length > 0) {
                console.log(`    options: ${JSON.stringify(field.options)}`);
            }
        }
        
        // Get existing brands
        console.log('\n📋 Existing Brands:');
        const brands = await pb.collection('brands').getFullList();
        for (const b of brands) {
            console.log(`  - ${b.name} (${b.id})`);
        }
    } catch (e) {
        console.error('Error:', e.message);
    }

    // Get outlets collection details
    console.log('\n📦 OUTLETS Collection Schema:');
    console.log('─'.repeat(50));
    try {
        const outletsCol = await pb.collections.getOne('outlets');
        for (const field of outletsCol.schema) {
            console.log(`  ${field.name}: ${field.type}${field.required ? ' (required)' : ''}`);
            if (field.options && Object.keys(field.options).length > 0) {
                console.log(`    options: ${JSON.stringify(field.options)}`);
            }
        }
    } catch (e) {
        console.error('Error:', e.message);
    }

    // Try a test insert
    console.log('\n🧪 Testing Insert...');
    try {
        const brands = await pb.collection('brands').getFullList();
        if (brands.length > 0) {
            const testBrand = brands[0];
            console.log(`Using brand: ${testBrand.name} (${testBrand.id})`);
            
            // Try creating with different field combinations
            const testData = {
                brand: testBrand.id,  // Try 'brand' instead of 'brand_id'
                name: 'TEST OUTLET - DELETE ME',
                address: 'Test Address',
                city: 'Jakarta',
                region: 'DKI Jakarta',
                latitude: -6.2,
                longitude: 106.8
            };
            
            console.log('Test data:', JSON.stringify(testData, null, 2));
            
            const result = await pb.collection('outlets').create(testData);
            console.log('✅ Insert successful! ID:', result.id);
            
            // Delete test record
            await pb.collection('outlets').delete(result.id);
            console.log('✅ Test record deleted');
        }
    } catch (e) {
        console.error('❌ Test insert failed:', e.message);
        if (e.data) {
            console.error('   Details:', JSON.stringify(e.data, null, 2));
        }
    }
}

main();

/**
 * Cleanup duplicate brands and update outlet counts
 */

import PocketBase from 'pocketbase';

const PB_URL = 'https://pocketbase.startfranchise.id';
const ADMIN_EMAIL = 'startfranchise.id@gmail.com';
const ADMIN_PASSWORD = 'Admin.startfranchise@123';

const pb = new PocketBase(PB_URL);

async function main() {
    console.log('🧹 Brand Cleanup Script\n');
    
    // Authenticate
    const authRes = await fetch(`${PB_URL}/api/admins/auth-with-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity: ADMIN_EMAIL, password: ADMIN_PASSWORD })
    });
    const authData = await authRes.json();
    pb.authStore.save(authData.token, authData.admin);
    console.log('✅ Authenticated\n');
    
    // Get all brands
    const brands = await pb.collection('brands').getFullList({ sort: 'name' });
    console.log(`Found ${brands.length} brands\n`);
    
    // Find brands with 0 outlets that might be duplicates
    const emptyBrands = [];
    const activeBrands = [];
    
    for (const brand of brands) {
        const outlets = await pb.collection('outlets').getList(1, 1, { 
            filter: `brand="${brand.id}"` 
        });
        
        if (outlets.totalItems === 0) {
            emptyBrands.push(brand);
        } else {
            activeBrands.push({ ...brand, outletCount: outlets.totalItems });
        }
    }
    
    console.log('📊 Brands with outlets:');
    for (const b of activeBrands) {
        console.log(`  ✅ ${b.name}: ${b.outletCount} outlets`);
    }
    
    console.log('\n📊 Empty brands (candidates for deletion):');
    for (const b of emptyBrands) {
        console.log(`  ⚠️ ${b.name} (${b.id})`);
    }
    
    // Delete empty brands
    console.log('\n🗑️ Deleting empty brands...');
    for (const brand of emptyBrands) {
        try {
            await pb.collection('brands').delete(brand.id);
            console.log(`  ✅ Deleted: ${brand.name}`);
        } catch (e) {
            console.log(`  ❌ Failed to delete ${brand.name}: ${e.message}`);
        }
    }
    
    // Update outlet counts for active brands
    console.log('\n📝 Updating outlet counts...');
    for (const brand of activeBrands) {
        try {
            await pb.collection('brands').update(brand.id, { 
                total_outlets: brand.outletCount 
            });
            console.log(`  ✅ ${brand.name}: ${brand.outletCount}`);
        } catch (e) {
            console.log(`  ❌ Failed to update ${brand.name}`);
        }
    }
    
    console.log('\n✅ Cleanup complete!');
    
    // Final count
    const finalBrands = await pb.collection('brands').getFullList();
    const totalOutlets = await pb.collection('outlets').getList(1, 1);
    console.log(`\n📊 Final: ${finalBrands.length} brands, ${totalOutlets.totalItems} outlets`);
}

main().catch(console.error);

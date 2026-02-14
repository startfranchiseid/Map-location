/**
 * Debug import issues
 */

import PocketBase from 'pocketbase';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PB_URL = 'https://pocketbase.startfranchise.id';
const ADMIN_EMAIL = 'startfranchise.id@gmail.com';
const ADMIN_PASSWORD = 'Admin.startfranchise@123';

const pb = new PocketBase(PB_URL);

async function main() {
    console.log('🔍 Debug Import Issues\n');
    
    // Auth
    const authRes = await fetch(`${PB_URL}/api/admins/auth-with-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity: ADMIN_EMAIL, password: ADMIN_PASSWORD })
    });
    const authData = await authRes.json();
    pb.authStore.save(authData.token, authData.admin);
    console.log('✅ Authenticated\n');
    
    // Get outlets schema
    const outletsCol = await pb.collections.getOne('outlets');
    console.log('📦 Outlets Collection Schema:');
    const schemaFields = {};
    for (const field of outletsCol.schema) {
        schemaFields[field.name] = field.type;
        console.log(`  ${field.name}: ${field.type}${field.required ? ' (required)' : ''}`);
    }
    
    // Read sample from zhengda
    const content = await fs.readFile(path.join(__dirname, '..', 'zhengda.json'), 'utf-8');
    const data = JSON.parse(content);
    const sample = data[0];
    
    console.log('\n📄 Sample data from zhengda.json:');
    console.log(JSON.stringify(sample, null, 2).substring(0, 1000));
    
    // Get a brand
    const brand = await pb.collection('brands').getFirstListItem(`name="Zhengda"`);
    console.log(`\n📌 Brand: ${brand.name} (${brand.id})`);
    
    // Try inserting with minimal data
    console.log('\n🧪 Testing minimal insert...');
    try {
        const result = await pb.collection('outlets').create({
            brand: brand.id,
            brand_id: brand.id,
            name: 'TEST - ' + sample.title,
            address: sample.address || '',
            city: sample.city || '',
            region: sample.state || '',
            latitude: sample.location.lat,
            longitude: sample.location.lng
        });
        console.log('✅ Minimal insert successful:', result.id);
        
        // Delete test
        await pb.collection('outlets').delete(result.id);
        console.log('✅ Test record deleted');
    } catch (e) {
        console.log('❌ Minimal insert failed:', e.message);
        if (e.data) console.log(JSON.stringify(e.data, null, 2));
    }
    
    // Try with full data
    console.log('\n🧪 Testing full insert...');
    try {
        const result = await pb.collection('outlets').create({
            brand: brand.id,
            brand_id: brand.id,
            name: 'TEST FULL - ' + sample.title,
            address: sample.address || '',
            city: sample.city || '',
            region: sample.state || '',
            latitude: sample.location.lat,
            longitude: sample.location.lng,
            phone: sample.phone || '',
            phoneUnformatted: sample.phoneUnformatted || '',
            website: sample.website || '',
            totalScore: sample.totalScore,
            reviewsCount: sample.reviewsCount,
            imagesCount: sample.imagesCount,
            placeId: sample.placeId || '',
            cid: sample.cid || '',
            fid: sample.fid || '',
            postalCode: sample.postalCode || '',
            street: sample.street || '',
            neighborhood: sample.neighborhood || '',
            plusCode: sample.plusCode || '',
            categories: sample.categories || [],
            openingHours: sample.openingHours || [],
            popularTimesHistogram: sample.popularTimesHistogram || null,
            peopleAlsoSearch: sample.peopleAlsoSearch || [],
            reviewsDistribution: sample.reviewsDistribution || null,
            scrapedAt: sample.scrapedAt || ''
        });
        console.log('✅ Full insert successful:', result.id);
        
        // Delete test
        await pb.collection('outlets').delete(result.id);
        console.log('✅ Test record deleted');
    } catch (e) {
        console.log('❌ Full insert failed:', e.message);
        if (e.data) console.log(JSON.stringify(e.data, null, 2));
    }
}

main().catch(console.error);

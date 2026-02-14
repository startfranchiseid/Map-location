/**
 * Robust Sequential Import for remaining brands
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

const BRANDS_TO_IMPORT = {
    'baso_goreng_gg': { 
        name: 'Baso Goreng GG', 
        category: 'F&B - Restoran', 
        keywords: ['baso goreng', 'gg'],
        color: '#ec4899',
        icon: 'fa-bowl-rice'
    },
    'sambal_bakar': { 
        name: 'Sambal Bakar Indonesia', 
        category: 'F&B - Restoran', 
        keywords: ['sambal bakar'],
        color: '#f97316',
        icon: 'fa-fire'
    },
    'zhengda': { 
        name: 'Zhengda', 
        category: 'F&B - Restoran', 
        keywords: ['zhengda', 'zheng da'],
        color: '#22c55e',
        icon: 'fa-drumstick-bite'
    }
};

async function authenticate() {
    const authRes = await fetch(`${PB_URL}/api/admins/auth-with-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity: ADMIN_EMAIL, password: ADMIN_PASSWORD })
    });
    const authData = await authRes.json();
    pb.authStore.save(authData.token, authData.admin);
    return true;
}

async function getOrCreateBrand(config) {
    try {
        const existing = await pb.collection('brands').getFirstListItem(`name="${config.name}"`);
        return existing.id;
    } catch (e) {
        const record = await pb.collection('brands').create({
            name: config.name,
            category: config.category,
            color: config.color,
            icon: config.icon,
            total_outlets: 0
        });
        return record.id;
    }
}

function filterValidOutlets(data, config) {
    const valid = [];
    
    for (const outlet of data) {
        const lat = outlet.location?.lat;
        const lng = outlet.location?.lng;
        
        if (!lat || !lng) continue;
        if (lat < -11 || lat > 6 || lng < 95 || lng > 141) continue;
        if (outlet.permanentlyClosed === true) continue;
        if (!outlet.title?.trim()) continue;
        
        const titleLower = outlet.title.toLowerCase();
        const matchesBrand = config.keywords.some(kw => titleLower.includes(kw.toLowerCase()));
        if (!matchesBrand) continue;
        
        valid.push(outlet);
    }
    
    return valid;
}

async function importOutletsSequential(brandId, outlets) {
    let imported = 0;
    let skipped = 0;
    let errors = 0;
    
    // Get existing placeIds
    const existing = await pb.collection('outlets').getFullList({
        filter: `brand="${brandId}"`,
        fields: 'placeId,name'
    });
    const existingPlaceIds = new Set(existing.map(o => o.placeId).filter(Boolean));
    const existingNames = new Set(existing.map(o => o.name));
    
    for (let i = 0; i < outlets.length; i++) {
        const outlet = outlets[i];
        
        // Skip if exists
        if (outlet.placeId && existingPlaceIds.has(outlet.placeId)) {
            skipped++;
            continue;
        }
        if (existingNames.has(outlet.title)) {
            skipped++;
            continue;
        }
        
        try {
            await pb.collection('outlets').create({
                brand: brandId,
                brand_id: brandId,
                name: outlet.title.trim(),
                address: outlet.address || '',
                city: outlet.city || '',
                region: outlet.state || '',
                latitude: parseFloat(outlet.location.lat),
                longitude: parseFloat(outlet.location.lng),
                phone: outlet.phone || '',
                phoneUnformatted: outlet.phoneUnformatted || '',
                website: outlet.website || '',
                totalScore: outlet.totalScore || null,
                reviewsCount: outlet.reviewsCount || 0,
                imagesCount: outlet.imagesCount || 0,
                placeId: outlet.placeId || '',
                cid: outlet.cid || '',
                fid: outlet.fid || '',
                postalCode: outlet.postalCode || '',
                street: outlet.street || '',
                neighborhood: outlet.neighborhood || '',
                plusCode: outlet.plusCode || '',
                categories: outlet.categories || [],
                openingHours: outlet.openingHours || [],
                popularTimesHistogram: outlet.popularTimesHistogram || null,
                peopleAlsoSearch: outlet.peopleAlsoSearch || [],
                reviewsDistribution: outlet.reviewsDistribution || null,
                scrapedAt: outlet.scrapedAt || ''
            });
            imported++;
            existingPlaceIds.add(outlet.placeId);
            existingNames.add(outlet.title);
        } catch (e) {
            errors++;
            if (errors <= 5) {
                console.log(`   ❌ Error [${outlet.title.substring(0, 30)}]: ${e.message}`);
            }
        }
        
        // Progress every 20
        if ((i + 1) % 20 === 0) {
            console.log(`   📊 ${i + 1}/${outlets.length}`);
        }
        
        // Small delay to avoid rate limiting
        if (i % 10 === 0) {
            await new Promise(r => setTimeout(r, 50));
        }
    }
    
    return { imported, skipped, errors };
}

async function main() {
    console.log('═'.repeat(60));
    console.log('🚀 Sequential Import for 3 Brands');
    console.log('═'.repeat(60));
    
    await authenticate();
    console.log('✅ Authenticated\n');
    
    const rootDir = path.join(__dirname, '..');
    
    for (const [fileKey, config] of Object.entries(BRANDS_TO_IMPORT)) {
        console.log(`📌 ${config.name}`);
        
        // Read file
        const filePath = path.join(rootDir, `${fileKey}.json`);
        const content = await fs.readFile(filePath, 'utf-8');
        const data = JSON.parse(content);
        console.log(`   📂 ${data.length} records in file`);
        
        // Filter
        const valid = filterValidOutlets(data, config);
        console.log(`   ✅ ${valid.length} valid outlets`);
        
        if (valid.length === 0) continue;
        
        // Get/create brand
        const brandId = await getOrCreateBrand(config);
        console.log(`   📌 Brand ID: ${brandId}`);
        
        // Import
        const { imported, skipped, errors } = await importOutletsSequential(brandId, valid);
        console.log(`   ✅ Imported: ${imported}, Skipped: ${skipped}, Errors: ${errors}`);
        
        // Update count
        const count = await pb.collection('outlets').getList(1, 1, { filter: `brand="${brandId}"` });
        await pb.collection('brands').update(brandId, { total_outlets: count.totalItems });
        console.log(`   📊 Total: ${count.totalItems} outlets\n`);
    }
    
    // Summary
    console.log('═'.repeat(60));
    const total = await pb.collection('outlets').getList(1, 1);
    console.log(`📊 Total outlets in database: ${total.totalItems}`);
    console.log('═'.repeat(60));
}

main().catch(console.error);

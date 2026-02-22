/**
 * Import remaining 3 brands with coordinates
 * Optimized batch import
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

// Brands to import
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
    console.log('🔐 Authenticating...');
    try {
        const authRes = await fetch(`${PB_URL}/api/admins/auth-with-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identity: ADMIN_EMAIL, password: ADMIN_PASSWORD })
        });
        
        if (authRes.ok) {
            const authData = await authRes.json();
            pb.authStore.save(authData.token, authData.admin);
            console.log('   ✅ Authenticated\n');
            return true;
        }
    } catch (e) {
        console.error('   ❌ Auth failed:', e.message);
    }
    return false;
}

async function loadCategories() {
    const categories = await pb.collection('categories').getFullList({
        fields: 'id,name',
    }).catch(() => []);
    return new Map(categories.map((c) => [c.name, c.id]));
}

async function getCategoryId(categoryName, categoryMap) {
    if (!categoryName) return '';
    if (categoryMap.has(categoryName)) return categoryMap.get(categoryName);
    const created = await pb.collection('categories').create({
        name: categoryName,
        icon: 'fa-tag',
        color: '#8b5cf6',
    });
    categoryMap.set(created.name, created.id);
    return created.id;
}

async function getOrCreateBrand(config, categoryMap) {
    // Try to find existing
    try {
        const existing = await pb.collection('brands').getFirstListItem(`name="${config.name}"`);
        console.log(`   📌 Found existing brand: ${config.name} (${existing.id})`);
        return existing.id;
    } catch (e) {
        // Create new
        try {
            const categoryId = await getCategoryId(config.category, categoryMap);
            const record = await pb.collection('brands').create({
                name: config.name,
                category: categoryId,
                color: config.color,
                icon: config.icon,
                total_outlets: 0
            });
            console.log(`   ✅ Created brand: ${config.name} (${record.id})`);
            return record.id;
        } catch (createError) {
            console.error(`   ❌ Failed to create brand: ${createError.message}`);
            return null;
        }
    }
}

function filterValidOutlets(data, config) {
    const valid = [];
    let filtered = 0;
    
    for (const outlet of data) {
        const lat = outlet.location?.lat;
        const lng = outlet.location?.lng;
        
        // Must have coordinates
        if (!lat || !lng) {
            filtered++;
            continue;
        }
        
        // Indonesia bounds
        if (lat < -11 || lat > 6 || lng < 95 || lng > 141) {
            filtered++;
            continue;
        }
        
        // Not closed
        if (outlet.permanentlyClosed === true) {
            filtered++;
            continue;
        }
        
        // Must have title
        if (!outlet.title?.trim()) {
            filtered++;
            continue;
        }
        
        // Must match brand keywords
        const titleLower = outlet.title.toLowerCase();
        const matchesBrand = config.keywords.some(kw => titleLower.includes(kw.toLowerCase()));
        if (!matchesBrand) {
            filtered++;
            continue;
        }
        
        valid.push({
            name: outlet.title.trim(),
            address: outlet.address || outlet.street || '',
            city: outlet.city || '',
            region: outlet.state || '',
            latitude: parseFloat(lat),
            longitude: parseFloat(lng),
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
    }
    
    return { valid, filtered };
}

async function batchImport(brandId, outlets) {
    let imported = 0;
    let skipped = 0;
    let errors = 0;
    
    // Get existing placeIds for this brand to avoid duplicates
    const existingOutlets = await pb.collection('outlets').getFullList({
        filter: `brand="${brandId}"`,
        fields: 'placeId'
    });
    const existingPlaceIds = new Set(existingOutlets.map(o => o.placeId).filter(Boolean));
    
    console.log(`   📊 Existing outlets for brand: ${existingPlaceIds.size}`);
    
    // Batch process
    const BATCH_SIZE = 100;
    
    for (let i = 0; i < outlets.length; i += BATCH_SIZE) {
        const batch = outlets.slice(i, i + BATCH_SIZE);
        
        const promises = batch.map(async (outlet) => {
            // Skip if already exists
            if (outlet.placeId && existingPlaceIds.has(outlet.placeId)) {
                return { status: 'skipped' };
            }
            
            try {
                await pb.collection('outlets').create({
                    brand: brandId,
                    brand_id: brandId,
                    name: outlet.name,
                    address: outlet.address,
                    city: outlet.city,
                    region: outlet.region,
                    latitude: outlet.latitude,
                    longitude: outlet.longitude,
                    phone: outlet.phone,
                    phoneUnformatted: outlet.phoneUnformatted,
                    website: outlet.website,
                    totalScore: outlet.totalScore,
                    reviewsCount: outlet.reviewsCount,
                    imagesCount: outlet.imagesCount,
                    placeId: outlet.placeId,
                    cid: outlet.cid,
                    fid: outlet.fid,
                    postalCode: outlet.postalCode,
                    street: outlet.street,
                    neighborhood: outlet.neighborhood,
                    plusCode: outlet.plusCode,
                    categories: outlet.categories,
                    openingHours: outlet.openingHours,
                    popularTimesHistogram: outlet.popularTimesHistogram,
                    peopleAlsoSearch: outlet.peopleAlsoSearch,
                    reviewsDistribution: outlet.reviewsDistribution,
                    scrapedAt: outlet.scrapedAt
                });
                return { status: 'imported' };
            } catch (e) {
                return { status: 'error', message: e.message };
            }
        });
        
        const results = await Promise.all(promises);
        
        for (const r of results) {
            if (r.status === 'imported') imported++;
            else if (r.status === 'skipped') skipped++;
            else errors++;
        }
        
        // Progress
        if (i + BATCH_SIZE < outlets.length) {
            console.log(`   📊 Progress: ${Math.min(i + BATCH_SIZE, outlets.length)}/${outlets.length}`);
        }
    }
    
    return { imported, skipped, errors };
}

async function main() {
    console.log('═'.repeat(60));
    console.log('🚀 Import 3 New Brands (Baso Goreng GG, Sambal Bakar, Zhengda)');
    console.log('═'.repeat(60));
    
    if (!await authenticate()) return;
    const categoryMap = await loadCategories();
    
    const rootDir = path.join(__dirname, '..');
    
    for (const [fileKey, config] of Object.entries(BRANDS_TO_IMPORT)) {
        console.log(`\n📌 Processing ${config.name}...`);
        
        // Read JSON
        const filePath = path.join(rootDir, `${fileKey}.json`);
        let data;
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            data = JSON.parse(content);
            console.log(`   📂 Read ${data.length} records from ${fileKey}.json`);
        } catch (e) {
            console.log(`   ❌ Error reading file: ${e.message}`);
            continue;
        }
        
        // Filter valid outlets
        const { valid, filtered } = filterValidOutlets(data, config);
        console.log(`   ✅ Valid: ${valid.length}, Filtered: ${filtered}`);
        
        if (valid.length === 0) {
            console.log(`   ⏭️ No valid outlets, skipping`);
            continue;
        }
        
        // Get or create brand
        const brandId = await getOrCreateBrand(config, categoryMap);
        if (!brandId) continue;
        
        // Import outlets
        console.log(`   📥 Importing...`);
        const { imported, skipped, errors } = await batchImport(brandId, valid);
        console.log(`   ✅ Imported: ${imported}, Skipped: ${skipped}, Errors: ${errors}`);
        
        // Update brand count
        const count = await pb.collection('outlets').getList(1, 1, { filter: `brand="${brandId}"` });
        await pb.collection('brands').update(brandId, { total_outlets: count.totalItems });
        console.log(`   📊 Total outlets for ${config.name}: ${count.totalItems}`);
    }
    
    // Final summary
    console.log('\n' + '═'.repeat(60));
    console.log('📊 FINAL SUMMARY');
    console.log('═'.repeat(60));
    
    const allBrands = await pb.collection('brands').getFullList({ sort: 'name' });
    const totalOutlets = await pb.collection('outlets').getList(1, 1);
    
    console.log(`\n${'Brand'.padEnd(35)} | Outlets`);
    console.log('─'.repeat(55));
    
    for (const brand of allBrands) {
        const outlets = await pb.collection('outlets').getList(1, 1, { filter: `brand="${brand.id}"` });
        console.log(`${brand.name.padEnd(35)} | ${outlets.totalItems}`);
    }
    
    console.log('─'.repeat(55));
    console.log(`${'TOTAL'.padEnd(35)} | ${totalOutlets.totalItems}`);
    console.log('═'.repeat(60));
}

main().catch(console.error);

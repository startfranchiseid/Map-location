/**
 * Final Import Script - Uses correct field names from schema
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

// Brand configurations
const BRAND_CONFIG = {
    'icanread': { name: 'I Can Read', category: 'Pendidikan', keywords: ['i can read', 'icanread'] },
    'kumon': { name: 'Kumon', category: 'Pendidikan', keywords: ['kumon'] },
    'umc_ucmas': { name: 'UMC UCMAS Indonesia', category: 'Pendidikan', keywords: ['umc', 'ucmas'] },
    'bingxue': { name: 'Bingxue', category: 'F&B - Minuman', keywords: ['bingxue', 'bing xue'] },
    'luuca': { name: 'Luuca', category: 'F&B - Minuman', keywords: ['luuca'] },
    'laundry_klin': { name: 'LaundryKlin', category: 'Laundry', keywords: ['laundryklin', 'laundry klin'] },
    'baliren': { name: 'Ba Li Ren', category: 'F&B - Restoran', keywords: ['ba li ren', 'baliren', '巴黎人'] },
    'sambal_bakar': { name: 'Sambal Bakar Indonesia', category: 'F&B - Restoran', keywords: ['sambal bakar'] },
    'zhengda': { name: 'Zhengda', category: 'F&B - Restoran', keywords: ['zhengda', 'zheng da'] },
    'deft_barber': { name: 'Deft Barber', category: 'Barbershop', keywords: ['deft barber', 'deft'] },
    'chifry': { name: 'Chifry', category: 'F&B - Restoran', keywords: ['chifry'] },
    'baso_goreng_gg': { name: 'Baso Goreng GG', category: 'F&B - Restoran', keywords: ['baso goreng', 'gg'] },
    'E&W_Burgers': { name: 'E&W Burgers', category: 'F&B - Restoran', keywords: ['e&w', 'burger'] }
};

const BRAND_COLORS = {
    'I Can Read': '#6366f1',
    'Kumon': '#3b82f6',
    'UMC UCMAS Indonesia': '#fbbf24',
    'Bingxue': '#38bdf8',
    'Luuca': '#f87171',
    'LaundryKlin': '#60a5fa',
    'Ba Li Ren': '#ef4444',
    'Sambal Bakar Indonesia': '#f97316',
    'Zhengda': '#22c55e',
    'Deft Barber': '#34d399',
    'Chifry': '#a855f7',
    'Baso Goreng GG': '#ec4899',
    'E&W Burgers': '#eab308'
};

const BRAND_ICONS = {
    'I Can Read': 'fa-book-reader',
    'Kumon': 'fa-graduation-cap',
    'UMC UCMAS Indonesia': 'fa-calculator',
    'Bingxue': 'fa-snowflake',
    'Luuca': 'fa-ice-cream',
    'LaundryKlin': 'fa-shirt',
    'Ba Li Ren': 'fa-utensils',
    'Sambal Bakar Indonesia': 'fa-fire',
    'Zhengda': 'fa-drumstick-bite',
    'Deft Barber': 'fa-scissors',
    'Chifry': 'fa-bowl-food',
    'Baso Goreng GG': 'fa-bowl-rice',
    'E&W Burgers': 'fa-burger'
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
            console.log('   ✅ Authenticated');
            return true;
        }
    } catch (e) {
        console.error('   ❌ Auth failed:', e.message);
    }
    return false;
}

async function getExistingBrands() {
    const brands = await pb.collection('brands').getFullList();
    const brandMap = new Map();
    for (const b of brands) {
        brandMap.set(b.name, b.id);
        // Also map common variations
        brandMap.set(b.name.toLowerCase(), b.id);
    }
    return brandMap;
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

async function getOrCreateBrand(brandName, config, existingBrands, categoryMap) {
    // Check existing
    if (existingBrands.has(brandName)) {
        return existingBrands.get(brandName);
    }
    if (existingBrands.has(brandName.toLowerCase())) {
        return existingBrands.get(brandName.toLowerCase());
    }
    
    // Create new
    try {
        const categoryId = await getCategoryId(config.category, categoryMap);
        const record = await pb.collection('brands').create({
            name: brandName,
            category: categoryId,
            color: BRAND_COLORS[brandName] || '#667eea',
            icon: BRAND_ICONS[brandName] || 'fa-store',
            total_outlets: 0
        });
        console.log(`   ✅ Created brand: ${brandName}`);
        existingBrands.set(brandName, record.id);
        return record.id;
    } catch (e) {
        console.error(`   ❌ Failed to create brand ${brandName}:`, e.message);
        return null;
    }
}

function filterValidOutlets(data, config) {
    const validOutlets = [];
    const stats = { noLocation: 0, wrongBrand: 0, closed: 0, noTitle: 0 };
    
    for (const outlet of data) {
        const lat = outlet.location?.lat;
        const lng = outlet.location?.lng;
        
        if (!lat || !lng) {
            stats.noLocation++;
            continue;
        }
        
        // Check Indonesia bounds
        if (lat < -11 || lat > 6 || lng < 95 || lng > 141) {
            stats.noLocation++;
            continue;
        }
        
        if (outlet.permanentlyClosed === true) {
            stats.closed++;
            continue;
        }
        
        if (!outlet.title || outlet.title.trim() === '') {
            stats.noTitle++;
            continue;
        }
        
        const titleLower = outlet.title.toLowerCase();
        const matchesBrand = config.keywords.some(keyword => 
            titleLower.includes(keyword.toLowerCase())
        );
        
        if (!matchesBrand) {
            stats.wrongBrand++;
            continue;
        }
        
        validOutlets.push({
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
    
    return { validOutlets, stats };
}

async function importOutlets(brandId, outlets) {
    let imported = 0;
    let skipped = 0;
    let errors = 0;
    
    for (const outlet of outlets) {
        try {
            // Check if exists by placeId
            if (outlet.placeId) {
                try {
                    await pb.collection('outlets').getFirstListItem(`placeId="${outlet.placeId}"`);
                    skipped++;
                    continue;
                } catch (e) { /* not found */ }
            }
            
            // Create outlet - using BOTH brand and brand_id fields
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
            imported++;
        } catch (e) {
            errors++;
            if (errors <= 3) {
                console.log(`      ❌ ${outlet.name}: ${e.message}`);
                if (e.data) console.log(`         ${JSON.stringify(e.data)}`);
            }
        }
    }
    
    return { imported, skipped, errors };
}

async function main() {
    console.log('═'.repeat(60));
    console.log('🚀 Brand Outlets Import - Final');
    console.log('═'.repeat(60));
    
    if (!await authenticate()) return;
    
    // Get existing brands
    console.log('\n📋 Loading existing brands...');
    const existingBrands = await getExistingBrands();
    console.log(`   Found ${existingBrands.size / 2} brands`);
    const categoryMap = await loadCategories();
    
    // Read JSON files
    console.log('\n📂 Reading JSON files...');
    const rootDir = path.join(__dirname, '..');
    const files = await fs.readdir(rootDir);
    const jsonFiles = files.filter(f => 
        f.endsWith('.json') && 
        !['package.json', 'package-lock.json', 'tsconfig.json'].includes(f)
    );
    
    let totalImported = 0;
    let totalSkipped = 0;
    let totalErrors = 0;
    
    console.log('\n📥 Processing and importing...\n');
    
    for (const file of jsonFiles) {
        const brandKey = file.replace('.json', '');
        const config = BRAND_CONFIG[brandKey];
        
        if (!config) {
            console.log(`⏭️ Skipping ${file} (no config)`);
            continue;
        }
        
        // Read file
        let data;
        try {
            const content = await fs.readFile(path.join(rootDir, file), 'utf-8');
            data = JSON.parse(content);
        } catch (e) {
            console.log(`❌ Error reading ${file}: ${e.message}`);
            continue;
        }
        
        // Filter valid outlets
        const { validOutlets, stats } = filterValidOutlets(data, config);
        
        if (validOutlets.length === 0) {
            console.log(`⏭️ ${config.name}: 0 valid (${data.length} raw, ${stats.noLocation} no loc, ${stats.wrongBrand} wrong brand)`);
            continue;
        }
        
        // Get or create brand
        const brandId = await getOrCreateBrand(config.name, config, existingBrands, categoryMap);
        if (!brandId) continue;
        
        // Import outlets
        console.log(`📌 ${config.name}: Importing ${validOutlets.length} outlets...`);
        const { imported, skipped, errors } = await importOutlets(brandId, validOutlets);
        
        totalImported += imported;
        totalSkipped += skipped;
        totalErrors += errors;
        
        console.log(`   ✅ ${imported} imported, ${skipped} skipped, ${errors} errors`);
        
        // Update brand outlet count
        try {
            const count = await pb.collection('outlets').getList(1, 1, { 
                filter: `brand="${brandId}" || brand_id="${brandId}"` 
            });
            await pb.collection('brands').update(brandId, { total_outlets: count.totalItems });
        } catch (e) {}
    }
    
    console.log('\n' + '═'.repeat(60));
    console.log('📊 FINAL SUMMARY');
    console.log('═'.repeat(60));
    console.log(`   ✅ Imported: ${totalImported}`);
    console.log(`   ⏭️ Skipped: ${totalSkipped}`);
    console.log(`   ❌ Errors: ${totalErrors}`);
    console.log('═'.repeat(60));
}

main().catch(console.error);

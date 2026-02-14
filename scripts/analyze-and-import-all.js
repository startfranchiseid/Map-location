/**
 * Comprehensive Data Analysis and Import Script
 * - Analyzes all JSON files in root folder
 * - Filters out invalid data
 * - Checks PocketBase collections
 * - Imports valid data
 */

import PocketBase from 'pocketbase';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuration
const PB_URL = process.env.PUBLIC_POCKETBASE_URL || 'https://pocketbase.startfranchise.id';
const ADMIN_EMAIL = process.env.POCKETBASE_ADMIN_EMAIL || 'startfranchise.id@gmail.com';
const ADMIN_PASSWORD = process.env.POCKETBASE_ADMIN_PASSWORD || 'Admin.startfranchise@123';

const pb = new PocketBase(PB_URL);

// Brand name mappings and categories based on file names
const BRAND_CONFIG = {
    'icanread': { name: 'I Can Read', category: 'Pendidikan', keywords: ['i can read', 'icanread'] },
    'kumon': { name: 'Kumon', category: 'Pendidikan', keywords: ['kumon'] },
    'umc_ucmas': { name: 'UMC UCMAS Indonesia', category: 'Pendidikan', keywords: ['umc', 'ucmas'] },
    'bingxue': { name: 'Bingxue', category: 'F&B - Minuman', keywords: ['bingxue', 'bing xue'] },
    'luuca': { name: 'Luuca', category: 'F&B - Minuman', keywords: ['luuca'] },
    'laundry_klin': { name: 'Laundry Klin', category: 'Laundry', keywords: ['laundryklin', 'laundry klin'] },
    'baliren': { name: 'Ba Li Ren', category: 'F&B - Restoran', keywords: ['ba li ren', 'baliren', '巴黎人'] },
    'sambal_bakar': { name: 'Sambal Bakar Indonesia', category: 'F&B - Restoran', keywords: ['sambal bakar'] },
    'zhengda': { name: 'Zhengda', category: 'F&B - Restoran', keywords: ['zhengda', 'zheng da'] },
    'deft_barber': { name: 'Deft Barber', category: 'Barbershop', keywords: ['deft barber'] },
    'chifry': { name: 'Chifry', category: 'F&B - Restoran', keywords: ['chifry'] },
    'baso_goreng_gg': { name: 'Baso Goreng GG', category: 'F&B - Restoran', keywords: ['baso goreng', 'gg'] },
    'E&W_Burgers': { name: 'E&W Burgers', category: 'F&B - Restoran', keywords: ['e&w', 'burger'] }
};

// Color mappings for brands
const BRAND_COLORS = {
    'I Can Read': '#6366f1',
    'Kumon': '#3b82f6',
    'UMC UCMAS Indonesia': '#fbbf24',
    'Bingxue': '#38bdf8',
    'Luuca': '#f87171',
    'Laundry Klin': '#60a5fa',
    'Ba Li Ren': '#ef4444',
    'Sambal Bakar Indonesia': '#f97316',
    'Zhengda': '#22c55e',
    'Deft Barber': '#34d399',
    'Chifry': '#a855f7',
    'Baso Goreng GG': '#ec4899',
    'E&W Burgers': '#eab308'
};

// Icon mappings for brands
const BRAND_ICONS = {
    'I Can Read': 'fa-book-reader',
    'Kumon': 'fa-graduation-cap',
    'UMC UCMAS Indonesia': 'fa-calculator',
    'Bingxue': 'fa-snowflake',
    'Luuca': 'fa-ice-cream',
    'Laundry Klin': 'fa-shirt',
    'Ba Li Ren': 'fa-utensils',
    'Sambal Bakar Indonesia': 'fa-fire',
    'Zhengda': 'fa-drumstick-bite',
    'Deft Barber': 'fa-scissors',
    'Chifry': 'fa-bowl-food',
    'Baso Goreng GG': 'fa-bowl-rice',
    'E&W Burgers': 'fa-burger'
};

async function authenticate() {
    console.log('🔐 Authenticating with PocketBase...');
    console.log(`   URL: ${PB_URL}`);
    
    try {
        // Try SDK authentication first
        await pb.admins.authWithPassword(ADMIN_EMAIL, ADMIN_PASSWORD);
        console.log('   ✅ Authenticated via SDK');
        return true;
    } catch (e) {
        console.log('   ⚠️ SDK auth failed, trying fetch...');
        
        // Try fetch bypass
        try {
            const authRes = await fetch(`${PB_URL}/api/admins/auth-with-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ identity: ADMIN_EMAIL, password: ADMIN_PASSWORD })
            });
            
            if (authRes.ok) {
                const authData = await authRes.json();
                pb.authStore.save(authData.token, authData.admin);
                console.log('   ✅ Authenticated via Fetch');
                return true;
            }
        } catch (fetchError) {
            console.error('   ❌ Fetch auth failed:', fetchError.message);
        }
    }
    return false;
}

async function checkCollections() {
    console.log('\n📦 Checking PocketBase Collections...');
    
    const collections = {};
    
    try {
        // Check brands collection
        try {
            const brandsCol = await pb.collections.getOne('brands');
            console.log('   ✅ brands collection exists');
            console.log(`      Fields: ${brandsCol.schema.map(f => f.name).join(', ')}`);
            collections.brands = brandsCol;
        } catch (e) {
            console.log('   ❌ brands collection not found');
            collections.brands = null;
        }
        
        // Check outlets collection
        try {
            const outletsCol = await pb.collections.getOne('outlets');
            console.log('   ✅ outlets collection exists');
            console.log(`      Fields: ${outletsCol.schema.map(f => f.name).join(', ')}`);
            collections.outlets = outletsCol;
        } catch (e) {
            console.log('   ❌ outlets collection not found');
            collections.outlets = null;
        }
        
        // Get existing data counts
        if (collections.brands) {
            const brandsCount = await pb.collection('brands').getList(1, 1);
            console.log(`   📊 Existing brands: ${brandsCount.totalItems}`);
        }
        
        if (collections.outlets) {
            const outletsCount = await pb.collection('outlets').getList(1, 1);
            console.log(`   📊 Existing outlets: ${outletsCount.totalItems}`);
        }
        
    } catch (e) {
        console.error('   ❌ Error checking collections:', e.message);
    }
    
    return collections;
}

async function readAllJsonFiles() {
    console.log('\n📂 Reading JSON files from root folder...');
    
    const rootDir = path.join(__dirname, '..');
    const files = await fs.readdir(rootDir);
    const jsonFiles = files.filter(f => f.endsWith('.json') && f !== 'package.json' && f !== 'package-lock.json' && f !== 'tsconfig.json');
    
    console.log(`   Found ${jsonFiles.length} JSON files`);
    
    const allData = {};
    
    for (const file of jsonFiles) {
        const brandKey = file.replace('.json', '');
        const config = BRAND_CONFIG[brandKey];
        
        if (!config) {
            console.log(`   ⚠️ No config for ${file}, skipping`);
            continue;
        }
        
        try {
            const filePath = path.join(rootDir, file);
            const content = await fs.readFile(filePath, 'utf-8');
            const data = JSON.parse(content);
            
            allData[brandKey] = {
                config,
                rawData: data,
                file
            };
            
            console.log(`   ✅ ${file}: ${data.length} records`);
        } catch (e) {
            console.error(`   ❌ Error reading ${file}:`, e.message);
        }
    }
    
    return allData;
}

function filterValidOutlets(brandKey, data, config) {
    const validOutlets = [];
    const invalidReasons = {
        noLocation: 0,
        wrongBrand: 0,
        permanentlyClosed: 0,
        noTitle: 0,
        noCity: 0
    };
    
    for (const outlet of data) {
        // Check if has valid location
        const lat = outlet.location?.lat;
        const lng = outlet.location?.lng;
        
        if (!lat || !lng) {
            invalidReasons.noLocation++;
            continue;
        }
        
        // Check if location is in Indonesia (rough bounds)
        if (lat < -11 || lat > 6 || lng < 95 || lng > 141) {
            invalidReasons.noLocation++;
            continue;
        }
        
        // Check if permanently closed
        if (outlet.permanentlyClosed === true) {
            invalidReasons.permanentlyClosed++;
            continue;
        }
        
        // Check if has title
        if (!outlet.title || outlet.title.trim() === '') {
            invalidReasons.noTitle++;
            continue;
        }
        
        // Check if brand name matches (case insensitive)
        const titleLower = outlet.title.toLowerCase();
        const matchesBrand = config.keywords.some(keyword => 
            titleLower.includes(keyword.toLowerCase())
        );
        
        if (!matchesBrand) {
            invalidReasons.wrongBrand++;
            continue;
        }
        
        // Check for city
        if (!outlet.city && !outlet.state) {
            invalidReasons.noCity++;
            continue;
        }
        
        // Valid outlet - normalize the data
        validOutlets.push({
            name: outlet.title.trim(),
            address: outlet.address || outlet.street || '',
            city: outlet.city || '',
            region: outlet.state || '',
            latitude: parseFloat(lat),
            longitude: parseFloat(lng),
            phone: outlet.phone || outlet.phoneUnformatted || '',
            website: outlet.website || '',
            totalScore: outlet.totalScore || null,
            reviewsCount: outlet.reviewsCount || 0,
            categoryName: outlet.categoryName || '',
            placeId: outlet.placeId || '',
            postalCode: outlet.postalCode || ''
        });
    }
    
    return { validOutlets, invalidReasons };
}

async function ensureCollectionsExist(collections) {
    console.log('\n🔧 Ensuring collections are properly configured...');
    
    // Get brands collection ID for relation
    let brandsId = collections.brands?.id;
    
    // Create or update brands collection if needed
    if (!collections.brands) {
        console.log('   Creating brands collection...');
        try {
            const record = await pb.collections.create({
                name: 'brands',
                type: 'base',
                schema: [
                    { name: 'name', type: 'text', required: true },
                    { name: 'category', type: 'text' },
                    { name: 'website', type: 'url' },
                    { name: 'logo', type: 'file', options: { maxSelect: 1, maxSize: 5242880 } },
                    { name: 'color', type: 'text' },
                    { name: 'icon', type: 'text' },
                    { name: 'total_outlets', type: 'number' }
                ]
            });
            console.log(`   ✅ Created brands collection: ${record.id}`);
            brandsId = record.id;
        } catch (e) {
            console.error('   ❌ Failed to create brands:', e.message);
            return false;
        }
    } else {
        // Check if missing fields need to be added
        const existingFields = collections.brands.schema.map(f => f.name);
        const requiredFields = ['name', 'category', 'website', 'logo', 'color', 'icon', 'total_outlets'];
        const missingFields = requiredFields.filter(f => !existingFields.includes(f));
        
        if (missingFields.length > 0) {
            console.log(`   ⚠️ Missing fields in brands: ${missingFields.join(', ')}`);
            // Would need to update schema here
        }
    }
    
    // Create or update outlets collection if needed
    if (!collections.outlets) {
        console.log('   Creating outlets collection...');
        try {
            const record = await pb.collections.create({
                name: 'outlets',
                type: 'base',
                schema: [
                    { name: 'brand_id', type: 'relation', required: true, options: { collectionId: brandsId, cascadeDelete: false, maxSelect: 1 } },
                    { name: 'name', type: 'text', required: true },
                    { name: 'address', type: 'text' },
                    { name: 'city', type: 'text' },
                    { name: 'region', type: 'text' },
                    { name: 'latitude', type: 'number', required: true },
                    { name: 'longitude', type: 'number', required: true },
                    { name: 'phone', type: 'text' },
                    { name: 'website', type: 'url' },
                    { name: 'total_score', type: 'number' },
                    { name: 'reviews_count', type: 'number' },
                    { name: 'category_name', type: 'text' },
                    { name: 'place_id', type: 'text' },
                    { name: 'postal_code', type: 'text' }
                ],
                indexes: [
                    'CREATE INDEX idx_outlets_brand ON outlets (brand_id)',
                    'CREATE INDEX idx_outlets_city ON outlets (city)'
                ]
            });
            console.log(`   ✅ Created outlets collection: ${record.id}`);
        } catch (e) {
            console.error('   ❌ Failed to create outlets:', e.message);
            return false;
        }
    } else {
        // Check if missing fields need to be added
        const existingFields = collections.outlets.schema.map(f => f.name);
        const requiredFields = ['brand_id', 'name', 'address', 'city', 'region', 'latitude', 'longitude', 'phone', 'website', 'total_score', 'reviews_count', 'category_name', 'place_id', 'postal_code'];
        const missingFields = requiredFields.filter(f => !existingFields.includes(f));
        
        if (missingFields.length > 0) {
            console.log(`   ⚠️ Missing fields in outlets: ${missingFields.join(', ')}`);
            console.log('   Attempting to add missing fields...');
            
            // Get current schema and add missing fields
            const currentSchema = [...collections.outlets.schema];
            
            for (const field of missingFields) {
                let fieldDef;
                switch (field) {
                    case 'brand_id':
                        fieldDef = { name: 'brand_id', type: 'relation', required: true, options: { collectionId: brandsId, cascadeDelete: false, maxSelect: 1 } };
                        break;
                    case 'phone':
                    case 'category_name':
                    case 'place_id':
                    case 'postal_code':
                        fieldDef = { name: field, type: 'text' };
                        break;
                    case 'website':
                        fieldDef = { name: field, type: 'url' };
                        break;
                    case 'total_score':
                    case 'reviews_count':
                        fieldDef = { name: field, type: 'number' };
                        break;
                    default:
                        fieldDef = { name: field, type: 'text' };
                }
                currentSchema.push(fieldDef);
            }
            
            try {
                await pb.collections.update(collections.outlets.id, { schema: currentSchema });
                console.log('   ✅ Updated outlets schema');
            } catch (e) {
                console.log(`   ⚠️ Could not update schema: ${e.message}`);
            }
        }
    }
    
    return true;
}

async function getOrCreateBrand(brandName, config) {
    // Try to find existing brand
    try {
        const existing = await pb.collection('brands').getFirstListItem(`name="${brandName}"`);
        return existing.id;
    } catch (e) {
        // Not found, create new
        try {
            const record = await pb.collection('brands').create({
                name: brandName,
                category: config.category,
                color: BRAND_COLORS[brandName] || '#667eea',
                icon: BRAND_ICONS[brandName] || 'fa-store',
                total_outlets: 0
            });
            console.log(`   ✅ Created brand: ${brandName} (${record.id})`);
            return record.id;
        } catch (createError) {
            console.error(`   ❌ Failed to create brand ${brandName}:`, createError.message);
            return null;
        }
    }
}

async function importOutlets(brandId, outlets, brandName) {
    let imported = 0;
    let skipped = 0;
    let errors = 0;
    
    // Import in batches
    const batchSize = 50;
    
    for (let i = 0; i < outlets.length; i += batchSize) {
        const batch = outlets.slice(i, i + batchSize);
        
        for (const outlet of batch) {
            try {
                // Check if already exists by place_id or coordinates
                let exists = false;
                if (outlet.placeId) {
                    try {
                        await pb.collection('outlets').getFirstListItem(`place_id="${outlet.placeId}"`);
                        exists = true;
                    } catch (e) { /* not found */ }
                }
                
                if (!exists && outlet.latitude && outlet.longitude) {
                    try {
                        // Check by coordinates (with small tolerance)
                        await pb.collection('outlets').getFirstListItem(
                            `latitude > ${outlet.latitude - 0.0001} && latitude < ${outlet.latitude + 0.0001} && longitude > ${outlet.longitude - 0.0001} && longitude < ${outlet.longitude + 0.0001}`
                        );
                        exists = true;
                    } catch (e) { /* not found */ }
                }
                
                if (exists) {
                    skipped++;
                    continue;
                }
                
                // Create outlet
                await pb.collection('outlets').create({
                    brand_id: brandId,
                    name: outlet.name,
                    address: outlet.address,
                    city: outlet.city,
                    region: outlet.region,
                    latitude: outlet.latitude,
                    longitude: outlet.longitude,
                    phone: outlet.phone,
                    website: outlet.website || '',
                    total_score: outlet.totalScore,
                    reviews_count: outlet.reviewsCount,
                    category_name: outlet.categoryName,
                    place_id: outlet.placeId,
                    postal_code: outlet.postalCode
                });
                imported++;
            } catch (e) {
                errors++;
                if (errors <= 3) {
                    console.log(`      ❌ Error: ${e.message}`);
                }
            }
        }
        
        // Progress update
        if (i + batchSize < outlets.length) {
            console.log(`      Progress: ${Math.min(i + batchSize, outlets.length)}/${outlets.length}`);
        }
    }
    
    return { imported, skipped, errors };
}

async function updateBrandOutletCount(brandId, count) {
    try {
        await pb.collection('brands').update(brandId, { total_outlets: count });
    } catch (e) {
        console.log(`   ⚠️ Could not update outlet count for brand`);
    }
}

async function main() {
    console.log('═'.repeat(60));
    console.log('🚀 Brand Outlets Import Tool');
    console.log('═'.repeat(60));
    
    // Step 1: Authenticate
    if (!await authenticate()) {
        console.log('\n❌ Failed to authenticate. Exiting.');
        return;
    }
    
    // Step 2: Check collections
    const collections = await checkCollections();
    
    // Step 3: Read all JSON files
    const allData = await readAllJsonFiles();
    
    if (Object.keys(allData).length === 0) {
        console.log('\n❌ No valid JSON files found. Exiting.');
        return;
    }
    
    // Step 4: Analyze and filter data
    console.log('\n📊 Analyzing and filtering data...');
    const processedData = {};
    let totalValid = 0;
    let totalInvalid = 0;
    
    for (const [brandKey, brandData] of Object.entries(allData)) {
        const { validOutlets, invalidReasons } = filterValidOutlets(
            brandKey, 
            brandData.rawData, 
            brandData.config
        );
        
        const invalidCount = Object.values(invalidReasons).reduce((a, b) => a + b, 0);
        totalValid += validOutlets.length;
        totalInvalid += invalidCount;
        
        processedData[brandKey] = {
            ...brandData,
            validOutlets,
            invalidReasons
        };
        
        console.log(`   ${brandData.config.name}:`);
        console.log(`      ✅ Valid: ${validOutlets.length}`);
        if (invalidCount > 0) {
            console.log(`      ❌ Invalid: ${invalidCount}`);
            if (invalidReasons.noLocation > 0) console.log(`         - No location: ${invalidReasons.noLocation}`);
            if (invalidReasons.wrongBrand > 0) console.log(`         - Wrong brand: ${invalidReasons.wrongBrand}`);
            if (invalidReasons.permanentlyClosed > 0) console.log(`         - Closed: ${invalidReasons.permanentlyClosed}`);
            if (invalidReasons.noTitle > 0) console.log(`         - No title: ${invalidReasons.noTitle}`);
            if (invalidReasons.noCity > 0) console.log(`         - No city: ${invalidReasons.noCity}`);
        }
    }
    
    console.log('\n' + '─'.repeat(40));
    console.log(`📈 Total: ${totalValid} valid, ${totalInvalid} filtered out`);
    console.log('─'.repeat(40));
    
    // Step 5: Ensure collections exist with proper schema
    if (!await ensureCollectionsExist(collections)) {
        console.log('\n❌ Failed to setup collections. Exiting.');
        return;
    }
    
    // Step 6: Import data
    console.log('\n📥 Importing data to PocketBase...');
    
    let grandTotalImported = 0;
    let grandTotalSkipped = 0;
    let grandTotalErrors = 0;
    
    for (const [brandKey, brandData] of Object.entries(processedData)) {
        if (brandData.validOutlets.length === 0) {
            console.log(`   ⏭️ Skipping ${brandData.config.name} (no valid outlets)`);
            continue;
        }
        
        console.log(`   📌 ${brandData.config.name}...`);
        
        // Get or create brand
        const brandId = await getOrCreateBrand(brandData.config.name, brandData.config);
        if (!brandId) {
            console.log(`      ❌ Failed to get/create brand, skipping`);
            continue;
        }
        
        // Import outlets
        const { imported, skipped, errors } = await importOutlets(
            brandId, 
            brandData.validOutlets,
            brandData.config.name
        );
        
        grandTotalImported += imported;
        grandTotalSkipped += skipped;
        grandTotalErrors += errors;
        
        console.log(`      ✅ Imported: ${imported}, Skipped: ${skipped}, Errors: ${errors}`);
        
        // Update brand outlet count
        const currentOutlets = await pb.collection('outlets').getList(1, 1, { filter: `brand_id="${brandId}"` });
        await updateBrandOutletCount(brandId, currentOutlets.totalItems);
    }
    
    // Final summary
    console.log('\n' + '═'.repeat(60));
    console.log('📊 IMPORT SUMMARY');
    console.log('═'.repeat(60));
    console.log(`   ✅ Total Imported: ${grandTotalImported}`);
    console.log(`   ⏭️ Total Skipped (duplicates): ${grandTotalSkipped}`);
    console.log(`   ❌ Total Errors: ${grandTotalErrors}`);
    console.log('═'.repeat(60));
}

// Run with error handling
main().catch(e => {
    console.error('\n💥 Fatal error:', e);
    process.exit(1);
});

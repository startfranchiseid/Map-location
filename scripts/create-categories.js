/**
 * Create Categories Collection & Migrate existing brand category data
 * 1. Creates a 'categories' collection
 * 2. Extracts unique categories from existing brands
 * 3. Populates the categories collection
 * 
 * Run with: node scripts/create-categories.js
 */

import PocketBase from 'pocketbase';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '..', '.env');

async function loadEnv() {
    try {
        const envContent = await fs.readFile(envPath, 'utf-8');
        const envConfig = dotenv.parse(envContent);
        for (const k in envConfig) {
            process.env[k] = envConfig[k];
        }
    } catch (e) {
        console.log('⚠️  Could not load .env file, relying on process.env');
    }
}

async function main() {
    await loadEnv();

    const PB_URL = process.env.PUBLIC_POCKETBASE_URL || 'https://pocketbase.startfranchise.id';
    const ADMIN_EMAIL = process.env.POCKETBASE_ADMIN_EMAIL || 'startfranchise.id@gmail.com';
    const ADMIN_PASSWORD = process.env.POCKETBASE_ADMIN_PASSWORD || 'Admin.startfranchise@123';

    console.log('🚀 Create Categories Collection');
    console.log(`📡 URL: ${PB_URL}`);
    console.log('='.repeat(50));

    const pb = new PocketBase(PB_URL);

    // 1. Authenticate
    console.log('\n🔐 Authenticating...');
    try {
        const authRes = await fetch(`${PB_URL}/api/admins/auth-with-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identity: ADMIN_EMAIL, password: ADMIN_PASSWORD })
        });

        if (!authRes.ok) {
            throw new Error(`Auth failed with status ${authRes.status}`);
        }

        const authData = await authRes.json();
        pb.authStore.save(authData.token, authData.admin);
        console.log('   ✅ Authenticated');
    } catch (e) {
        console.error('   ❌ Auth failed:', e.message);
        process.exit(1);
    }

    // 2. Check if categories collection already exists
    console.log('\n📦 Checking if "categories" collection exists...');
    try {
        const collections = await pb.collections.getFullList();
        const existing = collections.find(c => c.name === 'categories');
        if (existing) {
            console.log('   ⚠️  "categories" collection already exists. Skipping creation.');
            console.log('   Proceeding to data migration...');
        } else {
            // 3. Create Categories Collection
            console.log('\n📦 Creating "categories" collection...');
            const col = await pb.collections.create({
                name: 'categories',
                type: 'base',
                fields: [
                    { name: 'name', type: 'text', required: true },
                    { name: 'description', type: 'text', required: false },
                    { name: 'icon', type: 'text', required: false },
                    { name: 'color', type: 'text', required: false },
                ],
                listRule: '',
                viewRule: '',
                createRule: '',
                updateRule: '',
                deleteRule: '',
            });
            console.log(`   ✅ Created (ID: ${col.id})`);
        }
    } catch (e) {
        console.error('   ❌ Failed:', e.message);
        if (e.data) console.log(JSON.stringify(e.data, null, 2));
        process.exit(1);
    }

    // 4. Extract unique categories from existing brands
    console.log('\n📥 Extracting categories from existing brands...');
    try {
        const brandsRes = await pb.collection('brands').getFullList({
            fields: 'id,name,category',
            batch: 500
        });

        const uniqueCategories = new Set();
        for (const brand of brandsRes) {
            if (brand.category && brand.category.trim()) {
                uniqueCategories.add(brand.category.trim());
            }
        }

        console.log(`   Found ${uniqueCategories.size} unique categories: ${[...uniqueCategories].join(', ')}`);

        // 5. Check existing categories in collection
        const existingCats = await pb.collection('categories').getFullList({
            fields: 'name',
            batch: 200
        });
        const existingNames = new Set(existingCats.map(c => c.name));

        // 6. Insert missing categories
        const defaultColors = [
            '#8b5cf6', '#06b6d4', '#f59e0b', '#10b981', '#f43f5e',
            '#3b82f6', '#ec4899', '#14b8a6', '#f97316', '#a78bfa'
        ];
        const defaultIcons = {
            'F&B': 'fa-utensils',
            'F&B - Restoran': 'fa-utensils',
            'F&B - Minuman': 'fa-mug-hot',
            'F&B - Kopi': 'fa-coffee',
            'F&B - Es Krim': 'fa-ice-cream',
            'Education': 'fa-graduation-cap',
            'Pendidikan': 'fa-graduation-cap',
            'Laundry': 'fa-shirt',
            'Barbershop': 'fa-scissors',
            'Retail': 'fa-shopping-bag',
            'Jasa': 'fa-concierge-bell',
            'Kesehatan': 'fa-heartbeat',
            'Otomotif': 'fa-car',
            'Properti': 'fa-building',
        };

        let inserted = 0;
        let colorIdx = 0;
        for (const categoryName of uniqueCategories) {
            if (existingNames.has(categoryName)) {
                console.log(`   ⏭️  "${categoryName}" already exists, skipping`);
                continue;
            }

            const icon = defaultIcons[categoryName] || 'fa-tag';
            const color = defaultColors[colorIdx % defaultColors.length];
            colorIdx++;

            try {
                await pb.collection('categories').create({
                    name: categoryName,
                    description: '',
                    icon: icon,
                    color: color,
                });
                console.log(`   ✅ Created category: "${categoryName}" (icon: ${icon}, color: ${color})`);
                inserted++;
            } catch (e) {
                console.error(`   ❌ Failed to create "${categoryName}":`, e.message);
            }
        }

        const refreshedCats = await pb.collection('categories').getFullList({
            fields: 'id,name',
            batch: 200,
        });
        const categoryMap = new Map(refreshedCats.map((c) => [c.name, c.id]));
        const categoryIds = new Set(refreshedCats.map((c) => c.id));

        const brandsToUpdate = await pb.collection('brands').getFullList({
            fields: 'id,name,category',
            batch: 500,
        });

        let migrated = 0;
        for (const brand of brandsToUpdate) {
            const current = brand.category;
            if (!current) continue;
            if (categoryIds.has(current)) continue;
            const categoryId =
                categoryMap.get(current) ||
                categoryMap.get(current.trim());
            if (!categoryId) {
                try {
                    const created = await pb.collection('categories').create({
                        name: current.trim(),
                        icon: 'fa-tag',
                        color: '#8b5cf6',
                    });
                    categoryMap.set(created.name, created.id);
                    categoryIds.add(created.id);
                    await pb.collection('brands').update(brand.id, {
                        category: created.id,
                    });
                    migrated++;
                } catch (e) {
                    console.error(`   ❌ Failed to migrate ${brand.name}:`, e.message);
                }
                continue;
            }
            try {
                await pb.collection('brands').update(brand.id, {
                    category: categoryId,
                });
                migrated++;
            } catch (e) {
                console.error(`   ❌ Failed to migrate ${brand.name}:`, e.message);
            }
        }

        console.log('\n' + '='.repeat(50));
        console.log(`✅ Migration Complete!`);
        console.log(`   Total unique categories: ${uniqueCategories.size}`);
        console.log(`   Newly inserted: ${inserted}`);
        console.log(`   Already existed: ${uniqueCategories.size - inserted}`);
        console.log(`   Brands migrated to relation: ${migrated}`);
    } catch (e) {
        console.error('   ❌ Data migration failed:', e.message);
        if (e.data) console.log(JSON.stringify(e.data, null, 2));
        process.exit(1);
    }
}

main().catch(console.error);

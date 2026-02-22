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
        for (const k in envConfig) process.env[k] = envConfig[k];
    } catch { }
}

async function main() {
    await loadEnv();
    const PB_URL = process.env.PUBLIC_POCKETBASE_URL || 'https://pocketbase.startfranchise.id';
    const pb = new PocketBase(PB_URL);

    // Auth
    const authRes = await fetch(`${PB_URL}/api/admins/auth-with-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            identity: process.env.POCKETBASE_ADMIN_EMAIL,
            password: process.env.POCKETBASE_ADMIN_PASSWORD
        })
    });
    const authData = await authRes.json();
    pb.authStore.save(authData.token, authData.admin);
    console.log('✅ Authenticated');

    // Get existing categories in collection
    const existingCats = await pb.collection('categories').getFullList();
    const existingNames = new Set(existingCats.map(c => c.name));
    console.log(`Existing categories: ${existingNames.size}`);

    // Get brand categories
    const brands = await pb.collection('brands').getFullList({ fields: 'category', batch: 500 });
    const cats = new Set();
    brands.forEach(b => { if (b.category?.trim()) cats.add(b.category.trim()); });
    console.log(`Brand categories: ${[...cats].join(', ')}`);

    const icons = {
        'F&B': 'fa-utensils', 'F&B - Restoran': 'fa-utensils', 'F&B - Minuman': 'fa-mug-hot',
        'F&B - Kopi': 'fa-coffee', 'Education': 'fa-graduation-cap', 'Pendidikan': 'fa-graduation-cap',
        'Laundry': 'fa-shirt', 'Barbershop': 'fa-scissors', 'Retail': 'fa-shopping-bag',
        'Jasa': 'fa-concierge-bell', 'Kesehatan': 'fa-heartbeat', 'Otomotif': 'fa-car',
    };
    const colors = ['#8b5cf6', '#06b6d4', '#f59e0b', '#10b981', '#f43f5e', '#3b82f6', '#ec4899'];
    let ci = 0;

    for (const name of cats) {
        if (existingNames.has(name)) {
            console.log(`⏭️  "${name}" already exists`);
            continue;
        }
        try {
            await pb.collection('categories').create({
                name,
                description: '',
                icon: icons[name] || 'fa-tag',
                color: colors[ci % colors.length],
            });
            console.log(`✅ Created: "${name}"`);
            ci++;
        } catch (e) {
            console.error(`❌ Failed "${name}":`, e.message);
        }
    }

    // Show final result
    const allCats = await pb.collection('categories').getFullList({ sort: 'name' });
    console.log(`\n📋 Total categories: ${allCats.length}`);
    allCats.forEach(c => console.log(`  - ${c.name} (icon: ${c.icon}, color: ${c.color})`));
}

main().catch(console.error);

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
    try {
        const authRes = await fetch(`${PB_URL}/api/admins/auth-with-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                identity: process.env.POCKETBASE_ADMIN_EMAIL,
                password: process.env.POCKETBASE_ADMIN_PASSWORD
            })
        });
        if (!authRes.ok) {
            const body = await authRes.text();
            console.error('Auth failed:', authRes.status, body);
            process.exit(1);
        }
        const authData = await authRes.json();
        pb.authStore.save(authData.token, authData.admin);
        console.log('✅ Authenticated');
    } catch (e) {
        console.error('Auth error:', e);
        process.exit(1);
    }

    // Check existing
    const collections = await pb.collections.getFullList();
    const existing = collections.find(c => c.name === 'categories');
    if (existing) {
        console.log('Categories collection already exists:', existing.id);
        console.log('Fields:', JSON.stringify(existing.fields || existing.schema, null, 2));

        // Fetch existing records
        const records = await pb.collection('categories').getFullList();
        console.log(`\nExisting records (${records.length}):`);
        records.forEach(r => console.log(`  - ${r.name} (icon: ${r.icon}, color: ${r.color})`));
        return;
    }

    // Try creating with schema field (older PB format)
    console.log('\nTrying to create collection...');
    try {
        const col = await pb.collections.create({
            name: 'categories',
            type: 'base',
            schema: [
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
        console.log('✅ Created with schema:', col.id);
    } catch (e) {
        console.error('Failed with schema:', e.message);
        if (e.data) console.error('Details:', JSON.stringify(e.data, null, 2));

        // Try with 'fields' key
        try {
            const col2 = await pb.collections.create({
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
            console.log('✅ Created with fields:', col2.id);
        } catch (e2) {
            console.error('Failed with fields:', e2.message);
            if (e2.data) console.error('Details:', JSON.stringify(e2.data, null, 2));
        }
    }
}

main().catch(console.error);

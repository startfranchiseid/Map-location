/**
 * PostgreSQL Setup & Data Import Script
 * Creates tables and imports data from brand_locations.json
 * Run: node scripts/setup-postgres.js
 */

import pkg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pkg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database connection
const pool = new Pool({
    host: '76.13.22.182',
    port: 5432,
    database: 'postgres',
    user: 'postgres',
    password: 'Admin.startfranchise@123',
    ssl: {
        rejectUnauthorized: false
    }
});

// SQL for creating tables
const createTablesSQL = `
-- Drop existing tables if they exist (for fresh start)
DROP TABLE IF EXISTS outlets CASCADE;
DROP TABLE IF EXISTS brands CASCADE;

-- Create brands table
CREATE TABLE brands (
  id SERIAL PRIMARY KEY,
  brand_name VARCHAR(255) NOT NULL UNIQUE,
  category VARCHAR(255),
  website VARCHAR(500),
  total_outlets INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create outlets table
CREATE TABLE outlets (
  id SERIAL PRIMARY KEY,
  brand_id INTEGER NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  name VARCHAR(500) NOT NULL,
  address TEXT,
  city VARCHAR(255),
  region VARCHAR(255),
  latitude DECIMAL(10, 6),
  longitude DECIMAL(10, 6),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX idx_outlets_brand_id ON outlets(brand_id);
CREATE INDEX idx_outlets_city ON outlets(city);
CREATE INDEX idx_outlets_region ON outlets(region);
CREATE INDEX idx_outlets_coordinates ON outlets(latitude, longitude);
CREATE INDEX idx_brands_category ON brands(category);
`;

async function createTables(client) {
    console.log('📦 Creating database tables...');
    await client.query(createTablesSQL);
    console.log('✅ Tables created successfully!\n');
}

async function loadJsonData() {
    const jsonPath = path.join(__dirname, '..', 'static', 'data', 'brand_locations.json');
    const jsonData = fs.readFileSync(jsonPath, 'utf8');
    return JSON.parse(jsonData);
}

async function insertBrand(client, brand) {
    const result = await client.query(
        `INSERT INTO brands (brand_name, category, website, total_outlets) 
     VALUES ($1, $2, $3, $4) 
     RETURNING id`,
        [brand.brandName, brand.category, brand.website, brand.totalOutlets || 0]
    );
    return result.rows[0].id;
}

async function insertOutlet(client, brandId, outlet, region = null) {
    await client.query(
        `INSERT INTO outlets (brand_id, name, address, city, region, latitude, longitude) 
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
            brandId,
            outlet.name,
            outlet.address,
            outlet.city,
            region,
            outlet.coordinates?.lat || null,
            outlet.coordinates?.lng || null
        ]
    );
}

async function importData(client, data) {
    console.log('📊 Importing data from brand_locations.json...\n');

    let totalBrands = 0;
    let totalOutlets = 0;

    for (const brand of data.brands) {
        console.log(`  📍 Importing brand: ${brand.brandName}`);

        const brandId = await insertBrand(client, brand);
        totalBrands++;

        // Handle two types of outlet structures:
        // 1. Flat structure: brand.outlets (array of outlets)
        // 2. Nested structure: brand.regions (array of regions, each with outlets)

        if (brand.outlets && Array.isArray(brand.outlets)) {
            // Flat structure - outlets directly under brand
            for (const outlet of brand.outlets) {
                await insertOutlet(client, brandId, outlet, null);
                totalOutlets++;
            }
        }

        if (brand.regions && Array.isArray(brand.regions)) {
            // Nested structure - outlets grouped by region
            for (const regionData of brand.regions) {
                const region = regionData.region;
                for (const outlet of regionData.outlets) {
                    await insertOutlet(client, brandId, outlet, region);
                    totalOutlets++;
                }
            }
        }

        console.log(`     ✓ Imported ${brand.totalOutlets || 0} outlets\n`);
    }

    console.log('═══════════════════════════════════════════');
    console.log(`📊 Import Summary:`);
    console.log(`   Total Brands: ${totalBrands}`);
    console.log(`   Total Outlets: ${totalOutlets}`);
    console.log('═══════════════════════════════════════════\n');
}

async function verifyData(client) {
    console.log('🔍 Verifying imported data...\n');

    // Count brands
    const brandsResult = await client.query('SELECT COUNT(*) as count FROM brands');
    console.log(`   Brands in database: ${brandsResult.rows[0].count}`);

    // Count outlets
    const outletsResult = await client.query('SELECT COUNT(*) as count FROM outlets');
    console.log(`   Outlets in database: ${outletsResult.rows[0].count}`);

    // Show sample data
    console.log('\n📋 Sample Brands:');
    const sampleBrands = await client.query('SELECT id, brand_name, category, total_outlets FROM brands LIMIT 5');
    sampleBrands.rows.forEach(row => {
        console.log(`   [${row.id}] ${row.brand_name} (${row.category}) - ${row.total_outlets} outlets`);
    });

    console.log('\n📋 Sample Outlets:');
    const sampleOutlets = await client.query(`
    SELECT o.id, o.name, o.city, o.region, b.brand_name 
    FROM outlets o 
    JOIN brands b ON o.brand_id = b.id 
    LIMIT 5
  `);
    sampleOutlets.rows.forEach(row => {
        console.log(`   [${row.id}] ${row.name} - ${row.city} (${row.brand_name})`);
    });
}

async function main() {
    console.log('╔═══════════════════════════════════════════╗');
    console.log('║   PostgreSQL Setup & Data Import Script   ║');
    console.log('╚═══════════════════════════════════════════╝\n');

    const client = await pool.connect();

    try {
        // Load JSON data
        const data = await loadJsonData();
        console.log(`📄 Loaded JSON file (Last Updated: ${data.lastUpdated})\n`);

        // Create tables
        await createTables(client);

        // Import data
        await importData(client, data);

        // Verify data
        await verifyData(client);

        console.log('\n✅ Setup completed successfully!');

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error);
    } finally {
        client.release();
        await pool.end();
    }
}

main();

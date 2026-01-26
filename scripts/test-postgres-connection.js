/**
 * Test PostgreSQL Connection Script
 * Run: node scripts/test-postgres-connection.js
 */

import pkg from 'pg';
const { Pool } = pkg;

// Connection string from user
const connectionString = 'postgres://postgres:Admin.startfranchise%40123@76.13.22.182:5432/postgres?sslmode=require';

// Parse the connection without sslmode in querystring, handle SSL separately
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

async function testConnection() {
    console.log('🔄 Testing PostgreSQL connection...');
    console.log('📍 Host: 76.13.22.182:5432');
    console.log('📦 Database: postgres\n');

    try {
        const client = await pool.connect();
        console.log('✅ Successfully connected to PostgreSQL!');

        // Test query
        const result = await client.query('SELECT NOW() as current_time, version() as pg_version');
        console.log('\n📊 Connection Info:');
        console.log(`   Current Time: ${result.rows[0].current_time}`);
        console.log(`   PostgreSQL Version: ${result.rows[0].pg_version}\n`);

        // List existing tables
        const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);

        console.log('📋 Existing tables in public schema:');
        if (tablesResult.rows.length === 0) {
            console.log('   (No tables found)');
        } else {
            tablesResult.rows.forEach(row => {
                console.log(`   - ${row.table_name}`);
            });
        }

        client.release();
        console.log('\n✅ Connection test completed successfully!');

    } catch (error) {
        console.error('❌ Connection failed:', error.message);
        console.error('\nFull error:', error);
    } finally {
        await pool.end();
    }
}

testConnection();

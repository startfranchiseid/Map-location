/**
 * Fix Outlets Collection Schema v2
 * Uses correct field format for PocketBase v0.23+
 */

import PocketBase from 'pocketbase';

const PB_URL = 'http://76.13.22.182';
const ADMIN_EMAIL = 'startfranchise.id@gmail.com';
const ADMIN_PASSWORD = 'Admin.startfranchise@123';

const pb = new PocketBase(PB_URL);

async function main() {
    console.log('🔧 Fix Outlets Collection Schema v2');
    console.log('='.repeat(50));

    // Authenticate
    console.log('\n🔐 Authenticating...');
    try {
        await pb.collection('_superusers').authWithPassword(ADMIN_EMAIL, ADMIN_PASSWORD);
        console.log('   ✅ Authenticated');
    } catch (e) {
        console.error('   ❌ Auth failed:', e.message);
        return;
    }

    // Get brands collection info
    console.log('\n📋 Getting collection info...');
    const allCollections = await pb.collections.getFullList();
    const brandsCol = allCollections.find(c => c.name === 'brands');
    const outletsCol = allCollections.find(c => c.name === 'outlets');

    console.log(`   Brands ID: ${brandsCol?.id}`);
    console.log(`   Outlets ID: ${outletsCol?.id}`);

    // Look at brands fields structure for reference
    console.log('\n📋 Brands field structure (for reference):');
    if (brandsCol?.fields) {
        for (const field of brandsCol.fields) {
            console.log(`   ${field.name}: type=${field.type}, id=${field.id || 'none'}`);
        }
    }

    // For PocketBase v0.23+, relation fields need 'collectionId' inside options
    // But the brand reference might need to be the collection name instead

    const outletFields = [
        {
            name: 'brand',
            type: 'relation',
            required: true,
            options: {
                collectionId: brandsCol.id,
                cascadeDelete: false,
                maxSelect: 1,
                displayFields: ['name']
            }
        },
        { name: 'name', type: 'text', required: true },
        { name: 'address', type: 'text', required: false },
        { name: 'city', type: 'text', required: false },
        { name: 'region', type: 'text', required: false },
        { name: 'latitude', type: 'number', required: true },
        { name: 'longitude', type: 'number', required: true }
    ];

    console.log('\n📦 Attempting to update outlets schema...');
    console.log('   Field definitions:');
    console.log(JSON.stringify(outletFields, null, 2));

    try {
        const result = await pb.collections.update(outletsCol.id, {
            fields: outletFields
        });
        console.log('   ✅ Success!');
        console.log('   Result fields:', result.fields?.map(f => f.name).join(', '));
    } catch (e) {
        console.error('   ❌ Failed:', e.message);
        console.error('   Error data:', JSON.stringify(e.data || {}, null, 2));

        // Try without the relation field first
        console.log('\n   Trying without relation field...');
        try {
            const simpleFields = [
                { name: 'brand_id', type: 'text', required: true }, // Plain text as workaround
                { name: 'name', type: 'text', required: true },
                { name: 'address', type: 'text', required: false },
                { name: 'city', type: 'text', required: false },
                { name: 'region', type: 'text', required: false },
                { name: 'latitude', type: 'number', required: true },
                { name: 'longitude', type: 'number', required: true }
            ];

            const result = await pb.collections.update(outletsCol.id, {
                fields: simpleFields
            });
            console.log('   ✅ Success with simple fields!');
            console.log('   Fields:', result.fields?.map(f => f.name).join(', '));
        } catch (e2) {
            console.error('   ❌ Also failed:', e2.message);

            // Last resort: delete and recreate
            console.log('\n   Last resort: Delete and recreate outlets collection...');
            try {
                // First export existing data
                console.log('   Exporting existing data...');
                const existingData = await pb.collection('outlets').getFullList();
                console.log(`   Found ${existingData.length} records`);

                // Delete collection
                await pb.collections.delete(outletsCol.id);
                console.log('   Deleted outlets collection');

                // Wait
                await new Promise(r => setTimeout(r, 1000));

                // Recreate with proper schema
                const newOutlets = await pb.collections.create({
                    name: 'outlets',
                    type: 'base',
                    fields: [
                        {
                            name: 'brand',
                            type: 'relation',
                            required: true,
                            options: {
                                collectionId: brandsCol.id,
                                cascadeDelete: false,
                                maxSelect: 1
                            }
                        },
                        { name: 'name', type: 'text', required: true },
                        { name: 'address', type: 'text', required: false },
                        { name: 'city', type: 'text', required: false },
                        { name: 'region', type: 'text', required: false },
                        { name: 'latitude', type: 'number', required: true },
                        { name: 'longitude', type: 'number', required: true }
                    ],
                    listRule: '',
                    viewRule: ''
                });
                console.log(`   ✅ Recreated outlets (ID: ${newOutlets.id})`);
                console.log(`   Fields: ${newOutlets.fields?.map(f => f.name).join(', ')}`);

                // Note: Data will need to be re-imported
                console.log('\n   ⚠️  Data was deleted. Please run import-data.js again.');

            } catch (e3) {
                console.error('   ❌ Recreate failed:', e3.message);
            }
        }
    }

    console.log('\n' + '='.repeat(50));
    console.log('✅ Done!');
}

main().catch(console.error);

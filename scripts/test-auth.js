
import PocketBase from 'pocketbase';

const url = 'http://76.13.22.182:8080/_/';
const email = 'startfranchise.id@gmail.com';
const pass = 'Admin.startfranchise@123';

async function test() {
    console.log(`Testing auth to ${url}`);
    const pb = new PocketBase(url);

    try {
        console.log('Trying legacy admin auth...');
        await pb.admins.authWithPassword(email, pass);
        console.log('✅ Success!');
    } catch (e) {
        console.log(`❌ Failed: ${e.message} (${e.status})`);

        try {
            console.log('Trying superuser auth...');
            await pb.collection('_superusers').authWithPassword(email, pass);
            console.log('✅ Success!');
        } catch (e2) {
            console.log(`❌ Failed: ${e2.message} (${e2.status})`);
        }
    }
}

test();

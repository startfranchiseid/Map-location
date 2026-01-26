
import fetch from 'node-fetch';

const url = 'http://76.13.22.182:8080/api/admins/auth-with-password';
const email = 'startfranchise.id@gmail.com';
const pass = 'Admin.startfranchise@123';

async function test() {
    console.log(`POST ${url}`);
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identity: email, password: pass })
        });

        console.log(`Status: ${res.status} ${res.statusText}`);
        const data = await res.json();
        console.log('Response:', JSON.stringify(data, null, 2));
    } catch (e) {
        console.log('Error:', e.message);
    }
}

test();


import fetch from 'node-fetch';

const baseUrl = 'http://76.13.22.182:8080';
const paths = [
    '/api/collections/_superusers/auth-with-password',
    '/api/collections/superusers/auth-with-password',
    '/api/admins/auth-with-password',
    '/api/collections/users/auth-with-password',
    '/api/collections/_pb_users_auth_/auth-with-password'
];

async function probe() {
    console.log(`Probing auth endpoints on ${baseUrl}...`);
    for (const p of paths) {
        const url = baseUrl + p;
        try {
            // POST with empty body to trigger validation error (400) if endpoint exists
            // 404 means endpoint doesn't exist
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ identity: 'x', password: 'x' })
            });
            console.log(`[${res.status}] ${p}`);
        } catch (e) {
            console.log(`[ERR] ${p}: ${e.message}`);
        }
    }
}

probe();

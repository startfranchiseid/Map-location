
import fetch from 'node-fetch';

const baseUrl = 'http://76.13.22.182:8080';
const paths = [
    '/api/health',
    '/_/',
    '/api/collections',
    '/api/admins/auth-with-password',
    '/api/collections/_superusers/auth-with-password'
];

async function probe() {
    console.log(`Probing ${baseUrl}...`);
    for (const p of paths) {
        const url = baseUrl + p;
        try {
            const res = await fetch(url, { method: 'GET' }); // GET for most, POST needed for auth but we just check 404 vs 405/400
            console.log(`[${res.status}] ${p} (${res.headers.get('content-type')})`);
        } catch (e) {
            console.log(`[ERR] ${p}: ${e.message}`);
        }
    }
}

probe();

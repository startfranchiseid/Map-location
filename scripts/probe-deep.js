
import fetch from 'node-fetch';

const baseUrl = 'http://76.13.22.182:8080';
const paths = [
    '/api/health',
    '/pb/api/health',
    '/_/',
    '/api/realtime',
    '/api/collections',
    '/api/admins/auth-with-password',
    '/api/collections/_superusers/auth-with-password',
    '/api/collections/users/auth-with-password'
];

async function probe() {
    console.log(`Probing ${baseUrl}...`);
    for (const p of paths) {
        const url = baseUrl + p;
        try {
            // Use POST for auth endpoints to avoid 405 Method Not Allowed masking 404
            const method = p.includes('auth-with-password') ? 'POST' : 'GET';
            const headers = { 'Content-Type': 'application/json' };
            const body = method === 'POST' ? JSON.stringify({ identity: 'x', password: 'x' }) : undefined;

            const res = await fetch(url, { method, headers, body });
            console.log(`[${res.status}] ${p} (${res.headers.get('content-type') || 'unknown'})`);
        } catch (e) {
            console.log(`[ERR] ${p}: ${e.message}`);
        }
    }
}

probe();

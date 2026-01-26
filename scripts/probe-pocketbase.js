
import fetch from 'node-fetch';

const baseUrl = 'http://76.13.22.182';
const paths = [
    '/api/health',
    '/_/',
    '/pb/api/health',
    '/api/collections'
];

async function probe() {
    console.log(`Probing ${baseUrl}...`);
    for (const p of paths) {
        const url = baseUrl + p;
        try {
            const res = await fetch(url, { method: 'HEAD' });
            console.log(`[${res.status}] ${url}`);
            if (res.status !== 404) {
                console.log(`   > FOUND! Content-Type: ${res.headers.get('content-type')}`);
            }
        } catch (e) {
            console.log(`[ERR] ${url}: ${e.message}`);
        }
    }
}

probe();

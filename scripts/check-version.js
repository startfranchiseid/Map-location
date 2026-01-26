
import fetch from 'node-fetch';

async function check() {
    try {
        const res = await fetch('http://76.13.22.182/api/health');
        const data = await res.json();
        console.log('Health:', JSON.stringify(data, null, 2));
    } catch (e) {
        console.error(e);
    }
}
check();

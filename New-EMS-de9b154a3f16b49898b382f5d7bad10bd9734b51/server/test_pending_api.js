const fetch = require('node-fetch');

async function testApi() {
    try {
        const userEmail = 'maintenance1@almoayyedcg.com';
        const url = `http://localhost:5001/api/pricing/list/pending?userEmail=${encodeURIComponent(userEmail)}`;
        const res = await fetch(url);
        const data = await res.json();
        console.log('API Response:', JSON.stringify(data, null, 2));
    } catch (err) {
        console.error(err);
    }
}

testApi();

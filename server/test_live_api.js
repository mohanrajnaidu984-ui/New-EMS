
const axios = require('axios');

async function testApi() {
    try {
        const res = await axios.get('http://localhost:5000/api/pricing/11?userEmail=bms@almoayyedcg.com');
        console.log('API RESPONSE JOBS (Detailed):');
        console.log(JSON.stringify(res.data.jobs.map(j => ({
            name: j.itemName,
            logo: j.companyLogo,
            companyName: j.companyName,
            email: j.email
        })), null, 2));
    } catch (e) {
        console.error('API Error:', e.message);
    }
}
testApi();

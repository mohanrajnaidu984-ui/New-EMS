const axios = require('axios');
const fs = require('fs');

async function checkApi() {
    try {
        const response = await axios.get('http://localhost:5000/api/pricing/list/pending?userEmail=bms@almoayyedcg.com');
        fs.writeFileSync('api_response.json', JSON.stringify(response.data, null, 2));
        console.log('Done');
    } catch (err) {
        console.log(err.message);
    }
}

checkApi();

const axios = require('axios');

async function checkApi() {
    try {
        // Assume user email that would see this data. Previously used 'bms' or similar?
        // Use userEmail from a known user or guess. The previous logs showed userEmail parameter.
        // Let's standardise on a user we know.
        // Or just mock the query to return everything.

        // I'll try with empty email first, but it returns [].
        // I need a valid email.
        // Checking index.js logs from earlier might help, but I'll search for users first.

        const response = await axios.get('http://localhost:5000/api/pricing/list/pending?userEmail=bms@almoayyedcg.com'); // Guessing email based on "BMS" in screenshot
        console.log(JSON.stringify(response.data, null, 2));
    } catch (err) {
        console.log(err.message);
    }
}

checkApi();

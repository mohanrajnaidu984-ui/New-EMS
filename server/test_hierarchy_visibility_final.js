const fetch = require('node-fetch');
const fs = require('fs');

const API_BASE = 'http://localhost:5000';
const URL = `${API_BASE}/api/pricing/100`;

async function testUser(email, label) {
    let log = `\nTesting user: ${label} (${email})\n`;
    try {
        const res = await fetch(`${URL}?userEmail=${encodeURIComponent(email)}`);
        const data = await res.json();

        if (data.error) {
            log += `Error: ${data.error}\n`;
        } else if (data.jobs) {
            const visible = data.jobs.filter(j => j.visible).map(j => j.itemName);
            const editable = data.jobs.filter(j => j.editable).map(j => j.itemName);
            log += `Visible Jobs: ${JSON.stringify(visible)}\n`;
            log += `Editable Jobs: ${JSON.stringify(editable)}\n`;
        } else {
            log += 'No jobs returned\n';
        }

    } catch (err) {
        log += `Fetch error: ${err.message}\n`;
    }
    return log;
}

async function runTests() {
    let output = '';

    // 1. Civil User
    output += await testUser('saad@almoayyedcg.com', 'Civil (Lead)');

    // 2. Electrical User
    output += await testUser('mohan.naidu@almoayyedcg.com', 'Electrical (Sub)');

    // 3. BMS User
    output += await testUser('vigneshgovardhan5163@gmail.com', 'BMS (Sub-Sub)');

    fs.writeFileSync('server/hierarchy_test_results.txt', output);
    console.log('Results written to server/hierarchy_test_results.txt');
}

runTests();

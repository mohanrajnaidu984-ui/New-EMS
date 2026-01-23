const http = require('http');

const options = {
    hostname: 'localhost',
    port: 5000,
    path: '/api/quotes/enquiry-data/106',
    method: 'GET'
};

const req = http.request(options, res => {
    let data = '';
    res.on('data', chunk => { data += chunk; });
    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            console.log('--- Available Profiles for 106 ---');
            console.table(json.availableProfiles);
            console.log('--- Lead Job Prefix ---');
            console.log(json.leadJobPrefix);
        } catch (e) { console.log(data); }
    });
});

req.on('error', error => {
    console.error(error);
});

req.end();

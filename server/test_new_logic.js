const http = require('http');

http.get('http://localhost:5000/api/quotes/enquiry-data/102', (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
        const json = JSON.parse(data);
        console.log('Lead Job Prefix:', json.leadJobPrefix);
        console.log('Company Details:', JSON.stringify(json.companyDetails, null, 2));
    });
});

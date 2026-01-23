const http = require('http');

const data = JSON.stringify({
    email: 'vigneshgovardhan5163@gmail.com'
});

const options = {
    hostname: 'localhost',
    port: 5000,
    path: '/api/auth/check-user',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
    }
};

const req = http.request(options, (res) => {
    console.log(`STATUS: ${res.statusCode}`);
    res.on('data', (d) => {
        process.stdout.write(d);
    });
});

req.on('error', (e) => {
    console.error(`problem with request: ${e.message}`);
});

req.write(data);
req.end();

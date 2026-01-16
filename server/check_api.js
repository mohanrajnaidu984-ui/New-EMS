
const http = require('http');

const url = 'http://localhost:5000/api/probability/list?mode=Pending';

http.get(url, (res) => {
    let data = '';
    res.on('data', (chunk) => {
        data += chunk;
    });
    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            console.log(`Total Records: ${json.length}`);
            if (Array.isArray(json)) {
                const e97 = json.find(i => i.RequestNo === '97' || i.RequestNo == 97);
                if (e97) console.log('Enquiry 97 FOUND:', e97);
                else console.log('Enquiry 97 NOT FOUND');

                // Log first 3 items to check structure
                console.log('Sample Data:', json.slice(0, 3));
            } else {
                console.log('Response is not an array:', json);
            }
        } catch (e) {
            console.error('Error parsing JSON:', e.message);
            console.log('Raw Data:', data);
        }
    });
}).on('error', (err) => {
    console.error('Error:', err.message);
});

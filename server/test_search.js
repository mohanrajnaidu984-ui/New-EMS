const fetch = require('node-fetch');

const API_URL = 'http://localhost:5000/api/dashboard/enquiries';

const run = async () => {
    try {
        const params = new URLSearchParams({
            search: 'Genpact'
        });

        console.log('Fetching with params:', params.toString());
        const res = await fetch(`${API_URL}?${params}`);
        const data = await res.json();

        console.log(`Count: ${data.length}`);
        if (data.length > 0) {
            console.log('First 3 rows:');
            data.slice(0, 3).forEach(d => {
                console.log(`Ref: ${d.RequestNo}, Cust: ${d.CustomerName}, Date: ${d.EnquiryDate}`);
            });
        } else {
            console.log('No data found for search "Genpact"');
        }

    } catch (e) {
        console.error(e);
    }
};

run();

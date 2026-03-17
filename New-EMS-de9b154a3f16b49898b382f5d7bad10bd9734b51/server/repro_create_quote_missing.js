const axios = require('axios');

async function testCreateQuote() {
    try {
        const payload = {
            requestNo: '22',
            divisionCode: 'Civil Project',
            departmentCode: 'AAC',
            preparedBy: 'Arun Venkatesh',
            // preparedByEmail missing
            toName: 'HVAC Project',
            toAddress: 'Test',
            subject: 'Test Subject',
            // validityDays missing
            customerReference: 'ref',
            totalAmount: 1.0
        };

        console.log('Sending payload with missing fields...');
        const res = await axios.post('http://localhost:5001/api/quotes', payload);
        console.log('Success:', res.data);
    } catch (err) {
        console.error('FAILED!');
        if (err.response) {
            console.error('Status:', err.response.status);
            console.error('Data:', JSON.stringify(err.response.data, null, 2));
        } else {
            console.error('Error:', err.message);
        }
    }
}

testCreateQuote();

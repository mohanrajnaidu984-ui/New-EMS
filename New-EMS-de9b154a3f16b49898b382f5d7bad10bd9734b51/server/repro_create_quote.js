const axios = require('axios');

async function testCreateQuote() {
    try {
        const payload = {
            requestNo: '22',
            divisionCode: 'Civil Project',
            departmentCode: 'AAC',
            preparedBy: 'Arun Venkatesh',
            preparedByEmail: 'arun@example.com',
            toName: 'HVAC Project',
            toAddress: 'CR No.: 76980-1\nPO Box 32232, Building No. 550, Road No. 84,\nBlock No. 407, Tashan, Manama, Kingdom of Bahrain',
            toPhone: '+973 17404949',
            toEmail: 'ac@almoayyedcg.com',
            toFax: '+973 17400396',
            subject: 'Proposal for Test Project 2',
            quoteDate: '2026-03-12',
            validityDays: 30,
            customerReference: 'jhe6775',
            signatory: '',
            signatoryDesignation: '',
            scopeOfWork: 'Test scope',
            totalAmount: 1.0,
            customClauses: [],
            clauseOrder: []
        };

        console.log('Sending payload...');
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

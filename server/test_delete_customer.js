const fetch = require('node-fetch');

async function testDelete() {
    try {
        const response = await fetch('http://localhost:5000/api/pricing/customer', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                requestNo: '100',
                customerName: 'Ranihamsam'
            })
        });

        console.log('Status:', response.status);
        const text = await response.text();
        console.log('Body:', text);

    } catch (err) {
        console.error('Error:', err);
    }
}

testDelete();

const fetch = require('node-fetch');

async function testPricing() {
    try {
        const response = await fetch('http://localhost:5000/api/pricing/100?userEmail=test@example.com');
        const data = await response.json();
        console.log('Extra Customers:', data.extraCustomers);
    } catch (err) {
        console.error('Error:', err);
    }
}
testPricing();

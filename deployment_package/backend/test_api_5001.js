async function testApi() {
    try {
        console.log('Fetching from http://localhost:5001/api/dashboard/summary ...');
        const res = await fetch('http://localhost:5001/api/dashboard/summary');
        console.log('Status:', res.status);
        if (res.ok) {
            const data = await res.json();
            console.log('Data:', JSON.stringify(data));
        } else {
            console.log('Text:', await res.text());
        }
    } catch (err) {
        console.error('Fetch Error:', err.message);
    }
}
testApi();

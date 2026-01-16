const fetch = require('node-fetch');

async function testSearch() {
    try {
        const term = 'Almoayyed';
        console.log(`Searching API for: ${term}`);
        const res = await fetch(`http://localhost:5000/api/pricing/search-customers?q=${encodeURIComponent(term)}`);
        const data = await res.json();
        console.log('Results:', data);

        const term2 = 'Almoayyed Air COnditioning';
        console.log(`Searching API for: ${term2}`);
        const res2 = await fetch(`http://localhost:5000/api/pricing/search-customers?q=${encodeURIComponent(term2)}`);
        const data2 = await res2.json();
        console.log('Results 2:', data2);

    } catch (err) {
        console.error('Error:', err);
    }
}
testSearch();

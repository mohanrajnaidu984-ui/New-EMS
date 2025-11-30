async function verify() {
    try {
        const res = await fetch('http://localhost:5000/api/generate-request-no');
        const data = await res.json();
        console.log('Generated RequestNo:', data.requestNo);
    } catch (err) {
        console.error('Error:', err);
    }
}

verify();

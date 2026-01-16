const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const run = async () => {
    try {
        // Create a dummy file
        fs.writeFileSync('test_logo.png', 'fake image content');

        const form = new FormData();
        form.append('logo', fs.createReadStream('test_logo.png'));

        const response = await axios.post('http://localhost:5000/api/upload/logo', form, {
            headers: {
                ...form.getHeaders()
            },
            validateStatus: () => true // Resolve promise for all status codes
        });

        console.log('Status:', response.status);
        console.log('Data:', response.data);

        fs.unlinkSync('test_logo.png');
    } catch (err) {
        console.error('Error:', err.message);
        if (err.response) {
            console.log('Response data:', err.response.data);
        }
    }
};

run();

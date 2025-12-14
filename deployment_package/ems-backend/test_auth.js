const axios = require('axios');

const API_URL = 'http://localhost:5000/api/auth';

async function testAuth() {
    try {
        console.log("1. Testing Signup...");
        try {
            const signupRes = await axios.post(`${API_URL}/signup`, {
                username: 'Test User',
                email: 'test@example.com',
                password: 'password123'
            });
            console.log("Signup Success:", signupRes.data);
        } catch (err) {
            if (err.response && err.response.data && err.response.data.message === 'Email already registered') {
                console.log("User already exists, proceeding to login...");
            } else {
                throw err;
            }
        }

        console.log("\n2. Testing Login...");
        const loginRes = await axios.post(`${API_URL}/login`, {
            email: 'test@example.com',
            password: 'password123'
        });
        console.log("Login Success:", loginRes.data);

    } catch (err) {
        console.error("Auth Test Failed:");
        if (err.response) {
            console.error(`Status: ${err.response.status}`);
            console.error(`Data:`, err.response.data);
        } else {
            console.error(err.message);
        }
    }
}

testAuth();

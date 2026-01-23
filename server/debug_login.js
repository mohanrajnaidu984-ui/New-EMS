const sql = require('mssql');
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    options: {
        encrypt: false,
        trustServerCertificate: true,
        connectionTimeout: 30000,
        requestTimeout: 30000,
        enableArithAbort: true
    }
};

async function debugLogin() {
    try {
        console.log('Connecting to database...');
        await sql.connect(config);

        const email = 'vigneshgovardhan5163@gmail.com';
        const passwordToTest = 'password123';

        console.log(`Searching for user: ${email}`);
        const result = await sql.query`SELECT * FROM Master_ConcernedSE WHERE EmailId = ${email}`;
        const user = result.recordset[0];

        if (!user) {
            console.log('❌ User not found in database!');
            process.exit(1);
        }

        console.log('User found:', {
            ID: user.ID,
            FullName: user.FullName,
            EmailId: user.EmailId,
            StoredHash: user.LoginPassword
        });

        console.log(`Testing password: "${passwordToTest}"`);
        const isMatch = await bcrypt.compare(passwordToTest, user.LoginPassword);

        if (isMatch) {
            console.log('✅ Password MATCHES!');
        } else {
            console.log('❌ Password DOES NOT MATCH.');

            // Generate a new hash to see what it should look like
            const newHash = await bcrypt.hash(passwordToTest, 10);
            console.log('Generated new hash for comparison:', newHash);
        }

        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

debugLogin();

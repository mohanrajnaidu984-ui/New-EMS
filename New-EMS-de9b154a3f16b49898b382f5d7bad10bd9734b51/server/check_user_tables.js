const sql = require('mssql');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    options: {
        encrypt: false,
        trustServerCertificate: true,
    },
    connectionTimeout: 5000,
    requestTimeout: 5000
};

async function check() {
    try {
        console.log('Connecting to', config.server);
        await sql.connect(config);
        console.log('Connected.');

        const email = 'bmselveng1@almoayyedcg.com';

        console.log('Checking Master_ConcernedSE...');
        const res1 = await sql.query`SELECT * FROM Master_ConcernedSE WHERE EmailId = ${email}`;
        console.log('Results in Master_ConcernedSE:', res1.recordset.length);

        console.log('Checking Users table...');
        try {
            const res2 = await sql.query`SELECT * FROM Users WHERE MailId = ${email}`;
            console.log('Results in Users:', res2.recordset.length);
        } catch (e) {
            console.log('Users table might not exist or field name different.');
        }

        console.log('Searching for ANY user with bmselveng1 in Master_ConcernedSE...');
        const res3 = await sql.query`SELECT FullName, EmailId FROM Master_ConcernedSE WHERE EmailId LIKE '%bmselveng1%'`;
        console.log('Fuzzy results:', res3.recordset);

    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        await sql.close();
        process.exit();
    }
}

check();

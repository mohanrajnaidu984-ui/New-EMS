const sql = require('mssql');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

async function testV8() {
    const config = {
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        server: process.env.DB_SERVER,
        database: process.env.DB_DATABASE,
        driver: 'msnodesqlv8',
        options: {
            encrypt: false,
            trustServerCertificate: true,
            enableArithAbort: true
        }
    };

    try {
        console.log('Testing msnodesqlv8 driver with:', { ...config, password: '***' });
        await sql.connect(config);
        console.log('✅ Connection successful with V8 driver!');
    } catch (err) {
        console.error('❌ Connection FAILED with V8 driver!');
        console.error(err.message);
    } finally {
        await sql.close();
    }
}

testV8();

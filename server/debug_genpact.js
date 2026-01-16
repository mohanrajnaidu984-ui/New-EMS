const sql = require('mssql');
require('dotenv').config();

(async () => {
    try {
        // Construct config manually to match dbConfig.js
        const config = {
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            server: process.env.DB_SERVER,
            database: process.env.DB_DATABASE,
            options: {
                encrypt: false,
                trustServerCertificate: true,
                enableArithAbort: true
            }
        };

        console.log('Connecting to DB with config:', { ...config, password: '***' });
        const pool = await sql.connect(config);
        console.log('Connected. Executing query...');

        // Try treating RequestNo as string first
        const res = await pool.request().query("SELECT * FROM EnquiryMaster WHERE RequestNo = '97'");
        console.log('Query executed.');

        if (!res.recordset) {
            console.log('res.recordset is undefined. res keys:', Object.keys(res));
            return;
        }

        if (res.recordset.length > 0) {
            console.log('--- EnquiryMaster Columns ---');
            console.log(Object.keys(res.recordset[0]).join(', '));
        }

        console.log('--- ALL TABLES ---');
        const tables = await pool.request().query("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE'");
        console.log(tables.recordset.map(t => t.TABLE_NAME).join(', '));

        // Pure JSON output for schema and data
        const schema = await pool.request().query("SELECT TOP 1 * FROM EnquiryCustomer");
        const schemaCols = schema.recordset.length > 0 ? Object.keys(schema.recordset[0]) : [];

        let data = [];
        // Try finding the key
        const likelyKey = schemaCols.find(c => c.toLowerCase().includes('id') || c.toLowerCase().includes('no'));
        if (likelyKey) {
            const res = await pool.request().query(`SELECT * FROM EnquiryCustomer WHERE ${likelyKey} = 97`);
            data = res.recordset;
        }

        console.log('JSON_START');
        console.log(JSON.stringify({ schema: schemaCols, likelyKey, data }, null, 2));
        console.log('JSON_END');



        if (res.recordset.length === 0) {
            console.log('No record found for RequestNo 97');
        } else {
            const row = res.recordset[0];
            console.log('--- Row Data ---');
            // Log ALL fields to find any trace of Genpact
            for (const [key, value] of Object.entries(row)) {
                if (value !== null && value !== undefined) {
                    // Check for Genpact match specifically
                    if (value.toString().toLowerCase().includes('genpact')) {
                        console.log(`!!! MATCH FOUND !!! ${key}: ${value}`);
                    }
                    console.log(`${key}: ${value}`);
                }
            }
        }

    } catch (err) {
        console.error('Script Error:', err);
    } finally {
        setTimeout(() => process.exit(), 1000);
    }
})();

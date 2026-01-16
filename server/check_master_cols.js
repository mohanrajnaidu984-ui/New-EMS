require('dotenv').config({ path: './.env' });
const sql = require('mssql');
const fs = require('fs');

async function checkColumns() {
    try {
        const config = {
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            server: process.env.DB_SERVER,
            database: process.env.DB_DATABASE,
            options: {
                encrypt: false,
                trustServerCertificate: true
            }
        };

        const pool = await sql.connect(config);
        console.log('Connected to DB');

        const result = await pool.request().query('SELECT TOP 1 * FROM Master_CustomerName');
        let output = '';

        if (result.recordset.length > 0) {
            output += 'Columns: ' + JSON.stringify(Object.keys(result.recordset[0])) + '\n';
            output += 'Sample: ' + JSON.stringify(result.recordset[0], null, 2) + '\n';
        } else {
            const schema = await pool.request().query(`
                SELECT COLUMN_NAME 
                FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_NAME = 'Master_CustomerName'
            `);
            output += 'Schema Columns: ' + JSON.stringify(schema.recordset.map(r => r.COLUMN_NAME)) + '\n';
        }

        fs.writeFileSync('cols_output.txt', output);
        console.log('Written to cols_output.txt');

        pool.close();
    } catch (err) {
        console.error('Error:', err);
    }
}

checkColumns();

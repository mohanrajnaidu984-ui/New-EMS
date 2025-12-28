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
        connectionTimeout: 30000,
        requestTimeout: 30000,
        enableArithAbort: true
    }
};

async function checkSchema() {
    try {
        console.log('Connecting to database...');
        const pool = await sql.connect(config);
        console.log('Connected!');

        // Check Master_CustomerName columns
        console.log('\n=== Master_CustomerName Columns ===');
        const customerCols = await pool.request().query(`
            SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = 'Master_CustomerName'
            ORDER BY ORDINAL_POSITION
        `);
        console.table(customerCols.recordset);

        // Check Master_ClientName columns
        console.log('\n=== Master_ClientName Columns ===');
        const clientCols = await pool.request().query(`
            SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = 'Master_ClientName'
            ORDER BY ORDINAL_POSITION
        `);
        console.table(clientCols.recordset);

        // Check Master_ConsultantName columns
        console.log('\n=== Master_ConsultantName Columns ===');
        const consultantCols = await pool.request().query(`
            SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = 'Master_ConsultantName'
            ORDER BY ORDINAL_POSITION
        `);
        console.table(consultantCols.recordset);

        // Try to select a sample record
        console.log('\n=== Sample Customer Record ===');
        const sample = await pool.request().query(`SELECT TOP 1 * FROM Master_CustomerName`);
        if (sample.recordset.length > 0) {
            console.log('Columns in result:', Object.keys(sample.recordset[0]));
            console.log('Sample data:', sample.recordset[0]);
        } else {
            console.log('No records found');
        }

        await pool.close();
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

checkSchema();

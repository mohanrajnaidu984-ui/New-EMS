require('dotenv').config({ path: 'server/.env' });
const sql = require('mssql');

const dbConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    options: {
        encrypt: false, // For local dev
        trustServerCertificate: true
    }
};

async function testDB() {
    try {
        const pool = await sql.connect(dbConfig);
        const requestNo = '97';
        console.log(`Fetching Pricing Options for RequestNo: ${requestNo}`);

        const resultOptions = await pool.request()
            .input('RequestNo', sql.VarChar, requestNo)
            .query('SELECT ID, OptionName, SortOrder, ItemName FROM EnquiryPricingOptions WHERE RequestNo = @RequestNo ORDER BY SortOrder, ID');

        console.log('OPTIONS:');
        console.log(JSON.stringify(resultOptions.recordset, null, 2));

        console.log('VALUES:');
        const resultValues = await pool.request()
            .input('RequestNo', sql.VarChar, requestNo)
            .query('SELECT OptionID, EnquiryForItem, Price FROM EnquiryPricingValues WHERE RequestNo = @RequestNo');

        console.log(JSON.stringify(resultValues.recordset, null, 2));

        process.exit(0);

    } catch (err) {
        console.error('Database connection failed:', err);
        process.exit(1);
    }
}

testDB();

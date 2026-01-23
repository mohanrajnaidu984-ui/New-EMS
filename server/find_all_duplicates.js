const sql = require('mssql');
require('dotenv').config();

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    options: {
        encrypt: true,
        trustServerCertificate: true
    }
};

async function run() {
    try {
        await sql.connect(config);

        console.log('Finding all duplicate Base Price entries across all enquiries...');
        const result = await sql.query`
            SELECT RequestNo, OptionName, ItemName, CustomerName, COUNT(*) as Count
            FROM EnquiryPricingOptions 
            WHERE OptionName = 'Base Price'
            GROUP BY RequestNo, OptionName, ItemName, CustomerName
            HAVING COUNT(*) > 1
        `;

        if (result.recordset.length === 0) {
            console.log('No duplicates found.');
        } else {
            console.table(result.recordset);
        }

    } catch (err) {
        console.error(err);
    } finally {
        await sql.close();
    }
}

run();

const sql = require('mssql');
const fs = require('fs');
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
        const requestNo = '103';

        const options = await sql.query`
            SELECT ID, OptionName, CustomerName, ItemName
            FROM EnquiryPricingOptions 
            WHERE RequestNo = ${requestNo} AND OptionName = 'Base Price'
        `;
        fs.writeFileSync('check_103_pricing_full.json', JSON.stringify(options.recordset, null, 2));
        console.log('Dumped to check_103_pricing_full.json');

    } catch (err) {
        console.error(err);
    } finally {
        await sql.close();
    }
}

run();

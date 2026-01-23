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
        const requestNo = '103';

        console.log(`Checking EnquiryPricingOptions for Request ${requestNo}...`);
        const options = await sql.query`
            SELECT ID, OptionName, CustomerName, EnquiryForID 
            FROM EnquiryPricingOptions 
            WHERE RequestNo = ${requestNo}
        `;
        console.table(options.recordset);

        console.log(`Checking items for Request ${requestNo}...`);
        const items = await sql.query`
            SELECT ID, ItemName 
            FROM EnquiryFor 
            WHERE RequestNo = ${requestNo}
        `;
        console.table(items.recordset);

    } catch (err) {
        console.error(err);
    } finally {
        await sql.close();
    }
}

run();

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

        console.log('Checking values for Base Price options...');
        const values = await sql.query`
            SELECT V.OptionID, V.EnquiryForItem, V.Price, O.OptionName, O.CustomerName
            FROM EnquiryPricingValues V
            JOIN EnquiryPricingOptions O ON V.OptionID = O.ID
            WHERE V.RequestNo = ${requestNo} AND O.OptionName = 'Base Price'
        `;
        console.log(JSON.stringify(values.recordset, null, 2));

    } catch (err) {
        console.error(err);
    } finally {
        await sql.close();
    }
}

run();

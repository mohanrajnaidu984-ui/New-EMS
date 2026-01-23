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

        const options = await sql.query`
            SELECT ID, OptionName, CustomerName
            FROM EnquiryPricingOptions 
            WHERE RequestNo = ${requestNo}
        `;
        console.log(JSON.stringify(options.recordset, null, 2));

    } catch (err) {
        console.error(err);
    } finally {
        await sql.close();
    }
}

run();

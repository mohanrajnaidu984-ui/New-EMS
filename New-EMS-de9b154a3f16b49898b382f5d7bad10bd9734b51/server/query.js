const sql = require('mssql');
require('dotenv').config();

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

async function checkQuotes() {
    try {
        await sql.connect(config);
        console.log("Connected to DB.");

        let result = await sql.query("SELECT ID, ParentID, ItemName, LeadJobCode FROM EnquiryFor WHERE RequestNo = '9'");
        console.log("EnquiryFor items:", result.recordset);

        let options = await sql.query("SELECT ID, OptionName, ItemName, CustomerName FROM EnquiryPricingOptions WHERE RequestNo = '9'");
        console.log("EnquiryPricingOptions:", options.recordset);

        let values = await sql.query("SELECT ID, OptionID, EnquiryForItem, EnquiryForID, Price FROM EnquiryPricingValues WHERE RequestNo = '9'");
        console.log("EnquiryPricingValues:", values.recordset);

    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

checkQuotes();

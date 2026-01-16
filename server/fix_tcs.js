const sql = require('mssql');
const { dbConfig } = require('./dbConfig');

async function fixTCS() {
    try {
        await sql.connect(dbConfig);
        console.log('Connected');

        // Check if TCS exists
        const check = await sql.query`SELECT * FROM EnquiryCustomer WHERE RequestNo = '100' AND CustomerName = 'TCS'`;
        if (check.recordset.length === 0) {
            console.log('TCS missing in EnquiryCustomer. Inserting...');
            await sql.query`INSERT INTO EnquiryCustomer (RequestNo, CustomerName) VALUES ('100', 'TCS')`;
            console.log('Inserted TCS.');
        } else {
            console.log('TCS already exists in EnquiryCustomer.');
        }

        // Check active pricing
        const pricing = await sql.query`SELECT DISTINCT CustomerName FROM EnquiryPricingOptions WHERE RequestNo = '100'`;
        console.log('Active Pricing Customers:', pricing.recordset);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sql.close();
    }
}
fixTCS();

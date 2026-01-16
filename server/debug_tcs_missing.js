const sql = require('mssql');
const { dbConfig } = require('./dbConfig');

async function checkEnquiry100() {
    try {
        await sql.connect(dbConfig);

        console.log('\n--- EnquiryMaster ---');
        const eq = await sql.query`SELECT RequestNo, CustomerName FROM EnquiryMaster WHERE RequestNo = '100'`;
        console.log(JSON.stringify(eq.recordset, null, 2));

        console.log('\n--- EnquiryCustomer (Extra Customers) ---');
        const ec = await sql.query`SELECT * FROM EnquiryCustomer WHERE RequestNo = '100'`;
        console.log(JSON.stringify(ec.recordset, null, 2));

        console.log('\n--- EnquiryPricingOptions (Distinct Customers) ---');
        const epo = await sql.query`SELECT DISTINCT CustomerName FROM EnquiryPricingOptions WHERE RequestNo = '100'`;
        console.log(JSON.stringify(epo.recordset, null, 2));

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sql.close();
    }
}

checkEnquiry100();

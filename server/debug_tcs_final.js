const sql = require('mssql');
const { dbConfig } = require('./dbConfig');

async function debugTCS() {
    try {
        await sql.connect(dbConfig);

        console.log('--- EnquiryMaster (100) ---');
        const eq = await sql.query`SELECT RequestNo, CustomerName FROM EnquiryMaster WHERE RequestNo = '100'`;
        console.dir(eq.recordset);

        console.log('--- EnquiryCustomer (100) ---');
        const ec = await sql.query`SELECT * FROM EnquiryCustomer WHERE RequestNo = '100'`;
        console.dir(ec.recordset);

        console.log('--- Pricing Options (100) - Distinct CustomerName ---');
        const ops = await sql.query`SELECT DISTINCT CustomerName FROM EnquiryPricingOptions WHERE RequestNo = '100'`;
        console.dir(ops.recordset);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sql.close();
    }
}
debugTCS();

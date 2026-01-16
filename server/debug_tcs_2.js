const sql = require('mssql');
const { dbConfig } = require('./dbConfig');

async function checkEnquiry100() {
    try {
        await sql.connect(dbConfig);

        console.log('--- EnquiryMaster ---');
        const eq = await sql.query`SELECT RequestNo, CustomerName FROM EnquiryMaster WHERE RequestNo = '100'`;
        console.dir(eq.recordset);

        console.log('--- EnquiryCustomer (Extra Customers) ---');
        const ec = await sql.query`SELECT * FROM EnquiryCustomer WHERE RequestNo = '100'`;
        console.dir(ec.recordset);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sql.close();
    }
}

checkEnquiry100();

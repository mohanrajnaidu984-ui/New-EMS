const sql = require('mssql');
const { dbConfig } = require('./dbConfig');

async function debugTCS() {
    try {
        await sql.connect(dbConfig);
        console.log('Connected');

        const result = await sql.query`SELECT * FROM EnquiryCustomer WHERE RequestNo LIKE '%100%'`;
        console.log('EnquiryCustomer for 100:', result.recordset);

        // Check if there is data in EnquiryMaster
        const master = await sql.query`SELECT RequestNo FROM EnquiryMaster WHERE RequestNo LIKE '%100%'`;
        console.log('EnquiryMaster for 100:', master.recordset);

        // Try inserting TCS forcefully
        console.log('Inserting TCS again...');
        await sql.query`INSERT INTO EnquiryCustomer (RequestNo, CustomerName) VALUES ('100', 'TCS')`;
        console.log('Inserted.');

        const result2 = await sql.query`SELECT * FROM EnquiryCustomer WHERE RequestNo = '100'`;
        console.log('EnquiryCustomer for 100 (After):', result2.recordset);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sql.close();
    }
}
debugTCS();

const sql = require('mssql');
const { dbConfig } = require('./dbConfig');

async function debugTCS() {
    try {
        await sql.connect(dbConfig);
        const result = await sql.query`SELECT * FROM EnquiryCustomer WHERE RequestNo = '100'`;
        console.log('Linked Customers:', result.recordset);
        await sql.close();
    } catch (err) {
        console.error(err);
    }
}
debugTCS();

const sql = require('mssql');
const { dbConfig } = require('./dbConfig');
const fs = require('fs');

async function debugTCS() {
    try {
        await sql.connect(dbConfig);
        let output = '';

        output += '--- EnquiryMaster (100) ---\n';
        const eq = await sql.query`SELECT RequestNo, CustomerName FROM EnquiryMaster WHERE RequestNo = '100'`;
        output += JSON.stringify(eq.recordset, null, 2) + '\n';

        output += '--- EnquiryCustomer (100) ---\n';
        const ec = await sql.query`SELECT * FROM EnquiryCustomer WHERE RequestNo = '100'`;
        output += JSON.stringify(ec.recordset, null, 2) + '\n';

        fs.writeFileSync('tcs_debug_out.txt', output);
        console.log('Done');

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sql.close();
    }
}
debugTCS();

const sql = require('mssql');
require('dotenv').config();

(async () => {
    try {
        await sql.connect(process.env.DB_CONNECTION_STRING);
        const res = await sql.query('SELECT RequestNo, CustomerName, ClientName, ConsultantName FROM EnquiryMaster WHERE RequestNo = 97');
        console.log('Result:', res.recordset);
    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit();
    }
})();

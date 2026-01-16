const sql = require('mssql');
require('dotenv').config();

async function check() {
    try {
        await sql.connect(process.env.DB_CONNECTION_STRING);
        // Check finding ANY quotes
        const count = await sql.query('SELECT COUNT(*) as c FROM EnquiryQuotes');
        console.log('Total quotes:', count.recordset[0].c);

        // Find some request numbers that HAVE quotes
        const hasQuotes = await sql.query('SELECT TOP 5 RequestNo, count(*) as c FROM EnquiryQuotes GROUP BY RequestNo');
        console.log('Requests with quotes:', JSON.stringify(hasQuotes.recordset, null, 2));

        // Check 97 again specifically
        const r97 = await sql.query('SELECT * FROM EnquiryQuotes WHERE RequestNo = 97');
        console.log('Quotes for 97 count:', r97.recordset.length);

        await sql.close();
    } catch (err) {
        console.error('Error:', err);
    }
}

check();

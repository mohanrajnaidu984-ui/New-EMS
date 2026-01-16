const sql = require('mssql');
const fs = require('fs');
require('dotenv').config();

async function check() {
    try {
        await sql.connect(process.env.DB_CONNECTION_STRING);
        const res = await sql.query('SELECT ID, QuoteNumber, RequestNo, TotalAmount FROM EnquiryQuotes WHERE RequestNo = 97');
        fs.writeFileSync('quotes_97.json', JSON.stringify(res.recordset, null, 2));
        console.log('Done');
        await sql.close();
    } catch (err) {
        console.error('Error:', err);
    }
}

check();

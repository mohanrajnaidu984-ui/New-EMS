const sql = require('mssql');
require('dotenv').config();

const config = {
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true
    }
};

async function checkQuotes() {
    try {
        await sql.connect(config);

        const allQuotes = await sql.query`
            SELECT ID, QuoteNumber, QuoteNo, RevisionNo, ToName, Status
            FROM EnquiryQuotes 
            WHERE RequestNo = '107'
            ORDER BY QuoteNo DESC, RevisionNo DESC
        `;

        console.log(JSON.stringify(allQuotes.recordset, null, 2));

    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        await sql.close();
    }
}

checkQuotes();

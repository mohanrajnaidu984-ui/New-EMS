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

async function checkAllQuotes() {
    try {
        await sql.connect(config);

        const allQuotes = await sql.query`
            SELECT ID, QuoteNumber, QuoteNo, RevisionNo, ToName, Status, CreatedAt
            FROM EnquiryQuotes 
            WHERE RequestNo = '107'
            ORDER BY CreatedAt DESC
        `;

        console.log('\n=== ALL QUOTES FOR ENQUIRY 107 ===');
        console.log('Total quotes found:', allQuotes.recordset.length);
        console.log('\nDetails:');
        allQuotes.recordset.forEach((q, idx) => {
            console.log(`\n${idx + 1}. ID: ${q.ID}`);
            console.log(`   QuoteNumber: ${q.QuoteNumber}`);
            console.log(`   QuoteNo: ${q.QuoteNo}, RevisionNo: ${q.RevisionNo}`);
            console.log(`   ToName: ${q.ToName}`);
            console.log(`   Status: ${q.Status}`);
            console.log(`   Created: ${q.CreatedAt}`);
        });

    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        await sql.close();
    }
}

checkAllQuotes();

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

async function testRevision() {
    try {
        await sql.connect(config);
        console.log('Connected to database');

        // Find the latest quote for enquiry 107
        const result = await sql.query`
            SELECT TOP 1 * FROM EnquiryQuotes 
            WHERE RequestNo = '107'
            ORDER BY ID DESC
        `;

        if (result.recordset.length === 0) {
            console.log('No quotes found for enquiry 107');
            return;
        }

        const quote = result.recordset[0];
        console.log('\nLatest Quote:');
        console.log('ID:', quote.ID);
        console.log('QuoteNumber:', quote.QuoteNumber);
        console.log('QuoteNo:', quote.QuoteNo);
        console.log('RevisionNo:', quote.RevisionNo);
        console.log('ToName:', quote.ToName);
        console.log('Status:', quote.Status);

        // Check all quotes for this enquiry
        const allQuotes = await sql.query`
            SELECT ID, QuoteNumber, QuoteNo, RevisionNo, ToName, Status, CreatedAt
            FROM EnquiryQuotes 
            WHERE RequestNo = '107'
            ORDER BY QuoteNo DESC, RevisionNo DESC
        `;

        console.log('\n\nAll Quotes for Enquiry 107:');
        console.log('Total:', allQuotes.recordset.length);
        allQuotes.recordset.forEach(q => {
            console.log(`  ${q.QuoteNumber} | Status: ${q.Status} | Created: ${q.CreatedAt}`);
        });

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sql.close();
    }
}

testRevision();

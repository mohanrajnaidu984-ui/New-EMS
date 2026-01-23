const sql = require('mssql');
require('dotenv').config();
const fs = require('fs');

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

        let output = '\n=== ALL QUOTES FOR ENQUIRY 107 ===\n';
        output += `Total quotes found: ${allQuotes.recordset.length}\n`;
        output += '\nDetails:\n';

        allQuotes.recordset.forEach((q, idx) => {
            output += `\n${idx + 1}. ID: ${q.ID}\n`;
            output += `   QuoteNumber: ${q.QuoteNumber}\n`;
            output += `   QuoteNo: ${q.QuoteNo}, RevisionNo: ${q.RevisionNo}\n`;
            output += `   ToName: ${q.ToName}\n`;
            output += `   Status: ${q.Status}\n`;
            output += `   Created: ${q.CreatedAt}\n`;
        });

        console.log(output);
        fs.writeFileSync('quotes_output.txt', output);
        console.log('\nOutput written to quotes_output.txt');

    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        await sql.close();
    }
}

checkAllQuotes();

const sql = require('mssql');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

async function fixQuoteRef() {
    try {
        await sql.connect(config);

        const requestNo = '107';
        console.log(`Fixing Quote References for ${requestNo}...`);

        // 1. Get Incorrect Quotes
        const incorrect = await sql.query`
            SELECT ID, QuoteNumber 
            FROM EnquiryQuotes 
            WHERE RequestNo = ${requestNo} 
            AND QuoteNumber LIKE '%Civil Project%'
        `;

        if (incorrect.recordset.length === 0) {
            console.log('No incorrect quotes found.');
            process.exit(0);
        }

        // 2. Update to correct format
        for (const q of incorrect.recordset) {
            const oldNum = q.QuoteNumber;
            // AAC/BMS/107-Civil Project/2-R0
            // Target: AAC/BMS/107-L1/2-R0

            // We can replace the 'Civil Project' part with 'L1'?
            // Wait, old might be '107-Civil Project'. 
            // Correct is '107-L1'.

            // Or if existing didn't have hyphen? 
            // The image showed: 107-Civil Project.

            const newNum = oldNum.replace('107-Civil Project', '107-L1');

            console.log(`Updating ${q.ID}: ${oldNum} -> ${newNum}`);

            await sql.query`UPDATE EnquiryQuotes SET QuoteNumber = ${newNum} WHERE ID = ${q.ID}`;
        }

        console.log('Fix complete.');
        process.exit(0);

    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

fixQuoteRef();

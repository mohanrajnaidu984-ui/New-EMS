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

async function checkPendingEnquiries() {
    try {
        await sql.connect(config);

        // Get all enquiries with quotes from 5+ days ago
        const result = await sql.query`
            SELECT 
                E.RequestNo, 
                E.ProjectName,
                E.Status, 
                E.ProbabilityOption,
                (SELECT TOP 1 QuoteDate FROM EnquiryQuotes Q WHERE TRIM(Q.RequestNo) = TRIM(E.RequestNo) ORDER BY QuoteDate DESC) as LastQuoteDate,
                DATEDIFF(day, (SELECT TOP 1 QuoteDate FROM EnquiryQuotes Q WHERE TRIM(Q.RequestNo) = TRIM(E.RequestNo) ORDER BY QuoteDate DESC), GETDATE()) as DaysSinceQuote
            FROM EnquiryMaster E
            WHERE EXISTS(
                SELECT 1 FROM EnquiryQuotes Q 
                WHERE Q.RequestNo = E.RequestNo 
                AND DATEDIFF(day, Q.QuoteDate, GETDATE()) >= 5
            )
            ORDER BY E.RequestNo
        `;

        let output = '\n=== ALL ENQUIRIES WITH QUOTES 5+ DAYS OLD ===\n';
        output += `Total: ${result.recordset.length}\n\n`;

        result.recordset.forEach((enq, idx) => {
            output += `${idx + 1}. RequestNo: ${enq.RequestNo}\n`;
            output += `   ProjectName: ${enq.ProjectName}\n`;
            output += `   Status: "${enq.Status || 'NULL'}"\n`;
            output += `   ProbabilityOption: "${enq.ProbabilityOption || 'NULL'}"\n`;
            output += `   LastQuoteDate: ${enq.LastQuoteDate}\n`;
            output += `   DaysSinceQuote: ${enq.DaysSinceQuote}\n`;

            // Determine if it should show in Pending
            const status = enq.Status;
            const prob = enq.ProbabilityOption;

            let shouldShowInPending = false;
            if (!status || status === '' || status === 'Pending') {
                shouldShowInPending = true;
            } else if (['Won', 'Lost', 'FollowUp', 'Follow-up'].includes(status) && (!prob || prob === '')) {
                shouldShowInPending = true;
            } else if (['Cancelled', 'OnHold', 'Retendered'].includes(status)) {
                shouldShowInPending = false;
            } else if (['Won', 'Lost', 'FollowUp', 'Follow-up'].includes(status) && prob && prob !== '') {
                shouldShowInPending = false;
            }

            output += `   Should show in Pending: ${shouldShowInPending ? 'YES' : 'NO'}\n\n`;
        });

        console.log(output);
        fs.writeFileSync('pending_enquiries.txt', output);
        console.log('Output written to pending_enquiries.txt');

    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        await sql.close();
    }
}

checkPendingEnquiries();

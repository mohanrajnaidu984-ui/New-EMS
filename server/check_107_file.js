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

async function checkEnquiry107() {
    try {
        await sql.connect(config);

        const result = await sql.query`
            SELECT 
                RequestNo, 
                ProjectName,
                Status, 
                ProbabilityOption,
                ExpectedOrderDate,
                WonQuoteRef,
                ProbabilityRemarks
            FROM EnquiryMaster 
            WHERE RequestNo = '107'
        `;

        let output = '\n=== ENQUIRY 107 DETAILS ===\n';
        if (result.recordset.length > 0) {
            const enq = result.recordset[0];
            output += `RequestNo: ${enq.RequestNo}\n`;
            output += `ProjectName: ${enq.ProjectName}\n`;
            output += `Status: "${enq.Status}" (Type: ${typeof enq.Status})\n`;
            output += `ProbabilityOption: "${enq.ProbabilityOption}"\n`;
            output += `ExpectedOrderDate: ${enq.ExpectedOrderDate}\n`;
            output += `WonQuoteRef: ${enq.WonQuoteRef}\n`;
            output += `ProbabilityRemarks: ${enq.ProbabilityRemarks}\n`;
        } else {
            output += 'Enquiry 107 not found!\n';
        }

        console.log(output);
        fs.writeFileSync('enquiry_107_status.txt', output);
        console.log('\nOutput written to enquiry_107_status.txt');

    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        await sql.close();
    }
}

checkEnquiry107();

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

        console.log('\n=== ENQUIRY 107 DETAILS ===');
        if (result.recordset.length > 0) {
            const enq = result.recordset[0];
            console.log('RequestNo:', enq.RequestNo);
            console.log('ProjectName:', enq.ProjectName);
            console.log('Status:', `"${enq.Status}"`, '(Type:', typeof enq.Status, ')');
            console.log('ProbabilityOption:', `"${enq.ProbabilityOption}"`);
            console.log('ExpectedOrderDate:', enq.ExpectedOrderDate);
            console.log('WonQuoteRef:', enq.WonQuoteRef);
            console.log('ProbabilityRemarks:', enq.ProbabilityRemarks);
        } else {
            console.log('Enquiry 107 not found!');
        }

    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        await sql.close();
    }
}

checkEnquiry107();

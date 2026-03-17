const { sql, connectDB } = require('./dbConfig');

async function checkLatestEnquiry() {
    await connectDB();
    try {
        const result = await sql.query`
            SELECT TOP 1 RequestNo, EnquiryStatus, AcknowledgementSE, AdditionalNotificationEmails, Status, CreatedBy
            FROM EnquiryMaster 
            ORDER BY RequestNo DESC
        `;

        if (result.recordset.length > 0) {
            console.log('Latest Enquiry:');
            console.log(JSON.stringify(result.recordset[0], null, 2));
        } else {
            console.log('No enquiries found.');
        }
    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        process.exit(0);
    }
}

checkLatestEnquiry();

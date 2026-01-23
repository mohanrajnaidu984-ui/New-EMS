const { sql, connectDB } = require('./dbConfig');

async function testInsert() {
    await connectDB();
    try {
        const testReqNo = 'TEST-ACK-' + Date.now();
        console.log(`Attempting to insert test record with RequestNo: ${testReqNo}`);

        await sql.query`
            INSERT INTO EnquiryMaster (
                RequestNo, AcknowledgementSE, AdditionalNotificationEmails, EnquiryStatus, Status, CreatedBy
            ) VALUES (
                ${testReqNo}, 'TestUser', 'test@example.com', 'Active', 'Enquiry', 'System'
            )
        `;
        console.log('Insert successful.');

        const result = await sql.query`SELECT AcknowledgementSE FROM EnquiryMaster WHERE RequestNo = ${testReqNo}`;
        console.log('Read back AcknowledgementSE:', result.recordset[0].AcknowledgementSE);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit(0);
    }
}

testInsert();

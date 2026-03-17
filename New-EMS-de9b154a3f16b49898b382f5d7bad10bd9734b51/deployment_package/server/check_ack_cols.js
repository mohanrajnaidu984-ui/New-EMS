const { sql, connectDB } = require('./dbConfig');

async function checkColumns() {
    await connectDB();
    try {
        const result = await sql.query`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'EnquiryMaster' 
            AND COLUMN_NAME IN ('AcknowledgementSE', 'AdditionalNotificationEmails')
        `;
        console.log('Found columns:', result.recordset.map(r => r.COLUMN_NAME).join(', '));
        if (result.recordset.length === 0) {
            console.log('Neither AcknowledgementSE nor AdditionalNotificationEmails found');
        }
    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit(0);
    }
}

checkColumns();

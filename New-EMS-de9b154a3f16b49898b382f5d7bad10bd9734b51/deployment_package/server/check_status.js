const { sql, connectDB } = require('./dbConfig');

async function checkEnquiryStatus() {
    await connectDB();
    try {
        console.log('Checking EnquiryStatus column and latest data...');

        // 1. Check if column exists
        const colResult = await sql.query`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'EnquiryMaster' AND COLUMN_NAME = 'EnquiryStatus'
        `;

        if (colResult.recordset.length > 0) {
            console.log('✅ Column "EnquiryStatus" EXISTS in EnquiryMaster table.');
        } else {
            console.log('❌ Column "EnquiryStatus" DOES NOT EXIST in EnquiryMaster table.');
        }

        // 2. Check latest 5 records
        const dataResult = await sql.query`
            SELECT TOP 5 RequestNo, EnquiryStatus, Status, AcknowledgementSE 
            FROM EnquiryMaster 
            ORDER BY ID DESC
        `;

        if (dataResult.recordset.length > 0) {
            console.log('\nLatest 5 Enquiries:');
            console.table(dataResult.recordset);
        } else {
            console.log('No enquiries found.');
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit(0);
    }
}

checkEnquiryStatus();

const { sql, connectDB } = require('./dbConfig');

async function addCol() {
    await connectDB();
    try {
        // Check if column exists
        const check = await sql.query`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'EnquiryMaster' AND COLUMN_NAME = 'EnquiryStatus'
        `;

        if (check.recordset.length === 0) {
            console.log('Adding EnquiryStatus column...');
            await sql.query`ALTER TABLE EnquiryMaster ADD EnquiryStatus NVARCHAR(50) DEFAULT 'Active'`;
            console.log('Column EnquiryStatus added.');
        } else {
            console.log('Column EnquiryStatus already exists.');
        }
    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit(0);
    }
}

addCol();

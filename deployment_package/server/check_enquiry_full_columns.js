const { sql, connectDB } = require('./dbConfig');

async function checkColumns() {
    await connectDB();
    try {
        const result = await sql.query`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'EnquiryMaster'
        `;
        console.log('Columns in EnquiryMaster:', result.recordset.map(r => r.COLUMN_NAME));
    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit(0);
    }
}

checkColumns();

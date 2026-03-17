const { connectDB, sql } = require('./dbConfig');

async function checkSchema() {
    try {
        await connectDB();
        console.log('Connected to DB');

        console.log('--- EnquiryMaster Columns ---');
        const emCols = await sql.query`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'EnquiryMaster'
        `;
        emCols.recordset.forEach(row => console.log(row.COLUMN_NAME));

        console.log('\n--- Attachments Columns ---');
        const attCols = await sql.query`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'Attachments'
        `;
        attCols.recordset.forEach(row => console.log(row.COLUMN_NAME));

    } catch (err) {
        console.error('Error:', err);
    } finally {
        // sql.close(); // Keep open or exit
        process.exit(0);
    }
}

checkSchema();

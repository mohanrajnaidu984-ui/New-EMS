const { sql, connectDB } = require('./dbConfig');

async function checkColumns() {
    await connectDB();
    try {
        const result = await sql.query`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'Master_ReceivedFrom'
        `;
        console.log('Columns in Master_ReceivedFrom:', JSON.stringify(result.recordset.map(r => r.COLUMN_NAME), null, 2));
    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit(0);
    }
}

checkColumns();

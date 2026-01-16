const { connectDB, sql } = require('./dbConfig');

async function checkColumns() {
    try {
        await connectDB();
        console.log('Connected to DB');

        const result = await sql.query`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'Master_CustomerName'
        `;
        result.recordset.forEach(r => console.log('COLUMN:', r.COLUMN_NAME));

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sql.close();
    }
}

checkColumns();

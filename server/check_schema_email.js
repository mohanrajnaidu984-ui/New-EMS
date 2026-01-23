const { sql, connectDB } = require('./dbConfig');

async function checkSchema() {
    try {
        await connectDB();
        const result = await sql.query`
            SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'Master_ConcernedSE' AND COLUMN_NAME = 'EmailId'
        `;
        console.log('Column Schema:', JSON.stringify(result.recordset, null, 2));
        process.exit(0);
    } catch (err) {
        console.error('Error checking schema:', err);
        process.exit(1);
    }
}

checkSchema();

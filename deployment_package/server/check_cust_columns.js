const { sql, connectDB } = require('./dbConfig');

async function checkColumns() {
    await connectDB();
    try {
        const tables = ['Master_CustomerName', 'Master_ClientName', 'Master_ConsultantName'];
        for (const table of tables) {
            const result = await sql.query`
                SELECT COLUMN_NAME 
                FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_NAME = ${table}
            `;
            console.log(`Columns in ${table}:`, result.recordset.map(r => r.COLUMN_NAME));
        }
    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit(0);
    }
}

checkColumns();

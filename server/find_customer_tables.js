const { connectDB, sql } = require('./dbConfig');

async function findTables() {
    try {
        await connectDB();
        console.log('Connected to DB');

        const result = await sql.query`
            SELECT TABLE_NAME 
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_NAME LIKE '%Customer%' OR TABLE_NAME LIKE '%Client%'
            ORDER BY TABLE_NAME
        `;
        console.log('Found Tables:', result.recordset);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sql.close();
    }
}

findTables();

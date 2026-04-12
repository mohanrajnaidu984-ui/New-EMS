const { sql, connectDB } = require('./dbConfig');

async function checkSchema() {
    try {
        await connectDB();
        console.log("Checking schema for Master_ConcernedSE...");

        const result = await new sql.Request().query(`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'Master_ConcernedSE'
        `);

        console.log("Columns:", result.recordset.map(r => r.COLUMN_NAME));

        await sql.close();
    } catch (err) {
        console.error("Error checking schema:", err);
    }
}

checkSchema();


const { sql, connectDB } = require('./dbConfig');

async function listTables() {
    try {
        await connectDB();

        const result = await sql.query(`
            SELECT TABLE_NAME 
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_TYPE = 'BASE TABLE'
        `);

        console.log(result.recordset.map(r => r.TABLE_NAME));

    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

listTables();

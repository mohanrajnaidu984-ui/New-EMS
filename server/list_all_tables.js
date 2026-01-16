const { sql, connectDB } = require('./dbConfig');

async function listTables() {
    try {
        await connectDB();
        const result = await sql.query`
            SELECT TABLE_NAME 
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_TYPE = 'BASE TABLE'
        `;
        console.log('Database Tables:');
        result.recordset.forEach(t => {
            console.log(t.TABLE_NAME);
        });
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

listTables();

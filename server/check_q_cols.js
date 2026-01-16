
const { sql, connectDB } = require('./dbConfig'); // Changed path to relative to server/

(async () => {
    try {
        await connectDB();
        const res = await sql.query('SELECT TOP 1 * FROM QuoteMaster');
        if (res.recordset.length > 0) {
            console.log('QUOTE COLUMNS:', JSON.stringify(Object.keys(res.recordset[0])));
        } else {
            const schemaRes = await sql.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'QuoteMaster'");
            console.log('QUOTE COLUMNS (Schema):', JSON.stringify(schemaRes.recordset.map(r => r.COLUMN_NAME)));
        }
    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit();
    }
})();

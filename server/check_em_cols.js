require('dotenv').config();
const { sql, connectDB } = require('./dbConfig');

(async () => {
    try {
        await connectDB();
        const res = await sql.query("SELECT TOP 1 * FROM EnquiryMaster");
        if (res.recordset.length > 0) {
            console.log('COLS:', JSON.stringify(Object.keys(res.recordset[0]), null, 2));
        } else {
            console.log('No records found in EnquiryMaster');
            const schema = await sql.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'EnquiryMaster'");
            console.log('SCHEMA COLS:', JSON.stringify(schema.recordset.map(r => r.COLUMN_NAME), null, 2));
        }
    } catch (err) {
        console.error("Error:", err);
    } finally {
        process.exit();
    }
})();

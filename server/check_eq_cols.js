require('dotenv').config();
const { sql, connectDB } = require('./dbConfig');

(async () => {
    try {
        await connectDB();
        const res = await sql.query("SELECT TOP 1 * FROM EnquiryQuotes");
        if (res.recordset.length > 0) {
            console.log('COLS:', Object.keys(res.recordset[0]).join(', '));
            console.log('DATA:', res.recordset[0]);
        } else {
            const schema = await sql.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'EnquiryQuotes'");
            console.log('SCHEMA COLS:', schema.recordset.map(r => r.COLUMN_NAME).join(', '));
        }
    } catch (err) {
        console.error("Error:", err);
    } finally {
        process.exit();
    }
})();

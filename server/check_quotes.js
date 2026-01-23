
const { sql, connectDB } = require('./dbConfig');
async function run() {
    try {
        await connectDB();
        const res = await sql.query("SELECT TOP 1 * FROM EnquiryQuotes WHERE RequestNo = '11'");
        const fs = require('fs');
        fs.writeFileSync('quotes_output.json', JSON.stringify(res.recordset, null, 2), 'utf8');
        console.log('Done');
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}
run();

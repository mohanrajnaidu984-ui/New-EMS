
const { sql, connectDB } = require('./dbConfig');

async function run() {
    try {
        await connectDB();
        const res = await sql.query("SELECT * FROM EnquiryFor WHERE RequestNo = '11'");
        const fs = require('fs');
        fs.writeFileSync('enquiryfor_output.json', JSON.stringify(res.recordset, null, 2), 'utf8');
        console.log('Done');
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}
run();

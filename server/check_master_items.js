
const { sql, connectDB } = require('./dbConfig');
const fs = require('fs');
async function run() {
    try {
        await connectDB();
        const res = await sql.query("SELECT ItemName, CompanyLogo, CompanyName FROM Master_EnquiryFor");
        fs.writeFileSync('master_enquiryfor_items.json', JSON.stringify(res.recordset, null, 2));
        console.log('Done');
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}
run();

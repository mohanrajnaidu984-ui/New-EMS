const fs = require('fs');
const { sql, connectDB } = require('./dbConfig');
async function run() {
    try {
        await connectDB();
        const res = await sql.query("SELECT ItemName, CompanyLogo, DepartmentName, CompanyName FROM Master_EnquiryFor WHERE ItemName LIKE '%Civil%'");
        fs.writeFileSync('db_logo_output.json', JSON.stringify(res.recordset, null, 2), 'utf8');
        console.log('Done');
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}
run();


const { sql, connectDB } = require('./dbConfig');
const fs = require('fs');
const path = require('path');

async function checkItemNames() {
    try {
        await connectDB();

        const jobs = await sql.query("SELECT ItemName FROM EnquiryFor WHERE RequestNo = '11'");
        const masters = await sql.query("SELECT ItemName, CompanyLogo FROM Master_EnquiryFor");

        const combined = { jobs: jobs.recordset, masters: masters.recordset };
        fs.writeFileSync(path.join(__dirname, 'names_debug.json'), JSON.stringify(combined, null, 2));
        console.log('Results written to names_debug.json');

    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}
checkItemNames();

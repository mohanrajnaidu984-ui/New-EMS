
const { sql, connectDB } = require('./dbConfig');
async function run() {
    try {
        await connectDB();
        const requestNo = '11';
        const res = await sql.query(`
            SELECT ef.ItemName, mef.CompanyLogo 
            FROM EnquiryFor ef 
            LEFT JOIN Master_EnquiryFor mef ON (ef.ItemName = mef.ItemName OR ef.ItemName LIKE '% - ' + mef.ItemName)
            WHERE ef.RequestNo = '${requestNo}'
        `);
        const fs = require('fs');
        fs.writeFileSync('joined_logos.json', JSON.stringify(res.recordset, null, 2), 'utf8');
        console.log('Done');
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}
run();

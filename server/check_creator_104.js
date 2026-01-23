const { sql, connectDB } = require('./dbConfig');

async function checkCreator() {
    try {
        await connectDB();
        const res = await sql.query`SELECT CreatedBy FROM EnquiryMaster WHERE RequestNo = '104'`;
        console.log('Creator:', res.recordset[0]?.CreatedBy);
    } catch (err) { console.error(err); }
    process.exit(0);
}
checkCreator();

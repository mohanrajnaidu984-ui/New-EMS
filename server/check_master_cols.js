
const { sql, connectDB } = require('./dbConfig');
async function run() {
    try {
        await connectDB();
        const res = await sql.query("SELECT TOP 1 * FROM Master_EnquiryFor");
        console.log('Columns:', Object.keys(res.recordset[0]));
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}
run();

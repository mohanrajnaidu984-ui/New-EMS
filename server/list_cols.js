const { connectDB, sql } = require('./dbConfig');

async function run() {
    await connectDB();
    const res = await sql.query`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'EnquiryMaster'
    `;
    console.log(res.recordset.map(c => c.COLUMN_NAME).join(', '));
    process.exit();
}
run();

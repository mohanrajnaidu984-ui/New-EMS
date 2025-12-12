const { connectDB, sql } = require('./dbConfig');

const run = async () => {
    try {
        await connectDB();
        const result = await sql.query`SELECT TOP 5 RequestNo, CreatedAt, CustomerName FROM EnquiryMaster ORDER BY RequestNo DESC`;
        console.log(result.recordset);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

run();

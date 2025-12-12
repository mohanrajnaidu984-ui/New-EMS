const { connectDB, sql } = require('./dbConfig');

const run = async () => {
    try {
        await connectDB();
        const result = await sql.query`SELECT * FROM EnquiryMaster WHERE RequestNo = '27'`;
        console.log('Record 27:', result.recordset);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

run();

const { sql, connectDB } = require('./dbConfig');

const run = async () => {
    try {
        await connectDB();
        const res = await new sql.Request().query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'EnquiryFor'");
        console.log("EnquiryFor COLUMNS:");
        res.recordset.forEach(c => console.log(c.COLUMN_NAME));

        const data = await new sql.Request().query("SELECT TOP 5 * FROM EnquiryFor WHERE RequestNo = '20'");
        console.log("\nSample Data for RequestNo 20:");
        console.log(JSON.stringify(data.recordset, null, 2));
    } catch (err) {
        console.error(err);
    }
    process.exit(0);
};

run();

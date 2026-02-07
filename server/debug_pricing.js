const { sql, connectDB } = require('./dbConfig');

const run = async () => {
    try {
        await connectDB();
        const res = await new sql.Request().query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'EnquiryPricingValues'");
        console.log("EnquiryPricingValues COLS:" + res.recordset.map(c => c.COLUMN_NAME).join(","));

        const data = await new sql.Request().query("SELECT TOP 5 * FROM EnquiryPricingValues");
        console.log("DATA:" + JSON.stringify(data.recordset, null, 2));
    } catch (err) {
        console.error(err);
    }
    process.exit(0);
};

run();

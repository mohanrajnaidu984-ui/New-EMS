const { sql, connectDB } = require('./dbConfig');

const run = async () => {
    try {
        await connectDB();
        const data = await new sql.Request().query("SELECT ID, OptionName FROM EnquiryPricingOptions WHERE RequestNo = '20'");
        data.recordset.forEach(r => console.log(`OP_ID: ${r.ID} | NAME: ${r.OptionName}`));
    } catch (err) {
        console.error(err);
    }
    process.exit(0);
};

run();

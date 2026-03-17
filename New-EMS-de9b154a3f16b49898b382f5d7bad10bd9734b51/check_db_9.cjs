const { sql, connectDB } = require('./server/dbConfig');

async function check() {
    try {
        await connectDB();
        console.log("--- EnquiryPricingValues for RequestNo 9 ---");
        const res = await sql.query`
            SELECT pv.*, po.OptionName, po.CustomerName as POCustomer
            FROM EnquiryPricingValues pv
            JOIN EnquiryPricingOptions po ON pv.OptionID = po.ID
            WHERE LTRIM(RTRIM(pv.RequestNo)) = '9'
        `;
        console.table(res.recordset);

        console.log("\n--- Master_EnquiryFor mapping ---");
        const masters = await sql.query`SELECT ItemName, CommonMailIds, CCMailIds FROM Master_EnquiryFor`;
        console.table(masters.recordset);

        console.log("\n--- EnquiryQuotes for RequestNo 9 ---");
        const quotes = await sql.query`SELECT QuoteNumber, TotalAmount, ToName FROM EnquiryQuotes WHERE LTRIM(RTRIM(RequestNo)) = '9'`;
        console.table(quotes.recordset);

    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

check();

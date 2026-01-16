
const { sql, connectDB } = require('./dbConfig');

async function checkEnquiry97() {
    try {
        await connectDB();

        const masterRes = await sql.query`SELECT RequestNo, Status, ProjectName FROM EnquiryMaster WHERE RequestNo = '97'`;
        console.log("MASTER_RECORD:", JSON.stringify(masterRes.recordset));

        const quotesRes = await sql.query`SELECT QuoteNumber, QuoteDate, TotalAmount FROM EnquiryQuotes WHERE RequestNo = '97'`;
        console.log("QUOTES_RECORDS:", JSON.stringify(quotesRes.recordset));

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkEnquiry97();

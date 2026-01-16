require('dotenv').config();
const { sql, connectDB } = require('./dbConfig');

(async () => {
    try {
        await connectDB();
        console.log("Connected to DB");

        const e = await sql.query("SELECT RequestNo, Status, EnquiryDate FROM EnquiryMaster WHERE RequestNo = '97'");
        console.log('Enquiry 97:', e.recordset[0]);

        const q = await sql.query("SELECT ID, RequestNo, QuoteDate, QuoteNo, RevisionNo, TotalAmount FROM EnquiryQuotes WHERE RequestNo = '97'");
        console.log('Quotes for 97:', q.recordset);

        if (q.recordset.length > 0) {
            const quoteDate = new Date(q.recordset[0].QuoteDate);
            const today = new Date();
            const diffTime = Math.abs(today - quoteDate);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            console.log(`Quote is ${diffDays} days old`);
        }

    } catch (err) {
        console.error("Error:", err);
    } finally {
        process.exit();
    }
})();

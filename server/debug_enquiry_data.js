
const { sql, connectDB } = require('./dbConfig');

async function debug() {
    try {
        await connectDB();

        const reqNo = '97';
        console.log(`--- DEBUGGING ENQUIRY ${reqNo} ---`);

        const master = await sql.query(`SELECT RequestNo, Status, EnquiryDate FROM EnquiryMaster WHERE RequestNo = '97'`);
        if (master.recordset.length === 0) {
            console.log('Enquiry 97 NOT FOUND IN MASTER');
            const all = await sql.query(`SELECT TOP 5 RequestNo FROM EnquiryMaster ORDER BY EnquiryDate DESC`);
            console.log('Latest RequestNos:', all.recordset.map(r => r.RequestNo));
            return;
        }
        console.log('MASTER RECORD:', master.recordset[0]);

        const quotes = await sql.query(`SELECT QuoteID, QuoteDate FROM EnquiryQuotes WHERE RequestNo = '97'`);
        console.log('QUOTES RECORDS:', quotes.recordset);

    } catch (err) {
        console.error("SQL Error:", err);
    }
}

debug();

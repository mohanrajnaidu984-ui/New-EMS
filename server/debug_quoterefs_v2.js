const { sql, connectDB } = require('./dbConfig');

async function debug() {
    await connectDB();
    try {
        console.log('--- Checking for quotes ---');
        const qCount = await sql.query('SELECT COUNT(*) as cnt FROM EnquiryQuotes');
        console.log('Total quotes in table:', qCount.recordset[0].cnt);

        console.log('--- Checking Enquiry 97 specifically ---');
        const result97 = await sql.query("SELECT RequestNo, (SELECT QuoteNumber + ',' FROM EnquiryQuotes Q WHERE Q.RequestNo = E.RequestNo FOR XML PATH('')) as QuoteRefs FROM EnquiryMaster E WHERE E.RequestNo = '97'");
        console.log('Result for 97:', result97.recordset);

        console.log('--- Checking any enquiry with quotes ---');
        const anyWithQuotes = await sql.query("SELECT TOP 1 RequestNo, (SELECT QuoteNumber + ',' FROM EnquiryQuotes Q WHERE Q.RequestNo = E.RequestNo FOR XML PATH('')) as QuoteRefs FROM EnquiryMaster E WHERE EXISTS (SELECT 1 FROM EnquiryQuotes Q WHERE Q.RequestNo = E.RequestNo)");
        console.log('Result for sample:', anyWithQuotes.recordset);

    } catch (err) {
        console.error('Error during debug:', err);
    } finally {
        process.exit();
    }
}

debug();

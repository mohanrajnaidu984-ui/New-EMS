const { sql, connectDB } = require('./dbConfig');
async function checkQuotes() {
    await connectDB();
    const result = await sql.query`
        SELECT QuoteNumber, ToName, QuoteDate, RevisionNo
        FROM EnquiryQuotes 
        WHERE TRIM(RequestNo) = '97'
        ORDER BY ToName ASC, QuoteDate DESC
    `;
    console.log(result.recordset);
    process.exit(0);
}
checkQuotes();

const { sql, connectDB } = require('./dbConfig');

async function check() {
    await connectDB();
    try {
        console.log('--- EnquiryQuotes Columns ---');
        const quotesCols = await sql.query`SELECT column_name FROM information_schema.columns WHERE table_name = 'EnquiryQuotes'`;
        console.log(quotesCols.recordset.map(r => r.column_name).join(', '));

        console.log('\n--- EnquiryMaster Columns ---');
        const masterCols = await sql.query`SELECT column_name FROM information_schema.columns WHERE table_name = 'EnquiryMaster'`;
        console.log(masterCols.recordset.map(r => r.column_name).join(', '));

        console.log('\n--- Sample Quote for RequestNo 97 ---');
        const sampleQuotes = await sql.query`SELECT QuoteNo, Rev FROM EnquiryQuotes WHERE RequestNo = '97'`;
        console.log(JSON.stringify(sampleQuotes.recordset, null, 2));

    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

check();

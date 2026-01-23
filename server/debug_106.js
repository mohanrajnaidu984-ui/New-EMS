const { sql, connectDB } = require('./dbConfig');

async function check106() {
    try {
        await connectDB();
        const requestNo = '106';

        console.log('--- Enquiry 106 Items ---');
        const items = await sql.query`SELECT ItemName FROM EnquiryFor WHERE RequestNo = ${requestNo}`;
        console.table(items.recordset);

        console.log('--- Master Data for Items ---');
        for (const item of items.recordset) {
            const res = await sql.query`SELECT * FROM Master_EnquiryFor WHERE ItemName = ${item.ItemName}`;
            if (res.recordset.length > 0) {
                const m = res.recordset[0];
                console.log(`Item: ${item.ItemName} -> Dept: ${m.DepartmentCode}, Div: ${m.DivisionCode}, Company: ${m.CompanyName}`);
            } else {
                console.log(`Item: ${item.ItemName} -> No Master Match`);
            }
        }

        console.log('--- Existing Quotes for 106 ---');
        const quotes = await sql.query`SELECT QuoteNumber, QuoteNo FROM EnquiryQuotes WHERE RequestNo = ${requestNo}`;
        console.table(quotes.recordset);

    } catch (err) { console.error(err); }
    process.exit(0);
}
check106();

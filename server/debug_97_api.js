const { sql, connectDB } = require('./dbConfig');

async function debug() {
    await connectDB();
    try {
        const query = `
            SELECT
                E.RequestNo,
                ISNULL(STUFF((SELECT ',' + Q.QuoteNumber FROM EnquiryQuotes Q WHERE TRIM(Q.RequestNo) = TRIM(E.RequestNo) FOR XML PATH(''), TYPE).value('.', 'NVARCHAR(MAX)'), 1, 1, ''), '') as QuoteRefs
            FROM EnquiryMaster E
            WHERE TRIM(E.RequestNo) = '97'
        `;
        const result = await sql.query(query);
        console.log('--- API Simulation Result for 97 ---');
        console.log(JSON.stringify(result.recordset, null, 2));

        if (result.recordset.length > 0) {
            const qr = result.recordset[0].QuoteRefs;
            console.log('QuoteRefs value:', qr);
            console.log('QuoteRefs split:', qr.split(',').filter(Boolean));
        }

        console.log('\n--- Checking EnquiryQuotes for 97 raw ---');
        const raw = await sql.query("SELECT * FROM EnquiryQuotes WHERE TRIM(RequestNo) = '97'");
        console.log('Count:', raw.recordset.length);
        console.log('Sample QuoteNumbers:', raw.recordset.map(r => r.QuoteNumber));

    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

debug();

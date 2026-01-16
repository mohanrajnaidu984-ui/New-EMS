const { sql, connectDB } = require('./dbConfig');

async function debug() {
    await connectDB();
    try {
        const query = `
            SELECT
                E.RequestNo,
                E.Status,
                ISNULL(STUFF((SELECT ',' + Q.QuoteNumber FROM EnquiryQuotes Q WHERE TRIM(Q.RequestNo) = TRIM(E.RequestNo) FOR XML PATH(''), TYPE).value('.', 'NVARCHAR(MAX)'), 1, 1, ''), '') as QuoteRefs
            FROM EnquiryMaster E
            WHERE E.Status = 'Won' OR TRIM(E.RequestNo) = '97'
        `;
        const result = await sql.query(query);
        console.log('--- Won/97 Enquiries ---');
        result.recordset.forEach(r => {
            console.log(`ReqNo: [${r.RequestNo}] | Status: ${r.Status} | QuoteRefs: ${r.QuoteRefs}`);
        });

    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

debug();

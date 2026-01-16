const { sql } = require('./dbConfig');

async function checkQuotes() {
    try {
        const res = await sql.query(`
            SELECT
                TRIM(E.RequestNo) as RequestNo,
                (
                    SELECT Q.QuoteNumber, Q.ToName 
                    FROM EnquiryQuotes Q 
                    WHERE TRIM(Q.RequestNo) = TRIM(E.RequestNo)
                    FOR JSON PATH
                ) as QuoteRefsStructured
            FROM EnquiryMaster E
            WHERE TRIM(E.RequestNo) = '97'
        `);
        console.log('Result for Enquiry 97:');
        console.log(JSON.stringify(res.recordset, null, 2));
    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit();
    }
}

checkQuotes();

const { sql, connectDB } = require('./dbConfig');
const fs = require('fs');

async function checkQuotes() {
    try {
        await connectDB();
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
        const output = {
            timestamp: new Date().toISOString(),
            result: res.recordset
        };
        fs.writeFileSync('debug_quotes_result.json', JSON.stringify(output, null, 2));
        console.log('Results written to debug_quotes_result.json');
    } catch (err) {
        fs.writeFileSync('debug_quotes_error.txt', err.stack);
        console.error('Error:', err);
    } finally {
        process.exit();
    }
}

checkQuotes();

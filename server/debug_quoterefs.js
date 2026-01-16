const { sql, connectDB } = require('./dbConfig');

async function debug() {
    await connectDB();
    try {
        const query = `
            SELECT
                E.RequestNo,
                (SELECT QuoteNumber + ',' FROM EnquiryQuotes Q WHERE Q.RequestNo = E.RequestNo FOR XML PATH('')) as QuoteRefs
            FROM EnquiryMaster E
            WHERE E.RequestNo = '97'
        `;
        const result = await sql.query(query);
        console.log('Result for Enquiry 97:');
        console.log(JSON.stringify(result.recordset, null, 2));

        const allWithQuotes = await sql.query(`
            SELECT DISTINCT RequestNo FROM EnquiryQuotes
        `);
        console.log('\nEnquiries with at least one quote:', allWithQuotes.recordset.map(r => r.RequestNo).join(', '));

        if (allWithQuotes.recordset.length > 0) {
            const firstReq = allWithQuotes.recordset[0].RequestNo;
            const testResult = await sql.query(`
                SELECT (SELECT QuoteNumber + ',' FROM EnquiryQuotes Q WHERE Q.RequestNo = '${firstReq}' FOR XML PATH('')) as QuoteRefs
            `);
            console.log(\`Test result for \${firstReq}:\`);
            console.log(testResult.recordset[0]);
        }

    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

debug();

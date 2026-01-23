
const { sql, connectDB } = require('./dbConfig');

async function verifyFix() {
    try {
        await connectDB();

        console.log('--- Verifying Fix for RequestNo 11 ---');
        // Simulate the parameterized query
        const RequestNo = '11';

        const result = await sql.query`
            SELECT ef.ID, ef.ItemName, mef.CompanyLogo
            FROM EnquiryFor ef
            LEFT JOIN Master_EnquiryFor mef ON (ef.ItemName = mef.ItemName OR ef.ItemName LIKE '% - ' + mef.ItemName)
            WHERE ef.RequestNo = ${RequestNo}
        `;

        console.table(result.recordset);

        const hasLogo = result.recordset.some(r => r.CompanyLogo);
        console.log('Has valid logo mapped?', hasLogo);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit();
    }
}

verifyFix();

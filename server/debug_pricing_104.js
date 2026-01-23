const { sql, connectDB } = require('./dbConfig');

async function debugPricing() {
    try {
        await connectDB();
        const requestNo = '104';

        console.log('--- EnquiryFor Items ---');
        const items = await sql.query`SELECT * FROM EnquiryFor WHERE RequestNo = ${requestNo}`;
        console.table(items.recordset);

        console.log('--- User Scope (Balakumar) ---');
        const userRes = await sql.query`SELECT * FROM Master_ConcernedSE WHERE RequestNo = ${requestNo} AND FullName LIKE '%Balakumar%'`;
        const user = userRes.recordset[0];
        console.log('User Dept:', user ? user.Department : 'N/A');

        console.log('--- Tree Structure Construction Check ---');
        // This mimics backend logic to see what permissions might be
    } catch (err) { console.error(err); }
    process.exit(0);
}
debugPricing();

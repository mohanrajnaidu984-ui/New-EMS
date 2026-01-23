const { sql, connectDB } = require('./dbConfig');

async function checkEmails() {
    try {
        await connectDB();
        const requestNo = '104';

        console.log('--- Checking Emails for 104 ---');
        const jobs = await sql.query`
            SELECT ef.ItemName, mef.CommonMailIds, mef.CCMailIds 
            FROM EnquiryFor ef
            LEFT JOIN Master_EnquiryFor mef ON ef.ItemName = mef.ItemName
            WHERE ef.RequestNo = ${requestNo}
        `;
        console.table(jobs.recordset);

        const userRes = await sql.query`SELECT EmailId FROM Master_ConcernedSE WHERE FullName = 'Balakumar'`;
        console.log('Balakumar Email:', userRes.recordset[0]?.EmailId);

    } catch (err) { console.error(err); }
    process.exit(0);
}
checkEmails();

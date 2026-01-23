const sql = require('mssql');
const { dbConfig } = require('./dbConfig');

async function debugEnquiryFor() {
    try {
        await sql.connect(dbConfig);
        console.log('Connected');

        const requestNo = '107';

        const jobsResult = await sql.query`
            SELECT ef.ID, ef.ParentID, ef.ItemName, ef.ParentItemName, mef.CommonMailIds, mef.CCMailIds
            FROM EnquiryFor ef
            LEFT JOIN Master_EnquiryFor mef ON ef.ItemName = mef.ItemName
            WHERE ef.RequestNo = ${requestNo}
            ORDER BY ef.ID ASC
        `;

        console.log('\n--- Jobs (EnquiryFor joined with Master) ---');
        console.table(jobsResult.recordset);

        // Check user access logic simulation
        const userEmail = 'mohanraj.naidu984@gmail.com';
        const userJobItems = [];
        jobsResult.recordset.forEach(job => {
            const commonMails = (job.CommonMailIds || '').toLowerCase().split(',').map(s => s.trim());
            const ccMails = (job.CCMailIds || '').toLowerCase().split(',').map(s => s.trim());
            const allMails = [...commonMails, ...ccMails];

            if (allMails.includes(userEmail.toLowerCase())) {
                userJobItems.push(job.ItemName);
            }
        });
        console.log('\nUser Job Items:', userJobItems);

        // Check Hierarchy
        const hasHierarchy = jobsResult.recordset.some(j => j.ParentItemName);
        console.log('Has Hierarchy:', hasHierarchy);

    } catch (err) {
        console.error(err);
    } finally {
        await sql.close();
    }
}

debugEnquiryFor();

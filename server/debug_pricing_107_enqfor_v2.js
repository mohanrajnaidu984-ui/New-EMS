const sql = require('mssql');
const { dbConfig } = require('./dbConfig');
const fs = require('fs');

async function debugEnquiryFor() {
    let output = '';
    const log = (msg) => {
        console.log(msg);
        output += (typeof msg === 'object' ? JSON.stringify(msg, null, 2) : msg) + '\n';
    };

    try {
        await sql.connect(dbConfig);
        log('Connected');

        const requestNo = '107';

        const jobsResult = await sql.query`
            SELECT ef.ID, ef.ParentID, ef.ItemName, ef.ParentItemName, mef.CommonMailIds, mef.CCMailIds
            FROM EnquiryFor ef
            LEFT JOIN Master_EnquiryFor mef ON ef.ItemName = mef.ItemName
            WHERE ef.RequestNo = ${requestNo}
            ORDER BY ef.ID ASC
        `;

        log('\n--- Jobs (EnquiryFor joined with Master) ---');
        log(jobsResult.recordset);

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
        log('\nUser Job Items: ' + JSON.stringify(userJobItems));

        // Check Hierarchy
        const hasHierarchy = jobsResult.recordset.some(j => j.ParentItemName);
        log('Has Hierarchy: ' + hasHierarchy);

    } catch (err) {
        log('Error: ' + err.message);
    } finally {
        await sql.close();
        fs.writeFileSync('debug_pricing_107_enqfor_output.txt', output);
        console.log("Output written to debug_pricing_107_enqfor_output.txt");
    }
}

debugEnquiryFor();

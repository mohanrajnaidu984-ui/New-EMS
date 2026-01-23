const sql = require('mssql');
const { dbConfig } = require('./dbConfig');

async function debugPricingLogic() {
    try {
        await sql.connect(dbConfig);
        console.log('Connected');

        const requestNo = '107';
        const userEmail = 'mohanraj.naidu984@gmail.com';

        // 1. Get Enquiry Details
        const enquiryResult = await sql.query`SELECT RequestNo, ProjectName, CreatedBy FROM EnquiryMaster WHERE RequestNo = ${requestNo}`;
        const enquiry = enquiryResult.recordset[0];
        console.log('Enquiry CreatedBy:', enquiry.CreatedBy);

        // 2. Get User FullName
        const userResult = await sql.query`SELECT FullName FROM Master_ConcernedSE WHERE EmailId = ${userEmail}`;
        const userFullName = userResult.recordset[0]?.FullName || '';
        console.log('User FullName:', userFullName);

        // 3. Get Jobs
        const jobsResult = await sql.query`
            SELECT ef.ID, ef.ParentID, ef.ItemName, ef.ParentItemName, mef.CommonMailIds, mef.CCMailIds
            FROM EnquiryFor ef
            LEFT JOIN Master_EnquiryFor mef ON ef.ItemName = mef.ItemName
            WHERE ef.RequestNo = ${requestNo}
            ORDER BY ef.ID ASC
        `;
        const jobs = jobsResult.recordset;

        // 4. Identify Lead Job
        const leadJobItem = jobs.length > 0 ? jobs[0].ItemName : null;
        console.log('Lead Job:', leadJobItem);

        // 5. Determine Access (Exact Logic copy)
        let userHasLeadAccess = false;
        let userJobItems = [];

        // Check Creator matches
        if (userFullName && enquiry.CreatedBy && userFullName.toLowerCase().trim() === enquiry.CreatedBy.toLowerCase().trim()) {
            userHasLeadAccess = true;
            userJobItems = leadJobItem ? [leadJobItem] : [];
            console.log('User is Creator');
        }

        // Email check
        jobs.forEach(job => {
            const commonMails = (job.CommonMailIds || '').toLowerCase().split(',').map(s => s.trim());
            const ccMails = (job.CCMailIds || '').toLowerCase().split(',').map(s => s.trim());
            const allMails = [...commonMails, ...ccMails];

            if (allMails.includes(userEmail.toLowerCase())) {
                if (!userJobItems.includes(job.ItemName)) {
                    userJobItems.push(job.ItemName);
                }
                if (job.ItemName === leadJobItem) {
                    userHasLeadAccess = true;
                }
            }
        });
        console.log('User Job Items (Self):', userJobItems);

        // Hierarchy Logic
        const hasHierarchy = jobs.some(j => j.ParentItemName);
        console.log('Has Hierarchy:', hasHierarchy);

        let visibleJobs = [];
        let editableJobs = [];

        if (hasHierarchy) {
            const selfJobs = userJobItems;
            const directChildJobs = jobs
                .filter(j => {
                    const parentMatch = j.ParentItemName && selfJobs.includes(j.ParentItemName);
                    return parentMatch;
                })
                .map(j => j.ItemName);

            visibleJobs = [...new Set([...selfJobs, ...directChildJobs])];
        } else {
            console.log('Using Classic/Legacy Mode');
            if (userHasLeadAccess) {
                visibleJobs = jobs.map(j => j.ItemName);
                editableJobs = leadJobItem ? [leadJobItem] : [];
            } else {
                visibleJobs = userJobItems;
                editableJobs = userJobItems;
            }
        }

        console.log('Final Visible Jobs:', visibleJobs);
        console.log('Is "Plumbing & FF" visible?', visibleJobs.includes("Plumbing & FF"));

    } catch (err) {
        console.error(err);
    } finally {
        await sql.close();
    }
}

debugPricingLogic();

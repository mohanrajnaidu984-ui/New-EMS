const { sql, connectDB } = require('./dbConfig');

async function debugPending() {
    try {
        await connectDB();
        const userEmail = 'maintenance1@almoayyedcg.com';

        // 1. Get User Details
        const userRes = await sql.query`SELECT FullName, Roles, Department FROM Master_ConcernedSE WHERE EmailId = ${userEmail}`;
        const user = userRes.recordset[0];
        const userFullName = user ? user.FullName : '';
        const userDepartment = user && user.Department ? user.Department.toLowerCase().trim() : '';
        const isAdmin = user && user.Roles === 'Admin';

        console.log('User:', { userEmail, userFullName, userDepartment, isAdmin });

        // 2. Fetch Enquiries
        const enquiriesRes = await sql.query`
            SELECT 
                E.RequestNo, E.ProjectName, E.CustomerName, E.Status, E.CreatedBy
            FROM EnquiryMaster E
            WHERE E.Status IN ('Open', 'Enquiry', 'Priced', 'Estimated', 'Quote') OR E.Status IS NULL OR E.Status = ''
            ORDER BY E.DueDate DESC, E.RequestNo DESC
        `;
        const enquiries = enquiriesRes.recordset;
        console.log(`Found ${enquiries.length} potential enquiries`);

        const requestNos = enquiries.map(e => e.RequestNo);
        if (requestNos.length === 0) return;
        const requestNosList = requestNos.map(r => `'${r.replace(/'/g, "''")}'`).join(',');

        // 3. Fetch Jobs
        const jobsRes = await sql.query(`
            SELECT 
                EF.RequestNo, EF.ID, EF.ParentID, EF.ItemName,
                MEF.CommonMailIds, MEF.CCMailIds
            FROM EnquiryFor EF
            LEFT JOIN Master_EnquiryFor MEF ON (EF.ItemName = MEF.ItemName OR EF.ItemName LIKE '% - ' + MEF.ItemName)
            WHERE EF.RequestNo IN (${requestNosList})
        `);
        const allJobs = jobsRes.recordset;

        // 4. Fetch Prices
        const pricesRes = await sql.query(`
            SELECT RequestNo, OptionID, EnquiryForID, EnquiryForItem, Price
            FROM EnquiryPricingValues
            WHERE RequestNo IN (${requestNosList})
        `);
        const allPrices = pricesRes.recordset;

        const report = [];

        enquiries.forEach(enq => {
            const enqJobs = allJobs.filter(j => j.RequestNo == enq.RequestNo);
            const enqPrices = allPrices.filter(p => p.RequestNo == enq.RequestNo);

            let myJobs = [];
            enqJobs.forEach(job => {
                const emails = [job.CommonMailIds, job.CCMailIds].filter(Boolean).join(',');
                const emailsLower = emails.toLowerCase();
                const userEmailLower = userEmail.toLowerCase();
                const userEmailUsername = userEmailLower.split('@')[0];

                const isMatch = emailsLower.includes(userEmailLower) ||
                    emailsLower.split(',').some(e => e.trim() === userEmailUsername) ||
                    (userDepartment && job.ItemName.toLowerCase().trim().includes(userDepartment)) ||
                    (userFullName && emailsLower.includes(userFullName.toLowerCase()));

                if (isMatch) {
                    if (!myJobs.find(x => x.ID === job.ID)) {
                        myJobs.push(job);
                    }
                }
            });

            if (myJobs.length === 0) {
                // Not assigned to this user
                return;
            }

            // Check if pending
            let hasPrice = false;
            const myJobIds = new Set(myJobs.map(j => j.ID));
            const myJobNames = new Set(myJobs.map(j => j.ItemName));

            let pricingFound = [];

            for (const priceValue of enqPrices) {
                let belongsToMyJob = false;
                if (priceValue.EnquiryForID && priceValue.EnquiryForID != 0 && priceValue.EnquiryForID != '0') {
                    belongsToMyJob = myJobIds.has(priceValue.EnquiryForID);
                } else {
                    belongsToMyJob = priceValue.EnquiryForItem && myJobNames.has(priceValue.EnquiryForItem);
                }

                if (belongsToMyJob && priceValue.Price && priceValue.Price > 0) {
                    hasPrice = true;
                    pricingFound.push({ job: priceValue.EnquiryForItem || priceValue.EnquiryForID, price: priceValue.Price });
                }
            }

            report.push({
                RequestNo: enq.RequestNo,
                ProjectName: enq.ProjectName,
                MyJobs: myJobs.map(j => j.ItemName),
                IsPending: !hasPrice,
                PricingFound: pricingFound
            });
        });

        console.log('--- PENDING REPORT ---');
        console.log(JSON.stringify(report, null, 2));

    } catch (err) {
        console.error(err);
    } finally {
        await sql.close();
    }
}

debugPending();

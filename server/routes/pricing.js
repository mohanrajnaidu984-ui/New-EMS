// Pricing Module API Routes
const express = require('express');
const router = express.Router();
const sql = require('mssql');
const fs = require('fs');
const path = require('path');

// Debug log file
const debugLogPath = path.join(__dirname, 'pricing_debug.log');
function logToFile(message) {
    const timestamp = new Date().toISOString();
    fs.appendFileSync(debugLogPath, `[${timestamp}] ${message}\n`);
}

// Helper to get Enquiry List with Pricing Tree
async function getEnquiryPricingList(userEmail, search = null, pendingOnly = true) {
    if (!userEmail) return [];

    // 1. Get User Details
    const userRes = await sql.query`SELECT FullName, Roles FROM Master_ConcernedSE WHERE EmailId = ${userEmail}`;
    const user = userRes.recordset[0];
    const userFullName = user ? user.FullName : '';
    const isAdmin = user && user.Roles === 'Admin';

    // 2. Fetch Enquiries
    const request = new sql.Request();
    let baseQuery = `
        SELECT 
            E.RequestNo, E.ProjectName, E.CustomerName, E.ClientName, E.ConsultantName, E.DueDate, E.Status, E.CreatedBy, E.EnquiryDate
        FROM EnquiryMaster E
        WHERE 1=1
    `;


    if (pendingOnly) {
        baseQuery += ` AND (E.Status IN ('Open', 'Enquiry', 'Priced', 'Estimated', 'Quote') OR E.Status IS NULL OR E.Status = '') `;
    }

    if (search) {
        baseQuery += ` AND (E.RequestNo LIKE @search OR E.ProjectName LIKE @search OR E.CustomerName LIKE @search OR E.ClientName LIKE @search OR E.ConsultantName LIKE @search) `;
        request.input('search', sql.NVarChar, `%${search}%`);
    }

    baseQuery += ` ORDER BY E.DueDate DESC, E.RequestNo DESC `;

    const enquiriesRes = await request.query(baseQuery);
    const enquiries = enquiriesRes.recordset;

    if (enquiries.length === 0) return [];

    const requestNos = enquiries.map(e => e.RequestNo);
    const requestNosList = requestNos.map(r => `'${r.replace(/'/g, "''")}'`).join(',');

    // 3. Fetch Concerned SE
    let concernedRequestNos = new Set();
    if (userFullName) {
        const cseReq = new sql.Request();
        cseReq.input('userFullName', sql.NVarChar, userFullName);
        const cseRes = await cseReq.query(`SELECT RequestNo FROM ConcernedSE WHERE SEName = @userFullName AND RequestNo IN (${requestNosList})`);
        cseRes.recordset.forEach(row => concernedRequestNos.add(row.RequestNo));
    }


    // 4. Fetch Jobs
    const jobsRes = await sql.query(`
        SELECT 
            EF.RequestNo, EF.ID, EF.ParentID, EF.ItemName, 
            MEF.CommonMailIds, MEF.CCMailIds
        FROM EnquiryFor EF
        LEFT JOIN Master_EnquiryFor MEF ON (EF.ItemName = MEF.ItemName OR EF.ItemName LIKE '% - ' + MEF.ItemName)
        WHERE EF.RequestNo IN (${requestNosList})
    `);
    const allJobs = jobsRes.recordset;

    // 5. Fetch Pricing Options (to know what needs to be priced)
    const optionsRes = await sql.query(`
        SELECT RequestNo, ID as OptionID, OptionName, ItemName, CustomerName, LeadJobName
        FROM EnquiryPricingOptions
        WHERE RequestNo IN (${requestNosList})
    `);
    const allOptions = optionsRes.recordset;

    // 6. Fetch Prices
    const pricesRes = await sql.query(`
        SELECT RequestNo, OptionID, EnquiryForID, EnquiryForItem, Price, UpdatedAt
        FROM EnquiryPricingValues
        WHERE RequestNo IN (${requestNosList})
    `);
    const allPrices = pricesRes.recordset;

    // 7. Map and Process
    return enquiries.map(enq => {
        const enqJobsRaw = allJobs.filter(j => j.RequestNo == enq.RequestNo);
        const seenIds = new Set();
        const enqJobs = [];
        for (const job of enqJobsRaw) {
            if (!seenIds.has(job.ID)) {
                seenIds.add(job.ID);
                enqJobs.push(job);
            }
        }

        const enqOptions = allOptions.filter(o => o.RequestNo == enq.RequestNo);
        const enqPrices = allPrices.filter(p => p.RequestNo == enq.RequestNo);

        let myJobs = [];
        const isCreator = userFullName && enq.CreatedBy && userFullName.toLowerCase().trim() === enq.CreatedBy.toLowerCase().trim();
        const isConcernedSE = concernedRequestNos.has(enq.RequestNo);

        if (isAdmin) {
            myJobs = enqJobs;
        } else {
            // Check assignments
            enqJobs.forEach(job => {
                const emails = [job.CommonMailIds, job.CCMailIds].filter(Boolean).join(',');
                const emailsLower = emails.toLowerCase();
                const userEmailLower = userEmail.toLowerCase();

                // Extract username from email (part before @)
                const userEmailUsername = userEmailLower.split('@')[0];

                // Match if either full email or username is found
                const isMatch = emailsLower.includes(userEmailLower) ||
                    emailsLower.split(',').some(e => e.trim() === userEmailUsername);

                console.log(`[Pricing] Job "${job.ItemName}" - Emails: "${emails}" - Match: ${isMatch}`);

                if (isMatch) {
                    if (!myJobs.find(x => x.ID === job.ID)) {
                        myJobs.push(job);
                    }
                }
            });
        }


        if (myJobs.length === 0) {
            console.log(`[Pricing] Enquiry ${enq.RequestNo} filtered out - no matching jobs for user ${userEmail}`);
            console.log(`[Pricing]   Total jobs in enquiry: ${enqJobs.length}`);
            console.log(`[Pricing]   User is admin: ${isAdmin}, is creator: ${isCreator}, is concerned SE: ${isConcernedSE}`);
            return null;
        }

        // Recursively build visible set
        let visibleJobs = new Set();
        let queue = [...myJobs];
        let processed = new Set();
        while (queue.length > 0) {
            const currentJob = queue.pop();
            if (processed.has(currentJob.ID)) continue;
            processed.add(currentJob.ID);
            visibleJobs.add(currentJob.ID);
            const children = enqJobs.filter(child => child.ParentID === currentJob.ID);
            children.forEach(c => { if (!processed.has(c.ID)) queue.push(c); });
        }

        // Build Display String
        const childrenMap = {};
        enqJobs.forEach(j => {
            if (j.ParentID) {
                if (!childrenMap[j.ParentID]) childrenMap[j.ParentID] = [];
                childrenMap[j.ParentID].push(j);
            }
        });

        const allVisibleJobs = enqJobs.filter(j => visibleJobs.has(j.ID)).sort((a, b) => a.ID - b.ID);
        const visualRoots = allVisibleJobs.filter(j => !j.ParentID || !visibleJobs.has(j.ParentID));

        const flatList = [];
        const traverse = (job, level) => {
            flatList.push({ ...job, level });
            const children = childrenMap[job.ID] || [];
            children.sort((a, b) => a.ID - b.ID);
            children.forEach(child => { if (visibleJobs.has(child.ID)) traverse(child, level + 1); });
        };

        visualRoots.forEach(root => traverse(root, 0));

        // CORRECT LOGIC: An enquiry is pending for a division if NONE of the customers have prices entered
        // Once AT LEAST ONE customer has a price > 0 for the division, it's NOT pending
        let hasPendingItems = true; // Assume pending until we find at least one valid price

        // Get IDs and names of user's assigned jobs
        const myJobIds = new Set(myJobs.map(j => j.ID));
        const myJobNames = new Set(myJobs.map(j => j.ItemName));

        console.log(`[Pricing] Enquiry ${enq.RequestNo} - Checking pending for user jobs:`, Array.from(myJobNames));
        logToFile(`Enquiry ${enq.RequestNo} - Checking pending for user jobs: ${JSON.stringify(Array.from(myJobNames))}`);

        // Strategy: Check if there's AT LEAST ONE price value > 0 for the user's jobs
        // If we find even one valid price, the enquiry is NOT pending for this division

        // If user has no jobs in this enquiry, it's not pending for them
        if (myJobs.length === 0) {
            hasPendingItems = false;
        } else {
            for (const priceValue of enqPrices) {
                // Check if this price value belongs to one of the user's jobs
                const belongsToMyJob =
                    (priceValue.EnquiryForID && myJobIds.has(priceValue.EnquiryForID)) ||
                    (priceValue.EnquiryForItem && myJobNames.has(priceValue.EnquiryForItem));

                if (belongsToMyJob && priceValue.Price && priceValue.Price > 0) {
                    // Found at least one valid price for the user's division - NOT pending!
                    console.log(`[Pricing] Enquiry ${enq.RequestNo} - ✓ NOT PENDING: Found price ${priceValue.Price} for job (OptionID: ${priceValue.OptionID})`);
                    logToFile(`Enquiry ${enq.RequestNo} - ✓ NOT PENDING: Found price ${priceValue.Price} for job (OptionID: ${priceValue.OptionID})`);
                    hasPendingItems = false;
                    break; // Found a valid price, no need to check further
                }
            }
        }

        // If we didn't find any valid prices (and they have jobs), log it as pending
        if (hasPendingItems) {
            console.log(`[Pricing] Enquiry ${enq.RequestNo} - ⚠️ PENDING: No prices found for user's division`);
            logToFile(`Enquiry ${enq.RequestNo} - ⚠️ PENDING: No prices found for user's division`);
        }

        const displayItems = flatList.map(job => {
            const priceRow = enqPrices.find(p => p.EnquiryForID === job.ID || p.EnquiryForItem === job.ItemName);
            const priceVal = priceRow ? priceRow.Price : 0;
            const updatedAt = priceRow ? priceRow.UpdatedAt : null;
            return `${job.ItemName}|${priceVal > 0 ? priceVal : 'Not Updated'}|${updatedAt ? new Date(updatedAt).toISOString() : ''}|${job.level || 0}`;
        });

        // Filter for Pending View
        // Show ONLY if there are pending items in user's division
        if (pendingOnly && !hasPendingItems) {
            console.log(`[Pricing] Enquiry ${enq.RequestNo} filtered out - all prices entered for user's division (Status: ${enq.Status})`);
            logToFile(`Enquiry ${enq.RequestNo} filtered out - all prices entered for user's division (Status: ${enq.Status})`);
            return null;
        }

        return {
            ...enq,
            SubJobPrices: displayItems.join(';;')
        };
    }).filter(Boolean);
}

// GET /api/pricing/list/pending
router.get('/list/pending', async (req, res) => {
    try {
        const { userEmail } = req.query;
        console.log('Pending Pricing (Helper) requested for:', userEmail);
        const result = await getEnquiryPricingList(userEmail, null, true);
        res.json(result);
    } catch (err) {
        console.error('Error fetching pending pricing:', err);
        res.status(500).json({ error: 'Failed' });
    }
});

// GET /api/pricing/list - New Generic List with Search
router.get('/list', async (req, res) => {
    try {
        const { userEmail, search, pendingOnly } = req.query;
        console.log('Pricing List Search:', { search, userEmail });
        const isPendingOnly = pendingOnly === 'true';
        const result = await getEnquiryPricingList(userEmail, search, isPendingOnly);
        res.json(result);
    } catch (err) {
        console.error('Error searching pricing list:', err);
        res.status(500).json({ error: 'Search failed' });
    }
});

// GET /api/pricing/search-customers?q=term
router.get('/search-customers', async (req, res) => {
    try {
        const query = req.query.q || '';
        if (!query || query.length < 2) {
            return res.json([]);
        }

        const term = `%${query}%`;

        // Search in all 3 master tables
        const result = await sql.query`
            SELECT TOP 10 CompanyName FROM Master_CustomerName WHERE CompanyName LIKE ${term}
            UNION
            SELECT TOP 10 CompanyName FROM Master_ClientName WHERE CompanyName LIKE ${term}
            UNION
            SELECT TOP 10 CompanyName FROM Master_ConsultantName WHERE CompanyName LIKE ${term}
        `;

        // Extract unique names
        const names = [...new Set(result.recordset.map(r => r.CompanyName))];
        res.json(names);

    } catch (err) {
        console.error('Error searching customers:', err);
        res.status(500).json({ error: 'Search failed' });
    }
});

// GET /api/pricing/:requestNo - Get pricing grid for an enquiry
router.get('/:requestNo', async (req, res) => {
    try {
        const { requestNo } = req.params;
        const userEmail = req.query.userEmail || '';

        console.log('Pricing API: Loading pricing for', requestNo, 'user:', userEmail);

        // Get enquiry details including CreatedBy
        let enquiry;
        try {
            const enquiryResult = await sql.query`
                SELECT RequestNo, ProjectName, CreatedBy, CustomerName, ClientName, ConsultantName
                FROM EnquiryMaster 
                WHERE RequestNo = ${requestNo}
            `;

            if (enquiryResult.recordset.length === 0) {
                console.log('Pricing API: Enquiry not found:', requestNo);
                return res.status(404).json({ error: 'Enquiry not found' });
            }
            enquiry = enquiryResult.recordset[0];
            console.log('Pricing API: Found enquiry:', enquiry.RequestNo);
        } catch (err) {
            console.error('Error querying EnquiryMaster:', err);
            throw err;
        }

        // Get EnquiryFor items (jobs/columns)
        let jobs = [];
        try {
            const jobsResult = await sql.query`
                SELECT 
                    ef.ID, ef.ParentID, ef.ItemName, 
                    mef.CommonMailIds, mef.CCMailIds, mef.CompanyLogo,
                    mef.DepartmentName, mef.CompanyName, mef.Address, mef.Phone, mef.FaxNo
                FROM EnquiryFor ef
                LEFT JOIN Master_EnquiryFor mef ON (ef.ItemName = mef.ItemName OR ef.ItemName LIKE '% - ' + mef.ItemName)
                WHERE ef.RequestNo = ${requestNo}
                ORDER BY ef.ID ASC
            `;

            // Polyfill ParentItemName in JS since it's missing from DB
            const rawJobsAll = jobsResult.recordset;
            // Deduplicate (Fix for Join Cartesian Product)
            const seenJobIds = new Set();
            const rawJobs = [];
            for (const j of rawJobsAll) {
                if (!seenJobIds.has(j.ID)) {
                    seenJobIds.add(j.ID);
                    rawJobs.push(j);
                }
            }

            jobs = rawJobs.map(job => {
                const parent = rawJobs.find(p => p.ID === job.ParentID);
                return {
                    ...job,
                    ParentItemName: parent ? parent.ItemName : null
                };
            });

            console.log('Pricing API: Found', jobs.length, 'jobs');
        } catch (err) {
            console.error('Error querying EnquiryFor:', err);
            throw err;
        }

        // Fetch additional customers from EnquiryCustomer table
        let extraCustomers = [];
        try {
            const extraRes = await sql.query`
                SELECT CustomerName 
                FROM EnquiryCustomer 
                WHERE RequestNo = ${requestNo}
            `;
            extraCustomers = extraRes.recordset;
        } catch (err) {
            console.error('Error fetching extra customers:', err);
        }

        // Identify Lead Job (First item)
        const leadJobItem = jobs.length > 0 ? jobs[0].ItemName : null;

        // Get active customer for initial selection only
        let activeCustomerName = req.query.customerName;
        // Logic to default (keep existing logic but use it just for frontend default)
        if (!activeCustomerName) {
            const rawCust = enquiry.CustomerName || '';
            activeCustomerName = rawCust.split(',')[0].trim();
        }

        // Get list of customers from DB (for tabs)
        let customers = [];
        try {
            const customerResult = await sql.query`
                SELECT DISTINCT CustomerName 
                FROM EnquiryPricingOptions 
                WHERE RequestNo = ${requestNo} 
                AND CustomerName IS NOT NULL
            `;
            customers = customerResult.recordset.map(row => row.CustomerName);
        } catch (err) {
            console.error('Error fetching customers:', err);
        }

        let excludedNames = new Set();


        // Determine user access (MOVED UP)
        let userHasLeadAccess = false;
        let userJobItems = [];
        let userRole = '';
        let userFullName = '';

        if (userEmail) {
            try {
                const userResult = await sql.query`
                    SELECT FullName, Roles FROM Master_ConcernedSE WHERE EmailId = ${userEmail}
                `;
                if (userResult.recordset.length > 0) {
                    userFullName = userResult.recordset[0].FullName || '';
                    userRole = userResult.recordset[0].Roles || '';
                }
            } catch (err) {
                console.error('Error getting user name:', err);
            }

            // Check if user is the creator (Lead Job owner) or Admin
            const isAdmin = userRole === 'Admin';
            if (isAdmin) {
                userHasLeadAccess = true;
                userJobItems = jobs.map(j => j.ItemName);
            }

            // Also check email-based access
            jobs.forEach(job => {
                const commonMails = (job.CommonMailIds || '').toLowerCase().split(',').map(s => s.trim());
                const ccMails = (job.CCMailIds || '').toLowerCase().split(',').map(s => s.trim());
                const allMails = [...commonMails, ...ccMails];

                if (allMails.includes(userEmail.toLowerCase())) {
                    if (!userJobItems.includes(job.ItemName)) {
                        userJobItems.push(job.ItemName);
                    }
                    if (job.ItemName === leadJobItem) {
                        // If explicitly assigned to Lead, treat as Lead Access
                        userHasLeadAccess = true;
                    }
                }
            });

            // SMART SCOPE EXPANSION:
            const cleanUserScopes = new Set(userJobItems.map(name =>
                name.replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim().toLowerCase()
            ));

            jobs.forEach(job => {
                const cleanName = job.ItemName.replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim().toLowerCase();
                if (cleanUserScopes.has(cleanName)) {
                    if (!userJobItems.includes(job.ItemName)) {
                        userJobItems.push(job.ItemName);
                    }
                }
            });
        }

        // FILTER: Scope Customers based on User Role
        if (leadJobItem && jobs.length > 0) {
            const clean = (name) => name ? name.replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim() : '';
            const leadJob = jobs.find(j => j.ItemName === leadJobItem);

            if (leadJob) {
                const findDescendants = (parentId, set) => {
                    const children = jobs.filter(j => j.ParentID === parentId);
                    children.forEach(c => {
                        set.add(clean(c.ItemName));
                        set.add(c.ItemName); // Add raw too
                        findDescendants(c.ID, set);
                    });
                };

                if (userHasLeadAccess) {
                    // LEAD / ADMIN: Exclude Lead Job (Self) AND All Descendants (Sub-jobs)
                    // Because a Lead Job should only see External Customers.
                    excludedNames.add(clean(leadJobItem));
                    excludedNames.add(leadJobItem);
                    findDescendants(leadJob.ID, excludedNames);
                } else {
                    // SUB-JOB USER: Exclude Self (Assigned Jobs) AND Descendants of Assigned Jobs.
                    // Do NOT exclude Lead Job (Parent), as it is a valid internal customer for them.
                    userJobItems.forEach(jobName => {
                        const jobObj = jobs.find(j => j.ItemName === jobName);
                        if (jobObj) {
                            excludedNames.add(clean(jobName));
                            excludedNames.add(jobName);
                            findDescendants(jobObj.ID, excludedNames);
                        }
                    });
                }

                if (excludedNames.size > 0) {
                    const excluded = [...excludedNames];
                    console.log('Pricing API: Filtering out internal/descendant customers:', excluded);
                    customers = customers.filter(c => !excludedNames.has(clean(c)) && !excludedNames.has(c));
                }
            }
        }

        // Get pricing options (ALL customers)
        let options = [];
        try {
            const optionsResult = await sql.query`
                SELECT ID, OptionName, SortOrder, ItemName, CustomerName, LeadJobName
                FROM EnquiryPricingOptions 
                WHERE RequestNo = ${requestNo}
                ORDER BY SortOrder ASC, ID ASC
            `;
            options = optionsResult.recordset;

            // Deduplicate Options (Backend Fix)
            // Sometimes joins or legacy data cause duplicates.
            const seenOptions = new Set();
            options = options.filter(o => {
                const key = `${o.OptionName}|${o.ItemName}|${o.CustomerName}`;
                if (seenOptions.has(key)) return false;
                seenOptions.add(key);
                return true;
            });

            console.log('Pricing API: Found', options.length, 'options (unique)');
        } catch (err) {
            console.error('Error querying EnquiryPricingOptions:', err);
            throw err;
        }

        // Get pricing values (ALL customers)
        let values = [];
        try {
            const valuesResult = await sql.query`
                SELECT OptionID, EnquiryForItem, EnquiryForID, Price, UpdatedBy, UpdatedAt, CustomerName, LeadJobName
                FROM EnquiryPricingValues 
                WHERE RequestNo = ${requestNo}
            `;
            values = valuesResult.recordset;
            console.log('Pricing API: Found', values.length, 'values (total)');
        } catch (err) {
            console.error('Error querying EnquiryPricingValues:', err);
            throw err;
        }

        // Create value lookup map -> REMOVED (Sending raw array to frontend to handle multi-customer collision)
        // const valueMap = {};
        // values.forEach(v => {
        //     const key = v.EnquiryForID ? `${v.OptionID}_${v.EnquiryForID}` : `${v.OptionID}_${v.EnquiryForItem}`;
        //     valueMap[key] = v;
        // });




        // Determine visible and editable jobs
        // HIERARCHY LOGIC IMPLEMENTATION
        let visibleJobs = [];
        let editableJobs = [];

        // 1. EDIT PERMISSIONS (Strict)
        let visibleJobIds, editableJobIds;
        if (userRole === 'Admin') {
            editableJobs = jobs.map(j => j.ItemName);
        } else {
            // Default: Edit what you are assigned (Email matched)
            editableJobs = [...userJobItems];

            // NOTE: Creators do NOT get implicit edit access to Lead Job anymore.
            // They must be explicitly assigned to the Lead Job (via Email/Master) to edit it.
            // This prevents Generic Creators (e.g. 'BMS') from editing 'Civil' Lead Jobs inadvertently.
        }

        // 2. VIEW PERMISSIONS (Tree / Global)
        const isCreator = (enquiry.CreatedBy && userFullName && enquiry.CreatedBy.toLowerCase().trim() === userFullName.toLowerCase().trim());

        // FIX: Removed 'isCreator' from Manager Access. 
        // Creators are no longer treated as Super Users for View. They see only their assigned hierarchy.
        const isManager = userRole === 'Admin' || userHasLeadAccess;

        if (isManager) {
            console.log('Pricing API: Manager Access -> View All');
            visibleJobs = jobs.map(j => j.ItemName);
        } else {
            // Standard User: View Assigned + Descendants
            // Fallback: If Creator has NO assignments, should we show everything or nothing?
            // Strict approach: Show nothing (or let them add themselves).
            // But to avoid "Blank Screen" confusion for unassigned Creators, we can grant Lead access IF generic?
            // User Request was explicit: "Access ONLY View BMS". This implies strictness.

            // ID-Based Traversal for Robustness
            const selfJobIds = jobs.filter(j => userJobItems.includes(j.ItemName)).map(j => j.ID);

            const getAllDescendantIds = (parentIds, allJobs) => {
                let descendantIds = [];
                let queue = [...parentIds];
                let processed = new Set();

                while (queue.length > 0) {
                    const currentId = queue.pop();
                    if (processed.has(currentId)) continue;
                    processed.add(currentId);

                    const children = allJobs.filter(j => j.ParentID === currentId);
                    children.forEach(c => {
                        descendantIds.push(c.ID);
                        queue.push(c.ID);
                    });
                }
                return descendantIds;
            };

            const descendantIds = getAllDescendantIds(selfJobIds, jobs);
            const allVisibleIds = new Set([...selfJobIds, ...descendantIds]);

            visibleJobs = jobs.filter(j => allVisibleIds.has(j.ID)).map(j => j.ItemName);
            visibleJobIds = allVisibleIds; // ID Set
            // FIX: Allow editing of ALL Assignee descendants
            const allEditableIds = new Set([...selfJobIds, ...descendantIds]);
            editableJobIds = allEditableIds;
            editableJobs = jobs.filter(j => allEditableIds.has(j.ID)).map(j => j.ItemName);

        }

        console.log('Final Visible:', visibleJobs);
        console.log('Final Editable:', editableJobs);

        console.log('Pricing API: Sending Response with jobs:', JSON.stringify(jobs.map(j => ({ name: j.ItemName, logo: j.CompanyLogo })), null, 2));
        res.json({
            enquiry: {
                requestNo: enquiry.RequestNo,
                projectName: enquiry.ProjectName,
                createdBy: enquiry.CreatedBy,
                customerName: enquiry.CustomerName,
                clientName: enquiry.ClientName,
                consultantName: enquiry.ConsultantName
            },
            extraCustomers: extraCustomers
                .map(c => c.CustomerName)
                .filter(name => {
                    const cleanName = name.replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim();
                    return !excludedNames.has(name) && !excludedNames.has(cleanName);
                }),
            customers: customers,
            activeCustomer: (activeCustomerName && (excludedNames.has(activeCustomerName) || excludedNames.has(activeCustomerName.replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim())))
                ? (customers.length > 0 ? customers[0] : '')
                : activeCustomerName,
            leadJob: leadJobItem,
            jobs: jobs.map(j => ({
                id: j.ID,
                parentId: j.ParentID,
                itemName: j.ItemName,
                companyLogo: j.CompanyLogo ? j.CompanyLogo.replace(/\\/g, '/') : null,
                departmentName: j.DepartmentName,
                companyName: j.CompanyName,
                address: j.Address,
                phone: j.Phone,
                fax: j.FaxNo,
                email: j.CommonMailIds,
                isLead: j.ItemName === leadJobItem,
                visible: typeof visibleJobIds !== 'undefined' ? visibleJobIds.has(j.ID) : visibleJobs.includes(j.ItemName),
                editable: typeof editableJobIds !== 'undefined' ? editableJobIds.has(j.ID) : editableJobs.includes(j.ItemName)
            })),
            options: options.map(o => ({
                id: o.ID,
                name: o.OptionName,
                sortOrder: o.SortOrder,
                itemName: o.ItemName,
                customerName: o.CustomerName, // Expose CustomerName
                leadJobName: o.LeadJobName    // Expose LeadJobName
            })),
            values: values,
            access: {
                hasLeadAccess: userHasLeadAccess,
                visibleJobs: visibleJobs,
                editableJobs: editableJobs
            }
        });

    } catch (err) {
        console.error('Error fetching pricing:', err.message, err.stack);
        res.status(500).json({ error: 'Failed to fetch pricing data: ' + err.message });
    }
});

// POST /api/pricing/option - Add a new pricing option (row)
router.post('/option', async (req, res) => {
    try {
        const { requestNo, optionName, itemName, customerName, leadJobName } = req.body; // Accept leadJobName (Step 1013)

        if (!requestNo || !optionName) {
            return res.status(400).json({ error: 'RequestNo and optionName are required' });
        }

        // Atomic Insert with LeadJob scoped uniqueness
        const result = await sql.query`
            IF NOT EXISTS (
                SELECT 1 FROM EnquiryPricingOptions 
                WHERE RequestNo = ${requestNo}
                AND OptionName = ${optionName}
                AND (ItemName = ${itemName || null} OR (ItemName IS NULL AND ${itemName || null} IS NULL))
                AND (CustomerName = ${customerName || null} OR (CustomerName IS NULL AND ${customerName || null} IS NULL))
                AND (LeadJobName = ${leadJobName || null} OR (LeadJobName IS NULL AND ${leadJobName || null} IS NULL))
            )
            BEGIN
                INSERT INTO EnquiryPricingOptions (RequestNo, OptionName, SortOrder, ItemName, CustomerName, LeadJobName)
                OUTPUT INSERTED.ID, INSERTED.OptionName, INSERTED.SortOrder, INSERTED.ItemName, INSERTED.CustomerName, INSERTED.LeadJobName
                VALUES (${requestNo}, ${optionName}, 
                        (SELECT ISNULL(MAX(SortOrder), 0) + 1 FROM EnquiryPricingOptions WHERE RequestNo = ${requestNo} AND (CustomerName = ${customerName || null} OR (CustomerName IS NULL AND ${customerName || null} IS NULL))),
                        ${itemName || null}, 
                        ${customerName || null},
                        ${leadJobName || null})
            END
            ELSE
            BEGIN
                SELECT ID, OptionName, SortOrder, ItemName, CustomerName, LeadJobName
                FROM EnquiryPricingOptions 
                WHERE RequestNo = ${requestNo}
                AND OptionName = ${optionName}
                AND (ItemName = ${itemName || null} OR (ItemName IS NULL AND ${itemName || null} IS NULL))
                AND (CustomerName = ${customerName || null} OR (CustomerName IS NULL AND ${customerName || null} IS NULL))
                AND (LeadJobName = ${leadJobName || null} OR (LeadJobName IS NULL AND ${leadJobName || null} IS NULL))
            END
        `;

        res.json({
            success: true,
            option: result.recordset[0]
        });

    } catch (err) {
        console.error('Error adding option:', err);
        res.status(500).json({ error: 'Failed to add option' });
    }
});

// PUT /api/pricing/value - Update a pricing cell value
router.put('/value', async (req, res) => {
    try {
        const { requestNo, optionId, enquiryForItem, enquiryForId, price, updatedBy, customerName, leadJobName } = req.body;

        if (!requestNo || !optionId) {
            return res.status(400).json({ error: 'Missing required fields' });
        }


        const priceValue = parseFloat(price) || 0;

        // Reject negative values (Allow 0 to reset/clear price)
        if (priceValue < 0) {
            return res.status(400).json({ error: 'Price cannot be negative', skipped: true });
        }

        // --- UPSERT LOGIC WITH ID SUPPORT ---

        let existingResult;

        if (enquiryForId) {
            // New strict check by ID
            existingResult = await sql.query`
                SELECT ID FROM EnquiryPricingValues 
                WHERE RequestNo = ${requestNo} 
                AND OptionID = ${optionId} 
                AND EnquiryForID = ${enquiryForId}
                AND (CustomerName = ${customerName} OR (CustomerName IS NULL AND ${customerName || null} IS NULL))
            `;
        } else {
            // Legacy check by Name
            existingResult = await sql.query`
                SELECT ID FROM EnquiryPricingValues 
                WHERE RequestNo = ${requestNo} 
                AND OptionID = ${optionId} 
                AND EnquiryForItem = ${enquiryForItem}
                AND (CustomerName = ${customerName} OR (CustomerName IS NULL AND ${customerName || null} IS NULL))
            `;
        }


        const now = new Date();
        if (existingResult.recordset.length > 0) {
            // Update
            const recordId = existingResult.recordset[0].ID;
            await sql.query`
                UPDATE EnquiryPricingValues 
                SET Price = ${priceValue}, UpdatedBy = ${updatedBy}, UpdatedAt = ${now},
                    EnquiryForID = ${enquiryForId || null},
                    LeadJobName = ${leadJobName || null}, -- Update Lead Job Name (Step 1078)
                    CustomerName = ${customerName || null} -- FIX: Ensure CustomerName is backfilled/corrected
                WHERE ID = ${recordId}
            `;
        } else {
            // Insert
            await sql.query`
                INSERT INTO EnquiryPricingValues (RequestNo, OptionID, EnquiryForItem, EnquiryForID, Price, UpdatedBy, CustomerName, LeadJobName, UpdatedAt)
                VALUES (${requestNo}, ${optionId}, ${enquiryForItem}, ${enquiryForId || null}, ${priceValue}, ${updatedBy}, ${customerName || null}, ${leadJobName || null}, ${now})
            `;
        }

        res.json({ success: true });

    } catch (err) {
        console.error('Error updating value:', err);
        res.status(500).json({ error: 'Failed to update value' });
    }
});

// DELETE /api/pricing/option/:id - Delete an option row
router.delete('/option/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Delete associated values first
        await sql.query`DELETE FROM EnquiryPricingValues WHERE OptionID = ${id}`;

        // Delete the option
        await sql.query`DELETE FROM EnquiryPricingOptions WHERE ID = ${id}`;

        res.json({ success: true });

    } catch (err) {
        console.error('Error deleting option:', err);
        res.status(500).json({ error: 'Failed to delete option' });
    }
});

// PUT /api/pricing/option/:id - Rename an option
router.put('/option/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { optionName } = req.body;

        await sql.query`
            UPDATE EnquiryPricingOptions 
            SET OptionName = ${optionName}
            WHERE ID = ${id}
        `;

        res.json({ success: true });

    } catch (err) {
        console.error('Error renaming option:', err);
        res.status(500).json({ error: 'Failed to rename option' });
    }
});

// DELETE /api/pricing/customer - Delete all pricing data for a specific customer
router.delete('/customer', async (req, res) => {
    try {
        const { requestNo, customerName } = req.body;

        if (!requestNo || !customerName) {
            return res.status(400).json({ error: 'RequestNo and CustomerName are required' });
        }

        console.log(`Pricing API: Deleting customer ${customerName} for enquiry ${requestNo}`);

        // 1. Delete associated values
        await sql.query`
            DELETE FROM EnquiryPricingValues 
            WHERE RequestNo = ${requestNo} AND CustomerName = ${customerName}
        `;

        // 2. Delete options
        await sql.query`
            DELETE FROM EnquiryPricingOptions 
            WHERE RequestNo = ${requestNo} AND CustomerName = ${customerName}
        `;

        // 3. Remove from EnquiryCustomer (extra customers)
        await sql.query`
            DELETE FROM EnquiryCustomer 
            WHERE RequestNo = ${requestNo} AND CustomerName = ${customerName}
        `;

        res.json({ success: true });

    } catch (err) {
        console.error('Error deleting customer pricing:', err);
        res.status(500).json({ error: 'Failed to delete customer pricing' });
    }
});


module.exports = router;

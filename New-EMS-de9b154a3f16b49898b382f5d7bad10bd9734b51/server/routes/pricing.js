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
    const userRes = await sql.query`SELECT FullName, Roles, Department FROM Master_ConcernedSE WHERE EmailId = ${userEmail}`;
    const user = userRes.recordset[0];
    const userFullName = user ? user.FullName : '';
    const userDepartment = user && user.Department ? user.Department.toLowerCase().trim() : '';
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
            EF.RequestNo, EF.ID, EF.ParentID, EF.ItemName, EF.LeadJobCode,
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

                // Match if either full email or username is found OR job ItemName matches User Department
                const isMatch = emailsLower.includes(userEmailLower) ||
                    emailsLower.split(',').some(e => e.trim() === userEmailUsername) ||
                    (userDepartment && job.ItemName.toLowerCase().trim().includes(userDepartment)) ||
                    (userFullName && emailsLower.includes(userFullName.toLowerCase()));

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
            const currIdStr = String(currentJob.ID);
            if (processed.has(currIdStr)) continue;
            processed.add(currIdStr);
            visibleJobs.add(currIdStr);
            const children = enqJobs.filter(child => child.ParentID && String(child.ParentID) === currIdStr);
            children.forEach(c => { if (!processed.has(String(c.ID))) queue.push(c); });
        }

        // Build Display String
        const childrenMap = {};
        enqJobs.forEach(j => {
            if (j.ParentID && String(j.ParentID) !== '0') {
                const pidStr = String(j.ParentID);
                if (!childrenMap[pidStr]) childrenMap[pidStr] = [];
                childrenMap[pidStr].push(j);
            }
        });

        const allVisibleJobs = enqJobs.filter(j => visibleJobs.has(String(j.ID))).sort((a, b) => a.ID - b.ID);
        const visualRoots = allVisibleJobs.filter(j => !j.ParentID || String(j.ParentID) === '0' || !visibleJobs.has(String(j.ParentID)));

        const flatList = [];
        const traverse = (job, level) => {
            flatList.push({ ...job, level });
            const children = childrenMap[String(job.ID)] || [];
            children.sort((a, b) => a.ID - b.ID);
            children.forEach(child => { if (visibleJobs.has(String(child.ID))) traverse(child, level + 1); });
        };

        // Pre-Process Lead Job Codes (Step 3339): Sequence-based L-tags (L1, L2, L3...)
        const jobLeadMap = {};
        const roots = enqJobs.filter(j => !j.ParentID || String(j.ParentID) === '0');
        roots.sort((a, b) => a.ID - b.ID); // Sort roots by ID for consistent indexing
        
        const rootCodeMap = {};
        roots.forEach((r, idx) => {
            // Priority: Use existing L-code if it looks like L1, L2...
            const existing = (r.LeadJobCode || '').trim().toUpperCase();
            if (existing && existing.match(/^L\d+$/)) {
                rootCodeMap[r.ID] = existing;
            } else {
                rootCodeMap[r.ID] = `L${idx + 1}`;
            }
        });

        enqJobs.forEach(j => {
            let curr = j;
            let depth = 0;
            // Traverse up to find the root ancestor and its assigned L-code
            while (curr && !rootCodeMap[curr.ID] && curr.ParentID && curr.ParentID != '0' && depth < 20) {
                const parent = enqJobs.find(p => p.ID == curr.ParentID);
                if (!parent) break;
                curr = parent;
                depth++;
            }
            const resolvedCode = (curr && rootCodeMap[curr.ID]) ? rootCodeMap[curr.ID] : 'L1';
            jobLeadMap[j.ID] = resolvedCode;
        });

        visualRoots.forEach(root => traverse(root, 0));

        // CORRECT LOGIC: An enquiry is pending for a user if AT LEAST ONE of their assigned jobs has NO prices entered.
        // If a user is assigned to both HVAC and Electrical, and only Electrical is priced, 
        // the enquiry should still show as pending because HVAC still needs pricing.

        // 1. Identify which jobs in this enquiry have any valid price (> 0)
        const pricedJobIds = new Set();
        const pricedJobNames = new Set();
        enqPrices.forEach(p => {
            if (p.Price && p.Price > 0) {
                if (p.EnquiryForID) pricedJobIds.add(String(p.EnquiryForID));
                if (p.EnquiryForItem) pricedJobNames.add(p.EnquiryForItem.toLowerCase().trim());
            }
        });

        // 2. An enquiry is pending if ANY of the user's assigned jobs have NO price recorded
        let hasPendingItems = false;
        if (myJobs.length > 0) {
            for (const job of myJobs) {
                const isJobPriced = pricedJobIds.has(String(job.ID)) ||
                    pricedJobNames.has(job.ItemName.toLowerCase().trim());

                if (!isJobPriced) {
                    hasPendingItems = true;
                    console.log(`[Pricing] Enquiry ${enq.RequestNo} - ⚠️ PENDING: Job "${job.ItemName}" has no prices yet.`);
                    logToFile(`Enquiry ${enq.RequestNo} - ⚠️ PENDING: Job "${job.ItemName}" has no prices yet.`);
                    break; // One unpriced assigned job is enough to make it pending
                }
            }
        }

        if (!hasPendingItems) {
            console.log(`[Pricing] Enquiry ${enq.RequestNo} - ✓ NOT PENDING: All assigned jobs have at least one price.`);
            logToFile(`Enquiry ${enq.RequestNo} - ✓ NOT PENDING: All assigned jobs have at least one price.`);
        }

        // Build a quick map: optionId -> option row (for joining)
        const optionMap = {};
        enqOptions.forEach(o => { optionMap[o.OptionID] = o; });

        const jobMap = {};
        enqJobs.forEach(j => jobMap[j.ID] = j);

        const normalize = str => str.toLowerCase().replace(/[^a-z0-9]/g, '');
        const jobNameSetNorm = new Set(enqJobs.map(j => normalize(j.ItemName)));

        // Determine if ALL scoped jobs are subjobs (have a parent).
        const scopedAreSubjobs = myJobs.length > 0 &&
            myJobs.every(j => (j.ParentID && j.ParentID != '0' && j.ParentID != 0));

        const userDivisionKey = userEmail ? userEmail.split('@')[0].toLowerCase() : '';

        // Collect External Customers
        // Collect External Customers and Deduplicate
        const rawExternal = (enq.CustomerName || '').split(',').map(c => c.trim()).filter(Boolean);
        const externalCustomers = [];
        const normSet = new Set();

        rawExternal.forEach(c => {
            const norm = c.replace(/[.,\s]+$/, '').toLowerCase();
            if (!normSet.has(norm)) {
                externalCustomers.push(c);
                normSet.add(norm);
            }
        });

        // Collect Alternative (Option) Customers
        const optionCustomers = new Set();
        enqOptions.forEach(o => {
            if (o.CustomerName) {
                const c = o.CustomerName.trim();
                const norm = c.replace(/[.,\s]+$/, '').toLowerCase();
                if (!normSet.has(norm)) {
                    optionCustomers.add(c);
                    normSet.add(norm);
                }
            }
        });

        const rootJob = enqJobs.find(j => !j.ParentID || j.ParentID == '0' || j.ParentID == 0);
        const internalCustomer = rootJob ? rootJob.ItemName.trim() : 'Internal';

        // NEW LOGIC (Step 3176): Hybrid context based on assigned jobs
        const finalSet = new Set();
        const hasLeadJob = myJobs.some(j => !j.ParentID || j.ParentID == '0' || j.ParentID == 0);

        // 1. If user owns a lead job, show external customers (from Master + manually added external options)
        if (hasLeadJob) {
            externalCustomers.forEach(c => finalSet.add(c));
            optionCustomers.forEach(c => {
                const cNorm = normalize(c);
                if (!jobNameSetNorm.has(cNorm)) {
                    finalSet.add(c);
                }
            });
        }

        // 2. Identify parents of all sub-jobs user owns
        myJobs.forEach(j => {
            if (j.ParentID && j.ParentID != '0' && jobMap[j.ParentID]) {
                finalSet.add(jobMap[j.ParentID].ItemName);
            }
        });

        // 3. Fallback: If no customers found but user has jobs, use internalCustomer (root)
        if (finalSet.size === 0 && myJobs.length > 0) {
            finalSet.add(internalCustomer);
        }

        const finalCustomers = Array.from(finalSet).filter(c => {
            const cNorm = normalize(c);
            if (userDivisionKey && cNorm.includes(userDivisionKey)) return false;
            return true;
        });

        const fullCustomerName = finalCustomers.join(', ');

        const displayItems = [];

        const getDivisionPrice = (jobId, optionName) => {
            const job = jobMap[jobId];
            if (!job) return { price: 0, updatedAt: null };

            // 1. Determine Target Customer context (Internal Division logic)
            // If sub-job, look for price quoted to Parent. If root, look for price quoted to Main Customer.
            let targetCust = '';
            if (job.ParentID && jobMap[job.ParentID]) {
                targetCust = jobMap[job.ParentID].ItemName;
            } else {
                targetCust = enq.CustomerName || '';
            }
            const cleanTarget = targetCust.replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim().toLowerCase();

            // 2. Find and Filter matching options
            const candidates = enqOptions.filter(o =>
                o.OptionName === optionName &&
                (o.ItemName === job.ItemName || !o.ItemName)
            );

            // 3. Find options matching target customer
            const targetCandidates = candidates.filter(o => {
                const c = (o.CustomerName || '').toLowerCase().trim();
                return c === cleanTarget || cleanTarget.includes(c) || c.includes(cleanTarget);
            });

            // Helper to lookup price for a set of options
            const findBestPrice = (opts) => {
                let bestRow = null;
                for (const opt of opts) {
                    const pRows = enqPrices.filter(p => p.OptionID == opt.OptionID);
                    let row = pRows.find(p => p.EnquiryForID && p.EnquiryForID != 0 && p.EnquiryForID != '0' && String(p.EnquiryForID) === String(jobId));
                    if (!row) row = pRows.find(p => (!p.EnquiryForID || p.EnquiryForID == 0 || p.EnquiryForID == '0') && p.EnquiryForItem === job.ItemName);

                    if (row && row.Price > 0) {
                        if (!bestRow || new Date(row.UpdatedAt) > new Date(bestRow.UpdatedAt)) {
                            bestRow = row;
                        }
                    }
                }
                return bestRow;
            };

            // 4. Lookup Price Value
            // Try Target Options first
            let pRow = findBestPrice(targetCandidates);

            // Try ALL Candidates as Fallback if target options had no price
            if (!pRow) {
                pRow = findBestPrice(candidates);
            }

            if (pRow) {
                return { price: parseFloat(pRow.Price) || 0, updatedAt: pRow.UpdatedAt };
            }

            return { price: 0, updatedAt: null };
        };

        flatList.forEach(job => {
            const targetOptionNames = ['Base Price', 'Optional'];

            targetOptionNames.forEach(optName => {
                const { price, updatedAt } = getDivisionPrice(job.ID, optName);

                if (price > 0 || optName === 'Base Price') {
                    // Use Inherited LeadJobCode (Step 3339) - Lead Job Fix
                    const displayCode = jobLeadMap[job.ID];
                    const isRoot = !job.ParentID || String(job.ParentID) === '0' || job.ParentID === 0;
                    
                    // For summaries, always show "Name (L1/L2/...)" including for Lead jobs
                    const jobLabel = `${job.ItemName} (${displayCode})`;
                    const displayName = optName === 'Base Price' ? jobLabel : `${jobLabel} (${optName})`;

                    displayItems.push(`${displayName}|${price > 0 ? price : 'Not Updated'}|${updatedAt ? new Date(updatedAt).toISOString() : ''}|${job.level || 0}`);
                }
            });
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
            CustomerName: fullCustomerName,
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
                    ef.ID, ef.ParentID, ef.ItemName, ef.LeadJobCode,
                    mef.CommonMailIds, mef.CCMailIds, mef.CompanyLogo,
                    mef.DepartmentName, mef.CompanyName, mef.Address, mef.Phone, mef.FaxNo,
                    mef.DivisionCode, mef.DepartmentCode
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
        let userDepartment = '';

        if (userEmail) {
            try {
                const userResult = await sql.query`
                    SELECT FullName, Roles, Department FROM Master_ConcernedSE WHERE EmailId = ${userEmail}
                `;
                if (userResult.recordset.length > 0) {
                    userFullName = userResult.recordset[0].FullName || '';
                    userRole = userResult.recordset[0].Roles || '';
                    userDepartment = userResult.recordset[0].Department ? userResult.recordset[0].Department.toLowerCase().trim() : '';
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

                const userEmailUsername = userEmail.split('@')[0].toLowerCase();
                const jobNameLower = job.ItemName.toLowerCase().trim();

                let isMatch = allMails.includes(userEmail.toLowerCase()) ||
                    allMails.some(e => e.split('@')[0] === userEmailUsername) ||
                    (userDepartment && jobNameLower.includes(userDepartment)) ||
                    (userFullName && allMails.some(e => e.includes(userFullName.toLowerCase())));

                if (isMatch) {
                    if (!userJobItems.includes(job.ItemName)) {
                        userJobItems.push(job.ItemName);
                    }
                    // NEW: Detect Lead Access if assigned to ANY root job
                    if (!job.ParentID || job.ParentID === '0' || job.ParentID === 0) {
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
                    // LEAD / ADMIN: Exclude ALL jobs in branches where user is a Lead
                    // Find roots user has access to
                    const roots = jobs.filter(j => !j.ParentID || j.ParentID === '0' || j.ParentID === 0);
                    roots.forEach(root => {
                        // Check if user is assigned to this root or if they are Admin
                        const isAdmin = userRole === 'Admin';
                        const isAssigned = userJobItems.includes(root.ItemName);

                        if (isAdmin || isAssigned) {
                            excludedNames.add(clean(root.ItemName));
                            excludedNames.add(root.ItemName);
                            findDescendants(root.ID, excludedNames);
                        }
                    });

                    // Fallback: If no specific roots assigned but user has Lead Access (Creator match?), use first lead job
                    if (excludedNames.size === 0) {
                        excludedNames.add(clean(leadJobItem));
                        excludedNames.add(leadJobItem);
                        findDescendants(leadJob.ID, excludedNames);
                    }
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
                const key = `${o.OptionName}|${o.ItemName}|${o.CustomerName}|${o.LeadJobName}`;
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

        // FIX: Only Admins get global 'View All' access. 
        // Other users (including Leads/Creators) follow the hierarchical View logic below.
        const isGlobalView = userRole === 'Admin';

        if (isGlobalView) {
            console.log('Pricing API: Admin Access -> View All');
            visibleJobs = jobs.map(j => j.ItemName);
            visibleJobIds = new Set(jobs.map(j => j.ID));
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
            // UPDATE: User can only edit explicitly assigned jobs. 
            // Descendants are visible but READ-ONLY (Step 852)
            const allEditableIds = new Set([...selfJobIds]);
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
                .map(c => (c.CustomerName || '').replace(/,+$/g, '').trim()) // Normalize names
                .filter(name => {
                    const cleanName = name.replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim();
                    return name && !excludedNames.has(name) && !excludedNames.has(cleanName);
                }),
            customers: customers,
            activeCustomer: (activeCustomerName && (excludedNames.has(activeCustomerName) || excludedNames.has(activeCustomerName.replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim())))
                ? (customers.length > 0 ? customers[0] : '')
                : (activeCustomerName || '').replace(/,+$/g, '').trim(),
            leadJob: leadJobItem,
            jobs: jobs.map(j => ({
                id: j.ID,
                parentId: j.ParentID,
                itemName: j.ItemName,
                leadJobCode: j.LeadJobCode,
                companyLogo: j.CompanyLogo ? j.CompanyLogo.replace(/\\/g, '/') : null,
                departmentName: j.DepartmentName,
                companyName: j.CompanyName,
                address: j.Address,
                phone: j.Phone,
                fax: j.FaxNo,
                email: j.CommonMailIds,
                divisionCode: j.DivisionCode,
                departmentCode: j.DepartmentCode,
                isLead: !j.ParentID || j.ParentID === 0 || j.ParentID === "0",
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
        const { requestNo, optionName, itemName, customerName, leadJobName, enquiryForId } = req.body; // Accept leadJobName (Step 1013) & enquiryForId

        if (!requestNo || !optionName) {
            return res.status(400).json({ error: 'RequestNo and optionName are required' });
        }

        // --- HIERARCHY RESOLUTION (Step 2026-03-09) ---
        let resolvedItemName = itemName;
        let resolvedCustomerName = customerName;
        let resolvedLeadJobName = leadJobName;

        try {
            const jobsResult = await sql.query`SELECT ID, ParentID, ItemName FROM EnquiryFor WHERE RequestNo = ${requestNo}`;
            const jobs = jobsResult.recordset || [];
            const jobMap = {};
            jobs.forEach(j => jobMap[j.ID] = j);

            // Use ID if available, otherwise find by Name (Legacy/Manual)
            // If finding by name, try to also match leadJobName if provided to disambiguate branches
            let job = null;
            if (enquiryForId) {
                job = jobs.find(j => String(j.ID) === String(enquiryForId));
            }

            if (!job && itemName) {
                // Try to disambiguate by LeadJobName if we have multiple items with same name
                const possibleJobs = jobs.filter(j => j.ItemName === itemName);
                if (possibleJobs.length > 1 && leadJobName) {
                    // Resolve each possible job's root and check if it matches provided leadJobName
                    job = possibleJobs.find(pj => {
                        let root = pj;
                        let visited = new Set();
                        while (root.ParentID && root.ParentID !== 0 && root.ParentID !== '0' && jobMap[root.ParentID] && !visited.has(root.ID)) {
                            visited.add(root.ID);
                            root = jobMap[root.ParentID];
                        }
                        return root.ItemName === leadJobName;
                    });
                }
                if (!job) job = possibleJobs[0]; // fallback to first match
            }

            if (job) {
                resolvedItemName = job.ItemName;
                if (job.ParentID && job.ParentID !== 0 && job.ParentID !== '0' && jobMap[job.ParentID]) {
                    resolvedCustomerName = jobMap[job.ParentID].ItemName;
                } else {
                    resolvedCustomerName = customerName; // Keep external customer
                }

                let root = job;
                let visited = new Set();
                while (root.ParentID && root.ParentID !== 0 && root.ParentID !== '0' && jobMap[root.ParentID] && !visited.has(root.ID)) {
                    visited.add(root.ID);
                    root = jobMap[root.ParentID];
                }
                resolvedLeadJobName = root.ItemName;
            }
        } catch (resolveErr) {
            console.error('Pricing Option Resolution Error:', resolveErr);
        }

        // Atomic Insert with LeadJob scoped uniqueness
        const result = await sql.query`
            IF NOT EXISTS (
                SELECT 1 FROM EnquiryPricingOptions 
                WHERE RequestNo = ${requestNo}
                AND OptionName = ${optionName}
                AND (ItemName = ${resolvedItemName || null} OR (ItemName IS NULL AND ${resolvedItemName || null} IS NULL))
                AND (CustomerName = ${resolvedCustomerName || null} OR (CustomerName IS NULL AND ${resolvedCustomerName || null} IS NULL))
                AND (LeadJobName = ${resolvedLeadJobName || null} OR (LeadJobName IS NULL AND ${resolvedLeadJobName || null} IS NULL))
            )
            BEGIN
                INSERT INTO EnquiryPricingOptions (RequestNo, OptionName, SortOrder, ItemName, CustomerName, LeadJobName)
                OUTPUT INSERTED.ID, INSERTED.OptionName, INSERTED.SortOrder, INSERTED.ItemName, INSERTED.CustomerName, INSERTED.LeadJobName
                VALUES (${requestNo}, ${optionName}, 
                        (SELECT ISNULL(MAX(SortOrder), 0) + 1 FROM EnquiryPricingOptions WHERE RequestNo = ${requestNo} AND (CustomerName = ${resolvedCustomerName || null} OR (CustomerName IS NULL AND ${resolvedCustomerName || null} IS NULL))),
                        ${resolvedItemName || null}, 
                        ${resolvedCustomerName || null},
                        ${resolvedLeadJobName || null})
            END
            ELSE
            BEGIN
                SELECT ID, OptionName, SortOrder, ItemName, CustomerName, LeadJobName
                FROM EnquiryPricingOptions 
                WHERE RequestNo = ${requestNo}
                AND OptionName = ${optionName}
                AND (ItemName = ${resolvedItemName || null} OR (ItemName IS NULL AND ${resolvedItemName || null} IS NULL))
                AND (CustomerName = ${resolvedCustomerName || null} OR (CustomerName IS NULL AND ${resolvedCustomerName || null} IS NULL))
                AND (LeadJobName = ${resolvedLeadJobName || null} OR (LeadJobName IS NULL AND ${resolvedLeadJobName || null} IS NULL))
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

        // --- HIERARCHY RESOLUTION (Step 2026-03-09) ---
        // 1. EnquiryForItem - Own Job (Division name)
        // 2. CustomerName - Parent job name (If ownjob is subjob), External customer names (if ownjob is leadjob)
        // 3. LeadJobName - Leadjob name (Division name)
        let resolvedItemName = enquiryForItem;
        let resolvedCustomerName = customerName;
        let resolvedLeadJobName = leadJobName;

        try {
            // Fetch jobs for this request to resolve hierarchy
            const jobsResult = await sql.query`SELECT ID, ParentID, ItemName FROM EnquiryFor WHERE RequestNo = ${requestNo}`;
            const jobs = jobsResult.recordset || [];
            const jobMap = {};
            jobs.forEach(j => jobMap[j.ID] = j);

            // --- STRICT RESOLUTION PRIORITY ---
            let job = null;
            if (enquiryForId) {
                // If ID is provided, it MUST match strictly to avoid branch-collisions (e.g. root BMS vs child BMS)
                job = jobs.find(j => String(j.ID) === String(enquiryForId));
            }

            // Fallback to name only if ID wasn't provided or didn't match (Legacy/Manual)
            if (!job && resolvedItemName) {
                // Handle multiple same-named items by checking branch context if LeadJobName was provided
                const possibleJobs = jobs.filter(j => j.ItemName === resolvedItemName);
                if (possibleJobs.length > 1 && leadJobName) {
                    job = possibleJobs.find(pj => {
                        let r = pj;
                        let v = new Set();
                        while (r.ParentID && r.ParentID !== 0 && r.ParentID !== '0' && jobMap[r.ParentID] && !v.has(r.ID)) {
                            v.add(r.ID);
                            r = jobMap[r.ParentID];
                        }
                        return r.ItemName === leadJobName;
                    });
                }
                if (!job) job = possibleJobs[0];
            }

            if (job) {
                // 1. Own Job Name
                resolvedItemName = job.ItemName;

                // 2. Customer Name (Parent job for sub-jobs, External for lead-jobs)
                if (job.ParentID && job.ParentID !== 0 && job.ParentID !== '0' && jobMap[job.ParentID]) {
                    resolvedCustomerName = jobMap[job.ParentID].ItemName;
                } else {
                    // Lead Job: Keep provided name (intended external customer)
                    resolvedCustomerName = customerName;
                }

                // 3. Lead Job Name (Root of the branch)
                let root = job;
                let visited = new Set();
                while (root.ParentID && root.ParentID !== 0 && root.ParentID !== '0' && jobMap[root.ParentID] && !visited.has(root.ID)) {
                    visited.add(root.ID);
                    root = jobMap[root.ParentID];
                }
                resolvedLeadJobName = root.ItemName;
            }
        } catch (resolveErr) {
            console.error('Pricing Metadata Resolution Error:', resolveErr);
            // Fallback to provided values
        }

        // --- UPSERT LOGIC WITH RESOLVED METADATA ---

        let existingResult;

        if (enquiryForId) {
            // New strict check by ID
            existingResult = await sql.query`
                SELECT ID FROM EnquiryPricingValues 
                WHERE RequestNo = ${requestNo} 
                AND OptionID = ${optionId} 
                AND EnquiryForID = ${enquiryForId}
                AND (CustomerName = ${resolvedCustomerName} OR (CustomerName IS NULL AND ${resolvedCustomerName || null} IS NULL))
            `;
        } else {
            // Legacy check by Name
            existingResult = await sql.query`
                SELECT ID FROM EnquiryPricingValues 
                WHERE RequestNo = ${requestNo} 
                AND OptionID = ${optionId} 
                AND EnquiryForItem = ${resolvedItemName}
                AND (CustomerName = ${resolvedCustomerName} OR (CustomerName IS NULL AND ${resolvedCustomerName || null} IS NULL))
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
                    EnquiryForItem = ${resolvedItemName},
                    LeadJobName = ${resolvedLeadJobName},
                    CustomerName = ${resolvedCustomerName}
                WHERE ID = ${recordId}
            `;
        } else {
            // Insert
            await sql.query`
                INSERT INTO EnquiryPricingValues (RequestNo, OptionID, EnquiryForItem, EnquiryForID, Price, UpdatedBy, CustomerName, LeadJobName, UpdatedAt)
                VALUES (${requestNo}, ${optionId}, ${resolvedItemName}, ${enquiryForId || null}, ${priceValue}, ${updatedBy}, ${resolvedCustomerName}, ${resolvedLeadJobName}, ${now})
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

// Pricing Module API Routes
const express = require('express');
const router = express.Router();
const sql = require('mssql');
const fs = require('fs');
const path = require('path');
const { getHierarchyMetadata, filterJobsByDepartment } = require('../services/hierarchyService');

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
        // Include all non-terminal statuses so Pending Updates matches what user sees in search (e.g. Pricing, Pending)
        baseQuery += ` AND (E.Status IN ('Open', 'Enquiry', 'Priced', 'Estimated', 'Quote', 'Pricing', 'Pending', 'Quoted', 'Submitted') OR E.Status IS NULL OR E.Status = '') `;
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

    // 7. Fetch Additional Customers (EnquiryCustomer table)
    const extraCustomersRes = await sql.query(`
        SELECT RequestNo, CustomerName 
        FROM EnquiryCustomer 
        WHERE RequestNo IN (${requestNosList})
    `);
    const allExtraCustomers = extraCustomersRes.recordset;

    // 8. Map and Process
    return enquiries.map(enq => {
        // Merge primary and extra customers
        let combinedCustomers = (enq.CustomerName || '').split(',').map(c => c.trim()).filter(Boolean);
        allExtraCustomers
            .filter(ec => ec.RequestNo == enq.RequestNo)
            .forEach(ec => {
                const names = ec.CustomerName.split(',').map(c => c.trim()).filter(Boolean);
                names.forEach(n => {
                    if (!combinedCustomers.includes(n)) combinedCustomers.push(n);
                });
            });
        enq.CustomerName = combinedCustomers.join(', ');

        if (enq.RequestNo == '14') {
            console.log(`[DEBUG 14] Combined Customers: "${enq.CustomerName}"`);
        }

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

        const isCreator = userFullName && enq.CreatedBy && userFullName.toLowerCase().trim() === enq.CreatedBy.toLowerCase().trim();
        const isConcernedSE = concernedRequestNos.has(enq.RequestNo);

        // --- NEW: Use Shared Hierarchy Service ---
        const myJobs = filterJobsByDepartment(enqJobs, {
            userDepartment,
            isAdmin,
            isCreator,
            isConcernedSE,
            userEmail,
            userFullName
        });

        if (myJobs.length === 0) {
            console.log(`[Pricing] Enquiry ${enq.RequestNo} filtered out - no matching jobs for user ${userEmail} (department: ${userDepartment || '(none)'})`);
            return null;
        }

        // Get full metadata for all jobs in this enquiry
        const metaMap = getHierarchyMetadata(enqJobs, enq.CustomerName);

        // Recursively build visible set (Self + Children)
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

        // Visual Roots (Only the highest visible nodes)
        const visualRoots = enqJobs.filter(j => 
            visibleJobs.has(String(j.ID)) && 
            (!j.ParentID || String(j.ParentID) === '0' || !visibleJobs.has(String(j.ParentID)))
        );

        // Build flat list for rendering tree
        const childrenMap = {};
        enqJobs.forEach(j => {
            if (j.ParentID && String(j.ParentID) !== '0') {
                const pidStr = String(j.ParentID);
                if (!childrenMap[pidStr]) childrenMap[pidStr] = [];
                childrenMap[pidStr].push(j);
            }
        });

        const flatList = [];
        const traverse = (job, depth) => {
            flatList.push({ ...job, depth });
            const children = (childrenMap[String(job.ID)] || []).sort((a, b) => a.ID - b.ID);
            children.forEach(child => { if (visibleJobs.has(String(child.ID))) traverse(child, depth + 1); });
        };
        visualRoots.forEach(root => traverse(root, 0));

        // CORRECT LOGIC: An enquiry is pending for a division if ANY of the user's
        // jobs in the enquiry do NOT yet have a price > 0.
        // Only when ALL relevant jobs are priced do we remove it from the pending list.
        let hasPendingItems = true; // default: pending until proven fully priced

        // Get IDs and names of user's assigned jobs
        const myJobIds = new Set(myJobs.map(j => j.ID));
        const myJobNames = new Set(myJobs.map(j => j.ItemName));
        const stripL = (name) => (name || '').replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim().toLowerCase();
        const myJobNamesNorm = new Set(myJobs.map(j => stripL(j.ItemName)));

        console.log(`[Pricing] Enquiry ${enq.RequestNo} - Checking pending for user jobs:`, Array.from(myJobNames));
        logToFile(`Enquiry ${enq.RequestNo} - Checking pending for user jobs: ${JSON.stringify(Array.from(myJobNames))}`);

        // Track which of the user's jobs already have at least one price > 0 (by ID and by normalized name)
        const pricedJobIds = new Set();
        const pricedJobNamesNorm = new Set();

        for (const priceValue of enqPrices) {
            let belongsToMyJob = false;
            let jobIdMatch = null;

            if (priceValue.EnquiryForID && priceValue.EnquiryForID != 0 && priceValue.EnquiryForID != '0') {
                if (myJobIds.has(priceValue.EnquiryForID)) {
                    belongsToMyJob = true;
                    jobIdMatch = priceValue.EnquiryForID;
                }
            }

            // Fallback: match by ItemName (exact or normalized so "HVAC Project" matches "L2 - HVAC Project")
            if (!belongsToMyJob && priceValue.EnquiryForItem) {
                if (myJobNames.has(priceValue.EnquiryForItem)) belongsToMyJob = true;
                else if (myJobNamesNorm.has(stripL(priceValue.EnquiryForItem))) belongsToMyJob = true;
            }

            if (belongsToMyJob && priceValue.Price && priceValue.Price > 0) {
                if (jobIdMatch != null) {
                    pricedJobIds.add(jobIdMatch);
                }
                pricedJobNamesNorm.add(stripL(priceValue.EnquiryForItem));
            }
        }

        // Determine if all of the user's jobs are priced (use normalized name match)
        const allPriced = myJobs.every(j => {
            if (pricedJobIds.has(j.ID)) return true;
            if (pricedJobNamesNorm.has(stripL(j.ItemName))) return true;
            return false;
        });

        hasPendingItems = !allPriced;

        if (hasPendingItems) {
            console.log(`[Pricing] Enquiry ${enq.RequestNo} - ⚠️ PENDING: At least one job for this division has no price`);
            logToFile(`Enquiry ${enq.RequestNo} - ⚠️ PENDING: At least one job for this division has no price`);
        } else {
            console.log(`[Pricing] Enquiry ${enq.RequestNo} - ✓ NOT PENDING: All jobs for this division are priced`);
            logToFile(`Enquiry ${enq.RequestNo} - ✓ NOT PENDING: All jobs for this division are priced`);
        }

        // Build a quick map: optionId -> option row (for joining)
        const optionMap = {};
        enqOptions.forEach(o => { optionMap[o.OptionID] = o; });


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

        // -------------------------------------------------------------
        // CUSTOMER RESOLUTION (EMS Consolidated Logic)
        // -------------------------------------------------------------
        const stripPrefix = (name) => name ? name.replace(/^(L\d+|Sub Job)\s*-?\s*/i, '').trim() : '';

        // Own job names (normalized, without L-codes / "Sub Job" prefixes)
        // IMPORTANT: Own Job is the user's department job (e.g. "BMS Project"), not every
        // job they can see. Derive it primarily from department keyword; fall back to
        // myJobs if nothing matches.
        const deptKey = (userDepartment || '').toLowerCase().replace(' project', '').trim();
        let ownJobs = [];
        if (deptKey) {
            ownJobs = enqJobs.filter(j => {
                const nameClean = stripPrefix(j.ItemName || '').toLowerCase();
                return nameClean.includes(deptKey);
            });
        }
        if (ownJobs.length === 0) {
            ownJobs = myJobs;
        }

        const ownJobNamesNorm = new Set(
            ownJobs.map(j => normalize(stripPrefix(j.ItemName || '')))
        );

        // Map of ID -> Job for quick lookup
        const jobById = {};
        enqJobs.forEach(j => { jobById[String(j.ID)] = j; });

        const customerSet = new Set();

        // Rule 1: Parent jobs where Own Job appears as sub-job
        enqJobs.forEach(job => {
            const jobNorm = normalize(stripPrefix(job.ItemName || ''));
            const hasParent = job.ParentID && job.ParentID != '0' && job.ParentID != 0;
            if (!hasParent) return;
            if (!ownJobNamesNorm.has(jobNorm)) return;

            // Resolve parent name from job map first
            const parent = jobById[String(job.ParentID)];
            if (parent && parent.ItemName) {
                const parentNameClean = stripPrefix(parent.ItemName);
                if (parentNameClean) customerSet.add(parentNameClean);
            }
            // Fallback: use hierarchy metadata customer (parent job name) for this job
            const meta = metaMap[job.ID];
            if (meta && meta.customer) {
                const custClean = stripPrefix(String(meta.customer).trim());
                if (custClean && !ownJobNamesNorm.has(normalize(custClean))) customerSet.add(custClean);
            }
        });

        // Rule 2: If Own Job also appears as a Lead Job, include all external enquiry customers
        const ownAsLead = enqJobs.some(j => {
            const isLead = !j.ParentID || j.ParentID == '0' || j.ParentID == 0;
            const jNorm = normalize(stripPrefix(j.ItemName || ''));
            return isLead && ownJobNamesNorm.has(jNorm);
        });

        if (ownAsLead) {
            externalCustomers.forEach(c => {
                const clean = stripPrefix(c);
                if (clean) customerSet.add(clean);
            });
        }

        // Rule 3: Remove Own Job from customers and de-duplicate
        let finalCustomers = Array.from(customerSet).filter(c => {
            const cNorm = normalize(stripPrefix(c));
            // Own Job must never appear as a Customer (Rule 4)
            if (ownJobNamesNorm.has(cNorm)) return false;
            return true;
        });

        // Fallback: if nothing resolved, use internal customer
        if (finalCustomers.length === 0) {
            finalCustomers = [stripPrefix(internalCustomer)];
        }

        const fullCustomerName = finalCustomers.join(', ');

        if (enq.RequestNo == '14') {
            console.log(`[DEBUG 14] Final Customers: "${fullCustomerName}" (customerSet size: ${customerSet.size})`);
        }

        const displayItems = [];

        const getDivisionPrice = (jobId, optionName, jobItemName) => {
            const meta = metaMap[jobId];
            if (!meta) return { price: 0, updatedAt: null };

            // Use the actual job's ItemName for option/price lookup (e.g. "BMS Project"), not root ancestor
            const itemNameForMatch = (jobItemName || meta.rootAncestorName || '').trim();
            const rootNameForLead = (meta.rootAncestorName || '').trim();

            // 1. Determine Target Customer context using Hierarchy Service result
            const cleanTarget = (meta.customer || '').trim().toLowerCase();

            // 2. Find options that belong to THIS job and branch: match ItemName and optionally LeadJobName (root)
            const candidates = enqOptions.filter(o => {
                if (o.OptionName !== optionName) return false;
                const oItem = (o.ItemName || '').trim();
                if (oItem && oItem !== itemNameForMatch) return false;
                if (rootNameForLead && (o.LeadJobName || '').trim() && (o.LeadJobName || '').trim() !== rootNameForLead) return false;
                return true;
            });

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

                    // Fallback: match by this job's ItemName (e.g. "BMS Project"), not root ancestor
                    if (!row && itemNameForMatch) {
                        row = pRows.find(p => (p.EnquiryForItem || '').trim() === itemNameForMatch);
                    }

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

        // Strictly Department-Filtered set for Summary UI (to reduce clutter)
        let summaryVisibleIds = null;
        if (userDepartment) { 
            const deptClean = userDepartment.toLowerCase().replace(' project', '').trim();
            const strictMyJobs = enqJobs.filter(j => {
                const name = (j.ItemName || '').toLowerCase();
                return name.includes(deptClean) || deptClean.includes(name);
            });

            const sIds = new Set();
            if (strictMyJobs.length > 0) {
                let sQueue = [...strictMyJobs];
                let sProcessed = new Set();
                while (sQueue.length > 0) {
                    const current = sQueue.pop();
                    const cid = String(current.ID);
                    if (sProcessed.has(cid)) continue;
                    sProcessed.add(cid);
                    sIds.add(cid);
                    const children = enqJobs.filter(child => child.ParentID && String(child.ParentID) === cid);
                    children.forEach(c => sQueue.push(c));
                }
            }
            summaryVisibleIds = sIds;
            
        }

        flatList.forEach(job => {
            // APPLY FILTER: Skip jobs not in the strict department scope if filter is active
            if (summaryVisibleIds && !summaryVisibleIds.has(String(job.ID))) {
                return;
            }

            const targetOptionNames = ['Base Price', 'Optional'];

            targetOptionNames.forEach(optName => {
                const { price, updatedAt } = getDivisionPrice(job.ID, optName, job.ItemName);

                if (price > 0 || optName === 'Base Price') {
                    const meta = metaMap[job.ID] || { level: 1, rootCode: 'L1' };
                    
                    const jobLabel = `${job.ItemName} (${meta.rootCode})`;
                    const displayName = optName === 'Base Price' ? jobLabel : `${jobLabel} (${optName})`;

                    // Pass displayName, price, date, and DEPTH (for indentation)
                    displayItems.push(`${displayName}|${price > 0 ? price : 'Not Updated'}|${updatedAt ? new Date(updatedAt).toISOString() : ''}|${job.depth || 0}`);
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
        res.status(500).json({ error: 'Failed', details: err.message });
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
                    mef.DepartmentName, mef.CompanyName, mef.Address, mef.Phone, mef.FaxNo
                FROM EnquiryFor ef
                LEFT JOIN Master_EnquiryFor mef ON (ef.ItemName = mef.ItemName OR ef.ItemName LIKE '% ' + mef.ItemName OR ef.ItemName LIKE '%- ' + mef.ItemName)
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
                name.replace(/^(L\d+|Sub Job)\s*-?\s*/i, '').trim().toLowerCase()
            ));

            jobs.forEach(job => {
                const cleanName = job.ItemName.replace(/^(L\d+|Sub Job)\s*-?\s*/i, '').trim().toLowerCase();
                if (cleanUserScopes.has(cleanName)) {
                    if (!userJobItems.includes(job.ItemName)) {
                        userJobItems.push(job.ItemName);
                    }
                }
            });
        }

        // FILTER: Scope Customers based on User Role
        if (leadJobItem && jobs.length > 0) {
            const clean = (name) => name ? name.replace(/^(L\d+|Sub Job)\s*-?\s*/i, '').trim() : '';
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




        // Determine visible and editable jobs (Global Hierarchy Pricing Visibility)
        // Rule: editable = user's division only; visible = user's division + all descendants (read-only).
        const { getHierarchyMetadata, filterJobsByDepartment } = require('../services/hierarchyService');
        const metaMap = getHierarchyMetadata(jobs, enquiry.CustomerName);
        
        const userParams = {
            userDepartment,
            isAdmin: userRole === 'Admin',
            isCreator: enquiry.CreatedBy && userFullName && enquiry.CreatedBy.toLowerCase().trim() === userFullName.toLowerCase().trim(),
            isConcernedSE: false,
            userEmail,
            userFullName
        };
        const userScopeNodeList = filterJobsByDepartment(jobs, userParams);
        // Editable: only jobs in user's division (direct match)
        const editableNodeList = userParams.isAdmin ? jobs : jobs.filter(job => {
            const emails = [job.CommonMailIds, job.CCMailIds].filter(Boolean).join(',').toLowerCase();
            const deptNorm = userDepartment ? userDepartment.toLowerCase().trim().replace(/\s+project\s*$/i, '').trim() : '';
            const jobNameNorm = (job.ItemName || '').replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim().toLowerCase();
            return emails.includes(userEmail.toLowerCase()) || (deptNorm && (jobNameNorm.includes(deptNorm) || jobNameNorm.replace(/\s+project\s*$/i, '').includes(deptNorm)));
        });
        const editableIds = new Set(editableNodeList.map(j => String(j.ID)));

        // Visible: user's scope jobs + all their descendants (so e.g. HVAC sees BMS as read-only)
        const visibleIds = new Set(userScopeNodeList.map(j => String(j.ID)));
        const addDescendants = (parentId) => {
            jobs.filter(j => j.ParentID != null && String(j.ParentID) === String(parentId)).forEach(child => {
                visibleIds.add(String(child.ID));
                addDescendants(child.ID);
            });
        };
        userScopeNodeList.forEach(node => addDescendants(node.ID));

        const visibleJobs = jobs.filter(j => visibleIds.has(String(j.ID))).map(j => j.ItemName);
        const editableJobs = jobs.filter(j => editableIds.has(String(j.ID))).map(j => j.ItemName);

        // Update jobs with metadata
        jobs.forEach(job => {
            const meta = metaMap[job.ID] || { level: 1, depth: 0, rootCode: 'L1' };
            job.level = meta.level;
            job.depth = meta.depth;
            job.rootCode = meta.rootCode;
            job.targetCustomer = meta.customer;
        });

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
                    const cleanName = name.replace(/^(L\d+|Sub Job)\s*-?\s*/i, '').trim();
                    return name && !excludedNames.has(name) && !excludedNames.has(cleanName);
                }),
            customers: customers,
            activeCustomer: (activeCustomerName && (excludedNames.has(activeCustomerName) || excludedNames.has(activeCustomerName.replace(/^(L\d+|Sub Job)\s*-?\s*/i, '').trim())))
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

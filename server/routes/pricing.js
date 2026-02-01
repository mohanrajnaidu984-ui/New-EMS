// Pricing Module API Routes
const express = require('express');
const router = express.Router();
const sql = require('mssql');

// GET /api/pricing/list/pending
router.get('/list/pending', async (req, res) => {
    try {
        const { userEmail } = req.query;
        if (!userEmail) return res.json([]);

        // 1. Get User Details (FullName for CreatedBy check)
        const userRes = await sql.query`SELECT FullName, Roles FROM Master_ConcernedSE WHERE EmailId = ${userEmail}`;
        const user = userRes.recordset[0];
        const userFullName = user ? user.FullName : '';
        const isAdmin = user && user.Roles === 'Admin';

        // 2. Fetch Pending Enquiries
        const enquiriesRes = await sql.query`
            SELECT 
                E.RequestNo, E.ProjectName, E.CustomerName, E.ClientName, E.ConsultantName, E.DueDate, E.Status, E.CreatedBy
            FROM EnquiryMaster E
            WHERE (E.Status IN ('Open', 'Enquiry') OR E.Status IS NULL OR E.Status = '')
            ORDER BY E.DueDate DESC, E.RequestNo DESC
        `;
        const enquiries = enquiriesRes.recordset;

        if (enquiries.length === 0) return res.json([]);

        const requestNos = enquiries.map(e => e.RequestNo);

        // Fetch ConcernedSE matches for this user to grant access
        let concernedRequestNos = new Set();
        try {
            if (userFullName) {
                const cseRes = await sql.query`SELECT RequestNo FROM ConcernedSE WHERE SEName = ${userFullName}`;
                cseRes.recordset.forEach(row => concernedRequestNos.add(row.RequestNo));
            }
        } catch (err) {
            console.error('Error fetching concerned SE requests:', err);
        }

        // 3. Fetch Jobs (EnquiryFor) with Hierarchy & Access Info
        // Using IN clause for bulk fetch
        const requestNosList = requestNos.map(r => `'${r}'`).join(',');

        const jobsQuery = `
            SELECT 
                EF.RequestNo, EF.ID, EF.ParentID, EF.ItemName, 
                MEF.CommonMailIds, MEF.CCMailIds
            FROM EnquiryFor EF
            LEFT JOIN Master_EnquiryFor MEF ON (EF.ItemName = MEF.ItemName OR EF.ItemName LIKE '% - ' + MEF.ItemName)
            WHERE EF.RequestNo IN (${requestNosList})
        `;
        const jobsRes = await sql.query(jobsQuery);
        const allJobs = jobsRes.recordset;

        // 4. Fetch Pricing Values
        const pricesQuery = `
            SELECT RequestNo, EnquiryForID, EnquiryForItem, Price, UpdatedAt
            FROM EnquiryPricingValues
            WHERE RequestNo IN (${requestNosList})
        `;
        const pricesRes = await sql.query(pricesQuery);
        const allPrices = pricesRes.recordset;

        // 5. Process & Filter
        const result = enquiries.map(enq => {
            // Filter data for this enquiry
            // Filter data for this enquiry
            const enqJobsRaw = allJobs.filter(j => j.RequestNo == enq.RequestNo);

            // Deduplicate by ID (Handle potential cartesian product from Master_EnquiryFor join)
            const seenIds = new Set();
            const enqJobs = [];
            for (const job of enqJobsRaw) {
                if (!seenIds.has(job.ID)) {
                    seenIds.add(job.ID);
                    enqJobs.push(job);
                }
            }

            const enqPrices = allPrices.filter(p => p.RequestNo == enq.RequestNo);

            // Determine Scope
            let myJobs = [];

            // A. Check Lead Access (Creator)
            const isCreator = userFullName && enq.CreatedBy && userFullName.toLowerCase().trim() === enq.CreatedBy.toLowerCase().trim();
            const isConcernedSE = concernedRequestNos.has(enq.RequestNo);

            // Find Lead Job (Root)
            // Heuristic: First job or ParentID is null
            let leadJob = enqJobs.find(j => j.ParentID == null) || enqJobs[0];

            if (isAdmin) {
                // Admin sees all
                myJobs = enqJobs;
            } else {
                if ((isCreator || isConcernedSE) && leadJob) {
                    myJobs.push(leadJob);
                    // For ConcernedSE/Creator, we might want to show EVERYTHING? 
                    // Current logic for Creator only pushes leadJob, then relies on children.
                    // If we want FULL visibility:
                    if (isConcernedSE) {
                        // Push ALL jobs if concerned SE (Access to whole enquiry)
                        enqJobs.forEach(j => {
                            if (!myJobs.includes(j)) myJobs.push(j);
                        });
                    }
                }

                // B. Check Email Access (Assigned Jobs)
                enqJobs.forEach(job => {
                    const emails = [job.CommonMailIds, job.CCMailIds].filter(Boolean).join(',');
                    if (emails.toLowerCase().includes(userEmail.toLowerCase())) {
                        if (!myJobs.find(x => x.ID === job.ID)) {
                            myJobs.push(job);
                        }
                    }
                });
            }

            // Calculate 'Visible Jobs' = My Jobs + Direct Children of My Jobs
            let visibleJobs = new Set();
            myJobs.forEach(job => {
                visibleJobs.add(job.ID); // Add Self

                // Add Direct Children
                const children = enqJobs.filter(child => child.ParentID === job.ID);
                children.forEach(c => visibleJobs.add(c.ID));
            });

            // Construct Display String
            // "Name|Price|UpdatedAt|Level"
            const displayItems = [];
            let hasPendingItems = false;

            // Build Hierarchy for Display Sorting & Indentation
            const childrenMap = {};
            enqJobs.forEach(j => {
                if (j.ParentID) {
                    if (!childrenMap[j.ParentID]) childrenMap[j.ParentID] = [];
                    childrenMap[j.ParentID].push(j);
                }
            });

            // Identify Visual Roots (Visible nodes whose parent is NOT in the visible set or is null)
            // Sort by ID to ensure stable initial order
            const allVisibleJobs = enqJobs.filter(j => visibleJobs.has(j.ID)).sort((a, b) => a.ID - b.ID);
            const visualRoots = allVisibleJobs.filter(j => !j.ParentID || !visibleJobs.has(j.ParentID));

            // Flatten recursively
            const flatList = [];
            const traverse = (job, level) => {
                flatList.push({ ...job, level });
                const children = childrenMap[job.ID] || [];
                children.sort((a, b) => a.ID - b.ID); // Sort children by creation order
                children.forEach(child => {
                    if (visibleJobs.has(child.ID)) {
                        traverse(child, level + 1);
                    }
                });
            };

            visualRoots.forEach(root => traverse(root, 0));

            flatList.forEach(job => {
                // Find Price
                const priceRow = enqPrices.find(p => p.EnquiryForID === job.ID || p.EnquiryForItem === job.ItemName);
                const priceVal = priceRow ? priceRow.Price : 0;
                const updatedAt = priceRow ? priceRow.UpdatedAt : null;

                const priceStr = priceVal > 0 ? priceVal.toString() : 'Not Updated';
                const dateStr = updatedAt ? new Date(updatedAt).toISOString() : '';
                const level = job.level || 0;

                // Check pending status
                if (priceVal <= 0) {
                    hasPendingItems = true;
                }

                displayItems.push(`${job.ItemName}|${priceStr}|${dateStr}|${level}`);
            });

            // STRICT FILTERING: If the user has assigned jobs, but they are ALL updated, remove from list.
            if (!hasPendingItems && visibleJobs.size > 0) {
                return null; // Skip this enquiry
            }
            // If user has NO visible jobs (e.g. random viewer), also skip
            if (visibleJobs.size === 0) {
                return null;
            }

            return {
                ...enq,
                SubJobPrices: displayItems.join(';;')
            };
        }).filter(Boolean); // Filter out nulls

        res.json(result);

    } catch (err) {
        console.error('Error fetching pending pricing:', err);
        res.status(500).json({ error: 'Failed to fetch pending pricing' });
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



        // Determine user access
        // User has Lead Job access if:
        // 1. They created the enquiry (CreatedBy matches their name)
        // 2. OR their email is in the Lead Job's CommonMailIds/CCMailIds
        let userHasLeadAccess = false;
        let userJobItems = [];
        let userRole = '';

        // Get user's full name from email
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

            console.log('Pricing API DEBUG:');
            console.log(' - RequestNo:', requestNo);
            console.log(' - UserEmail (Token):', userEmail);
            console.log(' - UserFullName (DB):', userFullName);
            console.log(' - Enquiry CreatedBy:', enquiry.CreatedBy);
            console.log(' - User Role:', userRole);

            // Check if user is the creator (Lead Job owner) or Admin
            const isAdmin = userRole === 'Admin';

            if (isAdmin) {
                userHasLeadAccess = true;
                userJobItems = jobs.map(j => j.ItemName);
                console.log('Pricing API: User is Admin - granting Full access');
            }
            // FIX: Removed implicit "Creator = View All" logic.
            // Creators must rely on Email Assignments or explicit assignments.

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
                        // userHasLeadAccess = true; // DO NOT GRANT GLOBAL VIEW just because of Lead Job assignment? 
                        // Actually, if assigned to Lead Job, they probably should see all descendants?
                        // But for now, let's keep hierarchy lookup handle siblings.
                    }
                }
            });

            // CHECK CONCERNED SE ACCESS
            let isConcernedSE = false;
            try {
                const cseRes = await sql.query`SELECT * FROM ConcernedSE WHERE RequestNo = ${requestNo} AND SEName = ${userFullName}`;
                if (cseRes.recordset.length > 0) {
                    console.log('Pricing API: User is Concerned SE -> Keeping strict scope (No implicit View All)');
                    isConcernedSE = true;
                    // FIX: Removed `userHasLeadAccess = true` for Concerned SEs.
                    // They will only see what they are assigned to.
                }
            } catch (err) {
                console.error('Error checking ConcernedSE:', err);
            }

            // SMART SCOPE EXPANSION:
            // If user is assigned to "BMS" (Clean Name), they should also see "L2 - BMS" (Clean Name: BMS).
            const cleanUserScopes = new Set(userJobItems.map(name =>
                name.replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim().toLowerCase()
            ));

            jobs.forEach(job => {
                const cleanName = job.ItemName.replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim().toLowerCase();
                if (cleanUserScopes.has(cleanName)) {
                    if (!userJobItems.includes(job.ItemName)) {
                        console.log(`Pricing API: Auto-granting access to '${job.ItemName}' based on matching scope '${cleanName}'`);
                        userJobItems.push(job.ItemName);
                    }
                }
            });
        }

        // Determine visible and editable jobs
        // HIERARCHY LOGIC IMPLEMENTATION
        let visibleJobs = [];
        let editableJobs = [];

        // 1. EDIT PERMISSIONS (Strict)
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

            const selfJobs = userJobItems;

            const getAllDescendants = (parentNames, allJobs) => {
                let descendants = [];
                let queue = [...parentNames];
                let processed = new Set();

                while (queue.length > 0) {
                    const currentName = queue.pop();
                    if (processed.has(currentName)) continue;
                    processed.add(currentName);

                    const children = allJobs.filter(j => j.ParentItemName === currentName);
                    children.forEach(c => {
                        descendants.push(c.ItemName);
                        queue.push(c.ItemName);
                    });
                }
                return descendants;
            };

            const descendantJobs = getAllDescendants(selfJobs, jobs);
            visibleJobs = [...new Set([...selfJobs, ...descendantJobs])];
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
            extraCustomers: extraCustomers.map(c => c.CustomerName),
            customers: customers,
            activeCustomer: activeCustomerName,
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
                visible: visibleJobs.includes(j.ItemName),
                editable: editableJobs.includes(j.ItemName)
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

        // Reject zero or negative values
        if (priceValue <= 0) {
            return res.status(400).json({ error: 'Price must be greater than zero', skipped: true });
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


        if (existingResult.recordset.length > 0) {
            // Update
            const recordId = existingResult.recordset[0].ID;
            await sql.query`
                UPDATE EnquiryPricingValues 
                SET Price = ${priceValue}, UpdatedBy = ${updatedBy}, UpdatedAt = GETDATE(),
                    EnquiryForID = ${enquiryForId || null},
                    LeadJobName = ${leadJobName || null} -- Update Lead Job Name (Step 1078)
                WHERE ID = ${recordId}
            `;
        } else {
            // Insert
            await sql.query`
                INSERT INTO EnquiryPricingValues (RequestNo, OptionID, EnquiryForItem, EnquiryForID, Price, UpdatedBy, CustomerName, LeadJobName)
                VALUES (${requestNo}, ${optionId}, ${enquiryForItem}, ${enquiryForId || null}, ${priceValue}, ${updatedBy}, ${customerName || null}, ${leadJobName || null})
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

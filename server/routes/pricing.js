// Pricing Module API Routes
const express = require('express');
const router = express.Router();
const sql = require('mssql');

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
                SELECT ef.ID, ef.ParentID, ef.ItemName, ef.ParentItemName, mef.CommonMailIds, mef.CCMailIds
                FROM EnquiryFor ef
                LEFT JOIN Master_EnquiryFor mef ON ef.ItemName = mef.ItemName
                WHERE ef.RequestNo = ${requestNo}
                ORDER BY ef.ID ASC
            `;
            jobs = jobsResult.recordset;
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
            console.log('Pricing API: Found', options.length, 'options (total)');
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

        // Get user's full name from email
        let userFullName = '';
        if (userEmail) {
            try {
                const userResult = await sql.query`
                    SELECT FullName FROM Master_ConcernedSE WHERE EmailId = ${userEmail}
                `;
                if (userResult.recordset.length > 0) {
                    userFullName = userResult.recordset[0].FullName || '';
                }
            } catch (err) {
                console.error('Error getting user name:', err);
            }

            console.log('Pricing API: User email:', userEmail, 'User name:', userFullName, 'Created by:', enquiry.CreatedBy);

            // Check if user is the creator (Lead Job owner)
            if (userFullName && enquiry.CreatedBy &&
                userFullName.toLowerCase().trim() === enquiry.CreatedBy.toLowerCase().trim()) {
                userHasLeadAccess = true;
                // Lead Job owner can SEE all jobs but EDIT only Lead Job
                userJobItems = leadJobItem ? [leadJobItem] : [];
                console.log('Pricing API: User is creator - granting Lead Job access');
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
                        userHasLeadAccess = true;
                    }
                }
            });

            // SMART SCOPE EXPANSION:
            // If user is assigned to "BMS" (Clean Name), they should also see "L2 - BMS" (Clean Name: BMS).
            // This handles split scopes across multiple Lead Jobs.
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
        const hasHierarchy = jobs.some(j => j.ParentItemName); // Check if hierarchy exists

        let visibleJobs = [];
        let editableJobs = [];

        if (hasHierarchy) {
            console.log('Pricing API: Using Strict Hierarchy Mode');
            console.log('User Job Items (Self):', userJobItems);

            // 1. User sees their own jobs (Self)
            const selfJobs = userJobItems;

            // 2. User sees ALL Descendants (Recursive)
            const getAllDescendants = (parentNames, allJobs) => {
                let descendants = [];
                let queue = [...parentNames];
                let processed = new Set();

                while (queue.length > 0) {
                    const currentName = queue.pop();
                    if (processed.has(currentName)) continue;
                    processed.add(currentName);

                    // Find children of current
                    const children = allJobs.filter(j => j.ParentItemName === currentName);
                    children.forEach(c => {
                        descendants.push(c.ItemName);
                        queue.push(c.ItemName);
                    });
                }
                return descendants;
            };

            const descendantJobs = getAllDescendants(selfJobs, jobs);

            console.log('Descendant Jobs:', descendantJobs);

            // Combine and Dedup
            visibleJobs = [...new Set([...selfJobs, ...descendantJobs])];

            // FIX: If user is the Creator (Enquiry Owner), they should see EVERYTHING, including parallel roots (L1, L2, etc.)
            // The previous logic restricted them to just selfJobs (LeadJob) + children, hiding L2.
            const isCreator = enquiry.CreatedBy && userFullName && enquiry.CreatedBy.toLowerCase().trim() === userFullName.toLowerCase().trim();
            if (isCreator) {
                console.log('User is Creator -> Granting Full Visibility');
                visibleJobs = jobs.map(j => j.ItemName);
            }

            // Edit: Only Self
            // FIX: If user is Creator (Lead Link), restrict edit strictly to Lead Job to prevent Civil editing Sub-jobs
            if (enquiry.CreatedBy && userFullName && enquiry.CreatedBy.toLowerCase().trim() === userFullName.toLowerCase().trim() && leadJobItem) {
                editableJobs = [leadJobItem];
            } else {
                editableJobs = selfJobs;
            }
            console.log('Final Visible:', visibleJobs);

        } else {
            console.log('Pricing API: Using Classic/Legacy Mode');
            // Classic Logic
            if (userHasLeadAccess) {
                visibleJobs = jobs.map(j => j.ItemName); // Lead sees all
                editableJobs = leadJobItem ? [leadJobItem] : []; // Lead edits only lead job
            } else {
                visibleJobs = userJobItems; // Sub sees only their own
                editableJobs = userJobItems; // Sub edits only their own
            }
        }

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
                isLead: j.ItemName === leadJobItem,
                visible: visibleJobs.includes(j.ItemName),
                editable: editableJobs.includes(j.ItemName)
            })),
            options: options.map(o => ({
                id: o.ID,
                name: o.OptionName,
                sortOrder: o.SortOrder,
                itemName: o.ItemName,
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

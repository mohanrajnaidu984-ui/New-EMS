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
                SELECT ef.ItemName, mef.CommonMailIds, mef.CCMailIds
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

        // Determine active customer (default to enquiry customer if not provided)
        const activeCustomerName = req.query.customerName || enquiry.CustomerName || '';

        // Get list of customers who have pricing for this enquiry
        let customers = [];
        try {
            const customerResult = await sql.query`
                SELECT DISTINCT CustomerName 
                FROM EnquiryPricingOptions 
                WHERE RequestNo = ${requestNo} 
                AND CustomerName IS NOT NULL
            `;
            customers = customerResult.recordset.map(row => row.CustomerName);

            // Ensure the main enquiry customer is always in the list
            // COMMENTED OUT: We want to allow deleting the main customer tab if needed.
            // If the user deletes all data for the main customer, they should disappear from the active tab list.
            // Frontend will handle auto-recreation if the list becomes completely empty.
            /*
            if (enquiry.CustomerName && !customers.includes(enquiry.CustomerName)) {
                customers.unshift(enquiry.CustomerName);
            }
            */
        } catch (err) {
            console.error('Error fetching customers:', err);
        }

        // Get pricing options (rows) - Filter by CustomerName
        // Order by SortOrder. 
        let options = [];
        try {
            // Note: If activeCustomerName is null/empty, we might want to show nothing or default?
            // Assuming activeCustomerName is set (defaulted above).

            const optionsResult = await sql.query`
                SELECT ID, OptionName, SortOrder, ItemName
                FROM EnquiryPricingOptions 
                WHERE RequestNo = ${requestNo}
                AND (CustomerName = ${activeCustomerName} OR (CustomerName IS NULL AND ${activeCustomerName} = ''))
                ORDER BY SortOrder ASC, ID ASC
            `;
            options = optionsResult.recordset;
            console.log('Pricing API: Found', options.length, 'options for customer:', activeCustomerName);
        } catch (err) {
            console.error('Error querying EnquiryPricingOptions:', err);
            throw err;
        }

        // Get pricing values (cells) - Filter by CustomerName
        let values = [];
        try {
            const valuesResult = await sql.query`
                SELECT OptionID, EnquiryForItem, Price, UpdatedBy, UpdatedAt
                FROM EnquiryPricingValues 
                WHERE RequestNo = ${requestNo}
                AND (CustomerName = ${activeCustomerName} OR (CustomerName IS NULL AND ${activeCustomerName} = ''))
            `;
            values = valuesResult.recordset;
            console.log('Pricing API: Found', values.length, 'values for customer:', activeCustomerName);
        } catch (err) {
            console.error('Error querying EnquiryPricingValues:', err);
            throw err;
        }

        // Create value lookup map
        const valueMap = {};
        values.forEach(v => {
            const key = `${v.OptionID}_${v.EnquiryForItem}`;
            valueMap[key] = v;
        });

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
        }

        // Determine visible and editable jobs
        // Lead Job owner: sees all, edits only lead
        // Sub Job owner: sees and edits only their own
        let visibleJobs = [];
        let editableJobs = [];

        if (userHasLeadAccess) {
            visibleJobs = jobs.map(j => j.ItemName); // Lead sees all
            editableJobs = leadJobItem ? [leadJobItem] : []; // Lead edits only lead job
        } else {
            visibleJobs = userJobItems; // Sub sees only their own
            editableJobs = userJobItems; // Sub edits only their own
        }

        console.log('DEBUG EXTRA CUSTOMERS RAW:', extraCustomers);
        const mappedExtras = extraCustomers.map(c => c.CustomerName);
        console.log('DEBUG EXTRA CUSTOMERS MAPPED:', mappedExtras);

        console.log('Pricing API Response Names:', {
            cust: enquiry.CustomerName,
            client: enquiry.ClientName,
            consult: enquiry.ConsultantName,
            extraArgs: mappedExtras
        });

        res.json({
            enquiry: {
                requestNo: enquiry.RequestNo,
                projectName: enquiry.ProjectName,
                createdBy: enquiry.CreatedBy,
                customerName: enquiry.CustomerName, // Default customer
                clientName: enquiry.ClientName,
                consultantName: enquiry.ConsultantName
            },
            extraCustomers: extraCustomers.map(c => c.CustomerName), // List of linked customers
            customers: customers, // List of available customers
            activeCustomer: activeCustomerName, // Currently loaded customer
            leadJob: leadJobItem,
            jobs: jobs.map(j => ({
                itemName: j.ItemName,
                isLead: j.ItemName === leadJobItem,
                visible: visibleJobs.includes(j.ItemName),
                editable: editableJobs.includes(j.ItemName)
            })),
            options: options.map(o => ({
                id: o.ID,
                name: o.OptionName,
                sortOrder: o.SortOrder,
                itemName: o.ItemName // Return scope
            })),
            values: valueMap,
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
        const { requestNo, optionName, itemName, customerName } = req.body; // Accept customerName

        if (!requestNo || !optionName) {
            return res.status(400).json({ error: 'RequestNo and optionName are required' });
        }

        // Get max sort order (Filter by CustomerName)
        const maxResult = await sql.query`
            SELECT ISNULL(MAX(SortOrder), 0) + 1 as NextOrder 
            FROM EnquiryPricingOptions 
            WHERE RequestNo = ${requestNo}
            AND (CustomerName = ${customerName} OR (CustomerName IS NULL AND ${customerName || null} IS NULL))
        `;
        const sortOrder = maxResult.recordset[0].NextOrder;

        // Insert new option with ItemName and CustomerName
        const result = await sql.query`
            INSERT INTO EnquiryPricingOptions (RequestNo, OptionName, SortOrder, ItemName, CustomerName)
            OUTPUT INSERTED.ID, INSERTED.OptionName, INSERTED.SortOrder, INSERTED.ItemName, INSERTED.CustomerName
            VALUES (${requestNo}, ${optionName}, ${sortOrder}, ${itemName || null}, ${customerName || null})
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
        const { requestNo, optionId, enquiryForItem, price, updatedBy, customerName } = req.body;

        if (!requestNo || !optionId || !enquiryForItem) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const priceValue = parseFloat(price) || 0;

        // Reject zero or negative values - don't save them
        if (priceValue <= 0) {
            return res.status(400).json({ error: 'Price must be greater than zero', skipped: true });
        }

        // Upsert: Update if exists, insert if not
        const existingResult = await sql.query`
            SELECT ID FROM EnquiryPricingValues 
            WHERE RequestNo = ${requestNo} 
            AND OptionID = ${optionId} 
            AND EnquiryForItem = ${enquiryForItem}
            AND (CustomerName = ${customerName} OR (CustomerName IS NULL AND ${customerName || null} IS NULL))
        `;

        if (existingResult.recordset.length > 0) {
            // Update existing
            await sql.query`
                UPDATE EnquiryPricingValues 
                SET Price = ${priceValue}, UpdatedBy = ${updatedBy}, UpdatedAt = GETDATE()
                WHERE RequestNo = ${requestNo} 
                AND OptionID = ${optionId} 
                AND EnquiryForItem = ${enquiryForItem}
                AND (CustomerName = ${customerName} OR (CustomerName IS NULL AND ${customerName || null} IS NULL))
            `;
        } else {
            // Insert new
            await sql.query`
                INSERT INTO EnquiryPricingValues (RequestNo, OptionID, EnquiryForItem, Price, UpdatedBy, CustomerName)
                VALUES (${requestNo}, ${optionId}, ${enquiryForItem}, ${priceValue}, ${updatedBy}, ${customerName || null})
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

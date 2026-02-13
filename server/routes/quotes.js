const express = require('express');
const router = express.Router();
const sql = require('mssql');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

// Configure Multer Storage for Quote Attachments
const uploadDir = path.join(__dirname, '..', 'uploads', 'quotes');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

// NOTE: Static routes MUST be defined BEFORE dynamic parameter routes
// to prevent Express from interpreting path segments like 'lists' as parameter values

// GET /api/quotes/lists/metadata - Fetch lists for dropdowns
router.get('/lists/metadata', async (req, res) => {
    try {
        const usersResult = await sql.query`SELECT FullName, Designation, EmailId FROM Master_ConcernedSE WHERE Status = 'Active' ORDER BY FullName`;
        const customersResult = await sql.query`SELECT CompanyName, Address1, Address2, Phone1, Phone2, FaxNo, EmailId FROM Master_CustomerName WHERE Status = 'Active' ORDER BY CompanyName`;
        res.json({ users: usersResult.recordset, customers: customersResult.recordset });
    } catch (err) {
        console.error('Error fetching metadata lists:', err);
        res.status(500).json({ error: 'Failed to fetch lists' });
    }
});

// GET /api/quotes/list/pending
router.get('/list/pending', async (req, res) => {
    try {
        console.log('[API] Check Pending Quotes...');
        const query = `
            SELECT 
                E.RequestNo, E.ProjectName, E.CustomerName, E.EnquiryDate, E.DueDate, E.Status,
                (
                    SELECT STUFF((
                        SELECT ', ' + ItemName 
                        FROM EnquiryFor 
                        WHERE RequestNo = E.RequestNo 
                        FOR XML PATH('')
                    ), 1, 2, '')
                ) as Divisions
            FROM EnquiryMaster E
            LEFT JOIN EnquiryQuotes Q ON E.RequestNo = Q.RequestNo
            WHERE (E.Status IN ('Open', 'Enquiry', 'FollowUp', 'Follow-up', 'Estimated', 'Priced') OR E.Status IS NULL OR E.Status = '')
            AND Q.ID IS NULL
            ORDER BY E.DueDate DESC, E.RequestNo DESC
        `;

        const result = await sql.query(query);
        console.log(`[API] Pending Quotes found: ${result.recordset.length}`);
        res.json(result.recordset);
    } catch (err) {
        console.error('Error fetching pending quotes:', err);
        res.status(500).json({ error: 'Failed to fetch pending quotes', details: err.message });
    }
});

// GET /api/quotes/config/templates - List all templates (moved here for route ordering)
router.get('/config/templates', async (req, res) => {
    try {
        const result = await sql.query`SELECT * FROM QuoteTemplates ORDER BY TemplateName`;
        res.json(result.recordset);
    } catch (err) {
        console.error('Error fetching templates:', err);
        res.status(500).json({ error: 'Failed to fetch templates' });
    }
});

// GET /api/quotes/single/:id - Get a specific quote by ID
router.get('/single/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const result = await sql.query`
            SELECT * FROM EnquiryQuotes WHERE ID = ${id}
        `;

        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Quote not found' });
        }

        res.json(result.recordset[0]);
    } catch (err) {
        console.error('Error fetching quote:', err);
        res.status(500).json({ error: 'Failed to fetch quote' });
    }
});

// GET /api/quotes/enquiry-data/:requestNo - Get enquiry data for quote generation
router.get('/enquiry-data/:requestNo', async (req, res) => {
    try {
        const { requestNo } = req.params;
        console.log(`[Quote API] Fetching data for RequestNo: ${requestNo}`);

        // Get enquiry details
        let enquiry;
        try {
            const enquiryResult = await sql.query`
                SELECT RequestNo, ProjectName, CustomerName, ReceivedFrom,
                       EnquiryDate, DueDate, CustomerRefNo
                FROM EnquiryMaster 
                WHERE RequestNo = ${requestNo}
            `;
            if (enquiryResult.recordset.length === 0) {
                console.log(`[Quote API] Enquiry not found for RequestNo: ${requestNo}`);
                return res.status(404).json({ error: 'Enquiry not found' });
            }
            enquiry = enquiryResult.recordset[0];
            // Polyfill missing columns
            // Fetch Enquiry Types
            const typesResult = await sql.query`SELECT TypeName FROM EnquiryType WHERE RequestNo = ${requestNo}`;
            enquiry.EnquiryType = typesResult.recordset.map(t => t.TypeName).join(', ');
            console.log('[Quote API] Enquiry found:', enquiry.ProjectName);
        } catch (err) {
            console.error('[Quote API] Error fetching EnquiryMaster:', err);
            throw err;
        }

        // Get customer details (address, etc.)
        let customerDetails = null;
        if (enquiry.CustomerName) {
            try {
                const customerResult = await sql.query`
                    SELECT * FROM Master_CustomerName 
                    WHERE CompanyName = ${enquiry.CustomerName}
                `;
                if (customerResult.recordset.length > 0) {
                    customerDetails = customerResult.recordset[0];
                    // Polyfill Address for frontend
                    customerDetails.Address = [customerDetails.Address1, customerDetails.Address2].filter(Boolean).join('\n');
                    console.log('[Quote API] Customer details found');
                } else {
                    console.log('[Quote API] Customer details not found for:', enquiry.CustomerName);
                }
            } catch (err) {
                console.error('[Quote API] Error fetching Customer details:', err);
            }
        }

        // Get EnquiryFor items (divisions/inclusions)
        let divisions = [];
        let leadJobPrefix = '';
        let companyDetails = {
            code: 'AAC', // Default
            logo: null,
            name: 'Almoayyed Air Conditioning'
        };
        let availableProfiles = [];
        let divisionsHierarchy = []; // Declare at top level for response

        let resolvedItems = [];
        try {
            // 1. Fetch raw items with Hierarchy (Join Master to get Default Assignments)
            const rawItemsResult = await sql.query`
                SELECT EF.ID, EF.ParentID, EF.ItemName, MEF.CommonMailIds, MEF.CCMailIds 
                FROM EnquiryFor EF
                LEFT JOIN Master_EnquiryFor MEF ON EF.ItemName = MEF.ItemName
                WHERE EF.RequestNo = ${requestNo}`;
            const rawItems = rawItemsResult.recordset;

            // Helper to get Parent
            const getParent = (id) => rawItems.find(i => i.ID === id);

            // Filter Divisions based on User Access (Scope)
            const userEmail = req.query.userEmail || '';
            let divisions = rawItems.map(r => r.ItemName); // Default all

            if (userEmail) {
                // Find items explicitly assigned to user
                const userScopeItems = rawItems.filter(item => {
                    const mails = [item.CommonMailIds, item.CCMailIds].filter(Boolean).join(',').toLowerCase();
                    return mails.includes(userEmail.toLowerCase());
                });

                if (userScopeItems.length > 0) {
                    // Logic: Return the LEAD JOBS (Roots) that contain these scope items
                    // "Only lead jobs where user is having subjob"
                    const accessRoots = new Set();

                    userScopeItems.forEach(scopeItem => {
                        let curr = scopeItem;
                        // Traverse up to Root
                        while (curr.ParentID) {
                            const p = getParent(curr.ParentID);
                            if (p) curr = p;
                            else break;
                        }
                        accessRoots.add(curr.ItemName);
                    });

                    divisions = Array.from(accessRoots);
                }
            }

            // Hierarchy Structure for Frontend Logic
            divisionsHierarchy = rawItems.map(r => ({
                id: r.ID,
                parentId: r.ParentID,
                itemName: r.ItemName,
                commonMailIds: r.CommonMailIds,
                ccMailIds: r.CCMailIds
            }));

            // 2. Resolve Master Details for EACH item (handling prefixes)
            for (const item of rawItems) {
                let itemName = item.ItemName;
                let cleanName = itemName.replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim(); // Remove "L1 - ", "L2 - "

                // Try to find in Master
                let masterRes = await sql.query`SELECT * FROM Master_EnquiryFor WHERE ItemName = ${itemName} OR ItemName = ${cleanName}`;
                let masterData = masterRes.recordset[0];

                if (masterData) {
                    // Prioritize Transaction Data (item) over Master Data for ItemName (to keep L1/L2 prefixes)
                    resolvedItems.push({ ...masterData, ...item });

                    // Add to available profiles if valid details exist
                    if (masterData.DivisionCode || masterData.DepartmentCode) {
                        const profile = {
                            code: masterData.DepartmentCode || 'ACC',
                            departmentCode: masterData.DepartmentCode || 'ACC',
                            divisionCode: masterData.DivisionCode || 'GEN',
                            name: masterData.CompanyName,
                            logo: masterData.CompanyLogo ? masterData.CompanyLogo.replace(/\\/g, '/') : null,
                            address: masterData.Address,
                            phone: masterData.Phone,
                            fax: masterData.FaxNo,
                            email: masterData.CommonMailIds ? masterData.CommonMailIds.split(',')[0].trim() : '',
                            itemName: item.ItemName // Explicitly use the transaction item name
                        };

                        // Avoid duplicates in availableProfiles based on Div/Dept
                        const exists = availableProfiles.find(p => p.divisionCode === profile.divisionCode && p.code === profile.code);
                        if (!exists) {
                            availableProfiles.push(profile);
                        }
                    }
                } else {
                    resolvedItems.push(item);
                }
            }

            // 3. Find Lead Job Default (Prioritize L1, then first available)
            let leadItem = resolvedItems.find(r => r.ItemName && r.ItemName.startsWith('L1')) || resolvedItems[0];
            leadJobPrefix = leadItem ? leadItem.ItemName.split('-')[0].trim() : '';

            // 4. Set Initial Company Details from Lead Item
            if (leadItem && leadItem.DepartmentCode) {
                const match = leadItem;
                companyDetails.code = match.DepartmentCode;
                companyDetails.divisionCode = match.DivisionCode || 'AAC';
                companyDetails.departmentCode = match.DepartmentCode || '';
                if (match.CompanyName) companyDetails.name = match.CompanyName;
                if (match.CompanyLogo) companyDetails.logo = match.CompanyLogo.replace(/\\/g, '/');
                if (match.Address) companyDetails.address = match.Address;
                if (match.Phone) companyDetails.phone = match.Phone;
                if (match.FaxNo) companyDetails.fax = match.FaxNo;
                if (match.CommonMailIds) {
                    const emails = match.CommonMailIds.split(',');
                    if (emails.length > 0) companyDetails.email = emails[0].trim();
                }
            } else if (availableProfiles.length > 0) {
                // Fallback to first available profile if lead item has no details
                companyDetails = availableProfiles[0];
            }

            console.log(`[Quote API] Found ${divisions.length} divisions. Default Profile: ${companyDetails.divisionCode}`);
        } catch (err) {
            console.error('[Quote API] Error fetching EnquiryFor:', err);
        }

        // Get Prepared By Options
        let preparedByOptions = [];
        try {
            const seResult = await sql.query`SELECT SEName FROM ConcernedSE WHERE RequestNo = ${requestNo}`;
            seResult.recordset.forEach(row => {
                if (row.SEName) preparedByOptions.push({ value: row.SEName, label: row.SEName, type: 'SE' });
            });

            if (enquiry.CreatedBy) {
                preparedByOptions.push({ value: enquiry.CreatedBy, label: enquiry.CreatedBy, type: 'Creator' });
            }
            // Add emails from default list if needed, or rely on frontend
            preparedByOptions = preparedByOptions.filter((v, i, a) => a.findIndex(t => (t.value === v.value)) === i);
        } catch (err) {
            console.error('[Quote API] Error fetching Prepared By options:', err);
        }

        // Get Customer Options with ReceivedFrom contacts
        let customerOptions = [];
        let customerContacts = {}; // Map customer names to their ReceivedFrom contacts
        try {
            // Get customers from EnquiryCustomer table
            const customerResult = await sql.query`
                SELECT CustomerName 
                FROM EnquiryCustomer 
                WHERE RequestNo = ${requestNo}
            `;

            // Get ReceivedFrom contacts from ReceivedFrom table
            const receivedFromResult = await sql.query`
                SELECT ContactName, CompanyName 
                FROM ReceivedFrom 
                WHERE RequestNo = ${requestNo}
            `;

            console.log('[Quote API] ReceivedFrom records:', receivedFromResult.recordset);

            // Build customerContacts mapping from ReceivedFrom table
            receivedFromResult.recordset.forEach(row => {
                if (row.CompanyName && row.ContactName) {
                    // Clean trailing commas and trim
                    const company = row.CompanyName.replace(/,+$/, '').trim();
                    const contact = row.ContactName.trim();

                    // If this company already has contacts, append with comma
                    if (customerContacts[company]) {
                        customerContacts[company] += ', ' + contact;
                    } else {
                        customerContacts[company] = contact;
                    }
                }
            });

            // Helper to check if a customer already has a contact (normalized)
            const hasContact = (cust) => {
                const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                const target = norm(cust);
                return Object.keys(customerContacts).some(k => norm(k) === target);
            };

            // Process EnquiryCustomer records
            customerResult.recordset.forEach(row => {
                if (row.CustomerName) {
                    // Split by comma and clean
                    row.CustomerName.split(',').forEach(c => {
                        const trimmed = c.replace(/,+$/, '').trim();
                        if (trimmed) {
                            customerOptions.push(trimmed);
                        }
                    });
                }
            });

            // Add main enquiry customer if not already in the list
            if (enquiry.CustomerName) {
                enquiry.CustomerName.split(',').forEach(c => {
                    const trimmed = c.replace(/,+$/, '').trim();
                    if (trimmed) {
                        if (!customerOptions.includes(trimmed)) {
                            customerOptions.push(trimmed);
                        }
                        // Use the main enquiry's ReceivedFrom ONLY if no specific contact exists for this customer
                        if (!hasContact(trimmed) && enquiry.ReceivedFrom) {
                            customerContacts[trimmed] = enquiry.ReceivedFrom;
                            console.log(`[Quote API] Mapped main customer "${trimmed}" to ReceivedFrom: "${enquiry.ReceivedFrom}"`);
                        }
                    }
                });
            }

            customerOptions = [...new Set(customerOptions)];
            console.log('[Quote API] Final customerContacts mapping:', customerContacts);
        } catch (err) {
            console.error('[Quote API] Error fetching Customer options:', err);
            if (enquiry.CustomerName) {
                enquiry.CustomerName.split(',').forEach(c => {
                    const trimmed = c.trim();
                    if (trimmed) customerOptions.push(trimmed);
                });
            }
        }

        res.json({
            enquiry,
            customerDetails,
            divisions,
            companyDetails,
            availableProfiles,
            preparedByOptions,
            customerOptions,
            customerContacts,  // Map of customer names to ReceivedFrom contacts
            leadJobPrefix,
            divisionEmails: resolvedItems.map(item => ({
                itemName: item.ItemName,
                // Combine Common and CC for the frontend's ccMailIds check to ensure both groups have access
                ccMailIds: [item.CommonMailIds, item.CCMailIds].filter(Boolean).join(','),
                commonMailIds: item.CommonMailIds || ''
            })),
            quoteNumber: 'Draft',
            divisionsHierarchy  // Return full hierarchy for dynamic customer options
        });
    } catch (err) {
        console.error('[Quote API] Fatal Error in enquiry-data route:', err);
        res.status(500).json({ error: 'Failed to fetch enquiry data', details: err.message });
    }
});

// GET /api/quotes/:requestNo - Get all quotes for an enquiry
// IMPORTANT: This catch-all route MUST come AFTER all other GET routes with static prefixes
//            (like /single/:id, /enquiry-data/:requestNo, /lists/metadata, /config/templates)
//            to prevent matching 'single', 'enquiry-data', etc. as requestNo values
router.get('/:requestNo', async (req, res) => {
    try {
        const { requestNo } = req.params;

        const result = await sql.query`
            SELECT * FROM EnquiryQuotes 
            WHERE RequestNo = ${requestNo}
            ORDER BY QuoteNo DESC, RevisionNo DESC
        `;

        res.json(result.recordset);
    } catch (err) {
        console.error('Error fetching quotes:', err);
        res.status(500).json({ error: 'Failed to fetch quotes' });
    }
});

// POST /api/quotes - Create a new quote
router.post('/', async (req, res) => {
    try {
        const {
            divisionCode,
            departmentCode,
            leadJobPrefix,
            requestNo,
            validityDays = 30,
            preparedBy,
            preparedByEmail,
            showScopeOfWork = true,
            showBasisOfOffer = true,
            showExclusions = true,
            showPricingTerms = true,
            showSchedule = true,
            showWarranty = true,
            showResponsibilityMatrix = true,
            showTermsConditions = true,
            showAcceptance = true,
            showBillOfQuantity = true,
            scopeOfWork = '',
            basisOfOffer = '',
            exclusions = '',
            pricingTerms = '',
            schedule = '',
            warranty = '',
            responsibilityMatrix = '',
            termsConditions = '',
            acceptance = '',
            billOfQuantity = '',
            totalAmount = 0,
            status = 'Draft',
            customClauses = [],
            clauseOrder = [],
            quoteDate = null,
            customerReference = '',
            subject = '',
            signatory = '',
            signatoryDesignation = '',
            toName = '',
            toAddress = '',
            toPhone = '',
            toEmail = ''
        } = req.body;

        const customClausesJson = JSON.stringify(customClauses);
        const clauseOrderJson = JSON.stringify(clauseOrder);

        if (!requestNo) {
            return res.status(400).json({ error: 'Request number is required' });
        }

        // Get next quote number - UNIQUE PER CUSTOMER
        // Check for existing quotes for this specific combination:
        // - Same RequestNo (Enquiry)
        // - Same Division Code (e.g., ELE, BMS)
        // - Same Lead Job Prefix (e.g., L1)
        // - Same Customer (ToName)
        // This ensures each customer gets a unique sequential quote number

        const dept = departmentCode || "GEN";
        const division = divisionCode || "AAC";
        const requestRef = leadJobPrefix ? `${requestNo}-${leadJobPrefix}` : requestNo;

        const existingQuotesResult = await sql.query`
            SELECT ISNULL(MAX(QuoteNo), 0) AS MaxQuoteNo
            FROM EnquiryQuotes
            WHERE RequestNo = ${requestNo}
              AND QuoteNumber LIKE ${dept + '/' + division + '/' + requestRef + '/%'}
              AND ToName = ${toName}
        `;

        const quoteNo = (existingQuotesResult.recordset[0].MaxQuoteNo || 0) + 1;
        const revisionNo = 0;

        // FORMAT: Dept/Div/EnquiryRef/QuoteNo-Revision
        const quoteNumber = `${dept}/${division}/${requestRef}/${quoteNo}-R${revisionNo}`;

        console.log(`[Quote Creation] Customer: ${toName}, Division: ${division}, QuoteNo: ${quoteNo}, Full: ${quoteNumber}`);

        const now = new Date();
        const result = await sql.query`
            INSERT INTO EnquiryQuotes (
                RequestNo, QuoteNumber, QuoteNo, RevisionNo, ValidityDays,
                PreparedBy, PreparedByEmail,
                ShowScopeOfWork, ShowBasisOfOffer, ShowExclusions, ShowPricingTerms,
                ShowSchedule, ShowWarranty, ShowResponsibilityMatrix, ShowTermsConditions, ShowAcceptance, ShowBillOfQuantity,
                ScopeOfWork, BasisOfOffer, Exclusions, PricingTerms,
                Schedule, Warranty, ResponsibilityMatrix, TermsConditions, Acceptance, BillOfQuantity,
                TotalAmount, Status, CustomClauses, ClauseOrder,
                QuoteDate, CustomerReference, Subject, Signatory, SignatoryDesignation, ToName, ToAddress, ToPhone, ToEmail, CreatedAt, UpdatedAt
            )
            OUTPUT INSERTED.ID, INSERTED.QuoteNumber
            VALUES (
                ${requestNo}, ${quoteNumber}, ${quoteNo}, ${revisionNo}, ${validityDays},
                ${preparedBy}, ${preparedByEmail},
                ${showScopeOfWork ? 1 : 0}, ${showBasisOfOffer ? 1 : 0}, ${showExclusions ? 1 : 0}, ${showPricingTerms ? 1 : 0},
                ${showSchedule ? 1 : 0}, ${showWarranty ? 1 : 0}, ${showResponsibilityMatrix ? 1 : 0}, ${showTermsConditions ? 1 : 0}, ${showAcceptance ? 1 : 0}, ${showBillOfQuantity ? 1 : 0},
                ${scopeOfWork}, ${basisOfOffer}, ${exclusions}, ${pricingTerms},
                ${schedule}, ${warranty}, ${responsibilityMatrix}, ${termsConditions}, ${acceptance}, ${billOfQuantity},
                ${totalAmount}, ${status}, ${customClausesJson}, ${clauseOrderJson},
                ${quoteDate}, ${customerReference}, ${subject}, ${signatory}, ${signatoryDesignation}, ${toName}, ${toAddress}, ${toPhone}, ${toEmail}, ${now}, ${now}
            )
        `;

        // Update Enquiry Status to 'Quote'
        await sql.query`
            UPDATE EnquiryMaster 
            SET Status = 'Quote' 
            WHERE RequestNo = ${requestNo} 
            AND (Status IS NULL OR Status IN ('Enquiry', 'Open', 'Pricing', 'Pending'))
        `;

        res.json({
            success: true,
            id: result.recordset[0].ID,
            quoteNumber: result.recordset[0].QuoteNumber
        });

    } catch (err) {
        console.error('Error creating quote:', err);
        res.status(500).json({ error: 'Failed to create quote', details: err.message });
    }
});

// PUT /api/quotes/:id - Update an existing quote
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            validityDays,
            showScopeOfWork, showBasisOfOffer, showExclusions, showPricingTerms,
            showSchedule, showWarranty, showResponsibilityMatrix, showTermsConditions, showAcceptance, showBillOfQuantity,
            scopeOfWork, basisOfOffer, exclusions, pricingTerms,
            schedule, warranty, responsibilityMatrix, termsConditions, acceptance, billOfQuantity,
            totalAmount, status,
            customClauses = [],
            clauseOrder = [],
            quoteDate, customerReference, subject, signatory, signatoryDesignation, toName, toAddress, toPhone, toEmail,
            preparedBy, preparedByEmail
        } = req.body;

        const customClausesJson = JSON.stringify(customClauses);
        const clauseOrderJson = JSON.stringify(clauseOrder);

        const now = new Date();
        await sql.query`
            UPDATE EnquiryQuotes SET
        ValidityDays = ${validityDays},
        ShowScopeOfWork = ${showScopeOfWork ? 1 : 0},
        ShowBasisOfOffer = ${showBasisOfOffer ? 1 : 0},
        ShowExclusions = ${showExclusions ? 1 : 0},
        ShowPricingTerms = ${showPricingTerms ? 1 : 0},
        ShowSchedule = ${showSchedule ? 1 : 0},
        ShowWarranty = ${showWarranty ? 1 : 0},
        ShowResponsibilityMatrix = ${showResponsibilityMatrix ? 1 : 0},
        ShowTermsConditions = ${showTermsConditions ? 1 : 0},
        ShowAcceptance = ${showAcceptance ? 1 : 0},
        ShowBillOfQuantity = ${showBillOfQuantity ? 1 : 0},
        ScopeOfWork = ${scopeOfWork},
        BasisOfOffer = ${basisOfOffer},
        Exclusions = ${exclusions},
        PricingTerms = ${pricingTerms},
        Schedule = ${schedule},
        Warranty = ${warranty},
        ResponsibilityMatrix = ${responsibilityMatrix},
        TermsConditions = ${termsConditions},
        Acceptance = ${acceptance},
        BillOfQuantity = ${billOfQuantity},
        TotalAmount = ${totalAmount},
        Status = ${status},
        CustomClauses = ${customClausesJson},
        ClauseOrder = ${clauseOrderJson},
        QuoteDate = ${quoteDate},
        CustomerReference = ${customerReference},
        Subject = ${subject},
        Signatory = ${signatory},
        SignatoryDesignation = ${signatoryDesignation},
        ToName = ${toName},
        ToAddress = ${toAddress},
        ToPhone = ${toPhone},
        ToEmail = ${toEmail},
        PreparedBy = ${preparedBy},
        PreparedByEmail = ${preparedByEmail},
        UpdatedAt = ${now}
            WHERE ID = ${id}
        `;

        const updated = await sql.query`SELECT ID, QuoteNumber FROM EnquiryQuotes WHERE ID = ${id} `;
        res.json({ success: true, id: updated.recordset[0].ID, quoteNumber: updated.recordset[0].QuoteNumber });

    } catch (err) {
        console.error('Error updating quote:', err);
        res.status(500).json({ error: 'Failed to update quote' });
    }
});

// POST /api/quotes/:id/revise - Create a new revision of a quote
router.post('/:id/revise', async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`[Revise] Starting revision for quote ID: ${id}`);

        const {
            preparedBy, preparedByEmail, validityDays,
            showScopeOfWork, showBasisOfOffer, showExclusions, showPricingTerms,
            showSchedule, showWarranty, showResponsibilityMatrix, showTermsConditions, showAcceptance, showBillOfQuantity,
            scopeOfWork, basisOfOffer, exclusions, pricingTerms,
            schedule, warranty, responsibilityMatrix, termsConditions, acceptance, billOfQuantity,
            totalAmount, customClauses, clauseOrder,
            quoteDate, customerReference, subject, signatory, signatoryDesignation, toName, toAddress, toPhone, toEmail
        } = req.body;

        const existingResult = await sql.query`SELECT * FROM EnquiryQuotes WHERE ID = ${id}`;

        if (existingResult.recordset.length === 0) {
            console.log(`[Revise] Quote not found for ID: ${id}`);
            return res.status(404).json({ error: 'Quote not found' });
        }
        const existing = existingResult.recordset[0];
        const newRevisionNo = existing.RevisionNo + 1;
        console.log(`[Revise] Existing quote: ${existing.QuoteNumber}, Current Revision: ${existing.RevisionNo}, New Revision: ${newRevisionNo}`);

        const existingParts = existing.QuoteNumber ? existing.QuoteNumber.split("/") : [];

        // For revisions, preserve the existing quote's reference part (including lead job prefix)
        // Don't recalculate - just use what's already in the quote number
        let correctRefPart = existingParts.length > 2 ? existingParts[2] : existing.RequestNo;
        console.log(`[Revise] Using existing reference part: ${correctRefPart}`);

        // 2. Reconstruct Quote Number
        // Expected Format: Dept/Div/Ref/QuoteNo-Rev
        let newQuoteNumber;
        if (existingParts.length >= 4) {
            const dept = existingParts[0];
            const div = existingParts[1];
            // Part 2 is Ref (Updated)
            // Part 3 is Quote-Rev
            newQuoteNumber = `${dept}/${div}/${correctRefPart}/${existing.QuoteNo}-R${newRevisionNo}`;
        } else {
            // Fallback for non-standard formats
            if (existingParts.length > 0) existingParts.pop();
            const quoteRevPart = `${existing.QuoteNo}-R${newRevisionNo}`;
            newQuoteNumber = existingParts.length > 0 ? `${existingParts.join('/')}/${quoteRevPart}` : `${existing.QuoteNumber}-R${newRevisionNo}`;
        }
        console.log(`[Revise] New quote number: ${newQuoteNumber}`);

        const customClausesJson = customClauses ? JSON.stringify(customClauses) : existing.CustomClauses;
        const clauseOrderJson = clauseOrder ? JSON.stringify(clauseOrder) : existing.ClauseOrder;

        const now = new Date();
        const result = await sql.query`
            INSERT INTO EnquiryQuotes (
                RequestNo, QuoteNumber, QuoteNo, RevisionNo, ValidityDays,
                PreparedBy, PreparedByEmail,
                ShowScopeOfWork, ShowBasisOfOffer, ShowExclusions, ShowPricingTerms,
                ShowSchedule, ShowWarranty, ShowResponsibilityMatrix, ShowTermsConditions, ShowAcceptance, ShowBillOfQuantity,
                ScopeOfWork, BasisOfOffer, Exclusions, PricingTerms,
                Schedule, Warranty, ResponsibilityMatrix, TermsConditions, Acceptance, BillOfQuantity,
                TotalAmount, Status, CustomClauses, ClauseOrder,
                QuoteDate, CustomerReference, Subject, Signatory, SignatoryDesignation, ToName, ToAddress, ToPhone, ToEmail, CreatedAt, UpdatedAt
            )
            OUTPUT INSERTED.ID, INSERTED.QuoteNumber
            VALUES (
                ${existing.RequestNo}, ${newQuoteNumber}, ${existing.QuoteNo}, ${newRevisionNo}, ${validityDays !== undefined ? validityDays : existing.ValidityDays},
                ${preparedBy || existing.PreparedBy}, ${preparedByEmail || existing.PreparedByEmail},
                ${showScopeOfWork !== undefined ? (showScopeOfWork ? 1 : 0) : existing.ShowScopeOfWork}, 
                ${showBasisOfOffer !== undefined ? (showBasisOfOffer ? 1 : 0) : existing.ShowBasisOfOffer}, 
                ${showExclusions !== undefined ? (showExclusions ? 1 : 0) : existing.ShowExclusions}, 
                ${showPricingTerms !== undefined ? (showPricingTerms ? 1 : 0) : existing.ShowPricingTerms},
                ${showSchedule !== undefined ? (showSchedule ? 1 : 0) : existing.ShowSchedule}, 
                ${showWarranty !== undefined ? (showWarranty ? 1 : 0) : existing.ShowWarranty}, 
                ${showResponsibilityMatrix !== undefined ? (showResponsibilityMatrix ? 1 : 0) : existing.ShowResponsibilityMatrix}, 
                ${showTermsConditions !== undefined ? (showTermsConditions ? 1 : 0) : existing.ShowTermsConditions}, 
                ${showAcceptance !== undefined ? (showAcceptance ? 1 : 0) : existing.ShowAcceptance}, 
                ${showBillOfQuantity !== undefined ? (showBillOfQuantity ? 1 : 0) : existing.ShowBillOfQuantity},
                ${scopeOfWork !== undefined ? scopeOfWork : existing.ScopeOfWork}, 
                ${basisOfOffer !== undefined ? basisOfOffer : existing.BasisOfOffer}, 
                ${exclusions !== undefined ? exclusions : existing.Exclusions}, 
                ${pricingTerms !== undefined ? pricingTerms : existing.PricingTerms},
                ${schedule !== undefined ? schedule : existing.Schedule}, 
                ${warranty !== undefined ? warranty : existing.Warranty}, 
                ${responsibilityMatrix !== undefined ? responsibilityMatrix : existing.ResponsibilityMatrix}, 
                ${termsConditions !== undefined ? termsConditions : existing.TermsConditions}, 
                ${acceptance !== undefined ? acceptance : existing.Acceptance}, 
                ${billOfQuantity !== undefined ? billOfQuantity : existing.BillOfQuantity},
                ${totalAmount !== undefined ? totalAmount : existing.TotalAmount}, 
                'Saved', 
                ${customClausesJson}, 
                ${clauseOrderJson},
                ${quoteDate !== undefined ? quoteDate : existing.QuoteDate}, 
                ${customerReference !== undefined ? customerReference : existing.CustomerReference}, 
                ${subject !== undefined ? subject : existing.Subject}, 
                ${signatory !== undefined ? signatory : existing.Signatory}, 
                ${signatoryDesignation !== undefined ? signatoryDesignation : existing.SignatoryDesignation}, 
                ${toName !== undefined ? toName : existing.ToName}, 
                ${toAddress !== undefined ? toAddress : existing.ToAddress}, 
                ${toPhone !== undefined ? toPhone : existing.ToPhone}, 
                ${toEmail !== undefined ? toEmail : existing.ToEmail}, ${now}, ${now}
            )
        `;

        console.log(`[Revise] Revision created successfully! New ID: ${result.recordset[0].ID}, QuoteNumber: ${result.recordset[0].QuoteNumber}`);

        res.json({
            success: true,
            id: result.recordset[0].ID,
            quoteNumber: result.recordset[0].QuoteNumber
        });

    } catch (err) {
        console.error('[Revise] Error creating revision:', err);
        res.status(500).json({ error: 'Failed to create revision', details: err.message });
    }
});

// DELETE /api/quotes/:id - Delete a quote
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await sql.query`DELETE FROM EnquiryQuotes WHERE ID = ${id} `;
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting quote:', err);
        res.status(500).json({ error: 'Failed to delete quote' });
    }
});

// POST /api/quotes/templates - Save a new template
router.post('/config/templates', async (req, res) => {
    try {
        const { templateName, clausesConfig, createdBy } = req.body;

        if (!templateName || !clausesConfig) {
            return res.status(400).json({ error: 'Template Name and Configuration are required' });
        }

        const configJson = JSON.stringify(clausesConfig);

        const now = new Date();
        const check = await sql.query`SELECT ID FROM QuoteTemplates WHERE TemplateName = ${templateName} `;
        if (check.recordset.length > 0) {
            await sql.query`
                UPDATE QuoteTemplates 
                SET ClausesConfig = ${configJson}, CreatedBy = ${createdBy}, CreatedAt = ${now}
                WHERE TemplateName = ${templateName}
        `;
            res.json({ success: true, message: 'Template updated' });
        } else {
            await sql.query`
                INSERT INTO QuoteTemplates(TemplateName, ClausesConfig, CreatedBy, CreatedAt)
        VALUES(${templateName}, ${configJson}, ${createdBy}, ${now})
            `;
            res.json({ success: true, message: 'Template saved' });
        }
    } catch (err) {
        console.error('Error saving template:', err);
        res.status(500).json({ error: 'Failed to save template', details: err.message });
    }
});

// DELETE /api/quotes/templates/:id - Delete a template
router.delete('/config/templates/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await sql.query`DELETE FROM QuoteTemplates WHERE ID = ${id} `;
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting template:', err);
        res.status(500).json({ error: 'Failed to delete template', details: err.message });
    }
});


// --- Quote Attachments ---

// GET /api/quotes/attachments/:quoteId - List all attachments for a quote
router.get('/attachments/:quoteId', async (req, res) => {
    try {
        const { quoteId } = req.params;
        const result = await sql.query`
            SELECT ID, QuoteID, FileName, UploadedAt 
            FROM QuoteAttachments 
            WHERE QuoteID = ${quoteId}
            ORDER BY UploadedAt DESC
        `;
        res.json(result.recordset);
    } catch (err) {
        console.error('Error fetching quote attachments:', err);
        res.status(500).json({ error: 'Failed to fetch attachments' });
    }
});

// POST /api/quotes/attachments/:quoteId - Upload attachments for a quote
router.post('/attachments/:quoteId', upload.array('files'), async (req, res) => {
    try {
        const { quoteId } = req.params;
        const files = req.files;

        if (!files || files.length === 0) {
            return res.status(400).json({ error: 'No files uploaded' });
        }

        const uploadedResults = [];
        for (const file of files) {
            const fileName = file.originalname;
            const filePath = file.path;

            const result = await sql.query`
                INSERT INTO QuoteAttachments (QuoteID, FileName, FilePath)
                VALUES (${quoteId}, ${fileName}, ${filePath});
                SELECT SCOPE_IDENTITY() AS ID;
            `;
            uploadedResults.push({ id: result.recordset[0].ID, fileName });
        }

        res.status(201).json({ message: 'Files uploaded successfully', files: uploadedResults });
    } catch (err) {
        console.error('Error uploading quote attachments:', err);
        res.status(500).json({ error: 'Failed to upload attachments' });
    }
});

// GET /api/quotes/attachments/download/:id - Download a quote attachment
router.get('/attachments/download/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await sql.query`
            SELECT FileName, FilePath FROM QuoteAttachments WHERE ID = ${id}
        `;
        const attachment = result.recordset[0];

        if (!attachment) {
            return res.status(404).json({ error: 'Attachment not found' });
        }

        if (fs.existsSync(attachment.FilePath)) {
            const disposition = req.query.download === 'true' ? 'attachment' : 'inline';
            res.setHeader('Content-Disposition', `${disposition}; filename="${attachment.FileName}"`);
            res.sendFile(path.resolve(attachment.FilePath));
        } else {
            res.status(404).json({ error: 'File not found on server' });
        }
    } catch (err) {
        console.error('Error downloading quote attachment:', err);
        res.status(500).json({ error: 'Failed to download attachment' });
    }
});

// DELETE /api/quotes/attachments/:id - Delete a quote attachment
router.delete('/attachments/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await sql.query`
            SELECT FilePath FROM QuoteAttachments WHERE ID = ${id}
        `;
        const attachment = result.recordset[0];

        if (attachment && fs.existsSync(attachment.FilePath)) {
            fs.unlinkSync(attachment.FilePath);
        }

        await sql.query`DELETE FROM QuoteAttachments WHERE ID = ${id}`;
        res.json({ message: 'Attachment deleted successfully' });
    } catch (err) {
        console.error('Error deleting quote attachment:', err);
        res.status(500).json({ error: 'Failed to delete attachment' });
    }
});

module.exports = router;

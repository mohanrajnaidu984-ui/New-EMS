const express = require('express');
const router = express.Router();
const sql = require('mssql');

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
                       EnquiryDate, DueDate
                FROM EnquiryMaster 
                WHERE RequestNo = ${requestNo}
            `;
            if (enquiryResult.recordset.length === 0) {
                console.log(`[Quote API] Enquiry not found for RequestNo: ${requestNo}`);
                return res.status(404).json({ error: 'Enquiry not found' });
            }
            enquiry = enquiryResult.recordset[0];
            // Polyfill missing columns
            enquiry.EnquiryType = 'Tender';
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
        let companyDetails = {
            code: 'AAC', // Default
            logo: null,
            name: 'Almoayyed Air Conditioning'
        };
        let enquiryForResult = { recordset: [] };

        try {
            // Fetch items and also join with Master to get Code and Logo and Address Details
            enquiryForResult = await sql.query`
                SELECT E.ItemName, M.DivisionCode, M.DepartmentCode, M.CompanyLogo, M.CompanyName, M.CommonMailIds, M.CCMailIds, M.Phone, M.Address, M.FaxNo
                FROM EnquiryFor E
                LEFT JOIN Master_EnquiryFor M ON E.ItemName = M.ItemName
                WHERE E.RequestNo = ${requestNo}
            `;

            divisions = enquiryForResult.recordset.map(r => r.ItemName);

            // Use the first valid DepartmentCode and Logo found
            const match = enquiryForResult.recordset.find(r => r.DepartmentCode || r.CompanyLogo || r.Address);
            if (match) {
                if (match.DepartmentCode) companyDetails.code = match.DepartmentCode;
                if (match.CompanyLogo) companyDetails.logo = match.CompanyLogo.replace(/\\/g, '/');
                if (match.CompanyName) companyDetails.name = match.CompanyName;
                if (match.Address) companyDetails.address = match.Address;
                if (match.Phone) companyDetails.phone = match.Phone;
                if (match.FaxNo) companyDetails.fax = match.FaxNo;
                // Use CommonMailIds as email source if available (first email)
                if (match.CommonMailIds) {
                    const emails = match.CommonMailIds.split(',');
                    if (emails.length > 0) companyDetails.email = emails[0].trim();
                }
            }

            console.log(`[Quote API] Found ${divisions.length} divisions. Code: ${companyDetails.code}`);
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

            if (enquiryForResult && enquiryForResult.recordset) {
                enquiryForResult.recordset.forEach(row => {
                    if (row.CommonMailIds) {
                        row.CommonMailIds.split(',').forEach(email => {
                            const e = email.trim();
                            if (e) preparedByOptions.push({ value: e, label: e, type: 'Common' });
                        });
                    }
                    if (row.CCMailIds) {
                        row.CCMailIds.split(',').forEach(email => {
                            const e = email.trim();
                            if (e) preparedByOptions.push({ value: e, label: e, type: 'CC' });
                        });
                    }
                });
            }

            if (enquiry.CreatedBy) {
                preparedByOptions.push({ value: enquiry.CreatedBy, label: enquiry.CreatedBy, type: 'Creator' });
            }

            preparedByOptions = preparedByOptions.filter((v, i, a) => a.findIndex(t => (t.value === v.value)) === i);
        } catch (err) {
            console.error('[Quote API] Error fetching Prepared By options:', err);
        }

        // Get Customer Options
        let customerOptions = [];
        try {
            const customerResult = await sql.query`SELECT CustomerName FROM EnquiryCustomer WHERE RequestNo = ${requestNo}`;
            customerResult.recordset.forEach(row => {
                if (row.CustomerName) customerOptions.push(row.CustomerName);
            });
            if (enquiry.CustomerName) customerOptions.push(enquiry.CustomerName);
            customerOptions = [...new Set(customerOptions)];
        } catch (err) {
            console.error('[Quote API] Error fetching Customer options:', err);
            if (enquiry.CustomerName) customerOptions.push(enquiry.CustomerName);
        }

        res.json({
            enquiry,
            customerDetails,
            divisions,
            divisionEmails: enquiryForResult.recordset.map(r => ({
                itemName: r.ItemName,
                commonMailIds: r.CommonMailIds,
                ccMailIds: r.CCMailIds
            })),
            companyDetails,
            preparedByOptions,
            customerOptions,
            quoteNumber: 'Draft'
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

        // Get next quote number
        const quoteCountResult = await sql.query`
            SELECT ISNULL(MAX(QuoteNo), 0) + 1 AS NextQuoteNo 
            FROM EnquiryQuotes 
            WHERE RequestNo = ${requestNo}
        `;
        const quoteNo = quoteCountResult.recordset[0].NextQuoteNo;
        const revisionNo = 0;
        const division = divisionCode || "AAC";
        const quoteNumber = `${division}/${requestNo}/${quoteNo}-R${revisionNo}`;

        const result = await sql.query`
            INSERT INTO EnquiryQuotes (
                RequestNo, QuoteNumber, QuoteNo, RevisionNo, ValidityDays,
                PreparedBy, PreparedByEmail,
                ShowScopeOfWork, ShowBasisOfOffer, ShowExclusions, ShowPricingTerms,
                ShowSchedule, ShowWarranty, ShowResponsibilityMatrix, ShowTermsConditions, ShowAcceptance, ShowBillOfQuantity,
                ScopeOfWork, BasisOfOffer, Exclusions, PricingTerms,
                Schedule, Warranty, ResponsibilityMatrix, TermsConditions, Acceptance, BillOfQuantity,
                TotalAmount, Status, CustomClauses, ClauseOrder,
                QuoteDate, CustomerReference, Subject, Signatory, SignatoryDesignation, ToName, ToAddress, ToPhone, ToEmail
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
                ${quoteDate}, ${customerReference}, ${subject}, ${signatory}, ${signatoryDesignation}, ${toName}, ${toAddress}, ${toPhone}, ${toEmail}
            )
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
        UpdatedAt = GETDATE()
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
            return res.status(404).json({ error: 'Quote not found' });
        }
        const existing = existingResult.recordset[0];
        const newRevisionNo = existing.RevisionNo + 1;

        const existingParts = existing.QuoteNumber ? existing.QuoteNumber.split("/") : [];
        const division = existingParts.length > 0 ? existingParts[0] : "AAC";
        const newQuoteNumber = `${division}/${existing.RequestNo}/${existing.QuoteNo}-R${newRevisionNo}`;

        const customClausesJson = customClauses ? JSON.stringify(customClauses) : existing.CustomClauses;
        const clauseOrderJson = clauseOrder ? JSON.stringify(clauseOrder) : existing.ClauseOrder;

        const result = await sql.query`
            INSERT INTO EnquiryQuotes (
                RequestNo, QuoteNumber, QuoteNo, RevisionNo, ValidityDays,
                PreparedBy, PreparedByEmail,
                ShowScopeOfWork, ShowBasisOfOffer, ShowExclusions, ShowPricingTerms,
                ShowSchedule, ShowWarranty, ShowResponsibilityMatrix, ShowTermsConditions, ShowAcceptance, ShowBillOfQuantity,
                ScopeOfWork, BasisOfOffer, Exclusions, PricingTerms,
                Schedule, Warranty, ResponsibilityMatrix, TermsConditions, Acceptance, BillOfQuantity,
                TotalAmount, Status, CustomClauses, ClauseOrder,
                QuoteDate, CustomerReference, Subject, Signatory, SignatoryDesignation, ToName, ToAddress, ToPhone, ToEmail
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
                ${toEmail !== undefined ? toEmail : existing.ToEmail}
            )
        `;

        res.json({
            success: true,
            id: result.recordset[0].ID,
            quoteNumber: result.recordset[0].QuoteNumber
        });

    } catch (err) {
        console.error('Error creating revision:', err);
        res.status(500).json({ error: 'Failed to create revision' });
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

        const check = await sql.query`SELECT ID FROM QuoteTemplates WHERE TemplateName = ${templateName} `;
        if (check.recordset.length > 0) {
            await sql.query`
                UPDATE QuoteTemplates 
                SET ClausesConfig = ${configJson}, CreatedBy = ${createdBy}, CreatedAt = GETDATE()
                WHERE TemplateName = ${templateName}
        `;
            res.json({ success: true, message: 'Template updated' });
        } else {
            await sql.query`
                INSERT INTO QuoteTemplates(TemplateName, ClausesConfig, CreatedBy)
        VALUES(${templateName}, ${configJson}, ${createdBy})
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

module.exports = router;

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

router.get('/list/pending', async (req, res) => {
    try {
        let { userEmail } = req.query;
        if (userEmail) {
            userEmail = userEmail.toLowerCase().replace(/@almcg\.com/g, '@almoayyedcg.com').trim();
        }
        console.log(`[API] Check Pending Quotes for ${userEmail || 'All'}...`);

        let isAdmin = false;
        if (userEmail) {
            const userRes = await sql.query`SELECT Roles FROM Master_ConcernedSE WHERE EmailId = ${userEmail}`;
            if (userRes.recordset.length > 0) {
                isAdmin = userRes.recordset[0].Roles === 'Admin';
            }
        }

        let query;
        if (userEmail && !isAdmin) {
            // Refined logic for specific user's division
            query = `
                SELECT DISTINCT 
                    E.RequestNo, E.ProjectName, E.CustomerName, E.ClientName, E.ConsultantName, E.EnquiryDate, E.DueDate, E.Status,
                    (
                        SELECT STUFF((
                            SELECT DISTINCT ';;' + qt.ToName + '|' + FORMAT(ISNULL(qt.TotalAmount, 0), 'N2')
                            FROM EnquiryQuotes qt
                            WHERE qt.RequestNo = E.RequestNo
                            AND ISNULL(qt.TotalAmount, 0) > 0
                            AND qt.RevisionNo = (
                                SELECT MAX(rx.RevisionNo) 
                                FROM EnquiryQuotes rx 
                                WHERE rx.QuoteNo = qt.QuoteNo
                            )
                            FOR XML PATH(''), TYPE
                        ).value('.', 'NVARCHAR(MAX)'), 1, 2, '')
                    ) as QuotedCustomers,
                    (
                        SELECT STUFF((
                            SELECT ', ' + ItemName 
                            FROM EnquiryFor 
                            WHERE RequestNo = E.RequestNo 
                            FOR XML PATH('')
                        ), 1, 2, '')
                    ) as Divisions,
                    (
                        SELECT STUFF((
                            SELECT ';;' + CustomerName + '|' + CAST(SUM(LatestPrice) AS VARCHAR)
                            FROM (
                                SELECT 
                                    po2.CustomerName,
                                    pv2.Price as LatestPrice,
                                    ROW_NUMBER() OVER (
                                        PARTITION BY po2.CustomerName, ISNULL(CAST(pv2.EnquiryForID AS VARCHAR), pv2.EnquiryForItem) 
                                        ORDER BY pv2.UpdatedAt DESC
                                    ) as rn
                                FROM EnquiryPricingOptions po2
                                JOIN EnquiryPricingValues pv2 ON po2.ID = pv2.OptionID
                                WHERE po2.RequestNo = E.RequestNo
                            ) t
                            WHERE rn = 1
                            GROUP BY CustomerName
                            HAVING SUM(LatestPrice) > 0
                            FOR XML PATH(''), TYPE
                        ).value('.', 'NVARCHAR(MAX)'), 1, 2, '')
                    ) as PricingCustomerDetails,
                    (
                        SELECT STUFF((
                            SELECT DISTINCT ',' + CAST(EF2.ID AS VARCHAR)
                            FROM EnquiryFor EF2
                            JOIN Master_EnquiryFor MEF2 ON (
                                EF2.ItemName = MEF2.ItemName OR 
                                EF2.ItemName LIKE '%- ' + MEF2.ItemName OR 
                                EF2.ItemName LIKE '%- ' + MEF2.DivisionCode OR
                                MEF2.ItemName LIKE '%' + EF2.ItemName + '%'
                            )
                            WHERE EF2.RequestNo = E.RequestNo
                            AND (
                                REPLACE(MEF2.CommonMailIds, '@almcg.com', '@almoayyedcg.com') LIKE '%${userEmail}%' OR 
                                REPLACE(MEF2.CCMailIds, '@almcg.com', '@almoayyedcg.com') LIKE '%${userEmail}%'
                            )
                            FOR XML PATH(''), TYPE
                        ).value('.', 'NVARCHAR(MAX)'), 1, 1, '')
                    ) as ScopedJobIDs
                FROM EnquiryMaster E
                JOIN EnquiryPricingOptions PO ON E.RequestNo = PO.RequestNo
                JOIN EnquiryPricingValues PV ON PO.ID = PV.OptionID
                JOIN EnquiryFor EF ON E.RequestNo = EF.RequestNo 
                JOIN Master_EnquiryFor MEF ON (
                    EF.ItemName = MEF.ItemName OR 
                    EF.ItemName LIKE '%- ' + MEF.ItemName OR
                    EF.ItemName LIKE '%- ' + MEF.DivisionCode OR
                    MEF.ItemName LIKE '%' + EF.ItemName + '%'
                )
                LEFT JOIN EnquiryQuotes Q ON Q.RequestNo = E.RequestNo 
                    AND Q.ToName = PO.CustomerName 
                    AND (
                        Q.QuoteNumber LIKE '%/' + MEF.DivisionCode + '/%' OR 
                        Q.QuoteNumber LIKE '%/' + MEF.ItemName + '/%'
                    )
                WHERE PV.Price > 0
                AND (
                    REPLACE(MEF.CommonMailIds, '@almcg.com', '@almoayyedcg.com') LIKE '%${userEmail}%' OR 
                    REPLACE(MEF.CCMailIds, '@almcg.com', '@almoayyedcg.com') LIKE '%${userEmail}%'
                )
                AND (
                    EF.ItemName = PO.ItemName OR 
                    EF.ItemName LIKE PO.ItemName + '%' OR 
                    PO.ItemName LIKE EF.ItemName + '%'
                )
                AND Q.ID IS NULL
                ORDER BY E.DueDate DESC, E.RequestNo DESC
            `;
        } else {
            // Admin or Fallback (Show all with prices but no quotes)
            query = `
                SELECT DISTINCT 
                    E.RequestNo, E.ProjectName, E.CustomerName, E.ClientName, E.ConsultantName, E.EnquiryDate, E.DueDate, E.Status,
                    (
                        SELECT STUFF((
                            SELECT DISTINCT ';;' + qt.ToName + '|' + FORMAT(ISNULL(qt.TotalAmount, 0), 'N2')
                            FROM EnquiryQuotes qt
                            WHERE qt.RequestNo = E.RequestNo
                            AND ISNULL(qt.TotalAmount, 0) > 0
                            AND qt.RevisionNo = (
                                SELECT MAX(rx.RevisionNo) 
                                FROM EnquiryQuotes rx 
                                WHERE rx.QuoteNo = qt.QuoteNo
                            )
                            FOR XML PATH(''), TYPE
                        ).value('.', 'NVARCHAR(MAX)'), 1, 2, '')
                    ) as QuotedCustomers,
                    (
                        SELECT STUFF((
                            SELECT ', ' + ItemName 
                            FROM EnquiryFor 
                            WHERE RequestNo = E.RequestNo 
                            FOR XML PATH('')
                        ), 1, 2, '')
                    ) as Divisions,
                    (
                        SELECT STUFF((
                            SELECT ';;' + CustomerName + '|' + CAST(SUM(LatestPrice) AS VARCHAR)
                            FROM (
                                SELECT 
                                    po2.CustomerName,
                                    pv2.Price as LatestPrice,
                                    ROW_NUMBER() OVER (
                                        PARTITION BY po2.CustomerName, ISNULL(CAST(pv2.EnquiryForID AS VARCHAR), pv2.EnquiryForItem) 
                                        ORDER BY pv2.UpdatedAt DESC
                                    ) as rn
                                FROM EnquiryPricingOptions po2
                                JOIN EnquiryPricingValues pv2 ON po2.ID = pv2.OptionID
                                WHERE po2.RequestNo = E.RequestNo
                            ) t
                            WHERE rn = 1
                            GROUP BY CustomerName
                            HAVING SUM(LatestPrice) > 0
                            FOR XML PATH(''), TYPE
                        ).value('.', 'NVARCHAR(MAX)'), 1, 2, '')
                    ) as PricingCustomerDetails,
                    (
                        SELECT STUFF((
                            SELECT DISTINCT ',' + CAST(ID AS VARCHAR)
                            FROM EnquiryFor
                            WHERE RequestNo = E.RequestNo AND (ParentID IS NULL OR ParentID = '0' OR ParentID = 0)
                            FOR XML PATH(''), TYPE
                        ).value('.', 'NVARCHAR(MAX)'), 1, 1, '')
                    ) as ScopedJobIDs
                FROM EnquiryMaster E
                JOIN EnquiryPricingOptions PO ON E.RequestNo = PO.RequestNo
                JOIN EnquiryPricingValues PV ON PO.ID = PV.OptionID
                JOIN EnquiryFor EF ON E.RequestNo = EF.RequestNo
                JOIN Master_EnquiryFor MEF ON (
                    EF.ItemName = MEF.ItemName OR 
                    EF.ItemName LIKE '%- ' + MEF.ItemName OR
                    MEF.ItemName LIKE '%' + EF.ItemName + '%'
                )
                LEFT JOIN EnquiryQuotes Q ON Q.RequestNo = E.RequestNo 
                    AND Q.ToName = PO.CustomerName 
                    AND (
                        Q.QuoteNumber LIKE '%/' + MEF.DivisionCode + '/%' OR 
                        Q.QuoteNumber LIKE '%/' + MEF.ItemName + '/%'
                    )
                WHERE PV.Price > 0
                AND (
                    EF.ItemName = PO.ItemName OR 
                    EF.ItemName LIKE PO.ItemName + '%' OR 
                    PO.ItemName LIKE EF.ItemName + '%'
                )
                AND Q.ID IS NULL
                ORDER BY E.DueDate DESC, E.RequestNo DESC
            `;
        }

        const result = await sql.query(query);
        const enquiries = result.recordset;

        if (enquiries.length > 0) {
            const requestNos = enquiries.map(e => `'${e.RequestNo}'`).join(',');

            // Fetch Jobs
            const jobsRes = await sql.query(`
                SELECT EF.RequestNo, EF.ID, EF.ParentID, EF.ItemName, EF.LeadJobCode
                FROM EnquiryFor EF
                WHERE EF.RequestNo IN (${requestNos})
            `);
            const allJobs = jobsRes.recordset;

            // Fetch Prices
            // Fetch Prices - Only Latest Per Job/Customer
            const pricesRes = await sql.query(`
                SELECT RequestNo, EnquiryForID, EnquiryForItem, Price, UpdatedAt, CustomerName
                FROM (
                    SELECT PV.RequestNo, PV.EnquiryForID, PV.EnquiryForItem, PV.Price, PV.UpdatedAt, PO.CustomerName,
                           ROW_NUMBER() OVER (
                               PARTITION BY PV.RequestNo, PO.CustomerName, ISNULL(CAST(PV.EnquiryForID AS VARCHAR), PV.EnquiryForItem) 
                               ORDER BY PV.UpdatedAt DESC
                           ) as rn
                    FROM EnquiryPricingValues PV
                    JOIN EnquiryPricingOptions PO ON PV.OptionID = PO.ID
                    WHERE PV.RequestNo IN (${requestNos})
                ) t
                WHERE rn = 1
            `);
            const allPrices = pricesRes.recordset;

            console.log(`[API] Found ${allJobs.length} jobs and ${allPrices.length} prices for ${enquiries.length} enquiries.`);

            // Map subjob prices for each enquiry
            const mappedEnquiries = enquiries.map(enq => {
                const enqRequestNo = enq.RequestNo?.toString().trim();
                if (!enqRequestNo) return null;

                const enqJobs = allJobs.filter(j => j.RequestNo?.toString().trim() == enqRequestNo);
                const enqPrices = allPrices.filter(p => p.RequestNo?.toString().trim() == enqRequestNo);

                // Build hierarchy
                const childrenMap = {};
                enqJobs.forEach(j => {
                    if (j.ParentID && j.ParentID != '0') {
                        if (!childrenMap[j.ParentID]) childrenMap[j.ParentID] = [];
                        childrenMap[j.ParentID].push(j);
                    }
                });

                const roots = enqJobs.filter(j => !j.ParentID || j.ParentID == '0' || j.ParentID == 0);
                const flatList = [];
                const traverse = (job, level) => {
                    flatList.push({ ...job, level });
                    const children = childrenMap[job.ID] || [];
                    children.sort((a, b) => a.ID - b.ID);
                    children.forEach(child => traverse(child, level + 1));
                };
                roots.forEach(root => traverse(root, 0));

                // Filter flatList by ScopedJobIDs (User's responsibility)
                const scopedJobIDsStr = (enq.ScopedJobIDs || '').toString().split(',').map(id => id.trim()).filter(Boolean);
                const scopedJobIDsSet = new Set(scopedJobIDsStr);

                // Identify all IDs that are descendants of scoped IDs
                const validIDs = new Set();
                const collectDescendants = (id) => {
                    validIDs.add(id.toString());
                    const children = childrenMap[id] || [];
                    children.forEach(c => collectDescendants(c.ID));
                };
                scopedJobIDsStr.forEach(id => collectDescendants(id));

                // Indentation adjustment
                let minLevel = 0;
                const scopedJobs = flatList.filter(j => scopedJobIDsSet.has(j.ID.toString()));
                if (scopedJobs.length > 0) {
                    minLevel = Math.min(...scopedJobs.map(j => j.level || 0));
                }

                const normalize = str => str.toLowerCase().replace(/[^a-z0-9]/g, '');

                // Identify Root and Job Names for Aggregation
                const rootJob = enqJobs.find(j => !j.ParentID || j.ParentID == '0' || j.ParentID == 0);
                const internalCustomer = rootJob ? rootJob.ItemName.trim() : 'Internal';
                const internalCustomerNorm = normalize(internalCustomer);
                const jobNameSetNorm = new Set(enqJobs.map(j => normalize(j.ItemName)));

                // Filter enq.CustomerName (External Customers only, hide subjobs)
                let externalCustomers = (enq.CustomerName || '').split(',').map(c => c.trim()).filter(Boolean);
                externalCustomers = externalCustomers.filter(c => {
                    const cNorm = normalize(c);
                    // Keep if it's NOT a job name. Internal customers are handled separately via aggregatedPricing.
                    return !jobNameSetNorm.has(cNorm);
                });

                const filteredFlatList = flatList.filter(job => validIDs.has(job.ID.toString()));

                // Pre-calculate Individual (Self) Prices (Latest Only) - STRICTLY Internal
                const selfPrices = {};
                const updateDates = {};
                flatList.forEach(job => {
                    const matches = enqPrices.filter(p =>
                        (p.EnquiryForID && p.EnquiryForID.toString() == job.ID.toString())
                    );

                    // Fallback to ItemName match ONLY for legacy records with no ID
                    let finalMatches = matches;
                    if (finalMatches.length === 0) {
                        finalMatches = enqPrices.filter(p => !p.EnquiryForID && p.EnquiryForItem && p.EnquiryForItem.toString().trim() == job.ItemName.toString().trim());
                    }

                    const sortedMatches = [...finalMatches].sort((a, b) => new Date(b.UpdatedAt) - new Date(a.UpdatedAt));

                    // For Subjob Prices tree, strictly use the internal customer view or divisions
                    let priceRow = sortedMatches.find(p => p.Price > 0 && p.CustomerName && (
                        normalize(p.CustomerName) === internalCustomerNorm ||
                        jobNameSetNorm.has(normalize(p.CustomerName))
                    ));

                    if (!priceRow) priceRow = sortedMatches.find(p => p.Price > 0);
                    if (!priceRow && sortedMatches.length > 0) priceRow = sortedMatches[0];

                    selfPrices[job.ID] = priceRow ? parseFloat(priceRow.Price || 0) : 0;
                    updateDates[job.ID] = priceRow ? priceRow.UpdatedAt : null;
                });

                // Recursive Sum function
                const getRecursivePrice = (jobID) => {
                    let total = selfPrices[jobID] || 0;
                    const children = childrenMap[jobID] || [];
                    children.forEach(c => { total += getRecursivePrice(c.ID); });
                    return total;
                };

                const subJobPrices = filteredFlatList.map(job => {
                    const totalVal = selfPrices[job.ID] || 0;
                    const updatedAt = updateDates[job.ID];
                    const displayLevel = Math.max(0, (job.level || 0) - minLevel);
                    const displayName = job.LeadJobCode ? `${job.ItemName} (${job.LeadJobCode})` : job.ItemName;

                    return `${displayName}|${totalVal > 0 ? totalVal.toFixed(2) : 'Not Updated'}|${updatedAt ? new Date(updatedAt).toISOString() : ''}|${displayLevel}`;
                }).join(';;');

                // Aggregate PricingCustomerDetails (Hide Subjobs, Aggregate to Root)
                let aggregatedPricing = {};
                if (enq.PricingCustomerDetails) {
                    enq.PricingCustomerDetails.split(';;').forEach(p => {
                        const parts = p.split('|');
                        const name = parts[0]?.trim();
                        const val = parseFloat(parts[1]) || 0;
                        if (!name) return;

                        const nameNorm = normalize(name);
                        if (jobNameSetNorm.has(nameNorm)) {
                            // It's a job name (Internal) -> keep as original name (Parent Job)
                            aggregatedPricing[name] = (aggregatedPricing[name] || 0) + val;
                        } else {
                            // It's an external customer
                            aggregatedPricing[name] = (aggregatedPricing[name] || 0) + val;
                        }
                    });
                }

                const finalPricingStr = Object.entries(aggregatedPricing)
                    .map(([name, val]) => `${name}|${val.toFixed(2)}`)
                    .join(';;');

                // Final Customer List is External + any Internal Parent who received pricing
                const finalCustomerSet = new Set(externalCustomers);
                Object.keys(aggregatedPricing).forEach(k => finalCustomerSet.add(k));

                // EXPLICIT FILTER: Remove any existing customer name that is a sub-job
                // or if it matches the current user's division (for specific user view)
                const userDivisionKey = userEmail ? userEmail.split('@')[0].toLowerCase() : '';
                const finalCustomers = Array.from(finalCustomerSet).filter(c => {
                    const cNorm = normalize(c);
                    // Provision: Keep any customer that has actual pricing aggregation (Parent Jobs)
                    if (aggregatedPricing[c]) return true;

                    if (jobNameSetNorm.has(cNorm)) return false; // Filter subjob names that don't have pricing for us
                    if (userDivisionKey && cNorm.includes(userDivisionKey)) return false; // Filter own division
                    return true;
                });

                const fullCustomerName = finalCustomers.join(', ');

                if (enq.RequestNo == '51') {
                    console.log(`[DEBUG 51] Root: ${internalCustomer}, External:`, externalCustomers);
                    console.log(`[DEBUG 51] JobSet:`, Array.from(jobNameSetNorm));
                    console.log(`[DEBUG 51] Final Customer Set:`, Array.from(finalCustomerSet));
                    console.log(`[DEBUG 51] Final Customers Array:`, finalCustomers);
                    console.log(`[DEBUG 51] Final Pricing Str:`, finalPricingStr);
                }

                return {
                    RequestNo: enq.RequestNo,
                    ProjectName: enq.ProjectName,
                    CustomerName: fullCustomerName,
                    PricingCustomerDetails: finalPricingStr,
                    ClientName: enq.ClientName || enq.clientname || '-',
                    ConsultantName: enq.ConsultantName || enq.consultantname || '-',
                    EnquiryDate: enq.EnquiryDate,
                    DueDate: enq.DueDate,
                    Status: enq.Status,
                    Divisions: enq.Divisions,
                    QuotedCustomers: enq.QuotedCustomers,
                    SubJobPrices: subJobPrices
                };
            }).filter(Boolean);

            if (mappedEnquiries.length > 0) {
                console.log(`[API] FINAL DATA Enq 0:`, {
                    ReqNo: mappedEnquiries[0].RequestNo,
                    Client: mappedEnquiries[0].ClientName,
                    Consultant: mappedEnquiries[0].ConsultantName,
                    SubJobPricesLen: mappedEnquiries[0].SubJobPrices?.length
                });
            }

            console.log(`[API] Pending Quotes found: ${mappedEnquiries.length}`);
            res.json(mappedEnquiries);
        } else {
            res.json([]);
        }
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

// GET /api/quotes/by-enquiry/:requestNo - Get all quotes for an enquiry
router.get('/by-enquiry/:requestNo', async (req, res) => {
    try {
        const { requestNo } = req.params;
        console.log(`[Quote API] Fetching all quotes for RequestNo: ${requestNo}`);

        const result = await sql.query`
            SELECT ID, QuoteNumber, QuoteDate, ToName, ToAddress, ToPhone, ToEmail, 
                   Subject, CustomerReference, ValidityDays, PreparedBy, PreparedByEmail,
                   Signatory, SignatoryDesignation, Status, RevisionNo, TotalAmount, QuoteNo,
                   RequestNo, CreatedAt, UpdatedAt,
                   ShowScopeOfWork, ShowBasisOfOffer, ShowExclusions, ShowPricingTerms,
                   ShowSchedule, ShowWarranty, ShowResponsibilityMatrix, ShowTermsConditions, ShowAcceptance, ShowBillOfQuantity,
                   ScopeOfWork, BasisOfOffer, Exclusions, PricingTerms,
                   Schedule, Warranty, ResponsibilityMatrix, TermsConditions, Acceptance, BillOfQuantity,
                   CustomClauses, ClauseOrder
            FROM EnquiryQuotes 
            WHERE RequestNo = ${requestNo}
            ORDER BY QuoteNo, RevisionNo DESC
        `;

        console.log(`[Quote API] Found ${result.recordset.length} quotes for RequestNo ${requestNo}`);
        res.json(result.recordset);
    } catch (err) {
        console.error('[Quote API] Error fetching quotes for enquiry:', err);
        console.error('[Quote API] Error details:', err.message);
        console.error('[Quote API] Stack:', err.stack);
        res.status(500).json({ error: 'Failed to fetch quotes', details: err.message });
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
        let divisionsList = [];
        let leadJobPrefix = '';
        let companyDetails = {
            code: 'AAC', // Default
            logo: null,
            name: 'Almoayyed Air Conditioning'
        };
        let availableProfiles = [];
        let divisionsHierarchy = []; // Declare at top level for response

        let resolvedItems = [];
        let rawItems = [];
        try {
            // 1. Fetch raw items with Hierarchy (Join Master to get Default Assignments)
            // Use REPLACE/STUFF or logic to match both "L1 - Civil Project" and "Civil Project"
            const rawItemsResult = await sql.query`
                SELECT EF.ID, EF.ParentID, EF.ItemName, EF.LeadJobCode, MEF.CommonMailIds, MEF.CCMailIds 
                FROM EnquiryFor EF
                LEFT JOIN Master_EnquiryFor MEF ON (
                    EF.ItemName = MEF.ItemName OR 
                    (EF.ItemName LIKE 'L[0-9] - %' AND SUBSTRING(EF.ItemName, 6, LEN(EF.ItemName)) = MEF.ItemName) OR
                    (EF.ItemName LIKE 'Sub Job - %' AND SUBSTRING(EF.ItemName, 11, LEN(EF.ItemName)) = MEF.ItemName)
                )
                WHERE EF.RequestNo = ${requestNo}`;
            rawItems = rawItemsResult.recordset;

            // Helper to get Parent
            const getParent = (id) => rawItems.find(i => i.ID === id);

            // Filter Divisions based on User Access (Scope)
            const userEmail = req.query.userEmail || '';
            const fs = require('fs');
            const logPath = require('path').join(__dirname, '..', 'debug_quote_api.log');
            const log = (msg) => fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${msg}\n`);

            log(`--- Enquiry Data Fetch for ${requestNo} ---`);
            log(`User: ${userEmail}`);
            log(`Raw Items Count: ${rawItems.length}`);
            rawItems.forEach(i => log(`Item: ID=${i.ID}, ParentID=${i.ParentID}, Name=${i.ItemName}`));

            divisionsList = rawItems.map(r => r.ItemName); // Default all

            if (userEmail) {
                // Fetch User Role
                const userRes = await sql.query`SELECT Roles FROM Master_ConcernedSE WHERE EmailId = ${userEmail}`;
                const userRole = userRes.recordset.length > 0 ? userRes.recordset[0].Roles : '';
                const isAdmin = userRole === 'Admin';

                if (!isAdmin) {
                    const normalizedUser = userEmail.toLowerCase().replace(/@almcg\.com/g, '@almoayyedcg.com');
                    const userPrefix = normalizedUser.split('@')[0];

                    // Find items explicitly assigned to user
                    const userScopeItems = rawItems.filter(item => {
                        const mails = [item.CommonMailIds, item.CCMailIds].filter(Boolean).join(',').toLowerCase();
                        const normalizedMails = mails.replace(/@almcg\.com/g, '@almoayyedcg.com');

                        return normalizedMails.includes(normalizedUser) ||
                            (userPrefix && normalizedMails.split(',').some(m => m.trim().startsWith(userPrefix + '@')));
                    });

                    if (userScopeItems.length > 0) {
                        const accessRoots = new Set();
                        userScopeItems.forEach(scopeItem => {
                            // Add the assigned sub-job itself (allows quoting to parent)
                            accessRoots.add(scopeItem.ItemName);

                            let curr = scopeItem;
                            // Traverse up to Root and add it (allows viewing whole project)
                            while (curr.ParentID) {
                                const p = getParent(curr.ParentID);
                                if (p) curr = p;
                                else break;
                            }
                            accessRoots.add(curr.ItemName);
                        });
                        divisionsList = Array.from(accessRoots).sort();
                    } else {
                        // If no assignments, keep default (empty list will be returned if next checks fail)
                        divisionsList = [];
                    }
                }
            }

            // Hierarchy Structure for Frontend Logic
            divisionsHierarchy = rawItems.map(r => ({
                id: r.ID,
                parentId: r.ParentID,
                itemName: r.ItemName,
                commonMailIds: r.CommonMailIds,
                ccMailIds: r.CCMailIds,
                leadJobCode: r.LeadJobCode
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

                    // Only add to available profiles IF the user is DIRECTLY assigned to this division
                    const normalizedUser = userEmail.toLowerCase().replace(/@almcg\.com/g, '@almoayyedcg.com');
                    const userPrefix = normalizedUser.split('@')[0];
                    const mails = [item.CommonMailIds, item.CCMailIds].filter(Boolean).join(',').toLowerCase();
                    const normalizedMails = mails.replace(/@almcg\.com/g, '@almoayyedcg.com');

                    const userIsDirectlyAssigned = normalizedMails.includes(normalizedUser) ||
                        (userPrefix && normalizedMails.split(',').some(m => m.trim().startsWith(userPrefix + '@')));

                    if (userIsDirectlyAssigned && (masterData.DivisionCode || masterData.DepartmentCode)) {
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
                            itemName: item.ItemName, // Explicitly use the transaction item name
                            id: item.ID
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
            let leadItem = resolvedItems.find(r => r.ItemName && r.ItemName.startsWith('L1')) || resolvedItems.find(r => r.LeadJobCode === 'L1') || resolvedItems[0];

            if (leadItem && leadItem.LeadJobCode) {
                leadJobPrefix = leadItem.LeadJobCode;
            } else {
                leadJobPrefix = leadItem ? leadItem.ItemName.split('-')[0].trim() : '';
            }

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

            console.log(`[Quote API] Found ${divisionsList.length} divisions. Default Profile: ${companyDetails.divisionCode}`);
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
                        // Check for existence case-insensitively
                        const exists = customerOptions.some(existing => existing.toLowerCase() === trimmed.toLowerCase());
                        if (!exists) {
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

            // --- HIERARCHY LOGIC: Add Parent Jobs as Internal Customers (mimic Pricing Module) ---
            if (rawItems && rawItems.length > 0) {
                // 1. Explicitly identify and add the ROOT job
                const rootItem = rawItems.find(r => !r.ParentID || r.ParentID == '0' || r.ParentID == 0);
                if (rootItem) {
                    const cleanRoot = String(rootItem.ItemName || '').replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim();
                    const exists = customerOptions.some(existing => String(existing || '').toLowerCase() === cleanRoot.toLowerCase());
                    if (cleanRoot && !exists) {
                        customerOptions.push(cleanRoot);
                    }
                }

                // 2. Add other intermediate parent jobs
                rawItems.forEach(item => {
                    if (item.ParentID && item.ParentID != '0') {
                        const pid = String(item.ParentID);
                        const parent = rawItems.find(p => String(p.ID) === pid);
                        if (parent) {
                            const cleanParent = String(parent.ItemName || '').replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim();
                            const exists = customerOptions.some(existing => String(existing || '').toLowerCase() === cleanParent.toLowerCase());

                            if (cleanParent && !exists) {
                                customerOptions.push(cleanParent);
                            }
                        }
                    }
                });
            }

            // Final Deduplication (Case-insensitive)
            const uniqueOptions = [];
            const seenOptions = new Set();
            customerOptions.forEach(opt => {
                const lower = String(opt || '').trim().toLowerCase();
                if (lower && !seenOptions.has(lower)) {
                    seenOptions.add(lower);
                    uniqueOptions.push(opt);
                }
            });
            customerOptions = uniqueOptions;

            console.log('[Quote API] Final customerOptions:', customerOptions);
        } catch (err) {
            console.error('[Quote API] Error fetching Customer options:', err);
            // Deduplicate even in error case to prevent UI noise
            const uniqueOptions = [];
            const seenOptions = new Set();
            customerOptions.forEach(opt => {
                const lower = String(opt || '').trim().toLowerCase();
                if (lower && !seenOptions.has(lower)) {
                    seenOptions.add(lower);
                    uniqueOptions.push(opt);
                }
            });
            customerOptions = uniqueOptions;
        }

        res.json({
            enquiry,
            customerDetails,
            divisions: divisionsList,
            companyDetails,
            availableProfiles,
            preparedByOptions,
            customerOptions,
            customerContacts,
            leadJobPrefix,
            divisionEmails: resolvedItems.map(item => ({
                itemName: item.ItemName,
                ccMailIds: [item.CommonMailIds, item.CCMailIds].filter(Boolean).join(','),
                commonMailIds: item.CommonMailIds || ''
            })),
            quoteNumber: 'Draft',
            divisionsHierarchy  // Return full hierarchy
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

        const dept = departmentCode || "GEN";
        const division = divisionCode || "AAC";

        // --- FETCH LEAD JOB CODE ---
        // Try to find the LeadJobCode for the root item of this enquiry to use in reference
        let finalLeadJobCode = leadJobPrefix;
        try {
            // Find Root item LeadJobCode (L1, L2...)
            const codeResult = await sql.query`
                SELECT LeadJobCode FROM EnquiryFor 
                WHERE RequestNo = ${requestNo} AND ParentID IS NULL
            `;
            if (codeResult.recordset.length > 0 && codeResult.recordset[0].LeadJobCode) {
                finalLeadJobCode = codeResult.recordset[0].LeadJobCode;
            } else {
                // If no root code, maybe current item code?
                const itemResult = await sql.query`
                    SELECT LeadJobCode FROM EnquiryFor 
                    WHERE RequestNo = ${requestNo} AND ItemName = ${leadJobPrefix}
                `;
                if (itemResult.recordset.length > 0 && itemResult.recordset[0].LeadJobCode) {
                    finalLeadJobCode = itemResult.recordset[0].LeadJobCode;
                }
            }
        } catch (e) {
            console.error('Error fetching LeadJobCode:', e);
        }

        const requestRef = finalLeadJobCode ? `${requestNo}-${finalLeadJobCode}` : requestNo;


        // Get next quote number - UNIQUE PER ENQUIRY (GLOBAL SEQUENCE)
        // User requested: "continuation serial next number of quote number" 
        // This means regardless of Dept/Div, numbers should be 1, 2, 3... for Enquiry 50.

        const existingQuotesResult = await sql.query`
            SELECT ISNULL(MAX(QuoteNo), 0) AS MaxQuoteNo
            FROM EnquiryQuotes
            -- WHERE RequestNo = ${requestNo} -- Global Serial Logic requested by user        `;

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
                ${quoteDate ? quoteDate.split('T')[0] : null}, ${customerReference}, ${subject}, ${signatory}, ${signatoryDesignation}, ${toName}, ${toAddress}, ${toPhone}, ${toEmail}, ${now}, ${now}
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
        QuoteDate = ${quoteDate ? quoteDate.split('T')[0] : null},
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

        const cleanQuoteDate = quoteDate ? quoteDate.split('T')[0] : null;

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
                ${cleanQuoteDate !== null ? cleanQuoteDate : (existing.QuoteDate ? existing.QuoteDate.toISOString().split('T')[0] : null)}, 
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

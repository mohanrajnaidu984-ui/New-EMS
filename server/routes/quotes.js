const express = require('express');
const router = express.Router();
const sql = require('mssql');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const {
    resolvePricingAccessContext,
    getPricingAnchorJobs,
    expandVisibleJobIdsFromAnchors,
    userHasQuotePricingEnquiryAccess,
    normalizePricingJobName,
} = require('../lib/quotePricingAccess');
const mapQuoteListingRows = require('../lib/mapQuoteListingRows');
const runPendingQuoteListQuery = require('../lib/pendingQuoteListQuery');
const runQuotedQuoteListQuery = require('../lib/quotedQuoteListQuery');
const buildQuoteListSearchExtraWhere = require('../lib/buildQuoteListSearchExtraWhere');
const { sendGeneralEmail } = require('../emailService');

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

/**
 * Master_EnquiryFor resolves creator department/div — only replace OwnJob with that department when the client
 * did not send a different job/branch name (e.g. direct subjob tab = "HVAC Project" while login dept is "Civil").
 */
function applyOwnJobAfterDepartmentLookup(currentOwnJob, userDept) {
    const oj = String(currentOwnJob || '').trim();
    const ud = String(userDept || '').trim();
    if (!ud) return oj;
    if (!oj || oj.toLowerCase() === ud.toLowerCase()) return ud;
    return oj;
}

/** Align ToName filter with UI job labels ("L1 - Civil Project" vs "Civil Project"). */
/** EnquiryQuotes.TotalAmount — use client value when present (JSON omits `undefined`, so do not treat missing as 0 on revise). */
function resolveQuoteTotalAmountForInsert(body, existingTotal) {
    if (!body || typeof body !== 'object' || !Object.prototype.hasOwnProperty.call(body, 'totalAmount')) {
        const fb = Number(existingTotal);
        return Number.isFinite(fb) ? fb : 0;
    }
    const n = Number(body.totalAmount);
    return Number.isFinite(n) ? n : 0;
}

function stripJobPrefixForQuoteMatch(s) {
    let t = String(s || '').trim();
    if (!t) return '';
    if (/^sub\s*job\s*-\s*/i.test(t)) {
        const i = t.indexOf('-');
        return i >= 0 ? t.slice(i + 1).trim() : t;
    }
    if (/^L\d+\s*-\s*/i.test(t)) {
        const i = t.indexOf('-');
        return i >= 0 ? t.slice(i + 1).trim() : t;
    }
    return t;
}

// POST /api/quotes/send-email - Send quote email with attachment
router.post('/send-email', express.json({ limit: '50mb' }), async (req, res) => {
    try {
        const { to, cc, bcc, subject, body, attachmentName, pdfBase64 } = req.body;
        
        if (!to || !pdfBase64) {
            return res.status(400).json({ error: 'Recipients and PDF content are required' });
        }

        const result = await sendGeneralEmail({
            to,
            cc,
            bcc,
            subject,
            html: body,
            attachments: [
                {
                    filename: attachmentName || 'Quote.pdf',
                    content: Buffer.from(pdfBase64, 'base64'),
                    contentType: 'application/pdf'
                }
            ]
        });

        if (result.success) {
            res.json({ success: true, messageId: result.messageId });
        } else {
            res.status(500).json({ error: 'Failed to send email', details: result.error });
        }
    } catch (err) {
        console.error('Error in /send-email route:', err);
        res.status(500).json({ error: 'Internal server error', details: err.message });
    }
});

// NOTE: Static routes MUST be defined BEFORE dynamic parameter routes
// to prevent Express from interpreting path segments like 'lists' as parameter values

// GET /api/quotes/lists/metadata - Fetch lists for dropdowns
router.get('/lists/metadata', async (req, res) => {
    try {
        const usersResult = await sql.query`SELECT FullName, Designation, EmailId, Department, MobileNumber FROM Master_ConcernedSE WHERE Status = 'Active' ORDER BY FullName`;
        const customersMasterRes = await sql.query`
            SELECT *
            FROM Master_CustomerName
            WHERE ISNULL(Status, 'Active') = 'Active'
        `;
        const customersConsultantRes = await sql.query`
            SELECT *
            FROM Master_ConsultantName
            WHERE ISNULL(Status, 'Active') = 'Active'
        `;
        const customersClientRes = await sql.query`
            SELECT *
            FROM Master_clientname
            WHERE ISNULL(Status, 'Active') = 'Active'
        `;

        // Merge sources by CompanyName with priority order for address:
        // Master_CustomerName -> Master_ConsultantName -> Master_clientname.
        const byName = new Map();
        const upsertCustomer = (r) => {
            const name = (r?.CompanyName || '').toString().trim();
            if (!name) return;
            const normalized = name.toLowerCase();
            const incoming = {
                CompanyName: name,
                Address1: r?.Address1 || '',
                Address2: r?.Address2 || '',
                Phone1: r?.Phone1 || '',
                Phone2: r?.Phone2 || '',
                FaxNo: r?.FaxNo || '',
                EmailId: r?.EmailId || r?.Emailld || ''
            };
            const hasAddress = (obj) => !!([obj?.Address1, obj?.Address2].filter(Boolean).join(' ').trim());
            const existing = byName.get(normalized);
            if (!existing) {
                byName.set(normalized, incoming);
                return;
            }
            const existingHasAddress = hasAddress(existing);
            const incomingHasAddress = hasAddress(incoming);
            byName.set(normalized, {
                CompanyName: existing.CompanyName || incoming.CompanyName,
                Address1: existingHasAddress ? existing.Address1 : (incoming.Address1 || existing.Address1),
                Address2: existingHasAddress ? existing.Address2 : (incoming.Address2 || existing.Address2),
                Phone1: existing.Phone1 || incoming.Phone1,
                Phone2: existing.Phone2 || incoming.Phone2,
                FaxNo: existing.FaxNo || incoming.FaxNo,
                EmailId: existing.EmailId || incoming.EmailId
            });
        };

        (customersMasterRes.recordset || []).forEach(upsertCustomer);
        (customersConsultantRes.recordset || []).forEach(upsertCustomer);
        (customersClientRes.recordset || []).forEach(upsertCustomer);

        const mergedCustomers = Array.from(byName.values()).sort((a, b) =>
            String(a.CompanyName || '').localeCompare(String(b.CompanyName || ''))
        );

        let enquiryTypes = [];
        try {
            const etRes = await sql.query`SELECT TypeName FROM Master_EnquiryType ORDER BY TypeName`;
            enquiryTypes = (etRes.recordset || []).map(r => r.TypeName).filter(Boolean);
        } catch (e) {
            console.warn('[lists/metadata] Master_EnquiryType not available:', e.message);
        }

        res.json({ users: usersResult.recordset, customers: mergedCustomers, enquiryTypes });
    } catch (err) {
        console.error('Error fetching metadata lists:', err);
        res.status(500).json({ error: 'Failed to fetch lists' });
    }
});

/** FullName list where Master_ConcernedSE.Department matches dept (trim / collapse spaces / L-prefix strip). */
router.get('/attention-by-department', async (req, res) => {
    try {
        const dept = String(req.query.dept || '').trim();
        if (!dept) return res.json([]);
        const masterSeRes = await sql.query`
            SELECT FullName, Department FROM Master_ConcernedSE
            WHERE FullName IS NOT NULL AND LTRIM(RTRIM(FullName)) <> N''
              AND (Status = N'Active' OR Status IS NULL OR LTRIM(RTRIM(ISNULL(Status, N''))) = N'')
        `;
        const normDeptLabel = (s) =>
            String(s || '')
                .replace(/\u00a0/g, ' ')
                .toLowerCase()
                .replace(/\s+/g, ' ')
                .trim();
        const stripJobPrefix = (name) => String(name || '').replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim();
        const target = normDeptLabel(stripJobPrefix(dept));
        if (!target) return res.json([]);
        const names = (masterSeRes.recordset || [])
            .filter((r) => normDeptLabel(r.Department) === target)
            .map((r) => String(r.FullName || '').trim())
                    .filter(Boolean);
        res.json([...new Set(names)].sort((a, b) => a.localeCompare(b)));
    } catch (e) {
        console.error('[quotes] attention-by-department:', e);
        res.status(500).json([]);
    }
});

router.get('/list/pending', async (req, res) => {
    try {
        let { userEmail } = req.query;
        console.log(`[API] Check Pending Quotes for ${userEmail || 'All'}...`);
        const { enquiries, accessCtx, userEmail: ue } = await runPendingQuoteListQuery(sql, userEmail, '');
        if (enquiries.length > 0) {
            const finalMapped = await mapQuoteListingRows(sql, enquiries, ue, accessCtx);
            if (finalMapped.length > 0) {
                console.log(`[API] FINAL DATA Enq 0:`, {
                    ReqNo: finalMapped[0].RequestNo,
                    Client: finalMapped[0].ClientName,
                    Consultant: finalMapped[0].ConsultantName,
                    SubJobPricesLen: finalMapped[0].SubJobPrices?.length,
                });
            }
            console.log(`[API] Pending Quotes found: ${finalMapped.length}`);
            return res.json(finalMapped);
        }
        return res.json([]);
    } catch (err) {
        console.error('Error fetching pending quotes:', err);
        res.status(500).json({ error: 'Failed to fetch pending quotes', details: err.message });
    }
});

router.get('/list/search', async (req, res) => {
    try {
        let { userEmail, q, dateFrom, dateTo } = req.query;
        const extra = buildQuoteListSearchExtraWhere(q || '', dateFrom || '', dateTo || '');
        if (!extra.ok) {
            return res.json([]);
        }
        const { enquiries: pendingRaw, accessCtx, userEmail: ue } = await runPendingQuoteListQuery(sql, userEmail, extra.sql);
        const { enquiries: quotedRaw } = await runQuotedQuoteListQuery(sql, userEmail, extra.sql);
        const pendingMapped = await mapQuoteListingRows(sql, pendingRaw || [], ue, accessCtx);
        const quotedMapped = await mapQuoteListingRows(sql, quotedRaw || [], ue, accessCtx);
        const byNo = new Map();
        for (const row of quotedMapped) {
            byNo.set(String(row.RequestNo), { ...row, QuoteListKind: 'quoted' });
        }
        for (const row of pendingMapped) {
            byNo.set(String(row.RequestNo), { ...row, QuoteListKind: 'pending' });
        }
        const merged = Array.from(byNo.values()).sort((a, b) => {
            const ta = a.DueDate ? new Date(a.DueDate).getTime() : 0;
            const tb = b.DueDate ? new Date(b.DueDate).getTime() : 0;
            return tb - ta;
        });
        return res.json(merged);
    } catch (err) {
        console.error('Error searching quote lists:', err);
        res.status(500).json({ error: 'Failed to search quote lists', details: err.message });
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
        const userEmail = (req.query.userEmail || '').toString().trim();

        const result = await sql.query`
            SELECT *,
                   CONVERT(varchar(10), CAST(QuoteDate AS DATE), 23) AS QuoteDateYmd
            FROM EnquiryQuotes WHERE ID = ${id}
        `;

        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Quote not found' });
        }

        const row = result.recordset[0];
        if (userEmail) {
            const normalizedEmail = userEmail.toLowerCase().replace(/@almcg\.com/g, '@almoayyedcg.com');
            const ok = await userHasQuotePricingEnquiryAccess(normalizedEmail, row.RequestNo);
            if (!ok) {
                return res.status(403).json({ error: 'Forbidden' });
            }
        }

        res.json(row);
    } catch (err) {
        console.error('Error fetching quote:', err);
        res.status(500).json({ error: 'Failed to fetch quote' });
    }
});

// GET /api/quotes/by-enquiry/:requestNo - Get all quotes for an enquiry
router.get('/by-enquiry/:requestNo', async (req, res) => {
    try {
        const { requestNo } = req.params;
        let toName = (req.query.toName || '').toString().trim();
        const toNameStripped = stripJobPrefixForQuoteMatch(toName) || null;
        const leadJobName = (req.query.leadJobName || '').toString().trim();
        const userEmail = (req.query.userEmail || '').toString().trim();
        const ownJobNameFromTab = (req.query.ownJobName || '').toString().trim();

        if (userEmail) {
            const normalizedEmail = userEmail.toLowerCase().replace(/@almcg\.com/g, '@almoayyedcg.com');
            const ok = await userHasQuotePricingEnquiryAccess(normalizedEmail, requestNo);
            if (!ok) {
                return res.status(403).json({ error: 'Forbidden' });
            }
        }

        // Scoped request: client sent at least one dimension to filter by.
        // Unfiltered list (?userEmail only): must NOT apply OwnJob from user department or every enquiry
        // would only show rows matching Master_ConcernedSE.Department — hiding Civil quotes for HVAC users, etc.
        const hasScopedFilters = Boolean(toName || leadJobName || ownJobNameFromTab);

        // HARD RULE (scoped only):
        // - Own-tab without ownJobName query: resolve OwnJob from logged-in user's email.
        // - Subjob-tab: use explicit ownJobName from selected tab label.
        let ownJobName = '';
        if (ownJobNameFromTab) {
            ownJobName = ownJobNameFromTab;
        } else if (userEmail && hasScopedFilters) {
            const normalizedEmail = userEmail.toLowerCase().replace(/@almcg\.com/g, '@almoayyedcg.com');
            const userRes = await sql.query`
                SELECT TOP 1 Department
                FROM Master_ConcernedSE
                WHERE
                    LOWER(LTRIM(RTRIM(ISNULL(EmailId, '')))) = ${normalizedEmail}
                    OR LOWER(REPLACE(REPLACE(REPLACE(
                        LEFT(LTRIM(RTRIM(ISNULL(EmailId, ''))), CHARINDEX('@', LTRIM(RTRIM(ISNULL(EmailId, ''))) + '@') - 1),
                        '.', ''), '-', ''), '_', '')) =
                       LOWER(REPLACE(REPLACE(REPLACE(
                        LEFT(${normalizedEmail}, CHARINDEX('@', ${normalizedEmail} + '@') - 1),
                        '.', ''), '-', ''), '_', ''))
                ORDER BY CASE
                    WHEN LOWER(LTRIM(RTRIM(ISNULL(EmailId, '')))) = ${normalizedEmail} THEN 0
                    ELSE 1
                END
            `;
            if (userRes.recordset && userRes.recordset.length > 0 && userRes.recordset[0].Department) {
                ownJobName = userRes.recordset[0].Department.trim();
            }
        }

        console.log(
            `[Quote API] Fetching quotes for RequestNo: ${requestNo}, LeadJob: "${leadJobName}", ToName: "${toName}", OwnJob(resolved): "${ownJobName}"`
        );

        const request = new sql.Request();
        request.input('requestNo', sql.NVarChar, requestNo);
        request.input('toName', sql.NVarChar, toName || null);
        request.input('toNameStripped', sql.NVarChar, toNameStripped);
        request.input('leadJobName', sql.NVarChar, leadJobName || null);
        request.input('ownJobName', sql.NVarChar, ownJobName || null);

        const result = await request.query(`
            SELECT ID, QuoteNumber, QuoteDate,
                   CONVERT(varchar(10), CAST(QuoteDate AS DATE), 23) AS QuoteDateYmd,
                   ToName, ToAddress, ToPhone, ToEmail, ToFax, ToAttention,
                   Subject, CustomerReference, YourRef, QuoteType, ValidityDays, PreparedBy, PreparedByEmail,
                   Signatory, SignatoryDesignation, Status, RevisionNo, TotalAmount, QuoteNo,
                   RequestNo, CreatedAt, UpdatedAt, OwnJob, LeadJob,
                   ShowScopeOfWork, ShowBasisOfOffer, ShowExclusions, ShowPricingTerms,
                   ShowSchedule, ShowWarranty, ShowResponsibilityMatrix, ShowTermsConditions, ShowAcceptance, ShowBillOfQuantity,
                   ScopeOfWork, BasisOfOffer, Exclusions, PricingTerms,
                   Schedule, Warranty, ResponsibilityMatrix, TermsConditions, Acceptance, BillOfQuantity,
                   CustomClauses, ClauseOrder, DigitalSignaturesJson
            FROM EnquiryQuotes
            WHERE LTRIM(RTRIM(ISNULL(CAST(RequestNo AS NVARCHAR(50)), ''))) = LTRIM(RTRIM(ISNULL(@requestNo, '')))
              AND (
                @toName IS NULL
                OR LTRIM(RTRIM(ISNULL(CAST(@toName AS NVARCHAR(4000)), N''))) = N''
                OR LOWER(LTRIM(RTRIM(ISNULL(ToName, N'')))) = LOWER(LTRIM(RTRIM(ISNULL(@toName, N''))))
                OR (
                  @toNameStripped IS NOT NULL
                  AND LTRIM(RTRIM(ISNULL(@toNameStripped, N''))) <> N''
                  AND (
                    LOWER(LTRIM(RTRIM(ISNULL(ToName, N'')))) = LOWER(LTRIM(RTRIM(ISNULL(@toNameStripped, N''))))
                    OR (
                      LEN(LTRIM(RTRIM(ISNULL(@toNameStripped, N'')))) >= 5
                      AND LOWER(LTRIM(RTRIM(ISNULL(ToName, N'')))) LIKE N'%' + LOWER(LTRIM(RTRIM(ISNULL(@toNameStripped, N'')))) + N'%'
                    )
                  )
                )
              )
              AND (
                @leadJobName IS NULL
                OR LOWER(LTRIM(RTRIM(ISNULL(LeadJob, N'')))) = LOWER(LTRIM(RTRIM(ISNULL(@leadJobName, N''))))
                OR (
                  LTRIM(RTRIM(ISNULL(@leadJobName, N''))) <> N''
                  AND LEN(LTRIM(RTRIM(ISNULL(@leadJobName, N'')))) <= 6
                  AND LEFT(UPPER(LTRIM(RTRIM(ISNULL(@leadJobName, N'')))), 1) = N'L'
                  AND TRY_CONVERT(INT, SUBSTRING(LTRIM(RTRIM(ISNULL(@leadJobName, N''))), 2, 4)) IS NOT NULL
                  AND (
                    UPPER(LTRIM(RTRIM(ISNULL(LeadJob, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(@leadJobName, N''))))
                    OR UPPER(LTRIM(RTRIM(ISNULL(LeadJob, N'')))) LIKE UPPER(LTRIM(RTRIM(ISNULL(@leadJobName, N'')))) + N' %'
                    OR UPPER(LTRIM(RTRIM(ISNULL(LeadJob, N'')))) LIKE UPPER(LTRIM(RTRIM(ISNULL(@leadJobName, N'')))) + N'-%'
                  )
                )
              )
              AND (
                @ownJobName IS NULL
                OR LOWER(LTRIM(RTRIM(ISNULL(OwnJob, N'')))) = LOWER(LTRIM(RTRIM(ISNULL(@ownJobName, N''))))
                OR (
                  LTRIM(RTRIM(ISNULL(@ownJobName, N''))) <> N''
                  AND LTRIM(RTRIM(ISNULL(OwnJob, N''))) <> N''
                  AND (
                    LOWER(LTRIM(RTRIM(@ownJobName))) LIKE LOWER(LTRIM(RTRIM(ISNULL(OwnJob, N'')))) + N'%'
                    OR LOWER(LTRIM(RTRIM(ISNULL(OwnJob, N'')))) LIKE LOWER(LTRIM(RTRIM(@ownJobName))) + N'%'
                  )
                )
              )
            ORDER BY QuoteNo, RevisionNo DESC
        `);

        console.log(`[Quote API] Found ${result.recordset.length} quotes for RequestNo ${requestNo}`);
        res.json(result.recordset);
    } catch (err) {
        console.error('[Quote API] Error fetching quotes for enquiry:', err);
        console.error('[Quote API] Error details:', err.message);
        console.error('[Quote API] Stack:', err.stack);
        res.status(500).json({ error: 'Failed to fetch quotes', details: err.message });
    }
});

// GET /api/quotes/access/:requestNo - Create/revise rights (same scope as pricing pending list)
router.get('/access/:requestNo', async (req, res) => {
    try {
        const { requestNo } = req.params;
        const userEmail = (req.query.userEmail || '').toString().trim();

        if (!userEmail) {
            return res.json({ canCreate: false, seName: null });
        }

        const normalizedEmail = userEmail.toLowerCase().replace(/@almcg\.com/g, '@almoayyedcg.com');

        const userRes = await sql.query`
            SELECT TOP 1 FullName, Roles, Department
            FROM Master_ConcernedSE
            WHERE LOWER(LTRIM(RTRIM(EmailId))) = LOWER(LTRIM(${normalizedEmail}))
        `;

        const row = userRes.recordset?.[0];
        const seName = row?.FullName || null;
        if (!seName) {
            return res.json({ canCreate: false, seName: null });
        }

        const roleStr = String(row?.Roles || '').toLowerCase();
        const isAdmin = roleStr.includes('admin') || roleStr.includes('system');
        if (isAdmin) {
            return res.json({ canCreate: true, seName, reason: 'admin' });
        }

        const ok = await userHasQuotePricingEnquiryAccess(normalizedEmail, requestNo);
        if (!ok) {
            return res.json({ canCreate: false, seName });
        }

        const ctx = await resolvePricingAccessContext(normalizedEmail);
        const reason = ctx.isCcUser ? 'cc_coordinator' : 'scoped';
        return res.json({ canCreate: true, seName, reason });
    } catch (err) {
        console.error('[Quote API] Error in /access:', err);
        res.status(500).json({ error: 'Failed to check access', details: err.message });
    }
});

// GET /api/quotes/signatory-options-by-user?userEmail=...
// Used as a fallback when enquiryData.divisionEmails does not produce signatory options.
// Logic (per user request):
// 1) current user email -> Department from Master_ConcernedSE
// 2) Department -> CCMailIds from Master_EnquiryFor (ItemName match)
// 3) Return CCMailIds as a normalized email list for frontend to map to usersList.
router.get('/signatory-options-by-user', async (req, res) => {
    try {
        const userEmail = (req.query.userEmail || '').toString().trim();
        if (!userEmail) return res.json({ ccMails: [] });

        const normalizedEmail = userEmail.toLowerCase().replace(/@almcg\.com/g, '@almoayyedcg.com');

        const deptRes = await sql.query`
            SELECT TOP 1 Department
            FROM Master_ConcernedSE
            WHERE EmailId = ${normalizedEmail}
        `;

        const dept = deptRes.recordset?.[0]?.Department ? deptRes.recordset[0].Department.toString().trim() : '';
        if (!dept) return res.json({ ccMails: [] });

        let ccRes = await sql.query`
            SELECT TOP 1 CCMailIds
            FROM Master_EnquiryFor
            WHERE LTRIM(RTRIM(ItemName)) = LTRIM(RTRIM(${dept}))
               OR ItemName = ${dept}
        `;

        let ccRaw = (ccRes.recordset?.[0]?.CCMailIds || '').toString();
        // Department often does not exactly match Master_EnquiryFor.ItemName (e.g. "HVAC Project" vs "L1 - HVAC Project").
        if (!ccRaw.trim() && dept) {
            const safe = String(dept).replace(/%/g, '');
            ccRes = await sql.query`
                SELECT TOP 1 CCMailIds
                FROM Master_EnquiryFor
                WHERE LTRIM(RTRIM(ItemName)) LIKE ${'%' + safe + '%'}
            `;
            ccRaw = (ccRes.recordset?.[0]?.CCMailIds || '').toString();
        }
        const ccMails = Array.from(new Set(
            ccRaw
                .replace(/;/g, ',')
                .split(',')
                .map(m => m.trim().toLowerCase())
                .filter(Boolean)
                .map(m => m.replace(/@almcg\.com/g, '@almoayyedcg.com'))
        ));

        return res.json({ ccMails });
    } catch (err) {
        console.error('[Quote API] Error in /signatory-options-by-user:', err);
        res.status(500).json({ ccMails: [] });
    }
});

// GET /api/quotes/enquiry-data/:requestNo - Get enquiry data for quote generation
router.get('/enquiry-data/:requestNo', async (req, res) => {
    try {
        const { requestNo } = req.params;
        const userEmail = (req.query.userEmail || '').toString().trim();
        if (userEmail) {
            const normalizedEmail = userEmail.toLowerCase().replace(/@almcg\.com/g, '@almoayyedcg.com');
            const ok = await userHasQuotePricingEnquiryAccess(normalizedEmail, requestNo);
            if (!ok) {
                return res.status(403).json({ error: 'Forbidden' });
            }
        }

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
            enquiry.SelectedEnquiryTypes = typesResult.recordset.map(t => t.TypeName).filter(Boolean);
            enquiry.EnquiryType = enquiry.SelectedEnquiryTypes.join(', ');
            console.log('[Quote API] Enquiry found:', enquiry.ProjectName);
        } catch (err) {
            console.error('[Quote API] Error fetching EnquiryMaster:', err);
            throw err;
        }

        // Get customer details (address, etc.)
        let customerDetails = null;
        if (enquiry.CustomerName) {
            try {
                const customerNames = enquiry.CustomerName.split(',').map(c => c.trim());
                const composeAddress = (row) => [row?.Address1, row?.Address2].filter(Boolean).join('\n').trim();
                for (const name of customerNames) {
                    let bestFallback = null;

                    const customerResult = await sql.query`
                        SELECT * FROM Master_CustomerName 
                        WHERE CompanyName = ${name}
                    `;
                    if (customerResult.recordset.length > 0) {
                        const row = customerResult.recordset[0];
                        const addr = composeAddress(row);
                        if (addr) {
                            customerDetails = row;
                            customerDetails.Address = addr;
                            console.log('[Quote API] Customer details found in Master_CustomerName for:', name);
                            break; // priority 1 with address
                        }
                        bestFallback = row; // keep but continue to fallback sources for address
                    }

                    // Fallback source 1: Master_ConsultantName
                    const consultantResult = await sql.query`
                        SELECT TOP 1 *
                        FROM Master_ConsultantName
                        WHERE CompanyName = ${name}
                        ORDER BY ID DESC
                    `;
                    if (consultantResult.recordset.length > 0) {
                        const row = consultantResult.recordset[0];
                        const addr = composeAddress(row);
                        if (addr) {
                            customerDetails = row;
                            customerDetails.EmailId = customerDetails.EmailId || customerDetails.Emailld || '';
                            customerDetails.Address = addr;
                            console.log('[Quote API] Customer details found in Master_ConsultantName for:', name);
                            break; // priority 2 with address
                        }
                        if (!bestFallback) bestFallback = row;
                    }

                    // Fallback source 2: Master_clientname
                    const clientResult = await sql.query`
                        SELECT TOP 1 *
                        FROM Master_clientname
                        WHERE CompanyName = ${name}
                          AND (
                            RequestNo = ${requestNo}
                            OR RequestNo IS NULL
                            OR RequestNo = 0
                            OR LTRIM(RTRIM(CONVERT(NVARCHAR(50), RequestNo))) = LTRIM(RTRIM(CONVERT(NVARCHAR(50), ${requestNo})))
                          )
                        ORDER BY CASE WHEN RequestNo = ${requestNo} THEN 0 ELSE 1 END, ID DESC
                    `;
                    if (clientResult.recordset.length > 0) {
                        const row = clientResult.recordset[0];
                        const addr = composeAddress(row);
                        if (addr) {
                            customerDetails = row;
                            customerDetails.EmailId = customerDetails.EmailId || customerDetails.Emailld || '';
                            customerDetails.Address = addr;
                            console.log('[Quote API] Customer details found in Master_clientname for:', name);
                            break; // priority 2 with address
                        }
                        if (!bestFallback) bestFallback = row;
                    }

                    // No table had an address; keep first available row so other contact fields still populate.
                    if (!customerDetails && bestFallback) {
                        customerDetails = bestFallback;
                        customerDetails.EmailId = customerDetails.EmailId || customerDetails.Emailld || '';
                        customerDetails.Address = composeAddress(bestFallback);
                    }
                }
                if (!customerDetails) {
                    console.log('[Quote API] Customer details not found for any of:', enquiry.CustomerName);
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
        let userIsSubjobUser = false; // True if user's scope items all have a ParentID

        let resolvedItems = [];
        let rawItems = [];
        let enquiryForBrandingRows = [];
        try {
            // 1. Fetch raw items with Hierarchy (Join Master to get Default Assignments)
            // Use REPLACE/STUFF or logic to match both "L1 - Civil Project" and "Civil Project"
            const rawItemsResult = await sql.query`
                SELECT EF.ID, EF.ParentID, EF.ItemName, EF.LeadJobCode, EF.LeadJobName, MEF.CommonMailIds, MEF.CCMailIds, MEF.DepartmentName,
                       MEF.DivisionCode, MEF.DepartmentCode
                FROM EnquiryFor EF
                LEFT JOIN Master_EnquiryFor MEF ON (
                    EF.ItemName = MEF.ItemName OR 
                    EF.ItemName LIKE '% - ' + MEF.ItemName OR
                    EF.ItemName LIKE '%- ' + MEF.ItemName OR
                    EF.ItemName LIKE MEF.ItemName + ' %'
                )
                WHERE EF.RequestNo = ${requestNo}`;
            rawItems = rawItemsResult.recordset;

            // Helper to get Parent
            const getParent = (id) => rawItems.find(i => i.ID === id);

            // Filter Divisions based on User Access (Scope)
            const userEmail = req.query.userEmail || '';
            const fs = require('fs');
            const logPath = require('path').join(__dirname, '..', 'debug_quote_api.log');
            const log = (msg) => {
                try {
                    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${msg}\n`);
                } catch (e) {
                    console.warn('Logging failed:', e.message);
                }
            };

            log(`--- Enquiry Data Fetch for ${requestNo} ---`);
            log(`User: ${userEmail}`);
            log(`Raw Items Count: ${rawItems.length}`);

            // Deduplicate rawItems (Avoid Cartesian product from Master join) - MUST DO BEFORE BRANCH LOGIC
            const seenIds = new Set();
            const uniqueRawItems = [];
            for (const item of rawItems) {
                if (!seenIds.has(item.ID)) {
                    seenIds.add(item.ID);
                    uniqueRawItems.push(item);
                }
            }
            rawItems = uniqueRawItems;
            log(`Deduplicated Raw Items Count: ${rawItems.length}`);

            // Build unique Lead Job code map for ROOTS ONLY (to follow project structure)
            const rootsOnly = rawItems.filter(r => !r.ParentID || r.ParentID == '0' || r.ParentID == 0);
            rootsOnly.sort((a, b) => a.ID - b.ID); // Keep sequence stable based on insertion
            const rootCodeMap = {};
            rootsOnly.forEach((r, idx) => {
                rootCodeMap[r.ID] = `L${idx + 1}`;
            });

            const userRes = await sql.query`SELECT Roles, Department, FullName FROM Master_ConcernedSE WHERE EmailId = ${userEmail}`;
            const userRole = userRes.recordset.length > 0 ? userRes.recordset[0].Roles : '';
            const userDepartment = userRes.recordset.length > 0 && userRes.recordset[0].Department ? userRes.recordset[0].Department.trim().toLowerCase() : '';
            const userFullName = userRes.recordset.length > 0 && userRes.recordset[0].FullName ? userRes.recordset[0].FullName.trim().toLowerCase() : '';
            const isAdmin = userRole === 'Admin' || userRole === 'Super Admin';

            if (userEmail && !isAdmin) {
                const normalizedUser = userEmail.toLowerCase().replace(/@almcg\.com/g, '@almoayyedcg.com');
                const userPrefix = normalizedUser.split('@')[0];

                // Find items explicitly assigned to user
                const userScopeItems = rawItems.filter(item => {
                    const mails = [item.CommonMailIds, item.CCMailIds].filter(Boolean).join(',').toLowerCase();
                    const normalizedMails = mails.replace(/@almcg\.com/g, '@almoayyedcg.com');
                    const itemNameLower = item.ItemName.toLowerCase().trim();

                    return normalizedMails.includes(normalizedUser) ||
                        (userPrefix && normalizedMails.split(',').some(m => m.trim().startsWith(userPrefix + '@'))) ||
                        (userDepartment && itemNameLower.includes(userDepartment)) ||
                        (userFullName && normalizedMails.includes(userFullName));
                });

                if (userScopeItems.length > 0) {
                    const accessRootNames = new Set();
                    userScopeItems.forEach(scopeItem => {
                        // Traverse up to find the true root for this branch
                        let curr = scopeItem;
                        let s = 0;
                        while (curr.ParentID && curr.ParentID != '0' && s < 10) {
                            const p = getParent(curr.ParentID);
                            if (p) curr = p;
                            else break;
                            s++;
                        }
                        // Only the ROOT name is added to the list for the dropdown
                        accessRootNames.add(curr.ItemName);
                    });
                    divisionsList = Array.from(accessRootNames).sort();
                    userIsSubjobUser = userScopeItems.every(item => item.ParentID && item.ParentID !== '0' && item.ParentID !== 0);
                } else {
                    divisionsList = [];
                }
            } else {
                // Admin or Guest -> Show all root level lead jobs
                divisionsList = rootsOnly.map(r => r.ItemName);
            }

            divisionsHierarchy = rawItems.map(r => {
                // Trace back to root to find which L-code this item belongs to
                let curr = r;
                let safety = 0;
                let visited = new Set();
                while (curr.ParentID && curr.ParentID != '0' && safety < 10) {
                    if (visited.has(curr.ParentID)) break;
                    visited.add(curr.ParentID);
                    const p = rawItems.find(item => item.ID === curr.ParentID);
                    if (p) curr = p;
                    else break;
                    safety++;
                }

                const assignedCode = rootCodeMap[curr.ID] || 'L1';

                return {
                    id: r.ID,
                    parentId: r.ParentID,
                    itemName: r.ItemName,
                    leadJobName: r.LeadJobName || '',
                    commonMailIds: r.CommonMailIds,
                    ccMailIds: r.CCMailIds,
                    leadJobCode: assignedCode, // Child inherits root's L-code
                    departmentName: r.DepartmentName || '',
                    divisionCode: r.DivisionCode || '',
                    departmentCode: r.DepartmentCode || ''
                };
            });

            // 2. Resolve Master Details for EACH item (handling prefixes)
            for (const item of rawItems) {
                let itemName = item.ItemName;
                let cleanName = itemName.replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim(); // Remove "L1 - ", "L2 - "

                // Try to find in Master
                let masterRes = await sql.query`SELECT * FROM Master_EnquiryFor WHERE ItemName = ${itemName} OR ItemName = ${cleanName}`;
                let masterData = masterRes.recordset[0];

                if (masterData) {
                    // ROBUST MERGE: Prioritize master data for contact fields if not in join
                    resolvedItems.push({
                        ...masterData,
                        ...item,
                        CCMailIds: item.CCMailIds || masterData.CCMailIds,
                        CommonMailIds: item.CommonMailIds || masterData.CommonMailIds,
                        DepartmentName: item.DepartmentName || masterData.DepartmentName
                    });

                    // Only add to available profiles IF the user is DIRECTLY assigned to this division
                    const normalizedUser = userEmail.toLowerCase().replace(/@almcg\.com/g, '@almoayyedcg.com');
                    const userPrefix = normalizedUser.split('@')[0];
                    const mails = [item.CommonMailIds, item.CCMailIds].filter(Boolean).join(',').toLowerCase();
                    const normalizedMails = mails.replace(/@almcg\.com/g, '@almoayyedcg.com');
                    const itemNameLower = item.ItemName.toLowerCase().trim();

                    const userIsDirectlyAssigned = normalizedMails.includes(normalizedUser) ||
                        (userPrefix && normalizedMails.split(',').some(m => m.trim().startsWith(userPrefix + '@'))) ||
                        (userDepartment && itemNameLower.includes(userDepartment)) ||
                        (userFullName && normalizedMails.includes(userFullName));

                    const profile = {
                        code: masterData.DepartmentCode || 'AAC',
                        departmentCode: masterData.DepartmentCode || 'AAC',
                        divisionCode: masterData.DivisionCode || 'GEN',
                        name: masterData.CompanyName || cleanName,
                        logo: masterData.CompanyLogo ? masterData.CompanyLogo.replace(/\\/g, '/') : null,
                        address: masterData.Address || [masterData.Address1, masterData.Address2].filter(Boolean).join('\n'),
                        phone: masterData.Phone || [masterData.Phone1, masterData.Phone2].filter(Boolean).join(' / '),
                        fax: masterData.FaxNo || '',
                        email: masterData.CommonMailIds ? masterData.CommonMailIds.split(',')[0].trim() : '',
                        itemName: item.ItemName, // Explicitly use the transaction item name
                        id: item.ID
                    };

                    // Add to availableProfiles for ALL jobs (sub-jobs need this to pull internal address)
                    // Avoid duplicates in availableProfiles based on Div/Dept & itemName
                    const exists = availableProfiles.find(p => p.itemName === profile.itemName);
                    if (!exists) {
                        availableProfiles.push(profile);
                    }
                } else {
                    // Fallback profile if missing from Master to at least have a record
                    availableProfiles.push({
                        itemName: item.ItemName,
                        id: item.ID,
                        name: cleanName,
                        address: '',
                        phone: '',
                        fax: '',
                        email: ''
                    });
                    resolvedItems.push(item);
                }
            }
            // --- PROACTIVE FIX (Step 4488): Always include the profile matching the user's own department ---
            if (userEmail) {
                try {
                    const normalizedLookupEmail = userEmail.toLowerCase().replace(/@almcg\.com/g, '@almoayyedcg.com');
                    console.log(`[Quote API Profile] Looking up department for: ${normalizedLookupEmail} (original: ${userEmail})`);

                    const userRes = await sql.query`SELECT Department FROM Master_ConcernedSE WHERE EmailId = ${normalizedLookupEmail}`;
                    const userDept = userRes.recordset.length > 0 ? userRes.recordset[0].Department : null;
                    console.log(`[Quote API Profile] Resolved Department: "${userDept}"`);

                    if (userDept) {
                        const masterRes = await sql.query`SELECT * FROM Master_EnquiryFor WHERE ItemName = ${userDept}`;
                        const masterData = masterRes.recordset[0];
                        if (masterData) {
                            const profile = {
                                code: masterData.DepartmentCode || 'AAC',
                                departmentCode: masterData.DepartmentCode || 'AAC',
                                divisionCode: masterData.DivisionCode || 'GEN',
                                name: masterData.CompanyName || userDept,
                                logo: masterData.CompanyLogo ? masterData.CompanyLogo.replace(/\\/g, '/') : null,
                                address: masterData.Address || [masterData.Address1, masterData.Address2].filter(Boolean).join('\n'),
                                phone: masterData.Phone || [masterData.Phone1, masterData.Phone2].filter(Boolean).join(' / '),
                                fax: masterData.FaxNo || '',
                                email: masterData.CommonMailIds ? masterData.CommonMailIds.split(',')[0].trim() : '',
                                itemName: userDept,
                            };
                            const existingIndex = availableProfiles.findIndex(p => p.itemName === profile.itemName);
                            if (existingIndex !== -1) {
                                availableProfiles[existingIndex] = { ...availableProfiles[existingIndex], isPersonalProfile: true };
                            } else {
                                availableProfiles.push(profile);
                            }

                            // --- LOCK BRANDING TO USER (Step 4488) ---
                            console.log(`[Quote API] ENFORCING branding lock to user profile: ${profile.name} (${profile.itemName})`);
                            companyDetails = { ...profile, isPersonalProfile: true };
                        }
                    }
                } catch (e) { console.error('Error adding personal profile:', e); }
            }

            // 3. Find Lead Job Default by root item; prefer plain lead name (no code dependency)
            let leadItem = resolvedItems.find(r => !r.ParentID || r.ParentID == '0' || r.ParentID == 0) || resolvedItems[0];
            leadJobPrefix = leadItem
                ? String(leadItem.LeadJobName || leadItem.ItemName || '').replace(/^(L\d+\s*-\s*)/i, '').trim()
                : '';

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

            console.log(`[Quote API] Found ${divisionsList.length} divisions. Resolved items: ${resolvedItems.length}. Default Profile: ${companyDetails.divisionCode}`);
        } catch (err) {
            console.error('[Quote API] Error fetching EnquiryFor:', err);
        }

        enquiryForBrandingRows = (resolvedItems || [])
            .map((r) => ({
                itemName: r.ItemName || '',
                departmentName: r.DepartmentName || '',
                companyName: r.CompanyName || '',
                companyLogo: r.CompanyLogo ? String(r.CompanyLogo).replace(/\\/g, '/') : null,
                address: r.Address || [r.Address1, r.Address2].filter(Boolean).join('\n') || '',
                phone: r.Phone || [r.Phone1, r.Phone2].filter(Boolean).join(' / ') || '',
                faxNo: r.FaxNo || '',
                email: r.CommonMailIds ? String(r.CommonMailIds).split(',')[0].trim() : '',
            }))
            .filter((row) => String(row.itemName || '').trim() || String(row.departmentName || '').trim());

        // Get Prepared By Options (MobileNumber from Master_ConcernedSE via FullName = SEName)
        let preparedByOptions = [];
        try {
            const seResult = await sql.query`
                SELECT cs.SEName, m.MobileNumber
                FROM ConcernedSE cs
                LEFT JOIN Master_ConcernedSE m ON UPPER(LTRIM(RTRIM(ISNULL(m.FullName, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(cs.SEName, N''))))
                WHERE cs.RequestNo = ${requestNo}
            `;
            seResult.recordset.forEach(row => {
                if (row.SEName) {
                    const mobileNumber = row.MobileNumber != null ? String(row.MobileNumber).trim() : '';
                    preparedByOptions.push({ value: row.SEName, label: row.SEName, type: 'SE', mobileNumber });
                }
            });

            if (enquiry.CreatedBy) {
                const createdName = String(enquiry.CreatedBy).trim();
                let creatorMobile = '';
                if (createdName) {
                    const mobRes = await sql.query`
                        SELECT TOP 1 MobileNumber FROM Master_ConcernedSE
                        WHERE UPPER(LTRIM(RTRIM(ISNULL(FullName, N'')))) = UPPER(LTRIM(RTRIM(${createdName})))
                    `;
                    const raw = mobRes.recordset?.[0]?.MobileNumber;
                    creatorMobile = raw != null ? String(raw).trim() : '';
                }
                preparedByOptions.push({
                    value: enquiry.CreatedBy,
                    label: enquiry.CreatedBy,
                    type: 'Creator',
                    mobileNumber: creatorMobile,
                });
            }
            preparedByOptions = preparedByOptions.filter((v, i, a) => a.findIndex(t => (t.value === v.value)) === i);
        } catch (err) {
            console.error('[Quote API] Error fetching Prepared By options:', err);
        }

        // Get Customer Options with ReceivedFrom contacts
        let customerOptions = [];
        let customerContacts = {}; // Map customer names to their ReceivedFrom contacts
        let externalAttentionOptionsByCustomer = {}; // Quote "Attention of" — external: ReceivedFrom contacts per company
        let internalAttentionByCleanItemName = {}; // Internal division → { options, defaultAttention, ... }
        let parentCustomerName = null; // Internal parent job name when own job is a subjob
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

            // Process EnquiryCustomer: one DB row = one customer (full name). Do NOT split on commas —
            // names like "Alghanim International, UAE" must stay one option (same as Enquiry module SelectedCustomers).
            const hasEnquiryCustomerRows = customerResult.recordset.length > 0;
            const externalCustomers = [];
            customerResult.recordset.forEach(row => {
                if (row.CustomerName) {
                    const trimmed = String(row.CustomerName).replace(/[,.]+$/g, '').trim();
                    if (trimmed) {
                        externalCustomers.push(trimmed);
                    }
                }
            });

            // EnquiryMaster.CustomerName: when EnquiryCustomer rows exist, do NOT merge master — it duplicates
            // SelectedCustomers as one comma-separated string and adds an extra bogus dropdown entry (e.g. "A, B, C, D").
            if (!hasEnquiryCustomerRows && enquiry.CustomerName) {
                enquiry.CustomerName.split(',').forEach(c => {
                    const trimmed = c.replace(/[,.]+$/g, '').trim();
                    if (trimmed) {
                        const exists = externalCustomers.some(existing => existing.toLowerCase() === trimmed.toLowerCase());
                        if (!exists) {
                            externalCustomers.push(trimmed);
                        }
                    }
                });
            }

            // Map ReceivedFrom for external customers
            externalCustomers.forEach((name) => {
                const trimmed = String(name).trim();
                if (trimmed && !hasContact(trimmed) && enquiry.ReceivedFrom) {
                    customerContacts[trimmed] = enquiry.ReceivedFrom;
                    console.log(`[Quote API] Mapped main customer "${trimmed}" to ReceivedFrom: "${enquiry.ReceivedFrom}"`);
                }
            });

            // --- HIERARCHY LOGIC: derive Parent Customer for own-job subjob users ---
            if (rawItems && rawItems.length > 0 && userIsSubjobUser) {
                // Find own job from login Department
                const loginDept = (currentUser?.Department || currentUser?.department || '').toString().trim();
                const ownJobNode = rawItems.find(r =>
                    String(r.ItemName || '').replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim().toLowerCase() ===
                    loginDept.toLowerCase()
                );
                if (ownJobNode && ownJobNode.ParentID && ownJobNode.ParentID != '0') {
                    const parent = rawItems.find(p => String(p.ID) === String(ownJobNode.ParentID));
                    if (parent && parent.ItemName) {
                        parentCustomerName = String(parent.ItemName).replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim();
                    }
                }
            }

            // Default global customerOptions for legacy callers: external list only.
            customerOptions = [...externalCustomers];

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

            // Drop comma-joined mega-strings when each segment already appears as its own option (EnquiryPricingOptions / legacy data).
            const stripRedundantCommaJoined = (opts) => {
                const list = opts.map(o => String(o || '').trim()).filter(Boolean);
                const norm = (s) => s.toLowerCase();
                return list.filter((opt) => {
                    if (!opt.includes(',')) return true;
                    const parts = opt.split(',').map(p => p.trim()).filter(Boolean);
                    if (parts.length < 2) return true;
                    const eachPartHasStandalone = parts.every((p) =>
                        list.some((x) => x !== opt && norm(x) === norm(p))
                    );
                    return !eachPartHasStandalone;
                });
            };

            customerOptions = stripRedundantCommaJoined(uniqueOptions);

            // --- Quote "Attention of" metadata (dropdowns on client) ---
            try {
                const masterSeRes = await sql.query`
                    SELECT FullName, Department, EmailId FROM Master_ConcernedSE
                    WHERE FullName IS NOT NULL AND LTRIM(RTRIM(FullName)) <> N''
                      AND (Status = N'Active' OR Status IS NULL OR LTRIM(RTRIM(ISNULL(Status, N''))) = N'')
                `;
                const masterRows = masterSeRes.recordset || [];
                const concernedOrderedRes = await sql.query`
                    SELECT SEName FROM ConcernedSE WHERE RequestNo = ${requestNo} ORDER BY SEName
                `;
                const normLooseSe = (x) => String(x || '').toLowerCase().replace(/\s+/g, ' ').trim();
                const allSeForEnquiry = [];
                const seenSeOrder = new Set();
                for (const row of concernedOrderedRes.recordset || []) {
                    const n = String(row.SEName || '').trim();
                    if (!n) continue;
                    const k = normLooseSe(n);
                    if (seenSeOrder.has(k)) continue;
                    seenSeOrder.add(k);
                    allSeForEnquiry.push(n);
                }
                const normKey = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                const cleanItemName = (name) => String(name || '').replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim();
                /** Labels that must not match every "* Project" / generic job name via substring alone */
                const WEAK_DEPT_LABELS = new Set([
                    'project', 'projects', 'general', 'gen', 'sales', 'all', 'na', 'n/a', 'tbd',
                    'department', 'dept', 'division', 'group', 'company', 'contracting', 'contract',
                    'office', 'branch', 'region', 'hq', 'unit', 'section', 'team', 'main', 'staff'
                ]);
                /**
                 * Master_ConcernedSE.Department vs internal customer context (item name, enquiry dept name, codes).
                 */
                const departmentMatchesSelectedCustomer = (masterDept, customerLabel) => {
                    const a = String(masterDept || '').toLowerCase().trim();
                    const c = String(customerLabel || '').toLowerCase().trim();
                    if (!a || !c) return false;
                    if (a === c) return true;
                    const nkA = normKey(a);
                    const nkC = normKey(c);
                    if (nkA.length >= 3 && nkC.length >= 3) {
                        if (nkA === nkC || nkA.includes(nkC) || nkC.includes(nkA)) return true;
                    }
                    if (a.includes(c) || c.includes(a)) {
                        if (a !== c) {
                            const shorter = a.length <= c.length ? a : c;
                            const longer = a.length <= c.length ? c : a;
                            if (WEAK_DEPT_LABELS.has(shorter) && longer.includes(shorter)) return false;
                        }
                        return true;
                    }
                    const custTok = c.split(/[^a-z0-9]+/).filter(p => p.length > 2 && !WEAK_DEPT_LABELS.has(p));
                    const deptTok = a.split(/[^a-z0-9]+/).filter(p => p.length > 2 && !WEAK_DEPT_LABELS.has(p));
                    if (custTok.length && custTok.some(t => a.includes(t))) return true;
                    if (deptTok.length && deptTok.some(t => c.includes(t))) return true;
                    return false;
                };
                const departmentMatchesAnyLabel = (masterDept, labels) => {
                    const uniq = [...new Set((labels || []).map((s) => String(s || '').trim()).filter(Boolean))];
                    return uniq.some((lab) => departmentMatchesSelectedCustomer(masterDept, lab));
                };
                /**
                 * Same as SSMS: LTRIM(RTRIM(Department)) = clean name; collapse all whitespace / NBSP so UI matches DB.
                 */
                const normDeptLabel = (s) =>
                    String(s || '')
                        .replace(/\u00a0/g, ' ')
                        .toLowerCase()
                        .replace(/\s+/g, ' ')
                        .trim();
                const deptEqualsCleanCustomer = (masterDept, cleanCustomerName) =>
                    normDeptLabel(masterDept) === normDeptLabel(cleanCustomerName);
                const byCompany = {};
                receivedFromResult.recordset.forEach(row => {
                    if (!row.CompanyName || !row.ContactName) return;
                    const company = String(row.CompanyName).replace(/,+$/, '').trim();
                    const contact = String(row.ContactName).trim();
                    if (!byCompany[company]) byCompany[company] = new Set();
                    byCompany[company].add(contact);
                });
                const findCompanyRfKey = (cust) => {
                    const keys = Object.keys(byCompany);
                    const hit = keys.find(k => k.toLowerCase() === String(cust).toLowerCase().trim());
                    if (hit) return hit;
                    const t = normKey(cust);
                    return keys.find(k => normKey(k) === t) || null;
                };
                customerOptions.forEach(cust => {
                    const set = new Set();
                    const ck = findCompanyRfKey(cust);
                    if (ck) byCompany[ck].forEach(x => set.add(x));
                    const cc = customerContacts[cust];
                    if (cc) {
                        String(cc).split(',').forEach(p => {
                            const t = p.trim();
                            if (t) set.add(t);
                        });
                    }
                    if (set.size === 0 && enquiry.ReceivedFrom) {
                        String(enquiry.ReceivedFrom).split(',').forEach(p => {
                            const t = p.trim();
                            if (t) set.add(t);
                        });
                    }
                    externalAttentionOptionsByCustomer[cust] = [...set].sort((a, b) => a.localeCompare(b));
                });

                const normLoose = (x) => String(x || '').toLowerCase().replace(/\s+/g, ' ').trim();
                const normalizeMail = (e) => String(e || '').toLowerCase().trim()
                    .replace(/@almcg\.com$/i, '@almoayyedcg.com');
                const divisionMailSet = (row) => {
                    const s = new Set();
                    const add = (raw) => {
                        String(raw || '').split(',').forEach((part) => {
                            const t = normalizeMail(part);
                            if (t) s.add(t);
                        });
                    };
                    add(row.commonMailIds);
                    add(row.ccMailIds);
                    return s;
                };
                const masterByLooseName = new Map();
                masterRows.forEach(m => {
                    const fn = String(m.FullName || '').trim();
                    if (fn) masterByLooseName.set(normLoose(fn), m);
                });
                const findMasterForSeName = (seName) => {
                    const k = normLoose(seName);
                    if (!k) return null;
                    if (masterByLooseName.has(k)) return masterByLooseName.get(k);
                    for (const m of masterRows) {
                        const fn = String(m.FullName || '').trim();
                        if (!fn) continue;
                        const fk = normLoose(fn);
                        if (fk === k) return m;
                        if (k.length >= 5 && fk.includes(k)) return m;
                        if (fk.length >= 5 && k.includes(fk)) return m;
                    }
                    return null;
                };

                const ancestorCleanItemNames = (startParentId) => {
                    const labels = [];
                    let pid = startParentId;
                    let steps = 0;
                    while (pid != null && pid !== '' && String(pid) !== '0' && steps++ < 40) {
                        const p = (rawItems || []).find((i) => String(i.ID) === String(pid));
                        if (!p) break;
                        const anc = cleanItemName(String(p.ItemName || ''));
                        if (anc) labels.push(anc);
                        pid = p.ParentID;
                    }
                    return labels;
                };

                for (const h of divisionsHierarchy || []) {
                    const fullItem = String(h.itemName || '').trim();
                    const cl = cleanItemName(fullItem);
                    if (!cl) continue;
                    const jobDept = String(h.departmentName || '').trim() || cl;
                    const divisionMails = divisionMailSet(h);
                    const attentionLabels = [
                        cl,
                        jobDept,
                        h.divisionCode && String(h.divisionCode).trim(),
                        h.departmentCode && String(h.departmentCode).trim(),
                        ...ancestorCleanItemNames(h.parentId)
                    ];
                    /** Primary: Master_ConcernedSE.Department = clean internal customer (e.g. 'HVAC Project'). */
                    let namesFromDept = masterRows
                        .filter(m => deptEqualsCleanCustomer(m.Department, cl))
                        .map(m => String(m.FullName || '').trim())
                        .filter(Boolean);
                    if (namesFromDept.length === 0) {
                        namesFromDept = masterRows
                            .filter(m => departmentMatchesAnyLabel(m.Department, attentionLabels))
                            .map(m => String(m.FullName || '').trim())
                            .filter(Boolean);
                    }
                    let options = [...new Set(namesFromDept)].sort((a, b) => a.localeCompare(b));
                    /** When Department text does not match labels, use SEs rostered on this row's division mails. */
                    if (options.length === 0 && divisionMails.size > 0) {
                        const fromMails = masterRows
                            .filter((m) => {
                                const em = normalizeMail(m.EmailId);
                                return em && divisionMails.has(em);
                            })
                            .map((m) => String(m.FullName || '').trim())
                            .filter(Boolean);
                        options = [...new Set(fromMails)].sort((a, b) => a.localeCompare(b));
                    }
                    /** Concerned SE on enquiry whose email is on this division row. */
                    if (options.length === 0 && divisionMails.size > 0) {
                        const fromConcerned = [];
                        for (const seName of allSeForEnquiry) {
                            const m = findMasterForSeName(seName);
                            if (!m) continue;
                            const em = normalizeMail(m.EmailId);
                            if (em && divisionMails.has(em)) {
                                const fn = String(m.FullName || '').trim();
                                fromConcerned.push(fn || seName);
                            }
                        }
                        options = [...new Set(fromConcerned)].sort((a, b) => a.localeCompare(b));
                    }
                    const assignedDeptMatch = [];
                    for (const seName of allSeForEnquiry) {
                        const m = findMasterForSeName(seName);
                        if (!m) continue;
                        if (deptEqualsCleanCustomer(m.Department, cl) || departmentMatchesAnyLabel(m.Department, attentionLabels)) {
                            assignedDeptMatch.push(seName);
                        }
                    }
                    const assignedByRowMail = [];
                    const assignedByDeptOnly = [];
                    for (const seName of assignedDeptMatch) {
                        const m = findMasterForSeName(seName);
                        if (!m) continue;
                        const em = normalizeMail(m.EmailId);
                        const onRow = em && divisionMails.size > 0 && divisionMails.has(em);
                        if (onRow) assignedByRowMail.push(seName);
                        else assignedByDeptOnly.push(seName);
                    }
                    const assignedForThisDivision = [...assignedByRowMail, ...assignedByDeptOnly];
                    const firstAssigned = assignedForThisDivision[0];
                    const firstAssignedFull = firstAssigned
                        ? String(findMasterForSeName(firstAssigned)?.FullName || '').trim() || firstAssigned
                        : '';
                    /** Default only if that person is already in the Master_ConcernedSE–matched list */
                    let defaultAttention = '';
                    if (firstAssignedFull && options.some(o => normLoose(o) === normLoose(firstAssignedFull))) {
                        defaultAttention = firstAssignedFull;
                    } else {
                        defaultAttention = options[0] || '';
                    }
                    const entry = { options, defaultAttention, itemName: fullItem, departmentName: jobDept };
                    internalAttentionByCleanItemName[cl.toLowerCase()] = entry;
                    const nk = normKey(cl);
                    if (nk) internalAttentionByCleanItemName[`__norm_${nk}`] = entry;
                    const fullKeySpaced = String(fullItem).toLowerCase().replace(/\s+/g, ' ').trim();
                    if (fullKeySpaced && fullKeySpaced !== cl.toLowerCase()) {
                        internalAttentionByCleanItemName[fullKeySpaced] = entry;
                    }
                }

                /**
                 * If any EnquiryFor row still has no non-empty options (label mismatch vs SSMS), fill from exact
                 * Master_ConcernedSE.Department = clean ItemName using normDeptLabel (matches user SQL).
                 */
                for (const row of rawItems || []) {
                    const fullItem = String(row.ItemName || '').trim();
                    const cl = cleanItemName(fullItem);
                    if (!cl) continue;
                    const k = cl.toLowerCase();
                    const cur = internalAttentionByCleanItemName[k];
                    if (cur && Array.isArray(cur.options) && cur.options.length > 0) continue;
                    const namesExact = masterRows
                        .filter((m) => deptEqualsCleanCustomer(m.Department, cl))
                        .map((m) => String(m.FullName || '').trim())
                        .filter(Boolean);
                    if (namesExact.length === 0) continue;
                    const opts = [...new Set(namesExact)].sort((a, b) => a.localeCompare(b));
                    const entry = {
                        options: opts,
                        defaultAttention: opts[0] || '',
                        itemName: fullItem,
                        departmentName: cl
                    };
                    internalAttentionByCleanItemName[k] = entry;
                    const nk = normKey(cl);
                    if (nk) internalAttentionByCleanItemName[`__norm_${nk}`] = entry;
                    const fullKeySpaced = String(fullItem).toLowerCase().replace(/\s+/g, ' ').trim();
                    if (fullKeySpaced && fullKeySpaced !== k) {
                        internalAttentionByCleanItemName[fullKeySpaced] = entry;
                    }
                }
            } catch (attErr) {
                console.error('[Quote API] attention dropdown meta:', attErr);
            }

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
            externalAttentionOptionsByCustomer,
            internalAttentionByCleanItemName,
            parentCustomerName,
            leadJobPrefix,
            divisionEmails: resolvedItems.map(item => ({
                itemName: item.ItemName,
                ccMailIds: item.CCMailIds || '',
                commonMailIds: item.CommonMailIds || '',
                departmentName: item.DepartmentName || ''
            })),
            enquiryForBrandingRows,
            quoteNumber: 'Draft',
            userIsSubjobUser,   // True if user's jobs are all subjobs (not lead job)
            divisionsHierarchy  // Return full hierarchy
        });
    } catch (err) {
        console.error('[Quote API] Fatal Error in enquiry-data route:', err);
        res.status(500).json({ error: 'Failed to fetch enquiry data', details: err.message });
    }
});

/** Normalize email for QuoteFormDrafts row ownership (must match client query param). */
function normalizeQuoteFormDraftUserEmail(raw) {
    return String(raw || '')
        .trim()
        .toLowerCase()
        .replace(/@almcg\.com/g, '@almoayyedcg.com');
}

/** MSSQL often reports `Invalid object name 'dbo.QuoteFormDrafts'.` — match that, not only bare table name. */
function isMissingQuoteFormDraftsTableError(message) {
    const m = String(message || '');
    return /Invalid object name/i.test(m) && /QuoteFormDrafts/i.test(m);
}

// GET/POST/DELETE /api/quotes/form-drafts* — MUST be registered BEFORE `/:requestNo` or "form-drafts" is treated as a RequestNo.
// GET /api/quotes/form-drafts — list drafts for the signed-in user only
router.get('/form-drafts', async (req, res) => {
    try {
        const userEmail = normalizeQuoteFormDraftUserEmail(req.query.userEmail);
        if (!userEmail) {
            return res.status(400).json({ error: 'userEmail is required' });
        }

        const request = new sql.Request();
        request.input('userEmail', sql.NVarChar(320), userEmail);
        const result = await request.query(`
            SELECT TOP 40
                CONVERT(VARCHAR(36), Id) AS Id,
                Label,
                CONVERT(VARCHAR(33), CreatedAt, 126) AS SavedAtIso
            FROM QuoteFormDrafts
            WHERE LOWER(LTRIM(RTRIM(UserEmail))) = @userEmail
            ORDER BY CreatedAt DESC
        `);
        const rows = (result.recordset || []).map((r) => ({
            id: r.Id ?? r.id,
            label: r.Label ?? r.label ?? '',
            savedAtIso: r.SavedAtIso ?? r.savedAtIso ?? '',
        }));
        res.json(rows);
    } catch (err) {
        const msg = (err && err.message) || '';
        if (isMissingQuoteFormDraftsTableError(msg)) {
            console.error('[form-drafts] Table missing? Run: node server/migrations/run_create_quote_form_drafts.js', err);
            return res.status(503).json({
                error: 'Quote drafts storage is not initialized',
                hint: 'Run node server/migrations/run_create_quote_form_drafts.js on the database server.',
            });
        }
        console.error('[form-drafts] GET list:', err);
        res.status(500).json({ error: 'Failed to list quote form drafts', details: msg });
    }
});

// GET /api/quotes/form-drafts/:id — full draft JSON for one row (same user only)
router.get('/form-drafts/:id', async (req, res) => {
    try {
        const userEmail = normalizeQuoteFormDraftUserEmail(req.query.userEmail);
        if (!userEmail) {
            return res.status(400).json({ error: 'userEmail is required' });
        }
        const { id } = req.params;
        if (!id || !/^[0-9a-fA-F-]{36}$/.test(String(id).trim())) {
            return res.status(400).json({ error: 'Invalid draft id' });
        }

        const request = new sql.Request();
        request.input('id', sql.UniqueIdentifier, id.trim());
        request.input('userEmail', sql.NVarChar(320), userEmail);
        const result = await request.query(`
            SELECT
                CONVERT(VARCHAR(36), Id) AS Id,
                Label,
                CONVERT(VARCHAR(33), CreatedAt, 126) AS SavedAtIso,
                DraftPayloadJson
            FROM QuoteFormDrafts
            WHERE Id = @id AND LOWER(LTRIM(RTRIM(UserEmail))) = @userEmail
        `);
        const row = result.recordset && result.recordset[0];
        if (!row) {
            return res.status(404).json({ error: 'Draft not found' });
        }
        let payload;
        try {
            payload = JSON.parse(row.DraftPayloadJson || '{}');
        } catch (e) {
            return res.status(500).json({ error: 'Stored draft payload is corrupt' });
        }
        res.json({
            id: row.Id ?? row.id,
            label: row.Label ?? row.label,
            savedAtIso: row.SavedAtIso ?? row.savedAtIso,
            payload,
        });
    } catch (err) {
        console.error('[form-drafts] GET one:', err);
        res.status(500).json({ error: 'Failed to load quote form draft', details: err.message });
    }
});

// POST /api/quotes/form-drafts — save a new draft (per user; keeps latest 40)
router.post('/form-drafts', express.json({ limit: '15mb' }), async (req, res) => {
    try {
        const userEmail = normalizeQuoteFormDraftUserEmail(req.body.userEmail);
        if (!userEmail) {
            return res.status(400).json({ error: 'userEmail is required' });
        }
        const label = String(req.body.label || 'Draft')
            .trim()
            .slice(0, 500);
        const payload = req.body.payload;
        if (!payload || typeof payload !== 'object') {
            return res.status(400).json({ error: 'payload object is required' });
        }

        const id = crypto.randomUUID();
        const json = JSON.stringify(payload);

        const ins = new sql.Request();
        ins.input('id', sql.UniqueIdentifier, id);
        ins.input('userEmail', sql.NVarChar(320), userEmail);
        ins.input('label', sql.NVarChar(500), label);
        ins.input('json', sql.NVarChar(sql.MAX), json);
        await ins.query(`
            INSERT INTO QuoteFormDrafts (Id, UserEmail, Label, DraftPayloadJson)
            VALUES (@id, @userEmail, @label, @json)
        `);

        const trimReq = new sql.Request();
        trimReq.input('userEmail', sql.NVarChar(320), userEmail);
        await trimReq.query(`
            ;WITH ranked AS (
                SELECT Id, ROW_NUMBER() OVER (ORDER BY CreatedAt DESC) AS rn
                FROM QuoteFormDrafts
                WHERE LOWER(LTRIM(RTRIM(UserEmail))) = @userEmail
            )
            DELETE FROM QuoteFormDrafts WHERE Id IN (SELECT Id FROM ranked WHERE rn > 40)
        `);

        const savedAtIso = new Date().toISOString();
        res.json({ id, label, savedAtIso, message: 'Draft saved' });
    } catch (err) {
        const msg = (err && err.message) || '';
        if (isMissingQuoteFormDraftsTableError(msg)) {
            return res.status(503).json({
                error: 'Quote drafts storage is not initialized',
                hint: 'Run node server/migrations/run_create_quote_form_drafts.js',
            });
        }
        console.error('[form-drafts] POST:', err);
        res.status(500).json({ error: 'Failed to save quote form draft', details: msg });
    }
});

// DELETE /api/quotes/form-drafts/:id — remove one draft if owned by userEmail
router.delete('/form-drafts/:id', async (req, res) => {
    try {
        const userEmail = normalizeQuoteFormDraftUserEmail(req.query.userEmail);
        if (!userEmail) {
            return res.status(400).json({ error: 'userEmail is required' });
        }
        const { id } = req.params;
        if (!id || !/^[0-9a-fA-F-]{36}$/.test(String(id).trim())) {
            return res.status(400).json({ error: 'Invalid draft id' });
        }

        const request = new sql.Request();
        request.input('id', sql.UniqueIdentifier, id.trim());
        request.input('userEmail', sql.NVarChar(320), userEmail);
        const result = await request.query(`
            DELETE FROM QuoteFormDrafts
            WHERE Id = @id AND LOWER(LTRIM(RTRIM(UserEmail))) = @userEmail
        `);
        const n = result.rowsAffected && result.rowsAffected[0] ? result.rowsAffected[0] : 0;
        if (!n) {
            return res.status(404).json({ error: 'Draft not found or not owned by this user' });
        }
        res.json({ deleted: n });
    } catch (err) {
        console.error('[form-drafts] DELETE:', err);
        res.status(500).json({ error: 'Failed to delete quote form draft', details: err.message });
    }
});

// GET /api/quotes/:requestNo - Get all quotes for an enquiry
// IMPORTANT: This catch-all route MUST come AFTER all other GET routes with static prefixes
//            (like /single/:id, /enquiry-data/:requestNo, /lists/metadata, /config/templates, /form-drafts)
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
        const fs = require('fs');
        fs.appendFileSync('quote_creation.log', `[${new Date().toISOString()}] Received Payload: ${JSON.stringify(req.body, null, 2)}\n\n`);

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
            quoteType = '',
            subject = '',
            signatory = '',
            signatoryDesignation = '',
            toName = '',
            toAddress = '',
            toPhone = '',
            toEmail = '',
            toFax = '',
            toAttention = '',
            leadJob = '',
            ownJob = '',
            digitalSignaturesJson
        } = req.body;

        const customClausesJson = JSON.stringify(customClauses);
        const clauseOrderJson = JSON.stringify(clauseOrder);
        const digitalSignaturesJsonStr =
            typeof digitalSignaturesJson === 'string'
                ? digitalSignaturesJson
                : JSON.stringify(Array.isArray(digitalSignaturesJson) ? digitalSignaturesJson : []);

        if (!requestNo) {
            return res.status(400).json({ error: 'Request number is required' });
        }

        let dept = departmentCode || "AAC";
        let division = divisionCode || "GEN";
        let effectiveOwnJob = (ownJob || '').trim();
        const clientSentDivision = String(divisionCode || '').trim();

        // --- BACKEND IDENTITY ENFORCEMENT: email → Master_EnquiryFor for dept/div when client did not send a tab/job division (e.g. multi-branch user on HVAC tab sends HVP). ---
        if (preparedByEmail) {
            try {
                const normalizedUser = preparedByEmail.toLowerCase().replace(/@almcg\.com/g, '@almoayyedcg.com');
                const userRes = await sql.query`SELECT Department FROM Master_ConcernedSE WHERE EmailId = ${normalizedUser}`;
                const userDept = userRes.recordset.length > 0 ? userRes.recordset[0].Department : null;

                if (userDept) {
                    const masterRes = await sql.query`SELECT * FROM Master_EnquiryFor WHERE ItemName = ${userDept}`;
                    const masterData = masterRes.recordset[0];
                    if (masterData) {
                        effectiveOwnJob = applyOwnJobAfterDepartmentLookup(effectiveOwnJob, userDept);
                        if (!clientSentDivision) {
                            console.log(`[Quote Backend] Forcing identity based on email ${preparedByEmail} -> ${userDept} (${masterData.DivisionCode})`);
                            dept = masterData.DepartmentCode || dept;
                            division = masterData.DivisionCode || division;
                        } else {
                            console.log(`[Quote Backend] Keeping client divisionCode=${clientSentDivision} (tab job); email maps to ${userDept} / ${masterData.DivisionCode} not applied to ref)`);
                        }
                    }
                }
            } catch (e) { console.error('[Quote Backend] Identity lookup error:', e); }
        }

        console.log(`[Quote Creation] req.body.divisionCode: ${divisionCode}, effective division: ${division}`);
        fs.appendFileSync('quote_creation.log', `[${new Date().toISOString()}] Resolved Dept: ${dept}, Division: ${division}, RequestNo: ${requestNo}\n`);

        // --- FETCH LEAD JOB CODE ---
        // Try to find the LeadJobCode for the root item of this enquiry to use in reference
        let finalLeadJobCode = leadJobPrefix;

        // If leadJobPrefix is already an L-code (L1, L2...), keep it.
        const isLCode = leadJobPrefix && String(leadJobPrefix).toUpperCase().match(/^L\d+/);

        if (!isLCode) {
            try {
                // Find Root item LeadJobCode (L1, L2...)
                const codeResult = await sql.query`
                    SELECT LeadJobCode, LeadJobName, ItemName FROM EnquiryFor 
                    WHERE RequestNo = ${requestNo} AND (ParentID IS NULL OR ParentID = '0')
                    ORDER BY
                        CASE
                            WHEN LeadJobName = ${leadJobPrefix} THEN 0
                            WHEN ItemName = ${leadJobPrefix} THEN 1
                            WHEN LeadJobCode = ${leadJobPrefix} THEN 2
                            ELSE 3
                        END,
                        ID
                `;
                if (codeResult.recordset.length > 0) {
                    // Try to find a match for the prefix, otherwise take the first
                    const match =
                        codeResult.recordset.find(r => r.LeadJobName === leadJobPrefix) ||
                        codeResult.recordset.find(r => r.ItemName === leadJobPrefix) ||
                        codeResult.recordset.find(r => r.LeadJobCode === leadJobPrefix) ||
                        codeResult.recordset[0];
                    if (match.LeadJobCode) finalLeadJobCode = match.LeadJobCode;
                } else {
                    // If no root code, maybe current item code?
                    const itemResult = await sql.query`
                        SELECT LeadJobCode FROM EnquiryFor 
                        WHERE RequestNo = ${requestNo}
                          AND (ItemName = ${leadJobPrefix} OR LeadJobName = ${leadJobPrefix} OR LeadJobCode = ${leadJobPrefix})
                    `;
                    if (itemResult.recordset.length > 0 && itemResult.recordset[0].LeadJobCode) {
                        finalLeadJobCode = itemResult.recordset[0].LeadJobCode;
                    }
                }
            } catch (e) {
                console.error('Error fetching LeadJobCode:', e);
            }
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
                TotalAmount, Status, CustomClauses, ClauseOrder, DigitalSignaturesJson,
                QuoteDate, CustomerReference, YourRef, QuoteType, Subject, Signatory, SignatoryDesignation, ToName, ToAddress, ToPhone, ToEmail, ToFax, ToAttention, LeadJob, OwnJob, CreatedAt, UpdatedAt
            )
            OUTPUT INSERTED.ID, INSERTED.QuoteNumber
            VALUES (
                ${requestNo}, ${quoteNumber}, ${quoteNo}, ${revisionNo}, ${validityDays},
                ${preparedBy}, ${preparedByEmail},
                ${showScopeOfWork ? 1 : 0}, ${showBasisOfOffer ? 1 : 0}, ${showExclusions ? 1 : 0}, ${showPricingTerms ? 1 : 0},
                ${showSchedule ? 1 : 0}, ${showWarranty ? 1 : 0}, ${showResponsibilityMatrix ? 1 : 0}, ${showTermsConditions ? 1 : 0}, ${showAcceptance ? 1 : 0}, ${showBillOfQuantity ? 1 : 0},
                ${scopeOfWork}, ${basisOfOffer}, ${exclusions}, ${pricingTerms},
                ${schedule}, ${warranty}, ${responsibilityMatrix}, ${termsConditions}, ${acceptance}, ${billOfQuantity},
                ${totalAmount}, ${status}, ${customClausesJson}, ${clauseOrderJson}, ${digitalSignaturesJsonStr},
                ${quoteDate ? quoteDate.split('T')[0] : null}, ${customerReference}, ${customerReference}, ${quoteType || ''}, ${subject}, ${signatory}, ${signatoryDesignation}, ${toName}, ${toAddress}, ${toPhone}, ${toEmail}, ${toFax || ''}, ${toAttention || ''}, ${leadJob || ''}, ${effectiveOwnJob}, ${now}, ${now}
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
        try {
            const fs = require('fs');
            fs.appendFileSync('quote_creation_error.log', `[${new Date().toISOString()}] Error creating quote: ${err.message}\nStack: ${err.stack}\nBody: ${JSON.stringify(req.body)}\n\n`);
        } catch (logErr) { }
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
            quoteDate, customerReference, quoteType, subject, signatory, signatoryDesignation, toName, toAddress, toPhone, toEmail, toFax, toAttention,
            preparedBy, preparedByEmail,
            leadJob,
            ownJob,
            digitalSignaturesJson
        } = req.body;

        const customClausesJson = JSON.stringify(customClauses);
        const clauseOrderJson = JSON.stringify(clauseOrder);
        const hasDigitalSignaturesPayload = Object.prototype.hasOwnProperty.call(req.body, 'digitalSignaturesJson');
        const digitalSignaturesJsonStr = hasDigitalSignaturesPayload
            ? typeof digitalSignaturesJson === 'string'
                ? digitalSignaturesJson
                : JSON.stringify(Array.isArray(digitalSignaturesJson) ? digitalSignaturesJson : [])
            : null;
        let effectiveOwnJob = (ownJob || '').trim();

        if (preparedByEmail) {
            try {
                const normalizedUser = preparedByEmail.toLowerCase().replace(/@almcg\.com/g, '@almoayyedcg.com');
                const userRes = await sql.query`SELECT Department FROM Master_ConcernedSE WHERE EmailId = ${normalizedUser}`;
                const userDept = userRes.recordset.length > 0 ? userRes.recordset[0].Department : null;
                if (userDept) effectiveOwnJob = applyOwnJobAfterDepartmentLookup(effectiveOwnJob, userDept);
            } catch (e) {
                console.error('[Quote Update] Identity lookup error:', e);
            }
        }

        const now = new Date();
        if (hasDigitalSignaturesPayload) {
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
        DigitalSignaturesJson = ${digitalSignaturesJsonStr},
        QuoteDate = ${quoteDate ? quoteDate.split('T')[0] : null},
        CustomerReference = ${customerReference},
        YourRef = ${customerReference},
        QuoteType = ${quoteType != null && quoteType !== undefined ? quoteType : ''},
        Subject = ${subject},
        Signatory = ${signatory},
        SignatoryDesignation = ${signatoryDesignation},
        ToName = ${toName},
        ToAddress = ${toAddress},
        ToPhone = ${toPhone},
        ToEmail = ${toEmail},
        ToFax = ${toFax || ''},
        ToAttention = ${toAttention || ''},
        PreparedBy = ${preparedBy},
        PreparedByEmail = ${preparedByEmail},
        LeadJob = ${leadJob || ''},
        OwnJob = ${effectiveOwnJob},
        UpdatedAt = ${now}
            WHERE ID = ${id}
        `;
        } else {
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
        YourRef = ${customerReference},
        QuoteType = ${quoteType != null && quoteType !== undefined ? quoteType : ''},
        Subject = ${subject},
        Signatory = ${signatory},
        SignatoryDesignation = ${signatoryDesignation},
        ToName = ${toName},
        ToAddress = ${toAddress},
        ToPhone = ${toPhone},
        ToEmail = ${toEmail},
        ToFax = ${toFax || ''},
        ToAttention = ${toAttention || ''},
        PreparedBy = ${preparedBy},
        PreparedByEmail = ${preparedByEmail},
        LeadJob = ${leadJob || ''},
        OwnJob = ${effectiveOwnJob},
        UpdatedAt = ${now}
            WHERE ID = ${id}
        `;
        }

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
            quoteDate, customerReference, quoteType, subject, signatory, signatoryDesignation, toName, toAddress, toPhone, toEmail, toFax, toAttention,
            leadJob,
            ownJob,
            digitalSignaturesJson
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
        const hasReviseDigitalSignatures = Object.prototype.hasOwnProperty.call(req.body, 'digitalSignaturesJson');
        const reviseDigitalSignaturesJsonStr = hasReviseDigitalSignatures
            ? typeof digitalSignaturesJson === 'string'
                ? digitalSignaturesJson
                : JSON.stringify(Array.isArray(digitalSignaturesJson) ? digitalSignaturesJson : [])
            : existing.DigitalSignaturesJson != null && existing.DigitalSignaturesJson !== undefined
              ? String(existing.DigitalSignaturesJson)
              : '[]';
        let effectiveOwnJob = String(ownJob !== undefined && ownJob !== null ? ownJob : (existing.OwnJob || '')).trim();

        if (preparedByEmail || existing.PreparedByEmail) {
            try {
                const emailForIdentity = (preparedByEmail || existing.PreparedByEmail || '').toLowerCase().replace(/@almcg\.com/g, '@almoayyedcg.com');
                if (emailForIdentity) {
                    const userRes = await sql.query`SELECT Department FROM Master_ConcernedSE WHERE EmailId = ${emailForIdentity}`;
                    const userDept = userRes.recordset.length > 0 ? userRes.recordset[0].Department : null;
                    if (userDept) effectiveOwnJob = applyOwnJobAfterDepartmentLookup(effectiveOwnJob, userDept);
                }
            } catch (e) {
                console.error('[Revise] Identity lookup error:', e);
            }
        }

        const now = new Date();
        const result = await sql.query`
            INSERT INTO EnquiryQuotes (
                RequestNo, QuoteNumber, QuoteNo, RevisionNo, ValidityDays,
                PreparedBy, PreparedByEmail,
                ShowScopeOfWork, ShowBasisOfOffer, ShowExclusions, ShowPricingTerms,
                ShowSchedule, ShowWarranty, ShowResponsibilityMatrix, ShowTermsConditions, ShowAcceptance, ShowBillOfQuantity,
                ScopeOfWork, BasisOfOffer, Exclusions, PricingTerms,
                Schedule, Warranty, ResponsibilityMatrix, TermsConditions, Acceptance, BillOfQuantity,
                TotalAmount, Status, CustomClauses, ClauseOrder, DigitalSignaturesJson,
                QuoteDate, CustomerReference, YourRef, QuoteType, Subject, Signatory, SignatoryDesignation, ToName, ToAddress, ToPhone, ToEmail, ToFax, ToAttention, LeadJob, OwnJob, CreatedAt, UpdatedAt
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
                ${resolveQuoteTotalAmountForInsert(req.body, existing.TotalAmount)},
                'Saved', 
                ${customClausesJson}, 
                ${clauseOrderJson},
                ${reviseDigitalSignaturesJsonStr},
                ${cleanQuoteDate !== null ? cleanQuoteDate : (existing.QuoteDate ? existing.QuoteDate.toISOString().split('T')[0] : null)}, 
                ${customerReference !== undefined ? customerReference : existing.CustomerReference}, 
                ${customerReference !== undefined ? customerReference : (existing.YourRef != null ? existing.YourRef : existing.CustomerReference)}, 
                ${quoteType !== undefined ? (quoteType || '') : (existing.QuoteType != null ? existing.QuoteType : '')}, 
                ${subject !== undefined ? subject : existing.Subject}, 
                ${signatory !== undefined ? signatory : existing.Signatory}, 
                ${signatoryDesignation !== undefined ? signatoryDesignation : existing.SignatoryDesignation}, 
                ${toName !== undefined ? toName : existing.ToName}, 
                ${toAddress !== undefined ? toAddress : existing.ToAddress}, 
                ${toPhone !== undefined ? toPhone : existing.ToPhone}, 
                ${toEmail !== undefined ? toEmail : existing.ToEmail}, 
                ${toFax !== undefined ? (toFax || '') : (existing.ToFax || '')}, 
                ${toAttention !== undefined ? (toAttention || '') : (existing.ToAttention || '')}, 
                ${leadJob !== undefined ? leadJob : existing.LeadJob},
                ${effectiveOwnJob},
                ${now}, ${now}
            )
        `;

        console.log(`[Revise] Revision created successfully! New ID: ${result.recordset[0].ID}, QuoteNumber: ${result.recordset[0].QuoteNumber}`);

        res.json({
            success: true,
            id: result.recordset[0].ID,
            quoteNumber: result.recordset[0].QuoteNumber,
            revisionNo: newRevisionNo,
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

// POST /api/quotes/email-draft-eml — return .eml bytes as a normal HTTP attachment (more reliable than blob-only saves in some browsers).
router.post('/email-draft-eml', express.json({ limit: '512kb' }), (req, res) => {
    try {
        const raw = typeof req.body?.rawEml === 'string' ? req.body.rawEml : '';
        if (!raw || raw.length < 20) {
            return res.status(400).json({ error: 'rawEml is required' });
        }
        let base = String(req.body?.filename || 'Quote_draft.eml')
            .replace(/[/\\?%*:|"<>]/g, '_')
            .replace(/[^\w.\-]+/g, '_')
            .replace(/_+/g, '_')
            .slice(0, 160);
        if (!base.toLowerCase().endsWith('.eml')) {
            base = `${base}.eml`;
        }
        const buf = Buffer.from(raw, 'utf8');
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${base}"`);
        res.setHeader('Content-Length', String(buf.length));
        res.send(buf);
    } catch (err) {
        console.error('email-draft-eml:', err);
        res.status(500).json({ error: 'Failed to send draft file' });
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

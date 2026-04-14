const express = require('express');
const router = express.Router();
const sql = require('mssql');
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
        const usersResult = await sql.query`SELECT FullName, Designation, EmailId, Department FROM Master_ConcernedSE WHERE Status = 'Active' ORDER BY FullName`;
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
        if (userEmail) {
            userEmail = userEmail.toLowerCase().replace(/@almcg\.com/g, '@almoayyedcg.com').trim();
        }
        console.log(`[API] Check Pending Quotes for ${userEmail || 'All'}...`);

        const accessCtx = userEmail ? await resolvePricingAccessContext(userEmail) : null;
        if (userEmail && (!accessCtx || !accessCtx.user)) {
            return res.json([]);
        }

        const isAdmin = !!(accessCtx && accessCtx.isAdmin);
        const userDepartment = accessCtx ? accessCtx.userDepartment : '';
        const isCcUser = !!(accessCtx && accessCtx.isCcUser);

        const uEsc = (userEmail || '').replace(/'/g, "''");
        const trimmedDept = (userDepartment || '').trim();
        const deptEsc = trimmedDept.replace(/'/g, "''");
        // Match getPricingAnchorJobs: strip "L1 - " / "Sub Job - " from Department so SQL scope aligns with pricing UI.
        const deptNormEsc = (normalizePricingJobName(trimmedDept) || '').replace(/'/g, "''");
        const hasDeptScope = deptEsc.length > 0 || deptNormEsc.length > 0;
        const mefAccessPredicate = isCcUser
            ? `REPLACE(ISNULL(MEF.CCMailIds, ''), '@almcg.com', '@almoayyedcg.com') LIKE '%${uEsc}%'`
            : hasDeptScope
                ? `(
                    LOWER(LTRIM(RTRIM(MEF.ItemName))) LIKE '%' + LOWER(LTRIM(RTRIM('${deptEsc}'))) + '%'
                    OR LOWER(LTRIM(RTRIM(EF.ItemName))) LIKE '%' + LOWER(LTRIM(RTRIM('${deptEsc}'))) + '%'
                    OR (${deptNormEsc ? `LOWER(LTRIM(RTRIM(MEF.ItemName))) LIKE '%' + N'${deptNormEsc}' + '%'
                    OR LOWER(LTRIM(RTRIM(EF.ItemName))) LIKE '%' + N'${deptNormEsc}' + '%'` : '1=0'})
                )`
                : `1 = 1`;

        const scopedJobIdsSubquery = isCcUser
            ? `REPLACE(MEF2.CCMailIds, '@almcg.com', '@almoayyedcg.com') LIKE '%${uEsc}%'`
            : hasDeptScope
                ? `(
                    LOWER(LTRIM(RTRIM(MEF2.ItemName))) LIKE '%' + LOWER(LTRIM(RTRIM('${deptEsc}'))) + '%'
                    OR LOWER(LTRIM(RTRIM(EF2.ItemName))) LIKE '%' + LOWER(LTRIM(RTRIM('${deptEsc}'))) + '%'
                    OR (${deptNormEsc ? `LOWER(LTRIM(RTRIM(MEF2.ItemName))) LIKE '%' + N'${deptNormEsc}' + '%'
                    OR LOWER(LTRIM(RTRIM(EF2.ItemName))) LIKE '%' + N'${deptNormEsc}' + '%'` : '1=0'})
                )`
                : `1 = 1`;

        // Spec: pending = EnquiryPricingValues has price for (RequestNo + EnquiryForItem + LeadJobName + customer)
        // and no EnquiryQuotes row (latest revision) with TotalAmount > 0 for same RequestNo + OwnJob + LeadJob + ToName.
        const pvMatchesEfJobSql = `
            (
                (PV.EnquiryForID IS NOT NULL AND PV.EnquiryForID <> 0 AND PV.EnquiryForID = EF.ID)
                OR (
                    (PV.EnquiryForID IS NULL OR PV.EnquiryForID = 0)
                    AND LTRIM(RTRIM(ISNULL(PV.EnquiryForItem, N''))) = LTRIM(RTRIM(ISNULL(EF.ItemName, N'')))
                )
            )`;
        const latestPvTupleOnlySql = `
            NOT EXISTS (
                SELECT 1
                FROM EnquiryPricingValues PVN
                WHERE PVN.RequestNo = PV.RequestNo
                  AND LTRIM(RTRIM(ISNULL(PVN.EnquiryForItem, N''))) = LTRIM(RTRIM(ISNULL(PV.EnquiryForItem, N'')))
                  AND LTRIM(RTRIM(ISNULL(PVN.LeadJobName, N''))) = LTRIM(RTRIM(ISNULL(PV.LeadJobName, N'')))
                  AND LTRIM(RTRIM(ISNULL(PVN.CustomerName, N''))) = LTRIM(RTRIM(ISNULL(PV.CustomerName, N'')))
                  AND (
                        ISNULL(PVN.UpdatedAt, '19000101') > ISNULL(PV.UpdatedAt, '19000101')
                        OR (
                            ISNULL(PVN.UpdatedAt, '19000101') = ISNULL(PV.UpdatedAt, '19000101')
                            AND ISNULL(PVN.ID, 0) > ISNULL(PV.ID, 0)
                        )
                  )
            )`;
        // Pending rule:
        // Keep enquiry in pending when ANY priced tuple is still missing a quote.
        // Tuple = RequestNo + OwnJob + LeadJob + Customer.
        const noCompletedQuoteForSameTupleSql = `
            NOT EXISTS (
                SELECT 1
                FROM EnquiryQuotes EQ
                WHERE EQ.RequestNo = E.RequestNo
                AND LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(ISNULL(EQ.ToName, N''))), N' ', N''), N'.', N''), N',', N''), N'-', N''), N'&', N'and')) =
                    LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(ISNULL(PV.CustomerName, N''))), N' ', N''), N'.', N''), N',', N''), N'-', N''), N'&', N'and'))
                AND (
                    LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(ISNULL(EQ.OwnJob, N''))), N' ', N''), N'.', N''), N',', N''), N'-', N''), N'&', N'and')) =
                    LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(ISNULL(PV.EnquiryForItem, N''))), N' ', N''), N'.', N''), N',', N''), N'-', N''), N'&', N'and'))
                    OR (
                        LEN(LTRIM(ISNULL(EQ.OwnJob, N''))) >= 2
                        AND LOWER(LTRIM(RTRIM(ISNULL(PV.EnquiryForItem, N'')))) LIKE N'%' + LOWER(LTRIM(RTRIM(ISNULL(EQ.OwnJob, N'')))) + N'%'
                    )
                )
                AND (
                    LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(ISNULL(EQ.LeadJob, N''))), N' ', N''), N'.', N''), N',', N''), N'-', N''), N'&', N'and')) =
                    LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(ISNULL(PV.LeadJobName, N''))), N' ', N''), N'.', N''), N',', N''), N'-', N''), N'&', N'and'))
                    OR (
                        LEN(LTRIM(ISNULL(EQ.LeadJob, N''))) >= 2
                        AND LOWER(LTRIM(RTRIM(ISNULL(PV.LeadJobName, N'')))) LIKE N'%' + LOWER(LTRIM(RTRIM(ISNULL(EQ.LeadJob, N'')))) + N'%'
                    )
                )
                AND EQ.RevisionNo = (SELECT MAX(EQ2.RevisionNo) FROM EnquiryQuotes EQ2 WHERE EQ2.QuoteNo = EQ.QuoteNo)
                AND ISNULL(EQ.TotalAmount, 0) > 0
            )`;

        let query;
        if (userEmail && !isAdmin) {
            const enforceAssignedOnly = !isCcUser;
            // Match ConcernedSE by login email via Master_ConcernedSE (FullName-only match fails when FullName is NULL or mismatched).
            const assignedOnlyClause = enforceAssignedOnly
                ? `
                AND EXISTS (
                    SELECT 1
                    FROM ConcernedSE cs
                    INNER JOIN Master_ConcernedSE m ON UPPER(LTRIM(RTRIM(ISNULL(m.FullName, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(cs.SEName, N''))))
                    WHERE LTRIM(RTRIM(ISNULL(cs.RequestNo, N''))) = LTRIM(RTRIM(ISNULL(E.RequestNo, N'')))
                      AND LOWER(LTRIM(RTRIM(m.EmailId))) = LOWER(LTRIM(N'${uEsc}'))
                )
                `
                : '';
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
                            AND (${scopedJobIdsSubquery})
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
                WHERE PV.Price > 0
                AND LTRIM(RTRIM(ISNULL(PV.EnquiryForItem, N''))) <> N''
                AND LTRIM(RTRIM(ISNULL(PV.LeadJobName, N''))) <> N''
                AND LTRIM(RTRIM(ISNULL(PV.CustomerName, N''))) <> N''
                AND (${mefAccessPredicate})
                ${assignedOnlyClause}
                AND (
                    EF.ItemName = PO.ItemName OR 
                    EF.ItemName LIKE PO.ItemName + '%' OR 
                    PO.ItemName LIKE EF.ItemName + '%'
                )
                AND ${pvMatchesEfJobSql}
                AND ${latestPvTupleOnlySql}
                AND ${noCompletedQuoteForSameTupleSql}
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
                WHERE PV.Price > 0
                AND LTRIM(RTRIM(ISNULL(PV.EnquiryForItem, N''))) <> N''
                AND LTRIM(RTRIM(ISNULL(PV.LeadJobName, N''))) <> N''
                AND LTRIM(RTRIM(ISNULL(PV.CustomerName, N''))) <> N''
                AND (
                    EF.ItemName = PO.ItemName OR 
                    EF.ItemName LIKE PO.ItemName + '%' OR 
                    PO.ItemName LIKE EF.ItemName + '%'
                )
                AND ${pvMatchesEfJobSql}
                AND ${latestPvTupleOnlySql}
                AND ${noCompletedQuoteForSameTupleSql}
                ORDER BY E.DueDate DESC, E.RequestNo DESC
            `;
        }

        const result = await sql.query(query);
        const enquiries = result.recordset;

        if (enquiries.length > 0) {
            const requestNos = enquiries.map(e => `'${e.RequestNo}'`).join(',');

            // Fetch Jobs (CCMailIds required for anchor scope — same as pricing)
            const jobsRes = await sql.query(`
                SELECT EF.RequestNo, EF.ID, EF.ParentID, EF.ItemName, EF.LeadJobCode, MEF.CCMailIds AS CCMailIds
                FROM EnquiryFor EF
                LEFT JOIN Master_EnquiryFor MEF ON (EF.ItemName = MEF.ItemName OR EF.ItemName LIKE '% - ' + MEF.ItemName)
                WHERE EF.RequestNo IN (${requestNos})
            `);
            const allJobsRaw = jobsRes.recordset || [];
            const seenJobKeys = new Set();
            const allJobs = [];
            for (const j of allJobsRaw) {
                const jid = j.ID ?? j.id;
                if (jid == null) continue;
                const k = `${j.RequestNo}:${jid}`;
                if (seenJobKeys.has(k)) continue;
                seenJobKeys.add(k);
                allJobs.push(j);
            }

            // Fetch Prices using the same matching rule as the validated SSMS query:
            // match current EnquiryFor row by (EnquiryForID) OR (trimmed EnquiryForItem = trimmed ItemName).
            const pricesRes = await sql.query(`
                SELECT
                    v.RequestNo,
                    v.OptionID,
                    v.EnquiryForID,
                    v.EnquiryForItem,
                    v.Price,
                    v.UpdatedAt,
                    v.CustomerName,
                    v.LeadJobName,
                    v.PriceOption,
                    m.MatchedEnquiryForId,
                    m.MatchedItemName,
                    m.MatchedParentId
                FROM EnquiryPricingValues v
                OUTER APPLY (
                    SELECT TOP 1
                        ef.ID AS MatchedEnquiryForId,
                        ef.ItemName AS MatchedItemName,
                        ef.ParentID AS MatchedParentId
                    FROM EnquiryFor ef
                    WHERE ef.RequestNo = v.RequestNo
                      AND (
                            (v.EnquiryForID IS NOT NULL AND v.EnquiryForID <> 0 AND v.EnquiryForID = ef.ID)
                         OR (
                                LTRIM(RTRIM(ISNULL(v.EnquiryForItem, N''))) <> N''
                            AND LTRIM(RTRIM(v.EnquiryForItem)) = LTRIM(RTRIM(ef.ItemName))
                            )
                        )
                    ORDER BY
                        CASE WHEN v.EnquiryForID IS NOT NULL AND v.EnquiryForID <> 0 AND v.EnquiryForID = ef.ID THEN 0 ELSE 1 END,
                        ef.ID
                ) m
                WHERE v.RequestNo IN (${requestNos})
            `);
            const allPrices = pricesRes.recordset;

            // Fetch external customers from transactional table (authoritative source)
            const enquiryCustomersRes = await sql.query(`
                SELECT RequestNo, CustomerName
                FROM EnquiryCustomer
                WHERE RequestNo IN (${requestNos})
            `);
            const allEnquiryCustomers = enquiryCustomersRes.recordset;

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
                roots.sort((a, b) => a.ID - b.ID);
                
                // Map each root to an L-code (L1, L2...)
                const rootLabelMap = {};
                roots.forEach((r, idx) => {
                    const existing = (r.LeadJobCode || '').trim().toUpperCase();
                    if (existing && existing.match(/^L\d+$/)) {
                        rootLabelMap[r.ID] = existing;
                    } else {
                        rootLabelMap[r.ID] = `L${idx + 1}`;
                    }
                });

                const flatList = [];
                const traverse = (job, level) => {
                    flatList.push({ ...job, level });
                    const children = childrenMap[job.ID] || [];
                    children.sort((a, b) => a.ID - b.ID);
                    children.forEach(child => traverse(child, level + 1));
                };
                roots.forEach(root => traverse(root, 0));

                // Filter flatList by ScopedJobIDs — prefer JS anchors (aligned with pricing) when user is non-admin
                let scopedJobIDsStr = (enq.ScopedJobIDs || '').toString().split(',').map(id => id.trim()).filter(Boolean);
                if (userEmail && accessCtx && accessCtx.user && !accessCtx.isAdmin) {
                    const anchors = getPricingAnchorJobs(enqJobs, accessCtx, userEmail);
                    if (anchors.length > 0) {
                        const visibleIds = expandVisibleJobIdsFromAnchors(anchors, enqJobs);
                        scopedJobIDsStr = Array.from(visibleIds);
                    }
                    // If no JS anchors, keep SQL ScopedJobIDs — pending query already enforced ConcernedSE + division access
                }
                if (scopedJobIDsStr.length === 0 && roots.length > 0) {
                    scopedJobIDsStr = roots.map((r) => String(r.ID));
                }
                const scopedJobIDsSet = new Set(scopedJobIDsStr);
                const scopedJobs = flatList.filter(j => scopedJobIDsSet.has(j.ID.toString()));

                // Fix childrenMap keys to be strings for consistent lookup
                const stringChildrenMap = {};
                Object.entries(childrenMap).forEach(([k, v]) => {
                    stringChildrenMap[k.toString()] = v;
                });

                // Identify all IDs that are descendants of scoped IDs
                const validIDs = new Set();
                const collectDescendants = (id) => {
                    const idStr = id.toString();
                    if (validIDs.has(idStr)) return;
                    validIDs.add(idStr);
                    const children = stringChildrenMap[idStr] || [];
                    children.forEach(c => collectDescendants(c.ID));
                };
                scopedJobIDsStr.forEach(id => collectDescendants(id));

                const filteredFlatList = flatList.filter(job => validIDs.has(job.ID.toString()));

                // Indentation adjustment: use the minimum level among visible jobs (to make first job L1)
                let minLevel = 0;
                if (filteredFlatList.length > 0) {
                    minLevel = Math.min(...filteredFlatList.map(j => j.level || 0));
                }

                const normalize = str => str.toLowerCase().replace(/[^a-z0-9]/g, '');

                // Identify Root and Job Names for Aggregation
                const rootJob = enqJobs.find(j => !j.ParentID || j.ParentID == '0' || j.ParentID == 0);
                const internalCustomer = rootJob ? rootJob.ItemName.trim() : 'Internal';
                const internalCustomerNorm = normalize(internalCustomer);
                const jobNameSetNorm = new Set(enqJobs.map(j => normalize(j.ItemName)));

                // External customers from EnquiryCustomer table (authoritative)
                let externalCustomers = allEnquiryCustomers
                    .filter(c => c.RequestNo?.toString().trim() == enqRequestNo)
                    .map(c => (c.CustomerName || '').trim())
                    .filter(Boolean);
                externalCustomers = [...new Set(externalCustomers.map(c => c.replace(/,\s*$/, '').trim()))];

                // Pre-calculate Individual (Self) Prices (Latest Only) - STRICTLY Internal
                const selfPrices = {};
                const updateDates = {};
                flatList.forEach(job => {
                    const normOpt = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
                    const isBasePrice = (p) => {
                        const po = p.PriceOption ?? p.priceOption ?? p.priceoption;
                        return normOpt(po) === 'base price';
                    };

                    const idMatches = enqPrices.filter(p => {
                        if (!isBasePrice(p)) return false;
                        const matchedId = p.MatchedEnquiryForId ?? p.matchedEnquiryForId ?? p.matchedenquiryforid;
                        if (matchedId != null && matchedId !== '' && String(matchedId) !== '0') {
                            return String(matchedId) === String(job.ID);
                        }
                        return p.EnquiryForID && p.EnquiryForID != 0 && p.EnquiryForID != '0' && String(p.EnquiryForID) === String(job.ID);
                    });

                    // Fallback to ItemName only for legacy rows that have no usable IDs.
                    // If a row has MatchedEnquiryForId/EnquiryForID, keep strict ID matching
                    // to avoid same-name collisions across branches.
                    let finalMatches = idMatches;
                    if (finalMatches.length === 0) {
                        finalMatches = enqPrices.filter(p =>
                            isBasePrice(p) &&
                            !(p.MatchedEnquiryForId ?? p.matchedEnquiryForId ?? p.matchedenquiryforid) &&
                            !(p.EnquiryForID && p.EnquiryForID != 0 && p.EnquiryForID != '0') &&
                            p.EnquiryForItem &&
                            p.EnquiryForItem.toString().trim().toLowerCase() === job.ItemName.toString().trim().toLowerCase()
                        );
                    }

                    const sortedMatches = [...finalMatches].sort((a, b) => new Date(b.UpdatedAt || 0) - new Date(a.UpdatedAt || 0));

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

                const subJobPrices = filteredFlatList.map(job => {
                    const displayLevel = Math.max(0, (job.level || 0) - minLevel);

                    const displayName = (() => {
                        // Inherit LeadJobCode from root ancestor
                        let root = job;
                        let visited = new Set();
                        while (root.ParentID && root.ParentID != 0 && root.ParentID != '0' && !visited.has(root.ID)) {
                            const p = enqJobs.find(j => j.ID == root.ParentID);
                            if (!p) break;
                            visited.add(root.ID);
                            root = p;
                        }

                        const displayCode = rootLabelMap[root.ID] || 'L1';

                        // STRICT label rule for pending summary:
                        // always display the current job itself (never parent/lead alias).
                        // This ensures subjob users see only ownjob + its descendants,
                        // without parent/lead job labels appearing in the list.
                        const labelBaseName = job.ItemName;
                        return `${labelBaseName} (${displayCode})`;
                    })();

                    // Each row shows this department's own Base Price only (net), never a roll-up of descendants.
                    const totalVal = selfPrices[job.ID] || 0;

                    const updatedAtTs =
                        (updateDates[job.ID] ? new Date(updateDates[job.ID]).getTime() : 0) || 0;

                    return `${displayName}|${totalVal > 0 ? totalVal.toFixed(2) : 'Not Updated'}|${updatedAtTs ? new Date(updatedAtTs).toISOString() : ''}|${displayLevel}`;
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

                // Customer column:
                // - If ownjob is subjob in a lead branch => include that branch parent job name.
                // - If ownjob is lead/root in a lead branch => include external customers.
                // - If both exist across branches => include both sets (deduped).
                const stripLeadPrefix = (s) => String(s || '').replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim();
                const finalCustomerSet = new Set();
                const userDivisionKey = userEmail ? userEmail.split('@')[0].toLowerCase() : '';
                const withLeadCode = (name, code) => {
                    const base = (name || '').replace(/,\s*$/, '').trim();
                    const c = String(code || '').trim().toUpperCase();
                    if (!base) return '';
                    if (!c || !/^L\d+$/.test(c)) return base;
                    return `${base} (${c})`;
                };
                const anchorJobs = userEmail && accessCtx && accessCtx.user
                    ? getPricingAnchorJobs(enqJobs, accessCtx, userEmail)
                    : enqJobs.filter(j => !j.ParentID || j.ParentID == '0' || j.ParentID == 0);
                const ownDeptClean = stripLeadPrefix(userDepartment || '');
                const ownDeptNorm = normalize(ownDeptClean);
                let hasOwnAsLeadInAnyBranch = false;
                let hasOwnAsSubjobInAnyBranch = false;
                const ownLeadCodes = new Set();     // lead codes where ownjob is root
                const ownSubjobLeadCodes = new Set(); // lead codes where ownjob is subjob

                const childrenByParent = {};
                enqJobs.forEach((j) => {
                    const pid = j.ParentID;
                    if (pid == null || pid === '' || pid === '0' || pid === 0) return;
                    const key = String(pid);
                    if (!childrenByParent[key]) childrenByParent[key] = [];
                    childrenByParent[key].push(j);
                });

                const rootsForBranchCheck = enqJobs.filter(j => !j.ParentID || j.ParentID == '0' || j.ParentID == 0);
                const collectBranchJobs = (root) => {
                    const out = [];
                    const stack = [root];
                    const seen = new Set();
                    while (stack.length > 0) {
                        const cur = stack.pop();
                        const cid = String(cur.ID);
                        if (seen.has(cid)) continue;
                        seen.add(cid);
                        out.push(cur);
                        const kids = childrenByParent[cid] || [];
                        kids.forEach(k => stack.push(k));
                    }
                    return out;
                };

                rootsForBranchCheck.forEach((root) => {
                    const branchJobs = collectBranchJobs(root);
                    const ownNodes = branchJobs.filter((j) => normalize(stripLeadPrefix(j.ItemName || '')) === ownDeptNorm);
                    if (ownNodes.length === 0) return;
                    ownNodes.forEach((ownNode) => {
                        const pid = ownNode.ParentID;
                        const rootLeadCode = String(root.LeadJobCode || '').trim().toUpperCase();
                        const isLead = (pid == null || pid === '' || pid === '0' || pid === 0);
                        if (isLead) {
                            hasOwnAsLeadInAnyBranch = true;
                            if (/^L\d+$/.test(rootLeadCode)) ownLeadCodes.add(rootLeadCode);
                            return;
                        }
                        hasOwnAsSubjobInAnyBranch = true;
                        if (/^L\d+$/.test(rootLeadCode)) ownSubjobLeadCodes.add(rootLeadCode);
                        const parent = enqJobs.find(pj => String(pj.ID) === String(pid));
                        if (!parent || !parent.ItemName) return;
                        const label = stripLeadPrefix(parent.ItemName) || String(parent.ItemName).trim();
                        const leadCode = (() => {
                            const raw = (root.LeadJobCode || ownNode.LeadJobCode || parent.LeadJobCode || '').toString().trim().toUpperCase();
                            return /^L\d+$/.test(raw) ? raw : '';
                        })();
                        const displayLabel = withLeadCode(label, leadCode);
                        if (displayLabel && (!userDivisionKey || !normalize(displayLabel).includes(userDivisionKey))) {
                            finalCustomerSet.add(displayLabel);
                        }
                    });
                });

                if (hasOwnAsLeadInAnyBranch || (!hasOwnAsSubjobInAnyBranch && finalCustomerSet.size === 0)) {
                    const leadCodes = Array.from(ownLeadCodes);
                    externalCustomers.forEach((c) => {
                        if (!c) return;
                        if (leadCodes.length === 0) {
                            if (!userDivisionKey || !normalize(c).includes(userDivisionKey)) finalCustomerSet.add(c);
                            return;
                        }
                        leadCodes.forEach((lc) => {
                            const disp = withLeadCode(c, lc);
                            if (disp && (!userDivisionKey || !normalize(disp).includes(userDivisionKey))) {
                                finalCustomerSet.add(disp);
                            }
                        });
                    });
                }

                // Fail-safe: always include parent names of visible subjob anchors (same rule as quote customer dropdown).
                // This avoids missing parent customers when department text does not exactly match EnquiryFor item labels.
                anchorJobs.forEach((job) => {
                    if (!job.ParentID || job.ParentID == '0' || job.ParentID == 0) return;
                    const parent = enqJobs.find((pj) => String(pj.ID) === String(job.ParentID));
                    if (!parent || !parent.ItemName) return;
                    const label = stripLeadPrefix(parent.ItemName) || String(parent.ItemName).trim();
                    const leadCode = (() => {
                        const code = String(job.LeadJobCode || parent.LeadJobCode || '').trim().toUpperCase();
                        if (ownSubjobLeadCodes.size === 0) return code;
                        return ownSubjobLeadCodes.has(code) ? code : '';
                    })();
                    const displayLabel = withLeadCode(label, leadCode);
                    if (displayLabel && (!userDivisionKey || !normalize(displayLabel).includes(userDivisionKey))) {
                        finalCustomerSet.add(displayLabel);
                    }
                });

                const finalCustomersRaw = Array.from(finalCustomerSet);
                const finalCustomers = [];
                const seenBase = new Set();
                finalCustomersRaw.forEach((name) => {
                    const base = String(name || '').replace(/\s*\(L\d+\)\s*$/i, '').trim().toLowerCase();
                    if (!base || seenBase.has(base)) return;
                    seenBase.add(base);
                    finalCustomers.push(name);
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

            let finalMapped = mappedEnquiries;
            if (userEmail && accessCtx && !accessCtx.isAdmin) {
                finalMapped = mappedEnquiries.map(enq => {
                    const accessRule = accessCtx.isCcUser ? 'cc_coordinator' : 'concerned_se';
                    return { ...enq, AccessRule: accessRule };
                });
            }

            if (finalMapped.length > 0) {
                console.log(`[API] FINAL DATA Enq 0:`, {
                    ReqNo: finalMapped[0].RequestNo,
                    Client: finalMapped[0].ClientName,
                    Consultant: finalMapped[0].ConsultantName,
                    SubJobPricesLen: finalMapped[0].SubJobPrices?.length
                });
            }

            console.log(`[API] Pending Quotes found: ${finalMapped.length}`);
            res.json(finalMapped);
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
        const userEmail = (req.query.userEmail || '').toString().trim();

        const result = await sql.query`
            SELECT * FROM EnquiryQuotes WHERE ID = ${id}
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
        request.input('leadJobName', sql.NVarChar, leadJobName || null);
        request.input('ownJobName', sql.NVarChar, ownJobName || null);

        const result = await request.query(`
            SELECT ID, QuoteNumber, QuoteDate, ToName, ToAddress, ToPhone, ToEmail, ToFax, ToAttention,
                   Subject, CustomerReference, YourRef, QuoteType, ValidityDays, PreparedBy, PreparedByEmail,
                   Signatory, SignatoryDesignation, Status, RevisionNo, TotalAmount, QuoteNo,
                   RequestNo, CreatedAt, UpdatedAt, OwnJob, LeadJob,
                   ShowScopeOfWork, ShowBasisOfOffer, ShowExclusions, ShowPricingTerms,
                   ShowSchedule, ShowWarranty, ShowResponsibilityMatrix, ShowTermsConditions, ShowAcceptance, ShowBillOfQuantity,
                   ScopeOfWork, BasisOfOffer, Exclusions, PricingTerms,
                   Schedule, Warranty, ResponsibilityMatrix, TermsConditions, Acceptance, BillOfQuantity,
                   CustomClauses, ClauseOrder
            FROM EnquiryQuotes
            WHERE LTRIM(RTRIM(ISNULL(CAST(RequestNo AS NVARCHAR(50)), ''))) = LTRIM(RTRIM(ISNULL(@requestNo, '')))
              AND (@toName IS NULL OR LOWER(LTRIM(RTRIM(ISNULL(ToName, N'')))) = LOWER(LTRIM(RTRIM(ISNULL(@toName, N'')))))
              AND (@leadJobName IS NULL OR LOWER(LTRIM(RTRIM(ISNULL(LeadJob, N'')))) = LOWER(LTRIM(RTRIM(ISNULL(@leadJobName, N'')))))
              AND (@ownJobName IS NULL OR LOWER(LTRIM(RTRIM(ISNULL(OwnJob, N'')))) = LOWER(LTRIM(RTRIM(ISNULL(@ownJobName, N'')))))
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
            quoteNumber: 'Draft',
            userIsSubjobUser,   // True if user's jobs are all subjobs (not lead job)
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
            ownJob = ''
        } = req.body;

        const customClausesJson = JSON.stringify(customClauses);
        const clauseOrderJson = JSON.stringify(clauseOrder);

        if (!requestNo) {
            return res.status(400).json({ error: 'Request number is required' });
        }

        let dept = departmentCode || "AAC";
        let division = divisionCode || "GEN";
        let effectiveOwnJob = (ownJob || '').trim();

        // --- BACKEND IDENTITY ENFORCEMENT (User Requirement: Use Mail ID for Codes) ---
        if (preparedByEmail) {
            try {
                const normalizedUser = preparedByEmail.toLowerCase().replace(/@almcg\.com/g, '@almoayyedcg.com');
                const userRes = await sql.query`SELECT Department FROM Master_ConcernedSE WHERE EmailId = ${normalizedUser}`;
                const userDept = userRes.recordset.length > 0 ? userRes.recordset[0].Department : null;

                if (userDept) {
                    const masterRes = await sql.query`SELECT * FROM Master_EnquiryFor WHERE ItemName = ${userDept}`;
                    const masterData = masterRes.recordset[0];
                    if (masterData) {
                        console.log(`[Quote Backend] Forcing identity based on email ${preparedByEmail} -> ${userDept} (${masterData.DivisionCode})`);
                        dept = masterData.DepartmentCode || dept;
                        division = masterData.DivisionCode || division;
                        // Keep OwnJob aligned with creator department to avoid cross-branch mis-mapping.
                        effectiveOwnJob = userDept;
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
                TotalAmount, Status, CustomClauses, ClauseOrder,
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
                ${totalAmount}, ${status}, ${customClausesJson}, ${clauseOrderJson},
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
            ownJob
        } = req.body;

        const customClausesJson = JSON.stringify(customClauses);
        const clauseOrderJson = JSON.stringify(clauseOrder);
        let effectiveOwnJob = (ownJob || '').trim();

        if (preparedByEmail) {
            try {
                const normalizedUser = preparedByEmail.toLowerCase().replace(/@almcg\.com/g, '@almoayyedcg.com');
                const userRes = await sql.query`SELECT Department FROM Master_ConcernedSE WHERE EmailId = ${normalizedUser}`;
                const userDept = userRes.recordset.length > 0 ? userRes.recordset[0].Department : null;
                if (userDept) effectiveOwnJob = userDept;
            } catch (e) {
                console.error('[Quote Update] Identity lookup error:', e);
            }
        }

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
            ownJob
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
        let effectiveOwnJob = ownJob !== undefined ? ownJob : existing.OwnJob;

        if (preparedByEmail || existing.PreparedByEmail) {
            try {
                const emailForIdentity = (preparedByEmail || existing.PreparedByEmail || '').toLowerCase().replace(/@almcg\.com/g, '@almoayyedcg.com');
                if (emailForIdentity) {
                    const userRes = await sql.query`SELECT Department FROM Master_ConcernedSE WHERE EmailId = ${emailForIdentity}`;
                    const userDept = userRes.recordset.length > 0 ? userRes.recordset[0].Department : null;
                    if (userDept) effectiveOwnJob = userDept;
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
                TotalAmount, Status, CustomClauses, ClauseOrder,
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
                ${totalAmount !== undefined ? totalAmount : existing.TotalAmount}, 
                'Saved', 
                ${customClausesJson}, 
                ${clauseOrderJson},
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


const express = require('express');
const router = express.Router();
const { sql } = require('../dbConfig');

const sanitizeInput = (input) => {
    if (input === undefined || input === null || input === 'null' || input === 'undefined') return null;
    const s = String(input).trim();
    return s === '' ? null : s;
};

/** Non–CC-mail users: force filters to their company / division / SE so APIs cannot be scoped wider via query string. */
async function applySalesReportEmailScope(req) {
    delete req.salesReportForceSeName;
    delete req.salesReportNonCcBlock;
    delete req.salesReportNonCcScope;
    delete req.salesReportUserEmail;

    const raw = req.query && req.query.email;
    if (!raw || String(raw).trim() === '') return;
    const email = String(raw)
        .toLowerCase()
        .replace(/@almcg\.com/g, '@almoayyedcg.com')
        .trim();

    const rq = new sql.Request();
    rq.input('email', sql.NVarChar, email);
    const userRes = await rq.query(`
        SELECT TOP 1 FullName, Department
        FROM Master_ConcernedSE
        WHERE LOWER(LTRIM(RTRIM(ISNULL(EmailId, '')))) = LOWER(LTRIM(RTRIM(@email)))
    `);
    const user = userRes.recordset?.[0];
    if (!user) {
        req.salesReportNonCcBlock = true;
        return;
    }

    const ccReq = new sql.Request();
    ccReq.input('email', sql.NVarChar, email);
    const ccRes = await ccReq.query(`
        SELECT TOP 1 1 AS ok
        FROM Master_EnquiryFor
        WHERE ',' + REPLACE(REPLACE(ISNULL(CCMailIds, ''), ' ', ''), ';', ',') + ','
              LIKE '%,' + REPLACE(REPLACE(@email, ' ', ''), ';', ',') + ',%'
    `);
    if ((ccRes.recordset || []).length > 0) return;

    req.salesReportNonCcScope = true;
    req.salesReportUserEmail = email;

    const dept = String(user.Department || '').trim();
    let company = '';
    if (dept) {
        const cReq = new sql.Request();
        cReq.input('dept', sql.NVarChar, dept);
        const cRes = await cReq.query(`
            SELECT TOP 1 CompanyName FROM Master_EnquiryFor WHERE DepartmentName = @dept
        `);
        company = String(cRes.recordset?.[0]?.CompanyName || '').trim();
    }
    if (company) req.query.company = company;
    if (dept) req.query.division = dept;
    const fn = String(user.FullName || '').trim();
    if (!fn) {
        req.salesReportNonCcBlock = true;
        return;
    }
    req.query.role = fn;
    req.salesReportForceSeName = fn;
}

/** Latest Probability row per enquiry (by UpdatedDateTime). */
const SQL_LATEST_PROB_CTE = `
WITH LatestProb AS (
    SELECT * FROM (
        SELECT P.*,
            ROW_NUMBER() OVER (PARTITION BY P.RequestNo ORDER BY P.UpdatedDateTime DESC) AS __rn
        FROM dbo.Probability P
    ) __lp WHERE __lp.__rn = 1
)
`;

/** Parse money stored as NVARCHAR on Probability (handles commas, BD prefix). */
const SQL_PROB_JOB_VALUE = `
CASE
  WHEN NULLIF(LTRIM(RTRIM(ISNULL(P.FinalJobValueBooked, ''))), '') IS NOT NULL
    THEN TRY_CONVERT(DECIMAL(18,2), REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(P.FinalJobValueBooked)), ',', ''), 'BD', ''), ' ', ''))
  ELSE TRY_CONVERT(DECIMAL(18,2), REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(ISNULL(P.TotalQuotedValue, '0'))), ',', ''), 'BD', ''), ' ', ''))
END`;

/** Won (sales KPI): FinalJobValueBooked only — no fallback to TotalQuotedValue. */
const SQL_PROB_WON_VALUE = `
ISNULL(TRY_CONVERT(DECIMAL(18,2), REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(ISNULL(P.FinalJobValueBooked, ''))), ',', ''), 'BD', ''), ' ', '')), 0)`;

/** MIN(TotalAmount) per enquiry — least quote when multiple customers. */
const SQL_MIN_QUOTE_AMOUNT = `(SELECT MIN(ISNULL(TotalAmount, 0)) FROM dbo.EnquiryQuotes Q_M WHERE Q_M.RequestNo = P.RequestNo)`;

const SQL_PROB_NETQUOTED_PARSED = `
NULLIF(TRY_CONVERT(DECIMAL(18,2), REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(ISNULL(P.NetQuotedValue, ''))), ',', ''), 'BD', ''), ' ', '')), 0)`;

/**
 * Lost / Follow-up (Won/Lost section): least EnquiryQuotes.TotalAmount per project,
 * else Probability.NetQuotedValue (parsed).
 */
const SQL_PROB_LOST_FOLLOW_VALUE = `
COALESCE(${SQL_MIN_QUOTE_AMOUNT}, ${SQL_PROB_NETQUOTED_PARSED}, CAST(0 AS DECIMAL(18,2)))`;

/**
 * Status treated as Won (UI uses exact "Won" — avoid LIKE '%won%' which matches "Not Won", etc.).
 */
const SQL_PROB_STATUS_WON_STRICT = `(
  LOWER(LTRIM(RTRIM(ISNULL(P.Status, '')))) = 'won'
  OR (
    LOWER(LTRIM(RTRIM(ISNULL(P.Status, '')))) LIKE 'won %'
    AND LOWER(LTRIM(RTRIM(ISNULL(P.Status, '')))) NOT LIKE '%follow%'
    AND LOWER(LTRIM(RTRIM(ISNULL(P.Status, '')))) NOT LIKE '%lost%'
  )
)`;

/** FinalJobValueBooked present and non-zero after parse. */
const SQL_PROB_HAS_FINAL_BOOKED_MONEY = `(
  NULLIF(LTRIM(RTRIM(ISNULL(P.FinalJobValueBooked, ''))), '') IS NOT NULL
  AND ISNULL(TRY_CONVERT(DECIMAL(18,2), REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(ISNULL(P.FinalJobValueBooked, ''))), ',', ''), 'BD', ''), ' ', '')), 0) <> 0
)`;

/** Booked / Won KPIs: explicit Won status AND captured final job value (not Follow-up with stray booked amount). */
const SQL_PROB_WON_FOR_METRICS = `${SQL_PROB_STATUS_WON_STRICT} AND ${SQL_PROB_HAS_FINAL_BOOKED_MONEY}`;

/** Non–CC: Probability.Status must be exactly Won (case-insensitive) + FinalJobValueBooked per business rule. */
const SQL_PROB_WON_NON_CC_METRICS =
    `LOWER(LTRIM(RTRIM(ISNULL(P.Status, '')))) = 'won' AND ${SQL_PROB_HAS_FINAL_BOOKED_MONEY}`;

function getProbWonMetricsSql(req) {
    return req.salesReportNonCcScope === true ? SQL_PROB_WON_NON_CC_METRICS : SQL_PROB_WON_FOR_METRICS;
}

/** Whitelist → SQL fragment for Top Jobs table — EnquiryMaster (legacy). */
const TOP_JOB_BOOKED_STATUS_SQL = {
    Won: "E.Status = 'Won'",
    Lost: "E.Status = 'Lost'",
    Pending: "E.Status = 'Pending'",
    'Follow Up': "(E.Status IN ('Follow-up', 'FollowUp', 'Follow Up'))",
    'On Hold': "(E.Status IN ('On Hold', 'Hold', 'OnHold'))",
    Cancelled: "E.Status = 'Cancelled'",
    Retendered: "E.Status = 'Retendered'"
};

/** Top jobs / filters using latest Probability.Status (case-insensitive keywords). Won branch uses getProbWonMetricsSql(req). */
const TOP_JOB_PROB_STATUS_SQL = {
    Won: SQL_PROB_WON_FOR_METRICS,
    Lost: "(LOWER(LTRIM(RTRIM(ISNULL(P.Status, '')))) LIKE '%lost%')",
    Pending: "(LOWER(LTRIM(RTRIM(ISNULL(P.Status, '')))) LIKE '%pending%' OR LOWER(LTRIM(RTRIM(ISNULL(P.Status, '')))) LIKE '%quote%')",
    'Follow Up': "(LOWER(LTRIM(RTRIM(ISNULL(P.Status, '')))) LIKE '%follow%')",
    'On Hold': "(LOWER(LTRIM(RTRIM(ISNULL(P.Status, '')))) LIKE '%hold%')",
    Cancelled: "(LOWER(LTRIM(RTRIM(ISNULL(P.Status, '')))) LIKE '%cancel%')",
    Retendered: "(LOWER(LTRIM(RTRIM(ISNULL(P.Status, '')))) LIKE '%retender%')"
};

function getTopJobBookedStatusWhere(raw) {
    const key = sanitizeInput(raw);
    if (key && TOP_JOB_BOOKED_STATUS_SQL[key]) return TOP_JOB_BOOKED_STATUS_SQL[key];
    return TOP_JOB_BOOKED_STATUS_SQL.Won;
}

function getTopJobProbStatusWhere(raw, req) {
    const key = sanitizeInput(raw);
    if (key === 'Won') return getProbWonMetricsSql(req || {});
    if (key && TOP_JOB_PROB_STATUS_SQL[key]) return TOP_JOB_PROB_STATUS_SQL[key];
    return getProbWonMetricsSql(req || {});
}

/** Job column for Top Jobs from Probability — aligns with Won/Lost dollar rules. */
function getTopJobProbValueExpr(topJobStatus) {
    const key = sanitizeInput(topJobStatus);
    if (key === 'Won') return `(${SQL_PROB_WON_VALUE})`;
    if (key === 'Lost' || key === 'Follow Up') return `(${SQL_PROB_LOST_FOLLOW_VALUE})`;
    return `(${SQL_PROB_JOB_VALUE})`;
}

/**
 * EnquiryMaster scope: non–CC → company + latest Probability.OwnJobName = division + ConcernedSE↔Master email;
 * CC / others → EnquiryFor division/company + optional ConcernedSE by name.
 */
function appendSalesReportEnquiryFilters(req, request, safeCompany, safeDivision, safeRole) {
    let filterClause = '';
    const isNonCcSalesScope = req.salesReportNonCcScope === true;
    const srUserEmail = req.salesReportUserEmail ? String(req.salesReportUserEmail).trim() : '';

    if (isNonCcSalesScope) {
        if (srUserEmail) {
            request.input('srUserEmail', sql.NVarChar, srUserEmail);
        }
        if (req.salesReportNonCcBlock === true) {
            filterClause += ' AND 1=0 ';
        } else if (!srUserEmail) {
            filterClause += ' AND 1=0 ';
        } else {
            if (safeCompany && safeCompany !== 'All') {
                request.input('company', sql.NVarChar, safeCompany);
                filterClause += ` AND EXISTS (SELECT 1 FROM EnquiryFor ef JOIN Master_EnquiryFor mef ON (ef.ItemName = mef.ItemName OR ef.ItemName LIKE '%- ' + mef.ItemName OR ef.ItemName LIKE '%-' + mef.ItemName) WHERE ef.RequestNo = E.RequestNo AND LTRIM(RTRIM(mef.CompanyName)) = @company) `;
            }
            if (safeDivision && safeDivision !== 'All') {
                request.input('division', sql.NVarChar, safeDivision);
                filterClause += `
                  AND EXISTS (
                    SELECT 1
                    FROM (
                      SELECT P2.RequestNo, P2.OwnJobName,
                        ROW_NUMBER() OVER (PARTITION BY P2.RequestNo ORDER BY P2.UpdatedDateTime DESC) AS __rn
                      FROM dbo.Probability P2
                    ) lp
                    WHERE lp.__rn = 1
                      AND lp.RequestNo = E.RequestNo
                      AND UPPER(LTRIM(RTRIM(ISNULL(lp.OwnJobName, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@division, ''))))
                  ) `;
            }
            filterClause += `
                  AND EXISTS (
                    SELECT 1
                    FROM ConcernedSE cs
                    INNER JOIN Master_ConcernedSE m ON UPPER(LTRIM(RTRIM(ISNULL(m.FullName, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(cs.SEName, N''))))
                    WHERE cs.RequestNo = E.RequestNo
                      AND LOWER(LTRIM(RTRIM(REPLACE(REPLACE(ISNULL(m.EmailId, N''), N'@almcg.com', N'@almoayyedcg.com'), N'@ALMCG.COM', N'@almoayyedcg.com'))))
                       = LOWER(LTRIM(RTRIM(REPLACE(REPLACE(ISNULL(@srUserEmail, N''), N'@almcg.com', N'@almoayyedcg.com'), N'@ALMCG.COM', N'@almoayyedcg.com'))))
                  ) `;
        }
    } else if (safeDivision && safeDivision !== 'All') {
        request.input('division', sql.NVarChar, safeDivision);
        filterClause += ` AND EXISTS (SELECT 1 FROM EnquiryFor ef JOIN Master_EnquiryFor mef ON (ef.ItemName = mef.ItemName OR ef.ItemName LIKE '%- ' + mef.ItemName OR ef.ItemName LIKE '%-' + mef.ItemName) WHERE ef.RequestNo = E.RequestNo AND LTRIM(RTRIM(mef.DepartmentName)) = @division) `;
    } else if (safeCompany && safeCompany !== 'All') {
        request.input('company', sql.NVarChar, safeCompany);
        filterClause += ` AND EXISTS (SELECT 1 FROM EnquiryFor ef JOIN Master_EnquiryFor mef ON (ef.ItemName = mef.ItemName OR ef.ItemName LIKE '%- ' + mef.ItemName OR ef.ItemName LIKE '%-' + mef.ItemName) WHERE ef.RequestNo = E.RequestNo AND LTRIM(RTRIM(mef.CompanyName)) = @company) `;
    }

    if (!isNonCcSalesScope) {
        if (req.salesReportNonCcBlock === true) {
            filterClause += ' AND 1=0 ';
        } else if (req.salesReportForceSeName) {
            const seF = String(req.salesReportForceSeName).trim();
            request.input('se', sql.NVarChar, seF);
            filterClause += ` AND EXISTS (SELECT 1 FROM ConcernedSE cse WHERE cse.RequestNo = E.RequestNo AND LTRIM(RTRIM(cse.SEName)) = LTRIM(RTRIM(@se))) `;
        } else if (safeRole && safeRole !== 'All') {
            request.input('se', sql.NVarChar, safeRole);
            filterClause += ` AND EXISTS (SELECT 1 FROM ConcernedSE cse WHERE cse.RequestNo = E.RequestNo AND LTRIM(RTRIM(cse.SEName)) = LTRIM(RTRIM(@se))) `;
        }
    }

    return filterClause;
}

/**
 * Shared request + item-value FROM clause for top-job table and /summary EnquiryMaster queries.
 * @returns {object|null}
 */
function buildSalesReportItemValueContext(req) {
    const { year, company, division, role } = req.query;
    if (!year) return null;

    const request = new sql.Request();
    const safeYear = year ? parseInt(year, 10) : null;
    const safeCompany = company ? String(company).trim() : null;
    const safeDivision = division ? String(division).trim() : null;
    const safeRole = role ? String(role).trim() : null;
    const safeQuarter = (req.query.quarter && req.query.quarter !== 'All') ? String(req.query.quarter).trim() : null;
    let quarterNum = null;
    if (safeQuarter) quarterNum = parseInt(safeQuarter.replace('Q', ''), 10);

    request.input('year', sql.Int, safeYear);
    if (safeQuarter) {
        request.input('quarterNums', sql.Int, quarterNum);
        request.input('quarterStrs', sql.NVarChar, safeQuarter);
    }

    const filterClause = appendSalesReportEnquiryFilters(req, request, safeCompany, safeDivision, safeRole);

    const effectiveSeForTarget =
        (req.salesReportForceSeName && String(req.salesReportForceSeName).trim())
        || (safeRole && safeRole !== 'All' ? safeRole : null);

    /** SalesTargets filters use @se — non–CC scope uses email on ConcernedSE only, so @se was never bound. */
    if (effectiveSeForTarget && req.salesReportNonCcScope === true) {
        request.input('se', sql.NVarChar, effectiveSeForTarget);
    }

    const selectedCustomerApply = `
            OUTER APPLY (
                SELECT TOP 1 ToName 
                FROM EnquiryQuotes 
                WHERE RequestNo = E.RequestNo 
                ORDER BY 
                    CASE WHEN QuoteNumber = E.WonQuoteRef THEN 0 ELSE 1 END, 
                    UpdatedAt DESC
            ) SC
        `;

    let itemValueSQL = '';
    if (safeDivision && safeDivision !== 'All') {
        itemValueSQL = `
                 OUTER APPLY (
                     SELECT SUM(ISNULL(EPV.Price, 0)) as Total
                     FROM EnquiryFor EF_Inner
                     JOIN Master_EnquiryFor MEF_Inner ON (EF_Inner.ItemName = MEF_Inner.ItemName OR EF_Inner.ItemName LIKE '%- ' + MEF_Inner.ItemName OR EF_Inner.ItemName LIKE '%-' + MEF_Inner.ItemName)
                     OUTER APPLY (
                         SELECT SUM(ISNULL(Price, 0)) as Price
                         FROM EnquiryPricingValues EPV
                         WHERE EPV.RequestNo = EF_Inner.RequestNo 
                           AND (EPV.EnquiryForID = EF_Inner.ID OR EPV.EnquiryForItem = EF_Inner.ItemName)
                           AND (EPV.CustomerName = SC.ToName OR SC.ToName IS NULL)
                     ) EPV
                     WHERE EF_Inner.RequestNo = E.RequestNo
                       AND LTRIM(RTRIM(MEF_Inner.DepartmentName)) = @division
                 ) ItemValue
             `;
    } else {
        itemValueSQL = `
                 OUTER APPLY (
                     SELECT SUM(ISNULL(EPV.Price, 0)) as Total
                     FROM EnquiryFor EF_Inner
                     OUTER APPLY (
                         SELECT SUM(ISNULL(Price, 0)) as Price
                         FROM EnquiryPricingValues EPV
                         WHERE EPV.RequestNo = EF_Inner.RequestNo 
                           AND (EPV.EnquiryForID = EF_Inner.ID OR EPV.EnquiryForItem = EF_Inner.ItemName)
                           AND (EPV.CustomerName = SC.ToName OR SC.ToName IS NULL)
                     ) EPV
                     WHERE EF_Inner.RequestNo = E.RequestNo
                       AND (EF_Inner.ParentID IS NULL OR EF_Inner.ParentID = 0)
                 ) ItemValue
             `;
    }
    const itemValueApply = selectedCustomerApply + itemValueSQL;
    const itemValueCol = 'ISNULL(ItemValue.Total, 0)';

    return {
        request,
        filterClause,
        itemValueApply,
        itemValueCol,
        safeYear,
        safeCompany,
        safeDivision,
        safeRole,
        effectiveSeForTarget,
        nonCcBlock: req.salesReportNonCcBlock === true,
        salesReportNonCcScope: req.salesReportNonCcScope === true,
        safeQuarter,
        quarterNum
    };
}

router.get('/company-by-division', async (req, res) => {
    try {
        const { division } = req.query;
        if (!division) return res.status(400).json({ error: 'Division is required' });

        const request = new sql.Request();
        request.input('division', sql.NVarChar, division);

        const result = await request.query(`
            SELECT TOP 1 CompanyName 
            FROM Master_EnquiryFor 
            WHERE DepartmentName = @division
        `);

        if (result.recordset.length > 0) {
            res.json({ company: result.recordset[0].CompanyName });
        } else {
            res.json({ company: '' });
        }
    } catch (err) {
        console.error('Error fetching company for division:', err);
        res.status(500).json({ error: 'Failed to fetch company' });
    }
});

router.get('/user-access-details', async (req, res) => {
    try {
        const { email: rawEmail } = req.query;
        if (!rawEmail) return res.status(400).json({ error: 'Email is required' });
        const email = rawEmail.toLowerCase().replace(/@almcg\.com/g, '@almoayyedcg.com').trim();

        const request = new sql.Request();
        request.input('email', sql.NVarChar, email);

        // 1. Fetch User Details
        const userRes = await request.query(`
            SELECT FullName, Designation, Department 
            FROM Master_ConcernedSE 
            WHERE EmailId = @email
        `);

        if (userRes.recordset.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = userRes.recordset[0];
        const userDepartment = (user.Department || '').trim();
        const userFullName = (user.FullName || '').trim();

        const ccReq = new sql.Request();
        ccReq.input('email', sql.NVarChar, email);
        const ccRes = await ccReq.query(`
            SELECT TOP 1 1 AS Found
            FROM Master_EnquiryFor
            WHERE ',' + REPLACE(REPLACE(ISNULL(CCMailIds, ''), ' ', ''), ';', ',') + ','
                  LIKE '%,' + REPLACE(REPLACE(@email, ' ', ''), ';', ',') + ',%'
        `);
        const isInCcMailIds = (ccRes.recordset || []).length > 0;

        let company = '';
        let departmentName = userDepartment;
        if (userDepartment) {
            const companyReq = new sql.Request();
            companyReq.input('dept', sql.NVarChar, userDepartment);
            const companyRes = await companyReq.query(`
                 SELECT TOP 1 CompanyName, DepartmentName
                 FROM Master_EnquiryFor
                 WHERE DepartmentName = @dept
            `);
            if (companyRes.recordset.length > 0) {
                company = (companyRes.recordset[0].CompanyName || '').trim();
                departmentName = (companyRes.recordset[0].DepartmentName || userDepartment).trim();
            }
        }

        // Rule: if email is NOT in CCMailIds, lock Company/Department/Role to user defaults; Year remains changeable.
        const lockCompanyDivisionRole = !isInCcMailIds;
        res.json({
            lockCompanyDivisionRole,
            isCcMember: isInCcMailIds,
            company: company || '',
            division: departmentName || '',
            role: userFullName || ''
        });

    } catch (err) {
        console.error('Error fetching user access details:', err);
        res.status(500).json({ error: 'Server Error' });
    }
});

router.get('/filters', async (req, res) => {
    try {
        const { company, division, email: rawEmail } = req.query;
        const request = new sql.Request();
        const scopedEmail = sanitizeInput(rawEmail)
            ? String(rawEmail).toLowerCase().replace(/@almcg\.com/g, '@almoayyedcg.com').trim()
            : null;

        // 1. Years (Always distinct from EnquiryMaster)
        const yearQuery = `
            SELECT DISTINCT YEAR(EnquiryDate) as Year 
            FROM EnquiryMaster 
            WHERE EnquiryDate IS NOT NULL 
            ORDER BY Year DESC
        `;

        const years = await new sql.Request().query(yearQuery);

        if (!scopedEmail) {
            const companyQuery = `
                SELECT DISTINCT CompanyName 
                FROM Master_EnquiryFor 
                WHERE CompanyName IS NOT NULL AND CompanyName <> ''
                ORDER BY CompanyName ASC
            `;
            let divisionSQL = `
                SELECT DISTINCT DepartmentName 
                FROM Master_EnquiryFor 
                WHERE DepartmentName IS NOT NULL AND DepartmentName <> ''
            `;
            if (company && company !== 'All') {
                divisionSQL += ` AND CompanyName = @company `;
                request.input('company', sql.NVarChar, company);
            }
            divisionSQL += ` ORDER BY DepartmentName ASC`;

            // SE list: match company (when set) and division (when set) via Master_EnquiryFor → Department
            let roleSQL = `
                SELECT DISTINCT SE.FullName 
                FROM Master_ConcernedSE SE
                INNER JOIN Master_EnquiryFor M ON LTRIM(RTRIM(M.DepartmentName)) = LTRIM(RTRIM(SE.Department))
                WHERE SE.FullName IS NOT NULL AND SE.FullName <> ''
            `;
            if (company && company !== 'All') {
                roleSQL += ` AND M.CompanyName = @company `;
            }
            if (division && division !== 'All') {
                roleSQL += ` AND SE.Department = @division `;
                request.input('division', sql.NVarChar, division);
            }
            roleSQL += ` ORDER BY SE.FullName ASC`;

            const [companies, divisions, roles] = await Promise.all([
                new sql.Request().query(companyQuery),
                request.query(divisionSQL),
                request.query(roleSQL)
            ]);

            return res.json({
                years: years.recordset.map(r => r.Year),
                companies: companies.recordset.map(r => r.CompanyName),
                divisions: divisions.recordset.map(r => r.DepartmentName),
                roles: roles.recordset.map(r => r.FullName)
            });
        }

        const userReq = new sql.Request();
        userReq.input('email', sql.NVarChar, scopedEmail);
        const userRes = await userReq.query(`
            SELECT TOP 1 FullName, Department
            FROM Master_ConcernedSE
            WHERE LOWER(LTRIM(RTRIM(ISNULL(EmailId, '')))) = LOWER(LTRIM(RTRIM(@email)))
        `);
        const user = (userRes.recordset || [])[0] || { FullName: '', Department: '' };
        const userDepartment = (user.Department || '').trim();
        const userFullName = (user.FullName || '').trim();

        const ccReq = new sql.Request();
        ccReq.input('email', sql.NVarChar, scopedEmail);
        const ccRows = await ccReq.query(`
            SELECT CompanyName, DepartmentName
            FROM Master_EnquiryFor
            WHERE ',' + REPLACE(REPLACE(ISNULL(CCMailIds, ''), ' ', ''), ';', ',') + ','
                  LIKE '%,' + REPLACE(REPLACE(@email, ' ', ''), ';', ',') + ',%'
        `);
        const isCcMember = (ccRows.recordset || []).length > 0;

        if (!isCcMember) {
            let lockedCompany = '';
            if (userDepartment) {
                const cReq = new sql.Request();
                cReq.input('dept', sql.NVarChar, userDepartment);
                const cRes = await cReq.query(`
                    SELECT TOP 1 CompanyName
                    FROM Master_EnquiryFor
                    WHERE DepartmentName = @dept
                `);
                lockedCompany = ((cRes.recordset || [])[0]?.CompanyName || '').trim();
            }
            return res.json({
                years: years.recordset.map(r => r.Year),
                companies: lockedCompany ? [lockedCompany] : [],
                divisions: userDepartment ? [userDepartment] : [],
                roles: userFullName ? [userFullName] : []
            });
        }

        const scopedPairs = (ccRows.recordset || []).map(r => ({
            company: (r.CompanyName || '').trim(),
            division: (r.DepartmentName || '').trim()
        })).filter(r => r.company || r.division);

        const safeQCompany = company && String(company).trim() !== '' && company !== 'All' ? String(company).trim() : null;
        const safeQDivision = division && String(division).trim() !== '' && division !== 'All' ? String(division).trim() : null;

        // Always return every company the user can access (CC list from master).
        const companies = [...new Set(scopedPairs.map(r => r.company).filter(Boolean))].sort();

        // Divisions: only those for the selected company; if no company, all CC-scoped divisions.
        const divisionSource = safeQCompany
            ? scopedPairs.filter((p) => p.company === safeQCompany)
            : scopedPairs;
        const divisions = [...new Set(divisionSource.map((r) => r.division).filter(Boolean))].sort();

        // SE names: Master_ConcernedSE in the relevant department(s) for the selected company/division.
        let departmentsForRoles = [];
        if (safeQDivision) {
            const okPair = scopedPairs.some(
                (p) => p.division === safeQDivision && (!safeQCompany || p.company === safeQCompany)
            );
            if (okPair) departmentsForRoles = [safeQDivision];
        } else if (safeQCompany) {
            departmentsForRoles = [...new Set(divisionSource.map((r) => r.division).filter(Boolean))];
        } else {
            departmentsForRoles = [...new Set(scopedPairs.map((r) => r.division).filter(Boolean))];
        }

        let roles = [];
        if (departmentsForRoles.length > 0) {
            const roleReq = new sql.Request();
            const divisionList = departmentsForRoles.map((d, i) => {
                const key = `d${i}`;
                roleReq.input(key, sql.NVarChar, d);
                return `@${key}`;
            }).join(', ');
            const roleRes = await roleReq.query(`
                SELECT DISTINCT FullName
                FROM Master_ConcernedSE
                WHERE FullName IS NOT NULL
                  AND FullName <> ''
                  AND Department IN (${divisionList})
                ORDER BY FullName ASC
            `);
            roles = roleRes.recordset.map(r => r.FullName);
        }

        res.json({
            years: years.recordset.map(r => r.Year),
            companies,
            divisions,
            roles
        });

    } catch (err) {
        console.error('Error fetching Sales Report filters:', err);
        res.status(500).json({ error: 'Failed to fetch filters' });
    }
});

router.get('/summary', async (req, res) => {
    try {
        await applySalesReportEmailScope(req);
        const ctx = buildSalesReportItemValueContext(req);
        if (!ctx) return res.status(400).json({ error: 'Year is required' });

        const {
            request,
            filterClause,
            itemValueApply,
            itemValueCol,
            safeYear,
            safeCompany,
            safeDivision,
            safeRole,
            effectiveSeForTarget,
            nonCcBlock,
            safeQuarter,
            quarterNum
        } = ctx;

        const probDateExpr =
            'COALESCE(P.BookedDate, P.ExpectedDate, P.UpdatedDateTime, E.EnquiryDate)';

        const wonMetricsSql = getProbWonMetricsSql(req);

        // 1. Target vs Job Booked — target from SalesTargets (All SE = sum every SalesEngineer row in division)
        let targetFilter = ' WHERE FinancialYear = @year ';
        if (nonCcBlock) {
            targetFilter += ' AND 1=0 ';
        } else {
            if (safeDivision && safeDivision !== 'All') targetFilter += ' AND Division = @division ';
            if (effectiveSeForTarget) targetFilter += ' AND SalesEngineer = @se ';
        }
        if (safeQuarter) targetFilter += ' AND Quarter = @quarterStrs ';

        const targetRes = await request.query(`
            SELECT Quarter, SUM(ISNULL(TargetValue, 0)) as TotalTarget
            FROM SalesTargets
            ${targetFilter}
            GROUP BY Quarter
        `);

        // Actual job booking from latest Probability per enquiry (won / booked value)
        let actualRes = { recordset: [] };
        try {
            actualRes = await request.query(`
            ${SQL_LATEST_PROB_CTE}
            SELECT DATEPART(QUARTER, COALESCE(P.BookedDate, P.ExpectedDate, P.UpdatedDateTime)) AS Q,
                SUM(${SQL_PROB_WON_VALUE}) AS TotalActual
            FROM LatestProb P
            INNER JOIN EnquiryMaster E ON E.RequestNo = P.RequestNo
            WHERE ${wonMetricsSql}
              AND YEAR(${probDateExpr}) = @year ${filterClause}
              ${safeQuarter ? `AND DATEPART(QUARTER, ${probDateExpr}) = @quarterNums` : ''}
            GROUP BY DATEPART(QUARTER, COALESCE(P.BookedDate, P.ExpectedDate, P.UpdatedDateTime))
            `);
        } catch (e) {
            console.warn('[Sales Report] Probability actual fallback:', e.message);
            actualRes = await request.query(`
                SELECT DATEPART(QUARTER, ExpectedOrderDate) as Q, SUM(${itemValueCol}) as TotalActual
                FROM EnquiryMaster E
                ${itemValueApply}
                WHERE Status = 'Won' AND YEAR(ExpectedOrderDate) = @year ${filterClause}
                ${safeQuarter ? 'AND DATEPART(QUARTER, ExpectedOrderDate) = @quarterNums' : ''}
                GROUP BY DATEPART(QUARTER, ExpectedOrderDate)
            `);
        }

        let gmTargetRes = { recordset: [] };
        let gmActualRes = { recordset: [] };
        try {
            gmTargetRes = await request.query(`
                SELECT
                    Quarter,
                    SUM(ISNULL(TargetValue, 0) * ISNULL(GrossProfitTarget, 0) / 100.0) AS TotalTarget,
                    SUM(ISNULL(TargetValue, 0)) AS TotalSalesTarget
                FROM SalesTargets
                ${targetFilter}
                GROUP BY Quarter
            `);
            gmActualRes = await request.query(`
            ${SQL_LATEST_PROB_CTE}
                SELECT DATEPART(QUARTER, COALESCE(P.BookedDate, P.ExpectedDate, P.UpdatedDateTime)) AS Q,
                    SUM((${SQL_PROB_WON_VALUE}) * ISNULL(P.GrossMargin, 0) / 100.0) AS TotalActual
                FROM LatestProb P
                INNER JOIN EnquiryMaster E ON E.RequestNo = P.RequestNo
                WHERE ${wonMetricsSql}
                  AND YEAR(${probDateExpr}) = @year ${filterClause}
                  ${safeQuarter ? `AND DATEPART(QUARTER, ${probDateExpr}) = @quarterNums` : ''}
                GROUP BY DATEPART(QUARTER, COALESCE(P.BookedDate, P.ExpectedDate, P.UpdatedDateTime))
            `);
        } catch (gmErr) {
            console.warn('[Sales Report] Gross margin summary skipped:', gmErr.message);
        }

        let winLossRes = { recordset: [] };
        try {
            winLossRes = await request.query(`
            ${SQL_LATEST_PROB_CTE}
            SELECT sg.StatusGrp AS Status, COUNT(*) AS Count, SUM(sg.JobVal) AS TotalValue
            FROM (
                SELECT
                    CASE
                        WHEN LOWER(LTRIM(RTRIM(ISNULL(P.Status, '')))) LIKE '%lost%' THEN 'Lost'
                        WHEN LOWER(LTRIM(RTRIM(ISNULL(P.Status, '')))) LIKE '%follow%' THEN 'Follow-up'
                        WHEN ${wonMetricsSql} THEN 'Won'
                        ELSE NULL
                    END AS StatusGrp,
                    CASE
                        WHEN LOWER(LTRIM(RTRIM(ISNULL(P.Status, '')))) LIKE '%lost%' THEN ${SQL_PROB_LOST_FOLLOW_VALUE}
                        WHEN LOWER(LTRIM(RTRIM(ISNULL(P.Status, '')))) LIKE '%follow%' THEN ${SQL_PROB_LOST_FOLLOW_VALUE}
                        WHEN ${wonMetricsSql} THEN ${SQL_PROB_WON_VALUE}
                        ELSE CAST(0 AS DECIMAL(18,2))
                    END AS JobVal
                FROM LatestProb P
                INNER JOIN EnquiryMaster E ON E.RequestNo = P.RequestNo
                WHERE YEAR(${probDateExpr}) = @year ${filterClause}
                ${safeQuarter ? `AND DATEPART(QUARTER, ${probDateExpr}) = @quarterNums` : ''}
            ) sg
            WHERE sg.StatusGrp IS NOT NULL
            GROUP BY sg.StatusGrp
            `);
        } catch (wlErr) {
            console.warn('[Sales Report] Win-loss Probability fallback:', wlErr.message);
            winLossRes = await request.query(`
            SELECT Status, COUNT(*) as Count, SUM(${itemValueCol}) as TotalValue
            FROM EnquiryMaster E
            ${itemValueApply}
            WHERE YEAR(COALESCE(ExpectedOrderDate, EnquiryDate)) = @year ${filterClause}
              AND Status IN ('Won', 'Lost', 'Follow-up', 'FollowUp')
              ${safeQuarter ? 'AND DATEPART(QUARTER, COALESCE(ExpectedOrderDate, EnquiryDate)) = @quarterNums' : ''}
            GROUP BY Status
        `);
        }

        // Quoted slice: least TotalAmount per enquiry across EnquiryQuotes (multi-customer), then sum in scope
        const quotedRes = await request.query(`
            SELECT 
                COUNT(DISTINCT E.RequestNo) as Cnt, 
                SUM(ISNULL(Q.MinQuote, 0)) as TotalValue
            FROM EnquiryMaster E
            INNER JOIN (
                SELECT RequestNo, MIN(ISNULL(TotalAmount, 0)) AS MinQuote
                FROM EnquiryQuotes
                GROUP BY RequestNo
            ) Q ON Q.RequestNo = E.RequestNo
            WHERE YEAR(COALESCE(E.ExpectedOrderDate, E.EnquiryDate)) = @year ${filterClause}
              ${safeQuarter ? 'AND DATEPART(QUARTER, COALESCE(E.ExpectedOrderDate, E.EnquiryDate)) = @quarterNums' : ''}
        `);

        // 3. Top 10 Customers
        const topCustomersQuery = `
            SELECT TOP 10 WonCustomerName as name, SUM(${itemValueCol}) as value
            FROM EnquiryMaster E
            ${itemValueApply}
            WHERE Status = 'Won' AND YEAR(ExpectedOrderDate) = @year ${filterClause}
              AND WonCustomerName IS NOT NULL AND WonCustomerName <> ''
              ${safeQuarter ? 'AND DATEPART(QUARTER, ExpectedOrderDate) = @quarterNums' : ''}
            GROUP BY WonCustomerName
            ORDER BY value DESC
        `;
        const topCustomersRes = await request.query(topCustomersQuery);

        // 4. Top 10 Projects
        const topProjectsQuery = `
            SELECT TOP 10 ProjectName as name, SUM(${itemValueCol}) as value
            FROM EnquiryMaster E
            ${itemValueApply}
            WHERE Status = 'Won' AND YEAR(ExpectedOrderDate) = @year ${filterClause}
              AND ProjectName IS NOT NULL AND ProjectName <> ''
              ${safeQuarter ? 'AND DATEPART(QUARTER, ExpectedOrderDate) = @quarterNums' : ''}
            GROUP BY ProjectName
            ORDER BY value DESC
        `;
        const topProjectsRes = await request.query(topProjectsQuery);

        // 5. Top 10 Clients (from EnquiryMaster ClientName)
        const topClientsQuery = `
            SELECT TOP 10 E.ClientName as name, SUM(${itemValueCol}) as value
            FROM EnquiryMaster E
            ${itemValueApply}
            WHERE E.Status = 'Won' AND YEAR(E.ExpectedOrderDate) = @year ${filterClause}
              AND E.ClientName IS NOT NULL AND E.ClientName <> ''
              ${safeQuarter ? 'AND DATEPART(QUARTER, E.ExpectedOrderDate) = @quarterNums' : ''}
            GROUP BY E.ClientName
            ORDER BY value DESC
        `;
        const topClientsRes = await request.query(topClientsQuery);

        const topJobProbWhere = getTopJobProbStatusWhere('Won', req);
        let topJobBookedRes = { recordset: [] };
        try {
            topJobBookedRes = await request.query(`
            ${SQL_LATEST_PROB_CTE}
            SELECT TOP 10
                x.ProjectName,
                x.JobValue,
                x.WonGrossProfit,
                x.CustomerName,
                x.ClientName,
                x.ConsultantName
            FROM (
                SELECT
                    E.ProjectName,
                    (${SQL_PROB_WON_VALUE}) AS JobValue,
                    P.GrossMargin AS WonGrossProfit,
                    LTRIM(RTRIM(ISNULL(P.ToName, ISNULL(E.WonCustomerName, E.CustomerName)))) AS CustomerName,
                    E.ClientName,
                    E.ConsultantName
                FROM LatestProb P
                INNER JOIN EnquiryMaster E ON E.RequestNo = P.RequestNo
                WHERE ${topJobProbWhere}
                  AND YEAR(${probDateExpr}) = @year ${filterClause}
                  ${safeQuarter ? `AND DATEPART(QUARTER, ${probDateExpr}) = @quarterNums` : ''}
            ) x
            ORDER BY x.JobValue DESC
            `);
        } catch (tjErr) {
            console.warn('[Sales Report] Top jobs Probability fallback:', tjErr.message);
            topJobBookedRes = await request.query(`
            SELECT TOP 10
                x.ProjectName,
                x.JobValue,
                x.WonGrossProfit,
                x.CustomerName,
                x.ClientName,
                x.ConsultantName
            FROM (
                SELECT
                    E.ProjectName,
                    ${itemValueCol} AS JobValue,
                    E.WonGrossProfit AS WonGrossProfit,
                    LTRIM(RTRIM(ISNULL(E.WonCustomerName, E.CustomerName))) AS CustomerName,
                    E.ClientName,
                    E.ConsultantName
                FROM EnquiryMaster E
                ${itemValueApply}
                WHERE ${TOP_JOB_BOOKED_STATUS_SQL.Won}
                  AND YEAR(E.ExpectedOrderDate) = @year ${filterClause}
                  ${safeQuarter ? 'AND DATEPART(QUARTER, E.ExpectedOrderDate) = @quarterNums' : ''}
            ) x
            ORDER BY x.JobValue DESC
        `);
        }

        let probabilityFunnelRes = { recordset: [] };
        try {
            probabilityFunnelRes = await request.query(`
            ${SQL_LATEST_PROB_CTE}
            SELECT 
                LTRIM(RTRIM(ISNULL(P.ProbabilityChance, ''))) AS ProbabilityName,
                MAX(CASE
                    WHEN PATINDEX('%[0-9]%', P.ProbabilityChance) > 0
                    THEN TRY_CONVERT(INT, LEFT(LTRIM(P.ProbabilityChance), PATINDEX('%[^0-9]%', LTRIM(P.ProbabilityChance) + 'x') - 1))
                    ELSE NULL
                END) AS ProbabilityPercentage,
                SUM(${SQL_PROB_JOB_VALUE}) AS TotalValue,
                COUNT(*) AS Count
            FROM LatestProb P
            INNER JOIN EnquiryMaster E ON E.RequestNo = P.RequestNo
            WHERE YEAR(${probDateExpr}) = @year ${filterClause}
              ${safeQuarter ? `AND DATEPART(QUARTER, ${probDateExpr}) = @quarterNums` : ''}
              AND LTRIM(RTRIM(ISNULL(P.ProbabilityChance, ''))) <> ''
              AND NOT (${wonMetricsSql})
              AND LOWER(LTRIM(RTRIM(ISNULL(P.Status, '')))) NOT LIKE '%lost%'
            GROUP BY LTRIM(RTRIM(ISNULL(P.ProbabilityChance, '')))
            ORDER BY ProbabilityPercentage ASC
            `);
        } catch (pfErr) {
            console.warn('[Sales Report] Funnel Probability fallback:', pfErr.message);
            probabilityFunnelRes = await request.query(`
            SELECT 
                ProbabilityOption as ProbabilityName,
                MAX(Probability) as ProbabilityPercentage,
                SUM(${itemValueCol}) as TotalValue,
                COUNT(*) as Count
            FROM EnquiryMaster E
            ${itemValueApply}
            WHERE YEAR(COALESCE(ExpectedOrderDate, EnquiryDate)) = @year ${filterClause}
              AND Status NOT IN ('Won', 'Lost')
              ${safeQuarter ? 'AND DATEPART(QUARTER, COALESCE(ExpectedOrderDate, EnquiryDate)) = @quarterNums' : ''}
              AND ProbabilityOption IS NOT NULL AND ProbabilityOption <> ''
            GROUP BY ProbabilityOption
            ORDER BY MAX(Probability) ASC
        `);
        }

        // Formatting data for frontend
        const quarters = [
            { name: 'Q1', target: 0, actual: 0 },
            { name: 'Q2', target: 0, actual: 0 },
            { name: 'Q3', target: 0, actual: 0 },
            { name: 'Q4', target: 0, actual: 0 }
        ];
        targetRes.recordset.forEach(r => {
            const idx = parseInt(r.Quarter.replace('Q', '')) - 1;
            if (quarters[idx]) quarters[idx].target = r.TotalTarget;
        });
        actualRes.recordset.forEach(r => {
            if (quarters[r.Q - 1]) quarters[r.Q - 1].actual = r.TotalActual;
        });

        const gmQuarters = [
            { name: 'Q1', target: 0, actual: 0, targetSalesBase: 0, targetGpPct: 0 },
            { name: 'Q2', target: 0, actual: 0, targetSalesBase: 0, targetGpPct: 0 },
            { name: 'Q3', target: 0, actual: 0, targetSalesBase: 0, targetGpPct: 0 },
            { name: 'Q4', target: 0, actual: 0, targetSalesBase: 0, targetGpPct: 0 }
        ];
        (gmTargetRes.recordset || []).forEach(r => {
            const idx = parseInt(String(r.Quarter || '').replace('Q', ''), 10) - 1;
            if (!gmQuarters[idx]) return;
            const gpMoney = Number(r.TotalTarget) || 0;
            const salesBase = Number(r.TotalSalesTarget) || 0;
            gmQuarters[idx].target = gpMoney;
            gmQuarters[idx].targetSalesBase = salesBase;
            gmQuarters[idx].targetGpPct = salesBase > 0 ? (gpMoney / salesBase) * 100 : 0;
        });
        (gmActualRes.recordset || []).forEach(r => {
            if (gmQuarters[r.Q - 1]) gmQuarters[r.Q - 1].actual = r.TotalActual;
        });

        const winLoss = {
            won: 0,
            lost: 0,
            followUp: 0,
            wonValue: 0,
            lostValue: 0,
            followUpValue: 0
        };
        winLossRes.recordset.forEach(r => {
            const s = r.Status.toLowerCase().replace('-', '');
            if (s === 'won') { winLoss.won = r.Count; winLoss.wonValue = r.TotalValue; }
            else if (s === 'lost') { winLoss.lost = r.Count; winLoss.lostValue = r.TotalValue; }
            else if (s === 'followup') { winLoss.followUp = r.Count; winLoss.followUpValue = r.TotalValue; }
        });
        const q0 = (quotedRes.recordset && quotedRes.recordset[0]) || {};
        winLoss.quoted = q0.Cnt || 0;
        winLoss.quotedValue = q0.TotalValue || 0;


        // 7. Item Wise Stats (Target vs Actual vs Breakdown)
        // Determine Grouping/Filtering based on Granularity
        let itemWiseGroupBy = 'mef.DepartmentName';
        let itemWiseSelect = 'mef.DepartmentName as ItemName';
        let itemWiseWhere = '';

        // If a specific role is selected, we want Granular View (Item Level)
        // If only Division is selected, we want Division Level (DepartmentName)
        if (safeRole && safeRole !== 'All') {
            itemWiseGroupBy = 'mef.ItemName';
            itemWiseSelect = 'mef.ItemName as ItemName';
        }

        // Strict filtering to remove unwanted cross-division items (e.g. Civil items appearing in BMS view)
        if (safeDivision && safeDivision !== 'All') {
            itemWiseWhere += ` AND mef.DepartmentName = @division `;
        }

        // 7. Item Wise Stats (Target vs Actual vs Breakdown) (Optimized to sum Item Values correctly)
        // If division is active, we are already summing item values via valueExpression logic conceptually, but for Item Wise we want Granular sums.
        // The original query was simply summing WonOrderValue multiple times which is bad. 
        // We will rewrite Item Wise to join EnquiryPricingValues directly.

        const itemWiseRes = await request.query(`
            SELECT 
                ${itemWiseSelect},
                SUM(CASE WHEN E.Status = 'Won' THEN ISNULL(EPV.Price, 0) ELSE 0 END) as WonValue,
                SUM(CASE WHEN E.Status = 'Lost' THEN ISNULL(EPV.Price, 0) ELSE 0 END) as LostValue,
                SUM(CASE WHEN E.Status IN ('Follow-up', 'FollowUp') THEN ISNULL(EPV.Price, 0) ELSE 0 END) as FollowUpValue
            FROM EnquiryMaster E
            JOIN EnquiryFor EF ON E.RequestNo = EF.RequestNo
            JOIN Master_EnquiryFor mef ON (EF.ItemName = mef.ItemName OR EF.ItemName LIKE '%- ' + mef.ItemName OR EF.ItemName LIKE '%-' + mef.ItemName)
            OUTER APPLY (
                 SELECT SUM(ISNULL(Price, 0)) as Price
                 FROM EnquiryPricingValues EPV
                 WHERE EPV.RequestNo = EF.RequestNo 
                   AND (EPV.EnquiryForID = EF.ID OR EPV.EnquiryForItem = EF.ItemName)
            ) EPV
            WHERE YEAR(COALESCE(E.ExpectedOrderDate, E.EnquiryDate)) = @year ${filterClause} ${itemWiseWhere}
            ${safeQuarter ? 'AND DATEPART(QUARTER, COALESCE(E.ExpectedOrderDate, E.EnquiryDate)) = @quarterNums' : ''}
            GROUP BY ${itemWiseGroupBy}
        `);

        // Get Targets by ItemName (instead of just Division) to support granular breakdown logic
        const requestTarget = new sql.Request();
        requestTarget.input('year', sql.Int, safeYear);
        if (safeQuarter) {
            requestTarget.input('quarterStr', sql.NVarChar, safeQuarter);
        }

        let targetQuery = '';

        if (safeRole && safeRole !== 'All') {
            requestTarget.input('se', sql.NVarChar, safeRole);
            targetQuery = `
                SELECT ItemName as Name, SUM(ISNULL(TargetValue, 0)) as Target
                FROM SalesTargets
                WHERE FinancialYear = @year AND SalesEngineer = @se
                ${safeQuarter ? 'AND Quarter = @quarterStr ' : ''}
                GROUP BY ItemName
            `;
        } else {
            if (safeDivision && safeDivision !== 'All') {
                requestTarget.input('division', sql.NVarChar, safeDivision);
            }
            targetQuery = `
                SELECT Division as Name, SUM(ISNULL(TargetValue, 0)) as Target
                FROM SalesTargets
                WHERE FinancialYear = @year
                ${safeDivision && safeDivision !== 'All' ? 'AND Division = @division ' : ''}
                ${safeQuarter ? 'AND Quarter = @quarterStr ' : ''}
                GROUP BY Division
            `;
        }

        const targetByDivRes = await requestTarget.query(targetQuery);

        // Merge Target into ItemWise stats
        const itemWiseMap = {};

        // Process Actuals
        itemWiseRes.recordset.forEach(r => {
            const name = r.ItemName || 'Unknown';
            if (!itemWiseMap[name]) itemWiseMap[name] = { name, won: 0, lost: 0, followUp: 0, target: 0 };
            itemWiseMap[name].won = r.WonValue;
            itemWiseMap[name].lost = r.LostValue;
            itemWiseMap[name].followUp = r.FollowUpValue;
        });

        // Process Targets
        targetByDivRes.recordset.forEach(r => {
            const name = r.Name || 'Unknown';
            if (!itemWiseMap[name]) itemWiseMap[name] = { name, won: 0, lost: 0, followUp: 0, target: 0 };
            itemWiseMap[name].target += r.Target;
        });

        const itemWiseStats = Object.values(itemWiseMap).filter(i => i.name !== 'Unknown');

        res.json({
            targetVsActual: quarters,
            grossMarginTargetVsActual: gmQuarters,
            winLoss: winLoss,
            topCustomers: topCustomersRes.recordset,
            topProjects: topProjectsRes.recordset,
            topClients: topClientsRes.recordset,
            probabilityFunnel: probabilityFunnelRes.recordset,
            itemWiseStats: itemWiseStats,
            topJobBooked: (topJobBookedRes.recordset || []).map((r) => ({
                ProjectName: r.ProjectName,
                JobValue: r.JobValue,
                WonGrossProfit: r.WonGrossProfit,
                CustomerName: r.CustomerName,
                ClientName: r.ClientName,
                ConsultantName: r.ConsultantName
            }))
        });

    } catch (err) {
        console.error('Error fetching Sales Report summary:', err);
        res.status(500).json({ error: 'Failed to fetch summary' });
    }
});

/** Top Jobs table only — same filters as /summary; optional topJobStatus (Won, Lost, …). No full dashboard payload. */
router.get('/top-job-booked', async (req, res) => {
    try {
        await applySalesReportEmailScope(req);
        const ctx = buildSalesReportItemValueContext(req);
        if (!ctx) return res.status(400).json({ error: 'Year is required' });

        const { request, filterClause, itemValueApply, itemValueCol, safeQuarter } = ctx;
        const probDateExpr =
            'COALESCE(P.BookedDate, P.ExpectedDate, P.UpdatedDateTime, E.EnquiryDate)';
        const topJobProbWhere = getTopJobProbStatusWhere(req.query.topJobStatus, req);
        const topJobValueExpr = getTopJobProbValueExpr(req.query.topJobStatus);

        let topJobBookedRes = { recordset: [] };
        try {
            topJobBookedRes = await request.query(`
            ${SQL_LATEST_PROB_CTE}
            SELECT TOP 10
                x.ProjectName,
                x.JobValue,
                x.WonGrossProfit,
                x.CustomerName,
                x.ClientName,
                x.ConsultantName
            FROM (
                SELECT
                    E.ProjectName,
                    ${topJobValueExpr} AS JobValue,
                    P.GrossMargin AS WonGrossProfit,
                    LTRIM(RTRIM(ISNULL(P.ToName, ISNULL(E.WonCustomerName, E.CustomerName)))) AS CustomerName,
                    E.ClientName,
                    E.ConsultantName
                FROM LatestProb P
                INNER JOIN EnquiryMaster E ON E.RequestNo = P.RequestNo
                WHERE ${topJobProbWhere}
                  AND YEAR(${probDateExpr}) = @year ${filterClause}
                  ${safeQuarter ? `AND DATEPART(QUARTER, ${probDateExpr}) = @quarterNums` : ''}
            ) x
            ORDER BY x.JobValue DESC
            `);
        } catch (e) {
            console.warn('[Sales Report] top-job-booked Probability fallback:', e.message);
            const topJobStatusWhereLegacy = getTopJobBookedStatusWhere(req.query.topJobStatus);
            topJobBookedRes = await request.query(`
            SELECT TOP 10
                x.ProjectName,
                x.JobValue,
                x.WonGrossProfit,
                x.CustomerName,
                x.ClientName,
                x.ConsultantName
            FROM (
                SELECT
                    E.ProjectName,
                    ${itemValueCol} AS JobValue,
                    E.WonGrossProfit AS WonGrossProfit,
                    LTRIM(RTRIM(ISNULL(E.WonCustomerName, E.CustomerName))) AS CustomerName,
                    E.ClientName,
                    E.ConsultantName
                FROM EnquiryMaster E
                ${itemValueApply}
                WHERE ${topJobStatusWhereLegacy}
                  AND YEAR(E.ExpectedOrderDate) = @year ${filterClause}
                  ${safeQuarter ? 'AND DATEPART(QUARTER, E.ExpectedOrderDate) = @quarterNums' : ''}
            ) x
            ORDER BY x.JobValue DESC
            `);
        }

        res.json({
            topJobBooked: (topJobBookedRes.recordset || []).map((r) => ({
                ProjectName: r.ProjectName,
                JobValue: r.JobValue,
                WonGrossProfit: r.WonGrossProfit,
                CustomerName: r.CustomerName,
                ClientName: r.ClientName,
                ConsultantName: r.ConsultantName
            }))
        });
    } catch (err) {
        console.error('Error fetching top job booked:', err);
        res.status(500).json({ error: 'Failed to fetch top jobs' });
    }
});


router.get('/item-wise-stats', async (req, res) => {
    try {
        await applySalesReportEmailScope(req);
        const { year, company, division, role, quarter } = req.query;
        if (!year) return res.status(400).json({ error: 'Year is required' });

        const request = new sql.Request();

        // Sanitize inputs
        const safeYear = parseInt(year);
        const safeCompany = company ? String(company).trim() : null;
        const safeDivision = division ? String(division).trim() : null;
        const safeRole = role ? String(role).trim() : null;
        const safeQuarter = (quarter && quarter !== 'All') ? String(quarter).trim() : null;
        let quarterNums = null;
        if (safeQuarter) quarterNums = parseInt(safeQuarter.replace('Q', ''));

        request.input('year', sql.Int, safeYear);
        if (safeQuarter) {
            request.input('quarterNums', sql.Int, quarterNums);
            request.input('quarterStrs', sql.NVarChar, safeQuarter);
        }

        const filterClause = appendSalesReportEnquiryFilters(req, request, safeCompany, safeDivision, safeRole);

        const effectiveSeForItemWise =
            (req.salesReportForceSeName && String(req.salesReportForceSeName).trim())
            || (safeRole && safeRole !== 'All' ? safeRole : null);

        // Determine Grouping
        let itemWiseGroupBy = 'mef.DepartmentName';
        let itemWiseSelect = 'mef.DepartmentName as ItemName';
        let itemWiseWhere = '';

        if (effectiveSeForItemWise) {
            itemWiseGroupBy = 'mef.ItemName';
            itemWiseSelect = 'mef.ItemName as ItemName';
        }

        if (safeDivision && safeDivision !== 'All') {
            itemWiseWhere += ` AND mef.DepartmentName = @division `;
        }

        const localSelectedCustomerApply = `
            OUTER APPLY (
                SELECT TOP 1 ToName
                FROM EnquiryQuotes
                WHERE RequestNo = E.RequestNo
                ORDER BY
                    CASE WHEN QuoteNumber = E.WonQuoteRef THEN 0 ELSE 1 END,
                    UpdatedAt DESC
            ) SC
        `;

        const itemWiseRes = await request.query(`
            SELECT
                ${itemWiseSelect},
                SUM(CASE WHEN E.Status = 'Won' THEN ISNULL(EPV.Price, 0) ELSE 0 END) as WonValue,
                SUM(CASE WHEN E.Status = 'Lost' THEN ISNULL(EPV.Price, 0) ELSE 0 END) as LostValue,
                SUM(CASE WHEN E.Status IN ('Follow-up', 'FollowUp') THEN ISNULL(EPV.Price, 0) ELSE 0 END) as FollowUpValue
            FROM EnquiryMaster E
            ${localSelectedCustomerApply}
            JOIN EnquiryFor EF ON E.RequestNo = EF.RequestNo
            JOIN Master_EnquiryFor mef ON (EF.ItemName = mef.ItemName OR EF.ItemName LIKE '%- ' + mef.ItemName OR EF.ItemName LIKE '%-' + mef.ItemName)
            OUTER APPLY (
                 SELECT SUM(ISNULL(Price, 0)) as Price
                 FROM EnquiryPricingValues EPV
                 WHERE EPV.RequestNo = EF.RequestNo 
                   AND (EPV.EnquiryForID = EF.ID OR EPV.EnquiryForItem = EF.ItemName)
                   AND (EPV.CustomerName = SC.ToName OR SC.ToName IS NULL)
            ) EPV
            WHERE YEAR(COALESCE(E.ExpectedOrderDate, E.EnquiryDate)) = @year ${filterClause} ${itemWiseWhere}
            ${safeQuarter ? 'AND DATEPART(QUARTER, COALESCE(E.ExpectedOrderDate, E.EnquiryDate)) = @quarterNums' : ''}
            GROUP BY ${itemWiseGroupBy}
        `);

        // Targets
        const requestTarget = new sql.Request();
        requestTarget.input('year', sql.Int, safeYear);
        if (safeQuarter) {
            requestTarget.input('quarterStr', sql.NVarChar, safeQuarter);
        }
        if (effectiveSeForItemWise) requestTarget.input('se', sql.NVarChar, effectiveSeForItemWise);

        let targetQuery = '';
        if (req.salesReportNonCcBlock === true) {
            targetQuery = `
                SELECT Division as Name, CAST(0 AS DECIMAL(18,2)) as Target
                FROM SalesTargets WHERE 1=0
            `;
        } else if (effectiveSeForItemWise) {
            targetQuery = `
                SELECT ItemName as Name, SUM(ISNULL(TargetValue, 0)) as Target
                FROM SalesTargets
                WHERE FinancialYear = @year AND SalesEngineer = @se
                ${safeQuarter ? 'AND Quarter = @quarterStr ' : ''}
                GROUP BY ItemName
            `;
        } else {
            if (safeDivision && safeDivision !== 'All') {
                requestTarget.input('division', sql.NVarChar, safeDivision);
            }
            targetQuery = `
                SELECT Division as Name, SUM(ISNULL(TargetValue, 0)) as Target
                FROM SalesTargets
                WHERE FinancialYear = @year
                ${safeDivision && safeDivision !== 'All' ? 'AND Division = @division ' : ''}
                ${safeQuarter ? 'AND Quarter = @quarterStr ' : ''}
                GROUP BY Division
            `;
        }

        const targetByDivRes = await requestTarget.query(targetQuery);

        // Merge
        const itemWiseMap = {};
        itemWiseRes.recordset.forEach(r => {
            const name = r.ItemName || 'Unknown';
            if (!itemWiseMap[name]) itemWiseMap[name] = { name, won: 0, lost: 0, followUp: 0, target: 0 };
            itemWiseMap[name].won = r.WonValue;
            itemWiseMap[name].lost = r.LostValue;
            itemWiseMap[name].followUp = r.FollowUpValue;
        });

        targetByDivRes.recordset.forEach(r => {
            const name = r.Name || 'Unknown';
            if (!itemWiseMap[name]) itemWiseMap[name] = { name, won: 0, lost: 0, followUp: 0, target: 0 };
            itemWiseMap[name].target += r.Target;
        });

        const itemWiseStats = Object.values(itemWiseMap).filter(i => i.name !== 'Unknown');
        res.json(itemWiseStats);

    } catch (err) {
        console.error('Error fetching item wise stats:', err);
        res.json([]);
    }
});


router.get('/funnel-details', async (req, res) => {
    try {
        await applySalesReportEmailScope(req);
        const { year, company, division, role, probabilityName, quarter } = req.query;
        if (!year || !probabilityName) return res.status(400).json({ error: 'Year and Probability Name are required' });

        const request = new sql.Request();
        request.input('year', sql.Int, year);
        request.input('probName', sql.NVarChar, probabilityName);

        const safeQuarter = (quarter && quarter !== 'All') ? String(quarter).trim() : null;
        let quarterNum = null;
        if (safeQuarter) {
            quarterNum = parseInt(safeQuarter.replace('Q', ''));
            request.input('quarterNum', sql.Int, quarterNum);
        }

        const safeCompanyFd = company ? String(company).trim() : null;
        const safeDivisionFd = division ? String(division).trim() : null;
        const safeRoleFd = role ? String(role).trim() : null;
        const filterClause = appendSalesReportEnquiryFilters(req, request, safeCompanyFd, safeDivisionFd, safeRoleFd);

        // Define required SQL snippets locally (these are not in scope from /summary)
        const localSelectedCustomerApply = `
            OUTER APPLY (
                SELECT TOP 1 ToName
                FROM EnquiryQuotes
                WHERE RequestNo = E.RequestNo
                ORDER BY
                    CASE WHEN QuoteNumber = E.WonQuoteRef THEN 0 ELSE 1 END,
                    UpdatedAt DESC
            ) SC
        `;
        let localItemValueSQL = '';
        if (division && division !== 'All') {
            localItemValueSQL = `
                OUTER APPLY (
                    SELECT SUM(ISNULL(EPV.Price, 0)) as Total
                    FROM EnquiryFor EF_Inner
                    JOIN Master_EnquiryFor MEF_Inner ON (EF_Inner.ItemName = MEF_Inner.ItemName OR EF_Inner.ItemName LIKE '%- ' + MEF_Inner.ItemName OR EF_Inner.ItemName LIKE '%-' + MEF_Inner.ItemName)
                    OUTER APPLY (
                        SELECT SUM(ISNULL(Price, 0)) as Price
                        FROM EnquiryPricingValues EPV
                        WHERE EPV.RequestNo = EF_Inner.RequestNo
                          AND (EPV.EnquiryForID = EF_Inner.ID OR EPV.EnquiryForItem = EF_Inner.ItemName)
                          AND (EPV.CustomerName = SC.ToName OR SC.ToName IS NULL)
                    ) EPV
                    WHERE EF_Inner.RequestNo = E.RequestNo
                      AND LTRIM(RTRIM(MEF_Inner.DepartmentName)) = @division
                ) ItemValue
            `;
        } else {
            localItemValueSQL = `
                OUTER APPLY (
                    SELECT SUM(ISNULL(Price, 0)) as Total
                    FROM EnquiryFor EF_Inner
                    OUTER APPLY (
                        SELECT SUM(ISNULL(Price, 0)) as Price
                        FROM EnquiryPricingValues EPV
                        WHERE EPV.RequestNo = EF_Inner.RequestNo
                          AND (EPV.EnquiryForID = EF_Inner.ID OR EPV.EnquiryForItem = EF_Inner.ItemName)
                          AND (EPV.CustomerName = SC.ToName OR SC.ToName IS NULL)
                    ) EPV
                    WHERE EF_Inner.RequestNo = E.RequestNo
                          AND (EF_Inner.ParentID IS NULL OR EF_Inner.ParentID = 0)
                ) ItemValue
            `;
        }
        const localItemValueApply = localSelectedCustomerApply + localItemValueSQL;
        const localItemValueCol = 'ISNULL(ItemValue.Total, 0)';

        // 1. Fetch Enquiries
        const enquiriesRes = await request.query(`
            SELECT
                E.RequestNo,
                E.ProjectName,
                E.CustomerName,
                ${localItemValueCol} as TotalPrice,
                Q.QuoteRef,
                Q.QuoteDate
            FROM EnquiryMaster E
            ${localItemValueApply}
            OUTER APPLY (
                SELECT TOP 1 QuoteNumber as QuoteRef, QuoteDate
                FROM EnquiryQuotes QM
                WHERE QM.RequestNo = E.RequestNo
                ORDER BY
                    CASE WHEN QM.QuoteNumber = E.WonQuoteRef THEN 0 ELSE 1 END ASC,
                    UpdatedAt DESC
            ) Q
            WHERE YEAR(COALESCE(E.ExpectedOrderDate, E.EnquiryDate)) = @year
              ${safeQuarter ? 'AND DATEPART(QUARTER, COALESCE(E.ExpectedOrderDate, E.EnquiryDate)) = @quarterNum' : ''}
              AND E.ProbabilityOption LIKE @probName + '%'
              AND E.Status NOT IN ('Won', 'Lost')
              ${filterClause}
            ORDER BY E.RequestNo DESC
        `);

        const enquiries = enquiriesRes.recordset;

        if (enquiries.length === 0) return res.json([]);

        // 2. Fetch Job/Item Hierarchy for these enquiries
        const requestNos = enquiries.map(e => `'${e.RequestNo}'`).join(',');

        const jobsRequest = new sql.Request();
        let jobWhere = `WHERE EF.RequestNo IN (${requestNos})`;

        if (division && division !== 'All') {
            jobsRequest.input('div', sql.NVarChar, division);
            jobWhere += ` 
                AND EXISTS (
                    SELECT 1 
                    FROM Master_EnquiryFor mef 
                    WHERE (EF.ItemName = mef.ItemName OR EF.ItemName LIKE '%- ' + mef.ItemName OR EF.ItemName LIKE '%-' + mef.ItemName)
                    AND mef.DepartmentName = @div
                )
            `;
        }

        const jobsRes = await jobsRequest.query(`
            SELECT 
                EF.RequestNo, EF.ID, EF.ParentID, EF.ItemName,
                ISNULL(EPV.Price, 0) as NetPrice
            FROM EnquiryFor EF
            CROSS APPLY (
                SELECT TOP 1 ToName 
                FROM EnquiryQuotes EQ
                JOIN EnquiryMaster E_Inner ON EQ.RequestNo = E_Inner.RequestNo
                WHERE EQ.RequestNo = EF.RequestNo
                ORDER BY 
                    CASE WHEN EQ.QuoteNumber = E_Inner.WonQuoteRef THEN 0 ELSE 1 END, 
                    EQ.UpdatedAt DESC
            ) SC
            OUTER APPLY (
                SELECT SUM(ISNULL(Price, 0)) as Price
                FROM EnquiryPricingValues EPV
                WHERE EPV.RequestNo = EF.RequestNo 
                  AND (EPV.EnquiryForID = EF.ID OR EPV.EnquiryForItem = EF.ItemName)
                  AND (EPV.CustomerName = SC.ToName OR SC.ToName IS NULL)
            ) EPV
            ${jobWhere}
        `);

        const allJobs = jobsRes.recordset;

        // 3. Structure Data
        const result = enquiries.map(e => {
            const myJobs = allJobs.filter(j => j.RequestNo == e.RequestNo);

            // Build simple tree structure
            const jobMap = {};
            const roots = [];

            // Pass 1: Node Map
            myJobs.forEach(j => {
                jobMap[j.ID] = { ...j, children: [] };
            });

            // Pass 2: Tree Assembly
            myJobs.forEach(j => {
                if (j.ParentID && jobMap[j.ParentID]) {
                    jobMap[j.ParentID].children.push(jobMap[j.ID]);
                } else {
                    roots.push(jobMap[j.ID]);
                }
            });

            // Calculate Total Price for Display based on Status
            let totalPrice = 0;
            const s = e.Status ? e.Status.toLowerCase() : '';
            if (s === 'won') totalPrice = e.WonValue;
            else if (s === 'lost') totalPrice = e.LostValue;
            else totalPrice = e.TotalPrice; // For funnel-details, query returns TotalPrice alias

            // Recalculate if Division filter is active
            if (division && division !== 'All') {
                // Sum up NetPrice of visible jobs to get Division Total
                totalPrice = myJobs.reduce((acc, curr) => acc + (curr.NetPrice || 0), 0);
            }

            return {
                ...e,
                TotalPrice: totalPrice,
                jobs: roots // Tree of jobs
            };
        });

        // Sort by TotalPrice (Larger to Smaller)
        result.sort((a, b) => b.TotalPrice - a.TotalPrice);

        res.json(result);

    } catch (err) {
        console.error('Error fetching funnel details:', err);
        res.status(500).json({ error: 'Failed to fetch details' });
    }
});


router.get('/drilldown-details', async (req, res) => {
    try {
        await applySalesReportEmailScope(req);
        const { year, company, division, role, metric, label, status, quarter } = req.query;
        if (!year || !metric) return res.status(400).json({ error: 'Year and Metric are required' });

        // Sanitize inputs
        const safeYear = year ? parseInt(year) : null;
        const safeCompany = company ? String(company).trim() : null;
        const safeDivision = division ? String(division).trim() : null;
        const safeRole = role ? String(role).trim() : null;
        const safeLabel = label ? String(label).trim() : null;

        const request = new sql.Request();
        request.input('year', sql.Int, safeYear);
        if (safeLabel) request.input('label', sql.NVarChar, safeLabel);
        if (status) request.input('status', sql.NVarChar, status);

        const safeQuarter = (quarter && quarter !== 'All') ? String(quarter).trim() : null;
        let quarterNum = null;
        if (safeQuarter) {
            quarterNum = parseInt(safeQuarter.replace('Q', ''));
            request.input('quarterNum', sql.Int, quarterNum);
        }

        const filterClause = appendSalesReportEnquiryFilters(req, request, safeCompany, safeDivision, safeRole);

        let baseQuery = `
            SELECT 
                E.RequestNo, 
                E.ProjectName, 
                E.CustomerName, 
                E.Status,
                ISNULL(TRY_CAST(REPLACE(REPLACE(E.CustomerPreferredPrice, 'BD', ''), ',', '') AS DECIMAL(18,2)), 0) as PreferredPrice,
                ISNULL(TRY_CAST(REPLACE(REPLACE(E.WonOrderValue, 'BD', ''), ',', '') AS DECIMAL(18,2)), 0) as WonValue,
                ISNULL(TRY_CAST(REPLACE(REPLACE(E.LostCompetitorPrice, 'BD', ''), ',', '') AS DECIMAL(18,2)), 0) as LostValue,
                Q.QuoteRef,
                Q.QuoteDate
            FROM EnquiryMaster E
            OUTER APPLY (
                SELECT TOP 1 QuoteNumber as QuoteRef, QuoteDate 
                FROM EnquiryQuotes QM 
                WHERE QM.RequestNo = E.RequestNo
                ORDER BY 
                    CASE WHEN QM.QuoteNumber = E.WonQuoteRef THEN 0 ELSE 1 END ASC,
                    UpdatedAt DESC
            ) Q
            WHERE 1=1 
        `;

        // Metric Logic
        if (metric === 'quarterly-actual') {
            // Label is 'Q1', 'Q2' etc. Filter by Quarter of ExpectedOrderDate and Status=Won
            baseQuery += ` 
                AND E.Status = 'Won' 
                AND YEAR(E.ExpectedOrderDate) = @year 
                AND 'Q' + CAST(DATEPART(QUARTER, E.ExpectedOrderDate) AS VARCHAR) = @label 
                ${filterClause}
            `;
        } else if (metric === 'win-loss') {
            // Label is 'Won', 'Lost', 'Follow Up'
            // Map label to Status
            // 'Won' -> Status 'Won', Year(ExpectedDate) = @year
            baseQuery += ` AND YEAR(COALESCE(E.ExpectedOrderDate, E.EnquiryDate)) = @year ${filterClause} ${safeQuarter ? 'AND DATEPART(QUARTER, COALESCE(E.ExpectedOrderDate, E.EnquiryDate)) = @quarterNum' : ''} `;
            if (label === 'Won') baseQuery += ` AND E.Status = 'Won' `;
            else if (label === 'Lost') baseQuery += ` AND E.Status = 'Lost' `;
            else if (label === 'Follow Up') baseQuery += ` AND E.Status IN ('Follow-up', 'FollowUp') `;
        } else if (metric === 'customer') {
            // Label is Customer Name
            baseQuery += ` 
                AND E.Status = 'Won' 
                AND YEAR(E.ExpectedOrderDate) = @year 
                AND E.WonCustomerName = @label
                ${safeQuarter ? 'AND DATEPART(QUARTER, E.ExpectedOrderDate) = @quarterNum' : ''}
                ${filterClause}
            `;
        } else if (metric === 'project') {
            baseQuery += ` 
                AND E.Status = 'Won' 
                AND YEAR(E.ExpectedOrderDate) = @year 
                AND E.ProjectName = @label
                ${safeQuarter ? 'AND DATEPART(QUARTER, E.ExpectedOrderDate) = @quarterNum' : ''}
                ${filterClause}
            `;
        } else if (metric === 'client') {
            baseQuery += ` 
               AND E.Status = 'Won' 
               AND YEAR(E.ExpectedOrderDate) = @year 
               AND E.ClientName = @label
               ${safeQuarter ? 'AND DATEPART(QUARTER, E.ExpectedOrderDate) = @quarterNum' : ''}
               ${filterClause}
           `;
        } else if (metric === 'item-stats') {
            // Label is ItemName. Status param determines drilldown (Won, Lost, FollowUp, Quoted)
            // Need to join Master_EnquiryFor logic again to filter by ItemName provided in label

            // Check if label is Division or Item based on Role
            let itemFilter = '';
            if (role && role !== 'All') itemFilter = `(mef.ItemName = @label)`;
            else itemFilter = `(mef.DepartmentName = @label)`;

            baseQuery += `
                AND YEAR(COALESCE(E.ExpectedOrderDate, E.EnquiryDate)) = @year ${filterClause}
                ${safeQuarter ? 'AND DATEPART(QUARTER, COALESCE(E.ExpectedOrderDate, E.EnquiryDate)) = @quarterNum' : ''}
                AND EXISTS (
                    SELECT 1 FROM EnquiryFor EF
                    JOIN Master_EnquiryFor mef ON (EF.ItemName = mef.ItemName OR EF.ItemName LIKE '%- ' + mef.ItemName OR EF.ItemName LIKE '%-' + mef.ItemName)
                    WHERE EF.RequestNo = E.RequestNo 
                    AND ${itemFilter}
                )
             `;

            if (status === 'Won') baseQuery += ` AND E.Status = 'Won' `;
            else if (status === 'Lost') baseQuery += ` AND E.Status = 'Lost' `;
            else if (status === 'Follow Up') baseQuery += ` AND E.Status IN ('Follow-up', 'FollowUp') `;
            else if (status === 'Quoted') baseQuery += ` AND E.Status IN ('Won', 'Lost', 'Follow-up', 'FollowUp') `; // Approximate for Quoted
        }

        baseQuery += ` ORDER BY E.RequestNo DESC`;

        const enquiriesRes = await request.query(baseQuery);
        const enquiries = enquiriesRes.recordset;

        if (enquiries.length === 0) return res.json([]);

        // Fetch Job Hierarchy (Copying Logic from funnel-details)
        const requestNos = enquiries.map(e => `'${e.RequestNo}'`).join(',');

        // Use a chunked query if too many request nos, but for top 10/quarterly it fits.
        // Use a chunked query if too many request nos, but for top 10/quarterly it fits.
        const jobsRequest = new sql.Request();
        let jobWhere = `WHERE EF.RequestNo IN (${requestNos})`;

        if (division && division !== 'All') {
            jobsRequest.input('div', sql.NVarChar, division);
            jobWhere += ` 
                AND EXISTS (
                    SELECT 1 
                    FROM Master_EnquiryFor mef 
                    WHERE (EF.ItemName = mef.ItemName OR EF.ItemName LIKE '%- ' + mef.ItemName OR EF.ItemName LIKE '%-' + mef.ItemName)
                    AND mef.DepartmentName = @div
                )
            `;
        }

        const jobsRes = await jobsRequest.query(`
            SELECT 
                EF.RequestNo, EF.ID, EF.ParentID, EF.ItemName,
                ISNULL(EPV.Price, 0) as NetPrice
            FROM EnquiryFor EF
            CROSS APPLY (
                SELECT TOP 1 ToName 
                FROM EnquiryQuotes EQ
                JOIN EnquiryMaster E_Inner ON EQ.RequestNo = E_Inner.RequestNo
                WHERE EQ.RequestNo = EF.RequestNo
                ORDER BY 
                    CASE WHEN EQ.QuoteNumber = E_Inner.WonQuoteRef THEN 0 ELSE 1 END, 
                    EQ.UpdatedAt DESC
            ) SC
            OUTER APPLY (
                SELECT SUM(ISNULL(Price, 0)) as Price
                FROM EnquiryPricingValues EPV
                WHERE EPV.RequestNo = EF.RequestNo 
                  AND (EPV.EnquiryForID = EF.ID OR EPV.EnquiryForItem = EF.ItemName)
                  AND (EPV.CustomerName = SC.ToName OR SC.ToName IS NULL)
            ) EPV
            ${jobWhere}
        `);

        const allJobs = jobsRes.recordset;
        const result = enquiries.map(e => {
            const myJobs = allJobs.filter(j => j.RequestNo == e.RequestNo);
            const jobMap = {};
            const roots = [];
            myJobs.forEach(j => { jobMap[j.ID] = { ...j, children: [] }; });
            myJobs.forEach(j => {
                if (j.ParentID && jobMap[j.ParentID]) jobMap[j.ParentID].children.push(jobMap[j.ID]);
                else roots.push(jobMap[j.ID]);
            });

            // Calculate Total Price for Display based on Status
            // FORCE RECALCULATION: Always derive total from the sum of item components 
            // to avoid mismatch with stale 'WonOrderValue' from EnquiryMaster.
            const s = e.Status ? e.Status.trim().toLowerCase() : '';

            // Sum up NetPrice of visible jobs to get Total
            // Logic: Sum only ROOTs of the filtered list to avoid double counting hierarchy.
            const visibleIds = new Set(myJobs.map(j => j.ID));
            const calculatedTotal = myJobs.reduce((acc, curr) => {
                // If this item has a parent that is also in the list, skip it (it's a child)
                if (curr.ParentID && visibleIds.has(curr.ParentID)) {
                    return acc;
                }
                return acc + (curr.NetPrice || 0);
            }, 0);

            // Use calculated total if available and > 0, otherwise fallback (rare case)
            // But strict adherence to breakdown is preferred.
            let totalPrice = calculatedTotal;

            return {
                ...e,
                TotalPrice: totalPrice,
                jobs: roots
            };
        });

        // 3. Sort by Total Price (Larger to Smaller)
        result.sort((a, b) => b.TotalPrice - a.TotalPrice);

        res.json(result);

    } catch (err) {
        console.error('Error in drilldown-details:', err);
        res.status(500).json({ error: 'Failed to fetch drilldown details' });
    }
});

module.exports = router;



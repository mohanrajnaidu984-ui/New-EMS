const express = require('express');
const router = express.Router();
const { sql } = require('../dbConfig');
const runQuotedQuoteListQuery = require('../lib/quotedQuoteListQuery');
const mapQuoteListingRows = require('../lib/mapQuoteListingRows');

// Helper to construct filter clauses (kept for reference or future use if needed, though active logic is inline below)
// --- Helper: Apply Access Control Logic ---
const applyAccessControl = (request, params) => {
    const { userRole, userName, userEmail, accessMode } = params;

    // Logic: 
    // Tiered visibility policy (per user request):
    // - Admin/System: all
    // - Default: assigned enquiries only (ConcernedSE match)
    // - If email is in Master_EnquiryFor.CCMailIds: department enquiries (CC mail match) + assigned
    //
    // NOTE: CommonMailIds does NOT expand visibility (still assigned-only).

    // Identify if Admin or System role
    const userRoles = typeof userRole === 'string'
        ? userRole.split(',').map(r => r.trim().toLowerCase())
        : (Array.isArray(userRole) ? userRole.map(r => String(r).trim().toLowerCase()) : []);

    const isAdmin = userRoles.includes('admin') || userRoles.includes('system') || (userEmail && userEmail.toLowerCase() === 'ranigovardhan@gmail.com');

    if (isAdmin) return '';

    const mode = (accessMode || 'assigned').toString().toLowerCase();

    request.input('currentUserName', sql.NVarChar, userName || '');
    request.input('currentUserEmail', sql.NVarChar, userEmail || '');

    // Assigned enquiries only (ConcernedSE). If userName is missing, this will yield no rows (strict policy).
    const assignedFilter = `EXISTS (SELECT 1 FROM ConcernedSE cse WHERE cse.RequestNo = em.RequestNo AND cse.SEName = @currentUserName)`;

    if (mode === 'department') {
        // Department enquiries = any enquiry whose divisions map to a master row where CCMailIds contains the user email.
        // (CommonMailIds does NOT grant access per the requested policy.)
        const ccFilter = `
            EXISTS (
                SELECT 1
                FROM EnquiryFor ef
                JOIN Master_EnquiryFor mef ON ef.ItemName = mef.ItemName
                WHERE ef.RequestNo = em.RequestNo
                  AND ',' + REPLACE(REPLACE(ISNULL(mef.CCMailIds, ''), ' ', ''), ';', ',') + ',' LIKE '%,' + @currentUserEmail + ',%'
            )
        `;
        return ` AND ( ${assignedFilter} OR ${ccFilter} ) `;
    }

    return ` AND ( ${assignedFilter} ) `;
};

async function resolveDashboardAccessMode(userEmail) {
    const email = (userEmail || '').toString().trim().toLowerCase().replace(/@almcg\.com/g, '@almoayyedcg.com');
    if (!email) return { accessMode: 'assigned', fullName: '' };

    // Resolve FullName (for ConcernedSE match) and detect CC mail membership
    const [userRes, ccRes] = await Promise.all([
        sql.query`
            SELECT TOP 1 FullName
            FROM Master_ConcernedSE
            WHERE LOWER(LTRIM(RTRIM(ISNULL(EmailId, '')))) = ${email}
        `,
        sql.query`
            SELECT TOP 1 1 AS ok
            FROM Master_EnquiryFor
            WHERE ',' + REPLACE(REPLACE(ISNULL(CCMailIds, ''), ' ', ''), ';', ',') + ',' LIKE ${`%,${email},%`}
        `
    ]);

    const fullName = (userRes.recordset?.[0]?.FullName || '').toString().trim();
    const isCcUser = (ccRes.recordset?.length || 0) > 0;
    return { accessMode: isCcUser ? 'department' : 'assigned', fullName };
}

/**
 * SQL fragment for EnquiryQuotes `eq` in FilteredQuotes / NOT EXISTS "has quote" checks.
 * - **Assigned (non–CC):** quote must be prepared by the logged-in user; if an SE is selected, also match that SE.
 * - **Department (CC):** do not require the CC user's name on the quote; filter by selected SE when not "All",
 *   otherwise include any quote that passes the division-code-on-QuoteNumber clause (added separately).
 */
function buildDashboardQuoteScopeFilter(isDeptMode, salesEngineer) {
    const se = salesEngineer && String(salesEngineer).trim() !== '' && String(salesEngineer).trim().toLowerCase() !== 'all';
    const seFrag = `
                AND (
                    UPPER(LTRIM(RTRIM(ISNULL(eq.PreparedBy, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@salesEngineer, ''))))
                    OR EXISTS (
                        SELECT 1
                        FROM Master_ConcernedSE mcs
                        WHERE UPPER(LTRIM(RTRIM(ISNULL(mcs.FullName, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@salesEngineer, ''))))
                          AND LOWER(LTRIM(RTRIM(ISNULL(eq.PreparedByEmail, '')))) = LOWER(LTRIM(RTRIM(ISNULL(mcs.EmailId, ''))))
                    )
                )`;

    if (isDeptMode) {
        return se ? seFrag : '';
    }

    let q = `
            AND (
                NULLIF(LTRIM(RTRIM(ISNULL(@currentUserEmail, ''))), '') IS NULL
                OR LOWER(LTRIM(RTRIM(ISNULL(eq.PreparedByEmail, '')))) = LOWER(LTRIM(RTRIM(ISNULL(@currentUserEmail, ''))))
                OR UPPER(LTRIM(RTRIM(ISNULL(eq.PreparedBy, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@currentUserName, ''))))
            )`;
    if (se) q += seFrag;
    return q;
}

/**
 * Builds WHERE clause and sql.Request inputs shared by GET /enquiries and GET /quote-summary-rows.
 * @param {import('express').Request} req
 * @param {{ restrictSingleDayToQuoteActivity?: boolean }} [options] When true and `date` is set, only enquiries with a scoped quote on that day (matches calendar quote chip), not enquiry/due/site rows.
 */
async function buildDashboardEnquiryListWhere(req, options = {}) {
    const { restrictSingleDayToQuoteActivity = false } = options;
    const { division, salesEngineer, date, fromDate, toDate, status, dateType, search, userEmail, userName, userRole } = req.query;
    const request = new sql.Request();

    let whereClause = ' WHERE 1=1 ';

    const resolved = await resolveDashboardAccessMode(userEmail);
    const effectiveUserName = (resolved.fullName || userName || '').toString().trim();
    const isDeptMode = resolved.accessMode === 'department';
    const accessSql = applyAccessControl(request, {
        userRole,
        userName: effectiveUserName,
        userEmail,
        accessMode: resolved.accessMode,
    });
    whereClause += accessSql;

    const isSearchActive = search && search.trim().length > 0;

    let divisionSql = '';
    let seSql = '';
    if (division && division !== 'All' && !isSearchActive) {
        if (isDeptMode) {
            divisionSql = ` AND EXISTS (
                    SELECT 1
                    FROM EnquiryFor ef
                    JOIN Master_EnquiryFor mef ON (ef.ItemName = mef.ItemName OR ef.ItemName LIKE '% - ' + mef.ItemName OR ef.ItemName LIKE '% - ' + mef.ItemName)
                    WHERE ef.RequestNo = em.RequestNo
                      AND mef.DepartmentName = @division
                ) `;
        } else {
            divisionSql = ` AND EXISTS (SELECT 1 FROM EnquiryFor ef WHERE ef.RequestNo = em.RequestNo AND ef.ItemName = @division) `;
        }
        whereClause += divisionSql;
        request.input('division', sql.NVarChar, division);
    }
    if (salesEngineer && salesEngineer !== 'All' && !isSearchActive) {
        seSql = ` AND EXISTS (SELECT 1 FROM ConcernedSE cse WHERE cse.RequestNo = em.RequestNo AND cse.SEName = @salesEngineer) `;
        whereClause += seSql;
        request.input('salesEngineer', sql.NVarChar, salesEngineer);
    }

    /** Same enquiry visibility as GET /calendar quoted totals (division + SE + access on `em`). Omit when search bypasses those filters. */
    const calendarEmBaseFilterSql = isSearchActive ? null : `${divisionSql}${seSql}${accessSql}`;

    const seForQuoteScope = isSearchActive ? 'All' : salesEngineer;
    let quoteScopeFilter = buildDashboardQuoteScopeFilter(isDeptMode, seForQuoteScope);
    if (division && division !== 'All' && !isSearchActive) {
        quoteScopeFilter += `
                AND EXISTS (
                    SELECT 1
                    FROM Master_EnquiryFor mefQ
                    WHERE (
                        UPPER(LTRIM(RTRIM(ISNULL(mefQ.DepartmentName, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@division, ''))))
                        OR UPPER(LTRIM(RTRIM(ISNULL(mefQ.ItemName, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@division, ''))))
                    )
                      AND LTRIM(RTRIM(ISNULL(mefQ.DivisionCode, ''))) <> ''
                      AND (
                        CHARINDEX('/' + UPPER(LTRIM(RTRIM(ISNULL(mefQ.DivisionCode, '')))) + '/', UPPER(ISNULL(eq.QuoteNumber, ''))) > 0
                        OR CHARINDEX('-' + UPPER(LTRIM(RTRIM(ISNULL(mefQ.DivisionCode, '')))) + '/', UPPER(ISNULL(eq.QuoteNumber, ''))) > 0
                        OR CHARINDEX('/' + UPPER(LTRIM(RTRIM(ISNULL(mefQ.DivisionCode, '')))) + '-', UPPER(ISNULL(eq.QuoteNumber, ''))) > 0
                      )
                )
            `;
    }
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    request.input('today', sql.VarChar(10), todayStr);

    if (status === 'Lapsed' && !isSearchActive) {
        whereClause += ` AND CONVERT(VARCHAR(10), em.DueDate, 23) < CONVERT(VARCHAR(10), @today, 23) AND (em.Status IS NULL OR em.Status NOT IN ('Quote', 'Won', 'Lost', 'Quoted', 'Submitted')) `;
    } else if (status && status !== 'All' && !isSearchActive) {
        whereClause += ` AND em.Status = @status `;
        request.input('status', sql.NVarChar, status);
    }

    if (fromDate && toDate) {
        const type = dateType || 'Enquiry Date';

        if (type === 'Due Date') {
            whereClause += ` AND CONVERT(VARCHAR(10), em.DueDate, 23) BETWEEN CONVERT(VARCHAR(10), @fromDate, 23) AND CONVERT(VARCHAR(10), @toDate, 23) `;
            whereClause += ` AND NOT EXISTS (SELECT 1 FROM EnquiryQuotes eq WHERE eq.RequestNo = em.RequestNo ${quoteScopeFilter}) `;
        } else if (type === 'Quote Date') {
            whereClause += ` AND EXISTS (SELECT 1 FROM EnquiryQuotes eq WHERE eq.RequestNo = em.RequestNo AND eq.QuoteDate IS NOT NULL AND CONVERT(VARCHAR(10), eq.QuoteDate, 23) BETWEEN CONVERT(VARCHAR(10), @fromDate, 23) AND CONVERT(VARCHAR(10), @toDate, 23) ${quoteScopeFilter}) `;
        } else {
            whereClause += ` AND CONVERT(VARCHAR(10), em.EnquiryDate, 23) BETWEEN CONVERT(VARCHAR(10), @fromDate, 23) AND CONVERT(VARCHAR(10), @toDate, 23) `;
        }

        request.input('fromDate', sql.VarChar(10), fromDate);
        request.input('toDate', sql.VarChar(10), toDate);
    } else if (date) {
        if (restrictSingleDayToQuoteActivity) {
            whereClause += ` AND EXISTS (SELECT 1 FROM EnquiryQuotes eq WHERE eq.RequestNo = em.RequestNo AND eq.QuoteDate IS NOT NULL AND CONVERT(VARCHAR(10), eq.QuoteDate, 23) = CONVERT(VARCHAR(10), @date, 23) ${quoteScopeFilter}) `;
        } else {
            whereClause += ` AND (
                CONVERT(VARCHAR(10), em.EnquiryDate, 23) = CONVERT(VARCHAR(10), @date, 23) OR
                CONVERT(VARCHAR(10), em.DueDate, 23) = CONVERT(VARCHAR(10), @date, 23) OR
                CONVERT(VARCHAR(10), em.SiteVisitDate, 23) = CONVERT(VARCHAR(10), @date, 23) OR
                EXISTS (SELECT 1 FROM EnquiryQuotes eq WHERE eq.RequestNo = em.RequestNo AND eq.QuoteDate IS NOT NULL AND CONVERT(VARCHAR(10), eq.QuoteDate, 23) = CONVERT(VARCHAR(10), @date, 23) ${quoteScopeFilter})
            ) `;
        }
        request.input('date', sql.VarChar(10), date);
    }

    if (!fromDate && !toDate && !date && !isSearchActive) {
        const currentMode = req.query.mode || 'future';

        if (currentMode === 'today') {
            whereClause += ` AND (
                    CONVERT(VARCHAR(10), em.DueDate, 23) = CONVERT(VARCHAR(10), @today, 23) OR
                    CONVERT(VARCHAR(10), em.SiteVisitDate, 23) = CONVERT(VARCHAR(10), @today, 23)
                ) `;
            whereClause += ` AND NOT EXISTS (SELECT 1 FROM EnquiryQuotes eq WHERE eq.RequestNo = em.RequestNo ${quoteScopeFilter}) `;
        } else if (currentMode === 'future') {
            whereClause += ` AND CONVERT(VARCHAR(10), em.DueDate, 23) >= CONVERT(VARCHAR(10), @today, 23) `;
            whereClause += ` AND NOT EXISTS (SELECT 1 FROM EnquiryQuotes eq WHERE eq.RequestNo = em.RequestNo ${quoteScopeFilter}) `;
        }
    }

    if (isSearchActive) {
        whereClause += ` AND (
                em.ProjectName LIKE @search OR
                em.CustomerName LIKE @search OR
                em.RequestNo LIKE @search OR
                em.ClientName LIKE @search OR
                em.ConsultantName LIKE @search OR
                em.EnquiryDetails LIKE @search OR
                EXISTS (SELECT 1 FROM EnquiryFor ef WHERE ef.RequestNo = em.RequestNo AND ef.ItemName LIKE @search) OR
                EXISTS (SELECT 1 FROM ConcernedSE cse WHERE cse.RequestNo = em.RequestNo AND cse.SEName LIKE @search)
            ) `;
        request.input('search', sql.NVarChar, `%${search}%`);
    }

    let scopedQuoteCountDateClause = '';
    if (!isSearchActive) {
        if (fromDate && toDate) {
            const dtLabel = (dateType || 'Enquiry Date').toString();
            if (dtLabel === 'Quote Date' || dtLabel === 'Quote date') {
                scopedQuoteCountDateClause = ` AND eq.QuoteDate IS NOT NULL AND CONVERT(VARCHAR(10), eq.QuoteDate, 23) BETWEEN CONVERT(VARCHAR(10), @fromDate, 23) AND CONVERT(VARCHAR(10), @toDate, 23) `;
            }
        } else if (date) {
            scopedQuoteCountDateClause = ` AND eq.QuoteDate IS NOT NULL AND CONVERT(VARCHAR(10), eq.QuoteDate, 23) = CONVERT(VARCHAR(10), @date, 23) `;
        }
    }

    const divisionTrim = division && division !== 'All' ? String(division).trim() : '';
    const userEmailForAccess = (userEmail || '').toString().trim();

    return {
        request,
        whereClause,
        isSearchActive,
        quoteScopeFilter,
        scopedQuoteCountDateClause,
        divisionTrim,
        userEmailForAccess,
        calendarEmBaseFilterSql,
    };
}

// 1. Calendar Aggregation
router.get('/calendar', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
        const { month, year, division, salesEngineer, userEmail, userName, userRole } = req.query;

        if (!month || !year) return res.status(400).json({ error: 'Month and Year required' });

        const resolved = await resolveDashboardAccessMode(userEmail);
        const effectiveUserName = (resolved.fullName || userName || '').toString().trim();
        const isDeptMode = resolved.accessMode === 'department';

        const request = new sql.Request();
        request.input('month', sql.Int, parseInt(month));
        request.input('year', sql.Int, parseInt(year));

        let baseFilter = '';
        if (division && division !== 'All') {
            // Department mode uses Master_EnquiryFor.DepartmentName (EnquiryFor doesn't have DepartmentName column)
            if (isDeptMode) {
                baseFilter += ` AND EXISTS (
                    SELECT 1
                    FROM EnquiryFor ef
                    JOIN Master_EnquiryFor mef ON (ef.ItemName = mef.ItemName OR ef.ItemName LIKE '% - ' + mef.ItemName OR ef.ItemName LIKE '% - ' + mef.ItemName)
                    WHERE ef.RequestNo = em.RequestNo
                      AND mef.DepartmentName = @division
                ) `;
            } else {
                baseFilter += ` AND EXISTS (SELECT 1 FROM EnquiryFor ef WHERE ef.RequestNo = em.RequestNo AND ef.ItemName = @division) `;
            }
            request.input('division', sql.NVarChar, division);
        }
        if (salesEngineer && salesEngineer !== 'All') {
            baseFilter += ` AND EXISTS (SELECT 1 FROM ConcernedSE cse WHERE cse.RequestNo = em.RequestNo AND cse.SEName = @salesEngineer) `;
            request.input('salesEngineer', sql.NVarChar, salesEngineer);
        }

        // Apply Access Control
        const accessFilter = applyAccessControl(request, { userRole, userName: effectiveUserName, userEmail, accessMode: resolved.accessMode });
        baseFilter += accessFilter;
        let quoteScopeFilter = buildDashboardQuoteScopeFilter(isDeptMode, salesEngineer);
        if (division && division !== 'All') {
            quoteScopeFilter += `
                AND EXISTS (
                    SELECT 1
                    FROM Master_EnquiryFor mefQ
                    WHERE (
                        UPPER(LTRIM(RTRIM(ISNULL(mefQ.DepartmentName, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@division, ''))))
                        OR UPPER(LTRIM(RTRIM(ISNULL(mefQ.ItemName, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@division, ''))))
                    )
                      AND LTRIM(RTRIM(ISNULL(mefQ.DivisionCode, ''))) <> ''
                      AND (
                        CHARINDEX('/' + UPPER(LTRIM(RTRIM(ISNULL(mefQ.DivisionCode, '')))) + '/', UPPER(ISNULL(eq.QuoteNumber, ''))) > 0
                        OR CHARINDEX('-' + UPPER(LTRIM(RTRIM(ISNULL(mefQ.DivisionCode, '')))) + '/', UPPER(ISNULL(eq.QuoteNumber, ''))) > 0
                        OR CHARINDEX('/' + UPPER(LTRIM(RTRIM(ISNULL(mefQ.DivisionCode, '')))) + '-', UPPER(ISNULL(eq.QuoteNumber, ''))) > 0
                      )
                )
            `;
        }
        console.log('Calendar Access Filter:', accessFilter);
        console.log('Calendar Params:', { month, year, division, salesEngineer, userEmail, userName, userRole });
        console.log('Calendar baseFilter:', baseFilter);

        // Input for Quote Filtering (Unique name to avoid conflict)


        // We need counts for EnquiryDate, DueDate, SiteVisitDate per day in the month
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];
        request.input('today', sql.VarChar(10), todayStr);

        const query = `
            WITH FilteredEnquiries AS (
                SELECT RequestNo, EnquiryDate, DueDate, SiteVisitDate, Status 
                FROM EnquiryMaster em
                WHERE 1=1 ${baseFilter}
            ),
            FilteredQuotes AS (
                SELECT eq.CreatedAt, eq.UpdatedAt, eq.QuoteDate, eq.RequestNo
                FROM EnquiryQuotes eq
                JOIN EnquiryMaster em ON eq.RequestNo = em.RequestNo
                WHERE 1=1 ${baseFilter} ${quoteScopeFilter}
            ),
            Dates AS (
                SELECT EnquiryDate as DateVal, 'Enquiry' as Type FROM FilteredEnquiries WHERE MONTH(EnquiryDate) = @month AND YEAR(EnquiryDate) = @year
                UNION ALL
                SELECT fe.DueDate as DateVal, 'Due' as Type
                FROM FilteredEnquiries fe
                WHERE MONTH(fe.DueDate) = @month AND YEAR(fe.DueDate) = @year
                  AND CAST(fe.DueDate AS DATE) <= CAST(@today AS DATE)
                  AND NOT EXISTS (SELECT 1 FROM FilteredQuotes fq WHERE fq.RequestNo = fe.RequestNo)
                UNION ALL
                SELECT fe.DueDate as DateVal, 'Lapsed' as Type 
                FROM FilteredEnquiries fe
                WHERE MONTH(fe.DueDate) = @month AND YEAR(fe.DueDate) = @year
                AND CAST(fe.DueDate AS DATE) < CAST(@today AS DATE)
                AND (Status IS NULL OR Status NOT IN ('Quote', 'Won', 'Lost', 'Quoted', 'Submitted'))
                AND NOT EXISTS (SELECT 1 FROM FilteredQuotes fq WHERE fq.RequestNo = fe.RequestNo)
                UNION ALL
                SELECT SiteVisitDate as DateVal, 'SiteVisit' as Type FROM FilteredEnquiries WHERE MONTH(SiteVisitDate) = @month AND YEAR(SiteVisitDate) = @year
                UNION ALL
                -- Quote chips: one count per scoped quote row on its EnquiryQuotes.QuoteDate only
                SELECT CAST(eq.QuoteDate AS DATE) AS DateVal, 'Quote' AS Type
                FROM EnquiryQuotes eq
                JOIN EnquiryMaster em ON eq.RequestNo = em.RequestNo
                WHERE 1=1 ${baseFilter} ${quoteScopeFilter}
                  AND eq.QuoteDate IS NOT NULL
                  AND MONTH(eq.QuoteDate) = @month AND YEAR(eq.QuoteDate) = @year
            )
            SELECT 
                CONVERT(VARCHAR(10), DateVal, 23) as Date,
                SUM(CASE WHEN Type = 'Enquiry' THEN 1 ELSE 0 END) as Enquiries,
                SUM(CASE WHEN Type = 'Due' THEN 1 ELSE 0 END) as Due,
                SUM(CASE WHEN Type = 'Lapsed' THEN 1 ELSE 0 END) as Lapsed,
                SUM(CASE WHEN Type = 'SiteVisit' THEN 1 ELSE 0 END) as SiteVisits,
                SUM(CASE WHEN Type = 'Quote' THEN 1 ELSE 0 END) as Quoted
            FROM Dates
            WHERE DateVal IS NOT NULL
            GROUP BY CONVERT(VARCHAR(10), DateVal, 23)
        `;

        const result = await request.query(query);

        // --- Added: Calculate Unique Monthly Totals to match the list counts ---
        const totalsQuery = `
            WITH FilteredEnquiries AS (
                SELECT RequestNo, EnquiryDate, DueDate, SiteVisitDate, Status 
                FROM EnquiryMaster em
                WHERE 1=1 ${baseFilter}
            ),
            FilteredQuotes AS (
                SELECT eq.CreatedAt, eq.UpdatedAt, eq.QuoteDate, eq.RequestNo
                FROM EnquiryQuotes eq
                JOIN EnquiryMaster em ON eq.RequestNo = em.RequestNo
                WHERE 1=1 ${baseFilter} ${quoteScopeFilter}
            )
            SELECT 
                (SELECT COUNT(DISTINCT RequestNo) FROM FilteredEnquiries WHERE MONTH(EnquiryDate) = @month AND YEAR(EnquiryDate) = @year) as enquiries,
                (SELECT COUNT(DISTINCT fe.RequestNo)
                 FROM FilteredEnquiries fe
                 WHERE MONTH(fe.DueDate) = @month AND YEAR(fe.DueDate) = @year
                   AND CAST(fe.DueDate AS DATE) <= CAST(@today AS DATE)
                   AND NOT EXISTS (SELECT 1 FROM FilteredQuotes fq WHERE fq.RequestNo = fe.RequestNo)) as due,
                (SELECT COUNT(DISTINCT fe.RequestNo)
                 FROM FilteredEnquiries fe
                 WHERE MONTH(fe.DueDate) = @month AND YEAR(fe.DueDate) = @year
                   AND CAST(fe.DueDate AS DATE) < CAST(@today AS DATE)
                   AND (fe.Status IS NULL OR fe.Status NOT IN ('Quote', 'Won', 'Lost', 'Quoted', 'Submitted'))
                   AND NOT EXISTS (SELECT 1 FROM FilteredQuotes fq WHERE fq.RequestNo = fe.RequestNo)) as lapsed,
                (SELECT COUNT(*)
                 FROM EnquiryQuotes eq
                 JOIN EnquiryMaster em ON eq.RequestNo = em.RequestNo
                 WHERE 1=1 ${baseFilter} ${quoteScopeFilter}
                   AND eq.QuoteDate IS NOT NULL
                   AND MONTH(eq.QuoteDate) = @month AND YEAR(eq.QuoteDate) = @year) as quoted
        `;
        const totalsResult = await request.query(totalsQuery);

        res.json({
            daily: result.recordset,
            totals: totalsResult.recordset[0]
        });

    } catch (err) {
        console.error('Calendar API Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// 2. KPISummary
router.get('/summary', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
        const { division, salesEngineer, userEmail, userName, userRole } = req.query;
        const request = new sql.Request();

        let baseFilter = '';
        const resolved = await resolveDashboardAccessMode(userEmail);
        const effectiveUserName = (resolved.fullName || userName || '').toString().trim();
        const isDeptMode = resolved.accessMode === 'department';

        if (division && division !== 'All') {
            if (isDeptMode) {
                baseFilter += ` AND EXISTS (
                    SELECT 1
                    FROM EnquiryFor ef
                    JOIN Master_EnquiryFor mef ON (ef.ItemName = mef.ItemName OR ef.ItemName LIKE '% - ' + mef.ItemName OR ef.ItemName LIKE '% - ' + mef.ItemName)
                    WHERE ef.RequestNo = em.RequestNo
                      AND mef.DepartmentName = @division
                ) `;
            } else {
                baseFilter += ` AND EXISTS (SELECT 1 FROM EnquiryFor ef WHERE ef.RequestNo = em.RequestNo AND ef.ItemName = @division) `;
            }
            request.input('division', sql.NVarChar, division);
        }
        if (salesEngineer && salesEngineer !== 'All') {
            baseFilter += ` AND EXISTS (SELECT 1 FROM ConcernedSE cse WHERE cse.RequestNo = em.RequestNo AND cse.SEName = @salesEngineer) `;
            request.input('salesEngineer', sql.NVarChar, salesEngineer);
        }

        // Apply Access Control
        baseFilter += applyAccessControl(request, { userRole, userName: effectiveUserName, userEmail, accessMode: resolved.accessMode });
        let quoteScopeFilter = buildDashboardQuoteScopeFilter(isDeptMode, salesEngineer);
        if (division && division !== 'All') {
            quoteScopeFilter += `
                AND EXISTS (
                    SELECT 1
                    FROM Master_EnquiryFor mefQ
                    WHERE (
                        UPPER(LTRIM(RTRIM(ISNULL(mefQ.DepartmentName, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@division, ''))))
                        OR UPPER(LTRIM(RTRIM(ISNULL(mefQ.ItemName, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@division, ''))))
                    )
                      AND LTRIM(RTRIM(ISNULL(mefQ.DivisionCode, ''))) <> ''
                      AND (
                        CHARINDEX('/' + UPPER(LTRIM(RTRIM(ISNULL(mefQ.DivisionCode, '')))) + '/', UPPER(ISNULL(eq.QuoteNumber, ''))) > 0
                        OR CHARINDEX('-' + UPPER(LTRIM(RTRIM(ISNULL(mefQ.DivisionCode, '')))) + '/', UPPER(ISNULL(eq.QuoteNumber, ''))) > 0
                        OR CHARINDEX('/' + UPPER(LTRIM(RTRIM(ISNULL(mefQ.DivisionCode, '')))) + '-', UPPER(ISNULL(eq.QuoteNumber, ''))) > 0
                      )
                )
            `;
        }

        const today = new Date();
        const query = `
            SELECT
                (SELECT COUNT(*) FROM EnquiryMaster em WHERE CONVERT(VARCHAR(10), EnquiryDate, 23) = CONVERT(VARCHAR(10), @today, 23) ${baseFilter}) as EnquiriesToday,
                (SELECT COUNT(*) FROM EnquiryMaster em
                 WHERE CONVERT(VARCHAR(10), DueDate, 23) = CONVERT(VARCHAR(10), @today, 23)
                   AND NOT EXISTS (SELECT 1 FROM EnquiryQuotes eq WHERE eq.RequestNo = em.RequestNo ${quoteScopeFilter})
                   ${baseFilter}) as DueToday,
                (SELECT COUNT(*) FROM EnquiryMaster em
                 WHERE CONVERT(VARCHAR(10), DueDate, 23) > CONVERT(VARCHAR(10), @today, 23)
                   AND NOT EXISTS (SELECT 1 FROM EnquiryQuotes eq WHERE eq.RequestNo = em.RequestNo ${quoteScopeFilter})
                   ${baseFilter}) as UpcomingDues,
                (SELECT COUNT(*) FROM EnquiryMaster em WHERE Status IN ('Quoted', 'Quote', 'Submitted') ${baseFilter}) as QuotedCount,
                (SELECT COUNT(*) FROM EnquiryMaster em
                 WHERE CONVERT(VARCHAR(10), DueDate, 23) < CONVERT(VARCHAR(10), @today, 23)
                   AND (Status IS NULL OR Status NOT IN ('Quote', 'Won', 'Lost', 'Quoted', 'Submitted'))
                   AND NOT EXISTS (SELECT 1 FROM EnquiryQuotes eq WHERE eq.RequestNo = em.RequestNo ${quoteScopeFilter})
                   ${baseFilter}) as LapsedCount
        `;

        const todayStr = today.toISOString().split('T')[0];
        request.input('today', sql.VarChar(10), todayStr);
        const result = await request.query(query);
        res.json(result.recordset[0]);

    } catch (err) {
        console.error('Summary API Error:', err);
        res.status(500).json({ error: err.message });
    }
});

/** Quote module–style summary rows for dashboard “Quoted” bar / quote chip (same mapper as /api/quotes/list/*). */
router.get('/quote-summary-rows', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
        const { fromDate, toDate, date, dateType } = req.query;
        const dtLabel = (dateType || 'Enquiry Date').toString();
        const isQuoteMonth = fromDate && toDate && (dtLabel === 'Quote Date' || dtLabel === 'Quote date');
        const isQuoteDay = !!date;
        if (!isQuoteMonth && !isQuoteDay) {
            return res.json([]);
        }

        const ctx = await buildDashboardEnquiryListWhere(req, {
            restrictSingleDayToQuoteActivity: isQuoteDay,
        });
        const { request, whereClause, divisionTrim, userEmailForAccess, calendarEmBaseFilterSql, quoteScopeFilter, isSearchActive } =
            ctx;

        if (!userEmailForAccess) {
            return res.json({ rows: [], calendarQuotedCount: null });
        }

        /** Match GET /calendar quoted total: COUNT(EnquiryQuotes rows), not UI lead lines. */
        let calendarQuotedCount = null;
        if (!isSearchActive && calendarEmBaseFilterSql != null) {
            let dateClause = '';
            if (isQuoteMonth) {
                dateClause = ` AND eq.QuoteDate IS NOT NULL AND CONVERT(VARCHAR(10), eq.QuoteDate, 23) BETWEEN CONVERT(VARCHAR(10), @fromDate, 23) AND CONVERT(VARCHAR(10), @toDate, 23) `;
            } else if (isQuoteDay) {
                dateClause = ` AND eq.QuoteDate IS NOT NULL AND CONVERT(VARCHAR(10), eq.QuoteDate, 23) = CONVERT(VARCHAR(10), @date, 23) `;
            }
            if (dateClause) {
                const countSql = `
                    SELECT COUNT(*) AS cnt
                    FROM EnquiryQuotes eq
                    INNER JOIN EnquiryMaster em ON eq.RequestNo = em.RequestNo
                    WHERE 1=1
                    ${calendarEmBaseFilterSql}
                    ${quoteScopeFilter}
                    ${dateClause}
                `;
                const countRes = await request.query(countSql);
                calendarQuotedCount = Number(countRes.recordset[0]?.cnt) || 0;
            }
        }

        const idsQuery = `SELECT DISTINCT em.RequestNo FROM EnquiryMaster em ${whereClause}`;
        const idRes = await request.query(idsQuery);
        const ids = (idRes.recordset || []).map((r) => String(r.RequestNo ?? '').trim()).filter(Boolean);
        if (ids.length === 0) {
            return res.json({ rows: [], calendarQuotedCount });
        }

        const esc = (s) => String(s).replace(/'/g, "''");
        const inCsv = ids.map((id) => `'${esc(id)}'`).join(', ');
        const extraWhereSql = ` AND E.RequestNo IN (${inCsv}) `;

        const { enquiries: rawQuoted, accessCtx, userEmail: ue } = await runQuotedQuoteListQuery(
            sql,
            userEmailForAccess,
            extraWhereSql,
            divisionTrim
        );
        const mapped = await mapQuoteListingRows(sql, rawQuoted || [], ue, accessCtx, divisionTrim);
        const sorted = [...mapped].sort((a, b) => {
            const ta = a.DueDate ? new Date(a.DueDate).getTime() : 0;
            const tb = b.DueDate ? new Date(b.DueDate).getTime() : 0;
            return ta - tb;
        });

        res.json({ rows: sorted, calendarQuotedCount });
    } catch (err) {
        console.error('Dashboard quote-summary-rows Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// 3. Enquiry Table
router.get('/enquiries', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
        const { date, userEmail, userName, userRole, division, salesEngineer, fromDate, toDate, status, dateType, search } = req.query;
        console.log('API /enquiries params:', { division, salesEngineer, date, fromDate, toDate, status, dateType, search, userEmail, userName, userRole });

        const {
            request,
            whereClause,
            quoteScopeFilter,
            scopedQuoteCountDateClause,
        } = await buildDashboardEnquiryListWhere(req, {});

        // Input for User Preference Logic (Renamed to avoid conflict with applyAccessControl)
        request.input('queryUserEmail', sql.NVarChar, userEmail || '');

        const query = `
            SELECT 
                em.RequestNo,
                em.ProjectName,
                em.CustomerName,
                em.ClientName,
                em.ConsultantName,
                CONVERT(VARCHAR(10), em.DueDate, 23) as DueDate,
                CONVERT(VARCHAR(10), em.SiteVisitDate, 23) as SiteVisitDate,
                em.EnquiryDetails,
                CONVERT(VARCHAR(10), em.EnquiryDate, 23) as EnquiryDate,
                em.Status,
                em.ReceivedFrom,
                CASE WHEN EXISTS (
                    SELECT 1 FROM EnquiryQuotes eq
                    WHERE eq.RequestNo = em.RequestNo
                    ${quoteScopeFilter}
                ) THEN 1 ELSE 0 END AS HasQuoteInScope,
                (SELECT COUNT(*) FROM EnquiryQuotes eq WHERE eq.RequestNo = em.RequestNo ${quoteScopeFilter}${scopedQuoteCountDateClause}) AS ScopedQuotesCount,
                NULLIF(STUFF((SELECT ', ' + et.TypeName FROM EnquiryType et WHERE et.RequestNo = em.RequestNo FOR XML PATH('')), 1, 2, ''), '') AS EnquiryType,
                em.SourceOfEnquiry AS SourceOfInfo,
                STUFF((SELECT ', ' + SEName FROM ConcernedSE WHERE RequestNo = em.RequestNo FOR XML PATH('')), 1, 2, '') as ConcernedSE,
                STUFF((SELECT ', ' + ItemName FROM EnquiryFor WHERE RequestNo = em.RequestNo FOR XML PATH('')), 1, 2, '') as EnquiryFor,

                ${date ? `(SELECT MAX(QuoteDate) FROM EnquiryQuotes WHERE RequestNo = em.RequestNo AND QuoteDate IS NOT NULL AND CONVERT(VARCHAR(10), QuoteDate, 23) = CONVERT(VARCHAR(10), @date, 23)) as QuoteDate` : `(SELECT MAX(QuoteDate) FROM EnquiryQuotes WHERE RequestNo = em.RequestNo AND QuoteDate IS NOT NULL) as QuoteDate`},
                
                -- Add Quote Details prioritized by QuoteDate day match and Current User (Department)
                (
                    SELECT TOP 1 
                        QuoteNumber + ' (' + CONVERT(VARCHAR, ISNULL(QuoteDate, CreatedAt), 106) + ')' 
                    FROM EnquiryQuotes 
                    WHERE RequestNo = em.RequestNo 
                    ORDER BY 
                        ${date ? `CASE WHEN QuoteDate IS NOT NULL AND CONVERT(VARCHAR(10), QuoteDate, 23) = CONVERT(VARCHAR(10), @date, 23) THEN 1 ELSE 2 END,` : ''}
                        CASE WHEN PreparedByEmail = @queryUserEmail THEN 1 ELSE 2 END, 
                        CreatedAt DESC
                ) as QuoteRefNo,
                (
                    SELECT TOP 1 TotalAmount 
                    FROM EnquiryQuotes 
                    WHERE RequestNo = em.RequestNo 
                    ORDER BY 
                        ${date ? `CASE WHEN QuoteDate IS NOT NULL AND CONVERT(VARCHAR(10), QuoteDate, 23) = CONVERT(VARCHAR(10), @date, 23) THEN 1 ELSE 2 END,` : ''}
                        CASE WHEN PreparedByEmail = @queryUserEmail THEN 1 ELSE 2 END, 
                        CreatedAt DESC
                ) as TotalQuotedPrice,
                (
                    SELECT TOP 1 TotalAmount 
                    FROM EnquiryQuotes 
                    WHERE RequestNo = em.RequestNo 
                    ORDER BY 
                        ${date ? `CASE WHEN QuoteDate IS NOT NULL AND CONVERT(VARCHAR(10), QuoteDate, 23) = CONVERT(VARCHAR(10), @date, 23) THEN 1 ELSE 2 END,` : ''}
                        CASE WHEN PreparedByEmail = @queryUserEmail THEN 1 ELSE 2 END, 
                        CreatedAt DESC
                ) as NetQuotedPrice,
                
                em.CreatedBy
            FROM EnquiryMaster em
            ${whereClause}
            ORDER BY em.CreatedAt DESC
        `;

        const result = await request.query(query);
        const enquiries = result.recordset;

        // --- Fetch Pricing Breakdown Separately (SQL Server < 2016 Compatibility) ---
        if (enquiries.length > 0) {
            const requestNos = enquiries.map(e => e.RequestNo);

            // Fetch pricing values for these requests
            // Use ROW_NUMBER to get the latest OptionID for each RequestNo AND Item
            // This ensures we get specific items even if they were saved in a previous option but not the absolute latest one (partial saves)
            const pricingQuery = `
                SELECT RequestNo, EnquiryForItem, Price, UpdatedAt
                FROM (
                    SELECT 
                        RequestNo,
                        EnquiryForItem, 
                        Price, 
                        UpdatedAt,
                        ROW_NUMBER() OVER (PARTITION BY RequestNo, EnquiryForItem ORDER BY OptionID DESC) as rn
                    FROM EnquiryPricingValues
                    WHERE RequestNo IN (${requestNos.map(r => `'${r}'`).join(',')})
                ) t
                WHERE rn = 1
            `;

            try {
                const pricingResult = await new sql.Request().query(pricingQuery);
                const pricingMap = {};

                pricingResult.recordset.forEach(row => {
                    if (!pricingMap[row.RequestNo]) pricingMap[row.RequestNo] = [];
                    pricingMap[row.RequestNo].push({
                        EnquiryForItem: row.EnquiryForItem,
                        Price: row.Price,
                        UpdatedAt: row.UpdatedAt
                    });
                });

                // Attach to enquiries
                enquiries.forEach(row => {
                    // Stringify to match frontend expectation of JSON string
                    row.PricingBreakdown = JSON.stringify(pricingMap[row.RequestNo] || []);
                });

            } catch (err) {
                console.error('Error fetching pricing breakdown:', err);
                // Fallback to empty array
                enquiries.forEach(row => {
                    row.PricingBreakdown = "[]";
                });
            }

            // Lead-job hierarchy for dashboard table (Project / Division tree / SE columns)
            try {
                const efReq = new sql.Request();
                requestNos.forEach((no, i) => {
                    efReq.input(`ef${i}`, sql.NVarChar, String(no));
                });
                const efPlaceholders = requestNos.map((_, i) => `@ef${i}`).join(', ');
                const efRes = await efReq.query(`
                    SELECT RequestNo, ID, ParentID, ItemName, LeadJobCode, LeadJobName
                    FROM EnquiryFor
                    WHERE RequestNo IN (${efPlaceholders})
                    ORDER BY RequestNo, ID
                `);
                const jobsByReq = {};
                (efRes.recordset || []).forEach((r) => {
                    const k = String(r.RequestNo);
                    if (!jobsByReq[k]) jobsByReq[k] = [];
                    jobsByReq[k].push({
                        ID: r.ID,
                        ParentID: r.ParentID,
                        ItemName: r.ItemName,
                        LeadJobCode: r.LeadJobCode,
                        LeadJobName: r.LeadJobName,
                    });
                });
                enquiries.forEach((row) => {
                    row.EnquiryForJobs = jobsByReq[String(row.RequestNo)] || [];
                });
            } catch (err) {
                console.error('Error fetching EnquiryFor jobs for dashboard:', err);
                enquiries.forEach((row) => {
                    row.EnquiryForJobs = [];
                });
            }
        }

        res.json(enquiries);

    } catch (err) {
        console.error('Enquiry List API Error:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;

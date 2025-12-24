const express = require('express');
const router = express.Router();
const { sql } = require('../dbConfig');

// Helper to construct filter clauses (kept for reference or future use if needed, though active logic is inline below)
// --- Helper: Apply Access Control Logic ---
const applyAccessControl = (request, params) => {
    const { userRole, userName, userEmail } = params;

    // If Role is NOT Admin (and exists), apply visibility filters
    // FORCE ADMIN for ranigovardhan@gmail.com
    if (userEmail && userEmail.toLowerCase() === 'ranigovardhan@gmail.com') return '';

    const userRoles = typeof userRole === 'string'
        ? userRole.split(',').map(r => r.trim().toLowerCase())
        : [];

    const isAdmin = userRoles.includes('admin') || userRoles.includes('system');

    if (userRole && !isAdmin) {
        // Logic: 
        // 1. CreatedBy = userName
        // 2. ConcernedSE (Assigned) = userName
        // 3. Common/CC Email matches userEmail (via EnquiryFor Item)

        request.input('currentUserName', sql.NVarChar, userName || '');
        request.input('currentUserEmail', sql.NVarChar, userEmail || '');

        return ` AND (
                em.CreatedBy = @currentUserName
                OR EXISTS (SELECT 1 FROM ConcernedSE cse WHERE cse.RequestNo = em.RequestNo AND cse.SEName = @currentUserName)
                OR EXISTS (
                    SELECT 1 FROM EnquiryFor ef
                    JOIN Master_EnquiryFor mef ON ef.ItemName = mef.ItemName
                    WHERE ef.RequestNo = em.RequestNo
                    AND (
                        mef.CommonMailIds LIKE '%' + @currentUserEmail + '%'
                        OR mef.CCMailIds LIKE '%' + @currentUserEmail + '%'
                    )
                )
            ) `;
    }
    return '';
};

// 1. Calendar Aggregation
router.get('/calendar', async (req, res) => {
    try {
        const { month, year, division, salesEngineer, userEmail, userName, userRole } = req.query;

        if (!month || !year) return res.status(400).json({ error: 'Month and Year required' });

        const request = new sql.Request();
        request.input('month', sql.Int, parseInt(month));
        request.input('year', sql.Int, parseInt(year));

        let baseFilter = '';
        if (division && division !== 'All') {
            baseFilter += ` AND EXISTS (SELECT 1 FROM EnquiryFor ef WHERE ef.RequestNo = em.RequestNo AND ef.ItemName = @division) `;
            request.input('division', sql.NVarChar, division);
        }
        if (salesEngineer && salesEngineer !== 'All') {
            baseFilter += ` AND EXISTS (SELECT 1 FROM ConcernedSE cse WHERE cse.RequestNo = em.RequestNo AND cse.SEName = @salesEngineer) `;
            request.input('salesEngineer', sql.NVarChar, salesEngineer);
        }

        // Apply Access Control
        baseFilter += applyAccessControl(request, { userRole, userName, userEmail });

        // We need counts for EnquiryDate, DueDate, SiteVisitDate per day in the month
        const query = `
            WITH FilteredEnquiries AS (
                SELECT RequestNo, EnquiryDate, DueDate, SiteVisitDate 
                FROM EnquiryMaster em
                WHERE 1=1 ${baseFilter}
            ),
            Dates AS (
                SELECT EnquiryDate as DateVal, 'Enquiry' as Type FROM FilteredEnquiries WHERE MONTH(EnquiryDate) = @month AND YEAR(EnquiryDate) = @year
                UNION ALL
                SELECT DueDate as DateVal, 'Due' as Type FROM FilteredEnquiries WHERE MONTH(DueDate) = @month AND YEAR(DueDate) = @year
                UNION ALL
                SELECT SiteVisitDate as DateVal, 'SiteVisit' as Type FROM FilteredEnquiries WHERE MONTH(SiteVisitDate) = @month AND YEAR(SiteVisitDate) = @year
            )
            SELECT 
                CAST(DateVal as DATE) as Date,
                SUM(CASE WHEN Type = 'Enquiry' THEN 1 ELSE 0 END) as Enquiries,
                SUM(CASE WHEN Type = 'Due' THEN 1 ELSE 0 END) as Due,
                SUM(CASE WHEN Type = 'SiteVisit' THEN 1 ELSE 0 END) as SiteVisits
            FROM Dates
            WHERE DateVal IS NOT NULL
            GROUP BY CAST(DateVal as DATE)
        `;

        const result = await request.query(query);
        res.json(result.recordset);

    } catch (err) {
        console.error('Calendar API Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// 2. KPISummary
router.get('/summary', async (req, res) => {
    try {
        const { division, salesEngineer, userEmail, userName, userRole } = req.query;
        const request = new sql.Request();

        let baseFilter = '';
        if (division && division !== 'All') {
            baseFilter += ` AND EXISTS (SELECT 1 FROM EnquiryFor ef WHERE ef.RequestNo = em.RequestNo AND ef.ItemName = @division) `;
            request.input('division', sql.NVarChar, division);
        }
        if (salesEngineer && salesEngineer !== 'All') {
            baseFilter += ` AND EXISTS (SELECT 1 FROM ConcernedSE cse WHERE cse.RequestNo = em.RequestNo AND cse.SEName = @salesEngineer) `;
            request.input('salesEngineer', sql.NVarChar, salesEngineer);
        }

        // Apply Access Control
        baseFilter += applyAccessControl(request, { userRole, userName, userEmail });

        const query = `
            SELECT
                (SELECT COUNT(*) FROM EnquiryMaster em WHERE CAST(EnquiryDate AS DATE) = CAST(GETDATE() AS DATE) ${baseFilter}) as EnquiriesToday,
                (SELECT COUNT(*) FROM EnquiryMaster em WHERE CAST(DueDate AS DATE) = CAST(GETDATE() AS DATE) ${baseFilter}) as DueToday,
                (SELECT COUNT(*) FROM EnquiryMaster em WHERE CAST(DueDate AS DATE) > CAST(GETDATE() AS DATE) ${baseFilter}) as UpcomingDues
        `;

        const result = await request.query(query);
        res.json(result.recordset[0]);

    } catch (err) {
        console.error('Summary API Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// 3. Enquiry Table
router.get('/enquiries', async (req, res) => {
    try {
        const { division, salesEngineer, date, fromDate, toDate, status, dateType, search, userEmail, userName, userRole } = req.query;
        console.log('API /enquiries params:', { division, salesEngineer, date, fromDate, toDate, status, dateType, search, userEmail, userName, userRole });
        const request = new sql.Request();

        let whereClause = ' WHERE 1=1 ';

        // --- ACCESS CONTROL LOGIC ---
        whereClause += applyAccessControl(request, { userRole, userName, userEmail });

        // 0. Global Search (Overrides default mode, but respects explicit filters)
        if (search && search.trim() !== '') {
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

        // 1. Filter by Division/SE/Status
        if (division && division !== 'All') {
            whereClause += ` AND EXISTS (SELECT 1 FROM EnquiryFor ef WHERE ef.RequestNo = em.RequestNo AND ef.ItemName = @division) `;
            request.input('division', sql.NVarChar, division);
        }
        if (salesEngineer && salesEngineer !== 'All') {
            whereClause += ` AND EXISTS (SELECT 1 FROM ConcernedSE cse WHERE cse.RequestNo = em.RequestNo AND cse.SEName = @salesEngineer) `;
            request.input('salesEngineer', sql.NVarChar, salesEngineer);
        }
        if (status && status !== 'All') {
            whereClause += ` AND em.Status = @status `;
            request.input('status', sql.NVarChar, status);
        }

        // 2. Date Logic
        // If search is active and NO explicit date provided, we skip default 'future' mode to allow global search history.
        const isSearchActive = search && search.trim().length > 0;

        console.log('--- Filtering Logic ---');
        console.log('fromDate:', fromDate, 'toDate:', toDate, 'date:', date, 'mode:', req.query.mode, 'search:', search);

        if (fromDate && toDate) {
            console.log('Path: Range Filter');
            const type = dateType || 'Enquiry Date';
            console.log('Type:', type);

            if (type === 'Due Date') {
                whereClause += ` AND CAST(em.DueDate AS DATE) BETWEEN @fromDate AND @toDate `;
            } else {
                whereClause += ` AND CAST(em.EnquiryDate AS DATE) BETWEEN @fromDate AND @toDate `;
            }

            request.input('fromDate', sql.Date, new Date(fromDate));
            request.input('toDate', sql.Date, new Date(toDate));
        } else if (date) {
            console.log('Path: Specific Date');
            whereClause += ` AND (
                CAST(em.EnquiryDate AS DATE) = @date OR
                CAST(em.DueDate AS DATE) = @date OR
                CAST(em.SiteVisitDate AS DATE) = @date
            ) `;
            request.input('date', sql.Date, new Date(date));
        } else {
            // Only apply default mode if NOT searching
            if (!isSearchActive) {
                console.log('Path: Mode/Default');
                const currentMode = req.query.mode || 'future';
                console.log('Mode:', currentMode);

                if (currentMode === 'today') {
                    whereClause += ` AND (
                        CAST(em.DueDate AS DATE) = CAST(GETDATE() AS DATE) OR
                        CAST(em.SiteVisitDate AS DATE) = CAST(GETDATE() AS DATE)
                    ) `;
                } else if (currentMode === 'future') {
                    whereClause += ` AND CAST(em.DueDate AS DATE) >= CAST(GETDATE() AS DATE) `;
                }
            } else {
                console.log('Path: Search Active (Skipping Default Mode)');
            }
        }
        console.log('Generated WHERE:', whereClause);

        const query = `
            SELECT 
                em.RequestNo,
                em.ProjectName,
                em.CustomerName, -- Can be comma separated if multiple
                em.ClientName,
                em.ConsultantName,
                em.DueDate,
                em.SiteVisitDate,
                em.EnquiryDetails,
                em.EnquiryDate,
                em.Status,
                em.ReceivedFrom,
                -- Subqueries for aggregates (efficient enough for reasonable paging, but here unlimited)
                (SELECT STRING_AGG(SEName, ', ') FROM ConcernedSE WHERE RequestNo = em.RequestNo) as ConcernedSE,
                (SELECT STRING_AGG(ItemName, ', ') FROM EnquiryFor WHERE RequestNo = em.RequestNo) as EnquiryFor,
                em.CreatedBy
            FROM EnquiryMaster em
            ${whereClause}
            ORDER BY em.DueDate ASC -- Prioritize upcoming
        `;

        const result = await request.query(query);
        res.json(result.recordset);

    } catch (err) {
        console.error('Enquiry List API Error:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;

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
                        ',' + REPLACE(REPLACE(mef.CommonMailIds, ' ', ''), ';', ',') + ',' LIKE '%,' + @currentUserEmail + ',%'
                        OR ',' + REPLACE(REPLACE(mef.CCMailIds, ' ', ''), ';', ',') + ',' LIKE '%,' + @currentUserEmail + ',%'
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
        const accessFilter = applyAccessControl(request, { userRole, userName, userEmail });
        baseFilter += accessFilter;
        console.log('Calendar Access Filter:', accessFilter);
        console.log('Calendar Params:', { month, year, division, salesEngineer, userEmail, userName, userRole });
        console.log('Calendar baseFilter:', baseFilter);

        // Input for Quote Filtering (Unique name to avoid conflict)
        request.input('filterUserEmail', sql.NVarChar, userEmail || '');

        // We need counts for EnquiryDate, DueDate, SiteVisitDate per day in the month
        const query = `
            WITH FilteredEnquiries AS (
                SELECT RequestNo, EnquiryDate, DueDate, SiteVisitDate, Status 
                FROM EnquiryMaster em
                WHERE 1=1 ${baseFilter}
            ),
            FilteredQuotes AS (
                SELECT eq.CreatedAt, eq.QuoteDate, eq.RequestNo
                FROM EnquiryQuotes eq
                JOIN EnquiryMaster em ON eq.RequestNo = em.RequestNo
                WHERE 1=1 ${baseFilter}
                AND (@filterUserEmail = '' OR eq.PreparedByEmail = @filterUserEmail)
            ),
            Dates AS (
                SELECT EnquiryDate as DateVal, 'Enquiry' as Type FROM FilteredEnquiries WHERE MONTH(EnquiryDate) = @month AND YEAR(EnquiryDate) = @year
                UNION ALL
                SELECT DueDate as DateVal, 'Due' as Type FROM FilteredEnquiries WHERE MONTH(DueDate) = @month AND YEAR(DueDate) = @year
                UNION ALL
                SELECT DueDate as DateVal, 'Lapsed' as Type 
                FROM FilteredEnquiries 
                WHERE MONTH(DueDate) = @month AND YEAR(DueDate) = @year
                AND CAST(DueDate AS DATE) < CAST(GETDATE() AS DATE)
                AND (Status IS NULL OR Status NOT IN ('Quote', 'Won', 'Lost', 'Quoted', 'Submitted'))
                UNION ALL
                SELECT SiteVisitDate as DateVal, 'SiteVisit' as Type FROM FilteredEnquiries WHERE MONTH(SiteVisitDate) = @month AND YEAR(SiteVisitDate) = @year
                UNION ALL
                -- Count unique Enquiries quoted per day (using QuoteDate if available)
                SELECT MIN(ISNULL(QuoteDate, CreatedAt)) as DateVal, 'Quote' as Type 
                FROM FilteredQuotes 
                WHERE MONTH(ISNULL(QuoteDate, CreatedAt)) = @month AND YEAR(ISNULL(QuoteDate, CreatedAt)) = @year
                GROUP BY RequestNo, CAST(ISNULL(QuoteDate, CreatedAt) AS DATE)
            )
            SELECT 
                CAST(DateVal as DATE) as Date,
                SUM(CASE WHEN Type = 'Enquiry' THEN 1 ELSE 0 END) as Enquiries,
                SUM(CASE WHEN Type = 'Due' THEN 1 ELSE 0 END) as Due,
                SUM(CASE WHEN Type = 'Lapsed' THEN 1 ELSE 0 END) as Lapsed,
                SUM(CASE WHEN Type = 'SiteVisit' THEN 1 ELSE 0 END) as SiteVisits,
                SUM(CASE WHEN Type = 'Quote' THEN 1 ELSE 0 END) as Quoted
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
                (SELECT COUNT(*) FROM EnquiryMaster em WHERE CAST(DueDate AS DATE) > CAST(GETDATE() AS DATE) ${baseFilter}) as UpcomingDues,
                (SELECT COUNT(*) FROM EnquiryMaster em WHERE Status IN ('Quoted', 'Quote', 'Submitted') ${baseFilter}) as QuotedCount,
                (SELECT COUNT(*) FROM EnquiryMaster em WHERE CAST(DueDate AS DATE) < CAST(GETDATE() AS DATE) AND (Status IS NULL OR Status NOT IN ('Quote', 'Won', 'Lost', 'Quoted', 'Submitted')) ${baseFilter}) as LapsedCount
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
        if (status === 'Lapsed') {
            whereClause += ` AND CAST(em.DueDate AS DATE) < CAST(GETDATE() AS DATE) AND (em.Status IS NULL OR em.Status NOT IN ('Quote', 'Won', 'Lost', 'Quoted', 'Submitted')) `;
        } else if (status && status !== 'All') {
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
            } else if (type === 'Quote Date') {
                whereClause += ` AND EXISTS (SELECT 1 FROM EnquiryQuotes eq WHERE eq.RequestNo = em.RequestNo AND CAST(ISNULL(eq.QuoteDate, eq.CreatedAt) AS DATE) BETWEEN @fromDate AND @toDate) `;
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
                CAST(em.SiteVisitDate AS DATE) = @date OR
                EXISTS (SELECT 1 FROM EnquiryQuotes eq WHERE eq.RequestNo = em.RequestNo AND CAST(ISNULL(eq.QuoteDate, eq.CreatedAt) AS DATE) = @date)
            ) `;
        }

        // Always input date if present, as it's used in SELECT subquery
        if (date) {
            request.input('date', sql.Date, new Date(date));
        }

        if (!fromDate && !toDate && !date) {
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

        // Input for User Preference Logic (Renamed to avoid conflict with applyAccessControl)
        request.input('queryUserEmail', sql.NVarChar, userEmail || '');

        const query = `
            SELECT 
                em.RequestNo,
                em.ProjectName,
                em.CustomerName,
                em.ClientName,
                em.ConsultantName,
                em.DueDate,
                em.SiteVisitDate,
                em.EnquiryDetails,
                em.EnquiryDate,
                em.Status,
                em.ReceivedFrom,
                STUFF((SELECT ', ' + SEName FROM ConcernedSE WHERE RequestNo = em.RequestNo FOR XML PATH('')), 1, 2, '') as ConcernedSE,
                STUFF((SELECT ', ' + ItemName FROM EnquiryFor WHERE RequestNo = em.RequestNo FOR XML PATH('')), 1, 2, '') as EnquiryFor,

                ${date ? `(SELECT MAX(ISNULL(QuoteDate, CreatedAt)) FROM EnquiryQuotes WHERE RequestNo = em.RequestNo AND CAST(ISNULL(QuoteDate, CreatedAt) AS DATE) = @date) as QuoteDate` : `(SELECT MAX(ISNULL(QuoteDate, CreatedAt)) FROM EnquiryQuotes WHERE RequestNo = em.RequestNo) as QuoteDate`},
                
                -- Add Quote Details prioritized by Current User (Department)
                (
                    SELECT TOP 1 
                        QuoteNumber + ' (' + CONVERT(VARCHAR, ISNULL(QuoteDate, CreatedAt), 106) + ')' 
                    FROM EnquiryQuotes 
                    WHERE RequestNo = em.RequestNo 
                    ORDER BY 
                        CASE WHEN PreparedByEmail = @queryUserEmail THEN 1 ELSE 2 END, 
                        CreatedAt DESC
                ) as QuoteRefNo,
                (
                    SELECT TOP 1 TotalAmount 
                    FROM EnquiryQuotes 
                    WHERE RequestNo = em.RequestNo 
                    ORDER BY 
                        CASE WHEN PreparedByEmail = @queryUserEmail THEN 1 ELSE 2 END, 
                        CreatedAt DESC
                ) as TotalQuotedPrice,
                (
                    SELECT TOP 1 TotalAmount 
                    FROM EnquiryQuotes 
                    WHERE RequestNo = em.RequestNo 
                    ORDER BY 
                        CASE WHEN PreparedByEmail = @queryUserEmail THEN 1 ELSE 2 END, 
                        CreatedAt DESC
                ) as NetQuotedPrice,
                
                em.CreatedBy
            FROM EnquiryMaster em
            ${whereClause}
            ORDER BY em.DueDate ASC
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
        }

        res.json(enquiries);

    } catch (err) {
        console.error('Enquiry List API Error:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;

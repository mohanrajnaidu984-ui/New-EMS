
const express = require('express');
const router = express.Router();
const { sql } = require('../dbConfig');

const sanitizeInput = (input) => {
    if (input === undefined || input === null || input === 'null' || input === 'undefined') return null;
    const s = String(input).trim();
    return s === '' ? null : s;
};

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
        const { email } = req.query;
        if (!email) return res.status(400).json({ error: 'Email is required' });

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
        const RESTRICTED_ROLES = ['Sales Engineer', 'Estimation Engineer', 'Quantity Surveyor'];

        // Match designation (case-insensitive check if needed, but array includes is exact)
        // Ensure data integrity
        const userDesignation = user.Designation ? user.Designation.trim() : '';

        if (RESTRICTED_ROLES.includes(userDesignation)) {
            // 2. Fetch Company Logic
            let company = '';
            if (user.Department) {
                const companyReq = new sql.Request();
                companyReq.input('dept', sql.NVarChar, user.Department);
                const companyRes = await companyReq.query(`
                     SELECT TOP 1 CompanyName 
                     FROM Master_EnquiryFor 
                     WHERE DepartmentName = @dept
                 `);
                if (companyRes.recordset.length > 0) {
                    company = companyRes.recordset[0].CompanyName;
                }
            }

            res.json({
                restricted: true,
                role: user.FullName,
                division: user.Department,
                company: company
            });
        } else {
            res.json({ restricted: false });
        }

    } catch (err) {
        console.error('Error fetching user access details:', err);
        res.status(500).json({ error: 'Server Error' });
    }
});

router.get('/filters', async (req, res) => {
    try {
        const { company, division } = req.query;
        const request = new sql.Request();

        // 1. Years (Always distinct from EnquiryMaster)
        const yearQuery = `
            SELECT DISTINCT YEAR(EnquiryDate) as Year 
            FROM EnquiryMaster 
            WHERE EnquiryDate IS NOT NULL 
            ORDER BY Year DESC
        `;

        // 2. Companies (Always distinct from Master_EnquiryFor)
        const companyQuery = `
            SELECT DISTINCT CompanyName 
            FROM Master_EnquiryFor 
            WHERE CompanyName IS NOT NULL AND CompanyName <> ''
            ORDER BY CompanyName ASC
        `;

        // 3. Divisions (Filtered by Company if provided)
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

        // 4. Roles (Filtered by Division if provided)
        // Master_ConcernedSE has 'Department' column.
        let roleSQL = `
            SELECT DISTINCT FullName 
            FROM Master_ConcernedSE 
            WHERE FullName IS NOT NULL AND FullName <> ''
        `;
        if (division && division !== 'All') {
            roleSQL += ` AND Department = @division `;
            request.input('division', sql.NVarChar, division);
        }
        roleSQL += ` ORDER BY FullName ASC`;

        const [years, companies, divisions, roles] = await Promise.all([
            new sql.Request().query(yearQuery),
            new sql.Request().query(companyQuery),
            request.query(divisionSQL),
            request.query(roleSQL)
        ]);

        res.json({
            years: years.recordset.map(r => r.Year),
            companies: companies.recordset.map(r => r.CompanyName),
            divisions: divisions.recordset.map(r => r.DepartmentName),
            roles: roles.recordset.map(r => r.FullName)
        });

    } catch (err) {
        console.error('Error fetching Sales Report filters:', err);
        res.status(500).json({ error: 'Failed to fetch filters' });
    }
});

router.get('/summary', async (req, res) => {
    try {
        const { year, company, division, role } = req.query;
        if (!year) return res.status(400).json({ error: 'Year is required' });

        const request = new sql.Request();

        // Sanitize inputs
        const safeYear = year ? parseInt(year) : null;
        const safeCompany = company ? String(company).trim() : null;
        const safeDivision = division ? String(division).trim() : null;
        const safeRole = role ? String(role).trim() : null;
        const safeQuarter = (req.query.quarter && req.query.quarter !== 'All') ? String(req.query.quarter).trim() : null;
        let quarterNum = null;
        if (safeQuarter) quarterNum = parseInt(safeQuarter.replace('Q', ''));

        console.log("!!! EXECUTING SUMMARY ROUTE - NEW CODE !!!");
        console.log(`[DEBUG] safeDivision: '${safeDivision}' (Type: ${typeof safeDivision})`);
        if (safeDivision === 'All') console.log("[DEBUG] safeDivision is 'All'");


        console.log('[DEBUG-SUMMARY] Sanitized Params:', { safeYear, safeCompany, safeDivision, safeRole });

        request.input('year', sql.Int, safeYear);
        if (safeQuarter) {
            request.input('quarterNums', sql.Int, quarterNum);
            request.input('quarterStrs', sql.NVarChar, safeQuarter);
        }

        let filterClause = '';
        if (safeDivision && safeDivision !== 'All') {
            request.input('division', sql.NVarChar, safeDivision);
            filterClause += ` AND EXISTS (SELECT 1 FROM EnquiryFor ef JOIN Master_EnquiryFor mef ON (ef.ItemName = mef.ItemName OR ef.ItemName LIKE '% - ' + mef.ItemName) WHERE ef.RequestNo = E.RequestNo AND LTRIM(RTRIM(mef.DepartmentName)) = @division) `;
        } else if (safeCompany && safeCompany !== 'All') {
            request.input('company', sql.NVarChar, safeCompany);
            filterClause += ` AND EXISTS (SELECT 1 FROM EnquiryFor ef JOIN Master_EnquiryFor mef ON (ef.ItemName = mef.ItemName OR ef.ItemName LIKE '% - ' + mef.ItemName) WHERE ef.RequestNo = E.RequestNo AND LTRIM(RTRIM(mef.CompanyName)) = @company) `;
        }

        if (safeRole && safeRole !== 'All') {
            request.input('se', sql.NVarChar, safeRole);
            filterClause += ` AND EXISTS (SELECT 1 FROM ConcernedSE cse WHERE cse.RequestNo = E.RequestNo AND cse.SEName = @se) `;
        }

        // 1. Target vs Job Booked
        // Target from SalesTargets
        let targetFilter = ' WHERE FinancialYear = @year ';
        if (safeDivision && safeDivision !== 'All') targetFilter += ' AND Division = @division ';
        if (safeRole && safeRole !== 'All') targetFilter += ' AND SalesEngineer = @se ';
        if (safeQuarter) targetFilter += ' AND Quarter = @quarterStrs ';

        const targetRes = await request.query(`
            SELECT Quarter, SUM(ISNULL(TargetValue, 0)) as TotalTarget
            FROM SalesTargets
            ${targetFilter}
            GROUP BY Quarter
        `);

        // Check if Division is active to switch to explicit Item Sum logic
        // This ensures restricted users (e.g. BMS) only see the value of their own items, not the whole project.
        // NOTE: If no division filter, we use the global WonOrderValue from EnquiryMaster as it is the official record.
        // Attempting to sum items dynamically for everything resulted in 0s where granular data was missing/mismatched.

        // Unified Item Value Logic (Global vs Division)
        let itemValueApply = '';
        let itemValueCol = '';

        if (safeDivision && safeDivision !== 'All') {
            // Division View: Sum all items belonging to division
            // Using LTRIM/RTRIM to fix whitespace issues in DepartmentName matching.
            itemValueApply = `
                 OUTER APPLY (
                     SELECT SUM(ISNULL(EPV.Price, 0)) as Total
                     FROM EnquiryFor EF_Inner
                     JOIN Master_EnquiryFor MEF_Inner ON (EF_Inner.ItemName = MEF_Inner.ItemName OR EF_Inner.ItemName LIKE '% - ' + MEF_Inner.ItemName)
                     OUTER APPLY (
                         SELECT TOP 1 Price 
                         FROM EnquiryPricingValues 
                         WHERE RequestNo = EF_Inner.RequestNo 
                           AND (EnquiryForID = EF_Inner.ID OR EnquiryForItem = EF_Inner.ItemName)
                         ORDER BY OptionID DESC
                     ) EPV
                     WHERE EF_Inner.RequestNo = E.RequestNo
                       AND LTRIM(RTRIM(MEF_Inner.DepartmentName)) = @division
                 ) ItemValue
             `;
            itemValueCol = 'ISNULL(ItemValue.Total, 0)';
        } else {
            // Global View: Sum Root Items (ParentID IS NULL or 0)
            itemValueApply = `
                 OUTER APPLY (
                     SELECT SUM(ISNULL(EPV.Price, 0)) as Total
                     FROM EnquiryFor EF_Inner
                     OUTER APPLY (
                         SELECT TOP 1 Price 
                         FROM EnquiryPricingValues 
                         WHERE RequestNo = EF_Inner.RequestNo 
                           AND (EnquiryForID = EF_Inner.ID OR EnquiryForItem = EF_Inner.ItemName)
                         ORDER BY OptionID DESC
                     ) EPV
                     WHERE EF_Inner.RequestNo = E.RequestNo
                       AND (EF_Inner.ParentID IS NULL OR EF_Inner.ParentID = 0)
                 ) ItemValue
             `;
            itemValueCol = 'ISNULL(ItemValue.Total, 0)';
        }
        // GLOBAL VIEW: Default (WonOrderValue) applies. Do NOT override with potentially incomplete item sums.


        // Actual from EnquiryMaster (Status = 'Won')
        let actualQuery = '';
        if (safeDivision && safeDivision !== 'All') {
            // Division view: Use OUTER APPLY to calculate division-specific values
            actualQuery = `
                SELECT DATEPART(QUARTER, ExpectedOrderDate) as Q, SUM(ISNULL(DivValue.Total, 0)) as TotalActual
                FROM EnquiryMaster E
                OUTER APPLY (
                    SELECT SUM(ISNULL(EPV.Price, 0)) as Total
                    FROM EnquiryFor EF_Inner
                    JOIN Master_EnquiryFor MEF_Inner ON (EF_Inner.ItemName = MEF_Inner.ItemName OR EF_Inner.ItemName LIKE '% - ' + MEF_Inner.ItemName)
                    OUTER APPLY (
                        SELECT TOP 1 Price 
                        FROM EnquiryPricingValues 
                        WHERE RequestNo = EF_Inner.RequestNo 
                          AND (EnquiryForID = EF_Inner.ID OR EnquiryForItem = EF_Inner.ItemName)
                        ORDER BY OptionID DESC
                    ) EPV
                    WHERE EF_Inner.RequestNo = E.RequestNo
                      AND LTRIM(RTRIM(MEF_Inner.DepartmentName)) = @division
                ) DivValue
                WHERE Status = 'Won' AND YEAR(ExpectedOrderDate) = @year ${filterClause}
                ${safeQuarter ? 'AND DATEPART(QUARTER, ExpectedOrderDate) = @quarterNums' : ''}
                GROUP BY DATEPART(QUARTER, ExpectedOrderDate)
            `;
        } else {
            // Global view: Use ItemValue (Root Sum)
            actualQuery = `
                SELECT DATEPART(QUARTER, ExpectedOrderDate) as Q, SUM(${itemValueCol}) as TotalActual
                FROM EnquiryMaster E
                ${itemValueApply}
                WHERE Status = 'Won' AND YEAR(ExpectedOrderDate) = @year ${filterClause}
                ${safeQuarter ? 'AND DATEPART(QUARTER, ExpectedOrderDate) = @quarterNums' : ''}
                GROUP BY DATEPART(QUARTER, ExpectedOrderDate)
            `;
        }
        const actualRes = await request.query(actualQuery);

        // 2. Win-Loss Ratio (Count)
        let winLossQuery = '';
        if (safeDivision && safeDivision !== 'All') {
            winLossQuery = `
                SELECT 
                    Status, 
                    COUNT(*) as Count,
                    SUM(ISNULL(DivValue.Total, 0)) as TotalValue
                FROM EnquiryMaster E
                OUTER APPLY (
                    SELECT SUM(ISNULL(EPV.Price, 0)) as Total
                    FROM EnquiryFor EF_Inner
                    JOIN Master_EnquiryFor MEF_Inner ON (EF_Inner.ItemName = MEF_Inner.ItemName OR EF_Inner.ItemName LIKE '% - ' + MEF_Inner.ItemName)
                    OUTER APPLY (
                        SELECT TOP 1 Price 
                        FROM EnquiryPricingValues 
                        WHERE RequestNo = EF_Inner.RequestNo 
                          AND (EnquiryForID = EF_Inner.ID OR EnquiryForItem = EF_Inner.ItemName)
                        ORDER BY OptionID DESC
                    ) EPV
                    WHERE EF_Inner.RequestNo = E.RequestNo
                      AND LTRIM(RTRIM(MEF_Inner.DepartmentName)) = @division
                ) DivValue
                WHERE YEAR(EnquiryDate) = @year ${filterClause}
                  AND Status IN ('Won', 'Lost', 'Follow-up', 'FollowUp')
                  ${safeQuarter ? 'AND DATEPART(QUARTER, EnquiryDate) = @quarterNums' : ''}
                GROUP BY Status
            `;
        } else {
            winLossQuery = `
                SELECT 
                    Status, 
                    COUNT(*) as Count,
                    SUM(${itemValueCol}) as TotalValue
                FROM EnquiryMaster E
                ${itemValueApply}
                WHERE YEAR(EnquiryDate) = @year ${filterClause}
                  AND Status IN ('Won', 'Lost', 'Follow-up', 'FollowUp')
                  ${safeQuarter ? 'AND DATEPART(QUARTER, EnquiryDate) = @quarterNums' : ''}
                GROUP BY Status
            `;
        }
        const winLossRes = await request.query(winLossQuery);

        // 3. Top 10 Customers
        let topCustomersQuery = '';
        if (safeDivision && safeDivision !== 'All') {
            topCustomersQuery = `
                SELECT TOP 10 WonCustomerName as name, SUM(ISNULL(DivValue.Total, 0)) as value
                FROM EnquiryMaster E
                OUTER APPLY (
                    SELECT SUM(ISNULL(EPV.Price, 0)) as Total
                    FROM EnquiryFor EF_Inner
                    JOIN Master_EnquiryFor MEF_Inner ON (EF_Inner.ItemName = MEF_Inner.ItemName OR EF_Inner.ItemName LIKE '% - ' + MEF_Inner.ItemName)
                    OUTER APPLY (
                        SELECT TOP 1 Price 
                        FROM EnquiryPricingValues 
                        WHERE RequestNo = EF_Inner.RequestNo 
                          AND (EnquiryForID = EF_Inner.ID OR EnquiryForItem = EF_Inner.ItemName)
                        ORDER BY OptionID DESC
                    ) EPV
                    WHERE EF_Inner.RequestNo = E.RequestNo
                      AND LTRIM(RTRIM(MEF_Inner.DepartmentName)) = @division
                ) DivValue
                WHERE Status = 'Won' AND YEAR(ExpectedOrderDate) = @year ${filterClause}
                  AND WonCustomerName IS NOT NULL AND WonCustomerName <> ''
                  ${safeQuarter ? 'AND DATEPART(QUARTER, ExpectedOrderDate) = @quarterNums' : ''}
                GROUP BY WonCustomerName
                ORDER BY value DESC
            `;
        } else {
            topCustomersQuery = `
                SELECT TOP 10 WonCustomerName as name, SUM(ISNULL(ItemValue.Total, 0)) as value
                FROM EnquiryMaster E
                OUTER APPLY (
                    SELECT SUM(ISNULL(EPV.Price, 0)) as Total
                    FROM EnquiryFor EF_Inner
                    OUTER APPLY (
                        SELECT TOP 1 Price 
                        FROM EnquiryPricingValues 
                        WHERE RequestNo = EF_Inner.RequestNo 
                          AND (EnquiryForID = EF_Inner.ID OR EnquiryForItem = EF_Inner.ItemName)
                        ORDER BY OptionID DESC
                    ) EPV
                    WHERE EF_Inner.RequestNo = E.RequestNo
                      AND EF_Inner.ParentID IS NULL
                ) ItemValue
                WHERE Status = 'Won' AND YEAR(ExpectedOrderDate) = @year ${filterClause}
                  AND WonCustomerName IS NOT NULL AND WonCustomerName <> ''
                  ${safeQuarter ? 'AND DATEPART(QUARTER, ExpectedOrderDate) = @quarterNums' : ''}
                GROUP BY WonCustomerName
                ORDER BY value DESC
            `;
        }
        const topCustomersRes = await request.query(topCustomersQuery);

        // 4. Top 10 Projects
        let topProjectsQuery = '';
        if (safeDivision && safeDivision !== 'All') {
            topProjectsQuery = `
                SELECT TOP 10 ProjectName as name, SUM(ISNULL(DivValue.Total, 0)) as value
                FROM EnquiryMaster E
                OUTER APPLY (
                    SELECT SUM(ISNULL(EPV.Price, 0)) as Total
                    FROM EnquiryFor EF_Inner
                    JOIN Master_EnquiryFor MEF_Inner ON (EF_Inner.ItemName = MEF_Inner.ItemName OR EF_Inner.ItemName LIKE '% - ' + MEF_Inner.ItemName)
                    OUTER APPLY (
                        SELECT TOP 1 Price 
                        FROM EnquiryPricingValues 
                        WHERE RequestNo = EF_Inner.RequestNo 
                          AND (EnquiryForID = EF_Inner.ID OR EnquiryForItem = EF_Inner.ItemName)
                        ORDER BY OptionID DESC
                    ) EPV
                    WHERE EF_Inner.RequestNo = E.RequestNo
                      AND LTRIM(RTRIM(MEF_Inner.DepartmentName)) = @division
                ) DivValue
                WHERE Status = 'Won' AND YEAR(ExpectedOrderDate) = @year ${filterClause}
                  AND ProjectName IS NOT NULL AND ProjectName <> ''
                  ${safeQuarter ? 'AND DATEPART(QUARTER, ExpectedOrderDate) = @quarterNums' : ''}
                GROUP BY ProjectName
                ORDER BY value DESC
            `;
        } else {
            topProjectsQuery = `
                SELECT TOP 10 ProjectName as name, SUM(ISNULL(ItemValue.Total, 0)) as value
                FROM EnquiryMaster E
                OUTER APPLY (
                    SELECT SUM(ISNULL(EPV.Price, 0)) as Total
                    FROM EnquiryFor EF_Inner
                    OUTER APPLY (
                        SELECT TOP 1 Price 
                        FROM EnquiryPricingValues 
                        WHERE RequestNo = EF_Inner.RequestNo 
                          AND (EnquiryForID = EF_Inner.ID OR EnquiryForItem = EF_Inner.ItemName)
                        ORDER BY OptionID DESC
                    ) EPV
                    WHERE EF_Inner.RequestNo = E.RequestNo
                      AND EF_Inner.ParentID IS NULL
                ) ItemValue
                WHERE Status = 'Won' AND YEAR(ExpectedOrderDate) = @year ${filterClause}
                  AND ProjectName IS NOT NULL AND ProjectName <> ''
                  ${safeQuarter ? 'AND DATEPART(QUARTER, ExpectedOrderDate) = @quarterNums' : ''}
                GROUP BY ProjectName
                ORDER BY value DESC
            `;
        }
        const topProjectsRes = await request.query(topProjectsQuery);

        // 5. Top 10 Clients (from EnquiryMaster ClientName)
        let topClientsQuery = '';
        if (safeDivision && safeDivision !== 'All') {
            topClientsQuery = `
                SELECT TOP 10 E.ClientName as name, SUM(ISNULL(DivValue.Total, 0)) as value
                FROM EnquiryMaster E
                OUTER APPLY (
                    SELECT SUM(ISNULL(EPV.Price, 0)) as Total
                    FROM EnquiryFor EF_Inner
                    JOIN Master_EnquiryFor MEF_Inner ON (EF_Inner.ItemName = MEF_Inner.ItemName OR EF_Inner.ItemName LIKE '% - ' + MEF_Inner.ItemName)
                    OUTER APPLY (
                        SELECT TOP 1 Price 
                        FROM EnquiryPricingValues 
                        WHERE RequestNo = EF_Inner.RequestNo 
                          AND (EnquiryForID = EF_Inner.ID OR EnquiryForItem = EF_Inner.ItemName)
                        ORDER BY OptionID DESC
                    ) EPV
                    WHERE EF_Inner.RequestNo = E.RequestNo
                      AND LTRIM(RTRIM(MEF_Inner.DepartmentName)) = @division
                ) DivValue
                WHERE E.Status = 'Won' AND YEAR(E.ExpectedOrderDate) = @year ${filterClause}
                  AND E.ClientName IS NOT NULL AND E.ClientName <> ''
                  ${safeQuarter ? 'AND DATEPART(QUARTER, E.ExpectedOrderDate) = @quarterNums' : ''}
                GROUP BY E.ClientName
                ORDER BY value DESC
            `;
        } else {
            topClientsQuery = `
                SELECT TOP 10 E.ClientName as name, SUM(ISNULL(ItemValue.Total, 0)) as value
                FROM EnquiryMaster E
                OUTER APPLY (
                    SELECT SUM(ISNULL(EPV.Price, 0)) as Total
                    FROM EnquiryFor EF_Inner
                    OUTER APPLY (
                        SELECT TOP 1 Price 
                        FROM EnquiryPricingValues 
                        WHERE RequestNo = EF_Inner.RequestNo 
                          AND (EnquiryForID = EF_Inner.ID OR EnquiryForItem = EF_Inner.ItemName)
                        ORDER BY OptionID DESC
                    ) EPV
                    WHERE EF_Inner.RequestNo = E.RequestNo
                      AND EF_Inner.ParentID IS NULL
                ) ItemValue
                WHERE E.Status = 'Won' AND YEAR(E.ExpectedOrderDate) = @year ${filterClause}
                  AND E.ClientName IS NOT NULL AND E.ClientName <> ''
                  ${safeQuarter ? 'AND DATEPART(QUARTER, E.ExpectedOrderDate) = @quarterNums' : ''}
                GROUP BY E.ClientName
                ORDER BY value DESC
            `;
        }
        const topClientsRes = await request.query(topClientsQuery);

        // 6. Probability Funnel (5 Stages)
        const probabilityFunnelRes = await request.query(`
            SELECT 
                ProbabilityOption as ProbabilityName,
                MAX(Probability) as ProbabilityPercentage,
                SUM(${itemValueCol}) as TotalValue,
                COUNT(*) as Count
            FROM EnquiryMaster E
            ${itemValueApply}
            WHERE YEAR(EnquiryDate) = @year ${filterClause}
              AND Status NOT IN ('Won', 'Lost')
              ${safeQuarter ? 'AND DATEPART(QUARTER, EnquiryDate) = @quarterNums' : ''}
              AND ProbabilityOption IS NOT NULL AND ProbabilityOption <> ''
            GROUP BY ProbabilityOption
            ORDER BY MAX(Probability) ASC
        `);

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

        const winLoss = {
            won: 0,
            lost: 0,
            followUp: 0,
            wonValue: 0,
            lostValue: 0,
            followUpValue: 0
        };
        console.log('[Sales Report] Win-Loss Raw Data:', winLossRes.recordset);
        winLossRes.recordset.forEach(r => {
            const s = r.Status.toLowerCase().replace('-', '');
            console.log(`[Sales Report] Processing Status: "${r.Status}" -> "${s}", Count: ${r.Count}, Value: ${r.TotalValue}`);
            if (s === 'won') { winLoss.won = r.Count; winLoss.wonValue = r.TotalValue; }
            else if (s === 'lost') { winLoss.lost = r.Count; winLoss.lostValue = r.TotalValue; }
            else if (s === 'followup') { winLoss.followUp = r.Count; winLoss.followUpValue = r.TotalValue; }
        });
        console.log('[Sales Report] Final winLoss object:', winLoss);


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
            JOIN Master_EnquiryFor mef ON (EF.ItemName = mef.ItemName OR EF.ItemName LIKE '% - ' + mef.ItemName)
            OUTER APPLY (
                 SELECT TOP 1 Price 
                 FROM EnquiryPricingValues 
                 WHERE RequestNo = EF.RequestNo 
                   AND (EnquiryForID = EF.ID OR EnquiryForItem = EF.ItemName)
                 ORDER BY OptionID DESC
            ) EPV
            WHERE YEAR(E.EnquiryDate) = @year ${filterClause} ${itemWiseWhere}
            ${safeQuarter ? 'AND DATEPART(QUARTER, E.EnquiryDate) = @quarterNums' : ''}
            GROUP BY ${itemWiseGroupBy}
        `);

        // Get Targets by ItemName (instead of just Division) to support granular breakdown logic
        const requestTarget = new sql.Request();
        requestTarget.input('year', sql.Int, year);
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
            targetQuery = `
                SELECT Division as Name, SUM(ISNULL(TargetValue, 0)) as Target
                FROM SalesTargets
                WHERE FinancialYear = @year
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
            winLoss: winLoss,
            topCustomers: topCustomersRes.recordset,
            topProjects: topProjectsRes.recordset,
            topClients: topClientsRes.recordset,
            probabilityFunnel: probabilityFunnelRes.recordset,
            itemWiseStats: itemWiseStats
        });

    } catch (err) {
        console.error('Error fetching Sales Report summary:', err);
        res.status(500).json({ error: 'Failed to fetch summary' });
    }
});


router.get('/item-wise-stats', async (req, res) => {
    try {
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

        let filterClause = '';
        if (safeDivision && safeDivision !== 'All') {
            request.input('division', sql.NVarChar, safeDivision);
            filterClause += ` AND EXISTS (SELECT 1 FROM EnquiryFor ef JOIN Master_EnquiryFor mef ON (ef.ItemName = mef.ItemName OR ef.ItemName LIKE '% - ' + mef.ItemName) WHERE ef.RequestNo = E.RequestNo AND mef.DepartmentName = @division) `;
        } else if (safeCompany && safeCompany !== 'All') {
            request.input('company', sql.NVarChar, safeCompany);
            filterClause += ` AND EXISTS (SELECT 1 FROM EnquiryFor ef JOIN Master_EnquiryFor mef ON (ef.ItemName = mef.ItemName OR ef.ItemName LIKE '% - ' + mef.ItemName) WHERE ef.RequestNo = E.RequestNo AND mef.CompanyName = @company) `;
        }

        if (safeRole && safeRole !== 'All') {
            request.input('se', sql.NVarChar, safeRole);
            filterClause += ` AND EXISTS (SELECT 1 FROM ConcernedSE cse WHERE cse.RequestNo = E.RequestNo AND cse.SEName = @se) `;
        }

        // Determine Grouping
        let itemWiseGroupBy = 'mef.DepartmentName';
        let itemWiseSelect = 'mef.DepartmentName as ItemName';
        let itemWiseWhere = '';

        if (safeRole && safeRole !== 'All') {
            itemWiseGroupBy = 'mef.ItemName';
            itemWiseSelect = 'mef.ItemName as ItemName';
        }

        if (safeDivision && safeDivision !== 'All') {
            itemWiseWhere += ` AND mef.DepartmentName = @division `;
        }

        const itemWiseRes = await request.query(`
            SELECT 
                ${itemWiseSelect},
                SUM(CASE WHEN E.Status = 'Won' THEN ISNULL(EPV.Price, 0) ELSE 0 END) as WonValue,
                SUM(CASE WHEN E.Status = 'Lost' THEN ISNULL(EPV.Price, 0) ELSE 0 END) as LostValue,
                SUM(CASE WHEN E.Status IN ('Follow-up', 'FollowUp') THEN ISNULL(EPV.Price, 0) ELSE 0 END) as FollowUpValue
            FROM EnquiryMaster E
            JOIN EnquiryFor EF ON E.RequestNo = EF.RequestNo
            JOIN Master_EnquiryFor mef ON (EF.ItemName = mef.ItemName OR EF.ItemName LIKE '% - ' + mef.ItemName)
            OUTER APPLY (
                 SELECT TOP 1 Price 
                 FROM EnquiryPricingValues 
                 WHERE RequestNo = EF.RequestNo 
                   AND (EnquiryForID = EF.ID OR EnquiryForItem = EF.ItemName)
                 ORDER BY OptionID DESC
            ) EPV
            WHERE YEAR(E.EnquiryDate) = @year ${filterClause} ${itemWiseWhere}
            ${safeQuarter ? 'AND DATEPART(QUARTER, E.EnquiryDate) = @quarterNums' : ''}
            GROUP BY ${itemWiseGroupBy}
        `);

        // Targets
        const requestTarget = new sql.Request();
        requestTarget.input('year', sql.Int, safeYear);
        if (safeQuarter) {
            requestTarget.input('quarterStr', sql.NVarChar, safeQuarter);
        }
        if (safeRole && safeRole !== 'All') requestTarget.input('se', sql.NVarChar, safeRole);

        let targetQuery = '';
        if (safeRole && safeRole !== 'All') {
            targetQuery = `
                SELECT ItemName as Name, SUM(ISNULL(TargetValue, 0)) as Target
                FROM SalesTargets
                WHERE FinancialYear = @year AND SalesEngineer = @se
                ${safeQuarter ? 'AND Quarter = @quarterStr ' : ''}
                GROUP BY ItemName
            `;
        } else {
            targetQuery = `
                SELECT Division as Name, SUM(ISNULL(TargetValue, 0)) as Target
                FROM SalesTargets
                WHERE FinancialYear = @year
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

        let filterClause = '';
        if (division && division !== 'All') {
            request.input('division', sql.NVarChar, division);
            filterClause += ` AND EXISTS (SELECT 1 FROM EnquiryFor ef JOIN Master_EnquiryFor mef ON (ef.ItemName = mef.ItemName OR ef.ItemName LIKE '% - ' + mef.ItemName) WHERE ef.RequestNo = E.RequestNo AND mef.DepartmentName = @division) `;
        } else if (company && company !== 'All') {
            request.input('company', sql.NVarChar, company);
            filterClause += ` AND EXISTS (SELECT 1 FROM EnquiryFor ef JOIN Master_EnquiryFor mef ON (ef.ItemName = mef.ItemName OR ef.ItemName LIKE '% - ' + mef.ItemName) WHERE ef.RequestNo = E.RequestNo AND mef.CompanyName = @company) `;
        }

        if (role && role !== 'All') {
            request.input('se', sql.NVarChar, role);
            filterClause += ` AND EXISTS (SELECT 1 FROM ConcernedSE cse WHERE cse.RequestNo = E.RequestNo AND cse.SEName = @se) `;
        }

        // 1. Fetch Enquiries
        const enquiriesRes = await request.query(`
            SELECT 
                E.RequestNo, 
                E.ProjectName, 
                E.CustomerName, 
                ISNULL(TRY_CAST(REPLACE(REPLACE(E.CustomerPreferredPrice, 'BD', ''), ',', '') AS DECIMAL(18,2)), 0) as TotalPrice,
                Q.QuoteRef,
                Q.QuoteDate
            FROM EnquiryMaster E
            OUTER APPLY (
                SELECT TOP 1 QuoteNumber as QuoteRef, QuoteDate 
                FROM EnquiryQuotes QM 
                WHERE QM.RequestNo = E.RequestNo
                ORDER BY QuoteDate DESC
            ) Q
            WHERE YEAR(E.EnquiryDate) = @year 
              ${safeQuarter ? 'AND DATEPART(QUARTER, E.EnquiryDate) = @quarterNum' : ''}
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
                    WHERE (EF.ItemName = mef.ItemName OR EF.ItemName LIKE '% - ' + mef.ItemName)
                    AND mef.DepartmentName = @div
                )
            `;
        }

        const jobsRes = await jobsRequest.query(`
            SELECT 
                EF.RequestNo, EF.ID, EF.ParentID, EF.ItemName,
                ISNULL(EPV.Price, 0) as NetPrice
            FROM EnquiryFor EF
            OUTER APPLY (
                SELECT TOP 1 Price 
                FROM EnquiryPricingValues 
                WHERE RequestNo = EF.RequestNo 
                  AND (EnquiryForID = EF.ID OR EnquiryForItem = EF.ItemName)
                ORDER BY OptionID DESC
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

        let filterClause = '';
        if (safeDivision && safeDivision !== 'All') {
            request.input('division', sql.NVarChar, safeDivision);
            filterClause += ` AND EXISTS (SELECT 1 FROM EnquiryFor ef JOIN Master_EnquiryFor mef ON (ef.ItemName = mef.ItemName OR ef.ItemName LIKE '% - ' + mef.ItemName) WHERE ef.RequestNo = E.RequestNo AND mef.DepartmentName = @division) `;
        } else if (safeCompany && safeCompany !== 'All') {
            request.input('company', sql.NVarChar, safeCompany);
            filterClause += ` AND EXISTS (SELECT 1 FROM EnquiryFor ef JOIN Master_EnquiryFor mef ON (ef.ItemName = mef.ItemName OR ef.ItemName LIKE '% - ' + mef.ItemName) WHERE ef.RequestNo = E.RequestNo AND mef.CompanyName = @company) `;
        }

        if (safeRole && safeRole !== 'All') {
            request.input('se', sql.NVarChar, safeRole);
            filterClause += ` AND EXISTS (SELECT 1 FROM ConcernedSE cse WHERE cse.RequestNo = E.RequestNo AND cse.SEName = @se) `;
        }

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
                ORDER BY QuoteDate DESC
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
            // 'Won' -> Status 'Won', Year(EnquiryDate) = @year (Note: Summary uses EnquiryDate for WinLoss, ExpectedOrderDate for Quarterly. Sticking to Summary logic)
            // Wait, Win-Loss loop in Summary uses YEAR(EnquiryDate).
            baseQuery += ` AND YEAR(E.EnquiryDate) = @year ${filterClause} ${safeQuarter ? 'AND DATEPART(QUARTER, E.EnquiryDate) = @quarterNum' : ''} `;
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
                AND YEAR(E.EnquiryDate) = @year ${filterClause}
                ${safeQuarter ? 'AND DATEPART(QUARTER, E.EnquiryDate) = @quarterNum' : ''}
                AND EXISTS (
                    SELECT 1 FROM EnquiryFor EF
                    JOIN Master_EnquiryFor mef ON (EF.ItemName = mef.ItemName OR EF.ItemName LIKE '% - ' + mef.ItemName)
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
                    WHERE (EF.ItemName = mef.ItemName OR EF.ItemName LIKE '% - ' + mef.ItemName)
                    AND mef.DepartmentName = @div
                )
            `;
        }

        const jobsRes = await jobsRequest.query(`
            SELECT 
                EF.RequestNo, EF.ID, EF.ParentID, EF.ItemName,
                ISNULL(EPV.Price, 0) as NetPrice
            FROM EnquiryFor EF
            OUTER APPLY (
                SELECT TOP 1 Price 
                FROM EnquiryPricingValues 
                WHERE RequestNo = EF.RequestNo 
                  AND (EnquiryForID = EF.ID OR EnquiryForItem = EF.ItemName)
                ORDER BY OptionID DESC
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



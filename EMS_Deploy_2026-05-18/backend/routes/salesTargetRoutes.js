const express = require('express');
const router = express.Router();
const { sql } = require('../dbConfig');

// One-time migration flag
let gpColumnMigrated = false;
async function ensureGPColumn() {
    if (gpColumnMigrated) return;
    try {
        await new sql.Request().query(`
            IF NOT EXISTS (
                SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_NAME = 'SalesTargets' AND COLUMN_NAME = 'GrossProfitTarget'
            )
            BEGIN
                ALTER TABLE SalesTargets ADD GrossProfitTarget DECIMAL(18, 2) NULL DEFAULT 0;
            END
        `);
        gpColumnMigrated = true;
        console.log('[SalesTargets] GrossProfitTarget column ready.');
    } catch (e) {
        console.warn('[SalesTargets] Migration warning:', e.message);
    }
}

/** Materialized division/year totals for Sales Target "committed" history UI. */
let commitTargetTableReady = false;
async function ensureCommitTargetTable() {
    if (commitTargetTableReady) return;
    try {
        await new sql.Request().query(`
            IF NOT EXISTS (
                SELECT 1 FROM sys.objects
                WHERE object_id = OBJECT_ID(N'[dbo].[commit_Target]') AND type IN (N'U')
            )
            BEGIN
                CREATE TABLE [dbo].[commit_Target] (
                    [ID] INT IDENTITY(1, 1) NOT NULL,
                    [Year] INT NOT NULL,
                    [Division] NVARCHAR(300) NOT NULL,
                    [Revenue] DECIMAL(18, 2) NOT NULL CONSTRAINT [DF_commit_Target_Revenue] DEFAULT ((0)),
                    [GpValue] DECIMAL(18, 2) NOT NULL CONSTRAINT [DF_commit_Target_GpValue] DEFAULT ((0)),
                    [GpPct] DECIMAL(18, 4) NOT NULL CONSTRAINT [DF_commit_Target_GpPct] DEFAULT ((0)),
                    CONSTRAINT [PK_commit_Target] PRIMARY KEY CLUSTERED ([ID] ASC),
                    CONSTRAINT [UQ_commit_Target_Year_Division] UNIQUE ([Year], [Division])
                );
            END
        `);
        commitTargetTableReady = true;
        console.log('[SalesTargets] commit_Target table ready.');
    } catch (e) {
        console.warn('[SalesTargets] commit_Target migration:', e.message);
    }
}

/**
 * Rebuild one division/year row in commit_Target from SalesTargets (all SEs, all items/quarters).
 */
async function syncCommitTargetForDivisionYear(divisionTrim, financialYear) {
    await ensureGPColumn();
    await ensureCommitTargetTable();
    const request = new sql.Request();
    request.input('div', sql.NVarChar(divisionTrim));
    request.input('y', sql.Int, financialYear);
    await request.query(`
        DECLARE @rev DECIMAL(18, 2), @gpv DECIMAL(18, 2), @pct DECIMAL(18, 4);
        SELECT
            @rev = ISNULL(SUM(CAST(ISNULL(TargetValue, 0) AS DECIMAL(18, 2))), 0),
            @gpv = ISNULL(
                SUM(
                    CAST(ISNULL(TargetValue, 0) AS DECIMAL(18, 2))
                    * CAST(ISNULL(GrossProfitTarget, 0) AS DECIMAL(18, 4)) / 100.0
                ),
                0
            )
        FROM SalesTargets
        WHERE FinancialYear = @y AND LTRIM(RTRIM(Division)) = LTRIM(RTRIM(@div));
        SET @pct = CASE
            WHEN @rev > 0 THEN CAST(@gpv / NULLIF(@rev, 0) * 100.0 AS DECIMAL(18, 4))
            ELSE 0
        END;
        DELETE FROM [dbo].[commit_Target]
        WHERE LTRIM(RTRIM([Division])) = LTRIM(RTRIM(@div)) AND [Year] = @y;
        INSERT INTO [dbo].[commit_Target] ([Year], [Division], [Revenue], [GpValue], [GpPct])
        VALUES (@y, LTRIM(RTRIM(@div)), @rev, @gpv, @pct);
    `);
}

// 1. Check Manager Access & Get Managed Divisions
router.get('/manager-access', async (req, res) => {
    try {
        const { email } = req.query;
        if (!email) return res.status(400).json({ error: 'Email required' });

        const searchEmail = email.trim();
        console.log(`[SalesTarget] Checking manager access for: "${searchEmail}"`);

        const request = new sql.Request();
        request.input('email', sql.NVarChar, `%${searchEmail}%`);

        const result = await request.query(`
            SELECT DISTINCT DepartmentName 
            FROM Master_EnquiryFor 
            WHERE CCMailIds LIKE @email
        `);
        console.log(`[SalesTarget] Managed Divisions found:`, result.recordset);
        // Note: The LIKE query above is simplified. Ideally we split and check, but for now this works for checking existence.

        // Also allow Admin to see all
        let divisions = [];
        if (result.recordset.length > 0) {
            divisions = result.recordset.map(r => r.DepartmentName).filter(d => d);
        }

        // Check if Admin (from Master_ConcernedSE)
        const adminCheck = await new sql.Request().query(`SELECT Roles FROM Master_ConcernedSE WHERE EmailId = '${searchEmail}'`);
        const isAdmin = adminCheck.recordset.length > 0 && adminCheck.recordset[0].Roles?.toLowerCase().includes('admin');

        if (isAdmin) {
            const allDivs = await new sql.Request().query('SELECT DISTINCT DepartmentName FROM Master_EnquiryFor WHERE DepartmentName IS NOT NULL');
            divisions = allDivs.recordset.map(r => r.DepartmentName);
        }

        res.json({
            isManager: divisions.length > 0 || isAdmin,
            divisions: divisions.sort()
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server Error' });
    }
});

// 2. Get Sales Engineers for a Division
router.get('/engineers', async (req, res) => {
    try {
        const { division } = req.query;
        if (!division) return res.status(400).json({ error: 'Division required' });

        const request = new sql.Request();
        request.input('division', sql.NVarChar, division);

        // Fetch SEs whose Department matches
        const result = await request.query(`
            SELECT FullName, EmailId 
            FROM Master_ConcernedSE 
            WHERE Department = @division AND Status = 'Active'
            ORDER BY FullName ASC
        `);

        res.json(result.recordset);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server Error' });
    }
});

// 3. Get Items for Division
router.get('/items', async (req, res) => {
    try {
        const { division } = req.query;
        if (!division) return res.status(400).json({ error: 'Division required' });

        const request = new sql.Request();
        request.input('division', sql.NVarChar, division);

        const result = await request.query(`
            SELECT DISTINCT ItemName 
            FROM Master_EnquiryFor 
            WHERE DepartmentName = @division AND ItemName IS NOT NULL
            ORDER BY ItemName ASC
        `);

        res.json(result.recordset);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server Error' });
    }
});

// 4. Get Existing Targets
router.get('/targets', async (req, res) => {
    try {
        await ensureGPColumn(); // Lazy migration: add GrossProfitTarget column if missing
        const { year, division, engineer } = req.query;
        const request = new sql.Request();
        request.input('year', sql.Int, year);
        request.input('division', sql.NVarChar, division);
        request.input('engineer', sql.NVarChar, engineer || '');

        const engineerTrim = (engineer || '').trim();
        const isAllEngineers = engineerTrim.toLowerCase() === 'all';

        let result;
        if (isAllEngineers) {
            /** Sum revenue per item/quarter; arithmetic mean of GP % across SE rows (same item/quarter). */
            result = await request.query(`
                SELECT
                    ItemName,
                    Quarter,
                    SUM(ISNULL(TargetValue, 0)) AS TargetValue,
                    CAST(AVG(CAST(ISNULL(GrossProfitTarget, 0) AS FLOAT)) AS DECIMAL(18, 4)) AS GrossProfitTarget
                FROM SalesTargets
                WHERE FinancialYear = @year AND Division = @division
                GROUP BY ItemName, Quarter
            `);
        } else {
            result = await request.query(`
                SELECT ItemName, Quarter, TargetValue, ISNULL(GrossProfitTarget, 0) AS GrossProfitTarget
                FROM SalesTargets
                WHERE FinancialYear = @year AND Division = @division AND SalesEngineer = @engineer
            `);
        }

        res.json(result.recordset);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server Error' });
    }
});

// 4b. Last 3 financial years — read from commit_Target (optional sync from SalesTargets)
router.get('/year-history', async (req, res) => {
    try {
        const { division, anchorYear, sync } = req.query;
        const divTrim = (division || '').trim();
        if (!divTrim) return res.status(400).json({ error: 'Division required' });

        const y0 = parseInt(String(anchorYear || '').trim(), 10);
        if (!Number.isFinite(y0)) {
            return res.status(400).json({ error: 'anchorYear must be a number' });
        }
        const y1 = y0 - 1;
        const y2 = y0 - 2;
        const years = [y0, y1, y2];

        try {
            await ensureCommitTargetTable();
        } catch (ensureErr) {
            console.error('[SalesTargets] commit_Target ensure failed:', ensureErr);
            return res.status(500).json({ error: ensureErr.message || 'commit_Target table unavailable' });
        }

        const doSync = String(sync || '1').trim() !== '0' && String(sync || '').toLowerCase() !== 'false';
        if (doSync) {
            for (const yr of years) {
                try {
                    await syncCommitTargetForDivisionYear(divTrim, yr);
                } catch (syncErr) {
                    console.warn(`[SalesTargets] commit_Target sync ${divTrim} ${yr}:`, syncErr.message);
                }
            }
        }

        const readReq = new sql.Request();
        readReq.input('div', sql.NVarChar, divTrim);
        readReq.input('y0', sql.Int, y0);
        readReq.input('y1', sql.Int, y1);
        readReq.input('y2', sql.Int, y2);
        const result = await readReq.query(`
            SELECT
                [ID] AS id,
                [Year] AS finYear,
                [Division] AS divName,
                CAST([Revenue] AS DECIMAL(18, 2)) AS revenue,
                CAST([GpValue] AS DECIMAL(18, 2)) AS gpValue,
                CAST([GpPct] AS DECIMAL(18, 4)) AS gpPct
            FROM [dbo].[commit_Target]
            WHERE LTRIM(RTRIM([Division])) = LTRIM(RTRIM(@div)) AND [Year] IN (@y0, @y1, @y2)
            ORDER BY [Year] DESC
        `);

        const rowYear = (row) =>
            Number(
                row.finYear ??
                    row.FinYear ??
                    row.year ??
                    row.Year ??
                    row.YEAR
            );

        const byYear = new Map();
        for (const row of result.recordset || []) {
            const yr = rowYear(row);
            if (!Number.isFinite(yr)) continue;
            byYear.set(yr, {
                id: row.id ?? row.ID,
                year: yr,
                division: String(row.divName ?? row.DivName ?? row.division ?? divTrim),
                revenue: Number(row.revenue ?? row.Revenue) || 0,
                gpValue: Number(row.gpValue ?? row.GpValue) || 0,
                gpPct: Number(row.gpPct ?? row.GpPct) || 0,
            });
        }

        const out = years
            .map((yr) =>
                byYear.get(yr) || {
                    id: null,
                    year: yr,
                    division: divTrim,
                    revenue: 0,
                    gpValue: 0,
                    gpPct: 0,
                }
            )
            .sort((a, b) => b.year - a.year);

        res.json(out);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server Error' });
    }
});

// 5. Save Targets
router.post('/save', async (req, res) => {
    try {
        const { targets, year, division, engineer, userEmail } = req.body;
        // targets is array of { itemName, q1, q2, q3, q4 }

        if (!engineer || String(engineer).trim().toLowerCase() === 'all') {
            return res.status(400).json({ error: 'Select a specific Sales Engineer to save targets (ALL is view-only).' });
        }

        const transaction = new sql.Transaction();
        await transaction.begin();

        try {
            const request = new sql.Request(transaction);

            // Delete existing for this combination (easiest way to handle updates)
            // Or better: Upsert. But deleting all for this year/div/se/item is safe if we re-insert.
            // Let's delete for specific SE/Year/Division first to clear old data then insert new.
            // CAUTION: This deletes all items for that SE in that year. Make sure we are saving ALL items or just specific ones?
            // User UI will likely show all items.
            // Efficient approach: MERGE or Delete/Insert. 

            request.input('year', sql.Int, year);
            request.input('division', sql.NVarChar, division);
            request.input('engineer', sql.NVarChar, engineer);
            request.input('createdBy', sql.NVarChar, userEmail);

            // Deleting existing targets for this specific SE and Year in this Division
            // Only strictly if we are saving the 'whole sheet' for them.
            await request.query(`
                DELETE FROM SalesTargets 
                WHERE FinancialYear = @year 
                  AND Division = @division 
                  AND SalesEngineer = @engineer
            `);

            for (const t of targets) {
                // t = { itemName, Q1: 100, Q2: 200... }
                const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];
                for (const q of quarters) {
                    const val = t[q] ? parseFloat(t[q]) : 0;
                    if (val >= 0) { // allow 0
                        const gpVal = t[`${q}_GP`] ? parseFloat(t[`${q}_GP`]) : 0;
                        const insRequest = new sql.Request(transaction);
                        insRequest.input('year', sql.Int, year);
                        insRequest.input('div', sql.NVarChar, division);
                        insRequest.input('se', sql.NVarChar, engineer);
                        insRequest.input('item', sql.NVarChar, t.itemName);
                        insRequest.input('q', sql.NVarChar, q);
                        insRequest.input('val', sql.Decimal(18, 2), val);
                        insRequest.input('gpVal', sql.Decimal(18, 2), gpVal);
                        insRequest.input('by', sql.NVarChar, userEmail);

                        await insRequest.query(`
                            INSERT INTO SalesTargets (FinancialYear, Quarter, Division, ItemName, SalesEngineer, TargetValue, GrossProfitTarget, CreatedBy)
                            VALUES (@year, @q, @div, @item, @se, @val, @gpVal, @by)
                         `);
                    }
                }
            }

            await transaction.commit();
            try {
                const yNum = parseInt(String(year), 10);
                const divTrim = String(division || '').trim();
                if (Number.isFinite(yNum) && divTrim) {
                    await syncCommitTargetForDivisionYear(divTrim, yNum);
                }
            } catch (syncErr) {
                console.warn('[SalesTargets] commit_Target sync after save:', syncErr.message);
            }
            res.json({ message: 'Targets saved successfully' });
        } catch (err) {
            await transaction.rollback();
            throw err;
        }

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server Error' });
    }
});

module.exports = router;

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
        request.input('engineer', sql.NVarChar, engineer);

        const result = await request.query(`
            SELECT ItemName, Quarter, TargetValue, ISNULL(GrossProfitTarget, 0) AS GrossProfitTarget
            FROM SalesTargets 
            WHERE FinancialYear = @year AND Division = @division AND SalesEngineer = @engineer
        `);

        res.json(result.recordset);
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

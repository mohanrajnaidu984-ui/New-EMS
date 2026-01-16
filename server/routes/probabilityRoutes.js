
const ecommerce = require('express');
const router = ecommerce.Router();
const { sql } = require('../dbConfig');

// --- Helper: Format RequestNo for SQL LIKE if needed, or simple exact match ---

// GET /api/probability/list
// Supports ?mode=[Pending|Won|Lost|OnHold|Cancelled|FollowUp|Retendered]
// &fromDate=... &toDate=... &probability=...
router.get('/list', async (req, res) => {
    try {
        const { mode, fromDate, toDate, probability, userEmail } = req.query;
        let query = `
            SELECT
                TRIM(E.RequestNo) as RequestNo, E.ProjectName, E.EnquiryDate, E.Status,
                E.Probability, E.ProbabilityOption, E.ExpectedOrderDate, E.ProbabilityRemarks,
                E.WonOrderValue, E.WonJobNo, E.WonCustomerName, E.CustomerPreferredPrice, E.WonQuoteRef, E.WonOption,
                (SELECT TOP 1 QuoteDate FROM EnquiryQuotes Q WHERE TRIM(Q.RequestNo) = TRIM(E.RequestNo) ORDER BY QuoteDate DESC) as LastQuoteDate,
                (
                    SELECT 
                        CASE 
                            WHEN EXISTS (
                                SELECT 1 FROM EnquiryPricingValues pv
                                JOIN EnquiryPricingOptions po ON pv.OptionID = po.ID
                                WHERE TRIM(pv.RequestNo) = TRIM(E.RequestNo)
                                AND (UPPER(TRIM(po.OptionName)) LIKE '%OPTION%' OR UPPER(TRIM(po.OptionName)) LIKE '%OPTIONAL%')
                                AND ISNULL(pv.Price, 0) <> 0
                            ) THEN 'Refer quote'
                            ELSE CAST(ISNULL((
                                SELECT SUM(MaxItemPrice)
                                FROM (
                                    SELECT MAX(pv.Price) as MaxItemPrice
                                    FROM EnquiryPricingValues pv
                                    JOIN EnquiryPricingOptions po ON pv.OptionID = po.ID
                                    WHERE TRIM(pv.RequestNo) = TRIM(E.RequestNo)
                                    AND UPPER(TRIM(po.OptionName)) NOT LIKE '%OPTION%' 
                                    AND UPPER(TRIM(po.OptionName)) NOT LIKE '%OPTIONAL%'
                                    GROUP BY pv.EnquiryForItem
                                ) t
                            ), 0) AS NVARCHAR(50))
                        END
                ) as TotalQuotedValue,
                (
                    SELECT 
                        CASE 
                            WHEN EXISTS (
                                SELECT 1 FROM EnquiryPricingValues pv
                                JOIN EnquiryPricingOptions po ON pv.OptionID = po.ID
                                WHERE TRIM(pv.RequestNo) = TRIM(E.RequestNo)
                                AND (UPPER(TRIM(po.OptionName)) LIKE '%OPTION%' OR UPPER(TRIM(po.OptionName)) LIKE '%OPTIONAL%')
                                AND ISNULL(pv.Price, 0) <> 0
                            ) THEN 'Refer quote'
                            ELSE CAST(ISNULL((
                                SELECT SUM(MaxItemPrice)
                                FROM (
                                    SELECT MAX(pv.Price) as MaxItemPrice
                                    FROM EnquiryPricingValues pv
                                    JOIN EnquiryPricingOptions po ON pv.OptionID = po.ID
                                    JOIN Master_EnquiryFor mef ON pv.EnquiryForItem = mef.ItemName
                                    WHERE TRIM(pv.RequestNo) = TRIM(E.RequestNo)
                                    AND UPPER(TRIM(po.OptionName)) NOT LIKE '%OPTION%' 
                                    AND UPPER(TRIM(po.OptionName)) NOT LIKE '%OPTIONAL%'
                                    AND (
                                        ',' + REPLACE(REPLACE(ISNULL(mef.CommonMailIds, ''), ' ', ''), ';', ',') + ',' LIKE '%,' + ISNULL(@userEmail, '') + ',%'
                                        OR ',' + REPLACE(REPLACE(ISNULL(mef.CCMailIds, ''), ' ', ''), ';', ',') + ',' LIKE '%,' + ISNULL(@userEmail, '') + ',%'
                                    )
                                    GROUP BY pv.EnquiryForItem
                                ) t
                            ), 0) AS NVARCHAR(50))
                        END
                ) as NetQuotedValue,
                (
                    SELECT STRING_AGG(CONCAT(CAST(Q.QuoteNumber AS NVARCHAR(MAX)), '|', CAST(ISNULL(Q.ToName, 'N/A') AS NVARCHAR(MAX))), ',') WITHIN GROUP (ORDER BY TRIM(Q.ToName) ASC, Q.RevisionNo DESC)
                    FROM EnquiryQuotes Q 
                    WHERE TRIM(Q.RequestNo) = TRIM(E.RequestNo)
                ) as FinalQuoteRefsTarget,
                (
                    SELECT po.OptionName as name, 
                           (SELECT SUM(pv.Price) FROM EnquiryPricingValues pv WHERE pv.OptionID = po.ID AND pv.CustomerName = po.CustomerName) as price
                    FROM EnquiryPricingOptions po
                    JOIN EnquiryQuotes Q ON Q.QuoteNumber = E.WonQuoteRef
                    WHERE TRIM(po.RequestNo) = TRIM(E.RequestNo)
                    AND po.CustomerName = Q.ToName
                    AND (po.OptionName LIKE '%Option%' OR po.OptionName LIKE '%Optional%')
                    FOR JSON PATH
                ) as QuoteOptions
            FROM EnquiryMaster E
            WHERE 1 = 1
    `;

        // Filter Logic
        if (mode === 'Pending') {
            // Logic: Include items that are NOT in final states OR are in 'Won'/'Lost'/'Follow-up' but missing probability details.
            // AND ensure at least one quote was submitted 5 days ago or more.
            query += `
                AND (
                    E.Status NOT IN('Won', 'Lost', 'Cancelled', 'OnHold', 'Follow-up')
                    OR (E.Status IN('Won', 'Lost', 'Follow-up') AND (E.ProbabilityOption IS NULL OR E.ProbabilityOption = ''))
                )
                AND EXISTS(
                    SELECT 1 FROM EnquiryQuotes Q 
                    WHERE Q.RequestNo = E.RequestNo 
                    AND DATEDIFF(day, Q.QuoteDate, GETDATE()) >= 5
                )
            `;
        } else if (mode === 'Won') {
            query += ` AND E.Status = 'Won'`;
        } else if (mode === 'Lost') {
            query += ` AND E.Status = 'Lost'`;
        } else if (mode === 'OnHold') {
            query += ` AND E.Status = 'OnHold'`; // Assuming 'OnHold' is a valid status string or mapped
        } else if (mode === 'Cancelled') {
            query += ` AND E.Status = 'Cancelled'`; // Assuming 'Cancelled' is mapped
        } else if (mode === 'FollowUp') {
            query += ` AND E.Status = 'Follow-up'`;
        } else if (mode === 'Retendered') {
            // Assuming 'Retendered' is tracked via RetenderDate or specific Status if exists?
            // Since user asked for "Retendered details", let's assume it's a status or we check RetenderDate existence
            // For now, let's assume it's a Status 'Retendered' based on common patterns, or fallback to date check logic if needed.
            // Given schema has RetenderDate, maybe status is 'Retendered'. Let's stick to Status for consistency first.
            query += ` AND(E.Status = 'Retendered' OR E.RetenderDate IS NOT NULL)`;
        }

        // Date Range Filters (Applies to all except maybe Pending if strict)
        if (fromDate) {
            // Field to filter depends on mode. 
            // Won -> WonDate (we don't have explicit WonDate, maybe use UpdatedAt or specific date column if exists? 
            // We added RetenderDate, OnHoldDate, CancelDate. 
            // For Won/Lost, normally we check CreatedAt or a StatusChanged Date. 
            // The schema update added ExpectedOrderDate, but for "Won details from date", usually means WHEN it was won.
            // Let's use EnquiryDate as fallback or the specific date fields we added if they align.
            // Actually, for "Won", usually report based on 'ExpectedOrderDate' (Order Date) or simply when it was marked won.
            // Let's assume generic date filter applies to EnquiryDate OR the specific event date if obvious.

            // REFINEMENT based on User Request "Won details with from date... Lost details from date..."
            // Let's filter on the relevant date column for the mode.

            let dateCol = 'E.EnquiryDate';
            if (mode === 'Won') dateCol = 'E.ExpectedOrderDate'; // Or a new WonDate? let's use ExpectedOrderDate as proxy for "Order Date"
            if (mode === 'Retendered') dateCol = 'E.RetenderDate';
            if (mode === 'OnHold') dateCol = 'E.OnHoldDate';
            if (mode === 'Cancelled') dateCol = 'E.CancelDate';

            query += ` AND ${dateCol} >= @fromDate`;
        }
        if (toDate) {
            let dateCol = 'E.EnquiryDate';
            if (mode === 'Won') dateCol = 'E.ExpectedOrderDate';
            if (mode === 'Retendered') dateCol = 'E.RetenderDate';
            if (mode === 'OnHold') dateCol = 'E.OnHoldDate';
            if (mode === 'Cancelled') dateCol = 'E.CancelDate';

            query += ` AND ${dateCol} <= @toDate`;
        }

        // Probability Filter (for FollowUp mainly)
        if (probability && mode === 'FollowUp') {
            // probability is string like "High Chance (90%)"
            // Database stores 'Probability' int and 'ProbabilityOption' string.
            // Filter by Option string for exact match
            query += ` AND E.ProbabilityOption = @probability`;
        }

        const request = new sql.Request();
        if (fromDate) request.input('fromDate', sql.Date, fromDate);
        if (toDate) request.input('toDate', sql.Date, toDate);
        if (probability) request.input('probability', sql.VarChar, probability);
        request.input('userEmail', sql.NVarChar, userEmail || '');

        const result = await request.query(query);
        res.json(result.recordset);

    } catch (err) {
        console.error('API Error /list:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/probability/:requestNo - Get full details
router.get('/:requestNo', async (req, res) => {
    try {
        const { requestNo } = req.params;
        const request = new sql.Request();
        request.input('reqNo', sql.NVarChar, requestNo);

        const q = `
SELECT * FROM EnquiryMaster WHERE TRIM(RequestNo) = TRIM(@reqNo)
    `;
        const result = await request.query(q);
        if (result.recordset.length > 0) {
            res.json(result.recordset[0]);
        } else {
            res.status(404).json({ message: 'Enquiry not found' });
        }
    } catch (err) {
        console.error('API Error /:requestNo:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/probability/update
router.post('/update', async (req, res) => {
    try {
        const {
            enquiryNo,
            status, // The Status string (e.g. 'Won', 'Lost', 'Follow-up')

            // Probability Fields
            probabilityOption, probability,
            aacQuotedContractor, customerPreferredPrice,
            preferredPrices, // Object { option1, option2, option3 }
            expectedDate, cancellationDate, onHoldDate, retenderDate,
            remarks,

            // Won Details
            wonDetails, // { orderValue, jobNo, customerName, contactName, contactNo, wonQuoteRef }

            // Lost Details
            lostDetails // { customer, reason, competitorPrice }
        } = req.body;

        const request = new sql.Request();
        request.input('reqNo', sql.NVarChar, enquiryNo);

        request.input('Status', sql.NVarChar, status);
        request.input('ProbabilityOption', sql.VarChar, probabilityOption);
        request.input('Probability', sql.Int, probability);
        request.input('AACQuotedContractor', sql.VarChar, aacQuotedContractor);
        request.input('CustomerPreferredPrice', sql.VarChar, customerPreferredPrice);
        request.input('PreferredPriceOption1', sql.VarChar, preferredPrices?.option1 || '');
        request.input('PreferredPriceOption2', sql.VarChar, preferredPrices?.option2 || '');
        request.input('PreferredPriceOption3', sql.VarChar, preferredPrices?.option3 || '');
        request.input('ExpectedOrderDate', sql.DateTime, expectedDate ? new Date(expectedDate) : null);
        request.input('ProbabilityRemarks', sql.NVarChar, remarks);

        // Date fields for specific statuses
        request.input('RetenderDate', sql.DateTime, retenderDate ? new Date(retenderDate) : null);
        request.input('OnHoldDate', sql.DateTime, onHoldDate ? new Date(onHoldDate) : null);
        request.input('CancelDate', sql.DateTime, cancellationDate ? new Date(cancellationDate) : null);

        // Won Details
        request.input('WonOrderValue', sql.VarChar, wonDetails?.orderValue || null);
        request.input('WonJobNo', sql.VarChar, wonDetails?.jobNo || null);
        request.input('WonCustomerName', sql.VarChar, wonDetails?.customerName || null);
        request.input('WonContactName', sql.VarChar, wonDetails?.contactName || null);
        request.input('WonContactNo', sql.VarChar, wonDetails?.contactNo || null);
        request.input('WonQuoteRef', sql.NVarChar, wonDetails?.wonQuoteRef || null);
        request.input('WonOption', sql.NVarChar, wonDetails?.wonOption || null);

        // Lost Details
        request.input('LostCompetitor', sql.VarChar, lostDetails?.customer || null); // Note: variable name mismatch in UI 'customer' vs DB 'LostCompetitor' -> Assuming 'customer' in UI means Competitor Name
        request.input('LostReason', sql.VarChar, lostDetails?.reason || null);
        request.input('LostCompetitorPrice', sql.VarChar, lostDetails?.competitorPrice || null);

        const updateQuery = `
            UPDATE EnquiryMaster
SET
Status = @Status,
    ProbabilityOption = @ProbabilityOption,
    Probability = @Probability,
    AACQuotedContractor = @AACQuotedContractor,
    CustomerPreferredPrice = @CustomerPreferredPrice,
    PreferredPriceOption1 = @PreferredPriceOption1,
    PreferredPriceOption2 = @PreferredPriceOption2,
    PreferredPriceOption3 = @PreferredPriceOption3,
    ExpectedOrderDate = @ExpectedOrderDate,
    ProbabilityRemarks = @ProbabilityRemarks,

    WonOrderValue = @WonOrderValue,
    WonJobNo = @WonJobNo,
    WonCustomerName = @WonCustomerName,
    WonContactName = @WonContactName,
                WonContactNo = @WonContactNo,
                WonQuoteRef = @WonQuoteRef,
                WonOption = @WonOption,
                LostCompetitor = @LostCompetitor,
    LostReason = @LostReason,
    LostCompetitorPrice = @LostCompetitorPrice,

    RetenderDate = @RetenderDate,
    OnHoldDate = @OnHoldDate,
    CancelDate = @CancelDate
            WHERE TRIM(RequestNo) = TRIM(@reqNo)
    `;

        await request.query(updateQuery);
        res.json({ success: true, message: 'Probability updated successfully' });

    } catch (err) {
        console.error('API Error /update:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/probability/quote-details/:quoteNumber - Get details for auto-fill in Won status
router.get('/quote-details/:quoteNumber', async (req, res) => {
    try {
        const { quoteNumber } = req.params;
        const decodedQuoteNumber = decodeURIComponent(quoteNumber);

        const quoteRes = await sql.query`
            SELECT RequestNo, ToName, TotalAmount 
            FROM EnquiryQuotes 
            WHERE QuoteNumber = ${decodedQuoteNumber}
        `;

        if (quoteRes.recordset.length === 0) {
            return res.status(404).json({ error: 'Quote not found' });
        }

        const quote = quoteRes.recordset[0];

        // Fetch optional prices
        const optionsRes = await sql.query`
            SELECT po.ID, po.OptionName, 
                   (SELECT SUM(pv.Price) 
                    FROM EnquiryPricingValues pv 
                    WHERE pv.OptionID = po.ID 
                    AND pv.CustomerName = po.CustomerName) as TotalPrice
            FROM EnquiryPricingOptions po
            WHERE po.RequestNo = ${quote.RequestNo}
            AND po.CustomerName = ${quote.ToName}
            AND (po.OptionName LIKE '%Option%' OR po.OptionName LIKE '%Optional%')
        `;

        res.json({
            customerName: quote.ToName,
            totalAmount: quote.TotalAmount,
            options: optionsRes.recordset.map(o => ({
                name: o.OptionName,
                price: o.TotalPrice
            }))
        });

    } catch (err) {
        console.error('Error fetching quote won details:', err);
        res.status(500).json({ error: 'Failed to fetch quote details' });
    }
});

module.exports = router;

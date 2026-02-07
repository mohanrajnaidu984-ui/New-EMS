
const express = require('express');
const router = express.Router();
const { sql } = require('../dbConfig');

// --- Helper: Format RequestNo for SQL LIKE if needed, or simple exact match ---

// GET /api/probability/list
// Supports ?mode=[Pending|Won|Lost|OnHold|Cancelled|FollowUp|Retendered]
// &fromDate=... &toDate=... &probability=...
router.get('/list', async (req, res) => {
    try {
        const { mode, fromDate, toDate, probability, userEmail } = req.query;
        console.log(`[Probability API V5] Fetching list. Mode: ${mode}, User: ${userEmail}`);
        let query = `
            SELECT
                LTRIM(RTRIM(E.RequestNo)) as RequestNo, E.ProjectName, E.EnquiryDate, E.Status,
                E.Probability, E.ProbabilityOption, E.ExpectedOrderDate, E.ProbabilityRemarks,
                E.WonOrderValue, E.WonJobNo, E.WonCustomerName, E.CustomerPreferredPrice, E.WonQuoteRef, E.WonOption,
                E.LostCompetitor, E.LostReason, E.LostCompetitorPrice, E.LostDate,
                (SELECT TOP 1 QuoteDate FROM EnquiryQuotes Q WHERE LTRIM(RTRIM(Q.RequestNo)) = LTRIM(RTRIM(E.RequestNo)) ORDER BY QuoteDate DESC) as LastQuoteDate,
                (
                    SELECT 
                        CASE 
                            WHEN EXISTS (
                                SELECT 1 FROM EnquiryPricingValues pv
                                JOIN EnquiryPricingOptions po ON pv.OptionID = po.ID
                                WHERE LTRIM(RTRIM(pv.RequestNo)) = LTRIM(RTRIM(E.RequestNo))
                                AND (UPPER(LTRIM(RTRIM(po.OptionName))) LIKE '%OPTION%' OR UPPER(LTRIM(RTRIM(po.OptionName))) LIKE '%OPTIONAL%')
                                AND ISNULL(pv.Price, 0) <> 0
                            ) THEN 'Refer quote'
                            ELSE CAST(ISNULL((
                                SELECT SUM(MaxItemPrice)
                                FROM (
                                    SELECT MAX(pv.Price) as MaxItemPrice
                                    FROM EnquiryPricingValues pv
                                    JOIN EnquiryPricingOptions po ON pv.OptionID = po.ID
                                    -- Fix JOIN to handle prefixes like "L1 - "
                                    JOIN Master_EnquiryFor mef ON (pv.EnquiryForItem = mef.ItemName OR pv.EnquiryForItem LIKE '% - ' + mef.ItemName)
                                    WHERE LTRIM(RTRIM(pv.RequestNo)) = LTRIM(RTRIM(E.RequestNo))
                                    AND UPPER(LTRIM(RTRIM(po.OptionName))) NOT LIKE '%OPTION%' 
                                    AND UPPER(LTRIM(RTRIM(po.OptionName))) NOT LIKE '%OPTIONAL%'
                                    AND (
                                        -- Standard: User has access to this specific item
                                        (
                                            ',' + REPLACE(REPLACE(ISNULL(mef.CommonMailIds, ''), ' ', ''), ';', ',') + ',' LIKE '%,' + ISNULL(@userEmail, '') + ',%'
                                            OR ',' + REPLACE(REPLACE(ISNULL(mef.CCMailIds, ''), ' ', ''), ';', ',') + ',' LIKE '%,' + ISNULL(@userEmail, '') + ',%'
                                        )
                                        OR
                                        -- Hierarchy: Electrical users can see BMS totals
                                        (
                                            pv.EnquiryForItem = 'BMS' 
                                            AND EXISTS (
                                                SELECT 1 FROM Master_EnquiryFor lead 
                                                WHERE lead.ItemName = 'Electrical' 
                                                AND (
                                                    ',' + REPLACE(REPLACE(ISNULL(lead.CommonMailIds, ''), ' ', ''), ';', ',') + ',' LIKE '%,' + ISNULL(@userEmail, '') + ',%'
                                                    OR ',' + REPLACE(REPLACE(ISNULL(lead.CCMailIds, ''), ' ', ''), ';', ',') + ',' LIKE '%,' + ISNULL(@userEmail, '') + ',%'
                                                )
                                            )
                                        )
                                        OR
                                        -- GLOBAL VISIBILITY FOR CIVIL USERS (e.g. they see everything in Total)
                                        EXISTS (
                                            SELECT 1 FROM Master_EnquiryFor civil
                                            WHERE (civil.ItemName = 'Civil' OR civil.ItemName = 'Civil Project') 
                                            AND (
                                                ',' + REPLACE(REPLACE(ISNULL(civil.CommonMailIds, ''), ' ', ''), ';', ',') + ',' LIKE '%,' + ISNULL(@userEmail, '') + ',%'
                                                OR ',' + REPLACE(REPLACE(ISNULL(civil.CCMailIds, ''), ' ', ''), ';', ',') + ',' LIKE '%,' + ISNULL(@userEmail, '') + ',%'
                                            )
                                        )
                                    )
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
                                WHERE LTRIM(RTRIM(pv.RequestNo)) = LTRIM(RTRIM(E.RequestNo))
                                AND (UPPER(LTRIM(RTRIM(po.OptionName))) LIKE '%OPTION%' OR UPPER(LTRIM(RTRIM(po.OptionName))) LIKE '%OPTIONAL%')
                                AND ISNULL(pv.Price, 0) <> 0
                            ) THEN 'Refer quote'
                            ELSE CAST(ISNULL((
                                SELECT SUM(MaxItemPrice)
                                FROM (
                                    SELECT MAX(pv.Price) as MaxItemPrice
                                    FROM EnquiryPricingValues pv
                                    JOIN EnquiryPricingOptions po ON pv.OptionID = po.ID
                                    JOIN Master_EnquiryFor mef ON (pv.EnquiryForItem = mef.ItemName OR pv.EnquiryForItem LIKE '% - ' + mef.ItemName)
                                    WHERE LTRIM(RTRIM(pv.RequestNo)) = LTRIM(RTRIM(E.RequestNo))
                                    AND UPPER(LTRIM(RTRIM(po.OptionName))) NOT LIKE '%OPTION%' 
                                    AND UPPER(LTRIM(RTRIM(po.OptionName))) NOT LIKE '%OPTIONAL%'
                                    AND (
                                        -- Net Quoted: ONLY strict user affiliation
                                        ',' + REPLACE(REPLACE(ISNULL(mef.CommonMailIds, ''), ' ', ''), ';', ',') + ',' LIKE '%,' + ISNULL(@userEmail, '') + ',%'
                                        OR ',' + REPLACE(REPLACE(ISNULL(mef.CCMailIds, ''), ' ', ''), ';', ',') + ',' LIKE '%,' + ISNULL(@userEmail, '') + ',%'
                                        OR ',' + REPLACE(REPLACE(ISNULL(mef.CCMailIds, ''), ' ', ''), ';', ',') + ',' LIKE '%,' + ISNULL(@userEmail, '') + ',%'
                                    )
                                    GROUP BY pv.EnquiryForItem
                                ) t
                            ), 0) AS NVARCHAR(50))
                        END
                ) as NetQuotedValue,
                (
                    SELECT STUFF((
                        SELECT ',' + CAST(Q.QuoteNumber AS NVARCHAR(MAX)) + '|' + CAST(ISNULL(Q.ToName, 'N/A') AS NVARCHAR(MAX))
                        FROM EnquiryQuotes Q
                        WHERE LTRIM(RTRIM(Q.RequestNo)) = LTRIM(RTRIM(E.RequestNo))
                        AND (
                            /* 1. Creator Access */
                            (Q.PreparedByEmail IS NOT NULL AND LTRIM(RTRIM(UPPER(Q.PreparedByEmail))) = LTRIM(RTRIM(UPPER(NULLIF(@userEmail, '')))))
                            OR
                            /* 2. Division Access */
                            EXISTS (
                                SELECT 1 FROM Master_EnquiryFor mef
                                WHERE (
                                    ',' + REPLACE(REPLACE(ISNULL(UPPER(mef.CommonMailIds), ''), ' ', ''), ';', ',') + ',' LIKE '%,' + LTRIM(RTRIM(UPPER(NULLIF(@userEmail, '')))) + ',%'
                                    OR ',' + REPLACE(REPLACE(ISNULL(UPPER(mef.CCMailIds), ''), ' ', ''), ';', ',') + ',' LIKE '%,' + LTRIM(RTRIM(UPPER(NULLIF(@userEmail, '')))) + ',%'
                                )
                                AND mef.DivisionCode IS NOT NULL
                                AND LEN(LTRIM(RTRIM(mef.DivisionCode))) > 0
                                AND CHARINDEX('/' + UPPER(LTRIM(RTRIM(mef.DivisionCode))) + '/', UPPER(Q.QuoteNumber)) > 0
                            )
                            /* 3. Admin Fallback */
                            OR EXISTS (SELECT 1 FROM Master_ConcernedSE u WHERE LTRIM(RTRIM(UPPER(u.EmailId))) = LTRIM(RTRIM(UPPER(NULLIF(@userEmail, '')))) AND UPPER(u.Roles) LIKE '%ADMIN%')
                        )
                        ORDER BY LTRIM(RTRIM(Q.ToName)) ASC, Q.RevisionNo DESC
                        FOR XML PATH(''), TYPE
                    ).value('.', 'NVARCHAR(MAX)'), 1, 1, '')
                ) as FilteredQuoteRefs,
                (
                    SELECT STUFF((
                        SELECT '##' + CAST(po.OptionName AS NVARCHAR(MAX)) + '::' + CAST(ISNULL((SELECT SUM(pv.Price) FROM EnquiryPricingValues pv WHERE pv.OptionID = po.ID AND pv.CustomerName = po.CustomerName), 0) AS NVARCHAR(MAX))
                        FROM EnquiryPricingOptions po
                        JOIN EnquiryQuotes Q ON Q.QuoteNumber = E.WonQuoteRef
                        WHERE LTRIM(RTRIM(po.RequestNo)) = LTRIM(RTRIM(E.RequestNo))
                        AND po.CustomerName = Q.ToName
                        AND (po.OptionName LIKE '%Option%' OR po.OptionName LIKE '%Optional%')
                        FOR XML PATH(''), TYPE
                    ).value('.', 'NVARCHAR(MAX)'), 1, 2, '')
                ) as QuoteOptions
            FROM EnquiryMaster E
            WHERE 1 = 1
    `;

        // Filter Logic
        if (mode === 'Pending') {
            // Show only enquiries that:
            // 1. Have no status OR status is 'Pending' or 'Enquiry'
            // 2. OR have status 'Follow-up'/'FollowUp' but MISSING probability details
            // Once a status like Won, Lost, Cancelled, etc. is set, it's no longer "pending update"
            query += `
                AND (
                    (E.Status IS NULL OR E.Status = '' OR E.Status IN ('Pending', 'Enquiry', 'Priced', 'Estimated', 'Quote', 'Quoted'))
                    OR (E.Status IN('FollowUp', 'Follow-up') AND (E.ProbabilityOption IS NULL OR E.ProbabilityOption = ''))
                )
                AND (E.Status NOT IN('Won', 'Lost', 'Cancelled', 'OnHold', 'On Hold', 'Retendered') OR E.Status IS NULL OR E.Status = '')
                AND EXISTS(
                    SELECT 1 FROM EnquiryQuotes Q 
                    WHERE LTRIM(RTRIM(Q.RequestNo)) = LTRIM(RTRIM(E.RequestNo)) 
                    AND DATEDIFF(day, Q.QuoteDate, GETDATE()) >= 0
                )
            `;
        } else if (mode === 'Won') {
            query += ` AND E.Status = 'Won'`;
        } else if (mode === 'Lost') {
            query += ` AND E.Status = 'Lost'`;
        } else if (mode === 'OnHold') {
            query += ` AND (E.Status = 'OnHold' OR E.Status = 'On Hold')`;
        } else if (mode === 'Cancelled') {
            query += ` AND E.Status = 'Cancelled'`; // Assuming 'Cancelled' is mapped
        } else if (mode === 'FollowUp') {
            query += ` AND (E.Status = 'Follow-up' OR E.Status = 'FollowUp')`;
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
            if (mode === 'Lost') dateCol = 'E.LostDate';

            query += ` AND ${dateCol} >= @fromDate`;
        }
        if (toDate) {
            let dateCol = 'E.EnquiryDate';
            if (mode === 'Won') dateCol = 'E.ExpectedOrderDate';
            if (mode === 'Retendered') dateCol = 'E.RetenderDate';
            if (mode === 'OnHold') dateCol = 'E.OnHoldDate';
            if (mode === 'Cancelled') dateCol = 'E.CancelDate';
            if (mode === 'Lost') dateCol = 'E.LostDate';

            query += ` AND ${dateCol} <= @toDate`;
        }

        // Probability Filter (for FollowUp mainly)
        if (probability && mode === 'FollowUp') {
            // probability is string like "High Chance (90%)"
            // Database stores 'Probability' int and 'ProbabilityOption' string.
            // Filter by Option string for exact match
            query += ` AND E.ProbabilityOption = @probability`;
        }

        // Default Sorting: Newest Enquiry Date first, then highest Enquiry No.
        query += ` ORDER BY E.EnquiryDate DESC, CASE WHEN ISNUMERIC(E.RequestNo)=1 THEN CAST(E.RequestNo AS INT) ELSE 0 END DESC`;

        const request = new sql.Request();
        if (fromDate) request.input('fromDate', sql.Date, fromDate);
        if (toDate) request.input('toDate', sql.Date, toDate);
        if (probability) request.input('probability', sql.VarChar, probability);
        request.input('userEmail', sql.NVarChar, userEmail || '');

        const result = await request.query(query);
        if (result.recordset.length > 0) {
            console.log(`[Probability API V5] First Item FilteredQuoteRefs:`, result.recordset[0].FilteredQuoteRefs);
        }
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
SELECT * FROM EnquiryMaster WHERE LTRIM(RTRIM(RequestNo)) = LTRIM(RTRIM(@reqNo))
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
            status,
            probabilityOption,
            probability: probInput,
            aacQuotedContractor,
            customerPreferredPrice,
            preferredPrices,
            expectedDate,
            cancellationDate,
            onHoldDate,
            retenderDate,
            remarks,
            wonDetails,
            lostDetails
        } = req.body;

        console.log(`[Probability Update] Processing ReqNo: ${enquiryNo}, Status: ${status}`);
        console.log(`[Probability Update] Lost Details:`, lostDetails);

        // Calculate probability int from option string if not provided (e.g. "High Chance (90%)" -> 90)
        let probability = probInput;
        if (probability === undefined || probability === null) {
            const match = probabilityOption?.match(/\d+/);
            probability = match ? parseInt(match[0]) : 0;
        }

        const request = new sql.Request();
        request.input('reqNo', sql.NVarChar, String(enquiryNo || ''));
        request.input('Status', sql.NVarChar, status || '');
        request.input('ProbabilityOption', sql.VarChar, probabilityOption || '');
        request.input('Probability', sql.Int, probability);
        request.input('AACQuotedContractor', sql.VarChar, aacQuotedContractor || '');
        request.input('CustomerPreferredPrice', sql.VarChar, customerPreferredPrice || '');
        request.input('PreferredPriceOption1', sql.VarChar, preferredPrices?.option1 || '');
        request.input('PreferredPriceOption2', sql.VarChar, preferredPrices?.option2 || '');
        request.input('PreferredPriceOption3', sql.VarChar, preferredPrices?.option3 || '');
        request.input('ExpectedOrderDate', sql.DateTime, expectedDate ? new Date(expectedDate) : null);
        request.input('ProbabilityRemarks', sql.NVarChar, remarks || '');

        request.input('RetenderDate', sql.DateTime, retenderDate ? new Date(retenderDate) : null);
        request.input('OnHoldDate', sql.DateTime, onHoldDate ? new Date(onHoldDate) : null);
        request.input('CancelDate', sql.DateTime, cancellationDate ? new Date(cancellationDate) : null);

        request.input('WonOrderValue', sql.VarChar, String(wonDetails?.orderValue || '').replace(/,/g, '').trim() || null);
        request.input('WonJobNo', sql.VarChar, wonDetails?.jobNo || null);
        request.input('WonCustomerName', sql.VarChar, wonDetails?.customerName || null);
        request.input('WonContactName', sql.VarChar, wonDetails?.contactName || null);
        request.input('WonContactNo', sql.VarChar, wonDetails?.contactNo || null);
        request.input('WonQuoteRef', sql.NVarChar, wonDetails?.wonQuoteRef || null);
        request.input('WonOption', sql.NVarChar, wonDetails?.wonOption || null);

        request.input('LostCompetitor', sql.VarChar, lostDetails?.customer || null);
        request.input('LostReason', sql.VarChar, lostDetails?.reason || null);
        request.input('LostCompetitorPrice', sql.VarChar, String(lostDetails?.competitorPrice || '').replace(/,/g, '').trim() || null);
        request.input('LostDate', sql.DateTime, lostDetails?.lostDate ? new Date(lostDetails.lostDate) : null);

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
    LostDate = @LostDate,

    RetenderDate = @RetenderDate,
    OnHoldDate = @OnHoldDate,
    CancelDate = @CancelDate
            WHERE LTRIM(RTRIM(RequestNo)) = LTRIM(RTRIM(@reqNo))
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

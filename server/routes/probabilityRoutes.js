
const express = require('express');
const router = express.Router();
const { sql } = require('../dbConfig');

// --- Helper: Format RequestNo for SQL LIKE if needed, or simple exact match ---
const normalizeUserEmail = (email) => (email || '').toString().toLowerCase().replace(/@almcg\.com/g, '@almoayyedcg.com').trim();
const norm = (s) => (s || '').toString().trim().toLowerCase();
let probabilityTableReady = false;

const resolveCurrentUser = async (userEmail) => {
    const normalizedEmail = normalizeUserEmail(userEmail);
    if (!normalizedEmail) return null;

    const userRes = await sql.query`
        SELECT TOP 1 FullName, Roles
        FROM Master_ConcernedSE
        WHERE LOWER(REPLACE(EmailId, '@almcg.com', '@almoayyedcg.com')) = ${normalizedEmail}
    `;
    if (!userRes.recordset?.length) return null;

    return {
        email: normalizedEmail,
        fullName: (userRes.recordset[0].FullName || '').toString().trim(),
        roles: (userRes.recordset[0].Roles || '').toString().trim()
    };
};

const resolveProbabilityDivisionScope = async (userEmail, requestedDivision = '') => {
    const normalizedEmail = normalizeUserEmail(userEmail);
    if (!normalizedEmail) return null;

    const userRes = await sql.query`
        SELECT TOP 1 FullName, Roles, Department
        FROM Master_ConcernedSE
        WHERE LOWER(REPLACE(EmailId, '@almcg.com', '@almoayyedcg.com')) = ${normalizedEmail}
    `;
    if (!userRes.recordset?.length) return null;

    const baseUser = userRes.recordset[0] || {};
    const nonCcDepartment = String(baseUser.Department || '').trim();

    const ccReq = new sql.Request();
    ccReq.input('userEmail', sql.NVarChar, normalizedEmail);
    const ccRes = await ccReq.query(`
        SELECT DISTINCT LTRIM(RTRIM(ISNULL(mef.DepartmentName, ''))) AS DepartmentName
        FROM Master_EnquiryFor mef
        WHERE LTRIM(RTRIM(ISNULL(mef.DepartmentName, ''))) <> ''
          AND (
            ',' + REPLACE(REPLACE(LOWER(ISNULL(mef.CCMailIds, '')), ' ', ''), ';', ',') + ','
              LIKE '%,' + LOWER(LTRIM(RTRIM(ISNULL(@userEmail, '')))) + ',%'
          )
        ORDER BY DepartmentName
    `);
    const ccDivisions = (ccRes.recordset || [])
        .map((r) => String(r.DepartmentName || '').trim())
        .filter(Boolean);

    const isCcUser = ccDivisions.length > 0;
    const divisions = isCcUser ? ccDivisions : (nonCcDepartment ? [nonCcDepartment] : []);
    if (!divisions.length) return null;

    const reqDiv = String(requestedDivision || '').trim();
    const reqDivNorm = norm(reqDiv);
    const chosenDivision =
        (reqDiv && divisions.find((d) => norm(d) === reqDivNorm || norm(d).includes(reqDivNorm) || reqDivNorm.includes(norm(d)))) ||
        divisions[0];

    return {
        email: normalizedEmail,
        fullName: String(baseUser.FullName || '').trim(),
        roles: String(baseUser.Roles || '').trim(),
        isCcUser,
        divisions,
        division: chosenDivision,
    };
};

const hasEnquiryDivisionAccess = async (requestNo, division) => {
    const req = new sql.Request();
    req.input('requestNo', sql.NVarChar, String(requestNo || '').trim());
    req.input('division', sql.NVarChar, String(division || '').trim());
    const result = await req.query(`
        SELECT TOP 1 1 AS ok
        FROM EnquiryFor ef
        JOIN Master_EnquiryFor mef
          ON (
            ef.ItemName = mef.ItemName
            OR ef.ItemName LIKE '%- ' + mef.ItemName
            OR ef.ItemName LIKE '%-' + mef.ItemName
          )
        WHERE LTRIM(RTRIM(ISNULL(ef.RequestNo, ''))) = LTRIM(RTRIM(ISNULL(@requestNo, '')))
          AND UPPER(LTRIM(RTRIM(ISNULL(mef.DepartmentName, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@division, ''))))
    `);
    return (result.recordset?.length || 0) > 0;
};

const ensureProbabilityTable = async () => {
    if (probabilityTableReady) return;
    await sql.query(`
        IF OBJECT_ID('dbo.Probability', 'U') IS NULL
        BEGIN
            CREATE TABLE dbo.Probability (
                ID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
                RequestNo NVARCHAR(50) NULL,
                ProjectName NVARCHAR(255) NULL,
                LeadJobName NVARCHAR(255) NULL,
                OwnJobName NVARCHAR(255) NULL,
                ToName NVARCHAR(255) NULL,
                TotalQuotedValue NVARCHAR(80) NULL,
                NetQuotedValue NVARCHAR(80) NULL,
                QuoteNo NVARCHAR(120) NULL,
                QuoteRevision NVARCHAR(40) NULL,
                QuoteRef NVARCHAR(120) NULL,
                Status NVARCHAR(80) NULL,
                ProbabilityChance NVARCHAR(120) NULL,
                ExpectedDate DATETIME NULL,
                ERPJobNo NVARCHAR(80) NULL,
                FinalJobValueBooked NVARCHAR(80) NULL,
                BookedDate DATETIME NULL,
                GrossMargin DECIMAL(10,2) NULL,
                ReasonForLoosing NVARCHAR(500) NULL,
                CompetitorPrice NVARCHAR(80) NULL,
                LostDate DATETIME NULL,
                HoldReason NVARCHAR(500) NULL,
                CencelledReason NVARCHAR(500) NULL,
                RetenderedReason NVARCHAR(500) NULL,
                Remarks NVARCHAR(MAX) NULL,
                UpdatedBy NVARCHAR(255) NULL,
                UpdatedDateTime DATETIME NOT NULL DEFAULT(GETDATE())
            );
            CREATE INDEX IX_Probability_RequestNo ON dbo.Probability (RequestNo, UpdatedDateTime DESC);
            CREATE INDEX IX_Probability_OwnJobName ON dbo.Probability (OwnJobName, UpdatedDateTime DESC);
        END
        IF COL_LENGTH('dbo.Probability', 'LeadJobName') IS NULL
        BEGIN
            ALTER TABLE dbo.Probability ADD LeadJobName NVARCHAR(255) NULL;
        END
        IF COL_LENGTH('dbo.Probability', 'PreparedBy') IS NULL
        BEGIN
            ALTER TABLE dbo.Probability ADD PreparedBy NVARCHAR(255) NULL;
        END
        IF COL_LENGTH('dbo.Probability', 'QuoteOwnJob') IS NULL
        BEGIN
            ALTER TABLE dbo.Probability ADD QuoteOwnJob NVARCHAR(255) NULL;
        END
    `);
    probabilityTableReady = true;
};

const fetchQuoteRowByQuoteNumber = async (quoteNumber) => {
    const qn = String(quoteNumber || '').trim();
    if (!qn) return null;
    const rq = new sql.Request();
    rq.input('qn', sql.NVarChar, qn);
    const r = await rq.query(`
        SELECT TOP 1
            QuoteNo,
            RevisionNo,
            LeadJob,
            OwnJob,
            ToName,
            PreparedBy
        FROM EnquiryQuotes
        WHERE LTRIM(RTRIM(ISNULL(QuoteNumber, ''))) = LTRIM(RTRIM(ISNULL(@qn, '')))
    `);
    return r.recordset?.[0] || null;
};

/** Last path segment: ACC/CIP/9-L1/12-R0 → quoteNo "12", revision "0" */
const parseQuoteRefTail = (quoteRef) => {
    const s = String(quoteRef || '').trim();
    if (!s) return { quoteNo: '', revision: '' };
    const parts = s.split('/').filter(Boolean);
    const last = parts[parts.length - 1] || '';
    const m = last.match(/^(\d+)-R(\d+)$/i);
    if (m) return { quoteNo: m[1], revision: m[2] };
    const m2 = last.match(/^(\d+)/);
    return { quoteNo: m2 ? m2[1] : '', revision: '' };
};

const insertProbabilityHistory = async ({
    enquiryNo,
    projectName,
    leadJobName,
    division,
    toName,
    totalQuotedValue,
    netQuotedValue,
    quoteRef,
    status,
    probabilityOption,
    expectedDate,
    wonDetails,
    lostDetails,
    holdReason,
    cancelledReason,
    retenderedReason,
    remarks,
    updatedBy
}) => {
    await ensureProbabilityTable();
    const qRow = quoteRef ? await fetchQuoteRowByQuoteNumber(quoteRef) : null;
    const tail = parseQuoteRefTail(quoteRef);
    const quoteNoIns =
        qRow != null && qRow.QuoteNo != null && String(qRow.QuoteNo).trim() !== ''
            ? String(qRow.QuoteNo).trim()
            : tail.quoteNo || null;
    const revIns =
        qRow != null && qRow.RevisionNo != null && String(qRow.RevisionNo).trim() !== ''
            ? String(qRow.RevisionNo).trim()
            : tail.revision || null;
    const leadIns =
        (qRow && String(qRow.LeadJob || '').trim()) || String(leadJobName || '').trim() || null;
    const toIns =
        (qRow && String(qRow.ToName || '').trim()) || String(toName || '').trim() || null;
    const preparedByIns =
        qRow && String(qRow.PreparedBy || '').trim() ? String(qRow.PreparedBy).trim() : null;
    const quoteOwnJobIns =
        qRow && String(qRow.OwnJob || '').trim() ? String(qRow.OwnJob).trim() : null;

    const req = new sql.Request();
    req.input('RequestNo', sql.NVarChar, String(enquiryNo || '').trim() || null);
    req.input('ProjectName', sql.NVarChar, String(projectName || '').trim() || null);
    req.input('LeadJobName', sql.NVarChar, leadIns);
    req.input('OwnJobName', sql.NVarChar, String(division || '').trim() || null);
    req.input('ToName', sql.NVarChar, toIns);
    // History: do not persist total quoted (ownjob+subjobs); keep column NULL on insert.
    req.input('TotalQuotedValue', sql.NVarChar, null);
    req.input('NetQuotedValue', sql.NVarChar, String(netQuotedValue || '').trim() || null);
    req.input('QuoteNo', sql.NVarChar, quoteNoIns);
    req.input('QuoteRevision', sql.NVarChar, revIns);
    req.input('QuoteRef', sql.NVarChar, String(quoteRef || '').trim() || null);
    req.input('PreparedBy', sql.NVarChar, preparedByIns);
    req.input('QuoteOwnJob', sql.NVarChar, quoteOwnJobIns);
    req.input('Status', sql.NVarChar, String(status || '').trim() || null);
    req.input('ProbabilityChance', sql.NVarChar, String(probabilityOption || '').trim() || null);
    req.input('ExpectedDate', sql.DateTime, expectedDate ? new Date(expectedDate) : null);
    req.input('ERPJobNo', sql.NVarChar, wonDetails?.jobNo ? String(wonDetails.jobNo).trim() : null);
    const statusStr = String(status || '').trim();
    const isWon = statusStr === 'Won';
    const rawWonVal = String(wonDetails?.orderValue || '')
        .replace(/,/g, '')
        .replace(/BD/gi, '')
        .trim();
    const wonNum = rawWonVal === '' ? NaN : parseFloat(rawWonVal);
    const wonBookedOk = isWon && Number.isFinite(wonNum) && wonNum > 0;
    req.input(
        'FinalJobValueBooked',
        sql.NVarChar,
        wonBookedOk ? rawWonVal : null
    );
    req.input(
        'BookedDate',
        sql.DateTime,
        wonBookedOk && expectedDate ? new Date(expectedDate) : null
    );
    req.input(
        'GrossMargin',
        sql.Decimal(10, 2),
        wonBookedOk && wonDetails?.grossProfit != null && wonDetails?.grossProfit !== ''
            ? parseFloat(wonDetails.grossProfit)
            : null
    );
    req.input('ReasonForLoosing', sql.NVarChar, lostDetails?.reason ? String(lostDetails.reason).trim() : null);
    req.input('CompetitorPrice', sql.NVarChar, lostDetails?.competitorPrice ? String(lostDetails.competitorPrice).replace(/,/g, '').trim() : null);
    req.input('LostDate', sql.DateTime, lostDetails?.lostDate ? new Date(lostDetails.lostDate) : null);
    req.input('HoldReason', sql.NVarChar, holdReason ? String(holdReason).trim() : null);
    req.input('CencelledReason', sql.NVarChar, cancelledReason ? String(cancelledReason).trim() : null);
    req.input('RetenderedReason', sql.NVarChar, retenderedReason ? String(retenderedReason).trim() : null);
    req.input('Remarks', sql.NVarChar(sql.MAX), remarks ? String(remarks) : null);
    req.input('UpdatedBy', sql.NVarChar, String(updatedBy || '').trim() || null);
    await req.query(`
        INSERT INTO dbo.Probability (
            RequestNo, ProjectName, LeadJobName, OwnJobName, ToName, TotalQuotedValue, NetQuotedValue,
            QuoteNo, QuoteRevision, QuoteRef, PreparedBy, QuoteOwnJob, Status, ProbabilityChance, ExpectedDate,
            ERPJobNo, FinalJobValueBooked, BookedDate, GrossMargin, ReasonForLoosing,
            CompetitorPrice, LostDate, HoldReason, CencelledReason, RetenderedReason,
            Remarks, UpdatedBy
        ) VALUES (
            @RequestNo, @ProjectName, @LeadJobName, @OwnJobName, @ToName, @TotalQuotedValue, @NetQuotedValue,
            @QuoteNo, @QuoteRevision, @QuoteRef, @PreparedBy, @QuoteOwnJob, @Status, @ProbabilityChance, @ExpectedDate,
            @ERPJobNo, @FinalJobValueBooked, @BookedDate, @GrossMargin, @ReasonForLoosing,
            @CompetitorPrice, @LostDate, @HoldReason, @CencelledReason, @RetenderedReason,
            @Remarks, @UpdatedBy
        )
    `);
};

const hasProbabilityAccess = async (requestNo, userEmail) => {
    const user = await resolveCurrentUser(userEmail);
    if (!user?.fullName) return false;

    const accessReq = new sql.Request();
    accessReq.input('requestNo', sql.NVarChar, String(requestNo || '').trim());
    accessReq.input('fullName', sql.NVarChar, user.fullName);
    const accessRes = await accessReq.query(`
        SELECT TOP 1 1 AS ok
        FROM ConcernedSE cs
        WHERE LTRIM(RTRIM(ISNULL(cs.RequestNo, ''))) = LTRIM(RTRIM(ISNULL(@requestNo, '')))
          AND UPPER(LTRIM(RTRIM(ISNULL(cs.SEName, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@fullName, ''))))
    `);
    return (accessRes.recordset?.length || 0) > 0;
};

// GET /api/probability/list
// Supports ?mode=[Pending|Won|Lost|OnHold|Cancelled|FollowUp|Retendered]
// &fromDate=... &toDate=... &probability=...
router.get('/list', async (req, res) => {
    try {
        await ensureProbabilityTable();
        const { mode, fromDate, toDate, probability, userEmail: rawEmail, userDepartment, division: requestedDivision } = req.query;
        const userEmail = rawEmail ? rawEmail.toLowerCase().replace(/@almcg\.com/g, '@almoayyedcg.com').trim() : '';
        const divisionScope = await resolveProbabilityDivisionScope(userEmail, requestedDivision);
        const currentUserFullName = divisionScope?.fullName || '';
        const effectiveDivision = String(divisionScope?.division || '').trim();
        const isCcUser = !!divisionScope?.isCcUser;
        if (!isCcUser && !currentUserFullName) {
            return res.json([]);
        }
        if (!effectiveDivision) {
            return res.json([]);
        }
        console.log(`[Probability API V5] Fetching list. Mode: ${mode}, User: ${userEmail}, Division: ${effectiveDivision}`);
        let query = `
            SELECT
                LTRIM(RTRIM(E.RequestNo)) as RequestNo, E.ProjectName, E.EnquiryDate, E.Status,
                E.Probability, E.ProbabilityOption, E.ExpectedOrderDate, E.ProbabilityRemarks,
                E.WonOrderValue, E.WonJobNo, E.WonCustomerName, E.CustomerPreferredPrice, E.WonQuoteRef, E.WonOption, E.WonGrossProfit,
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
                                    JOIN Master_EnquiryFor mef ON (pv.EnquiryForItem = mef.ItemName OR pv.EnquiryForItem LIKE '%- ' + mef.ItemName OR pv.EnquiryForItem LIKE '%-' + mef.ItemName)
                                    WHERE LTRIM(RTRIM(pv.RequestNo)) = LTRIM(RTRIM(E.RequestNo))
                                    AND UPPER(LTRIM(RTRIM(po.OptionName))) NOT LIKE '%OPTION%' 
                                    AND UPPER(LTRIM(RTRIM(po.OptionName))) NOT LIKE '%OPTIONAL%'
                                    AND UPPER(LTRIM(RTRIM(ISNULL(mef.DepartmentName, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@division, ''))))
                                    AND (
                                        -- Standard: User has access to this specific item (Own Job)
                                        (
                                            ',' + REPLACE(REPLACE(ISNULL(mef.CommonMailIds, ''), ' ', ''), ';', ',') + ',' LIKE '%,' + ISNULL(@userEmail, '') + ',%'
                                            OR ',' + REPLACE(REPLACE(ISNULL(mef.CCMailIds, ''), ' ', ''), ';', ',') + ',' LIKE '%,' + ISNULL(@userEmail, '') + ',%'
                                            OR mef.ItemName = @userDepartment
                                        )
                                        OR
                                        -- Hierarchy: User has access to the Parent job of this specific item (Subjob)
                                        EXISTS (
                                            SELECT 1
                                            FROM EnquiryFor child
                                            JOIN EnquiryFor parent1 ON child.ParentID = parent1.ID
                                            LEFT JOIN EnquiryFor parent2 ON parent1.ParentID = parent2.ID
                                            LEFT JOIN EnquiryFor parent3 ON parent2.ParentID = parent3.ID
                                            JOIN Master_EnquiryFor pmef ON (
                                                -- Match against any ancestor level (parent1/parent2/parent3)
                                                (
                                                    parent1.ItemName = pmef.ItemName
                                                    OR parent1.ItemName LIKE '%- ' + pmef.ItemName
                                                    OR parent1.ItemName LIKE '%-' + pmef.ItemName
                                                )
                                                OR
                                                (
                                                    parent2.ItemName = pmef.ItemName
                                                    OR parent2.ItemName LIKE '%- ' + pmef.ItemName
                                                    OR parent2.ItemName LIKE '%-' + pmef.ItemName
                                                )
                                                OR
                                                (
                                                    parent3.ItemName = pmef.ItemName
                                                    OR parent3.ItemName LIKE '%- ' + pmef.ItemName
                                                    OR parent3.ItemName LIKE '%-' + pmef.ItemName
                                                )
                                            )
                                            WHERE (
                                                pv.EnquiryForItem = child.ItemName
                                                OR pv.EnquiryForItem LIKE '%- ' + child.ItemName
                                                OR pv.EnquiryForItem LIKE '%-' + child.ItemName
                                            )
                                            AND child.RequestNo = E.RequestNo
                                            AND parent1.RequestNo = E.RequestNo
                                            AND (parent2.RequestNo = E.RequestNo OR parent2.ID IS NULL)
                                            AND (parent3.RequestNo = E.RequestNo OR parent3.ID IS NULL)
                                            AND (
                                                UPPER(LTRIM(RTRIM(ISNULL(pmef.DepartmentName, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@division, ''))))
                                                AND (
                                                    ',' + REPLACE(REPLACE(ISNULL(pmef.CommonMailIds, ''), ' ', ''), ';', ',') + ',' LIKE '%,' + ISNULL(@userEmail, '') + ',%'
                                                    OR ',' + REPLACE(REPLACE(ISNULL(pmef.CCMailIds, ''), ' ', ''), ';', ',') + ',' LIKE '%,' + ISNULL(@userEmail, '') + ',%'
                                                    OR pmef.ItemName = @userDepartment
                                                )
                                            )
                                        )
                                        OR
                                        -- GLOBAL VISIBILITY FOR CIVIL USERS (e.g. they see everything in Total)
                                        EXISTS (
                                            SELECT 1 FROM Master_EnquiryFor civil
                                            WHERE (civil.ItemName = 'Civil' OR civil.ItemName = 'Civil Project') 
                                            AND UPPER(LTRIM(RTRIM(ISNULL(civil.DepartmentName, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@division, ''))))
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
                                    JOIN Master_EnquiryFor mef ON (pv.EnquiryForItem = mef.ItemName OR pv.EnquiryForItem LIKE '%- ' + mef.ItemName OR pv.EnquiryForItem LIKE '%-' + mef.ItemName)
                                    WHERE LTRIM(RTRIM(pv.RequestNo)) = LTRIM(RTRIM(E.RequestNo))
                                    AND UPPER(LTRIM(RTRIM(po.OptionName))) NOT LIKE '%OPTION%' 
                                    AND UPPER(LTRIM(RTRIM(po.OptionName))) NOT LIKE '%OPTIONAL%'
                                    AND UPPER(LTRIM(RTRIM(ISNULL(mef.DepartmentName, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@division, ''))))
                                    AND (
                                        -- Net Quoted: ONLY strict user affiliation
                                        ',' + REPLACE(REPLACE(ISNULL(mef.CommonMailIds, ''), ' ', ''), ';', ',') + ',' LIKE '%,' + ISNULL(@userEmail, '') + ',%'
                                        OR ',' + REPLACE(REPLACE(ISNULL(mef.CCMailIds, ''), ' ', ''), ';', ',') + ',' LIKE '%,' + ISNULL(@userEmail, '') + ',%'
                                        OR mef.ItemName = @userDepartment
                                    )
                                    GROUP BY pv.EnquiryForItem
                                ) t
                            ), 0) AS NVARCHAR(50))
                        END
                ) as NetQuotedValue,
                (
                    SELECT STUFF((
                        SELECT ',' + CAST(Q.QuoteNumber AS NVARCHAR(MAX)) + '|' + CAST(ISNULL(Q.ToName, 'N/A') AS NVARCHAR(MAX)) + '|' + CAST(ISNULL(Q.LeadJob, '') AS NVARCHAR(MAX)) + '|' + ISNULL(CONVERT(NVARCHAR(23), Q.QuoteDate, 121), N'')
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
                                AND UPPER(LTRIM(RTRIM(ISNULL(mef.DepartmentName, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@division, ''))))
                                AND mef.DivisionCode IS NOT NULL
                                AND LEN(LTRIM(RTRIM(mef.DivisionCode))) > 0
                                AND CHARINDEX('/' + UPPER(LTRIM(RTRIM(mef.DivisionCode))) + '/', UPPER(Q.QuoteNumber)) > 0
                            )
                            /* 3. Admin Fallback */
                            OR EXISTS (SELECT 1 FROM Master_ConcernedSE u WHERE LTRIM(RTRIM(UPPER(u.EmailId))) = LTRIM(RTRIM(UPPER(NULLIF(@userEmail, '')))) AND UPPER(u.Roles) LIKE '%ADMIN%')
                        )
                        ORDER BY
                            CASE
                                WHEN PATINDEX('%/L[0-9]%', UPPER(ISNULL(Q.QuoteNumber, ''))) > 0
                                    THEN TRY_CAST(
                                        SUBSTRING(
                                            UPPER(ISNULL(Q.QuoteNumber, '')),
                                            PATINDEX('%/L[0-9]%', UPPER(ISNULL(Q.QuoteNumber, ''))) + 2,
                                            10
                                        ) AS INT
                                    )
                                ELSE 999999
                            END ASC,
                            LTRIM(RTRIM(ISNULL(Q.QuoteNumber, ''))) ASC,
                            LTRIM(RTRIM(Q.ToName)) ASC,
                            Q.RevisionNo DESC
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
              AND EXISTS (
                    SELECT 1
                    FROM EnquiryFor efDiv
                    JOIN Master_EnquiryFor mefDiv
                      ON (
                        efDiv.ItemName = mefDiv.ItemName
                        OR efDiv.ItemName LIKE '%- ' + mefDiv.ItemName
                        OR efDiv.ItemName LIKE '%-' + mefDiv.ItemName
                      )
                    WHERE LTRIM(RTRIM(ISNULL(efDiv.RequestNo, ''))) = LTRIM(RTRIM(ISNULL(E.RequestNo, '')))
                      AND UPPER(LTRIM(RTRIM(ISNULL(mefDiv.DepartmentName, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@division, ''))))
              )
              AND EXISTS (
                    SELECT 1
                    FROM ConcernedSE cs
                    WHERE LTRIM(RTRIM(ISNULL(cs.RequestNo, ''))) = LTRIM(RTRIM(ISNULL(E.RequestNo, '')))
                      AND UPPER(LTRIM(RTRIM(ISNULL(cs.SEName, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@currentUserFullName, ''))))
              )
    `;
        if (isCcUser) {
            query = query.replace(
                `
              AND EXISTS (
                    SELECT 1
                    FROM ConcernedSE cs
                    WHERE LTRIM(RTRIM(ISNULL(cs.RequestNo, ''))) = LTRIM(RTRIM(ISNULL(E.RequestNo, '')))
                      AND UPPER(LTRIM(RTRIM(ISNULL(cs.SEName, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@currentUserFullName, ''))))
              )
    `,
                '\n'
            );
        }

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

        const now = new Date();
        const request = new sql.Request();
        if (fromDate) request.input('fromDate', sql.Date, fromDate);
        if (toDate) request.input('toDate', sql.Date, toDate);
        if (probability) request.input('probability', sql.VarChar, probability);
        request.input('userEmail', sql.NVarChar, userEmail || '');
        request.input('userDepartment', sql.NVarChar, userDepartment || '');
        request.input('currentUserFullName', sql.NVarChar, currentUserFullName);
        request.input('division', sql.NVarChar, effectiveDivision);
        request.input('now', sql.DateTime, now);

        const result = await request.query(query.replace(/GETDATE\(\)/g, '@now'));
        if (result.recordset.length > 0) {
            console.log(`[Probability API V5] First Item FilteredQuoteRefs:`, result.recordset[0].FilteredQuoteRefs);
        }
        res.json(result.recordset);

    } catch (err) {
        console.error('API Error /list:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/probability/divisions?userEmail=...
router.get('/divisions', async (req, res) => {
    try {
        await ensureProbabilityTable();
        const userEmail = String(req.query.userEmail || '').trim();
        const scope = await resolveProbabilityDivisionScope(userEmail, '');
        if (!scope) {
            return res.json({ divisions: [], isCcUser: false, selectedDivision: '' });
        }
        return res.json({
            divisions: scope.divisions,
            isCcUser: scope.isCcUser,
            selectedDivision: scope.division,
        });
    } catch (err) {
        console.error('API Error /divisions:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/probability/history/:requestNo?userEmail=...&division=...
router.get('/history/:requestNo', async (req, res) => {
    try {
        await ensureProbabilityTable();
        const requestNo = String(req.params.requestNo || '').trim();
        const userEmail = String(req.query.userEmail || '').trim();
        const requestedDivision = String(req.query.division || '').trim();
        const scope = await resolveProbabilityDivisionScope(userEmail, requestedDivision);
        if (!scope?.division) {
            return res.status(403).json({ error: 'No division access for this user' });
        }
        const reqSql = new sql.Request();
        reqSql.input('requestNo', sql.NVarChar, requestNo);
        reqSql.input('division', sql.NVarChar, scope.division);
        const result = await reqSql.query(`
            SELECT
                p.ID, p.RequestNo, p.ProjectName, p.OwnJobName, p.ToName, p.TotalQuotedValue, p.NetQuotedValue,
                p.LeadJobName,
                p.QuoteNo, p.QuoteRevision, p.QuoteRef, p.PreparedBy, p.QuoteOwnJob, p.Status, p.ProbabilityChance, p.ExpectedDate,
                p.ERPJobNo, p.FinalJobValueBooked, p.BookedDate, p.GrossMargin, p.ReasonForLoosing,
                p.CompetitorPrice, p.LostDate, p.HoldReason, p.CencelledReason, p.RetenderedReason,
                p.Remarks, p.UpdatedBy, p.UpdatedDateTime,
                COALESCE(NULLIF(LTRIM(RTRIM(u.FullName)), ''), LTRIM(RTRIM(p.UpdatedBy))) AS UpdatedByDisplayName,
                qdt.QuoteDate AS QuoteRefQuoteDate
            FROM dbo.Probability p
            LEFT JOIN Master_ConcernedSE u
              ON LOWER(REPLACE(LTRIM(RTRIM(ISNULL(u.EmailId, N''))), N'@almcg.com', N'@almoayyedcg.com'))
               = LOWER(REPLACE(LTRIM(RTRIM(ISNULL(p.UpdatedBy, N''))), N'@almcg.com', N'@almoayyedcg.com'))
            OUTER APPLY (
                SELECT TOP 1 Q.QuoteDate
                FROM EnquiryQuotes Q
                WHERE LTRIM(RTRIM(ISNULL(Q.RequestNo, N''))) = LTRIM(RTRIM(ISNULL(p.RequestNo, N'')))
                  AND LTRIM(RTRIM(ISNULL(Q.QuoteNumber, N''))) = LTRIM(RTRIM(ISNULL(p.QuoteRef, N'')))
                  AND LTRIM(RTRIM(ISNULL(p.QuoteRef, N''))) <> N''
                ORDER BY ISNULL(Q.RevisionNo, 0) DESC, Q.QuoteDate DESC
            ) qdt
            WHERE LTRIM(RTRIM(ISNULL(p.RequestNo, ''))) = LTRIM(RTRIM(ISNULL(@requestNo, '')))
              AND UPPER(LTRIM(RTRIM(ISNULL(p.OwnJobName, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@division, ''))))
            ORDER BY p.UpdatedDateTime DESC, p.ID DESC
        `);
        return res.json(result.recordset || []);
    } catch (err) {
        console.error('API Error /history/:requestNo:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/probability/:requestNo - Get full details
router.get('/:requestNo', async (req, res) => {
    try {
        const { requestNo } = req.params;
        const userEmail = req.query.userEmail || '';
        const allowed = await hasProbabilityAccess(requestNo, userEmail);
        if (!allowed) return res.status(403).json({ error: 'Access denied for this enquiry' });

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
            userEmail,
            division: requestedDivision,
            projectName,
            leadJobName,
            toName,
            totalQuotedValue,
            netQuotedValue,
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

        const scope = await resolveProbabilityDivisionScope(userEmail, requestedDivision);
        if (!scope?.division) {
            return res.status(403).json({ error: 'No division access for this user' });
        }

        const divisionAllowedForEnquiry = await hasEnquiryDivisionAccess(enquiryNo, scope.division);
        if (!divisionAllowedForEnquiry) {
            return res.status(403).json({ error: 'Access denied for this enquiry division' });
        }

        if (!scope.isCcUser) {
            const allowed = await hasProbabilityAccess(enquiryNo, userEmail);
            if (!allowed) return res.status(403).json({ error: 'Access denied for this enquiry' });
        }

        console.log(`[Probability Update] Processing ReqNo: ${enquiryNo}, Status: ${status}`);
        console.log(`[Probability Update] Lost Details:`, lostDetails);

        // Server-side validation for Won status
        if (status === 'Won') {
            if (!wonDetails?.wonQuoteRef) {
                return res.status(400).json({ error: 'Quote Reference is mandatory for Won status' });
            }
            const rawVal = String(wonDetails?.orderValue || '').replace(/,/g, '').trim();
            if (!rawVal || isNaN(rawVal) || Number(rawVal) <= 0) {
                return res.status(400).json({ error: 'Valid Job Value is mandatory for Won status' });
            }
            if (!wonDetails?.jobNo || !String(wonDetails.jobNo).trim()) {
                return res.status(400).json({ error: 'ERP Job No. is mandatory for Won status' });
            }
            if (!expectedDate) {
                return res.status(400).json({ error: 'Booked Date is mandatory for Won status' });
            }
            if (wonDetails?.grossProfit == null || wonDetails?.grossProfit === '') {
                return res.status(400).json({ error: 'GP % is mandatory for Won status' });
            }
        }

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
        request.input('WonGrossProfit', sql.Decimal(5, 2), wonDetails?.grossProfit != null && wonDetails.grossProfit !== '' ? parseFloat(wonDetails.grossProfit) : null);

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
    WonGrossProfit = @WonGrossProfit,
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
        await insertProbabilityHistory({
            enquiryNo,
            projectName,
            leadJobName,
            division: scope.division,
            toName,
            totalQuotedValue,
            netQuotedValue,
            quoteRef: wonDetails?.wonQuoteRef || '',
            status,
            probabilityOption,
            expectedDate,
            wonDetails,
            lostDetails,
            holdReason: (status === 'OnHold' || status === 'On Hold') ? (lostDetails?.reason || '') : '',
            cancelledReason: status === 'Cancelled' ? (lostDetails?.reason || '') : '',
            retenderedReason: status === 'Retendered' ? (lostDetails?.reason || '') : '',
            remarks,
            updatedBy: normalizeUserEmail(userEmail),
        });
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
        const userEmail = req.query.userEmail || '';
        const division = String(req.query.division || '').trim();
        const decodedQuoteNumber = decodeURIComponent(quoteNumber);

        const qReq = new sql.Request();
        qReq.input('qn', sql.NVarChar, decodedQuoteNumber);
        const quoteRes = await qReq.query(`
            SELECT RequestNo, ToName, TotalAmount, QuoteNo, RevisionNo, LeadJob, OwnJob, PreparedBy, QuoteDate
            FROM EnquiryQuotes
            WHERE LTRIM(RTRIM(ISNULL(QuoteNumber, ''))) = LTRIM(RTRIM(ISNULL(@qn, '')))
        `);

        if (quoteRes.recordset.length === 0) {
            return res.status(404).json({ error: 'Quote not found' });
        }

        const quote = quoteRes.recordset[0];
        const allowedSe = await hasProbabilityAccess(quote.RequestNo, userEmail);
        const scope = await resolveProbabilityDivisionScope(userEmail, division);
        const divOk =
            scope?.division && (await hasEnquiryDivisionAccess(quote.RequestNo, scope.division));
        if (!allowedSe && !divOk) {
            return res.status(403).json({ error: 'Access denied for this enquiry' });
        }

        const totalsReq = new sql.Request();
        totalsReq.input('reqNo', sql.NVarChar, String(quote.RequestNo || '').trim());
        totalsReq.input('toName', sql.NVarChar, String(quote.ToName || '').trim());
        totalsReq.input('division', sql.NVarChar, division || '');
        const totalsRes = await totalsReq.query(`
            ;WITH OwnJobNode AS (
                SELECT TOP 1 ef.ID, ef.ItemName
                FROM EnquiryFor ef
                JOIN Master_EnquiryFor mef
                  ON (
                    ef.ItemName = mef.ItemName
                    OR ef.ItemName LIKE '%- ' + mef.ItemName
                    OR ef.ItemName LIKE '%-' + mef.ItemName
                  )
                WHERE LTRIM(RTRIM(ISNULL(ef.RequestNo, ''))) = LTRIM(RTRIM(ISNULL(@reqNo, '')))
                  AND UPPER(LTRIM(RTRIM(ISNULL(mef.DepartmentName, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@division, ''))))
                ORDER BY ef.ID
            ),
            SubTree AS (
                SELECT ef.ID, ef.ItemName
                FROM EnquiryFor ef
                JOIN OwnJobNode o ON ef.ID = o.ID
                UNION ALL
                SELECT c.ID, c.ItemName
                FROM EnquiryFor c
                JOIN SubTree p ON c.ParentID = p.ID
                WHERE LTRIM(RTRIM(ISNULL(c.RequestNo, ''))) = LTRIM(RTRIM(ISNULL(@reqNo, '')))
            ),
            BaseRows AS (
                SELECT pv.EnquiryForItem, MAX(ISNULL(pv.Price, 0)) AS MaxPrice
                FROM EnquiryPricingValues pv
                JOIN EnquiryPricingOptions po ON po.ID = pv.OptionID
                WHERE LTRIM(RTRIM(ISNULL(pv.RequestNo, ''))) = LTRIM(RTRIM(ISNULL(@reqNo, '')))
                  AND LTRIM(RTRIM(ISNULL(po.CustomerName, ''))) = LTRIM(RTRIM(ISNULL(@toName, '')))
                  AND UPPER(LTRIM(RTRIM(ISNULL(po.OptionName, '')))) NOT LIKE '%OPTION%'
                  AND UPPER(LTRIM(RTRIM(ISNULL(po.OptionName, '')))) NOT LIKE '%OPTIONAL%'
                GROUP BY pv.EnquiryForItem
            )
            SELECT
                CAST(ISNULL((
                    SELECT SUM(br.MaxPrice)
                    FROM BaseRows br
                    WHERE EXISTS (
                        SELECT 1
                        FROM SubTree st
                        WHERE br.EnquiryForItem = st.ItemName
                           OR br.EnquiryForItem LIKE '%- ' + st.ItemName
                           OR br.EnquiryForItem LIKE '%-' + st.ItemName
                    )
                ), 0) AS DECIMAL(18,3)) AS TotalQuotedValue,
                CAST(ISNULL((
                    SELECT SUM(br.MaxPrice)
                    FROM BaseRows br
                    WHERE EXISTS (
                        SELECT 1
                        FROM OwnJobNode o
                        WHERE br.EnquiryForItem = o.ItemName
                           OR br.EnquiryForItem LIKE '%- ' + o.ItemName
                           OR br.EnquiryForItem LIKE '%-' + o.ItemName
                    )
                ), 0) AS DECIMAL(18,3)) AS NetQuotedValue
        `);
        const totals = totalsRes.recordset?.[0] || {};

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
            totalQuotedValue: totals.TotalQuotedValue ?? 0,
            netQuotedValue: totals.NetQuotedValue ?? 0,
            quoteNo: quote.QuoteNo,
            revisionNo: quote.RevisionNo,
            leadJob: quote.LeadJob,
            ownJob: quote.OwnJob,
            preparedBy: quote.PreparedBy,
            quoteDate: quote.QuoteDate,
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

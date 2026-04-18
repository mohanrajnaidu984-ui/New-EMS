'use strict';

const { resolvePricingAccessContext, normalizePricingJobName } = require('./quotePricingAccess');

/**
 * Raw pending-quote enquiries (priced tuples still missing a completed quote), with optional extra WHERE on EnquiryMaster E.
 */
async function runPendingQuoteListQuery(sqlConn, rawUserEmail, extraWhereSql = '') {
        let userEmail = rawUserEmail;
        if (userEmail) {
            userEmail = userEmail.toLowerCase().replace(/@almcg\.com/g, '@almoayyedcg.com').trim();
        }
        console.log(`[API] Pending quote list query for ${userEmail || 'All'}...`);

        const accessCtx = userEmail ? await resolvePricingAccessContext(userEmail) : null;
        if (userEmail && (!accessCtx || !accessCtx.user)) {
            return { enquiries: [], accessCtx: accessCtx || null, userEmail };
        }

        const isAdmin = !!(accessCtx && accessCtx.isAdmin);
        const userDepartment = accessCtx ? accessCtx.userDepartment : '';
        const isCcUser = !!(accessCtx && accessCtx.isCcUser);

        const uEsc = (userEmail || '').replace(/'/g, "''");
        const trimmedDept = (userDepartment || '').trim();
        const deptEsc = trimmedDept.replace(/'/g, "''");
        // Match getPricingAnchorJobs: strip "L1 - " / "Sub Job - " from Department so SQL scope aligns with pricing UI.
        const deptNormEsc = (normalizePricingJobName(trimmedDept) || '').replace(/'/g, "''");
        const hasDeptScope = deptEsc.length > 0 || deptNormEsc.length > 0;
        const mefAccessPredicate = isCcUser
            ? `REPLACE(ISNULL(MEF.CCMailIds, ''), '@almcg.com', '@almoayyedcg.com') LIKE '%${uEsc}%'`
            : hasDeptScope
                ? `(
                    LOWER(LTRIM(RTRIM(MEF.ItemName))) LIKE '%' + LOWER(LTRIM(RTRIM('${deptEsc}'))) + '%'
                    OR LOWER(LTRIM(RTRIM(EF.ItemName))) LIKE '%' + LOWER(LTRIM(RTRIM('${deptEsc}'))) + '%'
                    OR (${deptNormEsc ? `LOWER(LTRIM(RTRIM(MEF.ItemName))) LIKE '%' + N'${deptNormEsc}' + '%'
                    OR LOWER(LTRIM(RTRIM(EF.ItemName))) LIKE '%' + N'${deptNormEsc}' + '%'` : '1=0'})
                )`
                : `1 = 1`;

        const scopedJobIdsSubquery = isCcUser
            ? `REPLACE(MEF2.CCMailIds, '@almcg.com', '@almoayyedcg.com') LIKE '%${uEsc}%'`
            : hasDeptScope
                ? `(
                    LOWER(LTRIM(RTRIM(MEF2.ItemName))) LIKE '%' + LOWER(LTRIM(RTRIM('${deptEsc}'))) + '%'
                    OR LOWER(LTRIM(RTRIM(EF2.ItemName))) LIKE '%' + LOWER(LTRIM(RTRIM('${deptEsc}'))) + '%'
                    OR (${deptNormEsc ? `LOWER(LTRIM(RTRIM(MEF2.ItemName))) LIKE '%' + N'${deptNormEsc}' + '%'
                    OR LOWER(LTRIM(RTRIM(EF2.ItemName))) LIKE '%' + N'${deptNormEsc}' + '%'` : '1=0'})
                )`
                : `1 = 1`;

        // Spec: pending = EnquiryPricingValues has price for (RequestNo + EnquiryForItem + LeadJobName + customer)
        // and no EnquiryQuotes row (latest revision) with TotalAmount > 0 for same RequestNo + OwnJob + LeadJob + ToName.
        const pvMatchesEfJobSql = `
            (
                (PV.EnquiryForID IS NOT NULL AND PV.EnquiryForID <> 0 AND PV.EnquiryForID = EF.ID)
                OR (
                    (PV.EnquiryForID IS NULL OR PV.EnquiryForID = 0)
                    AND LTRIM(RTRIM(ISNULL(PV.EnquiryForItem, N''))) = LTRIM(RTRIM(ISNULL(EF.ItemName, N'')))
                )
            )`;
        const latestPvTupleOnlySql = `
            NOT EXISTS (
                SELECT 1
                FROM EnquiryPricingValues PVN
                WHERE PVN.RequestNo = PV.RequestNo
                  AND LTRIM(RTRIM(ISNULL(PVN.EnquiryForItem, N''))) = LTRIM(RTRIM(ISNULL(PV.EnquiryForItem, N'')))
                  AND LTRIM(RTRIM(ISNULL(PVN.LeadJobName, N''))) = LTRIM(RTRIM(ISNULL(PV.LeadJobName, N'')))
                  AND LTRIM(RTRIM(ISNULL(PVN.CustomerName, N''))) = LTRIM(RTRIM(ISNULL(PV.CustomerName, N'')))
                  AND (
                        ISNULL(PVN.UpdatedAt, '19000101') > ISNULL(PV.UpdatedAt, '19000101')
                        OR (
                            ISNULL(PVN.UpdatedAt, '19000101') = ISNULL(PV.UpdatedAt, '19000101')
                            AND ISNULL(PVN.ID, 0) > ISNULL(PV.ID, 0)
                        )
                  )
            )`;
        // Pending rule:
        // Keep enquiry in pending when ANY priced tuple is still missing a quote.
        // Tuple = RequestNo + OwnJob + LeadJob + Customer.
        const noCompletedQuoteForSameTupleSql = `
            NOT EXISTS (
                SELECT 1
                FROM EnquiryQuotes EQ
                WHERE EQ.RequestNo = E.RequestNo
                AND LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(ISNULL(EQ.ToName, N''))), N' ', N''), N'.', N''), N',', N''), N'-', N''), N'&', N'and')) =
                    LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(ISNULL(PV.CustomerName, N''))), N' ', N''), N'.', N''), N',', N''), N'-', N''), N'&', N'and'))
                AND (
                    LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(ISNULL(EQ.OwnJob, N''))), N' ', N''), N'.', N''), N',', N''), N'-', N''), N'&', N'and')) =
                    LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(ISNULL(PV.EnquiryForItem, N''))), N' ', N''), N'.', N''), N',', N''), N'-', N''), N'&', N'and'))
                    OR (
                        LEN(LTRIM(ISNULL(EQ.OwnJob, N''))) >= 2
                        AND LOWER(LTRIM(RTRIM(ISNULL(PV.EnquiryForItem, N'')))) LIKE N'%' + LOWER(LTRIM(RTRIM(ISNULL(EQ.OwnJob, N'')))) + N'%'
                    )
                )
                AND (
                    LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(ISNULL(EQ.LeadJob, N''))), N' ', N''), N'.', N''), N',', N''), N'-', N''), N'&', N'and')) =
                    LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(ISNULL(PV.LeadJobName, N''))), N' ', N''), N'.', N''), N',', N''), N'-', N''), N'&', N'and'))
                    OR (
                        LEN(LTRIM(ISNULL(EQ.LeadJob, N''))) >= 2
                        AND LOWER(LTRIM(RTRIM(ISNULL(PV.LeadJobName, N'')))) LIKE N'%' + LOWER(LTRIM(RTRIM(ISNULL(EQ.LeadJob, N'')))) + N'%'
                    )
                )
                AND EQ.RevisionNo = (SELECT MAX(EQ2.RevisionNo) FROM EnquiryQuotes EQ2 WHERE EQ2.QuoteNo = EQ.QuoteNo)
                AND ISNULL(EQ.TotalAmount, 0) > 0
            )`;

        // Align list "Quote ref. / date / amount" with the same pending tuple as PV (own job + lead + customer),
        // not MAX(QuoteNo) across the whole enquiry (which mixed branches and broke the summary).
        const quoteMatchesPvTupleSql = (alias) => `
            LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(ISNULL(${alias}.ToName, N''))), N' ', N''), N'.', N''), N',', N''), N'-', N''), N'&', N'and')) =
                LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(ISNULL(PV.CustomerName, N''))), N' ', N''), N'.', N''), N',', N''), N'-', N''), N'&', N'and'))
            AND (
                LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(ISNULL(${alias}.OwnJob, N''))), N' ', N''), N'.', N''), N',', N''), N'-', N''), N'&', N'and')) =
                LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(ISNULL(PV.EnquiryForItem, N''))), N' ', N''), N'.', N''), N',', N''), N'-', N''), N'&', N'and'))
                OR (
                    LEN(LTRIM(ISNULL(${alias}.OwnJob, N''))) >= 2
                    AND LOWER(LTRIM(RTRIM(ISNULL(PV.EnquiryForItem, N'')))) LIKE N'%' + LOWER(LTRIM(RTRIM(ISNULL(${alias}.OwnJob, N'')))) + N'%'
                )
            )
            AND (
                LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(ISNULL(${alias}.LeadJob, N''))), N' ', N''), N'.', N''), N',', N''), N'-', N''), N'&', N'and')) =
                LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(ISNULL(PV.LeadJobName, N''))), N' ', N''), N'.', N''), N',', N''), N'-', N''), N'&', N'and'))
                OR (
                    LEN(LTRIM(ISNULL(${alias}.LeadJob, N''))) >= 2
                    AND LOWER(LTRIM(RTRIM(ISNULL(PV.LeadJobName, N'')))) LIKE N'%' + LOWER(LTRIM(RTRIM(ISNULL(${alias}.LeadJob, N'')))) + N'%'
                )
            )`;

        let query;
        if (userEmail && !isAdmin) {
            const enforceAssignedOnly = !isCcUser;
            // Match ConcernedSE by login email via Master_ConcernedSE (FullName-only match fails when FullName is NULL or mismatched).
            const assignedOnlyClause = enforceAssignedOnly
                ? `
                AND EXISTS (
                    SELECT 1
                    FROM ConcernedSE cs
                    INNER JOIN Master_ConcernedSE m ON UPPER(LTRIM(RTRIM(ISNULL(m.FullName, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(cs.SEName, N''))))
                    WHERE LTRIM(RTRIM(ISNULL(cs.RequestNo, N''))) = LTRIM(RTRIM(ISNULL(E.RequestNo, N'')))
                      AND LOWER(LTRIM(RTRIM(m.EmailId))) = LOWER(LTRIM(N'${uEsc}'))
                )
                `
                : '';
            // Refined logic for specific user's division
            query = `
                SELECT DISTINCT 
                    E.RequestNo, E.ProjectName, E.CustomerName, E.ClientName, E.ConsultantName, E.EnquiryDate, E.DueDate, E.Status,
                    LTRIM(RTRIM(ISNULL(PV.EnquiryForItem, N''))) AS ListPendingOwnJobItem,
                    LTRIM(RTRIM(ISNULL(PV.LeadJobName, N''))) AS ListPendingLeadJobName,
                    LTRIM(RTRIM(ISNULL(PV.CustomerName, N''))) AS ListPendingCustomerName,
                    ISNULL(PV.ID, 0) AS ListPendingPvId,
                    (
                        SELECT TOP 1 LTRIM(RTRIM(ISNULL(qtRef.QuoteNumber, N'')))
                        FROM EnquiryQuotes qtRef
                        WHERE qtRef.RequestNo = E.RequestNo
                          AND ${quoteMatchesPvTupleSql('qtRef')}
                        ORDER BY qtRef.QuoteNo DESC, qtRef.RevisionNo DESC
                    ) as ListQuoteRef,
                    (
                        SELECT TOP 1 qtDt.QuoteDate
                        FROM EnquiryQuotes qtDt
                        WHERE qtDt.RequestNo = E.RequestNo
                          AND ${quoteMatchesPvTupleSql('qtDt')}
                        ORDER BY qtDt.QuoteNo DESC, qtDt.RevisionNo DESC
                    ) as ListQuoteDate,
                    (
                        SELECT TOP 1 LTRIM(RTRIM(ISNULL(qtPb.PreparedBy, N'')))
                        FROM EnquiryQuotes qtPb
                        WHERE qtPb.RequestNo = E.RequestNo
                          AND ${quoteMatchesPvTupleSql('qtPb')}
                        ORDER BY qtPb.QuoteNo DESC, qtPb.RevisionNo DESC
                    ) as ListPreparedBy,
                    (
                        SELECT TOP 1 LTRIM(RTRIM(ISNULL(qtOj.OwnJob, N'')))
                        FROM EnquiryQuotes qtOj
                        WHERE qtOj.RequestNo = E.RequestNo
                          AND ${quoteMatchesPvTupleSql('qtOj')}
                        ORDER BY qtOj.QuoteNo DESC, qtOj.RevisionNo DESC
                    ) as ListQuoteOwnJob,
                    (
                        SELECT TOP 1 ISNULL(qtTa.TotalAmount, 0)
                        FROM EnquiryQuotes qtTa
                        WHERE qtTa.RequestNo = E.RequestNo
                          AND ${quoteMatchesPvTupleSql('qtTa')}
                        ORDER BY qtTa.QuoteNo DESC, qtTa.RevisionNo DESC
                    ) as ListQuoteTotalAmount,
                    (
                        SELECT STUFF((
                            SELECT DISTINCT ';;' + qt.ToName + '|' + FORMAT(ISNULL(qt.TotalAmount, 0), 'N2')
                            FROM EnquiryQuotes qt
                            WHERE qt.RequestNo = E.RequestNo
                            AND ISNULL(qt.TotalAmount, 0) > 0
                            AND qt.RevisionNo = (
                                SELECT MAX(rx.RevisionNo) 
                                FROM EnquiryQuotes rx 
                                WHERE rx.QuoteNo = qt.QuoteNo
                            )
                            FOR XML PATH(''), TYPE
                        ).value('.', 'NVARCHAR(MAX)'), 1, 2, '')
                    ) as QuotedCustomers,
                    (
                        SELECT STUFF((
                            SELECT ', ' + ItemName 
                            FROM EnquiryFor 
                            WHERE RequestNo = E.RequestNo 
                            FOR XML PATH('')
                        ), 1, 2, '')
                    ) as Divisions,
                    (
                        SELECT STUFF((
                            SELECT ';;' + CustomerName + '|' + CAST(SUM(LatestPrice) AS VARCHAR)
                            FROM (
                                SELECT 
                                    po2.CustomerName,
                                    pv2.Price as LatestPrice,
                                    ROW_NUMBER() OVER (
                                        PARTITION BY po2.CustomerName, ISNULL(CAST(pv2.EnquiryForID AS VARCHAR), pv2.EnquiryForItem) 
                                        ORDER BY pv2.UpdatedAt DESC
                                    ) as rn
                                FROM EnquiryPricingOptions po2
                                JOIN EnquiryPricingValues pv2 ON po2.ID = pv2.OptionID
                                WHERE po2.RequestNo = E.RequestNo
                            ) t
                            WHERE rn = 1
                            GROUP BY CustomerName
                            HAVING SUM(LatestPrice) > 0
                            FOR XML PATH(''), TYPE
                        ).value('.', 'NVARCHAR(MAX)'), 1, 2, '')
                    ) as PricingCustomerDetails,
                    (
                        SELECT STUFF((
                            SELECT DISTINCT ',' + CAST(EF2.ID AS VARCHAR)
                            FROM EnquiryFor EF2
                            JOIN Master_EnquiryFor MEF2 ON (
                                EF2.ItemName = MEF2.ItemName OR 
                                EF2.ItemName LIKE '%- ' + MEF2.ItemName OR 
                                EF2.ItemName LIKE '%- ' + MEF2.DivisionCode OR
                                MEF2.ItemName LIKE '%' + EF2.ItemName + '%'
                            )
                            WHERE EF2.RequestNo = E.RequestNo
                            AND (${scopedJobIdsSubquery})
                            FOR XML PATH(''), TYPE
                        ).value('.', 'NVARCHAR(MAX)'), 1, 1, '')
                    ) as ScopedJobIDs
                FROM EnquiryMaster E
                JOIN EnquiryPricingOptions PO ON E.RequestNo = PO.RequestNo
                JOIN EnquiryPricingValues PV ON PO.ID = PV.OptionID
                JOIN EnquiryFor EF ON E.RequestNo = EF.RequestNo
                WHERE PV.Price > 0
                AND LTRIM(RTRIM(ISNULL(PV.EnquiryForItem, N''))) <> N''
                AND LTRIM(RTRIM(ISNULL(PV.LeadJobName, N''))) <> N''
                AND LTRIM(RTRIM(ISNULL(PV.CustomerName, N''))) <> N''
                AND EXISTS (
                    SELECT 1
                    FROM Master_EnquiryFor MEF
                    WHERE (
                        EF.ItemName = MEF.ItemName OR
                        EF.ItemName LIKE N'%- ' + MEF.ItemName OR
                        EF.ItemName LIKE N'%- ' + MEF.DivisionCode OR
                        MEF.ItemName LIKE N'%' + EF.ItemName + N'%'
                    )
                    AND (${mefAccessPredicate})
                )
                ${assignedOnlyClause}
                AND (
                    EF.ItemName = PO.ItemName OR 
                    EF.ItemName LIKE PO.ItemName + '%' OR 
                    PO.ItemName LIKE EF.ItemName + '%'
                )
                AND ${pvMatchesEfJobSql}
                AND ${latestPvTupleOnlySql}
                AND ${noCompletedQuoteForSameTupleSql}
                ${extraWhereSql}
                ORDER BY E.DueDate DESC, E.RequestNo DESC
            `;
        } else {
            // Admin or Fallback (Show all with prices but no quotes)
            query = `
                SELECT DISTINCT 
                    E.RequestNo, E.ProjectName, E.CustomerName, E.ClientName, E.ConsultantName, E.EnquiryDate, E.DueDate, E.Status,
                    LTRIM(RTRIM(ISNULL(PV.EnquiryForItem, N''))) AS ListPendingOwnJobItem,
                    LTRIM(RTRIM(ISNULL(PV.LeadJobName, N''))) AS ListPendingLeadJobName,
                    LTRIM(RTRIM(ISNULL(PV.CustomerName, N''))) AS ListPendingCustomerName,
                    ISNULL(PV.ID, 0) AS ListPendingPvId,
                    (
                        SELECT TOP 1 LTRIM(RTRIM(ISNULL(qtRef.QuoteNumber, N'')))
                        FROM EnquiryQuotes qtRef
                        WHERE qtRef.RequestNo = E.RequestNo
                          AND ${quoteMatchesPvTupleSql('qtRef')}
                        ORDER BY qtRef.QuoteNo DESC, qtRef.RevisionNo DESC
                    ) as ListQuoteRef,
                    (
                        SELECT TOP 1 qtDt.QuoteDate
                        FROM EnquiryQuotes qtDt
                        WHERE qtDt.RequestNo = E.RequestNo
                          AND ${quoteMatchesPvTupleSql('qtDt')}
                        ORDER BY qtDt.QuoteNo DESC, qtDt.RevisionNo DESC
                    ) as ListQuoteDate,
                    (
                        SELECT TOP 1 LTRIM(RTRIM(ISNULL(qtPb.PreparedBy, N'')))
                        FROM EnquiryQuotes qtPb
                        WHERE qtPb.RequestNo = E.RequestNo
                          AND ${quoteMatchesPvTupleSql('qtPb')}
                        ORDER BY qtPb.QuoteNo DESC, qtPb.RevisionNo DESC
                    ) as ListPreparedBy,
                    (
                        SELECT TOP 1 LTRIM(RTRIM(ISNULL(qtOj.OwnJob, N'')))
                        FROM EnquiryQuotes qtOj
                        WHERE qtOj.RequestNo = E.RequestNo
                          AND ${quoteMatchesPvTupleSql('qtOj')}
                        ORDER BY qtOj.QuoteNo DESC, qtOj.RevisionNo DESC
                    ) as ListQuoteOwnJob,
                    (
                        SELECT TOP 1 ISNULL(qtTa.TotalAmount, 0)
                        FROM EnquiryQuotes qtTa
                        WHERE qtTa.RequestNo = E.RequestNo
                          AND ${quoteMatchesPvTupleSql('qtTa')}
                        ORDER BY qtTa.QuoteNo DESC, qtTa.RevisionNo DESC
                    ) as ListQuoteTotalAmount,
                    (
                        SELECT STUFF((
                            SELECT DISTINCT ';;' + qt.ToName + '|' + FORMAT(ISNULL(qt.TotalAmount, 0), 'N2')
                            FROM EnquiryQuotes qt
                            WHERE qt.RequestNo = E.RequestNo
                            AND ISNULL(qt.TotalAmount, 0) > 0
                            AND qt.RevisionNo = (
                                SELECT MAX(rx.RevisionNo) 
                                FROM EnquiryQuotes rx 
                                WHERE rx.QuoteNo = qt.QuoteNo
                            )
                            FOR XML PATH(''), TYPE
                        ).value('.', 'NVARCHAR(MAX)'), 1, 2, '')
                    ) as QuotedCustomers,
                    (
                        SELECT STUFF((
                            SELECT ', ' + ItemName 
                            FROM EnquiryFor 
                            WHERE RequestNo = E.RequestNo 
                            FOR XML PATH('')
                        ), 1, 2, '')
                    ) as Divisions,
                    (
                        SELECT STUFF((
                            SELECT ';;' + CustomerName + '|' + CAST(SUM(LatestPrice) AS VARCHAR)
                            FROM (
                                SELECT 
                                    po2.CustomerName,
                                    pv2.Price as LatestPrice,
                                    ROW_NUMBER() OVER (
                                        PARTITION BY po2.CustomerName, ISNULL(CAST(pv2.EnquiryForID AS VARCHAR), pv2.EnquiryForItem) 
                                        ORDER BY pv2.UpdatedAt DESC
                                    ) as rn
                                FROM EnquiryPricingOptions po2
                                JOIN EnquiryPricingValues pv2 ON po2.ID = pv2.OptionID
                                WHERE po2.RequestNo = E.RequestNo
                            ) t
                            WHERE rn = 1
                            GROUP BY CustomerName
                            HAVING SUM(LatestPrice) > 0
                            FOR XML PATH(''), TYPE
                        ).value('.', 'NVARCHAR(MAX)'), 1, 2, '')
                    ) as PricingCustomerDetails,
                    (
                        SELECT STUFF((
                            SELECT DISTINCT ',' + CAST(ID AS VARCHAR)
                            FROM EnquiryFor
                            WHERE RequestNo = E.RequestNo AND (ParentID IS NULL OR ParentID = '0' OR ParentID = 0)
                            FOR XML PATH(''), TYPE
                        ).value('.', 'NVARCHAR(MAX)'), 1, 1, '')
                    ) as ScopedJobIDs
                FROM EnquiryMaster E
                JOIN EnquiryPricingOptions PO ON E.RequestNo = PO.RequestNo
                JOIN EnquiryPricingValues PV ON PO.ID = PV.OptionID
                JOIN EnquiryFor EF ON E.RequestNo = EF.RequestNo
                WHERE PV.Price > 0
                AND LTRIM(RTRIM(ISNULL(PV.EnquiryForItem, N''))) <> N''
                AND LTRIM(RTRIM(ISNULL(PV.LeadJobName, N''))) <> N''
                AND LTRIM(RTRIM(ISNULL(PV.CustomerName, N''))) <> N''
                AND EXISTS (
                    SELECT 1
                    FROM Master_EnquiryFor MEF
                    WHERE (
                        EF.ItemName = MEF.ItemName OR
                        EF.ItemName LIKE N'%- ' + MEF.ItemName OR
                        MEF.ItemName LIKE N'%' + EF.ItemName + N'%'
                    )
                )
                AND (
                    EF.ItemName = PO.ItemName OR 
                    EF.ItemName LIKE PO.ItemName + '%' OR 
                    PO.ItemName LIKE EF.ItemName + '%'
                )
                AND ${pvMatchesEfJobSql}
                AND ${latestPvTupleOnlySql}
                AND ${noCompletedQuoteForSameTupleSql}
                ${extraWhereSql}
                ORDER BY E.DueDate DESC, E.RequestNo DESC
            `;
        }
    const result = await sqlConn.query(query);
    return { enquiries: result.recordset || [], accessCtx, userEmail };
}

module.exports = runPendingQuoteListQuery;

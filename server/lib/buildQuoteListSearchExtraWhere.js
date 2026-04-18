'use strict';

/**
 * Builds optional SQL fragments for /list/search (applied to EnquiryMaster E).
 * Valid when: non-empty search text, OR both enquiry date bounds are provided.
 *
 * Text search (case-insensitive substring) matches any of:
 * quote ref (EnquiryQuotes.QuoteNumber), project name, enquiry no., customer name,
 * client name, consultant name, prepared by (EnquiryQuotes.PreparedBy).
 */
function buildQuoteListSearchExtraWhere(qRaw, dateFrom, dateTo) {
    const q = (qRaw || '').trim();
    const d1 = (dateFrom || '').trim();
    const d2 = (dateTo || '').trim();
    const bothDates = !!(d1 && d2);
    if (!q && !bothDates) {
        return { ok: false, sql: '' };
    }

    const lit = (s) => String(s || '').replace(/'/g, "''");
    const qqLower = q ? lit(q).toLowerCase() : '';

    let textSql = '';
    if (q) {
        textSql = `AND (
      CHARINDEX(N'${qqLower}', LOWER(CAST(E.RequestNo AS NVARCHAR(100)))) > 0
      OR CHARINDEX(N'${qqLower}', LOWER(LTRIM(RTRIM(ISNULL(E.ProjectName, N''))))) > 0
      OR CHARINDEX(N'${qqLower}', LOWER(LTRIM(RTRIM(ISNULL(E.CustomerName, N''))))) > 0
      OR CHARINDEX(N'${qqLower}', LOWER(LTRIM(RTRIM(ISNULL(E.ClientName, N''))))) > 0
      OR CHARINDEX(N'${qqLower}', LOWER(LTRIM(RTRIM(ISNULL(E.ConsultantName, N''))))) > 0
      OR EXISTS (
        SELECT 1 FROM EnquiryQuotes qtRefSrch
        WHERE LTRIM(RTRIM(qtRefSrch.RequestNo)) = LTRIM(RTRIM(E.RequestNo))
          AND CHARINDEX(N'${qqLower}', LOWER(LTRIM(RTRIM(ISNULL(qtRefSrch.QuoteNumber, N''))))) > 0
      )
      OR EXISTS (
        SELECT 1 FROM EnquiryQuotes qtPbSrch
        WHERE LTRIM(RTRIM(qtPbSrch.RequestNo)) = LTRIM(RTRIM(E.RequestNo))
          AND CHARINDEX(N'${qqLower}', LOWER(LTRIM(RTRIM(ISNULL(qtPbSrch.PreparedBy, N''))))) > 0
      )
    )`;
    }

    let dateSql = '';
    if (d1 && d2) {
        dateSql = `AND CAST(E.EnquiryDate AS DATE) >= '${lit(d1)}' AND CAST(E.EnquiryDate AS DATE) <= '${lit(d2)}'`;
    } else if (d1) {
        dateSql = `AND CAST(E.EnquiryDate AS DATE) >= '${lit(d1)}'`;
    } else if (d2) {
        dateSql = `AND CAST(E.EnquiryDate AS DATE) <= '${lit(d2)}'`;
    }

    const sql = `${textSql} ${dateSql}`.trim();
    return { ok: true, sql: sql.length ? `\n                ${sql}` : '' };
}

module.exports = buildQuoteListSearchExtraWhere;

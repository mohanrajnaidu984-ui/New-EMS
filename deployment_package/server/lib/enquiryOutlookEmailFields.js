/**
 * Resolve To (all concerned SEs) and CC (Master_EnquiryFor CCMailIds) for enquiry Outlook draft.
 */
const { sql } = require('../dbConfig');

/** Never include these addresses in enquiry notification CC. */
const CC_EXCLUDED_EMAILS = new Set([
    'lohidas@almoayyedcg.com',
    'mathews@almoayyedcg.com',
    'hala@almoayyedcg.com',
]);

function parseMailCsv(raw) {
    return String(raw || '')
        .split(/[;,]/g)
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);
}

function normalizeEmail(email) {
    return String(email || '')
        .trim()
        .toLowerCase()
        .replace(/@almcg\.com$/i, '@almoayyedcg.com');
}

function isExcludedCcEmail(email) {
    return CC_EXCLUDED_EMAILS.has(normalizeEmail(email));
}

function uniqueSeNames(names) {
    const seen = new Set();
    const out = [];
    for (const raw of names || []) {
        const name = String(raw || '').trim();
        if (!name) continue;
        const key = name.toUpperCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(name);
    }
    return out;
}

async function loadConcernedSeNamesFromDb(requestNo) {
    const reqNo = String(requestNo || '').trim();
    if (!reqNo) return [];

    const csRes = await sql.query`
        SELECT LTRIM(RTRIM(ISNULL(SEName, N''))) AS SeName
        FROM ConcernedSE
        WHERE RequestNo = ${reqNo}
          AND LTRIM(RTRIM(ISNULL(SEName, N''))) <> N''
        ORDER BY ID
    `;
    return uniqueSeNames((csRes.recordset || []).map((r) => r.SeName));
}

async function resolveToEmailsForSeNames(seNames) {
    const names = uniqueSeNames(seNames);
    if (!names.length) return [];

    const toSet = new Set();
    for (const seName of names) {
        const toRes = await sql.query`
            SELECT TOP 1 LOWER(LTRIM(RTRIM(EmailId))) AS EmailIdNorm
            FROM Master_ConcernedSE
            WHERE UPPER(LTRIM(RTRIM(ISNULL(FullName, N'')))) = UPPER(LTRIM(RTRIM(${seName})))
              AND LTRIM(RTRIM(ISNULL(EmailId, N''))) <> N''
        `;
        const email = toRes.recordset?.[0]?.EmailIdNorm;
        if (email) {
            toSet.add(normalizeEmail(email));
        }
    }
    return [...toSet];
}

/**
 * @param {string} requestNo
 * @param {{ concernedSEs?: string[] }} [options] - Optional SE names from form (used if DB not yet visible)
 */
async function resolveEnquiryOutlookEmailFields(requestNo, options = {}) {
    const reqNo = String(requestNo || '').trim();
    const ccSet = new Set();

    let seNames = uniqueSeNames(options.concernedSEs);
    if (!seNames.length && reqNo) {
        seNames = await loadConcernedSeNamesFromDb(reqNo);
    }

    const toEmails = await resolveToEmailsForSeNames(seNames);
    const toSet = new Set(toEmails);

    if (reqNo) {
        try {
            const ccRes = await sql.query`
                SELECT DISTINCT M.CCMailIds
                FROM dbo.EnquiryFor E
                INNER JOIN dbo.Master_EnquiryFor M ON (
                    E.ItemName = M.ItemName
                    OR E.ItemName LIKE N'% - ' + M.ItemName
                    OR E.ItemName LIKE N'%- ' + M.ItemName
                    OR E.ItemName LIKE M.ItemName + N' %'
                )
                WHERE E.RequestNo = ${reqNo}
                  AND LTRIM(RTRIM(ISNULL(M.CCMailIds, N''))) <> N''
            `;
            for (const row of ccRes.recordset || []) {
                parseMailCsv(row.CCMailIds).forEach((e) => {
                    const norm = normalizeEmail(e);
                    if (!isExcludedCcEmail(norm)) {
                        ccSet.add(norm);
                    }
                });
            }
        } catch (err) {
            console.error('[enquiry-outlook] CC lookup failed:', err.message);
        }
    }

    for (const toEmail of toSet) {
        ccSet.delete(toEmail);
    }

    return {
        to: [...toSet].join('; '),
        toList: [...toSet],
        cc: [...ccSet].join('; '),
        ccList: [...ccSet],
        seNames,
    };
}

module.exports = {
    resolveEnquiryOutlookEmailFields,
    resolveToEmailsForSeNames,
    loadConcernedSeNamesFromDb,
    parseMailCsv,
    normalizeEmail,
    isExcludedCcEmail,
    CC_EXCLUDED_EMAILS,
};

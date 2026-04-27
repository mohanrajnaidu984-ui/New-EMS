/**
 * Shared access rules for Pricing and Quote modules:
 * - CC coordinators: Master_EnquiryFor.CCMailIds contains login email (CommonMailIds alone does not).
 *   They may have no Master_ConcernedSE row — we still resolve a synthetic `user` so pricing list/divisions work.
 * - Assigned sales engineers: ConcernedSE.SEName = FullName, scoped by department ↔ EnquiryFor.ItemName (+ subjobs).
 */
const sql = require('mssql');

function normalizePricingEmail(email) {
    return (email || '').trim().toLowerCase().replace(/@almcg\.com$/i, '@almoayyedcg.com');
}

async function resolvePricingAccessContext(userEmail) {
    const raw = (userEmail || '').trim();
    const normalizedEmail = normalizePricingEmail(raw);
    if (!normalizedEmail) {
        return {
            user: null,
            isAdmin: false,
            isCcUser: false,
            normalizedEmail: '',
            userFullName: '',
            userDepartment: '',
            ccCoordinatorDepartmentNames: null,
        };
    }
    const userRes = await sql.query`
        SELECT FullName, Roles, Department FROM Master_ConcernedSE
        WHERE LOWER(REPLACE(REPLACE(LTRIM(RTRIM(ISNULL(EmailId, N''))), N'@almcg.com', N'@almoayyedcg.com'), N'@ALMCG.COM', N'@almoayyedcg.com')) = ${normalizedEmail}`;
    let user = userRes.recordset[0];

    const localPart = (normalizedEmail.split('@')[0] || '').trim();
    const ccListPatFull = `%,${normalizedEmail},%`;
    const ccListPatLocal = localPart.length >= 2 ? `%,${localPart},%` : null;

    let isCcFromMaster = false;
    const ccResFull = await sql.query`
        SELECT TOP 1 1 AS ok
        FROM dbo.Master_EnquiryFor
        WHERE N',' + REPLACE(REPLACE(ISNULL(CCMailIds, N''), N' ', N''), N';', N',') + N','
            LIKE ${ccListPatFull}
    `;
    if ((ccResFull.recordset?.length || 0) > 0) {
        isCcFromMaster = true;
    } else if (ccListPatLocal) {
        const ccResLocal = await sql.query`
            SELECT TOP 1 1 AS ok
            FROM dbo.Master_EnquiryFor
            WHERE N',' + REPLACE(REPLACE(ISNULL(CCMailIds, N''), N' ', N''), N';', N',') + N','
                LIKE ${ccListPatLocal}
        `;
        isCcFromMaster = (ccResLocal.recordset?.length || 0) > 0;
    }

    if (!user) {
        if (!isCcFromMaster) {
            return {
                user: null,
                isAdmin: false,
                isCcUser: false,
                normalizedEmail,
                userFullName: '',
                userDepartment: '',
                ccCoordinatorDepartmentNames: null,
            };
        }
        /** CC-only coordinators often have no Master_ConcernedSE row; still need a session for pricing list / anchors. */
        user = {
            FullName: localPart || normalizedEmail,
            Roles: '',
            Department: '',
        };
    }

    const roleStr = String(user.Roles || '').toLowerCase();
    const isAdmin = roleStr.includes('admin') || roleStr.includes('system');
    const isCcUser = isCcFromMaster;

    /** Departments where this user appears on any Master_EnquiryFor.CCMailIds (used to align list anchors with division dropdown). */
    let ccCoordinatorDepartmentNames = null;
    if (isCcUser) {
        const deptRes = ccListPatLocal
            ? await sql.query`
                SELECT DISTINCT LTRIM(RTRIM(ISNULL(DepartmentName, N''))) AS DepartmentName
                FROM dbo.Master_EnquiryFor
                WHERE LTRIM(RTRIM(ISNULL(DepartmentName, N''))) <> N''
                  AND (
                    N',' + REPLACE(REPLACE(ISNULL(CCMailIds, N''), N' ', N''), N';', N',') + N','
                        LIKE ${ccListPatFull}
                    OR N',' + REPLACE(REPLACE(ISNULL(CCMailIds, N''), N' ', N''), N';', N',') + N','
                        LIKE ${ccListPatLocal}
                  )
            `
            : await sql.query`
                SELECT DISTINCT LTRIM(RTRIM(ISNULL(DepartmentName, N''))) AS DepartmentName
                FROM dbo.Master_EnquiryFor
                WHERE LTRIM(RTRIM(ISNULL(DepartmentName, N''))) <> N''
                  AND N',' + REPLACE(REPLACE(ISNULL(CCMailIds, N''), N' ', N''), N';', N',') + N','
                      LIKE ${ccListPatFull}
            `;
        ccCoordinatorDepartmentNames = new Set(
            (deptRes.recordset || [])
                .map((r) => String(r.DepartmentName || '').trim().toLowerCase())
                .filter(Boolean)
        );
    }
    return {
        user,
        isAdmin,
        isCcUser,
        normalizedEmail,
        userFullName: (user.FullName || '').trim(),
        userDepartment: (user.Department || '').trim(),
        ccCoordinatorDepartmentNames,
    };
}

function ccMailIdsContainsUser(ccMailIdsStr, userEmail) {
    const e = normalizePricingEmail(userEmail);
    if (!e) return false;
    const raw = String(ccMailIdsStr || '').replace(/@almcg\.com/gi, '@almoayyedcg.com');
    const list = ',' + raw.replace(/\s/g, '').replace(/;/g, ',').toLowerCase() + ',';
    if (list.includes(',' + e + ',')) return true;
    const local = e.split('@')[0];
    return local.length > 0 && list.includes(',' + local + ',');
}

function jobIdOfPricing(j) {
    return (j && (j.ID ?? j.id)) ?? null;
}

function normalizePricingJobName(s) {
    return (s || '').toString().replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim().toLowerCase();
}

/** Jobs on this enquiry whose ItemName matches Master.Department (used for SE scoping and pending checks). */
function getDepartmentPricingAnchors(enqJobs, userDepartment) {
    const myJobs = [];
    const deptNorm = normalizePricingJobName(userDepartment);
    if (!deptNorm) return myJobs;
    enqJobs.forEach((job) => {
        const jNorm = normalizePricingJobName(job.ItemName);
        const deptAnchors =
            jNorm === deptNorm ||
            (deptNorm.length >= 3 && jNorm.includes(deptNorm)) ||
            (deptNorm.length >= 3 && deptNorm.includes(jNorm));
        if (deptAnchors) {
            const jId = jobIdOfPricing(job);
            if (jId != null && !myJobs.find((x) => String(jobIdOfPricing(x)) === String(jId))) {
                myJobs.push(job);
            }
        }
    });
    return myJobs;
}

function getPricingAnchorJobs(enqJobs, ctx, userEmail) {
    const { isAdmin, isCcUser, userDepartment } = ctx;
    if (isAdmin) return [...enqJobs];
    let myJobs = [];
    if (isCcUser) {
        enqJobs.forEach(job => {
            if (ccMailIdsContainsUser(job.CCMailIds, userEmail)) {
                const jId = jobIdOfPricing(job);
                if (jId != null && !myJobs.find(x => String(jobIdOfPricing(x)) === String(jId))) {
                    myJobs.push(job);
                }
            }
        });
    } else {
        myJobs = getDepartmentPricingAnchors(enqJobs, userDepartment);
    }
    return myJobs;
}

/**
 * True when a job row (EnquiryFor + MEF) belongs to a session "Division" filter (Master_EnquiryFor.DepartmentName
 * or fuzzy ItemName match, same as {@link getDepartmentPricingAnchors} when MEF has no DepartmentName on this row).
 */
function jobBelongsToSessionDivision(job, divTrim) {
    const d = (divTrim || '').trim();
    if (!d) return true;
    const mefDept = (job.DepartmentName ?? job.departmentName ?? '').toString().trim();
    if (mefDept) {
        return mefDept.toLowerCase() === d.toLowerCase();
    }
    return getDepartmentPricingAnchors([job], d).length > 0;
}

/**
 * Like {@link getPricingAnchorJobs} but when `sessionDivision` is set, anchors are limited to that division
 * (Pricing module dropdown). Empty string keeps legacy behaviour.
 */
function getPricingAnchorJobsForDivision(enqJobs, ctx, userEmail, sessionDivision) {
    const d = (sessionDivision || '').trim();
    if (!d) {
        return getPricingAnchorJobs(enqJobs, ctx, userEmail);
    }
    const { isAdmin, isCcUser } = ctx;
    if (isAdmin) {
        return enqJobs.filter((job) => jobBelongsToSessionDivision(job, d));
    }
    if (isCcUser) {
        const divLower = d.toLowerCase();
        const globalDivCc = ctx.ccCoordinatorDepartmentNames && ctx.ccCoordinatorDepartmentNames.has(divLower);
        return enqJobs.filter((job) => {
            if (!jobBelongsToSessionDivision(job, d)) return false;
            if (ccMailIdsContainsUser(job.CCMailIds, userEmail)) return true;
            /** Same pending scope as division dropdown: user coordinates this department on master even if this enquiry’s MEF row omits them in CCMailIds. */
            if (globalDivCc) return true;
            return false;
        });
    }
    return getDepartmentPricingAnchors(enqJobs, d);
}

function expandVisibleJobIdsFromAnchors(anchorJobs, enqJobs) {
    const visibleJobs = new Set();
    const queue = [...anchorJobs];
    const processed = new Set();
    while (queue.length > 0) {
        const currentJob = queue.pop();
        const currIdStr = String(jobIdOfPricing(currentJob));
        if (!currIdStr || currIdStr === 'undefined') continue;
        if (processed.has(currIdStr)) continue;
        processed.add(currIdStr);
        visibleJobs.add(currIdStr);
        const children = enqJobs.filter(child => child.ParentID && String(child.ParentID) === currIdStr);
        children.forEach(c => {
            const cid = jobIdOfPricing(c);
            if (cid != null && !processed.has(String(cid))) queue.push(c);
        });
    }
    return visibleJobs;
}

/**
 * Downward expansion from anchors, plus every ancestor (parent chain to each root).
 * Required so GET /api/pricing/:requestNo still returns all lead roots / branches the user is involved in
 * — expandVisibleJobIdsFromAnchors alone drops parents and hides multiple "Select Lead Job" roots.
 */
function expandVisibleJobIdsWithAncestors(anchorJobs, enqJobs) {
    const down = expandVisibleJobIdsFromAnchors(anchorJobs, enqJobs);
    const byId = new Map();
    enqJobs.forEach((j) => {
        const id = jobIdOfPricing(j);
        if (id != null && id !== '') {
            byId.set(String(id), j);
            if (typeof id === 'number' || (typeof id === 'string' && /^\d+$/.test(id))) {
                byId.set(Number(id), j);
            }
        }
    });
    const out = new Set(down);
    down.forEach((idStr) => {
        let cur = byId.get(idStr) || byId.get(Number(idStr));
        let safety = 0;
        while (cur && safety < 50) {
            const pid = cur.ParentID;
            if (pid == null || pid === '' || pid === 0 || pid === '0') break;
            const ps = String(pid);
            out.add(ps);
            cur = byId.get(ps) || byId.get(pid) || byId.get(Number(pid));
            safety++;
        }
    });
    return out;
}

/**
 * Enquiry-level gate + job anchors (matches pricing list/detail).
 */
async function userHasQuotePricingEnquiryAccess(userEmail, requestNo, sessionDivision = '') {
    const ctx = await resolvePricingAccessContext(userEmail);
    if (!ctx.user) return false;
    if (ctx.isAdmin) return true;
    const rn = parseInt(String(requestNo), 10);
    if (Number.isNaN(rn)) return false;
    const sessionDivTrim = (sessionDivision || '').toString().trim();

    if (!ctx.isCcUser) {
        /** Same gate as pending quote list: ConcernedSE row + login email on Master_ConcernedSE (not FullName-only). */
        const cse = await sql.query`
            SELECT TOP 1 1 AS ok
            FROM ConcernedSE cs
            INNER JOIN Master_ConcernedSE m ON UPPER(LTRIM(RTRIM(ISNULL(m.FullName, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(cs.SEName, N''))))
            WHERE LTRIM(RTRIM(ISNULL(cs.RequestNo, N''))) = LTRIM(RTRIM(CONVERT(NVARCHAR(50), ${rn})))
              AND LOWER(LTRIM(RTRIM(REPLACE(REPLACE(ISNULL(m.EmailId, N''), N'@almcg.com', N'@almoayyedcg.com'), N'@ALMCG.COM', N'@almoayyedcg.com')))) = ${ctx.normalizedEmail}
        `;
        if ((cse.recordset?.length || 0) === 0) return false;
    } else {
        const tdProfile = (ctx.userDepartment || '').trim();
        const deptNormProfile = normalizePricingJobName(tdProfile);
        const ccListPat = `%,${ctx.normalizedEmail},%`;
        let cc;
        if (sessionDivTrim) {
            cc = await sql.query`
                SELECT TOP 1 1 AS ok
                FROM EnquiryFor ef
                INNER JOIN Master_EnquiryFor mef ON (ef.ItemName = mef.ItemName OR ef.ItemName LIKE N'% - ' + mef.ItemName)
                WHERE ef.RequestNo = ${rn}
                  AND ',' + REPLACE(REPLACE(ISNULL(mef.CCMailIds, ''), ' ', ''), ';', ',') + ',' LIKE ${ccListPat}
                  AND LTRIM(RTRIM(ISNULL(mef.DepartmentName, N''))) = ${sessionDivTrim}
            `;
            if ((cc.recordset?.length || 0) === 0) {
                cc = await sql.query`
                    SELECT TOP 1 1 AS ok
                    FROM dbo.EnquiryFor efCcDiv
                    INNER JOIN dbo.Master_EnquiryFor mefCcDiv
                        ON (efCcDiv.ItemName = mefCcDiv.ItemName OR efCcDiv.ItemName LIKE N'% - ' + mefCcDiv.ItemName)
                    WHERE efCcDiv.RequestNo = ${rn}
                      AND LTRIM(RTRIM(ISNULL(mefCcDiv.DepartmentName, N''))) = ${sessionDivTrim}
                      AND EXISTS (
                          SELECT 1
                          FROM dbo.Master_EnquiryFor mefTpl
                          WHERE LTRIM(RTRIM(ISNULL(mefTpl.DepartmentName, N''))) = ${sessionDivTrim}
                            AND ',' + REPLACE(REPLACE(ISNULL(mefTpl.CCMailIds, ''), ' ', ''), ';', ',') + ',' LIKE ${ccListPat}
                      )
                `;
            }
        } else if (!tdProfile) {
            cc = await sql.query`
                SELECT TOP 1 1 AS ok
                FROM EnquiryFor ef
                INNER JOIN Master_EnquiryFor mef ON (ef.ItemName = mef.ItemName OR ef.ItemName LIKE N'% - ' + mef.ItemName)
                WHERE ef.RequestNo = ${rn}
                  AND ',' + REPLACE(REPLACE(ISNULL(mef.CCMailIds, ''), ' ', ''), ';', ',') + ',' LIKE ${ccListPat}
            `;
        } else {
            const deptLike = `%${tdProfile.toLowerCase()}%`;
            const normLike = `%${deptNormProfile}%`;
            cc = await sql.query`
                SELECT TOP 1 1 AS ok
                FROM EnquiryFor ef
                INNER JOIN Master_EnquiryFor mef ON (ef.ItemName = mef.ItemName OR ef.ItemName LIKE N'% - ' + mef.ItemName)
                WHERE ef.RequestNo = ${rn}
                  AND ',' + REPLACE(REPLACE(ISNULL(mef.CCMailIds, ''), ' ', ''), ';', ',') + ',' LIKE ${ccListPat}
                  AND (
                    LOWER(LTRIM(RTRIM(mef.ItemName))) LIKE ${deptLike}
                    OR LOWER(LTRIM(RTRIM(ef.ItemName))) LIKE ${deptLike}
                    OR LOWER(LTRIM(RTRIM(mef.ItemName))) LIKE ${normLike}
                    OR LOWER(LTRIM(RTRIM(ef.ItemName))) LIKE ${normLike}
                )
            `;
        }
        if ((cc.recordset?.length || 0) === 0) return false;
    }

    const jobsRes = await sql.query`
        SELECT EF.ID, EF.ParentID, EF.ItemName, MEF.CCMailIds AS CCMailIds
        FROM EnquiryFor EF
        LEFT JOIN Master_EnquiryFor MEF ON (EF.ItemName = MEF.ItemName OR EF.ItemName LIKE '% - ' + MEF.ItemName)
        WHERE EF.RequestNo = ${rn}
    `;
    const seen = new Set();
    const enqJobs = [];
    for (const row of jobsRes.recordset || []) {
        const jid = row.ID;
        if (jid == null || seen.has(String(jid))) continue;
        seen.add(String(jid));
        enqJobs.push(row);
    }
    const anchors = sessionDivTrim
        ? getPricingAnchorJobsForDivision(enqJobs, ctx, userEmail, sessionDivTrim)
        : getPricingAnchorJobs(enqJobs, ctx, userEmail);
    return anchors.length > 0;
}

module.exports = {
    normalizePricingEmail,
    resolvePricingAccessContext,
    ccMailIdsContainsUser,
    jobIdOfPricing,
    normalizePricingJobName,
    getDepartmentPricingAnchors,
    getPricingAnchorJobs,
    getPricingAnchorJobsForDivision,
    jobBelongsToSessionDivision,
    expandVisibleJobIdsFromAnchors,
    expandVisibleJobIdsWithAncestors,
    userHasQuotePricingEnquiryAccess,
};

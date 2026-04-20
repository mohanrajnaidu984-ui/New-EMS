// Pricing Module API Routes
const express = require('express');
const router = express.Router();
const sql = require('mssql');
const fs = require('fs');
const path = require('path');

// Debug log file
const debugLogPath = path.join(__dirname, 'pricing_debug.log');
function logToFile(message) {
    const timestamp = new Date().toISOString();
    fs.appendFileSync(debugLogPath, `[${timestamp}] ${message}\n`);
}

/**
 * node-mssql recordsets may use PascalCase, camelCase, or lowercase keys depending on driver/config.
 * Pending/quote logic expects stable field names.
 */
function firstDefined(obj, keys) {
    if (!obj || typeof obj !== 'object') return undefined;
    for (const k of keys) {
        if (obj[k] !== undefined && obj[k] !== null) return obj[k];
    }
    const byLower = {};
    for (const k of Object.keys(obj)) byLower[k.toLowerCase()] = k;
    for (const k of keys) {
        const actual = byLower[k.toLowerCase()];
        if (actual !== undefined && obj[actual] !== undefined && obj[actual] !== null) return obj[actual];
    }
    return undefined;
}

function normalizePricingValueRow(r) {
    if (!r || typeof r !== 'object') return r;
    return {
        ...r,
        ID: firstDefined(r, ['ID', 'id']),
        RequestNo: firstDefined(r, ['RequestNo', 'requestNo', 'requestno']),
        OptionID: firstDefined(r, ['OptionID', 'optionID', 'optionId', 'optionid']),
        EnquiryForID: firstDefined(r, ['EnquiryForID', 'enquiryForID', 'enquiryforid']),
        EnquiryForItem: firstDefined(r, ['EnquiryForItem', 'enquiryForItem', 'enquiryforitem']),
        Price: firstDefined(r, ['Price', 'price']),
        UpdatedAt: firstDefined(r, ['UpdatedAt', 'updatedAt', 'updatedat']),
        UpdatedBy: firstDefined(r, ['UpdatedBy', 'updatedBy', 'updatedby']),
        PriceOption: firstDefined(r, ['PriceOption', 'priceOption', 'priceoption']),
        CustomerName: firstDefined(r, ['CustomerName', 'customerName', 'customername']),
        LeadJobName: firstDefined(r, ['LeadJobName', 'leadJobName', 'leadjobname']),
        MatchedEnquiryForId: firstDefined(r, ['MatchedEnquiryForId', 'matchedEnquiryForId', 'matchedenquiryforid']),
        MatchedItemName: firstDefined(r, ['MatchedItemName', 'matchedItemName', 'matcheditemname']),
        MatchedParentId: firstDefined(r, ['MatchedParentId', 'matchedParentId', 'matchedparentid']),
    };
}

const {
    resolvePricingAccessContext,
    jobIdOfPricing,
    normalizePricingJobName,
    getPricingAnchorJobs,
    expandVisibleJobIdsFromAnchors,
    expandVisibleJobIdsWithAncestors,
} = require('../lib/quotePricingAccess');
const { filterJobsByDepartment } = require('../services/hierarchyService');

/** `yyyy-MM-dd` only — used for EnquiryDate bounds on non-pending list searches */
function parsePricingListYmd(s) {
    if (!s || typeof s !== 'string') return null;
    const t = s.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
    const [y, mo, d] = t.split('-').map(Number);
    const dt = new Date(y, mo - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
    return t;
}

// Helper to get Enquiry List with Pricing Tree
async function getEnquiryPricingList(userEmail, search = null, pendingOnly = true, opts = {}) {
    if (!userEmail) return [];

    const ctx = await resolvePricingAccessContext(userEmail);
    if (!ctx.user) return [];
    const { isAdmin, isCcUser, normalizedEmail, userDepartment } = ctx;

    // 2. Fetch Enquiries (SQL-scoped: CC coordinators vs assigned sales engineers only)
    const request = new sql.Request();
    let baseQuery = `
        SELECT 
            E.RequestNo, E.ProjectName, E.CustomerName, E.ClientName, E.ConsultantName, E.DueDate, E.Status, E.CreatedBy, E.EnquiryDate
        FROM EnquiryMaster E
        WHERE 1=1
    `;

    if (!isAdmin) {
        if (isCcUser) {
            request.input('pricingCcPattern', sql.NVarChar, `%,${normalizedEmail},%`);
            baseQuery += `
                AND EXISTS (
                    SELECT 1
                    FROM EnquiryFor ef
                    INNER JOIN Master_EnquiryFor mef ON (ef.ItemName = mef.ItemName OR ef.ItemName LIKE N'% - ' + mef.ItemName)
                    WHERE ef.RequestNo = E.RequestNo
                      AND ',' + REPLACE(REPLACE(ISNULL(mef.CCMailIds, ''), ' ', ''), ';', ',') + ',' LIKE @pricingCcPattern
                )
            `;
        } else {
            // ConcernedSE.SEName = Master FullName; tie user by EmailId so NULL/typo FullName does not block lists.
            request.input('pricingUserEmail', sql.NVarChar, normalizedEmail);
            baseQuery += `
                AND EXISTS (
                    SELECT 1
                    FROM ConcernedSE c
                    INNER JOIN Master_ConcernedSE m ON UPPER(LTRIM(RTRIM(ISNULL(m.FullName, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(c.SEName, N''))))
                    WHERE c.RequestNo = E.RequestNo
                      AND LOWER(LTRIM(RTRIM(m.EmailId))) = LOWER(LTRIM(@pricingUserEmail))
                )
            `;
        }
    }

    if (pendingOnly) {
        // Align with EMS_Production_recovered: include in-progress pricing states so Pending Updates matches search/list UX
        baseQuery += ` AND (E.Status IN ('Open', 'Enquiry', 'Priced', 'Estimated', 'Quote', 'Pricing', 'Pending', 'Quoted', 'Submitted') OR E.Status IS NULL OR E.Status = '') `;
    }

    // Enquiry date range (Search Pricing list only — matches Quote list / EnquiryDate semantics)
    if (!pendingOnly) {
        const df = parsePricingListYmd((opts && opts.dateFrom) || '');
        const dt = parsePricingListYmd((opts && opts.dateTo) || '');
        if (df && dt) {
            request.input('pricingListDateFrom', sql.Date, df);
            request.input('pricingListDateTo', sql.Date, dt);
            baseQuery += ` AND CAST(E.EnquiryDate AS DATE) BETWEEN @pricingListDateFrom AND @pricingListDateTo `;
        } else if (df) {
            request.input('pricingListDateFrom', sql.Date, df);
            baseQuery += ` AND CAST(E.EnquiryDate AS DATE) >= @pricingListDateFrom `;
        } else if (dt) {
            request.input('pricingListDateTo', sql.Date, dt);
            baseQuery += ` AND CAST(E.EnquiryDate AS DATE) <= @pricingListDateTo `;
        }
    }

    const searchTrim = search && String(search).trim();
    if (searchTrim) {
        baseQuery += ` AND (
            CAST(E.RequestNo AS NVARCHAR(32)) LIKE @search
            OR E.ProjectName LIKE @search
            OR E.CustomerName LIKE @search
            OR E.ClientName LIKE @search
            OR E.ConsultantName LIKE @search
            OR EXISTS (
                SELECT 1 FROM dbo.EnquiryPricingValues vSrch
                WHERE vSrch.RequestNo = E.RequestNo
                  AND LTRIM(RTRIM(ISNULL(vSrch.UpdatedBy, N''))) LIKE @search
            )
        ) `;
        request.input('search', sql.NVarChar, `%${searchTrim}%`);
    }

    baseQuery += ` ORDER BY E.DueDate DESC, E.RequestNo DESC `;

    const enquiriesRes = await request.query(baseQuery);
    const enquiries = enquiriesRes.recordset;

    if (enquiries.length === 0) return [];

    const requestNos = enquiries.map(e => e.RequestNo);
    const requestNosList = requestNos.map(r => `'${r.replace(/'/g, "''")}'`).join(',');

    let concernedRequestNos = new Set();
    if (ctx.userFullName) {
        const cseReq = new sql.Request();
        cseReq.input('userFullName', sql.NVarChar, ctx.userFullName);
        const cseRes = await cseReq.query(
            `SELECT RequestNo FROM ConcernedSE WHERE SEName = @userFullName AND RequestNo IN (${requestNosList})`
        );
        cseRes.recordset.forEach((row) => concernedRequestNos.add(String(row.RequestNo)));
    }

    // 4. Fetch Jobs
    const jobsRes = await sql.query(`
        SELECT 
            EF.RequestNo, EF.ID, EF.ParentID, EF.ItemName, EF.LeadJobCode, EF.LeadJobName,
            MEF.CommonMailIds, MEF.CCMailIds
        FROM EnquiryFor EF
        LEFT JOIN Master_EnquiryFor MEF ON (EF.ItemName = MEF.ItemName OR EF.ItemName LIKE '% - ' + MEF.ItemName)
        WHERE EF.RequestNo IN (${requestNosList})
    `);
    const allJobs = jobsRes.recordset;

    // 5b. Fetch EnquiryCustomer (authoritative external customer source)
    const enquiryCustomersRes = await sql.query(`
        SELECT RequestNo, CustomerName
        FROM EnquiryCustomer
        WHERE RequestNo IN (${requestNosList})
    `);
    const allEnquiryCustomers = enquiryCustomersRes.recordset;

    // 5. Fetch Prices first — same join as SSMS: resolve current EnquiryFor row (ID drift vs ItemName match)
    const pricesRes = await sql.query(`
        SELECT
            v.ID,
            v.RequestNo,
            v.OptionID,
            v.EnquiryForID,
            v.EnquiryForItem,
            v.Price,
            v.UpdatedAt,
            v.UpdatedBy,
            v.PriceOption,
            v.CustomerName,
            v.LeadJobName,
            m.MatchedEnquiryForId,
            m.MatchedItemName,
            m.MatchedParentId
        FROM dbo.EnquiryPricingValues v
        OUTER APPLY (
            SELECT TOP 1
                ef.ID AS MatchedEnquiryForId,
                ef.ItemName AS MatchedItemName,
                ef.ParentID AS MatchedParentId
            FROM dbo.EnquiryFor ef
            WHERE ef.RequestNo = v.RequestNo
              AND (
                    (v.EnquiryForID IS NOT NULL AND v.EnquiryForID <> 0 AND v.EnquiryForID = ef.ID)
                 OR (
                        LTRIM(RTRIM(ISNULL(v.EnquiryForItem, N''))) <> N''
                    AND LTRIM(RTRIM(v.EnquiryForItem)) = LTRIM(RTRIM(ef.ItemName))
                    )
                )
            ORDER BY
                CASE WHEN v.EnquiryForID IS NOT NULL AND v.EnquiryForID <> 0 AND v.EnquiryForID = ef.ID THEN 0 ELSE 1 END,
                ef.ID
        ) AS m
        WHERE v.RequestNo IN (${requestNosList})
    `);
    const allPrices = (pricesRes.recordset || []).map(normalizePricingValueRow);

    const valueOptionIdNums = [...new Set(
        allPrices
            .map(p => p.OptionID ?? p.optionID ?? p.OptionId)
            .map(x => parseInt(String(x ?? ''), 10))
            .filter(n => Number.isFinite(n) && n > 0)
    )];
    const valueOptionIdsSql = valueOptionIdNums.length > 0 ? valueOptionIdNums.join(',') : '0';

    // 6. Pricing Options: by RequestNo OR by ID referenced in EnquiryPricingValues (fixes orphan / mismatched RequestNo on option rows)
    const optionsRes = await sql.query(`
        SELECT RequestNo, ID as OptionID, OptionName, ItemName, CustomerName, LeadJobName
        FROM EnquiryPricingOptions
        WHERE RequestNo IN (${requestNosList})
           OR ID IN (${valueOptionIdsSql})
    `);
    const allOptions = optionsRes.recordset;

    // 7. Map and Process
    return enquiries.map(enq => {
        // SQL/JS type drift: RequestNo can be int 28 vs string "28" — loose == often works but not inside Set.has / strict filters.
        const reqNoEq = (a, b) => String(a ?? '').trim() === String(b ?? '').trim();

        const enqJobsRaw = allJobs.filter(j => reqNoEq(j.RequestNo, enq.RequestNo));
        const seenIds = new Set();
        const enqJobs = [];
        for (const job of enqJobsRaw) {
            const jid = job.ID ?? job.id;
            if (jid == null || jid === '') continue;
            const jkey = String(jid);
            if (!seenIds.has(jkey)) {
                seenIds.add(jkey);
                enqJobs.push(job);
            }
        }

        const enqPrices = allPrices.filter(p => reqNoEq(p.RequestNo, enq.RequestNo));
        const enqPriceOptionIdSet = new Set(
            enqPrices.map(p => p.OptionID ?? p.optionID ?? p.OptionId).filter(x => x != null && x !== '').map(x => String(x).trim())
        );
        const enqOptions = allOptions.filter(o => {
            if (reqNoEq(o.RequestNo, enq.RequestNo)) return true;
            const oid = o.OptionID ?? o.optionID ?? o.ID;
            if (oid == null || oid === '') return false;
            return enqPriceOptionIdSet.has(String(oid).trim());
        });

        const isCreator =
            ctx.userFullName &&
            enq.CreatedBy &&
            ctx.userFullName.toLowerCase().trim() === String(enq.CreatedBy).toLowerCase().trim();
        const isConcernedSE = concernedRequestNos.has(String(enq.RequestNo));

        const hierarchyScopedJobs = filterJobsByDepartment(enqJobs, {
            userDepartment: (ctx.userDepartment || '').toLowerCase().trim(),
            isAdmin,
            isCreator,
            isConcernedSE,
            userEmail,
            userFullName: ctx.userFullName || '',
        });
        const hierarchyJobIdSet = new Set(hierarchyScopedJobs.map((j) => String(jobIdOfPricing(j))));

        /** Same row identity as PUT /api/pricing/value (mssql may return ID or id). */
        const jobIdOf = jobIdOfPricing;

        const normalizeName = normalizePricingJobName;
        let myJobs = getPricingAnchorJobs(enqJobs, ctx, userEmail);
        if (!isAdmin) {
            myJobs = myJobs.filter((j) => hierarchyJobIdSet.has(String(jobIdOf(j))));
        }

        if (myJobs.length === 0) {
            console.log(`[Pricing] Enquiry ${enq.RequestNo} filtered out - no in-scope jobs for user ${userEmail} (admin=${isAdmin}, cc=${isCcUser})`);
            console.log(`[Pricing]   Total jobs in enquiry: ${enqJobs.length}`);
            return null;
        }

        const visibleJobs = expandVisibleJobIdsFromAnchors(myJobs, enqJobs);

        // Build Display String
        const childrenMap = {};
        enqJobs.forEach(j => {
            if (j.ParentID && String(j.ParentID) !== '0') {
                const pidStr = String(j.ParentID);
                if (!childrenMap[pidStr]) childrenMap[pidStr] = [];
                childrenMap[pidStr].push(j);
            }
        });

        const allVisibleJobs = enqJobs.filter(j => visibleJobs.has(String(jobIdOf(j)))).sort((a, b) => (jobIdOf(a) || 0) - (jobIdOf(b) || 0));
        const visualRoots = allVisibleJobs.filter(j => !j.ParentID || String(j.ParentID) === '0' || !visibleJobs.has(String(j.ParentID)));

        const flatList = [];
        const traverse = (job, level) => {
            flatList.push({ ...job, level });
            const children = childrenMap[String(jobIdOf(job))] || [];
            children.sort((a, b) => (jobIdOf(a) || 0) - (jobIdOf(b) || 0));
            children.forEach(child => {
                const cid = jobIdOf(child);
                if (cid != null && visibleJobs.has(String(cid))) traverse(child, level + 1);
            });
        };

        // Assign distinct sequential L-codes (L1, L2, L3...) based on actual roots (Step Lead Job Fix)
        const jobLeadMap = {};
        const rootsOnly = [...visualRoots].sort((a, b) => (jobIdOf(a) || 0) - (jobIdOf(b) || 0));
        const rootCodeMap = {};
        rootsOnly.forEach((r, idx) => {
            const rid = jobIdOf(r);
            if (rid != null) rootCodeMap[String(rid)] = `L${idx + 1}`;
        });

        allVisibleJobs.forEach(job => {
            let curr = job;
            let safety = 0;
            let visited = new Set();
            while (curr.ParentID && String(curr.ParentID) !== '0' && visibleJobs.has(String(curr.ParentID)) && safety < 10) {
                if (visited.has(String(curr.ParentID))) break;
                visited.add(String(curr.ParentID));
                const p = allVisibleJobs.find(item => String(jobIdOf(item)) === String(curr.ParentID));
                if (p) curr = p;
                else break;
                safety++;
            }
            const jid = jobIdOf(job);
            const cid = jobIdOf(curr);
            if (jid != null) jobLeadMap[String(jid)] = (cid != null && rootCodeMap[String(cid)]) || 'L1';
        });

        visualRoots.forEach(root => traverse(root, 0));

        // IMPORTANT:
        // Pending determination must be based on the actual displayed pricing contexts
        // (internal/external/customer-targeted), not just "job has any price row".
        // We'll compute hasPendingItems after displayItems are built.
        let hasPendingItems = false;

        // Build a quick map: optionId -> option row (for joining). String keys — driver may return OptionID as int or string.
        const optionMap = {};
        enqOptions.forEach(o => {
            const oid = o.OptionID ?? o.optionID ?? o.ID;
            if (oid != null && oid !== '') optionMap[String(oid)] = o;
        });

        const jobMap = {};
        enqJobs.forEach(j => {
            const jid = jobIdOf(j);
            if (jid != null && jid !== '') jobMap[String(jid)] = j;
        });

        const normalize = str => str.toLowerCase().replace(/[^a-z0-9]/g, '');
        const jobNameSetNorm = new Set(enqJobs.map(j => normalize(j.ItemName)));

        /** Strip L1 / Sub Job prefixes for display (pending summary customer column). */
        const stripLeadName = (s) => (s || '').toString().replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim();

        const userDivisionKey = userEmail ? userEmail.split('@')[0].toLowerCase() : '';

        // Collect External Customers
        // Collect External Customers and Deduplicate
        const rawExternal = (enq.CustomerName || '').split(',').map(c => c.trim()).filter(Boolean);
        const externalCustomers = [];
        const normSet = new Set();

        rawExternal.forEach(c => {
            const norm = c.replace(/[.,\s]+$/, '').toLowerCase();
            if (!normSet.has(norm)) {
                externalCustomers.push(c);
                normSet.add(norm);
            }
        });

        // Collect Alternative (Option) Customers
        const optionCustomers = new Set();
        enqOptions.forEach(o => {
            if (o.CustomerName && reqNoEq(o.RequestNo, enq.RequestNo)) {
                const c = o.CustomerName.trim();
                const norm = c.replace(/[.,\s]+$/, '').toLowerCase();
                if (!normSet.has(norm)) {
                    optionCustomers.add(c);
                    normSet.add(norm);
                }
            }
        });

        const rootJob = enqJobs.find(j => !j.ParentID || j.ParentID == '0' || j.ParentID == 0);
        const internalCustomer = rootJob ? rootJob.ItemName.trim() : 'Internal';
        const internalCustomerNormForLabel = normalize(internalCustomer);
        /** Base-price row CustomerName is "external" when not the internal root customer and not another EnquiryFor job name (aligns with quote lead labels). */
        const isExternalPricingCustomer = (customerName) => {
            const cn = String(customerName || '')
                .replace(/\s*\(L\d+\)\s*$/i, '')
                .trim();
            const cnN = normalize(cn);
            return Boolean(cn && cnN !== internalCustomerNormForLabel && !jobNameSetNorm.has(cnN));
        };

        // Customer column: lead anchors → EnquiryCustomer (external) only; subjob-only anchors → immediate parent job name(s) only (never both).
        const finalSet = new Set();
        const normalizeCustomer = (s) => (s || '').replace(/,\s*$/, '').trim().toLowerCase();
        const withLeadCode = (name, code) => {
            const base = (name || '').replace(/,\s*$/, '').trim();
            const c = String(code || '').trim().toUpperCase();
            if (!base) return '';
            if (!c || !/^L\d+$/.test(c)) return base;
            return `${base} (${c})`;
        };
        const addDistinctCustomer = (name) => {
            const clean = (name || '').replace(/,\s*$/, '').trim();
            if (!clean) return;
            const norm = normalizeCustomer(clean);
            if (!finalSet.has(norm)) finalSet.add(norm + '||' + clean);
        };

        const enquiryCustomerNames = allEnquiryCustomers
            .filter(c => reqNoEq(c.RequestNo, enq.RequestNo))
            .map(c => (c.CustomerName || '').trim())
            .filter(Boolean);

        const hasSubjobAnchors = myJobs.some((j) => j.ParentID && String(j.ParentID) !== '0' && j.ParentID !== 0);
        const hasLeadAnchors = myJobs.some((j) => !j.ParentID || String(j.ParentID) === '0' || j.ParentID === 0);

        // If ownjob is subjob in any visible lead branch, include parent job names.
        if (hasSubjobAnchors) {
            myJobs.forEach((job) => {
                if (!job.ParentID || String(job.ParentID) === '0' || job.ParentID === 0) return;
                const jid = jobIdOf(job);
                const current = jid != null && jobMap[String(jid)] ? jobMap[String(jid)] : job;
                if (!current || !current.ParentID || String(current.ParentID) === '0') return;
                const parent = jobMap[String(current.ParentID)];
                if (!parent || !parent.ItemName) return;
                const leadCode = (() => {
                    const curId = jobIdOf(current);
                    if (curId != null && jobLeadMap[String(curId)]) return jobLeadMap[String(curId)];
                    const pid = jobIdOf(parent);
                    if (pid != null && jobLeadMap[String(pid)]) return jobLeadMap[String(pid)];
                    const raw = (parent.LeadJobCode || current.LeadJobCode || '').toString().trim().toUpperCase();
                    return /^L\d+$/.test(raw) ? raw : '';
                })();
                const label = stripLeadName(parent.ItemName) || String(parent.ItemName).trim();
                addDistinctCustomer(withLeadCode(label, leadCode));
            });
        }

        // If ownjob is lead in any branch (or no subjob anchors detected), include external customers.
        if (hasLeadAnchors || !hasSubjobAnchors) {
            const leadCodes = (() => {
                const set = new Set();
                myJobs.forEach((j) => {
                    if (j.ParentID && String(j.ParentID) !== '0' && j.ParentID !== 0) return;
                    const jid = jobIdOf(j);
                    const fromMap = jid != null ? jobLeadMap[String(jid)] : '';
                    const raw = (fromMap || j.LeadJobCode || '').toString().trim().toUpperCase();
                    if (/^L\d+$/.test(raw)) set.add(raw);
                });
                return Array.from(set);
            })();
            enquiryCustomerNames.forEach((c) => {
                if (leadCodes.length === 0) {
                    addDistinctCustomer(c);
                } else {
                    leadCodes.forEach((code) => addDistinctCustomer(withLeadCode(c, code)));
                }
            });
        }

        const finalCustomers = Array.from(finalSet).map(v => v.split('||')[1]).filter(c => {
            const cNorm = normalize(c || '');
            if (userDivisionKey && cNorm.includes(userDivisionKey)) return false;
            return true;
        });

        const fullCustomerName = finalCustomers.join(', ');

        const displayItems = [];

        /** Mirrors sqlStripPricingName (quote sidebar): SUB JOB…-… and Ln - … prefixes on value rows. */
        const stripSqlStyleItemName = (s) => {
            if (s == null || s === '') return '';
            let t = String(s).trim();
            if (typeof t.normalize === 'function') t = t.normalize('NFKC');
            if (/^sub job/i.test(t) && t.includes('-')) {
                t = t.substring(t.indexOf('-') + 1).trim();
            }
            if (/^L\d+\s*-\s*/i.test(t)) {
                t = t.replace(/^L\d+\s*-\s*/i, '').trim();
            }
            return t;
        };

        /** Align with grid/SQL: option ItemName and EnquiryFor.ItemName can differ slightly (e.g. "BMS" vs "BMS Project"). */
        const itemNamesAlign = (optItem, jobItem) => {
            const o = stripSqlStyleItemName(optItem);
            const j = stripSqlStyleItemName(jobItem);
            if (!o) return false;
            if (!j) return false;
            if (o === j) return true;
            const no = normalize(o);
            const nj = normalize(j);
            if (no === nj) return true;
            if (no.length >= 3 && nj.length >= 3 && (no.includes(nj) || nj.includes(no))) return true;
            return false;
        };

        const parsePriceNum = (v) => {
            if (v == null || v === '') return 0;
            let x = v;
            if (typeof x === 'object' && x !== null && typeof x.valueOf === 'function') {
                const vo = x.valueOf();
                if (typeof vo === 'number' || typeof vo === 'string') x = vo;
            }
            const n = parseFloat(String(x).replace(/,/g, ''));
            return Number.isFinite(n) ? n : 0;
        };

        const normOptName = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();

        /** Matches "Base Price" and "Base Price (…)", "Base Price - …" etc. */
        const matchesOptionTarget = (nameStr, targetLower) => {
            const n = normOptName(nameStr);
            if (n === targetLower) return true;
            if (n.startsWith(targetLower + '(') || n.startsWith(targetLower + ' ') || n.startsWith(targetLower + '-')) return true;
            return false;
        };

        /**
         * Pending "Subjob Prices" — batch SQL joins values to EnquiryFor (same as SSMS):
         *   (EnquiryForID = ef.ID) OR (LTRIM(RTRIM(EnquiryForItem)) = LTRIM(RTRIM(ef.ItemName))).
         *   MatchedEnquiryForId is compared to the current job ID first; then legacy JS fallbacks.
         *   PriceOption / OptionID classify Base Price vs Optional. Scope: myJobs + visibleJobs + flatList.
         */
        const getDivisionPrice = (jobId, optionName) => {
            const job = jobMap[String(jobId)];
            if (!job) return { price: 0, updatedAt: null, customerName: null };

            const optNameLower = normOptName(optionName);

            /** Values-first: PriceOption on the value row is the primary classifier when present. */
            const valueRowMatchesOptionTarget = (pr) => {
                const po = pr.PriceOption ?? pr.priceOption;
                if (po != null && String(po).trim() !== '') {
                    return matchesOptionTarget(po, optNameLower);
                }
                const optIdRaw = pr.OptionID ?? pr.optionID ?? pr.OptionId;
                const opt = optIdRaw != null && optIdRaw !== '' ? optionMap[String(optIdRaw)] : null;
                return !!(opt && matchesOptionTarget(opt.OptionName ?? opt.optionName, optNameLower));
            };

            const trimEq = (a, b) => {
                const x = stripSqlStyleItemName(a).toLowerCase();
                const y = stripSqlStyleItemName(b).toLowerCase();
                return x.length > 0 && y.length > 0 && x === y;
            };

            const rowMatchesJob = (pr) => {
                const matchedId =
                    pr.MatchedEnquiryForId ?? pr.matchedEnquiryForId ?? pr.MatchedEnquiryForID;
                // Strict ID-first matching: avoid name-based collisions across branches
                // when multiple EnquiryFor rows share the same ItemName (e.g. "BMS Project").
                if (matchedId != null && matchedId !== '' && String(matchedId) !== '0') {
                    return String(matchedId) === String(jobId);
                }
                if (pr.EnquiryForID && pr.EnquiryForID != 0 && pr.EnquiryForID != '0') {
                    return String(pr.EnquiryForID) === String(jobId);
                }
                if (trimEq(pr.EnquiryForItem, job.ItemName)) return true;
                if (pr.EnquiryForItem && itemNamesAlign(pr.EnquiryForItem, job.ItemName)) return true;
                return false;
            };

            let bestRow = null;
            for (const pr of enqPrices) {
                if (parsePriceNum(pr.Price) <= 0) continue;
                if (!valueRowMatchesOptionTarget(pr)) continue;
                if (!rowMatchesJob(pr)) continue;
                if (!bestRow || new Date(pr.UpdatedAt) > new Date(bestRow.UpdatedAt)) {
                    bestRow = pr;
                }
            }

            if (bestRow) {
                const cust = String(bestRow.CustomerName ?? bestRow.customerName ?? '').trim();
                return {
                    price: parsePriceNum(bestRow.Price),
                    updatedAt: bestRow.UpdatedAt,
                    customerName: cust || null,
                };
            }
            return { price: 0, updatedAt: null, customerName: null };
        };

        /**
         * Subjob Prices column label: parent job + L# when the priced node is a subjob; external customer + L# when
         * the Base Price row targets an external customer (same idea as quote module quote details).
         */
        const buildSubjobPriceDisplayLabel = (jobRec, jobFallback, displayCode, priceCustomerName) => {
            const dc = displayCode || 'L1';
            if (priceCustomerName && isExternalPricingCustomer(priceCustomerName)) {
                const base = stripLeadName(priceCustomerName) || priceCustomerName;
                return `${base} (${dc})`;
            }
            if (jobRec) {
                const pid = jobRec.ParentID;
                if (
                    pid != null &&
                    String(pid) !== '0' &&
                    String(pid) !== '' &&
                    visibleJobs.has(String(pid)) &&
                    jobMap[String(pid)]
                ) {
                    const par = jobMap[String(pid)];
                    if (par?.ItemName) {
                        const base = stripLeadName(par.ItemName) || String(par.ItemName).trim();
                        return `${base} (${dc})`;
                    }
                }
            }
            const suffix = `(${dc})`;
            const matchFinal = finalCustomers.find((c) => String(c).trim().endsWith(suffix));
            if (matchFinal) return String(matchFinal).trim();
            const nm =
                stripLeadName(jobRec?.ItemName || jobFallback?.ItemName) ||
                String(jobRec?.ItemName || jobFallback?.ItemName || '').trim();
            return `${nm} (${dc})`;
        };

        flatList.forEach((job) => {
            const jid = jobIdOf(job);
            const targetOptionNames = ['Base Price', 'Optional'];

            targetOptionNames.forEach((optName) => {
                const { price, updatedAt, customerName } = getDivisionPrice(jid, optName);

                if (price > 0 || optName === 'Base Price') {
                    const displayCode = jobLeadMap[String(jid)] || 'L1';
                    const jobRec = jid != null ? jobMap[String(jid)] : null;
                    const jobLabel = buildSubjobPriceDisplayLabel(jobRec, job, displayCode, customerName);
                    const displayName = optName === 'Base Price' ? jobLabel : `${jobLabel} (${optName})`;

                    displayItems.push(
                        `${displayName}|${price > 0 ? price : 'Not Updated'}|${updatedAt ? new Date(updatedAt).toISOString() : ''}|${job.level || 0}`
                    );
                }
            });
        });

        // Derive pending status from final display lines.
        // If any displayed line is "Not Updated", enquiry must stay in Pending Updates.
        hasPendingItems = displayItems.some(item => {
            const parts = String(item).split('|');
            return (parts[1] || '').trim() === 'Not Updated';
        });

        if (hasPendingItems) {
            console.log(`[Pricing] Enquiry ${enq.RequestNo} - ⚠️ PENDING: At least one visible internal/external pricing line is Not Updated.`);
            logToFile(`Enquiry ${enq.RequestNo} - ⚠️ PENDING: At least one visible internal/external pricing line is Not Updated.`);
        } else {
            console.log(`[Pricing] Enquiry ${enq.RequestNo} - ✓ NOT PENDING: All visible internal/external pricing lines are updated.`);
            logToFile(`Enquiry ${enq.RequestNo} - ✓ NOT PENDING: All visible internal/external pricing lines are updated.`);
        }

        // Filter for Pending View
        // Show ONLY if there are pending items in user's division
        if (pendingOnly && !hasPendingItems) {
            console.log(`[Pricing] Enquiry ${enq.RequestNo} filtered out - all prices entered for user's division (Status: ${enq.Status})`);
            logToFile(`Enquiry ${enq.RequestNo} filtered out - all prices entered for user's division (Status: ${enq.Status})`);
            return null;
        }

        /** Most recent non-empty UpdatedBy on EnquiryPricingValues for this enquiry (fallback: latest row) */
        const pricedRows = enqPrices
            .map((pr) => ({
                at: pr.UpdatedAt ?? pr.updatedAt,
                by: String(pr.UpdatedBy ?? pr.updatedBy ?? '').trim(),
            }))
            .filter((r) => r.at)
            .sort((a, b) => new Date(b.at) - new Date(a.at));
        let pricedBy = '';
        for (const r of pricedRows) {
            if (r.by) {
                pricedBy = r.by;
                break;
            }
        }
        if (!pricedBy && pricedRows.length) {
            pricedBy = pricedRows[0].by;
        }

        return {
            ...enq,
            CustomerName: fullCustomerName,
            SubJobPrices: displayItems.join(';;'),
            PricedBy: pricedBy || null,
        };
    }).filter(Boolean);
}

// GET /api/pricing/list/pending
router.get('/list/pending', async (req, res) => {
    try {
        const { userEmail } = req.query;
        console.log('Pending Pricing (Helper) requested for:', userEmail);
        const result = await getEnquiryPricingList(userEmail, null, true);
        res.json(result);
    } catch (err) {
        console.error('Error fetching pending pricing:', err);
        res.status(500).json({ error: 'Failed' });
    }
});

// GET /api/pricing/list - New Generic List with Search
router.get('/list', async (req, res) => {
    try {
        const { userEmail, search, pendingOnly, dateFrom, dateTo } = req.query;
        console.log('Pricing List Search:', { search, userEmail, dateFrom, dateTo });
        const isPendingOnly = pendingOnly === 'true';
        const result = await getEnquiryPricingList(userEmail, search || null, isPendingOnly, { dateFrom, dateTo });
        res.json(result);
    } catch (err) {
        console.error('Error searching pricing list:', err);
        res.status(500).json({ error: 'Search failed' });
    }
});

// GET /api/pricing/search-customers?q=term&userEmail=...
// When userEmail is sent, only names from enquiries visible in pricing (same rules as /list) are returned.
router.get('/search-customers', async (req, res) => {
    try {
        const query = req.query.q || '';
        const userEmail = req.query.userEmail || '';
        if (!query || query.length < 2) {
            return res.json([]);
        }

        const term = `%${query}%`;
        const ctx = await resolvePricingAccessContext(userEmail);

        if (userEmail && !ctx.user) {
            return res.json([]);
        }

        if (!userEmail || ctx.isAdmin) {
            const result = await sql.query`
                SELECT TOP 10 CompanyName FROM Master_CustomerName WHERE CompanyName LIKE ${term}
                UNION
                SELECT TOP 10 CompanyName FROM Master_ClientName WHERE CompanyName LIKE ${term}
                UNION
                SELECT TOP 10 CompanyName FROM Master_ConsultantName WHERE CompanyName LIKE ${term}
            `;
            const names = [...new Set(result.recordset.map(r => r.CompanyName))];
            return res.json(names);
        }

        const request = new sql.Request();
        request.input('term', sql.NVarChar, term);
        let scoped = `
            SELECT DISTINCT TOP 10 E.CustomerName AS CompanyName
            FROM EnquiryMaster E
            WHERE E.CustomerName LIKE @term
        `;
        if (ctx.isCcUser) {
            request.input('pricingCcPattern', sql.NVarChar, `%,${ctx.normalizedEmail},%`);
            scoped += `
              AND EXISTS (
                  SELECT 1
                  FROM EnquiryFor ef
                  INNER JOIN Master_EnquiryFor mef ON (ef.ItemName = mef.ItemName OR ef.ItemName LIKE N'% - ' + mef.ItemName)
                  WHERE ef.RequestNo = E.RequestNo
                    AND ',' + REPLACE(REPLACE(ISNULL(mef.CCMailIds, ''), ' ', ''), ';', ',') + ',' LIKE @pricingCcPattern
              )
            `;
        } else {
            request.input('pricingAssignedName', sql.NVarChar, ctx.userFullName);
            scoped += `
              AND EXISTS (
                  SELECT 1
                  FROM ConcernedSE c
                  WHERE c.RequestNo = E.RequestNo
                    AND UPPER(LTRIM(RTRIM(ISNULL(c.SEName, '')))) = UPPER(LTRIM(RTRIM(@pricingAssignedName)))
              )
            `;
        }
        const scopedRes = await request.query(scoped);
        const names = [...new Set((scopedRes.recordset || []).map(r => r.CompanyName).filter(Boolean))];
        res.json(names);

    } catch (err) {
        console.error('Error searching customers:', err);
        res.status(500).json({ error: 'Search failed' });
    }
});

/**
 * SQL fragment: strip "L1 - " / "Sub Job - " style prefixes from EnquiryPricingValues columns (alias v).
 */
function sqlStripPricingName(col) {
    return `LTRIM(RTRIM(
        CASE
            WHEN UPPER(LTRIM(v.${col})) LIKE N'SUB JOB%' AND CHARINDEX(N'-', v.${col}) > 0
                THEN LTRIM(SUBSTRING(v.${col}, CHARINDEX(N'-', v.${col}) + 1, 4000))
            WHEN v.${col} LIKE N'L[0-9] - %'
                THEN LTRIM(SUBSTRING(v.${col}, CHARINDEX(N'-', v.${col}) + 1, 4000))
            ELSE v.${col}
        END
    ))`;
}

/**
 * Quote sidebar: EnquiryPricingValues filtered by own-job vs subjob rules.
 * @param {string|number} requestNo
 * @param {{ pricingScope: 'own'|'sub', leadJobClean: string, firstTab: string, activeTab?: string, customerDropdown?: string, parentJobName?: string, userEmail?: string }} scope
 */
async function fetchQuoteScopedPricingValues(requestNo, scope) {
    const { pricingScope, leadJobClean, firstTab, activeTab, customerDropdown, parentJobName, userEmail } = scope || {};
    if (!leadJobClean || !firstTab) return null;
    if (pricingScope !== 'own' && pricingScope !== 'sub') return null;
    if (pricingScope === 'sub' && !activeTab) return null;

    const leadSql = sqlStripPricingName('LeadJobName');
    const itemSql = sqlStripPricingName('EnquiryForItem');
    const custSql = sqlStripPricingName('CustomerName');

    const reqNoInt = parseInt(String(requestNo), 10);
    if (Number.isNaN(reqNoInt)) return null;

    const request = new sql.Request();
    request.input('requestNo', sql.Int, reqNoInt);
    request.input('leadClean', sql.NVarChar(500), String(leadJobClean));
    request.input('firstTab', sql.NVarChar(500), String(firstTab));

    const selectWithResolvedEf = `
        SELECT
            v.ID,
            v.RequestNo,
            v.OptionID,
            v.EnquiryForItem,
            v.EnquiryForID,
            v.Price,
            v.UpdatedBy,
            v.UpdatedAt,
            v.CustomerName,
            v.LeadJobName,
            v.PriceOption,
            m.MatchedEnquiryForId,
            m.MatchedItemName,
            m.MatchedParentId
        FROM EnquiryPricingValues v
        OUTER APPLY (
            SELECT TOP 1
                ef.ID AS MatchedEnquiryForId,
                ef.ItemName AS MatchedItemName,
                ef.ParentID AS MatchedParentId
            FROM EnquiryFor ef
            WHERE ef.RequestNo = v.RequestNo
              AND (
                    (v.EnquiryForID IS NOT NULL AND v.EnquiryForID <> 0 AND v.EnquiryForID = ef.ID)
                 OR (
                        LTRIM(RTRIM(ISNULL(v.EnquiryForItem, N''))) <> N''
                    AND LTRIM(RTRIM(v.EnquiryForItem)) = LTRIM(RTRIM(ef.ItemName))
                    )
                )
            ORDER BY
                CASE WHEN v.EnquiryForID IS NOT NULL AND v.EnquiryForID <> 0 AND v.EnquiryForID = ef.ID THEN 0 ELSE 1 END,
                ef.ID
        ) AS m
    `;

    let whereClause;
    if (pricingScope === 'own') {
        // OWN-JOB RULE (Quote EnquiryPricingValues dimensions):
        // Own-job summary: CustomerName = customer dropdown; EnquiryForItem = first tab (own-job label).
        // Subjobs under first tab: EnquiryForItem = each descendant subjob; CustomerName = that row's parent job (EnquiryFor).
        request.input('customerDropdown', sql.NVarChar(500), String(customerDropdown || ''));

        const stripEfLabel = (s) => String(s || '')
            .replace(/^(L\d+\s*-\s*|Sub Job\s*-\s*)/i, '')
            .trim();

        let subjobPairCondSql = '1=0';
        try {
            const efRes = await sql.query`
                SELECT ID, ParentID, ItemName
                FROM EnquiryFor
                WHERE RequestNo = ${requestNo}
            `;
            const efRows = efRes.recordset || [];
            const firstTabStr = String(firstTab || '').trim();
            const firstTabClean = stripEfLabel(firstTabStr);

            const ownIds = new Set(
                efRows
                    .filter(r =>
                        stripEfLabel(r.ItemName) === firstTabClean ||
                        String(r.ItemName || '').trim() === firstTabStr
                    )
                    .map(r => String(r.ID))
            );

            const byId = new Map(efRows.map(r => [String(r.ID), r]));
            const subjobPairs = [];
            const seenPairKeys = new Set();
            const addPair = (itemName, parentName) => {
                const k = `${itemName}\x1e${parentName}`;
                if (seenPairKeys.has(k)) return;
                seenPairKeys.add(k);
                subjobPairs.push({ itemName, parentName });
            };

            const walkFrom = (parentId) => {
                efRows.forEach((r) => {
                    if (String(r.ParentID) !== String(parentId)) return;
                    const rid = String(r.ID);
                    const parentRow = byId.get(String(parentId));
                    if (!parentRow) return;
                    if (!ownIds.has(rid)) {
                        addPair(String(r.ItemName || '').trim(), String(parentRow.ItemName || '').trim());
                    }
                    walkFrom(rid);
                });
            };

            ownIds.forEach((id) => walkFrom(id));

            if (subjobPairs.length > 0) {
                const parts = [];
                subjobPairs.forEach((pair, i) => {
                    const inItem = `sjItem_${i}`;
                    const inParent = `sjParent_${i}`;
                    request.input(inItem, sql.NVarChar(500), pair.itemName);
                    request.input(inParent, sql.NVarChar(500), pair.parentName);
                    parts.push(`(
                        (v.EnquiryForItem = @${inItem} OR ${itemSql} = @${inItem})
                        AND (v.CustomerName = @${inParent} OR ${custSql} = @${inParent})
                    )`);
                });
                subjobPairCondSql = parts.join(' OR ');
            }
        } catch (e) {
            console.error('Pricing API: Failed to compute subjob parent pairs for quoteScopedValues:', e);
            subjobPairCondSql = '1=0';
        }

        whereClause = `
            v.RequestNo = @requestNo
            AND ${leadSql} = @leadClean
            AND (
                (
                    @customerDropdown <> ''
                    AND (
                        v.CustomerName = @customerDropdown
                        OR ${custSql} = @customerDropdown
                    )
                    AND @firstTab <> ''
                    AND (
                        v.EnquiryForItem = @firstTab
                        OR ${itemSql} = @firstTab
                    )
                )
                OR
                (${subjobPairCondSql})
            )
        `;
    } else {
        request.input('customerDropdown', sql.NVarChar(500), String(customerDropdown || ''));
        request.input('parentJobName', sql.NVarChar(500), String(parentJobName || ''));
        request.input('activeTab', sql.NVarChar(500), String(activeTab || ''));

        const stripEfLabelSub = (s) => String(s || '')
            .replace(/^(L\d+\s*-\s*|Sub Job\s*-\s*)/i, '')
            .trim();

        // Nested rows under the selected subjob tab: EnquiryForItem = child; CustomerName = child's parent
        // (same semantics as own-job branch, but rooted at activeTab instead of first tab).
        let nestedUnderActiveTabCondSql = '1=0';
        try {
            const efResSub = await sql.query`
                SELECT ID, ParentID, ItemName
                FROM EnquiryFor
                WHERE RequestNo = ${requestNo}
            `;
            const efRowsSub = efResSub.recordset || [];
            const activeTabStr = String(activeTab || '').trim();
            const activeTabClean = stripEfLabelSub(activeTabStr);
            const byIdSub = new Map(efRowsSub.map((r) => [String(r.ID), r]));
            const activeTabIds = efRowsSub
                .filter((r) =>
                    stripEfLabelSub(r.ItemName) === activeTabClean ||
                    String(r.ItemName || '').trim() === activeTabStr
                )
                .map((r) => String(r.ID));

            const nestedPairs = [];
            const seenNested = new Set();
            const addNestedPair = (itemName, parentName) => {
                const k = `${itemName}\x1e${parentName}`;
                if (seenNested.has(k)) return;
                seenNested.add(k);
                nestedPairs.push({ itemName, parentName });
            };

            const walkFromActiveTab = (parentId) => {
                efRowsSub.forEach((r) => {
                    if (String(r.ParentID) !== String(parentId)) return;
                    const parentRow = byIdSub.get(String(parentId));
                    if (!parentRow) return;
                    addNestedPair(String(r.ItemName || '').trim(), String(parentRow.ItemName || '').trim());
                    walkFromActiveTab(r.ID);
                });
            };

            activeTabIds.forEach((id) => walkFromActiveTab(id));

            if (nestedPairs.length > 0) {
                const parts = [];
                nestedPairs.forEach((pair, i) => {
                    const inItem = `subNestedItem_${i}`;
                    const inParent = `subNestedParent_${i}`;
                    request.input(inItem, sql.NVarChar(500), pair.itemName);
                    request.input(inParent, sql.NVarChar(500), pair.parentName);
                    parts.push(`(
                        (v.EnquiryForItem = @${inItem} OR ${itemSql} = @${inItem})
                        AND (v.CustomerName = @${inParent} OR ${custSql} = @${inParent})
                    )`);
                });
                nestedUnderActiveTabCondSql = parts.join(' OR ');
            }
        } catch (e) {
            console.error('Pricing API: Failed to compute nested pairs for quoteScopedValues (sub scope):', e);
            nestedUnderActiveTabCondSql = '1=0';
        }

        // SUBJOB RULE (non-first tab):
        // (3) CustomerName = first tab, EnquiryForItem = selected subjob tab.
        // (4) CustomerName = first tab, EnquiryForItem = parent of selected subjob (parentJobName) — legacy.
        // (5) Each descendant under activeTab in EnquiryFor: EnquiryForItem = child; CustomerName = parent row.
        whereClause = `
            v.RequestNo = @requestNo
            AND ${leadSql} = @leadClean
            AND (
                (
                    (v.CustomerName = @firstTab OR ${custSql} = @firstTab)
                    AND (v.EnquiryForItem = @activeTab OR ${itemSql} = @activeTab)
                )
                OR
                (
                    @parentJobName <> N''
                    AND (v.CustomerName = @firstTab OR ${custSql} = @firstTab)
                    AND (v.EnquiryForItem = @parentJobName OR ${itemSql} = @parentJobName)
                )
                OR
                (${nestedUnderActiveTabCondSql})
            )
        `;
    }

    const query = `
        ;WITH RowsFiltered AS (
            ${selectWithResolvedEf}
            WHERE ${whereClause}
        ),
        RowsRanked AS (
            SELECT
                rf.*,
                ROW_NUMBER() OVER (
                    PARTITION BY
                        ISNULL(CONVERT(NVARCHAR(50), rf.OptionID), ''),
                        ISNULL(CONVERT(NVARCHAR(50), rf.EnquiryForID), ''),
                        ISNULL(LTRIM(RTRIM(rf.EnquiryForItem)), '')
                    ORDER BY
                        ISNULL(rf.UpdatedAt, '19000101') DESC,
                        rf.ID DESC
                ) AS rn
            FROM RowsFiltered rf
        )
        SELECT *
        FROM RowsRanked
        WHERE rn = 1;
    `;

    const result = await request.query(query);
    return (result.recordset || []).map(normalizePricingValueRow);
}

// GET /api/pricing/:requestNo - Get pricing grid for an enquiry
router.get('/:requestNo', async (req, res) => {
    try {
        const { requestNo } = req.params;
        const userEmail = req.query.userEmail || '';

        console.log('Pricing API: Loading pricing for', requestNo, 'user:', userEmail);

        // Get enquiry details including CreatedBy
        let enquiry;
        try {
            const enquiryResult = await sql.query`
                SELECT RequestNo, ProjectName, CreatedBy, CustomerName, ClientName, ConsultantName
                FROM EnquiryMaster 
                WHERE RequestNo = ${requestNo}
            `;

            if (enquiryResult.recordset.length === 0) {
                console.log('Pricing API: Enquiry not found:', requestNo);
                return res.status(404).json({ error: 'Enquiry not found' });
            }
            enquiry = enquiryResult.recordset[0];
            console.log('Pricing API: Found enquiry:', enquiry.RequestNo);
        } catch (err) {
            console.error('Error querying EnquiryMaster:', err);
            throw err;
        }

        // Get EnquiryFor items (jobs/columns)
        let jobs = [];
        try {
            const jobsResult = await sql.query`
                SELECT 
                    ef.ID, ef.ParentID, ef.ItemName, ef.LeadJobCode, ef.LeadJobName,
                    mef.CommonMailIds, mef.CCMailIds, mef.CompanyLogo,
                    mef.DepartmentName, mef.CompanyName, mef.Address, mef.Phone, mef.FaxNo,
                    mef.DivisionCode, mef.DepartmentCode
                FROM EnquiryFor ef
                LEFT JOIN Master_EnquiryFor mef ON (ef.ItemName = mef.ItemName OR ef.ItemName LIKE '% - ' + mef.ItemName)
                WHERE ef.RequestNo = ${requestNo}
                ORDER BY ef.ID ASC
            `;

            // Polyfill ParentItemName in JS since it's missing from DB
            const rawJobsAll = jobsResult.recordset;
            // Deduplicate (Fix for Join Cartesian Product)
            const seenJobIds = new Set();
            const rawJobs = [];
            for (const j of rawJobsAll) {
                if (!seenJobIds.has(j.ID)) {
                    seenJobIds.add(j.ID);
                    rawJobs.push(j);
                }
            }

            // Build unique Lead Job code map for ROOTS ONLY (to follow structure)
            const rootsOnly = rawJobs.filter(r => !r.ParentID || r.ParentID == '0' || r.ParentID == 0);
            rootsOnly.sort((a, b) => a.ID - b.ID); // Keep stable order
            const rootCodeMap = {};
            rootsOnly.forEach((r, idx) => {
                rootCodeMap[r.ID] = `L${idx + 1}`;
            });

            jobs = rawJobs.map(job => {
                // Trace back to find parent root
                let currRoot = job;
                let safety = 0;
                let visited = new Set();
                while (currRoot.ParentID && currRoot.ParentID != '0' && safety < 10) {
                    if (visited.has(currRoot.ParentID)) break;
                    visited.add(currRoot.ParentID);
                    const p = rawJobs.find(item => item.ID === currRoot.ParentID);
                    if (p) currRoot = p;
                    else break;
                    safety++;
                }

                const assignedCode = rootCodeMap[currRoot.ID] || 'L1';
                const parent = rawJobs.find(p => p.ID === job.ParentID);

                return {
                    ...job,
                    LeadJobCode: assignedCode, // Use unique code assigned to root ancestor
                    ParentItemName: parent ? parent.ItemName : null
                };
            });

            console.log('Pricing API: Found', jobs.length, 'jobs');

            if (userEmail) {
                const detailCtx = await resolvePricingAccessContext(userEmail);
                if (!detailCtx.user) {
                    return res.status(403).json({ error: 'Forbidden' });
                }
                if (!detailCtx.isAdmin) {
                    const anchors = getPricingAnchorJobs(jobs, detailCtx, userEmail);
                    if (anchors.length === 0) {
                        return res.status(403).json({ error: 'Forbidden' });
                    }
                    const visibleIds = expandVisibleJobIdsWithAncestors(anchors, jobs);
                    const beforeCount = jobs.length;
                    jobs = jobs.filter(j => visibleIds.has(String(jobIdOfPricing(j))));
                    console.log(`Pricing API: Job scope for ${userEmail}: ${jobs.length}/${beforeCount} rows`);
                }
            }
        } catch (err) {
            console.error('Error querying EnquiryFor:', err);
            throw err;
        }

        // Fetch additional customers from EnquiryCustomer table
        let extraCustomers = [];
        try {
            const extraRes = await sql.query`
                SELECT CustomerName 
                FROM EnquiryCustomer 
                WHERE RequestNo = ${requestNo}
            `;
            extraCustomers = extraRes.recordset;
        } catch (err) {
            console.error('Error fetching extra customers:', err);
        }

        // Identify Lead Job (First item)
        const leadJobItem = jobs.length > 0 ? jobs[0].ItemName : null;

        // Get active customer for initial selection only
        let activeCustomerName = req.query.customerName;
        if (!activeCustomerName) {
            if (extraCustomers.length > 0 && extraCustomers[0].CustomerName) {
                activeCustomerName = String(extraCustomers[0].CustomerName).trim();
            } else {
                const rawCust = enquiry.CustomerName || '';
                activeCustomerName = rawCust.split(',')[0].trim();
            }
        }

        // Get list of customers from DB (for tabs). When EnquiryCustomer has rows, use those full names only —
        // same as Enquiry module (one row = one customer; avoids comma-split fragments in EnquiryPricingOptions).
        let customers = [];
        try {
            if (extraCustomers.length > 0) {
                const seen = new Set();
                extraCustomers.forEach((row) => {
                    const n = String(row.CustomerName || '').trim();
                    if (!n) return;
                    const k = n.toLowerCase();
                    if (!seen.has(k)) {
                        seen.add(k);
                        customers.push(n);
                    }
                });
            } else {
                const customerResult = await sql.query`
                    SELECT DISTINCT CustomerName 
                    FROM EnquiryPricingOptions 
                    WHERE RequestNo = ${requestNo} 
                    AND CustomerName IS NOT NULL
                `;
                customers = customerResult.recordset.map(row => row.CustomerName);
            }
        } catch (err) {
            console.error('Error fetching customers:', err);
        }

        let excludedNames = new Set();


        // Determine user access (MOVED UP)
        let userHasLeadAccess = false;
        let userJobItems = [];
        let userRole = '';
        let userFullName = '';
        let userDepartment = '';
        let userDepartmentRaw = '';

        if (userEmail) {
            try {
                const normalizedUserEmail = String(userEmail || '').trim().toLowerCase().replace(/@almcg\.com/g, '@almoayyedcg.com');
                const userResult = await sql.query`
                    SELECT FullName, Roles, Department FROM Master_ConcernedSE WHERE EmailId = ${userEmail}
                `;
                let userRows = userResult.recordset || [];
                if (userRows.length === 0 && normalizedUserEmail) {
                    const fuzzyUserResult = await sql.query`
                        SELECT TOP 1 FullName, Roles, Department
                        FROM Master_ConcernedSE
                        WHERE
                            LOWER(LTRIM(RTRIM(ISNULL(EmailId, '')))) = ${normalizedUserEmail}
                            OR LOWER(REPLACE(REPLACE(REPLACE(
                                LEFT(LTRIM(RTRIM(ISNULL(EmailId, ''))), CHARINDEX('@', LTRIM(RTRIM(ISNULL(EmailId, ''))) + '@') - 1),
                                '.', ''), '-', ''), '_', '')) =
                               LOWER(REPLACE(REPLACE(REPLACE(
                                LEFT(${normalizedUserEmail}, CHARINDEX('@', ${normalizedUserEmail} + '@') - 1),
                                '.', ''), '-', ''), '_', ''))
                        ORDER BY CASE
                            WHEN LOWER(LTRIM(RTRIM(ISNULL(EmailId, '')))) = ${normalizedUserEmail} THEN 0
                            ELSE 1
                        END
                    `;
                    userRows = fuzzyUserResult.recordset || [];
                }
                if (userRows.length > 0) {
                    userFullName = userRows[0].FullName || '';
                    userRole = userRows[0].Roles || '';
                    userDepartmentRaw = userRows[0].Department ? userRows[0].Department.toString().trim() : '';
                    userDepartment = userDepartmentRaw ? userDepartmentRaw.toLowerCase().trim() : '';
                }
            } catch (err) {
                console.error('Error getting user name:', err);
            }

            // Check if user is the creator (Lead Job owner) or Admin
            const isAdmin = userRole === 'Admin';
            if (isAdmin) {
                userHasLeadAccess = true;
                userJobItems = jobs.map(j => j.ItemName);
            }

            // Also check email-based access
            jobs.forEach(job => {
                const commonMails = (job.CommonMailIds || '').toLowerCase().split(',').map(s => s.trim());
                const ccMails = (job.CCMailIds || '').toLowerCase().split(',').map(s => s.trim());
                const allMails = [...commonMails, ...ccMails];

                const userEmailUsername = userEmail.split('@')[0].toLowerCase();
                const jobNameLower = job.ItemName.toLowerCase().trim();

                let isMatch = allMails.includes(userEmail.toLowerCase()) ||
                    allMails.some(e => e.split('@')[0] === userEmailUsername) ||
                    (userDepartment && jobNameLower.includes(userDepartment)) ||
                    (userFullName && allMails.some(e => e.includes(userFullName.toLowerCase())));

                if (isMatch) {
                    if (!userJobItems.includes(job.ItemName)) {
                        userJobItems.push(job.ItemName);
                    }
                    // NEW: Detect Lead Access if assigned to ANY root job
                    if (!job.ParentID || job.ParentID === '0' || job.ParentID === 0) {
                        userHasLeadAccess = true;
                    }
                }
            });

            // SMART SCOPE EXPANSION:
            const cleanUserScopes = new Set(userJobItems.map(name =>
                name.replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim().toLowerCase()
            ));

            jobs.forEach(job => {
                const cleanName = job.ItemName.replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim().toLowerCase();
                if (cleanUserScopes.has(cleanName)) {
                    if (!userJobItems.includes(job.ItemName)) {
                        userJobItems.push(job.ItemName);
                    }
                }
            });
        }

        // FILTER: Scope Customers based on User Role
        if (leadJobItem && jobs.length > 0) {
            const clean = (name) => name ? name.replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim() : '';
            const leadJob = jobs.find(j => j.ItemName === leadJobItem);

            if (leadJob) {
                const findDescendants = (parentId, set) => {
                    const children = jobs.filter(j => j.ParentID === parentId);
                    children.forEach(c => {
                        set.add(clean(c.ItemName));
                        set.add(c.ItemName); // Add raw too
                        findDescendants(c.ID, set);
                    });
                };

                if (userHasLeadAccess) {
                    // LEAD / ADMIN: Exclude ALL jobs in branches where user is a Lead
                    // Find roots user has access to
                    const roots = jobs.filter(j => !j.ParentID || j.ParentID === '0' || j.ParentID === 0);
                    roots.forEach(root => {
                        // Check if user is assigned to this root or if they are Admin
                        const isAdmin = userRole === 'Admin';
                        const isAssigned = userJobItems.includes(root.ItemName);

                        if (isAdmin || isAssigned) {
                            excludedNames.add(clean(root.ItemName));
                            excludedNames.add(root.ItemName);
                            findDescendants(root.ID, excludedNames);
                        }
                    });

                    // Fallback: If no specific roots assigned but user has Lead Access (Creator match?), use first lead job
                    if (excludedNames.size === 0) {
                        excludedNames.add(clean(leadJobItem));
                        excludedNames.add(leadJobItem);
                        findDescendants(leadJob.ID, excludedNames);
                    }
                } else {
                    // SUB-JOB USER: Exclude Self (Assigned Jobs) AND Descendants of Assigned Jobs.
                    // Do NOT exclude Lead Job (Parent), as it is a valid internal customer for them.
                    userJobItems.forEach(jobName => {
                        const jobObj = jobs.find(j => j.ItemName === jobName);
                        if (jobObj) {
                            excludedNames.add(clean(jobName));
                            excludedNames.add(jobName);
                            findDescendants(jobObj.ID, excludedNames);
                        }
                    });
                }

                if (excludedNames.size > 0) {
                    const excluded = [...excludedNames];
                    console.log('Pricing API: Filtering out internal/descendant customers:', excluded);
                    customers = customers.filter(c => !excludedNames.has(clean(c)) && !excludedNames.has(c));
                }
            }
        }

        // Get pricing options (ALL customers)
        let options = [];
        try {
            const optionsResult = await sql.query`
                SELECT ID, OptionName, SortOrder, ItemName, CustomerName, LeadJobName
                FROM EnquiryPricingOptions 
                WHERE RequestNo = ${requestNo}
                ORDER BY SortOrder ASC, ID ASC
            `;
            options = optionsResult.recordset;

            // Deduplicate Options (Backend Fix)
            // Sometimes joins or legacy data cause duplicates.
            const seenOptions = new Set();
            options = options.filter(o => {
                const key = `${o.OptionName}|${o.ItemName}|${o.CustomerName}|${o.LeadJobName}`;
                if (seenOptions.has(key)) return false;
                seenOptions.add(key);
                return true;
            });

            console.log('Pricing API: Found', options.length, 'options (unique)');
        } catch (err) {
            console.error('Error querying EnquiryPricingOptions:', err);
            throw err;
        }

        // Get pricing values (ALL customers)
        let values = [];
        try {
            const valuesResult = await sql.query`
                SELECT
                    ID,
                    RequestNo,
                    OptionID,
                    EnquiryForItem,
                    EnquiryForID,
                    Price,
                    UpdatedBy,
                    UpdatedAt,
                    CustomerName,
                    LeadJobName,
                    PriceOption
                FROM EnquiryPricingValues
                WHERE RequestNo = ${requestNo}
            `;
            values = (valuesResult.recordset || []).map(normalizePricingValueRow);
            console.log('Pricing API: Found', values.length, 'values (total)');
        } catch (err) {
            console.error('Error querying EnquiryPricingValues:', err);
            throw err;
        }

        // Quote module: optional scoped rows (own job vs subjob) — same rules as documented SQL
        let quoteScopedValues = null;
        let scopedFromServer = false;
        try {
            const pricingScope = (req.query.pricingScope || '').toLowerCase();
            const leadJobClean = req.query.leadJobClean ? String(req.query.leadJobClean) : '';
            const firstTab = req.query.firstTab ? String(req.query.firstTab) : '';
            const activeTab = req.query.activeTab ? String(req.query.activeTab) : '';
            const parentJobNameScoped = req.query.parentJobName ? String(req.query.parentJobName) : '';
            const customerDropdownScoped = req.query.customerName
                ? String(req.query.customerName)
                : (activeCustomerName || '');

            if ((pricingScope === 'own' || pricingScope === 'sub') && leadJobClean && firstTab) {
                quoteScopedValues = await fetchQuoteScopedPricingValues(requestNo, {
                    pricingScope,
                    leadJobClean,
                    firstTab,
                    activeTab: pricingScope === 'sub' ? activeTab : '',
                    customerDropdown: customerDropdownScoped,
                    parentJobName: pricingScope === 'sub' ? parentJobNameScoped : '',
                    userEmail
                });
                scopedFromServer = Array.isArray(quoteScopedValues) && quoteScopedValues.length > 0;
                console.log('Pricing API: quoteScopedValues', scopedFromServer ? quoteScopedValues.length : 0, 'rows (scope=', pricingScope, ')');
            }
        } catch (scopeErr) {
            console.error('Error fetching quoteScopedValues:', scopeErr);
        }

        // Create value lookup map -> REMOVED (Sending raw array to frontend to handle multi-customer collision)
        // const valueMap = {};
        // values.forEach(v => {
        //     const key = v.EnquiryForID ? `${v.OptionID}_${v.EnquiryForID}` : `${v.OptionID}_${v.EnquiryForItem}`;
        //     valueMap[key] = v;
        // });




        // Determine visible and editable jobs
        // HIERARCHY LOGIC IMPLEMENTATION
        let visibleJobs = [];
        let editableJobs = [];

        // 1. EDIT PERMISSIONS (Strict)
        let visibleJobIds, editableJobIds;
        if (userRole === 'Admin') {
            editableJobs = jobs.map(j => j.ItemName);
        } else {
            // Default: Edit what you are assigned (Email matched)
            editableJobs = [...userJobItems];

            // NOTE: Creators do NOT get implicit edit access to Lead Job anymore.
            // They must be explicitly assigned to the Lead Job (via Email/Master) to edit it.
            // This prevents Generic Creators (e.g. 'BMS') from editing 'Civil' Lead Jobs inadvertently.
        }

        // 2. VIEW PERMISSIONS (Tree / Global)
        const isCreator = (enquiry.CreatedBy && userFullName && enquiry.CreatedBy.toLowerCase().trim() === userFullName.toLowerCase().trim());

        // FIX: Only Admins get global 'View All' access. 
        // Other users (including Leads/Creators) follow the hierarchical View logic below.
        const isGlobalView = userRole === 'Admin';

        if (isGlobalView) {
            console.log('Pricing API: Admin Access -> View All');
            visibleJobs = jobs.map(j => j.ItemName);
            visibleJobIds = new Set(jobs.map(j => j.ID));
        } else {
            // Standard User: View Assigned + Descendants
            // Fallback: If Creator has NO assignments, should we show everything or nothing?
            // Strict approach: Show nothing (or let them add themselves).
            // But to avoid "Blank Screen" confusion for unassigned Creators, we can grant Lead access IF generic?
            // User Request was explicit: "Access ONLY View BMS". This implies strictness.

            // ID-Based Traversal for Robustness
            const selfJobIds = jobs.filter(j => userJobItems.includes(j.ItemName)).map(j => j.ID);

            const getAllDescendantIds = (parentIds, allJobs) => {
                let descendantIds = [];
                let queue = [...parentIds];
                let processed = new Set();

                while (queue.length > 0) {
                    const currentId = queue.pop();
                    if (processed.has(currentId)) continue;
                    processed.add(currentId);

                    const children = allJobs.filter(j => j.ParentID === currentId);
                    children.forEach(c => {
                        descendantIds.push(c.ID);
                        queue.push(c.ID);
                    });
                }
                return descendantIds;
            };

            /** Walk up from each assigned job so every lead root on the path is viewable (lead job dropdown). */
            const getAllAncestorIds = (assignedIds, allJobs) => {
                const byId = new Map(allJobs.map(j => [j.ID, j]));
                const out = [];
                const seen = new Set();
                assignedIds.forEach((jid) => {
                    let current = byId.get(jid);
                    let safety = 0;
                    while (current && safety < 40) {
                        const pid = current.ParentID;
                        if (pid == null || pid === '' || pid === 0 || pid === '0') break;
                        const p = byId.get(pid);
                        if (!p) break;
                        if (!seen.has(p.ID)) {
                            seen.add(p.ID);
                            out.push(p.ID);
                        }
                        current = p;
                        safety++;
                    }
                });
                return out;
            };

            const descendantIds = getAllDescendantIds(selfJobIds, jobs);
            const ancestorIds = getAllAncestorIds(selfJobIds, jobs);
            const allVisibleIds = new Set([...selfJobIds, ...descendantIds, ...ancestorIds]);

            visibleJobs = jobs.filter(j => allVisibleIds.has(j.ID)).map(j => j.ItemName);
            visibleJobIds = allVisibleIds; // ID Set
            // UPDATE: User can only edit explicitly assigned jobs. 
            // Descendants are visible but READ-ONLY (Step 852)
            const allEditableIds = new Set([...selfJobIds]);
            editableJobIds = allEditableIds;
            editableJobs = jobs.filter(j => allEditableIds.has(j.ID)).map(j => j.ItemName);

        }

        console.log('Final Visible:', visibleJobs);
        console.log('Final Editable:', editableJobs);

        console.log('Pricing API: Sending Response with jobs:', JSON.stringify(jobs.map(j => ({ name: j.ItemName, logo: j.CompanyLogo })), null, 2));
        res.json({
            enquiry: {
                requestNo: enquiry.RequestNo,
                projectName: enquiry.ProjectName,
                createdBy: enquiry.CreatedBy,
                customerName: enquiry.CustomerName,
                clientName: enquiry.ClientName,
                consultantName: enquiry.ConsultantName
            },
            extraCustomers: extraCustomers
                .map(c => (c.CustomerName || '').replace(/,+$/g, '').trim()) // Normalize names
                .filter(name => {
                    const cleanName = name.replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim();
                    return name && !excludedNames.has(name) && !excludedNames.has(cleanName);
                }),
            customers: customers,
            activeCustomer: (activeCustomerName && (excludedNames.has(activeCustomerName) || excludedNames.has(activeCustomerName.replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim())))
                ? (customers.length > 0 ? customers[0] : '')
                : (activeCustomerName || '').replace(/,+$/g, '').trim(),
            leadJob: leadJobItem,
            jobs: jobs.map(j => ({
                id: j.ID,
                parentId: j.ParentID,
                itemName: j.ItemName,
                leadJobCode: j.LeadJobCode,
                companyLogo: j.CompanyLogo ? j.CompanyLogo.replace(/\\/g, '/') : null,
                departmentName: j.DepartmentName,
                companyName: j.CompanyName,
                address: j.Address,
                phone: j.Phone,
                fax: j.FaxNo,
                email: j.CommonMailIds,
                divisionCode: j.DivisionCode,
                departmentCode: j.DepartmentCode,
                isLead: !j.ParentID || j.ParentID === 0 || j.ParentID === "0",
                visible: typeof visibleJobIds !== 'undefined' ? visibleJobIds.has(j.ID) : visibleJobs.includes(j.ItemName),
                editable: typeof editableJobIds !== 'undefined' ? editableJobIds.has(j.ID) : editableJobs.includes(j.ItemName)
            })),
            options: options.map(o => ({
                id: o.ID,
                name: o.OptionName,
                sortOrder: o.SortOrder,
                itemName: o.ItemName,
                customerName: o.CustomerName, // Expose CustomerName
                leadJobName: o.LeadJobName    // Expose LeadJobName
            })),
            values: values,
            quoteScopedValues: quoteScopedValues,
            scopedFromServer: scopedFromServer,
            currentUserOwnJob: userDepartmentRaw || '',
            access: {
                hasLeadAccess: userHasLeadAccess,
                visibleJobs: visibleJobs,
                editableJobs: editableJobs
            }
        });

    } catch (err) {
        console.error('Error fetching pricing:', err.message, err.stack);
        res.status(500).json({ error: 'Failed to fetch pricing data: ' + err.message });
    }
});

// POST /api/pricing/option - Add a new pricing option (row)
router.post('/option', async (req, res) => {
    try {
        const { requestNo, optionName, itemName, customerName, leadJobName, enquiryForId } = req.body; // Accept leadJobName (Step 1013) & enquiryForId

        if (!requestNo || !optionName) {
            return res.status(400).json({ error: 'RequestNo and optionName are required' });
        }

        // --- HIERARCHY RESOLUTION (Step 2026-03-09) ---
        let resolvedItemName = itemName;
        let resolvedCustomerName = customerName;
        let resolvedLeadJobName = leadJobName;

        try {
            const jobsResult = await sql.query`SELECT ID, ParentID, ItemName FROM EnquiryFor WHERE RequestNo = ${requestNo}`;
            const jobs = jobsResult.recordset || [];
            const jobMap = {};
            jobs.forEach(j => jobMap[j.ID] = j);

            // Use ID if available, otherwise find by Name (Legacy/Manual)
            // If finding by name, try to also match leadJobName if provided to disambiguate branches
            let job = null;
            if (enquiryForId) {
                job = jobs.find(j => String(j.ID) === String(enquiryForId));
            }

            if (!job && itemName) {
                // Try to disambiguate by LeadJobName if we have multiple items with same name
                const possibleJobs = jobs.filter(j => j.ItemName === itemName);
                if (possibleJobs.length > 1 && leadJobName) {
                    // Resolve each possible job's root and check if it matches provided leadJobName
                    job = possibleJobs.find(pj => {
                        let root = pj;
                        let visited = new Set();
                        while (root.ParentID && root.ParentID !== 0 && root.ParentID !== '0' && jobMap[root.ParentID] && !visited.has(root.ID)) {
                            visited.add(root.ID);
                            root = jobMap[root.ParentID];
                        }
                        return root.ItemName === leadJobName;
                    });
                }
                if (!job) job = possibleJobs[0]; // fallback to first match
            }

            if (job) {
                resolvedItemName = job.ItemName;
                if (job.ParentID && job.ParentID !== 0 && job.ParentID !== '0' && jobMap[job.ParentID]) {
                    resolvedCustomerName = jobMap[job.ParentID].ItemName;
                } else {
                    resolvedCustomerName = customerName; // Keep external customer
                }

                let root = job;
                let visited = new Set();
                while (root.ParentID && root.ParentID !== 0 && root.ParentID !== '0' && jobMap[root.ParentID] && !visited.has(root.ID)) {
                    visited.add(root.ID);
                    root = jobMap[root.ParentID];
                }
                resolvedLeadJobName = root.ItemName;
            }
        } catch (resolveErr) {
            console.error('Pricing Option Resolution Error:', resolveErr);
        }

        // Atomic Insert with LeadJob scoped uniqueness
        const resolvedOptionName = optionName.trim();
        resolvedItemName = itemName ? itemName.trim() : (resolvedItemName ? resolvedItemName.trim() : null);
        resolvedCustomerName = resolvedCustomerName ? resolvedCustomerName.trim() : null;
        resolvedLeadJobName = leadJobName ? leadJobName.trim() : (resolvedLeadJobName ? resolvedLeadJobName.trim() : null);

        // DEBUG: capture cases where CustomerName ends up NULL unexpectedly
        if (!resolvedCustomerName) {
            logToFile(
                `POST /api/pricing/option CustomerName NULL. ` +
                `body=${JSON.stringify({ requestNo, optionName, itemName, customerName, leadJobName, enquiryForId })} ` +
                `resolved=${JSON.stringify({ resolvedItemName, resolvedCustomerName, resolvedLeadJobName })}`
            );
        }

        const result = await sql.query`
            BEGIN TRAN;

            IF NOT EXISTS (
                SELECT 1
                FROM EnquiryPricingOptions WITH (UPDLOCK, HOLDLOCK)
                WHERE RequestNo = ${requestNo}
                  AND LTRIM(RTRIM(OptionName)) = ${resolvedOptionName}
                  AND (LTRIM(RTRIM(ItemName)) = ${resolvedItemName || null} OR (ItemName IS NULL AND ${resolvedItemName || null} IS NULL))
                  AND (LTRIM(RTRIM(CustomerName)) = ${resolvedCustomerName || null} OR (CustomerName IS NULL AND ${resolvedCustomerName || null} IS NULL))
                  AND (LTRIM(RTRIM(LeadJobName)) = ${resolvedLeadJobName || null} OR (LeadJobName IS NULL AND ${resolvedLeadJobName || null} IS NULL))
            )
            BEGIN
                INSERT INTO EnquiryPricingOptions (RequestNo, OptionName, SortOrder, ItemName, CustomerName, LeadJobName)
                VALUES (
                    ${requestNo},
                    ${resolvedOptionName},
                    (SELECT ISNULL(MAX(SortOrder), 0) + 1
                     FROM EnquiryPricingOptions
                     WHERE RequestNo = ${requestNo}
                       AND LTRIM(RTRIM(OptionName)) = ${resolvedOptionName}
                       AND (LTRIM(RTRIM(ItemName)) = ${resolvedItemName || null} OR (ItemName IS NULL AND ${resolvedItemName || null} IS NULL))
                       AND (LTRIM(RTRIM(CustomerName)) = ${resolvedCustomerName || null} OR (CustomerName IS NULL AND ${resolvedCustomerName || null} IS NULL))
                       AND (LTRIM(RTRIM(LeadJobName)) = ${resolvedLeadJobName || null} OR (LeadJobName IS NULL AND ${resolvedLeadJobName || null} IS NULL))
                    ),
                    ${resolvedItemName || null},
                    ${resolvedCustomerName || null},
                    ${resolvedLeadJobName || null}
                );
            END
            ELSE
            BEGIN
                -- Backfill/update resolved metadata if the row already exists
                UPDATE EnquiryPricingOptions
                SET
                    ItemName = ${resolvedItemName || null},
                    CustomerName = ${resolvedCustomerName || null},
                    LeadJobName = ${resolvedLeadJobName || null}
                WHERE RequestNo = ${requestNo}
                  AND LTRIM(RTRIM(OptionName)) = ${resolvedOptionName}
                  AND (LTRIM(RTRIM(ItemName)) = ${resolvedItemName || null} OR (ItemName IS NULL AND ${resolvedItemName || null} IS NULL))
                  AND (LTRIM(RTRIM(CustomerName)) = ${resolvedCustomerName || null} OR (CustomerName IS NULL AND ${resolvedCustomerName || null} IS NULL))
                  AND (LTRIM(RTRIM(LeadJobName)) = ${resolvedLeadJobName || null} OR (LeadJobName IS NULL AND ${resolvedLeadJobName || null} IS NULL));
            END

            SELECT TOP 1
                ID, OptionName, SortOrder, ItemName, CustomerName, LeadJobName
            FROM EnquiryPricingOptions
            WHERE RequestNo = ${requestNo}
              AND LTRIM(RTRIM(OptionName)) = ${resolvedOptionName}
              AND (LTRIM(RTRIM(ItemName)) = ${resolvedItemName || null} OR (ItemName IS NULL AND ${resolvedItemName || null} IS NULL))
              AND (LTRIM(RTRIM(CustomerName)) = ${resolvedCustomerName || null} OR (CustomerName IS NULL AND ${resolvedCustomerName || null} IS NULL))
              AND (LTRIM(RTRIM(LeadJobName)) = ${resolvedLeadJobName || null} OR (LeadJobName IS NULL AND ${resolvedLeadJobName || null} IS NULL))
            ORDER BY ID DESC;

            COMMIT;
        `;

        res.json({
            success: true,
            option: result.recordset[0]
        });

    } catch (err) {
        console.error('Error adding option:', err);
        res.status(500).json({ error: 'Failed to add option' });
    }
});

// PUT /api/pricing/value - Update a pricing cell value
router.put('/value', async (req, res) => {
    try {
        const { requestNo, optionId, enquiryForItem, enquiryForId, price, updatedBy, customerName, leadJobName, priceOption } = req.body;

        if (!requestNo || !optionId) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const debugForEnquiry = String(requestNo) === '25';
        if (debugForEnquiry) {
            logToFile(
                `PUT /api/pricing/value called: ` +
                `requestNo=${requestNo} optionId=${optionId} enquiryForId=${enquiryForId} ` +
                `price=${price} customerName=${customerName} leadJobName=${leadJobName} ` +
                `priceOption=${priceOption}`
            );
        }

        const priceValue = parseFloat(price) || 0;

        // Reject negative values (Allow 0 to reset/clear price)
        if (priceValue < 0) {
            return res.status(400).json({ error: 'Price cannot be negative', skipped: true });
        }

        // --- HIERARCHY RESOLUTION (Step 2026-03-09) ---
        // 1. EnquiryForItem - Own Job (Division name)
        // 2. CustomerName - Parent job name (If ownjob is subjob), External customer names (if ownjob is leadjob)
        // 3. LeadJobName - Leadjob name (Division name)
        let resolvedItemName = enquiryForItem;
        let resolvedCustomerName = customerName;
        let resolvedLeadJobName = leadJobName;

        try {
            // Fetch jobs for this request to resolve hierarchy
            const jobsResult = await sql.query`SELECT ID, ParentID, ItemName FROM EnquiryFor WHERE RequestNo = ${requestNo}`;
            const jobs = jobsResult.recordset || [];
            const jobMap = {};
            jobs.forEach(j => jobMap[j.ID] = j);

            // --- STRICT RESOLUTION PRIORITY ---
            let job = null;
            if (enquiryForId) {
                // If ID is provided, it MUST match strictly to avoid branch-collisions (e.g. root BMS vs child BMS)
                job = jobs.find(j => String(j.ID) === String(enquiryForId));
            }

            // Fallback to name only if ID wasn't provided or didn't match (Legacy/Manual)
            if (!job && resolvedItemName) {
                // Handle multiple same-named items by checking branch context if LeadJobName was provided
                const possibleJobs = jobs.filter(j => j.ItemName === resolvedItemName);
                if (possibleJobs.length > 1 && leadJobName) {
                    job = possibleJobs.find(pj => {
                        let r = pj;
                        let v = new Set();
                        while (r.ParentID && r.ParentID !== 0 && r.ParentID !== '0' && jobMap[r.ParentID] && !v.has(r.ID)) {
                            v.add(r.ID);
                            r = jobMap[r.ParentID];
                        }
                        return r.ItemName === leadJobName;
                    });
                }
                if (!job) job = possibleJobs[0];
            }

            if (job) {
                // 1. Own Job Name
                resolvedItemName = job.ItemName;

                // 2. Customer Name (Parent job for sub-jobs, External for lead-jobs)
                if (job.ParentID && job.ParentID !== 0 && job.ParentID !== '0' && jobMap[job.ParentID]) {
                    resolvedCustomerName = jobMap[job.ParentID].ItemName;
                } else {
                    // Lead Job: Keep provided name (intended external customer)
                    resolvedCustomerName = customerName;
                }

                // 3. Lead Job Name (Root of the branch)
                let root = job;
                let visited = new Set();
                while (root.ParentID && root.ParentID !== 0 && root.ParentID !== '0' && jobMap[root.ParentID] && !visited.has(root.ID)) {
                    visited.add(root.ID);
                    root = jobMap[root.ParentID];
                }
                resolvedLeadJobName = root.ItemName;
            }
        } catch (resolveErr) {
            console.error('Pricing Metadata Resolution Error:', resolveErr);
            // Fallback to provided values
        }

        // --- UPSERT LOGIC WITH RESOLVED METADATA ---

        let existingResult;

        if (enquiryForId) {
            // New strict check by ID
            existingResult = await sql.query`
                SELECT ID FROM EnquiryPricingValues 
                WHERE RequestNo = ${requestNo} 
                AND OptionID = ${optionId} 
                AND EnquiryForID = ${enquiryForId}
                AND (CustomerName = ${resolvedCustomerName} OR (CustomerName IS NULL AND ${resolvedCustomerName || null} IS NULL))
            `;
        } else {
            // Legacy check by Name
            existingResult = await sql.query`
                SELECT ID FROM EnquiryPricingValues 
                WHERE RequestNo = ${requestNo} 
                AND OptionID = ${optionId} 
                AND EnquiryForItem = ${resolvedItemName}
                AND (CustomerName = ${resolvedCustomerName} OR (CustomerName IS NULL AND ${resolvedCustomerName || null} IS NULL))
            `;
        }


        const now = new Date();
        if (existingResult.recordset.length > 0) {
            // Update
            const recordId = existingResult.recordset[0].ID;
            await sql.query`
                UPDATE EnquiryPricingValues 
                SET Price = ${priceValue}, UpdatedBy = ${updatedBy}, UpdatedAt = ${now},
                    EnquiryForID = ${enquiryForId || null},
                    EnquiryForItem = ${resolvedItemName},
                    LeadJobName = ${resolvedLeadJobName},
                    CustomerName = ${resolvedCustomerName},
                    PriceOption = ${priceOption || null}
                WHERE ID = ${recordId}
            `;

            if (debugForEnquiry) {
                logToFile(
                    `PUT /api/pricing/value UPDATE: ` +
                    `recordId=${recordId} price=${priceValue} resolvedItem=${resolvedItemName} resolvedCustomer=${resolvedCustomerName} resolvedLead=${resolvedLeadJobName} priceOption=${priceOption}`
                );
            }
        } else {
            // Insert
            await sql.query`
                INSERT INTO EnquiryPricingValues (RequestNo, OptionID, EnquiryForItem, EnquiryForID, Price, UpdatedBy, CustomerName, LeadJobName, UpdatedAt, PriceOption)
                VALUES (${requestNo}, ${optionId}, ${resolvedItemName}, ${enquiryForId || null}, ${priceValue}, ${updatedBy}, ${resolvedCustomerName}, ${resolvedLeadJobName}, ${now}, ${priceOption || null})
            `;

            if (debugForEnquiry) {
                logToFile(
                    `PUT /api/pricing/value INSERT: ` +
                    `optionId=${optionId} enquiryForId=${enquiryForId || null} price=${priceValue} resolvedCustomer=${resolvedCustomerName} resolvedLead=${resolvedLeadJobName} priceOption=${priceOption}`
                );
            }
        }

        res.json({ success: true });

    } catch (err) {
        console.error('Error updating value:', err);
        res.status(500).json({ error: 'Failed to update value' });
    }
});

// DELETE /api/pricing/option/:id - Delete an option row
router.delete('/option/:id', async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`Pricing API: Deleting option ID ${id}`);

        // Verification Step: Check if it exists
        const checkResult = await sql.query`SELECT ID FROM EnquiryPricingOptions WHERE ID = ${id}`;
        if (checkResult.recordset.length === 0) {
            console.warn(`Pricing API: Option ID ${id} NOT FOUND in database!`);
            return res.json({ success: true, warning: 'Already gone' });
        }

        // Delete associated values first
        await sql.query`DELETE FROM EnquiryPricingValues WHERE OptionID = ${id}`;

        // Delete the option
        await sql.query`DELETE FROM EnquiryPricingOptions WHERE ID = ${id}`;
        console.log(`Pricing API: Option ID ${id} deleted successfully`);

        res.json({ success: true });

    } catch (err) {
        console.error(`Pricing API ERROR deleting option ${req.params.id}:`, err);
        res.status(500).json({ error: 'Failed to delete option' });
    }
});

// PUT /api/pricing/option/:id - Rename an option
router.put('/option/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { optionName } = req.body;

        await sql.query`
            UPDATE EnquiryPricingOptions 
            SET OptionName = ${optionName}
            WHERE ID = ${id}
        `;

        res.json({ success: true });

    } catch (err) {
        console.error('Error renaming option:', err);
        res.status(500).json({ error: 'Failed to rename option' });
    }
});

// DELETE /api/pricing/customer - Delete all pricing data for a specific customer
router.delete('/customer', async (req, res) => {
    try {
        const { requestNo, customerName } = req.body;

        if (!requestNo || !customerName) {
            return res.status(400).json({ error: 'RequestNo and CustomerName are required' });
        }

        console.log(`Pricing API: Deleting customer ${customerName} for enquiry ${requestNo}`);

        // 1. Delete associated values
        await sql.query`
            DELETE FROM EnquiryPricingValues 
            WHERE RequestNo = ${requestNo} AND CustomerName = ${customerName}
        `;

        // 2. Delete options
        await sql.query`
            DELETE FROM EnquiryPricingOptions 
            WHERE RequestNo = ${requestNo} AND CustomerName = ${customerName}
        `;

        // 3. Remove from EnquiryCustomer (extra customers)
        await sql.query`
            DELETE FROM EnquiryCustomer 
            WHERE RequestNo = ${requestNo} AND CustomerName = ${customerName}
        `;

        res.json({ success: true });

    } catch (err) {
        console.error('Error deleting customer pricing:', err);
        res.status(500).json({ error: 'Failed to delete customer pricing' });
    }
});


module.exports = router;

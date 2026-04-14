/**
 * Quote left-panel pricing summary: resolve Base / Option amounts from EnquiryPricingValues
 * using LeadJobName, RequestNo, EnquiryForItem, CustomerName (stored grid dimensions).
 */

export function stripPricingName(s) {
    const t = String(s || '').trim();
    if (!t) return '';
    const sub = /^sub\s*job\s*-\s*/i;
    if (sub.test(t)) {
        const i = t.indexOf('-');
        return i >= 0 ? t.slice(i + 1).trim() : t;
    }
    const l = /^L\d+\s*-\s*/i;
    if (l.test(t)) {
        const i = t.indexOf('-');
        return i >= 0 ? t.slice(i + 1).trim() : t;
    }
    return t;
}

function normDim(s) {
    return stripPricingName(s)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
}

function extractLCode(s) {
    const m = String(s || '').toUpperCase().match(/\bL(\d+)\b/);
    return m ? `L${m[1]}` : '';
}

export function leadJobRowMatches(rowLead, branchPrefix, jobsPool) {
    const rl = stripPricingName(rowLead);
    const bp = String(branchPrefix || '').trim();
    if (!bp && !rl) return true;
    const rNorm = normDim(rl);
    const pNorm = normDim(bp);
    if (rNorm && pNorm && (rNorm === pNorm || rNorm.includes(pNorm) || pNorm.includes(rNorm))) return true;
    const rL = extractLCode(rl || rowLead);
    const pL = extractLCode(bp);
    if (rL && pL && rL === pL) return true;
    if (jobsPool && jobsPool.length) {
        const root = jobsPool.find(
            (j) => !j.parentId || j.parentId === '0' || j.parentId === 0
        );
        const rootName = stripPricingName(root?.itemName || root?.DivisionName || '');
        if (rootName && normDim(rl) === normDim(rootName)) return true;
    }
    return false;
}

export function findJobInPool(jobsPool, { realId, label, name } = {}) {
    if (!jobsPool || !jobsPool.length) return null;
    if (realId != null && String(realId).trim() !== '') {
        const byId = jobsPool.find((j) => String(j.id || j.ItemID || j.ID) === String(realId));
        if (byId) return byId;
    }
    const lab = stripPricingName(label || name || '');
    if (!lab) return null;
    return (
        jobsPool.find((j) => stripPricingName(j.itemName || j.DivisionName || j.ItemName) === lab) ||
        jobsPool.find((j) => normDim(j.itemName || j.DivisionName) === normDim(lab)) ||
        null
    );
}

export function getParentJob(jobsPool, job) {
    if (!job || !jobsPool?.length) return null;
    const pid = job.parentId ?? job.ParentID;
    if (pid == null || pid === '' || pid === '0' || pid === 0) return null;
    return jobsPool.find((j) => String(j.id || j.ItemID || j.ID) === String(pid)) || null;
}

export function isStrictDescendantOf(jobsPool, jobId, ancestorId) {
    if (!jobId || !ancestorId || String(jobId) === String(ancestorId)) return false;
    let curr = jobsPool.find((j) => String(j.id || j.ItemID || j.ID) === String(jobId));
    let safety = 0;
    while (curr && safety < 40) {
        const pid = curr.parentId ?? curr.ParentID;
        if (pid == null || pid === '' || pid === '0' || pid === 0) return false;
        if (String(pid) === String(ancestorId)) return true;
        curr = jobsPool.find((j) => String(j.id || j.ItemID || j.ID) === String(pid));
        safety += 1;
    }
    return false;
}

function customerDimMatch(rCustRaw, wantRaw) {
    const rCust = normDim(rCustRaw || '');
    const wCust = normDim(wantRaw || '');
    if (!wCust) return true;
    if (!rCust) return false;
    if (rCust === wCust) return true;
    if (rCust.includes(wCust) || wCust.includes(rCust)) return true;
    // Truncated dropdown (e.g. "AL HAMAD CONSTRUCTION & D…") vs full EnquiryCustomer name
    const minPrefix = 12;
    if (wCust.length >= minPrefix && rCust.startsWith(wCust)) return true;
    if (rCust.length >= minPrefix && wCust.startsWith(rCust)) return true;
    return false;
}

function rowDimsMatch(row, enquiryForItemWant, customerNameWant) {
    const rEpi = stripPricingName(row.EnquiryForItem || '');
    const rCust = stripPricingName(row.CustomerName || '');
    const wEpi = stripPricingName(enquiryForItemWant || '');
    const wCust = stripPricingName(customerNameWant || '');
    const okEpi = !wEpi || normDim(rEpi) === normDim(wEpi) || normDim(rEpi).includes(normDim(wEpi)) || normDim(wEpi).includes(normDim(rEpi));
    const okCust = !wCust || customerDimMatch(rCust, wCust);
    return okEpi && okCust;
}

function pickLatestRow(matching) {
    if (!matching.length) return null;
    return [...matching].sort((a, b) => {
        const ta = new Date(a.UpdatedAt || 0).getTime();
        const tb = new Date(b.UpdatedAt || 0).getTime();
        if (tb !== ta) return tb - ta;
        return (parseInt(b.ID, 10) || 0) - (parseInt(a.ID, 10) || 0);
    })[0];
}

/**
 * Own-job pricing row for department users: job matches Master_ConcernedSE department or pricing editableJobs.
 * Not used for full lead users (they use first-tab root id only) to avoid every branch sharing one cell.
 */
export function isJobUsersOwnDepartmentRow(job, editableJobNames, userDepartment) {
    const jn = normDim(job?.itemName || job?.DivisionName || job?.ItemName || '');
    if (!jn) return false;
    const list = (editableJobNames || []).map((n) => normDim(String(n || '').trim())).filter(Boolean);
    if (list.some((n) => jn === n || jn.includes(n) || n.includes(jn))) return true;
    const ud = normDim(String(userDepartment || '').trim());
    if (ud && (jn.includes(ud) || ud.includes(jn))) return true;
    return false;
}

/**
 * @param {Array<object>} rows - EnquiryPricingValues-shaped rows
 * @param {object} p
 * @returns {{ found: boolean, price: number }}
 */
export function resolveQuoteSummaryPriceFromRows(rows, p) {
    const {
        requestNo,
        optionId,
        branchPrefix,
        jobsPool,
        job,
        customerDropdown,
        calculatedTabs,
        activeQuoteTab,
        hasLeadAccess,
        editableJobNames,
        userDepartment,
        alternateOptionIds,
    } = p;

    if (!Array.isArray(rows) || rows.length === 0 || !job || requestNo == null || optionId == null) {
        return { found: false, price: 0 };
    }

    const reqStr = String(requestNo).trim();
    const optStr = String(optionId).trim();
    const optIdSet = new Set(
        (Array.isArray(alternateOptionIds) && alternateOptionIds.length > 0
            ? alternateOptionIds
            : [optStr]
        ).map((x) => String(x ?? '').trim())
            .filter(Boolean)
    );

    const sameRequestNo = (a, b) => {
        const sa = String(a ?? '').trim();
        const sb = String(b ?? '').trim();
        if (sa === sb) return true;
        const na = parseInt(sa, 10);
        const nb = parseInt(sb, 10);
        return Number.isFinite(na) && Number.isFinite(nb) && na === nb;
    };

    const scoped = rows.filter((r) => {
        const rno = r.RequestNo ?? r.requestNo;
        if (!sameRequestNo(rno, reqStr)) return false;
        const oid = String(r.OptionID ?? r.optionID ?? r.optionId ?? '').trim();
        if (!optIdSet.has(oid)) return false;
        return leadJobRowMatches(r.LeadJobName ?? r.leadJobName, branchPrefix, jobsPool);
    });

    if (scoped.length === 0) return { found: false, price: 0 };

    const firstTab = calculatedTabs?.[0];
    const activeTab = calculatedTabs?.find((t) => String(t.id) === String(activeQuoteTab));
    const isFirstTab =
        firstTab && activeTab && String(firstTab.id) === String(activeTab.id);

    const firstLabel = (firstTab?.label || firstTab?.name || '').trim();
    const activeLabel = (activeTab?.label || activeTab?.name || '').trim();
    const custDrop = (customerDropdown || '').trim();

    const ownRootJob = findJobInPool(jobsPool, {
        realId: firstTab?.realId,
        label: firstLabel,
        name: firstLabel,
    });

    const pickedJob = findJobInPool(jobsPool, {
        realId: activeTab?.realId,
        label: activeLabel,
        name: activeLabel,
    });

    const jId = String(job.id || job.ItemID || job.ID || '');
    const jobItem = stripPricingName(job.itemName || job.DivisionName || job.ItemName || '');

    const tryPick = (enquiryForItem, customerName) => {
        const m = scoped.filter((r) => rowDimsMatch(r, enquiryForItem, customerName));
        const row = pickLatestRow(m);
        if (!row) return null;
        const price = parseFloat(row.Price ?? row.price ?? 0) || 0;
        return { row, price };
    };

    const leadUser = !!hasLeadAccess;
    const deptOwn = isJobUsersOwnDepartmentRow(job, editableJobNames, userDepartment);

    // --- Case 1: Own-job pricing (first tab) — EnquiryForItem = first tab label; CustomerName = customer dropdown ---
    // - Lead root row (Civil Project) always uses this when it is the priced job.
    // - User’s own division / editableJobs row (e.g. HVAC) uses the same keys: pricing often stores EnquiryForItem as the first-tab (lead) context, not the sub-job column name.
    // - Full lead with no department match: only the root row uses case 1 so sibling divisions keep case 2 / grid keys.
    if (isFirstTab && firstLabel && custDrop && ownRootJob) {
        const ownId = String(ownRootJob.id || ownRootJob.ItemID || ownRootJob.ID);
        const isLeadRootRow = jId === ownId;
        const useOwnJobKeys = isLeadRootRow || (!leadUser && deptOwn) || (leadUser && deptOwn);

        if (useOwnJobKeys) {
            const a = tryPick(firstLabel, custDrop);
            if (a) return { found: true, price: a.price };
            const ownName = stripPricingName(ownRootJob.itemName || ownRootJob.DivisionName || '');
            if (ownName) {
                const b = tryPick(ownName, custDrop);
                if (b) return { found: true, price: b.price };
            }
        }
    }

    // First tab + department row but hierarchy did not resolve ownRootJob (label-only tab)
    if (isFirstTab && firstLabel && custDrop && !ownRootJob && deptOwn) {
        const a = tryPick(firstLabel, custDrop);
        if (a) return { found: true, price: a.price };
    }

    // --- Case 2: First tab — subjobs; EnquiryForItem = subjob; CustomerName = parent of that subjob ---
    // MUST run before Case 2b: otherwise every descendant reuses tryPick(firstLabel, custDrop) and shows
    // the lead row Base Price for all subjobs (wrong duplicate amounts in Quote left panel).
    if (isFirstTab && ownRootJob) {
        const ownId = String(ownRootJob.id || ownRootJob.ItemID || ownRootJob.ID);
        if (jId !== ownId && isStrictDescendantOf(jobsPool, jId, ownId)) {
            const parent = getParentJob(jobsPool, job);
            const parentName = stripPricingName(parent?.itemName || parent?.DivisionName || '');
            if (jobItem && parentName) {
                const c = tryPick(jobItem, parentName);
                if (c) return { found: true, price: c.price };
            }
        }
    }

    // --- Case 2b (fallback): Descendant jobs — some grids store one "own job" cell (first tab + customer dropdown) ---
    if (isFirstTab && ownRootJob && firstLabel && custDrop) {
        const ownId2 = String(ownRootJob.id || ownRootJob.ItemID || ownRootJob.ID);
        if (jId !== ownId2 && isStrictDescendantOf(jobsPool, jId, ownId2)) {
            const f = tryPick(firstLabel, custDrop);
            if (f) return { found: true, price: f.price };
            const ownName2 = stripPricingName(ownRootJob.itemName || ownRootJob.DivisionName || '');
            if (ownName2) {
                const g = tryPick(ownName2, custDrop);
                if (g) return { found: true, price: g.price };
            }
        }
    }

    // --- Case 3 & 4: Subjob tab selected (not first tab) ---
    if (!isFirstTab && pickedJob && firstLabel) {
        const pickedId = String(pickedJob.id || pickedJob.ItemID || pickedJob.ID);
        const pickedName = stripPricingName(
            pickedJob.itemName || pickedJob.DivisionName || pickedJob.ItemName || activeLabel
        );

        // Case 3: same job as selected tab — EnquiryForItem = selected tab job; CustomerName = first tab label
        if (jId === pickedId && pickedName) {
            const d = tryPick(pickedName, firstLabel);
            if (d) return { found: true, price: d.price };
        }

        // Case 4: nested under selected tab — EnquiryForItem = descendant job; CustomerName = that job's
        // immediate parent in EnquiryFor (e.g. BMS under HVAC: Item=BMS, Customer=HVAC), not first tab.
        if (isStrictDescendantOf(jobsPool, jId, pickedId)) {
            const parentOfJob = getParentJob(jobsPool, job);
            const parentName = stripPricingName(parentOfJob?.itemName || parentOfJob?.DivisionName || '');
            if (jobItem && parentName) {
                const e = tryPick(jobItem, parentName);
                if (e) return { found: true, price: e.price };
            }
        }
    }

    return { found: false, price: 0 };
}

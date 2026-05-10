/**
 * Dashboard CC-mail helpers: Master_EnquiryFor.CCMailIds emails resolve to user display names.
 * Selecting one of those names in the Sales Engineer filter means "show all SE activity for this department"
 * (same API behaviour as "All SEs"), not enquiries for that person only as a lone ConcernedSE.
 *
 * SE dropdown names come from Master_ConcernedSE (masters.users API): FullName where Department matches selected division.
 */

/** True if logged-in user's email appears on any Master_EnquiryFor.CCMailIds */
export function isCcMailUser(userEmail, enqItems) {
    const e = String(userEmail || '').trim().toLowerCase();
    if (!e) return false;
    return (enqItems || []).some((item) => {
        const cc = String(item.CCMailIds || '')
            .split(/[,;]/)
            .map((x) => x.trim().toLowerCase())
            .filter(Boolean);
        return cc.includes(e);
    });
}

/**
 * Division string used for SE list + CC coordinator lookup (matches DashboardFilters behaviour).
 * Admin + "All" divisions → ''. CC user + empty division → first CC-linked department from master.
 */
export function getEffectiveDivisionForDashboardSe(filtersDivision, isCCUser, userEmail, enqItems) {
    const fd = String(filtersDivision || '').trim();
    if (fd && fd.toLowerCase() !== 'all') return fd;
    if (!isCCUser) return '';
    const email = String(userEmail || '').trim().toLowerCase();
    const ccDepts = (enqItems || [])
        .filter((item) => {
            const cc = String(item.CCMailIds || '')
                .split(/[,;]/)
                .map((x) => x.trim().toLowerCase())
                .filter(Boolean);
            return cc.includes(email);
        })
        .map((item) => String(item.DepartmentName || '').trim())
        .filter(Boolean);
    const uniq = Array.from(new Set(ccDepts));
    return uniq[0] || '';
}

/**
 * Full names from Master_ConcernedSE (`masters.users`) whose Department equals the selected division.
 * When division is empty or All → every distinct FullName (admin “all divisions”, or before a pick).
 */
export function getMasterConcernedSeNamesForDivision(division, masterUsers) {
    const rows = masterUsers || [];
    const allNames = Array.from(
        new Set(rows.map((u) => String(u.FullName ?? u.fullName ?? '').trim()).filter(Boolean))
    );
    if (!division || String(division).trim() === '' || String(division).trim().toLowerCase() === 'all') {
        return allNames;
    }
    const d = String(division).trim().toLowerCase();
    return Array.from(
        new Set(
            rows
                .filter((u) => String(u.Department ?? '').trim().toLowerCase() === d)
                .map((u) => String(u.FullName ?? u.fullName ?? '').trim())
                .filter(Boolean)
        )
    );
}

/**
 * CC mails from Master_EnquiryFor for this department → FullName, kept only when Master_ConcernedSE.Department matches `division`.
 * @param {string} division Same division key as Master_ConcernedSE.Department / dropdown selection.
 */
export function getCcCoordinatorNamesForDivision(division, enqItems, users) {
    if (!division || String(division).trim() === '' || String(division).trim().toLowerCase() === 'all') {
        return [];
    }
    const divLower = String(division).trim().toLowerCase();
    const emailSet = new Set();
    for (const item of enqItems || []) {
        const dn = String(item.DepartmentName ?? '').trim().toLowerCase();
        if (dn !== divLower) continue;
        String(item.CCMailIds || '')
            .split(/[,;]/)
            .map((e) => e.trim().toLowerCase())
            .filter(Boolean)
            .forEach((e) => emailSet.add(e));
    }
    const names = new Set();
    for (const email of emailSet) {
        const u = (users || []).find(
            (x) => String(x.EmailId ?? x.email ?? '').trim().toLowerCase() === email
        );
        const fn = u?.FullName ?? u?.fullName;
        if (!fn || !String(fn).trim()) continue;
        /** CC lists on Master_EnquiryFor can reference mails whose Master_ConcernedSE.Department is elsewhere — exclude those */
        const dept = String(u.Department ?? '').trim().toLowerCase();
        if (dept !== divLower) continue;
        names.add(String(fn).trim());
    }
    return [...names];
}

export function isCcCoordinatorNameSelection(selectedName, division, enqItems, users) {
    if (!selectedName || selectedName === 'All') return false;
    const coordinators = getCcCoordinatorNamesForDivision(division, enqItems, users);
    const sel = String(selectedName).trim().toLowerCase();
    return coordinators.some((n) => n.trim().toLowerCase() === sel);
}

/**
 * Returns API salesEngineer param: 'All' when a CC coordinator display name is chosen, else the raw selection.
 */
export function resolveEffectiveSalesEngineerFilter({
    salesEngineer,
    division,
    enqItems,
    users,
    currentUserEmail,
}) {
    const isCC = isCcMailUser(currentUserEmail, enqItems);
    const effectiveDiv = getEffectiveDivisionForDashboardSe(division, isCC, currentUserEmail, enqItems);
    if (isCcCoordinatorNameSelection(salesEngineer, effectiveDiv, enqItems, users)) {
        return 'All';
    }
    return salesEngineer;
}

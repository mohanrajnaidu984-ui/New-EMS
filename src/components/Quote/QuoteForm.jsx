import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { FileText, Save, Printer, Mail, Plus, ChevronDown, ChevronUp, X, Trash2, FolderOpen, Paperclip, Download, PenLine } from 'lucide-react';
import CreatableSelect from 'react-select/creatable';
import { format } from 'date-fns';
import DateInput from '../Enquiry/DateInput';
import { useAuth } from '../../context/AuthContext';
import ClauseEditor from './ClauseEditor';
import { resolveQuoteSummaryPriceFromRows } from './quoteEnquiryPricingLookup';
import ListBoxControl from '../Enquiry/ListBoxControl';
import { enquiryType as defaultEnquiryTypeOptions } from '../../data/mockData';
import { buildQuotePrintDocumentHtml } from './quotePrintDocumentHtml';
import {
    SignatureVaultModal,
    QuoteSignatureStamp,
    makeVerificationCode,
    loadStampsForEnquiry,
    saveStampsForEnquiry,
    EMS_QUOTE_PLACE_STAMP_EVENT,
} from './QuoteDigitalSignature';

/** Confirms this file is the bundle executed by Vite (Main.jsx → ./Quote/QuoteForm). Hard-refresh if missing. */
console.log("QUOTE FILE LOADED");

const API_BASE = '';

/** Right-panel quote filter row (category drives which fields are enabled). */
const QUOTE_LIST_CATEGORY = {
    PENDING: 'pending_quote',
    SEARCH: 'search_quote',
};

/** Stable reference when there are zero quote tabs (avoids new [] every memo pass). */
const EMPTY_CALCULATED_TABS = [];
/** Stable empty list for department attention fetch clears. */
const EMPTY_DEPT_ATTENTION_NAMES = [];

// Default clause templates
const defaultClauses = {
    scopeOfWork: `The detailed scope of work is provided in Annexure A, covering all tasks and responsibilities.However, a high - level summary is as follows:
1.1. [Briefly list key scope items related to the division]
1.2. [E.g., Civil Works: Excavation, Foundation, Structural Work, etc.]
1.3. [E.g., MEP Works: HVAC, Electrical, Plumbing, Fire Fighting, etc.]`,

    basisOfOffer: `Our offer is based on the following documents provided along with the enquiry:
2.1. [List of Drawings]
2.2. [Specifications]
2.3. [Tender Queries]
2.4. [Conditions of Contract]`,

    exclusions: `The following items are not included in our scope:
3.1. [List exclusions clearly, e.g., Civil Work doesn't include Waterproofing, etc.]
3.2. [E.g., Electrical Work doesn't include Transformer Supply]
3.3. [E.g., Cleaning Services do not include Waste Disposal]
3.4. [List down the qualifications identified in the tender documents]`,

    pricingTerms: `4.1. Our [Lump sum price / total quotation amount] for the scope mentioned above shall be [Amount in figures and words].
4.2. Our quoted amount excludes any Value Added Tax (VAT), which shall be charged additional, as applicable.
4.3. A detailed Bill of Quantity is provided in Annexure B, detailing the Itemized Pricing.
4.4. Payment Terms:
4.4.1. Advance Payment: [Percentage] % upon signing the agreement
4.4.2. Progress Payments: [Percentage] % as per completion milestones
4.4.3. Final Payment: [Percentage] % upon project completion and acceptance`,

    schedule: `5.1.Tentative Commencement Date: [Start Date]
5.2.Estimated Completion Date: [End Date]
5.3.Project Duration: [Number] weeks / months`,

    warranty: `6.1.Warranty Period: [Specify warranty duration]
6.2.Defects Liability Period: [Specify DLP duration]
6.3.Scope of Warranty: Covers[Specify covered items]
6.4.Exclusions: [Specify exclusions]`,

    responsibilityMatrix: `Please refer to Annexure B for a detailed responsibility matrix indicating the division of responsibilities between our company and the client.`,

    termsConditions: `8.1.Force Majeure: Standard force majeure clause applies
8.2.Quote Validity: [E.g., 30 / 60 / 90 days from the date of issuance]
8.3.Commercial Terms are detailed in Appendix to Quotation`,

    acceptance: `We hope that the above is in line with your requirements.
Should you have any further queries, please do not hesitate to contact our [designation] Mr./ Ms. [name] on [phone / email].`,

    billOfQuantity: `Please find the detailed Bill of Quantity below: `
};


// Global styles for pasted tables in clauses

const numberToWordsBHD = (num) => {
    const dinars = Math.floor(num);
    const fils = Math.round((num - dinars) * 1000);

    const convert = (n) => {
        const units = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
        const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
        const scales = ['', 'Thousand', 'Million', 'Billion'];

        if (n === 0) return '';
        if (n < 20) return units[n];
        if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + units[n % 10] : '');
        if (n < 1000) return units[Math.floor(n / 100)] + ' Hundred' + (n % 100 !== 0 ? ' and ' + convert(n % 100) : '');

        for (let i = 0, scale = 1; i < scales.length; i++, scale *= 1000) {
            if (n < scale * 1000) {
                return convert(Math.floor(n / scale)) + ' ' + scales[i] + (n % scale !== 0 ? ' ' + convert(n % scale) : '');
            }
        }
        return n.toString();
    };

    let result = "Bahraini Dinars ";
    if (dinars === 0) result += "Zero";
    else result += convert(dinars);

    if (fils > 0) {
        result += " and fils " + fils + "/1000";
    }
    result += " only.";
    return result;
};

const normalize = (str) => {
    if (!str) return '';
    return String(str)
        .trim()
        .toLowerCase()
        .replace(/[.,]/g, '') // Remove dots and commas for robust matching
        .replace(/\s+/g, ' ');
};
/** Same idea as pricing keys: fold punctuation/spacing so "( Bahrain )" matches "(Bahrain)". */
const normalizeCustomerKey = (s) =>
    String(s || '')
        .replace(/^(L\d+|Sub Job)\s*-\s*/i, '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');

const stripQuoteJobPrefix = (name) =>
    String(name || '').replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim();

const collapseSpacesLower = (s) =>
    String(s || '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();

/** Encode each path segment so spaces / `#` / `?` in filenames (e.g. `AAC Logo.png`) load correctly via `/uploads`. */
function encodeAppStaticPath(pathFromRoot) {
    if (!pathFromRoot) return pathFromRoot;
    const norm = String(pathFromRoot).replace(/\/+/g, '/');
    const parts = norm.split('/').filter(Boolean);
    if (parts.length === 0) return '/';
    return (
        '/' +
        parts
            .map((seg) => {
                try {
                    return encodeURIComponent(decodeURIComponent(seg));
                } catch {
                    return encodeURIComponent(seg);
                }
            })
            .join('/')
    );
}

/**
 * DB may store relative paths (`uploads/...`), full disk paths, or absolute URLs.
 * Vite serves the app on :5173 and proxies `/uploads` to the API — never prefix `http(s):` or `data:` with `/`.
 */
function resolveQuoteLogoSrc(logo) {
    if (logo == null) return null;
    const raw = String(logo).trim();
    if (!raw) return null;
    if (/^data:/i.test(raw)) return raw;
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw.startsWith('//')) return raw;

    let s = raw.replace(/\\/g, '/');
    const lower = s.toLowerCase();
    const uploadsMarker = '/uploads/';
    const absUploads = lower.indexOf(uploadsMarker);
    if (absUploads >= 0) {
        const tail = s.slice(absUploads);
        return encodeAppStaticPath(tail);
    }
    const relUploads = lower.indexOf('uploads/');
    if (relUploads === 0 || (relUploads === 1 && s[0] === '/')) {
        const i = lower.indexOf('uploads/');
        const tail = s[i] === '/' ? s.slice(i) : `/${s.slice(i)}`;
        return encodeAppStaticPath(tail);
    }
    // Filename only under server/uploads/logos (multer default)
    if (!lower.includes('uploads') && /^[^/\\]+\.(png|jpe?g|gif|webp|svg)$/i.test(s)) {
        return encodeAppStaticPath(`/uploads/logos/${s}`);
    }
    if (s.startsWith('/')) return encodeAppStaticPath(s);
    return encodeAppStaticPath(`/${s}`);
}

/** Server-built map: internal division → Master_ConcernedSE names + default assigned SE for this enquiry. */
const resolveQuoteInternalAttention = (enquiryData, toName) => {
    if (!toName || !enquiryData?.internalAttentionByCleanItemName) return null;
    const map = enquiryData.internalAttentionByCleanItemName;
    const cl = collapseSpacesLower(stripQuoteJobPrefix(toName));
    if (map[cl]) return map[cl];
    const fullLower = collapseSpacesLower(toName);
    if (map[fullLower]) return map[fullLower];
    const nk = `__norm_${normalizeCustomerKey(toName)}`;
    if (map[nk]) return map[nk];
    const tnk = normalizeCustomerKey(toName);
    if (tnk) {
        for (const k of Object.keys(map)) {
            if (k.startsWith('__norm_')) continue;
            const kk = normalizeCustomerKey(k);
            if (!kk) continue;
            if (kk === tnk || (tnk.length > 3 && (tnk.includes(kk) || kk.includes(tnk)))) return map[k];
            if (collapseSpacesLower(k) === cl) return map[k];
        }
    }
    const seen = new Set();
    for (const v of Object.values(map)) {
        if (!v || typeof v !== 'object' || !Array.isArray(v.options)) continue;
        const im = String(v.itemName || '');
        const sig = `${im}|${v.departmentName || ''}`;
        if (seen.has(sig)) continue;
        seen.add(sig);
        if (collapseSpacesLower(stripQuoteJobPrefix(im)) === cl) return v;
        if (normalizeCustomerKey(im) === tnk && tnk) return v;
    }
    return null;
};

/**
 * Prefer a map entry with non-empty SE options (keys may differ: clean name vs "L56 - …" vs pricing label).
 */
const resolveQuoteInternalAttentionFlexible = (enquiryData, toName) => {
    if (!toName || !enquiryData?.internalAttentionByCleanItemName) return null;
    const tryHit = (name) => resolveQuoteInternalAttention(enquiryData, name);
    let hit = tryHit(toName);
    if (hit?.options?.length) return hit;
    const t = collapseSpacesLower(stripQuoteJobPrefix(toName));
    const node = (enquiryData.divisionsHierarchy || []).find(
        (n) => collapseSpacesLower(stripQuoteJobPrefix(n.itemName || '')) === t
    );
    if (node?.itemName) {
        hit = tryHit(node.itemName);
        if (hit?.options?.length) return hit;
    }
    const map = enquiryData.internalAttentionByCleanItemName;
    for (const v of Object.values(map)) {
        if (!v || typeof v !== 'object' || !Array.isArray(v.options) || !v.options.length) continue;
        const vn = collapseSpacesLower(stripQuoteJobPrefix(v.itemName || ''));
        if (vn === t) return v;
    }
    return tryHit(toName);
};

const normLooseAttention = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Same rules as attentionSelectOptions: internal = hierarchy / profiles / pricing, or server internalAttention map hit. */
function isQuoteInternalCustomer(enquiryData, pricingJobs, toName) {
    if (!toName || !enquiryData) return false;
    if (resolveQuoteInternalAttention(enquiryData, toName) != null) return true;
    const toNameClean = collapseSpacesLower(stripQuoteJobPrefix(toName));
    const toKey = normalizeCustomerKey(toName);
    const hierarchyClean = new Set(
        (enquiryData.divisionsHierarchy || []).map((n) =>
            collapseSpacesLower(stripQuoteJobPrefix(n.itemName || n.DivisionName || ''))
        )
    );
    const profileClean = new Set(
        (enquiryData.availableProfiles || []).map((p) =>
            collapseSpacesLower(stripQuoteJobPrefix(p.itemName || ''))
        )
    );
    const pricingClean = new Set(
        (pricingJobs || [])
            .filter((j) => j.visible !== false)
            .map((j) => collapseSpacesLower(stripQuoteJobPrefix(j.itemName || j.DivisionName || j.ItemName || '')))
            .filter(Boolean)
    );
    return (
        hierarchyClean.has(toNameClean) ||
        profileClean.has(toNameClean) ||
        [...pricingClean].some(
            (pc) =>
                pc === toNameClean ||
                (toKey &&
                    (normalizeCustomerKey(pc) === toKey ||
                        pc.includes(toNameClean) ||
                        toNameClean.includes(pc)))
        )
    );
}

/** Stable key for "same lead branch" so we only clear the customer when the user actually switches lead. */
const leadJobChoiceFingerprint = (optionVal) => {
    const s = String(optionVal || '').trim();
    const cleaned = s.replace(/^L\d+\s*-\s*/i, '').trim().toLowerCase();
    const m = s.match(/^(L\d+)/i);
    const code = m ? m[1].toUpperCase() : '';
    return `${code}|${cleaned}`;
};

/**
 * `<option value>` uses full division strings (e.g. "L56 - Civil Project") but state often has
 * clean names ("Civil Project") or L-codes only. Mismatched controlled <select> values confuse
 * the DOM and can fire onChange — which was wiping the customer via handleCustomerChange(null).
 */
const resolveLeadJobSelectValue = (visibleLeadJobs, selectedLeadId, pricingJobs, leadJobPrefix) => {
    const list = visibleLeadJobs || [];
    if (list.length === 0) return '';
    const normFull = (x) => String(x || '').trim().toLowerCase();
    const normClean = (x) => String(x || '').replace(/^L\d+\s*-\s*/i, '').trim().toLowerCase();

    if (selectedLeadId && pricingJobs?.length) {
        const found = pricingJobs.find((j) => String(j.id || j.ItemID) === String(selectedLeadId));
        if (found) {
            const name = String(found.itemName || found.DivisionName || found.ItemName || '');
            const hit = list.find(
                (v) =>
                    normFull(v) === normFull(name) ||
                    normClean(v) === normClean(name) ||
                    normFull(v).endsWith(`- ${normClean(name)}`) ||
                    normFull(name).endsWith(normClean(v))
            );
            if (hit) return hit;
        }
    }

    if (leadJobPrefix) {
        const p = String(leadJobPrefix).trim();
        const pl = p.toLowerCase();
        let hit = list.find((v) => normFull(v) === pl);
        if (hit) return hit;
        hit = list.find((v) => normClean(v) === normClean(p));
        if (hit) return hit;
        const codeMatch = pl.match(/^(l\d+)/);
        if (codeMatch) {
            const code = codeMatch[1];
            hit = list.find((v) => normFull(v).startsWith(code));
            if (hit) return hit;
        }
        hit = list.find((v) => normFull(v).startsWith(pl));
        if (hit) return hit;
    }
    return '';
};

const normalizeName = normalize;

const parsePrice = (v) => {
    if (v === null || v === undefined) return 0;
    if (typeof v === 'number') return v;
    const clean = String(v).replace(/[^\d.]/g, '');
    return parseFloat(clean) || 0;
};

// Global Helper for Division Code Mapping - Updated for more robust matching
const matchDivisionCode = (qDivCode, jName, jDivCode = null) => {
    if (!qDivCode || !jName) return false;
    const q = qDivCode.toUpperCase();
    const j = jName.toUpperCase();
    const jd = jDivCode ? jDivCode.toUpperCase() : null;

    // Priority 1: Direct match with data-driven division code
    if (jd && (q === jd || jd.includes(q) || q.includes(jd))) {
        // console.log(`[matchDivisionCode] Priority 1 match! q:${q} jd:${jd}`);
        return true;
    }

    // Priority 2: Label-based heuristic matches
    return (q === 'ELE' || q === 'ELP' || q === 'ELM' || q === 'AME') && (j.includes('ELECTRICAL') || j.includes('ELE') || j.includes('ELM')) ||
        ((q === 'BMS' || q === 'BMP' || q === 'PRP') && (j.includes('BMS') || j.includes('PRICING') || j.includes('PROJECT'))) ||
        (q === 'PLFF' || q === 'PLP') && (j.includes('PLUMBING') || j.includes('FIRE') || j.includes('PLFF')) ||
        (q === 'CVLP' || q === 'CVP' || q === 'CVL' || q === 'CMP' || q === 'CIP') && (j.includes('CIVIL') || j.includes('CONCRETE')) ||
        (q === 'FPE' || q === 'FPP') && j.includes('FIRE') ||
        (q === 'HVP' || q === 'HVM' || q === 'HVC' || q === 'AMM') && (j.includes('HVAC') || j.includes('AIR CONDITIONING') || j.includes('HVM') || j.includes('AMM')) ||
        (q === 'AAC' && (j.includes('AIR') || j.includes('MAIN') || j.includes('HVAC'))) ||
        (q === 'AIN' || q === 'INP' || q === 'INT') && j.includes('INTERIORS') ||
        (j.includes(q) || q.includes(j)) || // Fuzzy overlap
        (q === 'GEN'); // Global fallback for general quotes
};

/** True when enquiry payload implies multiple branch quote tabs (Civil / Electrical / …) — do not force login profile onto header. */
const enquiryPayloadSuggestsMultiBranchTabs = (data) => {
    if (!data || typeof data !== 'object') return false;
    const divs = data.divisions || [];
    if (Array.isArray(divs) && divs.filter(Boolean).length >= 2) return true;
    const h = data.divisionsHierarchy || [];
    if (h.length >= 3) return true;
    const nonPersonal = (data.availableProfiles || []).filter((p) => !p?.isPersonalProfile);
    return nonPersonal.length >= 2;
};

/**
 * Match the active Previous-Quotes job tab to enquiry-data rows built from Master_EnquiryFor
 * (DepartmentName first, then EnquiryFor ItemName).
 */
const matchMasterEnquiryForBrandingRow = (activeTab, rows) => {
    if (!activeTab || !Array.isArray(rows) || rows.length === 0) return null;
    const tabN = collapseSpacesLower(stripQuoteJobPrefix(activeTab.label || activeTab.name || ''));
    if (!tabN) return null;
    const scoreDept = (dn) => {
        const d = collapseSpacesLower(String(dn || ''));
        if (!d) return 0;
        if (d === tabN) return 100;
        if (tabN.includes(d) || d.includes(tabN)) return 80;
        return 0;
    };
    const scoreItem = (itemName) => {
        const i = collapseSpacesLower(stripQuoteJobPrefix(String(itemName || '')));
        if (!i) return 0;
        if (i === tabN) return 100;
        if (tabN.includes(i) || i.includes(tabN)) return 80;
        return 0;
    };
    const scored = rows
        .map((r) => ({ r, sd: scoreDept(r.departmentName), si: scoreItem(r.itemName) }))
        .filter((x) => x.sd > 0 || x.si > 0)
        .sort((a, b) => {
            if (b.sd !== a.sd) return b.sd - a.sd;
            return b.si - a.si;
        });
    return scored[0]?.r ?? null;
};

/**
 * Saved EnquiryQuotes.OwnJob is often the creator's department (server overwrites on insert/update),
 * not the priced branch — so multi-tab views must align rows using QuoteNumber's division segment vs the active tab.
 */
const quoteNumberDivisionMatchesTab = (q, activeTabObj, multiTab) => {
    if (!multiTab || !activeTabObj || !q) return false;
    const parts = q.QuoteNumber?.split('/') || [];
    const qDiv = (parts[1] || '').toUpperCase();
    if (!qDiv || qDiv === 'GEN') return false;
    const tabLabel = (activeTabObj.label || activeTabObj.name || '').toUpperCase();
    return matchDivisionCode(qDiv, tabLabel, activeTabObj.divisionCode);
};

/** Primary key on EnquiryQuotes rows from API (driver / JSON may use ID, id, or Id). */
const quoteRowId = (q) => {
    if (!q || typeof q !== 'object') return undefined;
    const id = q.ID ?? q.id ?? q.Id;
    if (id === null || id === undefined || id === '') return undefined;
    return id;
};

/**
 * When multiple job tabs exist, division heuristics must use the ACTIVE tab's job (e.g. BMS subjob),
 * not selectedLeadId (often the parent HVAC lead) — otherwise HVP quotes match the wrong tab.
 * Searches jobsPool first — pricingData.jobs may omit subjobs that still exist in hierarchy merge.
 */
const divisionMatchContextForQuoteTab = (
    selectedLeadId,
    pricingData,
    activeTabRealId,
    activeTabObj,
    calculatedTabsLength,
    jobsPool
) => {
    const findJobNode = (realId) => {
        if (!realId) return null;
        const want = String(realId);
        if (Array.isArray(jobsPool) && jobsPool.length) {
            const j = jobsPool.find((x) => String(x.id || x.ItemID || x.ID) === want);
            if (j) return j;
        }
        if (pricingData?.jobs?.length) {
            const j = pricingData.jobs.find((x) => String(x.id || x.ItemID) === want);
            if (j) return j;
        }
        return null;
    };

    if (calculatedTabsLength > 1 && activeTabRealId) {
        const j = findJobNode(activeTabRealId);
        if (j) return (j.itemName || j.DivisionName || j.ItemName || '').toUpperCase();
    }
    if (selectedLeadId && pricingData?.jobs) {
        const j = pricingData.jobs.find((x) => String(x.id || x.ItemID) === String(selectedLeadId));
        if (j) return (j.itemName || j.DivisionName || j.ItemName || '').toUpperCase();
    }
    if (activeTabRealId) {
        const j = findJobNode(activeTabRealId);
        if (j) return (j.itemName || j.DivisionName || j.ItemName || '').toUpperCase();
    }
    return (activeTabObj?.label || activeTabObj?.name || '').toUpperCase();
};

const isDescendant = (childId, ancestorId, pool) => {
    if (!childId || !ancestorId || !pool) return false;
    const child = pool.find(j => String(j.id || j.ItemID || j.ID) === String(childId));
    if (!child) return false;
    const pid = child.parentId || child.ParentID;
    if (!pid || pid === '0' || pid === 0 || pid === 'undefined') return false;
    if (String(pid) === String(ancestorId)) return true;
    // Recursive check with safety
    let curr = child;
    let safety = 0;
    while (curr && (curr.parentId || curr.ParentID) && safety < 10) {
        const pId = String(curr.parentId || curr.ParentID);
        if (pId === String(ancestorId)) return true;
        curr = pool.find(pj => String(pj.id || pj.ItemID || pj.ID) === pId);
        safety++;
    }
    return false;
};

/** Direct child job ids under parentId (pricing jobs + enquiry hierarchy merged — same as tab builder). */
const collectDirectChildJobIdsFromPools = (parentId, pricingPool, hierarchyPool) => {
    const pid = String(parentId);
    const out = [];
    const seen = new Set();
    for (const pool of [pricingPool, hierarchyPool].filter(Boolean)) {
        for (const j of pool) {
            const id = String(j.id || j.ItemID || j.ID || '');
            if (!id || seen.has(id)) continue;
            const pp = String(j.parentId ?? j.ParentID ?? '').trim();
            if (pp === pid && pp !== '0' && pp !== '') {
                seen.add(id);
                out.push(id);
            }
        }
    }
    return out;
};

const tableStyles = `
    .clause-content table {
        width: 100% !important;
        border-collapse: collapse !important;
        margin-bottom: 16px !important;
        font-size: 12px !important;
        page-break-inside: auto !important;
    }
    .clause-content tr {
        page-break-inside: avoid !important;
    }
    .clause-content table th, .clause-content table td {
        border: 1px solid #cbd5e1 !important;
        padding: 6px 8px !important;
        text-align: left !important;
    }
    .clause-content table th {
        background-color: #f8fafc !important;
        font-weight: 600 !important;
    }
    .clause-content {
        white-space: pre-wrap !important;
        word-wrap: break-word !important;
    }
    .clause-content p {
        margin-bottom: 8px !important;
        white-space: normal !important;
    }
    .clause-content ul, .clause-content ol {
        margin-top: 4px !important;
        margin-bottom: 12px !important;
        padding-left: 24px !important;
        white-space: normal !important;
    }
    .clause-content li {
        margin-bottom: 4px !important;
        display: list-item !important;
        list-style-position: outside !important;
    }
    .clause-content ul {
        list-style-type: disc !important;
    }
    .clause-content ol {
        list-style-type: decimal !important;
    }
`;

/** mm → px at 96dpi (CSS px). */
const quoteMmToPx = (mm) => (mm * 96) / 25.4;

/** Standard clause keys — module scope for preview/pagination and clause list UI. */
const QUOTE_CLAUSE_DEFINITIONS = [
    { key: 'showScopeOfWork', contentKey: 'scopeOfWork', title: 'Scope of Work' },
    { key: 'showBasisOfOffer', contentKey: 'basisOfOffer', title: 'Basis of the Offer' },
    { key: 'showExclusions', contentKey: 'exclusions', title: 'Exclusions and Qualifications' },
    { key: 'showPricingTerms', contentKey: 'pricingTerms', title: 'Pricing & Payment Terms' },
    { key: 'showSchedule', contentKey: 'schedule', title: 'High-Level Schedule' },
    { key: 'showWarranty', contentKey: 'warranty', title: 'Warranty & Defects Liability Period' },
    { key: 'showResponsibilityMatrix', contentKey: 'responsibilityMatrix', title: 'Responsibility Matrix' },
    { key: 'showTermsConditions', contentKey: 'termsConditions', title: 'Terms & Conditions' },
    { key: 'showBillOfQuantity', contentKey: 'billOfQuantity', title: 'Bill of Quantity' },
    { key: 'showAcceptance', contentKey: 'acceptance', title: 'Acceptance & Confirmation' },
];

/** Pack clause indices (0..n-1) into pages by measured block height. */
const packClauseIndicesByHeights = (heights, usablePx) => {
    if (!heights?.length) return [];
    const usable = Math.max(usablePx, 240);
    const pages = [];
    let cur = [];
    let sum = 0;
    for (let i = 0; i < heights.length; i++) {
        const h = Math.max(heights[i] || 0, 1);
        if (cur.length > 0 && sum + h > usable) {
            pages.push(cur);
            cur = [];
            sum = 0;
        }
        cur.push(i);
        sum += h;
    }
    if (cur.length) pages.push(cur);
    return pages;
};

/** Pack a subset of global clause indices using measured heights for those indices only. */
const packGlobalClauseSubset = (globalIndices, heights, usablePx) => {
    if (!globalIndices?.length) return [];
    const subH = globalIndices.map((gi) => Math.max(heights[gi] || 0, 1));
    const localPacked = packClauseIndicesByHeights(subH, usablePx);
    return localPacked.map((localGroup) => localGroup.map((li) => globalIndices[li]));
};

/**
 * Pull leading clauses from page i onto page i-1 when they still fit (fixes
 * leftover vertical room from rounding / conservative chrome vs greedy pack).
 */
const rebalanceClausePageGroups = (groups, heights, usablePx) => {
    if (!groups || groups.length < 2) return groups;
    const slackPx = 36;
    const cap = Math.max(usablePx + slackPx, 280);
    const hAt = (idx) => Math.max(heights[idx] || 0, 1);
    const out = groups.map((g) => [...g]);
    for (let pi = 1; pi < out.length; pi++) {
        let safety = 0;
        while (out[pi].length && safety < heights.length + 4) {
            safety += 1;
            const moveIdx = out[pi][0];
            const prev = out[pi - 1];
            const sumPrev = prev.reduce((s, j) => s + hAt(j), 0);
            if (sumPrev + hAt(moveIdx) <= cap) {
                prev.push(out[pi].shift());
            } else {
                break;
            }
        }
    }
    return out.filter((g) => g.length > 0);
};

const clausePageGroupsEqual = (a, b) => {
    if (a === b) return true;
    if (!a || !b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        const ra = a[i];
        const rb = b[i];
        if (ra.length !== rb.length) return false;
        for (let j = 0; j < ra.length; j++) {
            if (ra[j] !== rb[j]) return false;
        }
    }
    return true;
};

const indicesEqual = (a, b) => {
    if (a === b) return true;
    if (!a || !b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
    }
    return true;
};

const clausePaginateEqual = (a, b) =>
    indicesEqual(a?.pageOne, b?.pageOne) && clausePageGroupsEqual(a?.continuation, b?.continuation);

const QuoteForm = () => {
    const { currentUser } = useAuth();
    const isAdmin = ['Admin', 'Admins'].includes(currentUser?.role || currentUser?.Roles);

    // Search state
    const [searchTerm, setSearchTerm] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const searchRef = useRef(null);
    const debounceRef = useRef(null);

    // Enquiry and quote data
    const [enquiryData, setEnquiryData] = useState(null);
    const enquiryDataRef = useRef(null);
    useLayoutEffect(() => {
        enquiryDataRef.current = enquiryData;
    }, [enquiryData]);
    const [quoteId, setQuoteId] = useState(null);
    const [loading, setLoading] = useState(false);
    const [existingQuotes, setExistingQuotes] = useState([]);
    /** Rows from GET /by-enquiry scoped by LeadJob + RequestNo + OwnJob + ToName (previous-quote panel). */
    const [quoteScopedForPanel, setQuoteScopedForPanel] = useState([]);
    /** When equal to scopedQuotePanelFetchKey, the scoped GET has finished for that key (panel may be []). */
    const [scopedQuotesFetchSettledKey, setScopedQuotesFetchSettledKey] = useState(null);
    const [selectedLeadId, setSelectedLeadId] = useState(null);
    /** Last lead <select> fingerprint — avoids clearing customer when the same lead is re-applied after re-render. */
    const leadChoiceFingerprintRef = useRef('');
    /** One-shot gate: after a real lead change, auto-select first available customer option. */
    const autoSelectCustomerAfterLeadChangeRef = useRef(false);
    /** When lead changes, keep quote id/number if auto-select picks the same customer again (avoids Quote Ref → Draft). */
    const preserveQuoteOnLeadChangeRef = useRef(null);
    const [saving, setSaving] = useState(false);

    // Quote Context Scope (For viewing/revising previous quotes with specific scope)
    const [quoteContextScope, setQuoteContextScope] = useState(null);

    // Clause toggles
    const [clauses, setClauses] = useState({
        showScopeOfWork: true,
        showBasisOfOffer: true,
        showExclusions: true,
        showPricingTerms: true,
        showSchedule: true,
        showWarranty: true,
        showResponsibilityMatrix: true,
        showTermsConditions: true,
        showAcceptance: true,
        showBillOfQuantity: true,
    });

    // Selected Jobs for Pricing
    const [selectedJobs, setSelectedJobs] = useState([]);
    /** Same logical selection often gets a new array reference from effects — avoid re-firing calculateSummary. */
    /** Sorted so checkbox order / array reference churn does not re-fire calculateSummary (quickDigest already sorts). */
    const selectedJobsSig = React.useMemo(() => {
        const arr = Array.isArray(selectedJobs) ? selectedJobs : [];
        try {
            return [...arr].map(String).sort((a, b) => a.localeCompare(b)).join('\x1e');
        } catch {
            return arr.map(String).join('\x1e');
        }
    }, [selectedJobs]);
    /** Skip redundant setState when calculateSummary output is unchanged (stops flicker / render storms). */
    const lastPricingCalcSigRef = useRef('');
    /** When inputs match last committed run, skip the whole calculateSummary body (stops console/render storms). */
    const lastQuickCalcInputRef = useRef('');
    const pricingSelectionTouchedRef = useRef({});
    const [expandedGroups, setExpandedGroups] = useState({}); // Track expanded revisions

    const toggleExpanded = (quoteNo) => {
        setExpandedGroups(prev => ({ ...prev, [quoteNo]: !prev[quoteNo] }));
    };

    // Resizable Sidebar State
    const [sidebarWidth, setSidebarWidth] = useState(480);
    const splitPaneRef = useRef(null);

    const startResizing = React.useCallback((mouseDownEvent) => {
        mouseDownEvent.preventDefault();
        const startX = mouseDownEvent.clientX;
        const startWidth = sidebarWidth;

        const doDrag = (mouseMoveEvent) => {
            const newWidth = startWidth + (mouseMoveEvent.clientX - startX);
            if (newWidth > 350 && newWidth < 1000) {
                setSidebarWidth(newWidth);
            }
        };

        const stopDrag = () => {
            document.removeEventListener('mousemove', doDrag);
            document.removeEventListener('mouseup', stopDrag);
            document.body.style.cursor = 'default';
            document.body.style.userSelect = 'auto';
        };

        document.addEventListener('mousemove', doDrag);
        document.addEventListener('mouseup', stopDrag);
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    }, [sidebarWidth]);

    // Print Settings
    const [printWithHeader, setPrintWithHeader] = useState(true);

    /** Per-enquiry draggable digital signatures on quote sheets (persisted in localStorage). */
    const [signatureVaultOpen, setSignatureVaultOpen] = useState(false);
    const [quoteDigitalStamps, setQuoteDigitalStamps] = useState([]);

    // Pending Files State
    const [pendingFiles, setPendingFiles] = useState([]);

    // Clause content
    const [clauseContent, setClauseContent] = useState({
        scopeOfWork: defaultClauses.scopeOfWork,
        basisOfOffer: defaultClauses.basisOfOffer,
        exclusions: defaultClauses.exclusions,
        pricingTerms: defaultClauses.pricingTerms,
        schedule: defaultClauses.schedule,
        warranty: defaultClauses.warranty,
        responsibilityMatrix: defaultClauses.responsibilityMatrix,
        termsConditions: defaultClauses.termsConditions,
        acceptance: defaultClauses.acceptance,
        billOfQuantity: defaultClauses.billOfQuantity,
    });

    // Quote metadata
    const [quoteNumber, setQuoteNumber] = useState('');
    const [validityDays, setValidityDays] = useState(30);

    // Expanded clause for editing
    const [expandedClause, setExpandedClause] = useState(null);

    // Company Header Info
    const [quoteLogo, setQuoteLogo] = useState(null);
    const quoteLogoDisplaySrc = React.useMemo(() => resolveQuoteLogoSrc(quoteLogo), [quoteLogo]);
    const [quoteCompanyName, setQuoteCompanyName] = useState('Almoayyed Air Conditioning');
    const [quoteAttachments, setQuoteAttachments] = useState([]);
    const [isUploading, setIsUploading] = useState(false);
    const [quoteListCategory, setQuoteListCategory] = useState(QUOTE_LIST_CATEGORY.PENDING);
    const [quoteListSearchCriteria, setQuoteListSearchCriteria] = useState('');
    const [quoteListDateFrom, setQuoteListDateFrom] = useState('');
    const [quoteListDateTo, setQuoteListDateTo] = useState('');
    const fileInputRef = useRef(null);
    const [footerDetails, setFooterDetails] = useState(null);
    const [companyProfiles, setCompanyProfiles] = useState([]);

    // Custom Clauses
    const [customClauses, setCustomClauses] = useState([]);
    const [newClauseTitle, setNewClauseTitle] = useState('');
    const [isAddingClause, setIsAddingClause] = useState(false);

    // Metadata State
    const [quoteDate, setQuoteDate] = useState(new Date().toISOString().split('T')[0]);
    const [customerReference, setCustomerReference] = useState('');
    const [subject, setSubject] = useState('');
    const [signatory, setSignatory] = useState('');
    const [signatoryDesignation, setSignatoryDesignation] = useState('');
    const [toName, setToName] = useState('');

    const [toAddress, setToAddress] = useState('');
    const [toPhone, setToPhone] = useState('');
    const [toEmail, setToEmail] = useState('');
    const [toFax, setToFax] = useState('');
    const [toAttention, setToAttention] = useState(''); // ReceivedFrom contact for selected customer
    /** When enquiry-data map misses a label (e.g. pricing-only customer), filled from /attention-by-department. */
    const [deptAttentionNames, setDeptAttentionNames] = useState([]);

    /** Mirrors enquiry module: multi-select enquiry types → persisted as EnquiryQuotes.QuoteType (comma-separated). */
    const [quoteEnquiryTypeSelect, setQuoteEnquiryTypeSelect] = useState('');
    const [quoteTypeList, setQuoteTypeList] = useState([]);
    const [enquiryTypesMaster, setEnquiryTypesMaster] = useState([]);

    // Prepared By
    const [preparedBy, setPreparedBy] = useState('');
    const [preparedByOptions, setPreparedByOptions] = useState([]);
    const [signatoryOptions, setSignatoryOptions] = useState([]);
    // Pricing Data
    const [pricingData, setPricingData] = useState(null);

    // Unified Jobs Pool for consistent rendering and calculation (Step 1240)
    const jobsPool = React.useMemo(() => {
        const hierarchy = enquiryData?.divisionsHierarchy || [];
        const pricingJobs = pricingData?.jobs || [];
        return pricingJobs.length > 0 ? pricingJobs : hierarchy.map(d => ({
            id: d.id || d.ItemID || d.ID,
            parentId: d.parentId || d.ParentID,
            itemName: d.itemName || d.ItemName || d.DivisionName,
            leadJobCode: d.leadJobCode || d.LeadJobCode,
            companyLogo: d.companyLogo,
            companyName: d.companyName,
            departmentName: d.departmentName,
            divisionCode: d.divisionCode || d.DivisionCode,
            departmentCode: d.departmentCode || d.DepartmentCode
        }));
    }, [pricingData, enquiryData]);

    /** Content signature for pricing — avoids effect storms when `pricingData` is replaced with an equivalent object. */
    const pricingStableSig = React.useMemo(() => {
        const pd = pricingData;
        if (!pd?.options || !pd.values || typeof pd.values !== 'object') return '';
        const vals = pd.values;
        const keys = Object.keys(vals).sort();
        let acc = 0;
        for (let i = 0; i < keys.length; i++) {
            const k = keys[i];
            const row = vals[k];
            const pr = row != null ? row.Price ?? row.price : '';
            const n = parseFloat(pr);
            const bucket = Number.isFinite(n) ? Math.round(n * 1000) : 0;
            acc = (((acc << 5) - acc + k.length * 131 + bucket) | 0) >>> 0;
        }
        return [
            pd.options.length,
            keys.length,
            String(pd.leadJob || ''),
            pd.access?.hasLeadAccess ? '1' : '0',
            acc,
        ].join('\x1e');
    }, [pricingData]);

    const [pricingSummary, setPricingSummary] = useState([]);
    const [grandTotal, setGrandTotal] = useState(0);
    const [hasPricedOptional, setHasPricedOptional] = useState(false);
    const [hasUserPricing, setHasUserPricing] = useState(false);

    // Lists
    const [usersList, setUsersList] = useState([]);
    const [customersList, setCustomersList] = useState([]);
    const [pendingQuotes, setPendingQuotes] = useState([]); // Pending List State
    const [quoteSearchResults, setQuoteSearchResults] = useState([]);
    const [quoteSearchLoading, setQuoteSearchLoading] = useState(false);
    const [pendingQuotesSortConfig, setPendingQuotesSortConfig] = useState({ field: 'DueDate', direction: 'asc' }); // Default: soonest due date on top

    const quoteListDisplayRows = React.useMemo(
        () => (quoteListCategory === QUOTE_LIST_CATEGORY.SEARCH ? quoteSearchResults : pendingQuotes),
        [quoteListCategory, quoteSearchResults, pendingQuotes],
    );

    const refetchPendingQuotes = useCallback(() => {
        const userEmail = currentUser?.EmailId || currentUser?.email || '';
        fetch(`${API_BASE}/api/quotes/list/pending?userEmail=${encodeURIComponent(userEmail)}`)
            .then(res => res.json())
            .then(data => setPendingQuotes(data || []))
            .catch(err => console.error('Error fetching pending quotes:', err));
    }, [currentUser]);

    const handleQuoteListSearch = useCallback(async () => {
        if (quoteListCategory !== QUOTE_LIST_CATEGORY.SEARCH) return;
        const userEmail = currentUser?.EmailId || currentUser?.email || '';
        const q = quoteListSearchCriteria.trim();
        const df = (quoteListDateFrom || '').trim();
        const dt = (quoteListDateTo || '').trim();
        if (!q && !(df && dt)) {
            setQuoteSearchResults([]);
            return;
        }
        setQuoteSearchLoading(true);
        try {
            const params = new URLSearchParams();
            params.set('userEmail', userEmail);
            params.set('q', quoteListSearchCriteria);
            if (df) params.set('dateFrom', df);
            if (dt) params.set('dateTo', dt);
            const res = await fetch(`${API_BASE}/api/quotes/list/search?${params.toString()}`);
            const data = res.ok ? await res.json() : [];
            setQuoteSearchResults(Array.isArray(data) ? data : []);
        } catch (e) {
            console.error('[QuoteForm] list/search', e);
            setQuoteSearchResults([]);
        } finally {
            setQuoteSearchLoading(false);
        }
    }, [quoteListCategory, quoteListSearchCriteria, quoteListDateFrom, quoteListDateTo, currentUser]);

    const handleQuoteListClear = useCallback(() => {
        setQuoteListSearchCriteria('');
        setQuoteListDateFrom('');
        setQuoteListDateTo('');
        setQuoteSearchResults([]);
        setQuoteListCategory(QUOTE_LIST_CATEGORY.PENDING);
        refetchPendingQuotes();
    }, [refetchPendingQuotes]);

    // Tab State for unified Quote and Pricing Sections
    const [activeQuoteTab, setActiveQuoteTab] = useState('self');

    // --- LOCKED LOGIC: Independent Tab State Management (Step 1722 fix) ---
    // Registry to store form state per tab to prevent data sharing/leakage.
    const tabStateRegistry = useRef({});
    const attentionOptionsCacheRef = React.useRef({ sig: '', arr: EMPTY_DEPT_ATTENTION_NAMES });

    // --- LOCKED LOGIC: Reusable Form Reset ---
    const resetFormState = useCallback(() => {
        setQuoteId(null);
        setQuoteNumber('');
        setQuoteDate(new Date().toISOString().split('T')[0]);
        setValidityDays(30);
        setPreparedBy((currentUser?.FullName || currentUser?.name || '').trim());
        setSignatory('');
        setSignatoryDesignation('');
        setSubject('');
        setCustomerReference('');
        setToName('');
        setToAddress('');
        setToPhone('');
        setToEmail('');
        setToFax('');
        setToAttention('');
        setQuoteEnquiryTypeSelect('');
        setQuoteTypeList([]);
        setClauses({
            showScopeOfWork: true, showBasisOfOffer: true, showExclusions: true,
            showPricingTerms: true, showSchedule: true, showWarranty: true,
            showResponsibilityMatrix: true, showTermsConditions: true, showAcceptance: true, showBillOfQuantity: true
        });
        setClauseContent({
            scopeOfWork: defaultClauses.scopeOfWork,
            basisOfOffer: defaultClauses.basisOfOffer,
            exclusions: defaultClauses.exclusions,
            pricingTerms: defaultClauses.pricingTerms,
            schedule: defaultClauses.schedule,
            warranty: defaultClauses.warranty,
            responsibilityMatrix: defaultClauses.responsibilityMatrix,
            termsConditions: defaultClauses.termsConditions,
            acceptance: defaultClauses.acceptance,
            billOfQuantity: defaultClauses.billOfQuantity
        });
        setCustomClauses([]);
        setOrderedClauses([
            'showScopeOfWork', 'showBasisOfOffer', 'showExclusions', 'showPricingTerms',
            'showBillOfQuantity', 'showSchedule', 'showWarranty', 'showResponsibilityMatrix', 'showTermsConditions', 'showAcceptance'
        ]);
        setSelectedJobs([]);
        setQuoteContextScope(null);
        setPricingSummary([]);
        setHasUserPricing(false);
        lastPricingCalcSigRef.current = '';
        lastQuickCalcInputRef.current = '';
        attentionOptionsCacheRef.current = { sig: '', arr: EMPTY_DEPT_ATTENTION_NAMES };

        // --- ENFORCE USER IDENTITY (Step 4488) ---
        if (enquiryData?.companyDetails) {
            setQuoteCompanyName(enquiryData.companyDetails.name);
            setQuoteLogo(enquiryData.companyDetails.logo);
            setFooterDetails(enquiryData.companyDetails);
        } else {
             setQuoteCompanyName('Almoayyed Air Conditioning');
             setQuoteLogo(null);
        }
    }, [currentUser, enquiryData]);

    const handleTabChange = (newTabId) => {
        if (newTabId === activeQuoteTab) return;

        // 1. Save Current Tab State
        tabStateRegistry.current[activeQuoteTab] = {
            subject, quoteDate, validityDays, customerReference,
            signatory, signatoryDesignation, preparedBy,
            toName, toAddress, toPhone, toEmail, toAttention,
            quoteTypeList, quoteEnquiryTypeSelect,
            clauseContent, clauses, customClauses, orderedClauses,
            quoteId, quoteNumber
        };

        // 2. Load or Reset New Tab State
        const saved = tabStateRegistry.current[newTabId];

        // Preserve current customer info to carry over
        const currentCustomer = {
            toName, toAddress, toPhone, toEmail, toAttention
        };

        if (saved) {
            setSubject(saved.subject);
            setQuoteDate(saved.quoteDate);
            setValidityDays(saved.validityDays);
            setCustomerReference(saved.customerReference);
            setSignatory(saved.signatory);
            setSignatoryDesignation(saved.signatoryDesignation);
            setPreparedBy(saved.preparedBy);

            // Recipient (customer dropdown + To fields) is one global choice for this session, not per job tab.
            // Restoring saved.toName here made HVAC/BMS tab switches snap the dropdown to the other tab's old value.
            setToName(currentCustomer.toName);
            setToAddress(currentCustomer.toAddress);
            setToPhone(currentCustomer.toPhone);
            setToEmail(currentCustomer.toEmail);
            setToAttention(currentCustomer.toAttention);
            setQuoteTypeList(Array.isArray(saved.quoteTypeList) ? [...saved.quoteTypeList] : []);
            setQuoteEnquiryTypeSelect(saved.quoteEnquiryTypeSelect || '');

            setClauseContent(saved.clauseContent);
            setClauses(saved.clauses);
            setCustomClauses(saved.customClauses);
            setOrderedClauses(saved.orderedClauses);
            // selectedJobs: global defaults from pricing summary effect (paired tabs), not per-tab snapshot
            setQuoteId(saved.quoteId);
            setQuoteNumber(saved.quoteNumber);
        } else {
            // Reset to defaults if fresh tab
            resetFormState();

            // Carry over customer info from previous tab
            setToName(currentCustomer.toName);
            setToAddress(currentCustomer.toAddress);
            setToPhone(currentCustomer.toPhone);
            setToEmail(currentCustomer.toEmail);
            setToAttention(currentCustomer.toAttention);
        }

        setActiveQuoteTab(newTabId);
    };

    const isDescendant = useCallback((childId, ancestorId, pool = null) => {
        if (!childId || !ancestorId) return false;
        const targetAncId = String(ancestorId);
        const jobsPool = pool || (pricingData?.jobs && pricingData.jobs.length > 0 ? pricingData.jobs : (enquiryData?.divisionsHierarchy || []));

        let currentId = String(childId);
        let visited = new Set();

        while (currentId && !visited.has(currentId)) {
            visited.add(currentId);
            const item = jobsPool.find(j => String(j.id || j.ItemID || j.ID || j.ID) === currentId);
            if (!item) break;

            const pid = String(item.parentId || item.ParentID || '');
            if (!pid || pid === '0' || pid === '' || pid === 'undefined') break;

            if (pid === targetAncId) return true;
            currentId = pid;
        }
        return false;
    }, [pricingData, enquiryData]);

    // Templates State
    const [templates, setTemplates] = useState([]);
    const [savedTemplateName, setSavedTemplateName] = useState('');
    const [selectedTemplateId, setSelectedTemplateId] = useState('');

    // Ordered Clauses (Standard + Custom)
    const [orderedClauses, setOrderedClauses] = useState([
        'showScopeOfWork', 'showBasisOfOffer', 'showExclusions', 'showPricingTerms',
        'showBillOfQuantity', 'showSchedule', 'showWarranty', 'showResponsibilityMatrix', 'showTermsConditions', 'showAcceptance'
    ]);

    const quotePreviewLayoutRef = useRef(null);
    const clauseMeasureHostRef = useRef(null);
    const lastClausePackSigRef = useRef('');
    /** pageOne reserved for letterhead→signatory only (no clauses); continuation = clause groups on sheet 2+. */
    const [clausePaginate, setClausePaginate] = useState({ pageOne: [], continuation: [] });

    /** Checked clauses in UI order (preview + measurement source). */
    const activeClausesList = React.useMemo(() => {
        return orderedClauses
            .map((id) => {
                const isCustom = String(id).startsWith('custom_');
                const customClause = isCustom ? customClauses.find((c) => c.id === id) : null;
                const standardClause = !isCustom ? QUOTE_CLAUSE_DEFINITIONS.find((c) => c.key === id) : null;
                if (!customClause && !standardClause) return null;
                return isCustom
                    ? { ...customClause, type: 'custom', listKey: id }
                    : {
                        ...standardClause,
                        type: 'standard',
                        isChecked: clauses[id],
                        content: clauseContent[standardClause.contentKey],
                        listKey: id,
                    };
            })
            .filter((c) => c && c.isChecked);
    }, [orderedClauses, clauses, customClauses, clauseContent]);

    /**
     * Stable key for clause packing — must NOT include pricingTerms body length: calculateSummary
     * rewrites that HTML every run and would churn this key → layout effect → setClausePaginate → infinite updates.
     */
    const clausePaginationLayoutKey = React.useMemo(() => {
        const ordered = orderedClauses.join(',');
        const std = QUOTE_CLAUSE_DEFINITIONS.map((d) => {
            const on = clauses[d.key] ? 1 : 0;
            if (d.contentKey === 'pricingTerms') return `${d.key}:${on}:_`;
            return `${d.key}:${on}:${String(clauseContent[d.contentKey] || '').length}`;
        }).join(';');
        const cust = (customClauses || [])
            .map((c) => `${String(c.id)}:${String(c.content || '').length}`)
            .join(';');
        return `${ordered}|${std}|${cust}`;
    }, [orderedClauses, clauses, clauseContent, customClauses]);

    const isQuotePreviewVisible = Boolean(
        enquiryData && enquiryData.leadJobPrefix && String(toName || '').trim()
    );

    /* clausePaginationLayoutKey replaces activeClausesList in deps — list identity churned and retriggered packing → max update depth. */
    useLayoutEffect(() => {
        if (!isQuotePreviewVisible) return;
        const preview = quotePreviewLayoutRef.current;
        const host = clauseMeasureHostRef.current;
        if (!preview || !host) return;

        lastClausePackSigRef.current = '';

        if (activeClausesList.length === 0) {
            setClausePaginate((prev) =>
                prev.pageOne.length || prev.continuation.length ? { pageOne: [], continuation: [] } : prev
            );
            return;
        }

        const cs = getComputedStyle(preview);
        const padL = parseFloat(cs.paddingLeft) || 0;
        const padR = parseFloat(cs.paddingRight) || 0;
        const innerW = Math.max(320, preview.clientWidth - padL - padR);
        host.style.width = `${innerW}px`;

        const measureHeights = () =>
            activeClausesList.map((_, i) => {
                const n = host.querySelector(`[data-clause-measure-index="${i}"]`);
                return n ? Math.round(n.getBoundingClientRect().height) : 0;
            });

        const applyPack = () => {
            const heights = measureHeights();
            const fallback = { pageOne: [], continuation: [activeClausesList.map((_, i) => i)] };
            if (heights.some((h) => !h)) {
                const sigFb = JSON.stringify(fallback);
                if (lastClausePackSigRef.current === sigFb) return;
                lastClausePackSigRef.current = sigFb;
                setClausePaginate((prev) => (clausePaginateEqual(prev, fallback) ? prev : fallback));
                return;
            }
            const sheetInnerMm = 297 - 15 * 2;
            /** Sheet 2+ chrome (continuation header); all clauses start after page 1 (letterhead through signatory). */
            const continuationChromeMm = 62;
            const contUsablePx = quoteMmToPx(Math.max(sheetInnerMm - continuationChromeMm, 110));

            const pageOne = [];
            const remaining = activeClausesList.map((_, i) => i);
            const contPacked = packGlobalClauseSubset(remaining, heights, contUsablePx);
            const continuation = rebalanceClausePageGroups(contPacked, heights, contUsablePx);
            const next = { pageOne, continuation };
            const sig = JSON.stringify(next);
            if (lastClausePackSigRef.current === sig) return;
            lastClausePackSigRef.current = sig;
            setClausePaginate((prev) => (clausePaginateEqual(prev, next) ? prev : next));
        };

        /* One deferred pass: sync applyPack + immediate remeasure fought calculateSummary’s pricingTerms updates. */
        const id = requestAnimationFrame(() => {
            applyPack();
        });
        return () => cancelAnimationFrame(id);
    }, [clausePaginationLayoutKey, isQuotePreviewVisible, sidebarWidth]);

    const sanitizedPageOneClauseIndices = React.useMemo(() => {
        if (!activeClausesList.length) return [];
        return (clausePaginate.pageOne || []).filter(
            (idx) => Number.isInteger(idx) && idx >= 0 && idx < activeClausesList.length
        );
    }, [clausePaginate.pageOne, activeClausesList]);

    /** Continuation-only groups; drop empty / invalid; if none left but clauses exist, show all on one sheet. */
    const sanitizedClausePageGroups = React.useMemo(() => {
        if (!activeClausesList.length) return [];
        const p1f = (clausePaginate.pageOne || []).filter(
            (idx) => Number.isInteger(idx) && idx >= 0 && idx < activeClausesList.length
        );
        const filtered = (clausePaginate.continuation || [])
            .map((group) =>
                group.filter(
                    (idx) => Number.isInteger(idx) && idx >= 0 && idx < activeClausesList.length
                )
            )
            .filter((g) => g.length > 0);
        if (filtered.length) return filtered;
        if (p1f.length) return [];
        return [activeClausesList.map((_, i) => i)];
    }, [clausePaginate.continuation, clausePaginate.pageOne, activeClausesList]);

    const quotePreviewTotalPages =
        activeClausesList.length === 0 ? 1 : 1 + sanitizedClausePageGroups.length;

    /** So profile “Manage signatures” modal can build the Page list while Quote is open. */
    useLayoutEffect(() => {
        if (typeof window !== 'undefined') {
            window.__EMS_QUOTE_PREVIEW_TOTAL_PAGES = quotePreviewTotalPages;
        }
    }, [quotePreviewTotalPages]);

    /** Same tab *structure* → same array reference, even when `enquiryData`/`pricingData` get new object identities. */
    const calculatedTabsCacheRef = React.useRef({ sig: '', tabs: EMPTY_CALCULATED_TABS });

    // Memoized Tabs Calculation
    const calculatedTabs = React.useMemo(() => {
        try {
            // Guard: At least enquiryData must exist
            if (!enquiryData) {
                calculatedTabsCacheRef.current = { sig: '[]', tabs: EMPTY_CALCULATED_TABS };
                return EMPTY_CALCULATED_TABS;
            }

            const hierarchy = enquiryData.divisionsHierarchy || [];
            if (hierarchy.length === 0 && jobsPool.length === 0) {
                calculatedTabsCacheRef.current = { sig: '[]', tabs: EMPTY_CALCULATED_TABS };
                return EMPTY_CALCULATED_TABS;
            }

            // 1. Source of Truth: Use consolidated jobsPool
            const localJobsList = jobsPool.length > 0 ? jobsPool : hierarchy.map(d => ({
                id: d.id || d.ItemID || d.ID,
                parentId: d.parentId || d.ParentID,
                itemName: d.itemName || d.ItemName || d.DivisionName,
                leadJobCode: d.leadJobCode || d.LeadJobCode,
                companyLogo: d.companyLogo,
                companyName: d.companyName,
                departmentName: d.departmentName,
                divisionCode: d.divisionCode || d.DivisionCode,
                departmentCode: d.departmentCode || d.DepartmentCode
            }));

            // ROBUST PREFIX/L-CODE EXTRACTION: Matches '17-L1' -> 'L1' or 'L1-17' -> 'L1'
            const rawPrefix = (enquiryData.leadJobPrefix || '').toUpperCase();
            const leadLCode = rawPrefix.match(/L\d+/) ? rawPrefix.match(/L\d+/)[0] : rawPrefix;

            const findLeadJobByPrefix = (prefix, pool) => {
                if (!prefix) return null;
                const p = prefix.toUpperCase();
                // Priority 1: Exact root match
                const rootMatch = pool.find(j => {
                    const isRoot = !(j.parentId || j.ParentID) || (j.parentId || j.ParentID) == '0' || (j.parentId || j.ParentID) == 0;
                    if (!isRoot) return false;
                    const jName = (j.itemName || '').toUpperCase();
                    const jCode = (j.leadJobCode || '').toUpperCase();
                    const cleanJName = jName.replace(/^(L\d+\s*-\s*)/, '').trim();
                    return jName === p || cleanJName === p || jName.includes(p) || jCode === p;
                });
                if (rootMatch) return rootMatch;
                // Priority 2: Any match
                return pool.find(j => {
                    const jName = (j.itemName || '').toUpperCase();
                    const jCode = (j.leadJobCode || '').toUpperCase();
                    const cleanJName = jName.replace(/^(L\d+\s*-\s*)/, '').trim();
                    return jName === p || cleanJName === p || jName.includes(p) || jCode === p;
                });
            };

            const _leadHit = findLeadJobByPrefix(leadLCode, localJobsList);
            const resolvedLeadJobId = _leadHit ? (_leadHit.id || _leadHit.ItemID) : undefined;

            // --- Resolved Lead Code for Quote Number Comparison ---
            const currentLeadCode = (() => {
                if (!leadLCode) return '';
                if (leadLCode.match(/^L\d+/)) return leadLCode;

                let job = localJobsList.find(j => String(j.id || j.ItemID) === String(resolvedLeadJobId));
                if (job) {
                    let root = job;
                    let safety = 0;
                    while (root && root.parentId && root.parentId !== '0' && root.parentId !== 0 && safety < 10) {
                        const parent = localJobsList.find(p => String(p.id || p.ItemID) === String(root.parentId));
                        if (parent) root = parent;
                        else break;
                        safety++;
                    }
                    const rCode = (root.leadJobCode || root.LeadJobCode || '').toUpperCase();
                    if (rCode && rCode.match(/^L\d+/)) return rCode;
                }
                return leadLCode;
            })();

            // Helper for hierarchy checks
            const isDescendantOrSelf = (jobId, targetId) => {
                let currId = jobId;
                let visited = new Set();
                while (currId && currId !== '0' && currId !== 0 && !visited.has(currId)) {
                    if (String(currId) === String(targetId)) return true;
                    visited.add(currId);
                    const found = localJobsList.find(j => String(j.id || j.ItemID) === String(currId));
                    if (!found) break;
                    currId = found.parentId || found.ParentID;
                }
                return false;
            };

            // RESOLVE EFFECTIVE ROOT:
            // 1. Determine user context
            const userDept = (currentUser?.Department || currentUser?.Division || '').trim().toLowerCase();
            const hasLeadAccess = isAdmin || ['civil', 'admin', 'bms admin'].includes(userDept) || pricingData?.access?.hasLeadAccess;
            const isSubUser = !hasLeadAccess;

            // 2. Find the job that represents the user's focus within this L-branch
            // Priority 1: Use explicit pricing assignments (editableJobs) as it's the most accurate
            const editableJobs = (pricingData?.access?.editableJobs || []).map(s => (s || '').toLowerCase().trim());
            const userDeptLower = (userDept || '').toLowerCase().trim();

            const matchesInBranch = localJobsList.filter(j => {
                const jName = (j.itemName || j.DivisionName || '').toLowerCase().trim();
                const isMatch = editableJobs.includes(jName) || (jName && editableJobs.some(ej => ej !== '' && (jName === ej || jName.includes(ej)))) || (userDeptLower && jName.includes(userDeptLower));
                return isMatch && isDescendantOrSelf(j.id || j.ItemID, resolvedLeadJobId);
            });

            // The effective root is either the user's specific job (to hide parents/peers) or the branch lead
            const effectiveRootId = (() => {
                if (!matchesInBranch || matchesInBranch.length === 0) return resolvedLeadJobId;

                // If only one match, it's the root
                if (matchesInBranch.length === 1) return (matchesInBranch[0].id || matchesInBranch[0].ItemID);

                // If multiple matches, find the top-most (shallowest) ones
                const topLevelMatches = matchesInBranch.filter(curr => {
                    // It's a top-level match if none of the OTHER matches are its ancestor
                    return !matchesInBranch.some(other => curr !== other && isDescendantOrSelf(curr.id || curr.ItemID, other.id || other.ItemID));
                });

                if (topLevelMatches.length === 1) return (topLevelMatches[0].id || topLevelMatches[0].ItemID);

                // If multiple top-level matches exist (siblings under the common root), favor the one matching user department
                const deptMatch = topLevelMatches.find(j => {
                    const jName = (j.itemName || j.DivisionName || '').toLowerCase().trim();
                    return jName.includes(userDeptLower) || userDeptLower.includes(jName);
                });

                if (deptMatch) return (deptMatch.id || deptMatch.ID);

                // Fallback: Use the first one
                return (topLevelMatches[0].id || topLevelMatches[0].ItemID);
            })();

            // 3. GENERATE TABS BASED ON ROLE & CONTEXT
            let finalTabs = [];

            // Determine if the effective root is a Lead Job or a Sub-job (Own Job Type)
            const isLeadJobContext = String(effectiveRootId) === String(resolvedLeadJobId);

            const selectedForTabs = (toName || '').trim();

            const isInternalJobName = (name) => {
                if (!name) return false;
                const key = collapseSpacesLower(stripQuoteJobPrefix(name));
                return localJobsList.some((j) => {
                    const jn = collapseSpacesLower(stripQuoteJobPrefix(j.itemName || j.DivisionName || ''));
                    return jn === key && jn.length > 0;
                });
            };

            const resolveLatestQuoteNoForJob = (jobNode) => {
                if (!jobNode || !existingQuotes.length) return null;
                const jn = (jobNode.itemName || jobNode.DivisionName || '').trim();
                if (!jn) return null;
                const tabLike = { label: jn, name: jn, divisionCode: jobNode.divisionCode };
                const matches = existingQuotes.filter((q) => {
                    if (selectedForTabs) {
                        const qTo = normalize(q.ToName || '');
                        const curTo = normalize(selectedForTabs);
                        if (qTo && curTo && qTo !== curTo) return false;
                    }
                    return quoteNumberDivisionMatchesTab(q, tabLike, true);
                });
                if (matches.length === 0) return null;
                matches.sort((a, b) => (b.RevisionNo || 0) - (a.RevisionNo || 0));
                return matches[0].QuoteNumber;
            };

            /** Merge hierarchy + pricing so parent/child links are not lost when one source omits rows. */
            const mergedJobsForHierarchy = (() => {
                const byId = new Map();
                const add = (row) => {
                    const id = String(row?.id ?? row?.ItemID ?? row?.ID ?? '');
                    if (!id) return;
                    const prev = byId.get(id);
                    const merged = prev
                        ? {
                            ...prev,
                            ...row,
                            parentId: row.parentId ?? row.ParentID ?? prev.parentId ?? prev.ParentID,
                            ParentID: row.ParentID ?? row.parentId ?? prev.ParentID ?? prev.parentId,
                            itemName: row.itemName || row.ItemName || prev.itemName,
                            DivisionName: row.DivisionName || prev.DivisionName
                        }
                        : {
                            ...row,
                            id: row.id || row.ItemID || row.ID,
                            parentId: row.parentId ?? row.ParentID,
                            ParentID: row.ParentID ?? row.parentId,
                            itemName: row.itemName || row.ItemName || row.DivisionName,
                            DivisionName: row.DivisionName || row.itemName
                        };
                    byId.set(id, merged);
                };
                (enquiryData?.divisionsHierarchy || []).forEach(add);
                (localJobsList || []).forEach(add);
                (pricingData?.jobs || []).forEach(add);
                return [...byId.values()];
            })();

            const collectDirectSubJobs = (parentId) => {
                if (!parentId) return [];
                const pid = String(parentId);
                const seen = new Set();
                const out = [];
                for (const j of mergedJobsForHierarchy) {
                    const jid = String(j.id || j.ItemID || j.ID || '');
                    if (!jid || seen.has(jid)) continue;
                    const pp = String(j.parentId ?? j.ParentID ?? '').trim();
                    if (pp === pid && pp !== '0' && pp !== '') {
                        seen.add(jid);
                        out.push(j);
                    }
                }
                return out.sort((a, b) =>
                    String(a.itemName || a.DivisionName || '').localeCompare(String(b.itemName || b.DivisionName || ''))
                );
            };

            /**
             * Own job for the logged-in user — same signals as quote customer options (email on division, then editableJobs, then department).
             * Scoped to the current lead branch when resolvedLeadJobId is set.
             */
            const findOwnJobNodeForLoggedInUser = () => {
                const userEmailNorm = (currentUser?.EmailId || currentUser?.email || '')
                    .toLowerCase()
                    .replace(/@almcg\.com/g, '@almoayyedcg.com')
                    .trim();
                const userDeptNorm = (currentUser?.Department || '').trim().toLowerCase();
                const editableNames = (pricingData?.access?.editableJobs || []).map((n) =>
                    String(n).replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim().toLowerCase()
                );

                const mailMatchesNode = (node) => {
                    if (!userEmailNorm) return false;
                    const raw = [node.commonMailIds, node.ccMailIds, node.CommonMailIds, node.CCMailIds]
                        .filter(Boolean)
                        .join(',');
                    const parts = raw
                        .split(/[,;]/)
                        .map((m) =>
                            m
                                .trim()
                                .toLowerCase()
                                .replace(/@almcg\.com/g, '@almoayyedcg.com')
                        )
                        .filter(Boolean);
                    return parts.some((p) => p === userEmailNorm);
                };

                const inLeadBranch = (j) => {
                    if (!resolvedLeadJobId) return true;
                    return isDescendantOrSelf(j.id || j.ItemID, resolvedLeadJobId);
                };

                const candidates = mergedJobsForHierarchy.filter(inLeadBranch);

                for (const n of candidates) {
                    if (mailMatchesNode(n)) return n;
                }
                for (const n of candidates) {
                    const nodeNameNorm = (n.itemName || n.DivisionName || '')
                        .replace(/^(L\d+|Sub Job)\s*-\s*/i, '')
                        .trim()
                        .toLowerCase();
                    if (editableNames.includes(nodeNameNorm)) return n;
                }
                for (const n of candidates) {
                    const nodeNameNorm = (n.itemName || n.DivisionName || '')
                        .replace(/^(L\d+|Sub Job)\s*-\s*/i, '')
                        .trim()
                        .toLowerCase();
                    if (userDeptNorm) {
                        if (nodeNameNorm === userDeptNorm) return n;
                        if (nodeNameNorm.includes(userDeptNorm) && userDeptNorm.length > 2) return n;
                        if (
                            userDeptNorm.includes(nodeNameNorm.replace(' project', '').trim()) &&
                            nodeNameNorm.length > 2
                        )
                            return n;
                    }
                }
                return null;
            };

            const attachJobBranding = (tab, node) => {
                if (!node) return tab;
                return {
                    ...tab,
                    companyLogo: tab.companyLogo || node.companyLogo || node.CompanyLogo,
                    companyName: tab.companyName || node.companyName || node.CompanyName,
                    departmentName: tab.departmentName || node.departmentName || node.DepartmentName,
                    divisionCode: tab.divisionCode || node.divisionCode || node.DivisionCode,
                };
            };

            /**
             * Tab 1 = user's own job (from email/editable/dept).
             * Further tabs = **every** direct child subjob under that own job (same parent id), sorted by name.
             */
            const buildTwoTabsUserOwnJobAndDirectSubjob = (ownJobNode) => {
                const ownId = ownJobNode.id || ownJobNode.ItemID;
                const ownIdStr = String(ownId);
                const kids = collectDirectSubJobs(ownId);
                const ownLabel = (ownJobNode.itemName || ownJobNode.DivisionName || '').trim();
                const tabs = [
                    attachJobBranding(
                        {
                            id: `ownjob-${ownIdStr}`,
                            name: ownLabel,
                            label: ownLabel,
                            isSelf: true,
                            isOwnJobTab: true,
                            realId: ownId,
                            divisionCode: ownJobNode.divisionCode,
                            quoteNo: resolveLatestQuoteNoForJob(ownJobNode),
                        },
                        ownJobNode
                    ),
                ];
                for (const kid of kids) {
                    tabs.push(
                        attachJobBranding(
                            {
                                id: `subjob-${kid.id || kid.ItemID}`,
                                name: kid.itemName || kid.DivisionName,
                                label: kid.itemName || kid.DivisionName,
                                isSelf: false,
                                isSubJobTab: true,
                                realId: kid.id || kid.ItemID,
                                divisionCode: kid.divisionCode,
                                quoteNo: resolveLatestQuoteNoForJob(kid),
                            },
                            kid
                        )
                    );
                }
                return tabs;
            };

            /** External / fallback: tab 1 = resolved lead (L-branch root), tab 2 = first direct subjob under that root. */
            const buildInternalLeadSubjobTabs = (markExternalRecipient = false) => {
                if (!resolvedLeadJobId) return [];
                const leadJobNode =
                    mergedJobsForHierarchy.find((j) => String(j.id || j.ItemID) === String(resolvedLeadJobId)) ||
                    localJobsList.find((j) => String(j.id || j.ItemID) === String(resolvedLeadJobId));
                const leadLabel = (leadJobNode?.itemName || leadJobNode?.DivisionName || selectedForTabs || enquiryData?.leadJobPrefix || 'Lead').trim();
                const subJobsAll = collectDirectSubJobs(resolvedLeadJobId);
                const subJobs = subJobsAll;
                const ext = markExternalRecipient ? { isExternal: true } : {};

                return [
                    attachJobBranding(
                        {
                            ...ext,
                            id: `lead-${resolvedLeadJobId}`,
                            name: leadLabel,
                            label: leadLabel,
                            isSelf: true,
                            isLeadInternalTab: true,
                            realId: resolvedLeadJobId,
                            divisionCode: leadJobNode?.divisionCode,
                            quoteNo: resolveLatestQuoteNoForJob(leadJobNode),
                        },
                        leadJobNode
                    ),
                    ...subJobs.map((sj) =>
                        attachJobBranding(
                            {
                                ...ext,
                                id: `subjob-${sj.id || sj.ItemID}`,
                                name: sj.itemName || sj.DivisionName,
                                label: sj.itemName || sj.DivisionName,
                                isSelf: false,
                                isSubJobTab: true,
                                realId: sj.id || sj.ItemID,
                                divisionCode: sj.divisionCode,
                                quoteNo: resolveLatestQuoteNoForJob(sj),
                            },
                            sj
                        )
                    ),
                ];
            };

            const userOwnJobFromLogin = findOwnJobNodeForLoggedInUser();
            if (userOwnJobFromLogin) {
                finalTabs = buildTwoTabsUserOwnJobAndDirectSubjob(userOwnJobFromLogin);
            } else if (!isLeadJobContext) {
                const currentJob = localJobsList.find((j) => String(j.id || j.ItemID || j.ID) === String(effectiveRootId));
                if (currentJob) {
                    finalTabs = [
                        {
                            id: 'self',
                            name: currentJob.itemName || currentJob.DivisionName,
                            label: currentJob.itemName || currentJob.DivisionName,
                            isSelf: true,
                            realId: currentJob.id || currentJob.ItemID || currentJob.ID,
                            companyLogo: currentJob.companyLogo,
                            companyName: currentJob.companyName,
                            departmentName: currentJob.departmentName,
                            quoteNo: resolveLatestQuoteNoForJob(currentJob)
                        }
                    ];
                }
            } else {
                finalTabs = buildInternalLeadSubjobTabs(!!(selectedForTabs && !isInternalJobName(selectedForTabs)));
            }


            // 4. Final Polish: Sorting
            finalTabs.sort((a, b) => (a.isSelf ? -1 : b.isSelf ? 1 : (a.name || '').localeCompare(b.name || '')));

            // Safety Fix: Ensure 'self' tab exists and is tagged
            if (finalTabs.length > 0 && !finalTabs.some(t => t.isSelf)) {
                finalTabs[0].isSelf = true;
                finalTabs[0].id = 'self';
            }

            if (finalTabs.length === 0) {
                calculatedTabsCacheRef.current = { sig: '[]', tabs: EMPTY_CALCULATED_TABS };
                return EMPTY_CALCULATED_TABS;
            }

            const reqNoForTabs = String(enquiryData?.enquiry?.RequestNo || enquiryData?.RequestNo || '');
            let structSig = '';
            try {
                structSig = JSON.stringify({
                    req: reqNoForTabs,
                    tabs: finalTabs.map((t) => ({
                        i: String(t.id),
                        r: String(t.realId ?? ''),
                        l: String(t.label || t.name || '').trim(),
                        q: String(t.quoteNo || '').trim(),
                        ow: !!t.isOwnJobTab,
                        su: !!t.isSubJobTab,
                        le: !!t.isLeadInternalTab,
                        d: String(t.divisionCode || ''),
                        cn: String(t.companyName || ''),
                        dp: String(t.departmentName || ''),
                        lg: String(t.companyLogo || ''),
                        sf: !!t.isSelf,
                        x: !!t.isExternal,
                    })),
                });
            } catch {
                structSig = `n:${finalTabs.length}:${reqNoForTabs}`;
            }
            const c = calculatedTabsCacheRef.current;
            if (structSig === c.sig && Array.isArray(c.tabs) && c.tabs.length === finalTabs.length) {
                return c.tabs;
            }
            calculatedTabsCacheRef.current = { sig: structSig, tabs: finalTabs };
            return finalTabs;
        } catch (err) {
            console.error('[calculatedTabs] Error:', err);
            calculatedTabsCacheRef.current = { sig: 'err', tabs: EMPTY_CALCULATED_TABS };
            return EMPTY_CALCULATED_TABS;
        }
        // Intentionally omit pricingSummary: it updates on every calculateSummary() but tabs come from
        // jobs / hierarchy / existingQuotes only. Including it re-created this array every render and
        // re-fired AutoLoad + hard-fallback (Maximum update depth, Quote Ref stuck on Draft).
    }, [pricingData, enquiryData, usersList, isAdmin, existingQuotes, toName, matchDivisionCode, jobsPool, currentUser]);

    // --- PROACTIVE IDENTITY SYNC (Step 4488) ---
    // ABSOLUTE LOCK: Ensure logo and footer are ALWAYS based on current user's personal profile.
    // Placed after `calculatedTabs` — must not reference it in deps before initialization (TDZ crash).
    useEffect(() => {
        if (currentUser && enquiryData?.availableProfiles) {
            // Multiple branch tabs: header/footer follow active tab + division profile (do not force personal profile).
            if ((calculatedTabs || []).length > 1) return;

            const userDept = (currentUser.Department || '').trim().toLowerCase();
            const userEmail = (currentUser.EmailId || currentUser.email || '').trim().toLowerCase();
            // Priority 1: Backend Flag
            let personalProfile = enquiryData.availableProfiles.find(p => p.isPersonalProfile);

            // Priority 2: Robust match (Email or Dept)
            if (!personalProfile) {
                personalProfile = enquiryData.availableProfiles.find(p => {
                    const pEmail = (p.email || '').trim().toLowerCase();
                    const pItem = (p.itemName || '').trim().toLowerCase();
                    const pName = (p.name || '').trim().toLowerCase();
                    return (userEmail && pEmail && (userEmail.includes(pEmail) || pEmail.includes(userEmail.split('@')[0]))) ||
                        (pItem === userDept || pName === userDept || (userDept.includes('bms') && pItem.includes('bms')));
                });
            }

            if (personalProfile) {
                if (import.meta.env.DEV && quoteCompanyName !== personalProfile.name) {
                    console.log('[IdentitySync] Absolute branding lock applied for:', personalProfile.name);
                }
                setQuoteCompanyName((prev) => (prev === personalProfile.name ? prev : personalProfile.name));
                setQuoteLogo((prev) => (prev === personalProfile.logo ? prev : personalProfile.logo));
                setFooterDetails((prev) => {
                    if (prev === personalProfile) return prev;
                    if (
                        prev &&
                        personalProfile &&
                        prev.name === personalProfile.name &&
                        prev.address === personalProfile.address &&
                        prev.phone === personalProfile.phone &&
                        (prev.email || '') === (personalProfile.email || '')
                    ) {
                        return prev;
                    }
                    return personalProfile;
                });

                // Inject/Lock in enquiryData for persistence (functional update + bail avoids enquiryData churn → calculatedTabs churn → loops).
                setEnquiryData((prev) => {
                    if (!prev) return prev;
                    const locked =
                        prev.companyDetails?.name === personalProfile.name &&
                        prev.enquiryCompanyName === personalProfile.name &&
                        prev.enquiryLogo === personalProfile.logo;
                    if (locked) return prev;
                    return {
                        ...prev,
                        companyDetails: { ...personalProfile, isPersonalProfile: true },
                        enquiryLogo: personalProfile.logo,
                        enquiryCompanyName: personalProfile.name,
                    };
                });
            }
        }
    }, [currentUser, enquiryData?.availableProfiles, calculatedTabs?.length]);

    /** Stable string so memo/effects do not re-fire when calculatedTabs is a new array with the same tabs. */
    const quoteTabsFingerprint = React.useMemo(
        () =>
            (calculatedTabs || [])
                .map(
                    (t) =>
                        `${String(t.id)}:${String(t.realId ?? '')}:${String(t.label || t.name || '').trim()}:${String(t.quoteNo || '').trim()}`
                )
                .join('|'),
        [calculatedTabs]
    );

    /** Tab branding without `calculatedTabs` reference in effect deps (prevents logo/footer setState every render). */
    const quoteTabBrandingFingerprint = React.useMemo(
        () =>
            (calculatedTabs || [])
                .map(
                    (t) =>
                        `${String(t.id)}:${String(t.companyLogo || '')}:${String(t.companyName || '')}:${String(t.departmentName || '').trim()}`
                )
                .join('|'),
        [calculatedTabs]
    );

    /** Group names only — pricingSummary array identity churns every calculateSummary; this string stays stable when names unchanged. */
    const pricingSummaryNamesKey = React.useMemo(
        () => (pricingSummary || []).map((g) => String(g?.name || '').trim()).join('\x1e'),
        [pricingSummary]
    );

    /** Aligns with UI fallback when calculatedTabs is empty (e.g. lead job + internal customer only). */
    const effectiveQuoteTabs = React.useMemo(() => {
        if (calculatedTabs && calculatedTabs.length > 0) return calculatedTabs;
        return [{
            id: 'default',
            name: 'Own Job',
            label: 'Own Job',
            isSelf: true,
            isEmptyCalculatedTabsFallback: true
        }];
    }, [calculatedTabs]);

    const pricingSelectionContextKey = React.useMemo(
        () => `${enquiryData?.enquiry?.RequestNo || ''}::${activeQuoteTab || ''}::${normalize(toName || '')}`,
        [enquiryData?.enquiry?.RequestNo, activeQuoteTab, toName]
    );

    /** Avoid preview signature/footer falling back to a personal-locked enquiry row when multiple job tabs are shown. */
    const quotePreviewEnquiryCompanyFallback = React.useMemo(() => {
        const cd = enquiryData?.companyDetails;
        if (!cd) return null;
        if ((calculatedTabs || []).length > 1 && cd.isPersonalProfile) return null;
        return cd;
    }, [enquiryData?.companyDetails, calculatedTabs?.length]);

    /** Document preview: under multi-job tabs, show active branch + same date tail as enquiry ProjectName when present. */
    const quotePreviewProjectName = React.useMemo(() => {
        const enq = enquiryData?.enquiry;
        if (!enq) return '';
        const tabs = calculatedTabs || [];
        const fallback = String(enq.ProjectName || '').trim();
        if (!tabs.length || tabs.length <= 1) return fallback;
        const tab = tabs.find((t) => String(t.id) === String(activeQuoteTab));
        const tl = String(tab?.label || tab?.name || '').trim();
        if (!tl) return fallback;
        const dateM = fallback.match(/\b(\d{1,2}-[A-Za-z]{3}-\d{4})\b/);
        const datePart = dateM ? dateM[1] : '';
        const base = stripQuoteJobPrefix(tl).trim() || tl;
        return datePart ? `${base} ${datePart}` : base || fallback;
    }, [enquiryData?.enquiry?.ProjectName, calculatedTabs, activeQuoteTab]);

    /** Preview-only subject line: keep custom text; normalize generic "Proposal for …" to active tab project label. */
    const quotePreviewSubject = React.useMemo(() => {
        const s = String(subject || '').trim();
        const p = String(quotePreviewProjectName || '').trim();
        if (!p) return s;
        if (!s) return `Proposal for ${p}`;
        const tabs = calculatedTabs || [];
        if (tabs.length > 1 && /^proposal\s+for\s+/i.test(s)) {
            return `Proposal for ${p}`;
        }
        return s;
    }, [subject, quotePreviewProjectName, calculatedTabs]);

    /** Own-job + subjob tabs: all pricing summary rows start checked; tab switch reapplies defaults (user can still uncheck). */
    const prevQuoteTabForDefaultsRef = React.useRef(null);
    React.useEffect(() => {
        if (!pricingSummary?.length || !calculatedTabs?.length) return;

        const tabs = calculatedTabs;
        const pairedOwnSub =
            tabs.length >= 2 &&
            tabs[0]?.realId &&
            tabs[0].isOwnJobTab &&
            tabs.slice(1).every((t) => t?.realId && t.isSubJobTab);
        const pairedLeadSubExternal =
            tabs.length >= 2 &&
            tabs[0]?.realId &&
            tabs[0].isLeadInternalTab &&
            tabs.slice(1).every((t) => t?.realId && t.isSubJobTab);
        const paired = pairedOwnSub || pairedLeadSubExternal;
        if (!paired) return;

        const activeTabObj = tabs.find((t) => String(t.id) === String(activeQuoteTab));
        if (!activeTabObj?.realId) return;

        // Union roots + direct children for every paired tab so `names` does not depend on which tab is active
        // (only adding the active tab's children dropped sibling groups from `names` after tab switch → wrong checkboxes).
        const pairedIds = new Set();
        tabs.forEach((t) => {
            const rid = t?.realId != null ? String(t.realId) : '';
            if (rid) pairedIds.add(rid);
            if (t?.realId) {
                collectDirectChildJobIdsFromPools(t.realId, jobsPool, enquiryData?.divisionsHierarchy || []).forEach((id) =>
                    pairedIds.add(String(id))
                );
            }
        });

        const names = pricingSummary
            .filter((grp) => {
                const grpNameNorm = collapseSpacesLower(stripQuoteJobPrefix(grp.name || ''));
                const matchingJobs = jobsPool.filter((j) =>
                    collapseSpacesLower(stripQuoteJobPrefix(j.itemName || j.DivisionName || j.ItemName || '')) === grpNameNorm
                );
                if (matchingJobs.length === 0) return false;
                // Do not require same "root id" as active tab — parent (own job) vs child (subjob) have different roots.
                return matchingJobs.some((job) => pairedIds.has(String(job.id || job.ItemID || job.ID)));
            })
            .map((g) => g.name);

        if (!names.length) return;

        const prevTab = prevQuoteTabForDefaultsRef.current;
        const tabChanged = prevTab !== null && prevTab !== activeQuoteTab;

        const sameSetAsNames = (prev) =>
            prev.length === names.length && names.every((n) => prev.includes(n)) && prev.every((n) => names.includes(n));

        setSelectedJobs((prev) => {
            // If user manually toggled for this tab+customer, keep their selection.
            if (pricingSelectionTouchedRef.current[pricingSelectionContextKey]) return prev;

            // Same multiset → keep prev reference (avoids Maximum update depth when `names` is a fresh [] each run).
            if (sameSetAsNames(prev)) return prev;

            if (tabChanged) return names;
            if (prev.length === 0) return names;
            // Pricing fetch often sets "all jobs" first; replace with own+subjob pair so both rows start checked.
            if (paired && prev.length > names.length) return names;
            // New quote: pricing summary uses grp.name (e.g. "HVAC Project") but loadPricingData may set itemName
            // strings that do not match — checkboxes stay off. Re-sync to summary names until user touches toggles.
            if (
                quoteId == null &&
                paired &&
                names.length > 0 &&
                !names.every((n) => prev.includes(n))
            ) {
                return names;
            }
            return prev;
        });

        prevQuoteTabForDefaultsRef.current = activeQuoteTab;
    }, [
        activeQuoteTab,
        pricingSummaryNamesKey,
        quoteTabsFingerprint,
        jobsPool,
        pricingSelectionContextKey,
        enquiryData?.divisionsHierarchy,
        quoteId,
    ]);

    // Global default: for any context, start with all pricing groups checked until user manually deselects.
    React.useEffect(() => {
        if (!pricingSummary?.length) return;
        if (!pricingSelectionContextKey) return;
        if (pricingSelectionTouchedRef.current[pricingSelectionContextKey]) return;

        const tabs = calculatedTabs || [];
        const pairedOwnSub =
            tabs.length >= 2 &&
            tabs[0]?.realId &&
            tabs[0].isOwnJobTab &&
            tabs.slice(1).every((t) => t?.realId && t.isSubJobTab);
        const pairedLeadSubExternal =
            tabs.length >= 2 &&
            tabs[0]?.realId &&
            tabs[0].isLeadInternalTab &&
            tabs.slice(1).every((t) => t?.realId && t.isSubJobTab);
        if (pairedOwnSub || pairedLeadSubExternal) return;

        const allNames = pricingSummary.map((g) => g?.name).filter(Boolean);
        if (!allNames.length) return;
        setSelectedJobs((prev) => {
            const sameSize = prev.length === allNames.length;
            const sameMembers = sameSize && allNames.every((n) => prev.includes(n));
            return sameMembers ? prev : allNames;
        });
    }, [pricingSummaryNamesKey, pricingSelectionContextKey, quoteTabsFingerprint]);

    /**
     * Quote customer dropdown (Steps 1–2):
     * 1) Own job = Master_ConcernedSE.Department for the logged-in user (merged into currentUser).
     * 2) If selected lead job ≠ own job → parent of own job in EnquiryFor for this RequestNo + LeadJobName (from API pool).
     *    If selected lead = own job → names from EnquiryCustomer only (enquiryData.customerOptions).
     */
    const quoteCustomerDropdownOptions = React.useMemo(() => {
        if (!enquiryData) return [];

        const cleanJobLabel = (s) =>
            String(s || '')
                .replace(/^(L\d+|Sub Job)\s*-\s*/i, '')
                .trim();

        const poolForEf = enquiryData.divisionsHierarchy?.length ? enquiryData.divisionsHierarchy : (jobsPool.length > 0 ? jobsPool : []);
        const allJobNamesNormSet = new Set(poolForEf.map((n) => normalize(n.itemName || n.DivisionName || '')));

        // Step 1: current user’s email ID to be taken from login page stored
        // ownjob to be derived from the current user’s email ID’s department from Master_ConcernedSE table
        // (currentUser.Department is authoritative from DB match in AuthContext)
        const ownjob = (currentUser?.Department || '').trim();
        const ownjobLower = ownjob.toLowerCase();

        const pricingJobs = pricingData?.jobs || [];
        
        // Resolve Selected Lead Job
        let selectedLeadJob = null;
        if (selectedLeadId) {
            selectedLeadJob =
                poolForEf.find((j) => String(j.id || j.ItemID || j.ID) === String(selectedLeadId)) ||
                pricingJobs.find((j) => String(j.id || j.ItemID || j.ID) === String(selectedLeadId));
        }

        if (!selectedLeadJob && enquiryData.leadJobPrefix && poolForEf.length) {
            const pref = String(enquiryData.leadJobPrefix).trim();
            const prefClean = cleanJobLabel(pref).toLowerCase();
            const roots = poolForEf.filter((j) => !j.parentId || j.parentId === '0' || j.parentId === 0);
            selectedLeadJob = roots.find((r) => {
                const nm = String(r.itemName || r.DivisionName || r.ItemName || '').trim();
                return normalize(nm) === normalize(pref) || cleanJobLabel(nm).toLowerCase() === prefClean;
            });
        }

        const selectedLeadLeadJobName = (selectedLeadJob?.leadJobName ?? selectedLeadJob?.LeadJobName ?? '').trim();
        const selectedLeadJobNameClean = cleanJobLabel(selectedLeadJob?.itemName ?? selectedLeadJob?.ItemName ?? '').toLowerCase();

        // Find own job node in the selected branch/hierarchy
        const ownJobNodeInBranch = poolForEf.find((j) => {
            if (!ownjob) return false;
            // Strict match for job name vs department
            const itemClean = cleanJobLabel(j.itemName || j.ItemName || '').toLowerCase();
            const matchesName = itemClean === ownjobLower || itemClean.includes(ownjobLower) || ownjobLower.includes(itemClean);
            if (!matchesName) return false;
            
            // Must belong to the same lead job branch if selected
            if (selectedLeadLeadJobName) {
                return (j.leadJobName ?? j.LeadJobName) === selectedLeadLeadJobName;
            }
            return true;
        });

        const enquiryCustomerOpts = (enquiryData.customerOptions || [])
            .map((c) => String(c).trim())
            .filter(Boolean)
            .map((c) => ({ value: c, label: c, type: 'Linked' }));

        const mergePricingExtrasForAdmin = () => {
            const out = [...enquiryCustomerOpts];
            const seen = new Set(out.map((o) => normalize(o.value)));
            if (pricingData?.customers) {
                pricingData.customers.forEach((c) => {
                    const k = normalize(c);
                    if (k && !seen.has(k)) {
                        seen.add(k);
                        out.push({ value: c, label: c, type: 'Internal Division' });
                    }
                });
            }
            return out.filter((opt) => !allJobNamesNormSet.has(normalize(opt.value)));
        };

        // Step 2 logic:
        let filteredOptions = [];

        // Check if selected lead name is same as ownjob
        const leadIsOwnJob = selectedLeadJobNameClean === ownjobLower || 
                           (ownjobLower.length > 2 && (selectedLeadJobNameClean.includes(ownjobLower) || ownjobLower.includes(selectedLeadJobNameClean)));

        if (leadIsOwnJob) {
            // if same as ownjob -> find external customer name from EnquiryCustomer
            filteredOptions = isAdmin || pricingData?.access?.hasLeadAccess ? mergePricingExtrasForAdmin() : [...enquiryCustomerOpts];
        } else {
            // if not same as ownjob -> find the parent job of ownjob for selected enquiry and leadjobname from Enquiryfor
            let parentJobName = '';
            if (ownJobNodeInBranch) {
                const pid = ownJobNodeInBranch.parentId ?? ownJobNodeInBranch.ParentID;
                if (pid && pid !== '0' && pid !== 0) {
                    const par = poolForEf.find((p) => String(p.id || p.ItemID || p.ID) === String(pid));
                    if (par) {
                        parentJobName = cleanJobLabel(par.itemName || par.DivisionName || par.ItemName || '').trim();
                    }
                }
            }

            if (parentJobName) {
                filteredOptions = [
                    { value: parentJobName, label: parentJobName, type: 'Internal Division' }
                ];
            } else {
                // Fallback for Admins or if ownjob is itself a root relative to the selection
                if (isAdmin || pricingData?.access?.hasLeadAccess) {
                    filteredOptions = mergePricingExtrasForAdmin();
                } else {
                    // If we can't resolve an internal parent division for this user/lead selection,
                    // don't leave the dropdown empty—fall back to external customers linked to the enquiry.
                    filteredOptions = [...enquiryCustomerOpts];
                }
            }
        }

        // Preserve current toName if it matches an option or is an external append allowed by role
        const t = (toName || '').trim();
        if (t) {
            const tn = normalize(t);
            const tk = normalizeCustomerKey(t);
            const has = filteredOptions.some(
                (o) => normalize(o.value) === tn || normalizeCustomerKey(o.value) === tk
            );
            const isInternalName = allJobNamesNormSet.has(tn);
            const allowExternalAppend = leadIsOwnJob || isAdmin || !!pricingData?.access?.hasLeadAccess;
            if (allowExternalAppend && !isInternalName && !has) {
                filteredOptions = [...filteredOptions, { value: t, label: t, type: 'Linked' }];
            }
        }

        return filteredOptions;
    }, [enquiryData, pricingData, jobsPool, selectedLeadId, currentUser, toName, isAdmin]);

    const customerSelectValue = React.useMemo(() => {
        if (!(toName || '').trim()) return null;
        const t = toName.trim();
        const tn = normalize(t);
        const tk = normalizeCustomerKey(t);
        const hit = quoteCustomerDropdownOptions.find(
            (o) => normalize(o.value) === tn || normalizeCustomerKey(o.value) === tk
        );
        return { label: hit?.label ?? t, value: hit?.value ?? t };
    }, [toName, quoteCustomerDropdownOptions]);

    const quoteCustomerCreatableStyles = React.useMemo(
        () => ({
            control: (base, state) => ({
                ...base,
                minHeight: '38px',
                fontSize: '13px',
                borderColor: '#e2e8f0',
                backgroundColor: state.isDisabled ? '#f1f5f9' : 'white',
            }),
            menu: (base) => ({ ...base, zIndex: 9999 }),
        }),
        []
    );
    const getCustomerOptionValue = React.useCallback((o) => o?.value ?? '', []);
    const getCustomerOptionLabel = React.useCallback((o) => o?.label ?? '', []);

    /**
     * Params for GET /api/quotes/by-enquiry/:requestNo — matches EnquiryQuotes columns:
     * - RequestNo = enquiry number (path param).
     * - LeadJob = lead job dropdown selection (selectedLeadId → job display name).
     * - First tab selected: OwnJob = first tab job name; ToName = customer dropdown (external recipient).
     * - Direct subjob tab (not first): OwnJob = selected tab’s job name (same label as the tab in “Previous Quotes”);
     *   ToName = first tab’s job label (internal branch routing, not the customer dropdown).
     */
    const scopedEnquiryQuotesParams = React.useMemo(() => {
        const tabs =
            calculatedTabs && calculatedTabs.length > 0 ? calculatedTabs : effectiveQuoteTabs || [];
        if (!tabs.length) return null;

        const mergedJobPool =
            (pricingData?.jobs && pricingData.jobs.length > 0 ? pricingData.jobs : null) || jobsPool || [];

        const first = tabs[0];
        const firstId = String(first?.id ?? '');
        const firstLabelRaw = (first?.label || first?.name || '').trim();

        const active = tabs.find(t => String(t.id) === String(activeQuoteTab));
        const activeLabelRaw = (active?.label || active?.name || '').trim();

        const isFirstTab = String(activeQuoteTab) === firstId;
        const placeholderFirst =
            first?.isEmptyCalculatedTabsFallback === true ||
            /^own\s*job$/i.test(firstLabelRaw);

        let ownJobName = '';
        let toNameParam = '';
        let useDepartmentForOwnJob = false;

        /** Same OwnJob / ToName strings as stored in EnquiryQuotes (full job name from hierarchy when possible). */
        const ownJobNameFromJobNode = (tab) => {
            if (!tab?.realId) return '';
            const node = mergedJobPool.find((j) => String(j.id || j.ItemID || j.ID) === String(tab.realId));
            return (node?.itemName || node?.ItemName || node?.DivisionName || '').trim();
        };

        const firstTabJobNameForDb = () => (ownJobNameFromJobNode(first) || firstLabelRaw).trim();

        if (tabs.length === 1 || isFirstTab) {
            if (placeholderFirst) {
                // No real first tab — server resolves OwnJob from logged-in user email → Master_ConcernedSE.Department
                useDepartmentForOwnJob = true;
            } else {
                ownJobName = firstTabJobNameForDb();
            }
            toNameParam = (toName || '').trim();
        } else {
            // Subjob tab (not first): OwnJob = selected tab; ToName = first tab label (internal “parent” job for the tuple)
            ownJobName = (ownJobNameFromJobNode(active) || activeLabelRaw).trim();
            toNameParam = firstTabJobNameForDb();
        }

        const leadJobName = (() => {
            if (selectedLeadId) {
                const node = mergedJobPool.find((j) => String(j.id || j.ItemID || j.ID) === String(selectedLeadId));
                const nm = (node?.itemName || node?.ItemName || node?.DivisionName || '').trim();
                if (nm) return nm;
            }
            const prefix = (enquiryData?.leadJobPrefix || '').trim();
            if (prefix && mergedJobPool.length) {
                const norm = (s) => String(s || '').replace(/^L\d+\s*-\s*/i, '').trim().toLowerCase();
                const target = norm(prefix);
                const root = mergedJobPool.find((j) => {
                    const isRoot = !j.parentId || j.parentId === '0' || j.parentId === 0;
                    if (!isRoot) return false;
                    const nm = j.itemName || j.ItemName || j.DivisionName || '';
                    return norm(nm) === target || String(nm).trim().toLowerCase() === prefix.toLowerCase();
                });
                if (root) return (root.itemName || root.ItemName || root.DivisionName || '').trim();
            }
            return '';
        })();

        if (!leadJobName || !toNameParam) return null;
        if (!useDepartmentForOwnJob && !ownJobName) return null;

        return {
            leadJobName,
            toName: toNameParam,
            ownJobName: useDepartmentForOwnJob ? null : ownJobName,
            useDepartmentForOwnJob
        };
    }, [calculatedTabs, effectiveQuoteTabs, activeQuoteTab, toName, selectedLeadId, pricingData, enquiryData?.leadJobPrefix, jobsPool, enquiryData?.divisionsHierarchy]);

    /**
     * Primitives-only key so the scoped-quote fetch does not re-run when `pricingData` / `jobsPool`
     * object references change but LeadJob / OwnJob / ToName are unchanged (main cause of flicker).
     */
    const scopedQuotePanelFetchKey = React.useMemo(() => {
        const p = scopedEnquiryQuotesParams;
        if (!p) return null;
        const em = (currentUser?.email || currentUser?.EmailId || '').trim().toLowerCase();
        return [
            p.leadJobName,
            p.toName,
            p.ownJobName ?? '',
            p.useDepartmentForOwnJob ? '1' : '0',
            em,
        ].join('\x1e');
    }, [
        scopedEnquiryQuotesParams?.leadJobName,
        scopedEnquiryQuotesParams?.toName,
        scopedEnquiryQuotesParams?.ownJobName,
        scopedEnquiryQuotesParams?.useDepartmentForOwnJob,
        currentUser?.email,
        currentUser?.EmailId,
    ]);

    useEffect(() => {
        const rn = enquiryData?.enquiry?.RequestNo;
        if (!rn) {
            setQuoteScopedForPanel([]);
            setScopedQuotesFetchSettledKey(null);
            return;
        }
        if (!scopedQuotePanelFetchKey || !scopedEnquiryQuotesParams) {
            setQuoteScopedForPanel([]);
            setScopedQuotesFetchSettledKey(null);
            return;
        }
        const p = scopedEnquiryQuotesParams;
        const fetchKey = scopedQuotePanelFetchKey;
        setScopedQuotesFetchSettledKey(null);

        let cancelled = false;
        (async () => {
            try {
                // Do not clear the panel before fetch — that flashes empty. Replace when the response arrives.
                const em = (currentUser?.email || currentUser?.EmailId || '').toString();
                const qs = new URLSearchParams();
                if (em) qs.set('userEmail', em);
                qs.set('leadJobName', p.leadJobName);
                qs.set('toName', p.toName);
                if (p.ownJobName) qs.set('ownJobName', p.ownJobName);

                const url = `${API_BASE}/api/quotes/by-enquiry/${encodeURIComponent(rn)}?${qs.toString()}`;
                const res = await fetch(url);
                if (cancelled) return;
                if (res.ok) {
                    const rows = await res.json();
                    setQuoteScopedForPanel(Array.isArray(rows) ? rows : []);
                } else {
                    setQuoteScopedForPanel([]);
                }
                if (!cancelled) setScopedQuotesFetchSettledKey(fetchKey);
            } catch (e) {
                if (!cancelled) {
                    setQuoteScopedForPanel([]);
                    setScopedQuotesFetchSettledKey(fetchKey);
                }
            }
        })();

        return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch keyed by scopedQuotePanelFetchKey; scopedEnquiryQuotesParams identity churns with pricingData
    }, [enquiryData?.enquiry?.RequestNo, scopedQuotePanelFetchKey]);

    const scopedQuoteTupleReady =
        !scopedEnquiryQuotesParams ||
        scopedQuotesFetchSettledKey === scopedQuotePanelFetchKey;

    /** Preview must not show another tab's Quote Ref while scoped rows + active tab imply "no quote for this tab". */
    const loadedQuoteOutOfActiveTabScope = React.useMemo(() => {
        if (!scopedEnquiryQuotesParams) return false;
        if (scopedQuotesFetchSettledKey !== scopedQuotePanelFetchKey) return false;
        if (!quoteScopedForPanel?.length || !calculatedTabs?.length || !activeQuoteTab) return false;
        const activeTabObj = calculatedTabs.find((t) => String(t.id) === String(activeQuoteTab));
        if (!activeTabObj || !(activeTabObj.label || activeTabObj.name)) return false;
        const multiTab = calculatedTabs.length > 1;
        const narrowed = multiTab || !!scopedEnquiryQuotesParams.useDepartmentForOwnJob;
        if (!narrowed) return false;
        const tabJobName = collapseSpacesLower(stripQuoteJobPrefix(activeTabObj.label || activeTabObj.name || ''));
        const panel = quoteScopedForPanel.filter((q) => {
            const quoteOwnJob = collapseSpacesLower(stripQuoteJobPrefix(q.OwnJob || ''));
            return (
                quoteOwnJob === tabJobName ||
                (activeTabObj.realId && String(q.DepartmentID) === String(activeTabObj.realId)) ||
                quoteNumberDivisionMatchesTab(q, activeTabObj, multiTab)
            );
        });
        const hasLoadedRef =
            (quoteId != null && String(quoteId).trim() !== '') ||
            (quoteNumber != null && String(quoteNumber).trim() !== '');
        if (!hasLoadedRef) return false;
        const matchById = panel.some((q) => String(quoteRowId(q) ?? '') === String(quoteId ?? ''));
        const qnTrim = quoteNumber != null ? String(quoteNumber).trim() : '';
        const quoteNoMatchesRow = (q) => {
            const qn = String(q.QuoteNumber || q.quoteNumber || '').trim();
            return !!(qn && qnTrim && (qn === qnTrim || qn.split('-R')[0] === qnTrim.split('-R')[0]));
        };
        const matchByNumber = qnTrim
            ? panel.some((q) => quoteNoMatchesRow(q)) ||
              // OwnJob on server often ≠ priced branch; division segment of QuoteNumber still matches this tab.
              (Array.isArray(quoteScopedForPanel) &&
                  quoteScopedForPanel.some(
                      (q) => quoteNoMatchesRow(q) && quoteNumberDivisionMatchesTab(q, activeTabObj, multiTab)
                  ))
            : false;
        return !(matchById || matchByNumber);
    }, [
        scopedEnquiryQuotesParams,
        scopedQuotesFetchSettledKey,
        scopedQuotePanelFetchKey,
        quoteScopedForPanel,
        calculatedTabs,
        activeQuoteTab,
        quoteId,
        quoteNumber,
    ]);

    /** Save only when no DB quote for this enquiry+lead+ownjob+ToName tuple; Revision only when at least one exists (scoped API is source of truth when active). */
    const hasPersistedQuoteForScope = React.useMemo(() => {
        if (!enquiryData?.enquiry?.RequestNo) return false;
        if (scopedEnquiryQuotesParams) {
            if (scopedQuotesFetchSettledKey !== scopedQuotePanelFetchKey) return false;
            return quoteScopedForPanel.length > 0;
        }
        return !!quoteId;
    }, [
        enquiryData?.enquiry?.RequestNo,
        scopedEnquiryQuotesParams,
        scopedQuotesFetchSettledKey,
        scopedQuotePanelFetchKey,
        quoteScopedForPanel.length,
        quoteId,
    ]);

    // Auto-resolve active tabs based on calculated permissions
    useEffect(() => {
        if (!calculatedTabs || calculatedTabs.length === 0) {
            if (String(activeQuoteTab) !== 'default') {
                setActiveQuoteTab('default');
            }
            return;
        }
        const currentQuoteTabValid = calculatedTabs.find(t => String(t.id) === String(activeQuoteTab));
        if (!currentQuoteTabValid) {
            console.log('[AutoRes] Fixing Active Quote Tab:', activeQuoteTab, '->', calculatedTabs[0].id);
            setActiveQuoteTab(calculatedTabs[0].id);
        }
    }, [calculatedTabs, activeQuoteTab]);

    // Sync Company Logo and Details based on Active Pricing Tab
    // Multi-tab: resolve division profile + jobsPool row (subjob tabs often had no company fields on the tab object).
    useEffect(() => {
        if (!calculatedTabs?.length || !activeQuoteTab) return;
        const activeTab = calculatedTabs.find((t) => String(t.id) === String(activeQuoteTab));
        if (!activeTab) return;

        if (import.meta.env.DEV) {
            console.log('[QuoteForm] Syncing Logo/Details for Tab:', activeTab.label);
        }

        const brandingRows = enquiryData?.enquiryForBrandingRows;
        if (Array.isArray(brandingRows) && brandingRows.length > 0) {
            const mefHit = matchMasterEnquiryForBrandingRow(activeTab, brandingRows);
            if (
                mefHit &&
                (mefHit.companyLogo ||
                    mefHit.address ||
                    mefHit.phone ||
                    (mefHit.companyName || '').trim() ||
                    (mefHit.departmentName || '').trim())
            ) {
                const displayName =
                    String(mefHit.companyName || '').trim() ||
                    String(mefHit.departmentName || '').trim() ||
                    String(activeTab.label || activeTab.name || '').trim();
                const logo = mefHit.companyLogo || null;
                setQuoteLogo((prev) => (prev === logo ? prev : logo));
                setQuoteCompanyName((prev) => (prev === displayName ? prev : displayName));
                const nextFooter = {
                    name: displayName,
                    address: mefHit.address || '',
                    phone: mefHit.phone || '',
                    fax: mefHit.faxNo || '',
                    email: mefHit.email || '',
                };
                setFooterDetails((prev) => {
                    if (
                        prev &&
                        prev.name === nextFooter.name &&
                        prev.address === nextFooter.address &&
                        prev.phone === nextFooter.phone &&
                        prev.fax === nextFooter.fax &&
                        (prev.email || '') === (nextFooter.email || '')
                    ) {
                        return prev;
                    }
                    return nextFooter;
                });
                return;
            }
        }

        const personalProfile = enquiryData?.availableProfiles?.find((p) => p.isPersonalProfile);
        const multiTab = (calculatedTabs || []).length > 1;
        // Any multi-job quote screen must use division/tab + QuoteNumber segment — not the "single-tab" path that
        // defaults to personalProfile + "Almoayyed Air Conditioning" (tabs like `id: self` may lack isOwnJobTab flags).
        const tabContext = multiTab;

        const jobNode =
            activeTab?.realId != null
                ? jobsPool.find((j) => String(j.id || j.ItemID || j.ID) === String(activeTab.realId))
                : null;

        const profiles = enquiryData?.availableProfiles || [];

        const refLike = String(activeTab.quoteNo || quoteNumber || '').trim();
        const refDivU = (() => {
            const parts = refLike.split('/').map((s) => s.trim());
            const seg = parts.length > 1 ? parts[1] : '';
            const u = seg ? seg.toUpperCase() : '';
            if (!u) return '';
            if (['AAC', 'ACC', 'GEN'].includes(u)) return '';
            return u;
        })();

        const resolveDivisionProfile = () => {
            if (!tabContext) return null;

            if (refDivU) {
                let hit = profiles.find(
                    (p) => !p.isPersonalProfile && String(p.divisionCode || '').toUpperCase() === refDivU
                );
                if (hit) return hit;
                hit = profiles.find(
                    (p) =>
                        !p.isPersonalProfile &&
                        matchDivisionCode(
                            refDivU,
                            String(p.itemName || p.name || '').toUpperCase(),
                            p.divisionCode
                        )
                );
                if (hit) return hit;
                hit = profiles.find(
                    (p) =>
                        !p.isPersonalProfile &&
                        matchDivisionCode(
                            refDivU,
                            String(p.itemName || p.name || '').toUpperCase(),
                            p.divisionCode
                        )
                );
                if (hit) return hit;
            }

            const divCode = String(
                activeTab.divisionCode || jobNode?.divisionCode || jobNode?.DivisionCode || ''
            ).toUpperCase();
            if (divCode) {
                let hit = profiles.find(
                    (p) => !p.isPersonalProfile && String(p.divisionCode || '').toUpperCase() === divCode
                );
                if (hit) return hit;
                hit = profiles.find(
                    (p) =>
                        !p.isPersonalProfile &&
                        divCode &&
                        matchDivisionCode(
                            divCode,
                            String(p.itemName || p.name || '').toUpperCase(),
                            p.divisionCode
                        )
                );
                if (hit) return hit;
                hit = profiles.find(
                    (p) =>
                        !p.isPersonalProfile &&
                        divCode &&
                        matchDivisionCode(
                            divCode,
                            String(p.itemName || p.name || '').toUpperCase(),
                            p.divisionCode
                        )
                );
                if (hit) return hit;
            }
            const tabLabel = collapseSpacesLower(stripQuoteJobPrefix(activeTab.label || activeTab.name || ''));
            const tabTokens = tabLabel.split(/\s+/).filter((t) => t.length > 2);
            return (
                profiles.find((p) => {
                    if (p.isPersonalProfile) return false;
                    const pn = collapseSpacesLower(stripQuoteJobPrefix(p.itemName || p.name || ''));
                    if (pn && (pn === tabLabel || tabLabel.includes(pn) || pn.includes(tabLabel))) return true;
                    if (pn && tabTokens.some((tok) => pn.includes(tok) || tok.includes(pn))) return true;
                    return false;
                }) || null
            );
        };

        let divisionProfile = resolveDivisionProfile();
        if (tabContext && divisionProfile?.isPersonalProfile) {
            divisionProfile = null;
        }

        const jobLogo = jobNode?.companyLogo || jobNode?.CompanyLogo || null;
        const jobComp =
            jobNode?.companyName ||
            jobNode?.CompanyName ||
            jobNode?.departmentName ||
            jobNode?.DepartmentName ||
            '';

        let finalLogo;
        let finalCompanyName;
        let footerSource;

        if (tabContext) {
            const tabDisplay = String(activeTab.label || activeTab.name || '').trim();
            const cd = enquiryData?.companyDetails;
            const cdSafe =
                cd && !cd.isPersonalProfile
                    ? cd
                    : null;
            // Do not fall back to enquiryLogo / personalProfile here — they are often another division (e.g. HVAC AC while Civil/CIP tab is active).
            finalLogo =
                divisionProfile?.logo ||
                activeTab.companyLogo ||
                jobLogo ||
                (cdSafe?.logo ?? null) ||
                null;
            finalCompanyName =
                divisionProfile?.name ||
                activeTab.companyName ||
                activeTab.departmentName ||
                jobComp ||
                tabDisplay ||
                (cdSafe?.name ?? null) ||
                'Almoayyed Contracting';
            if (divisionProfile?.address || divisionProfile?.phone || divisionProfile?.email) {
                footerSource = divisionProfile;
            } else if (jobNode?.address || jobNode?.phone || jobNode?.email) {
                footerSource = jobNode;
            } else if (cdSafe?.address || cdSafe?.phone || cdSafe?.email) {
                footerSource = cdSafe;
            } else {
                const rawCd = enquiryData?.companyDetails;
                footerSource =
                    divisionProfile ||
                    cdSafe ||
                    (rawCd && !rawCd.isPersonalProfile ? rawCd : null);
            }
        } else {
            const preferTabBranding = !!(
                activeTab.companyLogo ||
                activeTab.companyName ||
                activeTab.departmentName
            );
            finalLogo = preferTabBranding
                ? activeTab.companyLogo || enquiryData?.enquiryLogo || personalProfile?.logo || null
                : personalProfile?.logo || activeTab.companyLogo || enquiryData?.enquiryLogo || null;
            finalCompanyName = preferTabBranding
                ? activeTab.companyName ||
                  activeTab.departmentName ||
                  personalProfile?.name ||
                  enquiryData?.enquiryCompanyName ||
                  'Almoayyed Air Conditioning'
                : personalProfile?.name ||
                  activeTab.companyName ||
                  activeTab.departmentName ||
                  enquiryData?.enquiryCompanyName ||
                  'Almoayyed Air Conditioning';
            footerSource = preferTabBranding
                ? activeTab?.address || activeTab?.phone || activeTab?.email
                    ? activeTab
                    : enquiryData?.companyDetails || activeTab || personalProfile
                : personalProfile || activeTab || enquiryData?.companyDetails;
        }

        if (import.meta.env.DEV) {
            console.log('[QuoteForm]   - Locked Company:', finalCompanyName);
        }

        setQuoteLogo((prev) => (prev === finalLogo ? prev : finalLogo));
        setQuoteCompanyName((prev) => (prev === finalCompanyName ? prev : finalCompanyName));

        if (footerSource && (footerSource.address || footerSource.phone || footerSource.email)) {
            const nextFooter = {
                name: finalCompanyName,
                address: footerSource.address,
                phone: footerSource.phone,
                fax: footerSource.fax,
                email: footerSource.email || footerSource.CommonMailIds,
            };
            setFooterDetails((prev) => {
                if (
                    prev &&
                    prev.name === nextFooter.name &&
                    prev.address === nextFooter.address &&
                    prev.phone === nextFooter.phone &&
                    prev.fax === nextFooter.fax &&
                    prev.email === nextFooter.email
                ) {
                    return prev;
                }
                return nextFooter;
            });
        } else if (personalProfile && !tabContext) {
            setFooterDetails((prev) => (prev === personalProfile ? prev : personalProfile));
        } else {
            setFooterDetails((prev) => (prev == null ? prev : null));
        }
    }, [
        activeQuoteTab,
        quoteTabBrandingFingerprint,
        quoteNumber,
        enquiryData?.availableProfiles,
        enquiryData?.enquiryForBrandingRows,
        jobsPool,
        enquiryData?.companyDetails,
        enquiryData?.enquiryLogo,
        enquiryData?.enquiryCompanyName,
    ]);


    // Ref to track if we've already auto-selected for the current tab (prevents overwriting user manual selection)
    const lastAutoSelectRef = useRef({ tab: null, processed: false });
    // Ref to read current toName without adding it to deps (adding it causes an infinite loop:
    // toName → pricingData load → AutoSelect re-runs → overwrites toName → repeat)
    const toNameRef = useRef(toName);
    useEffect(() => { toNameRef.current = toName; }, [toName]);

    // Auto-select customer based on tab navigation (singleness rule)
    useEffect(() => {
        if (!enquiryData || !pricingData || !activeQuoteTab) return;

        // Reset processed flag if tab OR pricingData changes
        if (lastAutoSelectRef.current.tab !== activeQuoteTab) {
            lastAutoSelectRef.current = { tab: activeQuoteTab, processed: false };
        }

        // Only run logic if not yet processed for this tab
        if (lastAutoSelectRef.current.processed) return;

        // Helper to check hierarchy
        const isDescendantLocal = (childId, parentId) => {
            const hierarchy = enquiryData.divisionsHierarchy || [];
            let current = hierarchy.find(d => String(d.ItemID || d.id) === String(childId));
            while (current) {
                if (String(current.ParentID || current.parentId) === String(parentId)) return true;
                current = hierarchy.find(d => String(d.ItemID || d.id) === String(current.ParentID || current.parentId));
            }
            return false;
        };

        const activeTabObj = (calculatedTabs || []).find(t => String(t.id) === String(activeQuoteTab));
        if (!activeTabObj) return;

        const realId = activeTabObj.realId;
        const currentToName = toNameRef.current; // Read via ref — avoids dep loop
        const allCandidates = (enquiryData.customerOptions || []).map(c => c.trim());

        // Identify customers who have at least one price > 0 for this tab's subtree
        const pricedCustomers = allCandidates.filter(custName => {
            const custKey = normalize(custName);
            const custValues = pricingData.allValues ? pricingData.allValues[custKey] : null;
            if (!custValues) return false;

            return Object.values(custValues).some(v => {
                const vJobId = v.EnquiryForID;
                if (!vJobId) return false;

                const isMatch = String(vJobId) === String(realId) || isDescendantLocal(vJobId, realId);
                return isMatch && parseFloat(v.Price) > 0;
            });
        });

        // NOTE: Auto-selection of toName based on pricing is disabled to ensure manual control and clean slate.
        // The user must manually select a customer even if pricing exists.

        // Mark as processed for this tab so we don't run again until tab changes
        lastAutoSelectRef.current.processed = true;
    }, [activeQuoteTab, pricingData, enquiryData, calculatedTabs]); // toName intentionally excluded — read via ref above



    // NEW: Sync Attention Of (toAttention) whenever toName or enquiryData changes
    // NOTE: toAttention is intentionally NOT in the dep array — adding it blocks manual editing by
    // re-running on every keystroke. We use a ref to track which customer we last resolved for.
    const lastAttentionResolvedForRef = useRef({ req: '', to: '', pricingSig: '' });
    useEffect(() => {
        if (!toName || !enquiryData) return;

        const req = String(enquiryData?.enquiry?.RequestNo || '');
        const pricingSig = JSON.stringify(
            (pricingData?.jobs || [])
                .filter(j => j.visible !== false)
                .map(j => stripQuoteJobPrefix(j.itemName || j.DivisionName || j.ItemName || '').toLowerCase())
                .filter(Boolean)
                .sort()
        );
        const prev = lastAttentionResolvedForRef.current;
        if (prev.req === req && prev.to === toName && prev.pricingSig === pricingSig) return;
        lastAttentionResolvedForRef.current = { req, to: toName, pricingSig };

        // --- INTERNAL CUSTOMER: same detection as attentionSelectOptions ---
        const hierarchyCleanEff = new Set(
            (enquiryData?.divisionsHierarchy || []).map(n =>
                collapseSpacesLower(stripQuoteJobPrefix(n.itemName || n.DivisionName || ''))
            )
        );
        const profileCleanEff = new Set(
            (enquiryData?.availableProfiles || []).map(p =>
                collapseSpacesLower(stripQuoteJobPrefix(p.itemName || ''))
            )
        );
        const pricingCleanEff = new Set(
            (pricingData?.jobs || [])
                .filter(j => j.visible !== false)
                .map(j => collapseSpacesLower(stripQuoteJobPrefix(j.itemName || j.DivisionName || j.ItemName || '')))
                .filter(Boolean)
        );
        const toNameCleanEff = collapseSpacesLower(stripQuoteJobPrefix(toName));
        const toKeyEff = normalizeCustomerKey(toName);
        const isInternalCustomerEffect =
            hierarchyCleanEff.has(toNameCleanEff) ||
            profileCleanEff.has(toNameCleanEff) ||
            [...pricingCleanEff].some(pc =>
                pc === toNameCleanEff ||
                (toKeyEff &&
                    (normalizeCustomerKey(pc) === toKeyEff ||
                        pc.includes(toNameCleanEff) ||
                        toNameCleanEff.includes(pc)))
            );
        if (isInternalCustomerEffect) {
            const intAtt = resolveQuoteInternalAttentionFlexible(enquiryData, toName);
            if (intAtt?.defaultAttention) setToAttention(intAtt.defaultAttention);
            else if (intAtt?.options?.length) setToAttention(intAtt.options[0]);
            else setToAttention('');
            return;
        }

        // External: prefer discrete ReceivedFrom contacts (matches dropdown)
        const target = normalize(toName);
        const extMap = enquiryData.externalAttentionOptionsByCustomer || {};
        let extList = extMap[toName] || extMap[toName.trim()];
        if (!extList) {
            const fk = Object.keys(extMap).find(k => normalize(k) === target);
            if (fk) extList = extMap[fk];
        }
        if (Array.isArray(extList) && extList.length > 0) {
            setToAttention(extList[0]);
        } else if (enquiryData.customerContacts && enquiryData.customerContacts[toName.trim()]) {
            setToAttention(enquiryData.customerContacts[toName.trim()]);
        } else if (enquiryData.customerContacts) {
            const match = Object.keys(enquiryData.customerContacts).find(k => normalize(k) === target);
            if (match) setToAttention(enquiryData.customerContacts[match]);
            else if (enquiryData.enquiry?.ReceivedFrom) setToAttention(enquiryData.enquiry.ReceivedFrom);
            else setToAttention('');
        } else if (enquiryData.enquiry?.ReceivedFrom) {
            setToAttention(enquiryData.enquiry.ReceivedFrom);
        } else {
            setToAttention('');
        }

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [toName, enquiryData, pricingData?.jobs]); // toAttention intentionally excluded — see note above



    // Load Pricing Data when enquiry and customer are selected
    useEffect(() => {
        if (enquiryData && toName && enquiryData.enquiry?.RequestNo) {
            console.log('[useEffect] Loading pricing data for:', enquiryData.enquiry.RequestNo, 'Customer:', toName);
            loadPricingData(enquiryData.enquiry.RequestNo, toName);
        }
    }, [enquiryData, toName]);

    const addCustomClause = () => {
        if (!newClauseTitle.trim()) return;
        const newClause = {
            id: `custom_${Date.now()}`,
            title: newClauseTitle,
            content: '',
            isChecked: true
        };
        setCustomClauses([...customClauses, newClause]);
        setOrderedClauses([...orderedClauses, newClause.id]);
        setNewClauseTitle('');
        setIsAddingClause(false);
        setExpandedClause(newClause.id); // Auto-expand for editing
    };

    const removeCustomClause = (id) => {
        setCustomClauses(customClauses.filter(c => c.id !== id));
        setOrderedClauses(orderedClauses.filter(cid => cid !== id));
    };

    const moveClause = (index, direction) => {
        const newOrder = [...orderedClauses];
        if (direction === 'up' && index > 0) {
            [newOrder[index], newOrder[index - 1]] = [newOrder[index - 1], newOrder[index]];
        } else if (direction === 'down' && index < newOrder.length - 1) {
            [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
        }
        setOrderedClauses(newOrder);
    };

    const updateCustomClause = (id, field, value) => {
        setCustomClauses(customClauses.map(c =>
            c.id === id ? { ...c, [field]: value } : c
        ));
    };

    const canEdit = () => {
        // 1. Admin Override (Always Full Access)
        if (currentUser.Roles === 'Admin' || currentUser.role === 'Admin') return true;
        if (!currentUser) return false;

        // 2. Determine generalized Lead Access (Matches calculatedTabs logic)
        const userDept = (currentUser?.Department || currentUser?.Division || '').trim().toLowerCase();
        const hasLeadAccess = !!pricingData?.access?.hasLeadAccess || ['civil', 'admin', 'bms admin'].includes(userDept);
        const hasPricingScope = Array.isArray(pricingData?.access?.editableJobs) && pricingData.access.editableJobs.length > 0;

        /** User has visible pricing rows for the customer currently quoted (fixes Save greyed out when editableJobs omits the job name). */
        const pricingMatchesCustomer = (() => {
            if (!enquiryData?.enquiry?.RequestNo || !toName?.trim()) return false;
            const jobs = pricingData?.jobs;
            if (!Array.isArray(jobs) || jobs.length === 0) return false;
            const tKey = normalizeCustomerKey(toName);
            if (!tKey) return false;
            return jobs.some(j => {
                if (j.visible === false) return false;
                const jKey = normalizeCustomerKey(j.itemName || j.DivisionName || j.ItemName || '');
                return jKey && (jKey === tKey || jKey.includes(tKey) || tKey.includes(jKey));
            });
        })();

        // 3. Strict Scope Validation (Based on Active Tab — use effective tabs so empty calculatedTabs matches UI fallback)
        const activeTabObj = (effectiveQuoteTabs || []).find(t => String(t.id) === String(activeQuoteTab));

        // If we are on the default tab or tab is not found, allow for Lead Users
        if (!activeTabObj) {
            return hasLeadAccess || hasPricingScope || pricingMatchesCustomer;
        }

        if (activeTabObj.isEmptyCalculatedTabsFallback) {
            return hasLeadAccess || hasPricingScope || pricingMatchesCustomer;
        }

        // If the tab is marked as 'Self' or 'Owned', it's editable by the user
        if (activeTabObj.isSelf) {
            // Further validation for sub-users: they cannot edit tabs they don't have explicit access to
            if (!hasLeadAccess) {
                if (pricingMatchesCustomer) return true;
                const targetJob = normalize(activeTabObj.label || activeTabObj.name);
                const allowedJobs = (pricingData?.access?.editableJobs || []).map(j => normalize(j));
                const isAllowed = allowedJobs.some(allowed =>
                    targetJob === allowed || targetJob.includes(allowed) || allowed.includes(targetJob)
                );
                if (!isAllowed) return false;
            }
            return true;
        }

        // 4. Default: No access to Peer or Parent divisions
        return false;
    };



    // Click outside handler
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (searchRef.current && !searchRef.current.contains(e.target)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);

        // Fetch Pending Quotes
        const userEmail = currentUser?.EmailId || currentUser?.email || '';
        console.log('[QuoteForm] current user object:', currentUser);
        console.log(`[QuoteForm] Fetched pending quotes for: ${userEmail}`);

        refetchPendingQuotes();

        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [currentUser, refetchPendingQuotes]);

    // Fetch Metadata Lists
    useEffect(() => {
        const fetchLists = async () => {
            try {
                const res = await fetch(`${API_BASE}/api/quotes/lists/metadata`);
                if (res.ok) {
                    const data = await res.json();
                    setUsersList(data.users || []);
                    setCustomersList(data.customers || []);
                    const apiTypes = Array.isArray(data.enquiryTypes)
                        ? data.enquiryTypes.map((t) => String(t).trim()).filter(Boolean)
                        : [];
                    const merged = [...new Set([...apiTypes, ...defaultEnquiryTypeOptions])];
                    merged.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
                    setEnquiryTypesMaster(merged);
                } else {
                    setEnquiryTypesMaster([...defaultEnquiryTypeOptions]);
                }
            } catch (err) {
                console.error('Error fetching metadata lists:', err);
                setEnquiryTypesMaster([...defaultEnquiryTypeOptions]);
            }
        };
        const fetchTemplates = async () => {
            try {
                const res = await fetch(`${API_BASE}/api/quotes/config/templates`);
                if (res.ok) {
                    const data = await res.json();
                    setTemplates(data || []);
                }
            } catch (err) {
                console.error('Error fetching templates:', err);
            }
        };

        fetchLists();
        fetchTemplates();
    }, []);

    // Handle Metadata Selections
    const handleSelectSignatory = (e) => {
        const selectedName = e.target.value;
        const user = usersList.find(u => u.FullName === selectedName);
        setSignatory(selectedName);
        if (user) setSignatoryDesignation(user.Designation);
    };

    const handleSelectCustomer = (e) => {
        const selectedName = e.target.value;
        const cust = customersList.find(c => c.CompanyName === selectedName);
        setToName(selectedName);
        if (cust) {
            setToAddress(`${cust.Address1 || ''} \n${cust.Address2 || ''} `.trim());
            setToPhone(`${cust.Phone1 || ''} ${cust.Phone2 ? '/ ' + cust.Phone2 : ''} `.trim());
            setToEmail(cust.EmailId || '');

            // NOTE: Do not update footerDetails with customer info
        }

        // Reload pricing for selected customer
        if (enquiryData) {
            console.log(`[QuoteForm] Rendering Preview Panel context:`, {
                quoteId,
                quoteNumber,
                company: quoteCompanyName,
                div: enquiryData.companyDetails?.divisionCode
            });
            loadPricingData(enquiryData.enquiry.RequestNo, selectedName);
        }
    };

    /** Clears customer fields for a lead-only switch without wiping loaded quote metadata (see preserveQuoteOnLeadChangeRef). */
    const clearCustomerForLeadSwitch = () => {
        setToName('');
        setToAddress('');
        setToPhone('');
        setToEmail('');
        setToAttention('');
        if (enquiryData) {
            loadPricingData(enquiryData.enquiry.RequestNo, '');
        }
    };

    // New handler for CreatableSelect
    const handleCustomerChange = (selectedOption) => {
        const selectedName = selectedOption ? selectedOption.value : '';
        console.log('[handleCustomerChange] Selected:', selectedName);

        // Only reset if effectively changed (prevents auto-selection from clearing active quote)
        if (normalize(selectedName) === normalize(toName)) {
            console.log('[handleCustomerChange] Customer name unchanged (normalized), skipping reset.');
            return;
        }

        const preserve = preserveQuoteOnLeadChangeRef.current;
        const restoringSameCustomerAfterLead =
            preserve &&
            selectedName &&
            normalize(selectedName) === normalize(preserve.toName);
        if (preserve && selectedName && !restoringSameCustomerAfterLead) {
            preserveQuoteOnLeadChangeRef.current = null;
        }

        setToName(selectedName);
        if (!restoringSameCustomerAfterLead) {
            setQuoteId(null); // Reset ID so auto-load can kick in for new customer
            setQuoteDate(''); // Reset date to blank for new customer selection
            setPreparedBy((currentUser?.FullName || currentUser?.name || '').trim());
            setSignatory('');
            setSignatoryDesignation('');
        } else {
            preserveQuoteOnLeadChangeRef.current = null;
            autoSelectCustomerAfterLeadChangeRef.current = false;
            setQuoteId(preserve.quoteId);
            setQuoteNumber(preserve.quoteNumber || '');
        }

        // Do NOT set activeQuoteTab to the external customer string. Previous-quotes tabs use lead-*/subjob-*
        // ids (or a single external tab id from calculatedTabs). Forcing activeQuoteTab = toName here fought
        // the auto-resolve effect and caused the customer dropdown to oscillate between internal/external.

        if (!selectedName) {
            preserveQuoteOnLeadChangeRef.current = null;
            setToAddress('');
            setToPhone('');
            setToEmail('');
            setToAttention('');
            if (enquiryData) {
                loadPricingData(enquiryData.enquiry.RequestNo, '');
            }
            return;
        }

        // --- INTERNAL CUSTOMER DETECTION (match attentionSelectOptions) ---
        const isInternalOption = selectedOption?.type === 'Internal Division';
        const hierarchyCleanSel = new Set(
            (enquiryData?.divisionsHierarchy || []).map(n =>
                collapseSpacesLower(stripQuoteJobPrefix(n.itemName || n.DivisionName || ''))
            )
        );
        const profileCleanSel = new Set(
            (enquiryData?.availableProfiles || []).map(p =>
                collapseSpacesLower(stripQuoteJobPrefix(p.itemName || ''))
            )
        );
        const selectedNameClean = collapseSpacesLower(stripQuoteJobPrefix(selectedName));
        const toKeySel = normalizeCustomerKey(selectedName);
        const pricingCleanSel = new Set(
            (pricingData?.jobs || [])
                .filter(j => j.visible !== false)
                .map(j => collapseSpacesLower(stripQuoteJobPrefix(j.itemName || j.DivisionName || j.ItemName || '')))
                .filter(Boolean)
        );
        const isInternalByPricing = [...pricingCleanSel].some(pc =>
            pc === selectedNameClean ||
            (toKeySel &&
                (normalizeCustomerKey(pc) === toKeySel ||
                    pc.includes(selectedNameClean) ||
                    selectedNameClean.includes(pc)))
        );
        const isInternalByName = hierarchyCleanSel.has(selectedNameClean) || profileCleanSel.has(selectedNameClean);
        const isInternal = isInternalOption || isInternalByName || isInternalByPricing;

        // Note: Legacy clearing block removed. We now attempt to find details 
        // for internal customers from availableProfiles/jobsPool below.

        // --- EXTERNAL CUSTOMER: Look up contact details ---
        // Set Attention of from ReceivedFrom options / customerContacts for the selected customer
        console.log('[handleCustomerChange] Looking up customer:', selectedName);
        console.log('[handleCustomerChange] customerContacts available:', enquiryData?.customerContacts);

        const targetNorm = normalize(selectedName);

        if (!isInternal) {
            const extMap = enquiryData?.externalAttentionOptionsByCustomer || {};
            let extList = extMap[selectedName] || extMap[selectedName.trim()];
            if (!extList) {
                const fk = Object.keys(extMap).find(k => normalize(k) === targetNorm);
                if (fk) extList = extMap[fk];
            }
            if (Array.isArray(extList) && extList.length > 0) {
                setToAttention(extList[0]);
            } else if (enquiryData?.customerContacts) {
                if (enquiryData.customerContacts[selectedName]) {
                    setToAttention(enquiryData.customerContacts[selectedName]);
                    console.log('[handleCustomerChange] ✓ Found via exact match:', enquiryData.customerContacts[selectedName]);
                } else {
                    const match = Object.keys(enquiryData.customerContacts).find(k => normalize(k) === targetNorm);
                    if (match) {
                        setToAttention(enquiryData.customerContacts[match]);
                        console.log('[handleCustomerChange] ✓ Found via fuzzy match:', enquiryData.customerContacts[match]);
                    } else {
                        const fallback = enquiryData?.enquiry?.ReceivedFrom || '';
                        setToAttention(fallback);
                        console.log('[handleCustomerChange] ✗ Not found, using fallback:', fallback);
                    }
                }
            } else {
                setToAttention(enquiryData?.enquiry?.ReceivedFrom || '');
            }
        } else {
            const intAtt = resolveQuoteInternalAttentionFlexible(enquiryData, selectedName);
            if (intAtt?.defaultAttention) setToAttention(intAtt.defaultAttention);
            else if (intAtt?.options?.length) setToAttention(intAtt.options[0]);
            else setToAttention('');
        }



        // Try exact match first, then robust normalized match
        let cust = customersList.find(c => c.CompanyName === selectedName);
        if (!cust) {
            cust = customersList.find(c => normalize(c.CompanyName) === targetNorm);
        }

        if (cust) {
            console.log('[handleCustomerChange] Found customer in Master list:', cust.CompanyName);
            const addr = [cust.Address1, cust.Address2].filter(Boolean).join('\n').trim();
            setToAddress(addr);
            setToPhone(`${cust.Phone1 || ''} ${cust.Phone2 ? '/ ' + cust.Phone2 : ''} `.trim());
            setToEmail(cust.EmailId || '');
            setToFax(cust.FaxNo || '');
        } else {
            console.log('[handleCustomerChange] Customer NOT found in Master list');

            // Check if it matches the parsed Enquiry Customer (could be inactive)
            let foundInEnquiry = false;
            if (enquiryData?.customerDetails) {
                const enqCustName = enquiryData.enquiry?.CustomerName || enquiryData.CustomerName || '';
                const enqCustList = enqCustName.split(',').map(c => normalize(c.trim()));

                // Use same normalized check for fallback validity
                if (enqCustList.includes(targetNorm) && enquiryData.customerDetails) {
                    console.log('[handleCustomerChange] Using Enquiry Customer Details fallback (possibly inactive)');
                    const details = enquiryData.customerDetails;
                    const addr = details.Address || [details.Address1, details.Address2].filter(Boolean).join('\n').trim();
                    setToAddress(addr);
                    setToPhone(`${details.Phone1 || ''} ${details.Phone2 ? '/ ' + details.Phone2 : ''} `.trim());
                    setToEmail(details.EmailId || '');
                    setToFax(details.FaxNo || '');
                    foundInEnquiry = true;
                }
            }

            // RELAXED CHECK: Check internal profiles IF no address found yet, 
            // OR if it's an internal-sounding name, even if it's "Linked".
            if (!foundInEnquiry && (toAddress === '' || !isInternal) && enquiryData?.availableProfiles) {
                // Check in internal division profiles
                const profile = enquiryData.availableProfiles.find(p =>
                    p.itemName.replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim() === selectedName ||
                    normalize(p.itemName) === targetNorm ||
                    normalize(p.name) === targetNorm
                );
                if (profile) {
                    console.log('[handleCustomerChange] ✓ Found internal profile match:', profile.itemName);
                    if (!toAddress) setToAddress(profile.address || '');
                    if (!toPhone) setToPhone(profile.phone || '');
                    if (!toEmail) setToEmail(profile.email || '');
                    if (!toFax) setToFax(profile.fax || '');
                    if (profile.address) foundInEnquiry = true; // Mark found if we got a real address
                }
            }
        }

        // Additional match in jobsPool/pricingData if available (more direct)
        // Check even if Linked, because many root/parent jobs are added to the customer options list
        if (enquiryData) {
            const jobMatch = jobsPool.find(j =>
                normalize(j.itemName || j.DivisionName) === targetNorm ||
                normalize(j.ItemName) === targetNorm
            );
            if (jobMatch) {
                console.log('[handleCustomerChange] Checking direct job match in pool:', jobMatch.itemName);
                // Robust mapping: check multiple possible field names
                const addr = jobMatch.Address || jobMatch.address || '';
                const ph = jobMatch.Phone || jobMatch.phone || jobMatch.PhoneNo || '';
                const fx = jobMatch.FaxNo || jobMatch.fax || jobMatch.Fax || '';
                const em = jobMatch.Email || jobMatch.email || jobMatch.CommonMailIds || '';

                if (addr && !toAddress) setToAddress(addr);
                if (ph && !toPhone) setToPhone(ph);
                if (fx && !toFax) setToFax(fx);
                if (em && !toEmail) setToEmail(em.split(',')[0].trim());
            }
        }

        // Pricing reload is handled by the useEffect([enquiryData, toName]) below — avoids double
        // loadPricingData (handler + effect) and duplicate customer-filter runs / dropdown flicker.
    };

    // Requirement: after changing lead job, auto-pick first customer from the newly filtered list.
    useEffect(() => {
        if (!autoSelectCustomerAfterLeadChangeRef.current) return;
        if (!enquiryData) return;

        const current = (toName || '').trim();
        if (current) {
            // User/manual selection already exists; do not override.
            autoSelectCustomerAfterLeadChangeRef.current = false;
            return;
        }

        const first = quoteCustomerDropdownOptions[0];
        if (!first?.value) return; // Wait until options arrive/recompute.

        autoSelectCustomerAfterLeadChangeRef.current = false;
        handleCustomerChange(first);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [quoteCustomerDropdownOptions, toName, enquiryData]);


    const handleProfileChange = (e) => {
        const code = e.target.value; // Using Department Code as unique identifier? Or DivisionCode?
        // Ideally combination, but for now assuming unique Dept Code or we check both if needed.
        // Let's assume the value is the index or a composite key.
        const profile = companyProfiles.find(p => p.code === code || p.divisionCode === code);

        if (profile) {
            setQuoteCompanyName(profile.name);
            setQuoteLogo(profile.logo);
            setFooterDetails(profile);

            // Update enquiryData references so getQuotePayload uses the correct codes
            setEnquiryData(prev => ({
                ...prev,
                companyDetails: { ...profile }
            }));
        }
    };

    // Helper to load pricing data (Component Level)
    const loadPricingData = async (reqNo, cxName, options = {}) => {
        console.log('--- loadPricingData START ---');
        console.log('Req:', reqNo, 'Cx:', cxName, 'Opts:', options);
        try {
            const url = `${API_BASE}/api/pricing/${encodeURIComponent(reqNo)}?userEmail=${encodeURIComponent(currentUser?.email || currentUser?.EmailId || '')}&customerName=${encodeURIComponent(cxName || '')}`;
            console.log('Fetching URL:', url);

            console.log('[Pricing Fetch] Requesting:', url, 'ActiveCustomer:', cxName);
            const pricingRes = await fetch(url);
            if (pricingRes.ok) {
                const pData = await pricingRes.json();
                console.log('[Pricing Fetch] Response:', pData.jobs ? pData.jobs.length + ' jobs' : 'No jobs', 'Visible:', pData.jobs ? pData.jobs.map(j => j.itemName + ':' + j.visible) : 'N/A');
                console.log('Pricing Data Received:', pData);

                // --- KEY MIGRATION & LEAD JOB ISOLATION (Step 2293 Fix) ---
                // Process Raw Array into Nested Map: [CustomerKey][LeadJobKey][OptionID_JobID] = Value
                const groupedValues = {};
                if (Array.isArray(pData.values)) {
                    pData.pricingValueRows = [...pData.values];
                    pData.values.forEach(v => {
                        const custKey = normalize(v.CustomerName || pData.activeCustomer || 'Main');
                        const leadKey = normalize(v.LeadJobName || 'Legacy');

                        if (!groupedValues[custKey]) groupedValues[custKey] = {};
                        if (!groupedValues[custKey][leadKey]) groupedValues[custKey][leadKey] = {};

                        // Store by ID key (primary)
                        if (v.EnquiryForID) {
                            const idKey = `${v.OptionID}_${v.EnquiryForID}`;
                            groupedValues[custKey][leadKey][idKey] = v;
                        }
                        // Also store by name key (fallback for legacy data or name-based lookups)
                        if (v.EnquiryForItem) {
                            const nameKey = `${v.OptionID}_${v.EnquiryForItem}`;
                            if (!groupedValues[custKey][leadKey][nameKey]) {
                                groupedValues[custKey][leadKey][nameKey] = v;
                            }
                        }
                    });
                } else {
                    pData.pricingValueRows = [];
                }
                pData.allValues = groupedValues;

                // Set effective values for current view (Prioritize Active Lead Job)
                const currentCustKey = normalize(cxName || '');
                const mainKey = normalize('Main');

                const stripJobCustomerPrefix = (s) => String(s || '').replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim().toLowerCase();

                /** Align groupedValues top-level key with selected customer (normalize + fuzzy + stripped name). */
                const resolveCustomerSlice = (gv, selectedNameRaw) => {
                    const ac = normalize(pData.activeCustomer || '');
                    const tries = [normalize(selectedNameRaw || ''), ac, mainKey].filter((k, i, a) => k !== '' && a.indexOf(k) === i);
                    for (const k of tries) {
                        if (gv[k] && Object.keys(gv[k]).length > 0) return { resolvedKey: k, slice: gv[k] };
                    }
                    for (const k of tries) {
                        if (gv[k]) return { resolvedKey: k, slice: gv[k] };
                    }
                    const target = normalize(selectedNameRaw || '');
                    for (const top of Object.keys(gv)) {
                        if (normalize(top) === target) return { resolvedKey: top, slice: gv[top] };
                    }
                    const ts = stripJobCustomerPrefix(selectedNameRaw || '');
                    if (ts) {
                        for (const top of Object.keys(gv)) {
                            if (stripJobCustomerPrefix(top) === ts) return { resolvedKey: top, slice: gv[top] };
                        }
                    }
                    return { resolvedKey: tries[0] ?? mainKey, slice: {} };
                };

                const extractLeadIndex = (s) => {
                    const m = String(s || '').match(/\bL\s*(\d+)\b/i);
                    return m ? m[1] : null;
                };

                /** Merge all value rows under this customer whose LeadJobName bucket matches API lead hint / L-code (fixes "l1" vs "l1 hvac"). */
                const mergeLeadBucketsForCustomer = (custBucket, resolvedCustomerKeyForLog) => {
                    const bucket = custBucket || {};
                    const availableLeadBuckets = Object.keys(bucket);
                    const rootJob = (pData.jobs || []).find((j) => !j.parentId || j.parentId === '0' || j.parentId === 0) || (pData.jobs || [])[0];
                    const leadJobCode = rootJob ? String(rootJob.leadJobCode || rootJob.LeadJobCode || '').trim() : '';
                    const activeNorm = normalize(pData.leadJob || '');
                    const codeNorm = normalize(leadJobCode);
                    const targetL = extractLeadIndex(pData.leadJob) || extractLeadIndex(leadJobCode);

                    const matchedKeys = new Set();
                    for (const bk of availableLeadBuckets) {
                        const legacyKey = bk === 'legacy' || bk === normalize('Legacy');
                        if (legacyKey) {
                            matchedKeys.add(bk);
                            continue;
                        }
                        if ((activeNorm && bk === activeNorm) || (codeNorm && bk === codeNorm)) {
                            matchedKeys.add(bk);
                            continue;
                        }
                        const bkL = extractLeadIndex(bk);
                        if (targetL && bkL && bkL === targetL) {
                            matchedKeys.add(bk);
                            continue;
                        }
                        if (activeNorm.length >= 2 && bk.length >= activeNorm.length && bk.startsWith(activeNorm) && (bk.length === activeNorm.length || /\s|-/.test(bk[activeNorm.length]))) {
                            matchedKeys.add(bk);
                            continue;
                        }
                        if (activeNorm.length >= 2 && activeNorm.length >= bk.length && activeNorm.startsWith(bk) && (activeNorm.length === bk.length || /\s|-/.test(activeNorm[bk.length]))) {
                            matchedKeys.add(bk);
                            continue;
                        }
                        if (codeNorm.length >= 1 && codeNorm.length <= 4 && bk.startsWith(codeNorm) && (bk.length === codeNorm.length || /\s|-/.test(bk[codeNorm.length]))) {
                            matchedKeys.add(bk);
                            continue;
                        }
                    }

                    let out = {};
                    matchedKeys.forEach((mk) => Object.assign(out, bucket[mk] || {}));

                    const hadLeadMatch = [...matchedKeys].some((k) => k !== 'legacy' && k !== normalize('Legacy'));
                    const leadMergeEmpty = Object.keys(out).length === 0;
                    if ((!hadLeadMatch || leadMergeEmpty) && availableLeadBuckets.length > 0) {
                        console.log('[Quote loadPricingData] lead bucket fallback: merging ALL lead sub-buckets for customer', resolvedCustomerKeyForLog);
                        out = {};
                        Object.values(bucket).forEach((sub) => {
                            if (sub && typeof sub === 'object' && !Array.isArray(sub)) Object.assign(out, sub);
                        });
                    }

                    console.log('[Quote loadPricingData] customer slice resolved key', resolvedCustomerKeyForLog, 'lead bucket keys', availableLeadBuckets);
                    console.log('available lead buckets', availableLeadBuckets);
                    console.log('selected lead', pData.leadJob);
                    console.log('matched bucket keys', Array.from(matchedKeys).join(', ') || '(none)');

                    return out;
                };

                console.log('[Quote loadPricingData] Object.keys(groupedValues)', Object.keys(groupedValues));
                console.log('[Quote loadPricingData] currentCustKey (normalize cxName)', currentCustKey, 'cxName raw', cxName);

                const getBucket = (selectedNameRaw, label) => {
                    const { resolvedKey, slice } = resolveCustomerSlice(groupedValues, selectedNameRaw);
                    console.log(`[Quote loadPricingData] getBucket(${label}) requested`, normalize(selectedNameRaw || ''), '→ slice key', resolvedKey);
                    console.log('[Quote loadPricingData] Object.keys(groupedValues[resolvedKey] || {})', Object.keys(slice || {}));
                    return mergeLeadBucketsForCustomer(slice, resolvedKey);
                };

                pData.values = {
                    ...getBucket('Main', 'main'),
                    ...getBucket(cxName || '', 'currentCustomer')
                };

                const vk = Object.keys(pData.values || {});
                console.log('[Quote loadPricingData] flat values keys count', vk.length, 'sample', vk.slice(0, 8));

                // --- HIERARCHY STABILITY (Step 1385) ---
                // If the pricing module hasn't identified jobs (e.g. fresh enquiry), 
                // fallback to the Enquiry Divisions Hierarchy so we have IDs and ParentIDs.
                if (!pData.jobs || pData.jobs.length === 0) {
                    console.log('[Pricing Fetch] No jobs from API, falling back to Enquiry Hierarchy');
                    pData.jobs = (enquiryData?.divisionsHierarchy || []).map(d => ({
                        id: d.id || d.ItemID || d.ItemIDVal,
                        parentId: d.parentId || d.ParentID || d.ParentIDVal,
                        itemName: d.itemName || d.DivisionName || d.ItemName,
                        visible: true,
                        editable: true
                    }));
                }

                setPricingData(pData);

                // Calculate Summary
                const summary = [];
                // INITIAL SELECTION: Filter jobs by current branch prefix (Step 2293)
                // Use override when caller just updated lead in UI (React state not committed yet).
                const branchPrefix = (
                    options.leadJobPrefixOverride != null && String(options.leadJobPrefixOverride).trim() !== ''
                        ? String(options.leadJobPrefixOverride).trim()
                        : enquiryData?.leadJobPrefix || ''
                ).toUpperCase();
                const jobsPool = pData.jobs || [];

                const activeRoot = branchPrefix ? jobsPool.find(j => {
                    const name = (j.itemName || '').toUpperCase();
                    const clean = name.replace(/^(L\d+\s*-\s*)/, '').trim();
                    return name === branchPrefix || clean === branchPrefix || (j.leadJobCode && j.leadJobCode.toUpperCase() === branchPrefix);
                }) : null;

                let filteredJobs = jobsPool;
                if (activeRoot) {
                    const rootId = String(activeRoot.id);
                    const branchIds = new Set([rootId]);
                    let changed = true;
                    while (changed) {
                        changed = false;
                        jobsPool.forEach(j => {
                            const jId = String(j.id);
                            if (!branchIds.has(jId) && branchIds.has(String(j.parentId))) {
                                branchIds.add(jId);
                                changed = true;
                            }
                        });
                    }
                    filteredJobs = jobsPool.filter(j => branchIds.has(String(j.id)));
                }

                const allJobs = filteredJobs.map(j => j.itemName);
                // Also add Lead Job to selected if it exists and matches branch
                if (pData.leadJob && !allJobs.includes(pData.leadJob)) {
                    const leadNorm = normalize(pData.leadJob);
                    if (!branchPrefix || leadNorm.includes(normalize(branchPrefix))) {
                        allJobs.push(pData.leadJob);
                    }
                }

                setSelectedJobs(allJobs);

                // Default Tabs: If 'self' is not a valid tab for this user, switch to the first available tab
                if (!pData.access?.hasLeadAccess && pData.jobs && pData.jobs.length > 0) {
                    const accessibleJobs = pData.jobs.filter(j => j.visible || j.editable);
                    if (accessibleJobs.length > 0) {
                        const firstJobId = accessibleJobs[0].id;
                        setActiveQuoteTab(prev => (prev === 'self' || prev === 'My Pricing' || !prev) ? firstJobId : prev);
                    }
                }

                // We need to calculate summary based on all jobs initially
                calculateSummary(pData, allJobs, cxName);
            } else {
                console.error('Pricing API Error:', pricingRes.status);
                setPricingData(null);
                setPricingSummary([]);
                setHasUserPricing(false);
            }
        } catch (err) {
            console.error('Error loading pricing data:', err);
            setPricingData(null);
            setPricingSummary([]);
            setHasUserPricing(false);
        }
    };

    const handleJobToggle = (jobName) => {
        pricingSelectionTouchedRef.current[pricingSelectionContextKey] = true;
        const newSelected = selectedJobs.includes(jobName)
            ? selectedJobs.filter(j => j !== jobName)
            : [...selectedJobs, jobName];
        setSelectedJobs(newSelected);
        calculateSummary(pricingData, newSelected);
    };


    // Calculate Summary based on selected jobs
    const calculateSummary = (data = pricingData, currentSelectedJobs = selectedJobs, activeCustomer = toName, overrideScope = quoteContextScope) => {
        // Ensure activeJobs is initialized first to prevent ReferenceError
        const activeJobs = Array.isArray(currentSelectedJobs) ? currentSelectedJobs : [];
        const normalizeCust = (s) => (s || '').replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');

        if (!data || !data.options || !data.values) {
            if (import.meta.env.DEV) console.log('[calculateSummary] Missing data, options, or values');
            return;
        }

        let quickDigest = '';
        try {
            quickDigest = JSON.stringify({
                ps: pricingStableSig,
                tab: String(activeQuoteTab || ''),
                fp: quoteTabsFingerprint,
                sc: overrideScope ?? null,
                j: [...activeJobs].map(String).sort(),
                c: String(activeCustomer || ''),
            });
        } catch (_) {
            quickDigest = '';
        }
        if (quickDigest && quickDigest === lastQuickCalcInputRef.current) {
            return;
        }

        if (import.meta.env.DEV) {
            console.log('[calculateSummary] START');
            console.log('[calculateSummary] Data:', data);
            console.log('[calculateSummary] Active Customer:', activeCustomer);
            console.log('[calculateSummary] Selected Jobs:', currentSelectedJobs);
            console.log('[calculateSummary] activeJobs list:', activeJobs);
            console.log('[calculateSummary] Access:', data?.access);
            console.log('[calculateSummary] Override Scope:', overrideScope);
            console.log('[calculateSummary] Options count:', data.options.length);
            console.log('[calculateSummary] Options:', data.options);
        }

        let includedOptionCount = 0;
        const skipReasons = [];

        const summary = [];
        let userHasEnteredPrice = false;
        let calculatedGrandTotal = 0;
        let foundPricedOptional = false;

        // SCOPE FILTER (Strict Hierarchy for Quote Generation)
        // If user has limited access (e.g. BMS), they should ONLY quote for their scope + descendants.
        // They should NOT quote for Parent Jobs or Siblings.
        // NOW ENHANCED: Respect quoteContextScope if present (even for Admins/Leads viewing sub-quotes)
        const userScopes = data.access?.editableJobs || [];

        // Effective Scopes: Use Override if present, otherwise User's Editable Jobs
        const effectiveScopes = (overrideScope ? [overrideScope] : userScopes).map(s => (s || '').trim().toLowerCase());

        // Provision (Step 1922 Fix): Strictly identify if the user is a "Sub-Job User"
        // They are LIMITED if they have an editable job scope that DOES NOT include the root Lead Job.
        const rootJobs = jobsPool.filter(j => !j.parentId || j.parentId === '0' || j.parentId === 0);
        const hasRootAccess = rootJobs.some(rj => effectiveScopes.some(s => {
            const rName = (rj.itemName || rj.DivisionName || '').trim().toLowerCase();
            return rName === s || rName.includes(s) || s.includes(rName);
        }));

        const userDept = (currentUser?.Department || currentUser?.Division || '').trim().toLowerCase();
        const isStrictlyLimited = userDept && !['civil', 'admin'].includes(userDept) && !isAdmin;

        const hasLimitedAccess = !!overrideScope || isStrictlyLimited || (!data.access?.canEditAll && !hasRootAccess && userScopes.length > 0);

        const allowedQuoteIds = new Set();
        // Use unified jobsPool memo

        if (hasLimitedAccess && jobsPool.length > 0) {
            // 1. Find Scope Root Jobs
            const myJobs = jobsPool.filter(j => effectiveScopes.some(s => {
                const jobName = (j.itemName || j.ItemName || j.DivisionName || '').trim().toLowerCase();
                const scopeName = (s || '').trim().toLowerCase();
                return jobName === scopeName || jobName.includes(scopeName) || scopeName.includes(jobName);
            }));
            myJobs.forEach(j => allowedQuoteIds.add(j.id || j.ItemID));

            // 2. Add All Descendants
            let changed = true;
            while (changed) {
                changed = false;
                jobsPool.forEach(j => {
                    const jId = j.id || j.ItemID;
                    const pId = j.parentId || j.ParentID;
                    if (jId && !allowedQuoteIds.has(jId) && allowedQuoteIds.has(pId)) {
                        allowedQuoteIds.add(jId);
                        changed = true;
                    }
                });
            }
        }

        const groups = {};

        // BRANCH ISOLATION (Step 2293)
        // Identify IDs that belong to the current Lead Job Prefix to avoid branch cross-contamination.
        // Paired own+subjob / lead+subjob tabs: include every tab branch in branchIds so pricing summary
        // does not drop the sibling row when switching quote tabs (was clearing checkboxes indirectly).
        const branchIds = new Set();
        const tabsForBranch = calculatedTabs || [];
        const activeTabObj = tabsForBranch.find((t) => String(t.id) === String(activeQuoteTab));
        const branchPrefixRaw = (activeTabObj?.label || activeTabObj?.name || enquiryData?.leadJobPrefix || '').toUpperCase();
        const branchPrefix = branchPrefixRaw.replace(/^(L\d+\s*-\s*)/, '').trim();

        const pairedOwnSubSummary =
            tabsForBranch.length >= 2 &&
            tabsForBranch[0]?.realId &&
            tabsForBranch[0].isOwnJobTab &&
            tabsForBranch.slice(1).every((t) => t?.realId && t.isSubJobTab);
        const pairedLeadSubSummary =
            tabsForBranch.length >= 2 &&
            tabsForBranch[0]?.realId &&
            tabsForBranch[0].isLeadInternalTab &&
            tabsForBranch.slice(1).every((t) => t?.realId && t.isSubJobTab);
        const pairedMultiBranchSummary = pairedOwnSubSummary || pairedLeadSubSummary;

        const expandBranchIdsFromSeeds = (seedIds) => {
            seedIds.forEach((id) => {
                const s = String(id || '').trim();
                if (s) branchIds.add(s);
            });
            let changed = true;
            while (changed) {
                changed = false;
                jobsPool.forEach((j) => {
                    const jId = String(j.id || j.ItemID || j.ID);
                    const pId = String(j.parentId || j.ParentID || j.ParentID);
                    if (jId && !branchIds.has(jId) && branchIds.has(pId)) {
                        branchIds.add(jId);
                        changed = true;
                    }
                });
            }
        };

        let rootJob = null;
        if (pairedMultiBranchSummary) {
            const seeds = tabsForBranch.map((t) => t?.realId).filter(Boolean);
            expandBranchIdsFromSeeds(seeds);
            if (tabsForBranch[0]?.realId) {
                rootJob = jobsPool.find((j) => String(j.id || j.ItemID || j.ID) === String(tabsForBranch[0].realId));
            }
        } else if (activeTabObj?.realId) {
            rootJob = jobsPool.find((j) => String(j.id || j.ItemID || j.ID) === String(activeTabObj.realId));
        } else if (branchPrefix && jobsPool.length > 0) {
            rootJob = jobsPool.find((j) => {
                const name = (j.itemName || j.DivisionName || j.ItemName || '').toUpperCase();
                const clean = name.replace(/^(L\d+\s*-\s*)/, '').trim();
                return (
                    name === branchPrefix ||
                    clean === branchPrefix ||
                    name === branchPrefixRaw ||
                    clean === branchPrefixRaw ||
                    (j.leadJobCode && j.leadJobCode.toUpperCase() === branchPrefix)
                );
            });
        }

        if (!pairedMultiBranchSummary && rootJob) {
            branchIds.clear();
            expandBranchIdsFromSeeds([String(rootJob.id || rootJob.ItemID || rootJob.ID)]);
        }
        if (import.meta.env.DEV) {
            console.log('[calculateSummary] Branch Isolation:', { branchPrefix, branchIds: Array.from(branchIds) });
        }

        // DEDUPLICATE OPTIONS (Step 1560 + Lead Job Fix)
        // Multiple options with the same name/itemName can exist for DIFFERENT lead jobs
        // (e.g. Option-1 for BMS under "Civil Project" lead vs "BMS" lead both stored against customer "Electrical").
        // The active lead job is in enquiryData.leadJobPrefix — we must prefer the option whose
        // leadJobName matches this to ensure the correct OptionID (and thus price) is used.
        // Resolve the actual Lead Job for this branch (Step 825 Fix)
        const actualLeadJob = (() => {
            if (!rootJob) return null;
            let curr = rootJob;
            const selPrefix = (enquiryData?.leadJobPrefix || '').toUpperCase();
            while (curr) {
                const name = (curr.itemName || curr.DivisionName || '').toUpperCase();
                const code = (curr.leadJobCode || curr.LeadJobCode || '').toUpperCase();
                // Match the lead job prefix from header
                if (code === selPrefix || name === selPrefix || (selPrefix && name.startsWith(selPrefix + ' -'))) return curr;
                // If it's a root job (no parent), it's the lead for its branch
                if (!curr.parentId || curr.parentId === '0' || curr.parentId === 0) return curr;
                curr = jobsPool.find(j => String(j.id || j.ItemID) === String(curr.parentId || curr.ParentID));
            }
            return null;
        })();

        const activeLead = actualLeadJob ? normalizeCust(actualLeadJob.itemName || actualLeadJob.DivisionName) : normalizeCust(branchPrefix);
        const activeLeadFull = actualLeadJob ? normalizeCust(actualLeadJob.itemName || actualLeadJob.DivisionName) : normalizeCust(branchPrefixRaw);
        const globalLead = normalizeCust(enquiryData?.leadJobPrefix || '');

        // RESOLVE VALUES FOR ACTIVE CUSTOMER (Step 1612 + 2293 Fix)
        // loadPricingData stores allValues[customerKey][leadKey][optionId_jobId] using normalize() for customer keys.
        // This path used normalizeCust-only lookups → empty buckets while data.values (already merged for the fetch) had the real rows.
        const activeCustKey = normalizeCust(activeCustomer);
        const mainKey = normalizeCust('Main');

        const resolveCustomerBucket = (cKeyRaw) => {
            const av = data.allValues || {};
            if (cKeyRaw === undefined || cKeyRaw === null) return {};
            const tries = [String(cKeyRaw), normalize(cKeyRaw), normalizeCust(cKeyRaw)]
                .filter((k, i, a) => k !== '' && a.indexOf(k) === i);
            for (const k of tries) {
                if (av[k]) return av[k];
            }
            const tNorm = normalize(cKeyRaw);
            const tCust = normalizeCust(cKeyRaw);
            for (const bk of Object.keys(av)) {
                if (normalize(bk) === tNorm || normalizeCust(bk) === tCust) return av[bk];
            }
            return {};
        };

        const getEffectiveBucket = (cKey) => {
            const custBucket = resolveCustomerBucket(cKey);
            const merged = {
                ...(custBucket['legacy'] || {}),
                ...(custBucket[normalize('Legacy')] || {}),
                ...(custBucket[activeLead] || {}),
                ...(custBucket[activeLeadFull] || {}),
                ...(custBucket[globalLead] || {}),
                ...(custBucket[normalize(data.leadJob || '')] || {}),
            };
            if (Object.keys(merged).length === 0 && custBucket && typeof custBucket === 'object') {
                const acc = {};
                Object.values(custBucket).forEach((sub) => {
                    if (sub && typeof sub === 'object' && !Array.isArray(sub)) {
                        Object.assign(acc, sub);
                    }
                });
                return acc;
            }
            return merged;
        };

        const effectiveValuesLookup = {
            ...(data.allValues
                ? {
                    ...getEffectiveBucket(mainKey),
                    ...getEffectiveBucket(activeCustKey),
                    ...getEffectiveBucket(normalize('Main')),
                    ...getEffectiveBucket(normalize(activeCustomer || '')),
                }
                : {}),
            ...(data.values && typeof data.values === 'object' ? data.values : {}),
        };

        const scopedValuesFlat = data.values && typeof data.values === 'object' ? data.values : {};

        const optionHasScopedValueKey = (opt) => {
            const oid = String(opt.id || opt.ID || '');
            if (!oid) return false;
            return Object.keys(scopedValuesFlat).some((k) => k.startsWith(`${oid}_`) || k === oid);
        };

        // Helper to check if an option ID has any non-zero prices in current values
        const hasEffectivePrice = (optId) => {
            const checkVals = (vals) => {
                if (!vals) return false;
                return Object.values(vals).some(v => String(v.OptionID) === String(optId) && parseFloat(v.Price) > 0);
            };

            if (checkVals(scopedValuesFlat)) return true;
            if (checkVals(effectiveValuesLookup)) return true;

            // Also check all job names as potential internal customers
            if (data.allValues) {
                const jobNames = (jobsPool || []).map(j => normalizeCust(j.itemName || j.DivisionName));
                if (jobNames.some(name => checkVals(getEffectiveBucket(name)))) return true;
            }

            return false;
        };


        const uniqueOptions = [];
        const seenOptions = new Set();

        const sortedOptions = [...data.options].sort((a, b) => {
            const aHasPrice = hasEffectivePrice(a.id || a.ID);
            const bHasPrice = hasEffectivePrice(b.id || b.ID);

            const aLeadMatch = activeLead && normalizeCust(a.leadJobName) === activeLead;
            const bLeadMatch = activeLead && normalizeCust(b.leadJobName) === activeLead;

            const aCustMatch = normalizeCust(a.customerName) === normalizeCust(activeCustomer);
            const bCustMatch = normalizeCust(b.customerName) === normalizeCust(activeCustomer);
            if (aHasPrice && !bHasPrice) return -1;
            if (!aHasPrice && bHasPrice) return 1;

            if (aLeadMatch && !bLeadMatch) return -1;
            if (!aLeadMatch && bLeadMatch) return 1;

            if (aCustMatch && !bCustMatch) return -1;
            if (!aCustMatch && bCustMatch) return 1;
            return 0;
        });

        sortedOptions.forEach(opt => {
            const key = `${normalizeCust(opt.name)}_${normalizeCust(opt.itemName)}_${normalizeCust(opt.leadJobName || '')}_${normalizeCust(opt.customerName || '')}`;
            if (!seenOptions.has(key)) {
                uniqueOptions.push(opt);
                seenOptions.add(key);
            }
        });

        uniqueOptions.forEach(opt => {
            // LEAD JOB FILTER
            const optLead = normalizeCust(opt.leadJobName || '');
            const isLeadMatch = !opt.leadJobName || (optLead === activeLead || optLead === activeLeadFull || optLead === globalLead);

            if (opt.leadJobName && !isLeadMatch) {
                const optLeadJob = jobsPool.find(j => normalizeCust(j.itemName || j.DivisionName) === optLead);
                const optLeadId = optLeadJob ? (optLeadJob.id || optLeadJob.ItemID || optLeadJob.ID) : null;

                if (optLeadId && !branchIds.has(optLeadId)) {
                    const rootJobId = rootJob ? String(rootJob.id || rootJob.ItemID || rootJob.ID) : null;
                    const isAncestorOfRoot = (() => {
                        if (!rootJobId) return false;
                        if (rootJobId === optLeadId) return true;
                        let curr = rootJob;
                        while (curr && (curr.parentId || curr.ParentID)) {
                            const pid = String(curr.parentId || curr.ParentID);
                            if (pid === optLeadId) return true;
                            curr = jobsPool.find(pj => String(pj.id || pj.ItemID) === pid);
                        }
                        return false;
                    })();

                    if (!isAncestorOfRoot) {
                        if (import.meta.env.DEV) {
                            skipReasons.push({ name: opt.name, reason: 'branch_mismatch', leadJobName: opt.leadJobName });
                            console.log(`[calculateSummary] Skipping unrelated branch option "${opt.name}" (leadJobName="${opt.leadJobName}")`);
                        }
                        return;
                    }
                }
            }

            // 0. Customer Filter
            const optCust = normalizeCust(opt.customerName);
            const activeCust = normalizeCust(activeCustomer);
            const mainCust = normalizeCust(enquiryData?.customerName || enquiryData?.CustomerName || '');

            const isCustomerMatch = (!activeCust || !opt.customerName || optCust === activeCust || optCust === 'main' || optCust === mainCust || optionHasScopedValueKey(opt) || (() => {
                const activeJob = jobsPool.find(j => normalizeCust(j.itemName || j.DivisionName) === activeCust);
                if (activeJob) {
                    const optJob = jobsPool.find(j => normalizeCust(j.itemName || j.DivisionName) === optCust);
                    if (optJob) {
                        let curr = optJob;
                        while (curr && (curr.parentId || curr.ParentID)) {
                            const pid = curr.parentId || curr.ParentID;
                            if (pid === (activeJob.id || activeJob.ItemID)) return true;
                            curr = jobsPool.find(j => (j.id || j.ItemID) === pid);
                        }
                    }
                }
                const isExternalCustomer = !jobsPool.some(j => normalizeCust(j.itemName || j.DivisionName) === activeCust);
                if (isExternalCustomer) {
                    const optJob = jobsPool.find(j => normalizeCust(j.itemName || j.DivisionName) === optCust);
                    if (optJob) return true;
                }
                return false;
            })());

            if (!isCustomerMatch) {
                if (import.meta.env.DEV) {
                    skipReasons.push({
                        name: opt.name,
                        reason: 'customer_mismatch',
                        optCustomer: opt.customerName,
                        activeCustomer,
                        hadScopedValueKey: optionHasScopedValueKey(opt),
                    });
                }
                if (import.meta.env.DEV) {
                    console.log(`[calculateSummary] Filtered out (customer mismatch):`, opt.name, 'opt:', opt.customerName, 'active:', activeCustomer);
                }
                return;
            }
            if (import.meta.env.DEV) console.log(`[calculateSummary] Passed customer filter:`, opt.name);

            // 1. Visibility Filter
            let isVisible = false;

            // Resolve Job ID for this option
            const optJob = opt.itemName ? jobsPool.find(j => (j.itemName || j.ItemName || j.DivisionName || '').trim().toLowerCase() === opt.itemName.trim().toLowerCase()) : null;
            const optJobId = optJob ? (optJob.id || optJob.ItemID || optJob.ID) : null;

            // Visibility Logic:
            // 1. Full Access (Lead or Admin) -> Visible
            // 2. Branch Match (isLeadMatch) -> Visible
            // 3. Authorized Scope (allowedQuoteIds) -> Visible
            // 4. Manual Editable/Visible Context Check (Sub-Job Users)
            if ((data.access?.hasLeadAccess && !hasLimitedAccess) || isLeadMatch || (hasLimitedAccess && optJobId && allowedQuoteIds.has(optJobId))) {
                isVisible = true;
                if (import.meta.env.DEV) {
                    console.log(`[calculateSummary] Visible (authorized scope or branch match):`, opt.name);
                }
            } else if (opt.itemName) {
                // Fallback for sub-job users or cases where ID matching is tricky - check names
                const isEditable = data.access?.editableJobs?.some(scopeName => {
                    const scopeLower = (scopeName || '').trim().toLowerCase();
                    const optLower = (opt.itemName || '').trim().toLowerCase();
                    if (scopeLower === optLower || scopeLower.includes(optLower) || optLower.includes(scopeLower)) return true;
                    if (optJob) {
                        let curr = optJob;
                        while (curr && (curr.parentId || curr.ParentID)) {
                            const pid = String(curr.parentId || curr.ParentID);
                            const parent = jobsPool.find(pj => String(pj.id || pj.ItemID) === pid);
                            if (parent && (parent.itemName || '').trim().toLowerCase() === scopeLower) return true;
                            curr = parent;
                        }
                    }
                    return false;
                });
                const isVisibleJob = data.access?.visibleJobs?.some(scopeName => {
                    const scopeLower = (scopeName || '').trim().toLowerCase();
                    const optLower = (opt.itemName || '').trim().toLowerCase();
                    if (scopeLower === optLower || scopeLower.includes(optLower) || optLower.includes(scopeLower)) return true;
                    if (optJob) {
                        let curr = optJob;
                        while (curr && (curr.parentId || curr.ParentID)) {
                            const pid = String(curr.parentId || curr.ParentID);
                            const parent = jobsPool.find(pj => String(pj.id || pj.ItemID) === pid);
                            if (parent && (parent.itemName || '').trim().toLowerCase() === scopeLower) return true;
                            curr = parent;
                        }
                    }
                    return false;
                });
                isVisible = isEditable || isVisibleJob;
                if (import.meta.env.DEV) {
                    console.log(`[calculateSummary] Visibility result for "${opt.name}": isEditable=${isEditable}, isVisibleJob=${isVisibleJob}, isVisible=${isVisible}`);
                }
            } else if (!opt.itemName && data.access?.editableJobs?.length > 0) {
                isVisible = true;
                if (import.meta.env.DEV) {
                    console.log(`[calculateSummary] Visible (no itemName, has editable jobs):`, opt.name);
                }
            }

            if (!isVisible) {
                if (import.meta.env.DEV) {
                    skipReasons.push({ name: opt.name, reason: 'not_visible' });
                    console.log(`[calculateSummary] Filtered out (not visible):`, opt.name);
                }
                return;
            }
            if (import.meta.env.DEV) console.log(`[calculateSummary] Passed visibility filter:`, opt.name);
            includedOptionCount += 1;

            // Determine if this option's job is currently selected (for Total calculation)
            // If itemName is missing (General), we assume it is included unless specific logic says otherwise
            const isJobIncluded = !opt.itemName || activeJobs.includes(opt.itemName);

            // 2. Calculate Total
            let optionTotal = 0;
            if (data.jobs) {
                data.jobs.forEach(job => {
                    // STRICT SCOPE MATCHING: If option is specific to a job, ONLY sum against that job.
                    // This prevents "Civil Project" option from picking up "Sub Civil Job" values if they share ID or key.
                    if (opt.itemName) {
                        const optNorm = normalizeCust(opt.itemName);
                        const jobNorm = normalizeCust(job.itemName);
                        const isLeadMatch = (opt.itemName === 'Lead Job' && job.isLead);
                        const isSuffixMatch = opt.itemName.endsWith(' / Lead Job') && job.isLead;

                        // If names differ and it's not a generic "Lead Job" option, SKIP.
                        if (optNorm !== jobNorm && !isLeadMatch && !isSuffixMatch) {
                            return;
                        }
                    }

                    // Filter: If Limited Access, skip jobs outside scope
                    // FIX: Ensure editable jobs AND their descendants are visible (Robust Normalized Check) (Step 1310)
                    const normalizeName = (s) => (s || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
                    const editableNames = (data.access?.editableJobs || []).map(n => normalizeName(n));

                    // BRANCH FILTER: Skip jobs that do not belong to the selected Lead Job branch (Step 2293)
                    const jId = String(job.id || job.ItemID || job.ID);
                    if (branchIds.size > 0 && !branchIds.has(jId)) {
                        return;
                    }

                    const isEditableName = editableNames.includes(normalizeName(job.itemName));

                    const isEditableDescendant = (() => {
                        if (!hasLimitedAccess) return true;

                        // Rule (Step 1922): I can see myself and my children/descendants.
                        // I CANNOT see my parent or parent's parent.
                        const myJobNames = (data.access?.editableJobs || []).map(n => normalizeName(n));
                        const currentJobName = normalizeName(job.itemName);

                        // If current job is an ANCESTOR of any of my scopes, block it.
                        const isStrictParent = (data.access?.editableJobs || []).some(scopeName => {
                            const scopeJob = jobsPool.find(j => normalizeName(j.itemName || j.DivisionName) === normalizeName(scopeName));
                            if (!scopeJob) return false;

                            // Check if job is ancestor of scopeJob
                            let curr = scopeJob;
                            while (curr && (curr.parentId || curr.ParentID)) {
                                const pid = String(curr.parentId || curr.ParentID);
                                if (pid === String(job.id || job.ItemID)) return true;
                                curr = jobsPool.find(p => String(p.id || p.ItemID) === pid);
                            }
                            return false;
                        });
                        if (isStrictParent) return false;

                        if (myJobNames.includes(currentJobName)) return true;

                        // Check if any of my editable jobs is an ancestor of the current job
                        return (data.access?.editableJobs || []).some(scopeName => {
                            const scopeJob = jobsPool.find(j => normalizeName(j.itemName || j.DivisionName) === normalizeName(scopeName));
                            if (!scopeJob) return false;

                            const scopeId = scopeJob.id || scopeJob.ItemID;
                            const checkId = job.id || job.ItemID;

                            // Recursive ancestor check
                            const isAncestorOf = (ancId, childId) => {
                                const child = jobsPool.find(j => (j.id || j.ItemID) === childId);
                                if (!child) return false;
                                const pid = child.parentId || child.ParentID;
                                if (pid === ancId) return true;
                                if (pid && pid !== '0' && pid !== 0) return isAncestorOf(ancId, pid);
                                return false;
                            };
                            return isAncestorOf(scopeId, checkId);
                        });
                    })();

                    // Also check allowedQuoteIds (which comes from initial scoping)
                    // But if isEditableName OR isEditableDescendant is true, we allow it.
                    if (hasLimitedAccess && !allowedQuoteIds.has(job.id) && !isEditableName && !isEditableDescendant) {
                        return;
                    }

                    // IMPACT: Resolves 'Hidden Price' (Step 1189) by checking explicit price first.
                    const key = `${opt.id}_${job.id}`;
                    const nameKey = `${opt.id}_${job.itemName}`;
                    let val = effectiveValuesLookup[key] || effectiveValuesLookup[nameKey];
                    let price = val ? parsePrice(val.Price || 0) : 0;

                    const reqNoEpv = enquiryData?.enquiry?.RequestNo ?? enquiryData?.RequestNo;
                    if (Array.isArray(data.pricingValueRows) && data.pricingValueRows.length > 0 && reqNoEpv != null && String(reqNoEpv).trim() !== '') {
                        const optName = String(opt.name || opt.OptionName || '').trim();
                        const alternateOptionIds = [
                            ...new Set(
                                (data.options || [])
                                    .filter((o) => String(o.name || '').trim() === optName)
                                    .map((o) => String(o.id || o.ID || '').trim())
                                    .filter(Boolean)
                            ),
                        ];
                        const epv = resolveQuoteSummaryPriceFromRows(data.pricingValueRows, {
                            requestNo: reqNoEpv,
                            optionId: opt.id || opt.ID,
                            branchPrefix: enquiryData?.leadJobPrefix || data?.leadJob || '',
                            jobsPool,
                            job,
                            customerDropdown: activeCustomer,
                            calculatedTabs,
                            activeQuoteTab,
                            hasLeadAccess: !!data.access?.hasLeadAccess,
                            editableJobNames: data.access?.editableJobs || [],
                            userDepartment: (currentUser?.Department || currentUser?.Division || '').trim(),
                            alternateOptionIds: alternateOptionIds.length ? alternateOptionIds : undefined,
                        });
                        if (epv.found) {
                            price = epv.price;
                        }
                    }

                    // Only enforce scoping if price is 0 (to prevent double counting)
                    if (price <= 0) {
                        const normalizeTokens = (s) => (s || '').toLowerCase()
                            .replace(/[^a-z0-9]/g, ' ')
                            .split(/\s+/)
                            .filter(w => w.length > 2 && !['sub', 'job', 'and', 'for', 'the'].includes(w) && !/^l\d+$/.test(w));

                        const optTokens = normalizeTokens(opt.itemName);
                        const jobTokens = normalizeTokens(job.itemName);

                        if (optTokens.length > 0 && jobTokens.length > 0) {
                            const hasOverlap = optTokens.some(ot => jobTokens.some(jt => jt.includes(ot) || ot.includes(jt)));
                            if (!hasOverlap) {
                                return; // Skip mismatch
                            }
                        }
                    }

                    // FALLBACK CHAIN: Parent Customers -> Main -> Generic
                    // IMPORTANT: For Base Price we do NOT auto-copy values from other customers.
                    // Default should remain 0 unless explicitly entered for that customer/job.
                    if (price <= 0 && data.allValues && opt.name !== 'Base Price') {
                        const fallbackCandidates = [];
                        let pId = job.parentId || job.ParentID;
                        while (pId && pId !== '0' && pId !== 0) {
                            const pJob = jobsPool.find(j => (j.id || j.ItemID) === pId);
                            if (pJob) {
                                fallbackCandidates.push((pJob.itemName || pJob.DivisionName).replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim());
                                pId = pJob.parentId || pJob.ParentID;
                            } else break;
                        }
                        jobsPool.forEach(j => {
                            const jName = (j.itemName || j.DivisionName || '').replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim();
                            if (jName && !fallbackCandidates.includes(jName)) fallbackCandidates.push(jName);
                        });
                        fallbackCandidates.push('Main');

                        // Strategy 1: Standard Candidates (Hierarchy, Main)
                        for (const candName of fallbackCandidates) {
                            const candKey = normalizeCust(candName);
                            const vals = getEffectiveBucket(candKey);
                            if (vals && Object.keys(vals).length > 0) {
                                const matchingOpts = data.options
                                    .filter(o => {
                                        const oNameNorm = normalizeCust(o.itemName || '');
                                        const jNameNorm = normalizeCust(job.itemName || '');
                                        return o.name === opt.name && (oNameNorm === jNameNorm || !o.itemName);
                                    })
                                    .sort((a, b) => {
                                        const aLead = normalizeCust(a.leadJobName);
                                        const bLead = normalizeCust(b.leadJobName);
                                        return (aLead === activeLead && bLead !== activeLead) ? -1 : (aLead !== activeLead && bLead === activeLead) ? 1 : 0;
                                    });

                                for (const iOpt of matchingOpts) {
                                    const vKey = `${iOpt.id}_${job.id}`;
                                    const vNameKey = `${iOpt.id}_${job.itemName}`;
                                    const iVal = vals[vKey] || vals[vNameKey];
                                    if (iVal && parsePrice(iVal.Price) > 0) {
                                        price = parsePrice(iVal.Price);
                                        if (import.meta.env.DEV) {
                                            console.log(`[calculateSummary] FALLBACK MATCH for job ${job.itemName}: Found price ${price} using Option ${iOpt.id} from candidate ${candKey}`);
                                        }
                                        break;
                                    }
                                }
                                if (price > 0) break;
                            }
                        }

                        // Strategy 2: GLOBAL SCAN (Step 1136 FIX) - If still 0, look in ANY customer bucket
                        if (price <= 0) {
                            for (const bucketKey in data.allValues) {
                                const vals = getEffectiveBucket(bucketKey);
                                if (!vals || Object.keys(vals).length === 0) continue;

                                const matchingOpts = data.options
                                    .filter(o => {
                                        const oNameNorm = normalizeCust(o.itemName || '');
                                        const jNameNorm = normalizeCust(job.itemName || '');
                                        return o.name === opt.name && (oNameNorm === jNameNorm || !o.itemName);
                                    })
                                    .sort((a, b) => {
                                        const aLead = normalizeCust(a.leadJobName);
                                        const bLead = normalizeCust(b.leadJobName);
                                        return (aLead === activeLead && bLead !== activeLead) ? -1 : (aLead !== activeLead && bLead === activeLead) ? 1 : 0;
                                    });

                                for (const iOpt of matchingOpts) {
                                    const vKey = `${iOpt.id}_${job.id}`;
                                    const vNameKey = `${iOpt.id}_${job.itemName}`;
                                    const iVal = vals[vKey] || vals[vNameKey];
                                    if (iVal && parsePrice(iVal.Price) > 0) {
                                        price = parsePrice(iVal.Price);
                                        if (import.meta.env.DEV) {
                                            console.log(`[calculateSummary] GLOBAL FALLBACK for job ${job.itemName}: Found price ${price} in bucket ${bucketKey}`);
                                        }
                                        break;
                                    }
                                }
                                if (price > 0) break;
                            }
                        }
                    }

                    // DISTRIBUTE TO JOB GROUP (Deduplicated Aggregate per Group)
                    const jobGroupName = job.itemName;
                    if (!groups[jobGroupName]) {
                        groups[jobGroupName] = { total: 0, items: [], hasOptional: false };
                    }

                    const existingItem = groups[jobGroupName].items.find(it => it.name === opt.name);
                    if (existingItem) {
                        if (price > existingItem.total) {
                            groups[jobGroupName].total += (price - existingItem.total);
                            existingItem.total = price;
                        }
                    } else {
                        groups[jobGroupName].items.push({ name: opt.name, total: price });
                        groups[jobGroupName].total += price;
                    }

                    if (opt.name === 'Optional' || opt.name === 'Option') {
                        groups[jobGroupName].hasOptional = true;
                        if (opt.name === 'Optional') foundPricedOptional = true;
                    } else if (opt.name === 'Base Price') {
                        const isThisJobActive = activeJobs.length === 0 || activeJobs.includes(job.itemName);
                        if (isThisJobActive && !existingItem) {
                            calculatedGrandTotal += price;
                        }
                    }
                    userHasEnteredPrice = true;
                });
            }
        });

        // POST-PROCESSING: Calculate NET Prices for Parent Jobs
        // If a Parent Job (e.g. Civil) includes the cost of its Children (e.g. Electrical),
        // and both are being displayed in the summary, we must subtract the Child's cost from the Parent
        // to avoid double counting and show the "Net" Parent cost.
        // POST-PROCESSING: Calculate NET Prices for Parent Jobs - DISABLED per User Request (Step 315)
        // User requested that Pricing Module and Quote Module match exactly what was entered.
        // If user enters 200 for Civil, they expect to see 200, regardless of subjobs.
        // if (data.jobs) {
        //     Object.keys(groups).forEach(parentName => {
        //         const parentGroup = groups[parentName];
        //         const parentJob = data.jobs.find(j => j.itemName === parentName);

        //         if (parentJob) {
        //             const children = data.jobs.filter(j => j.parentId === parentJob.id);
        //             children.forEach(childJob => {
        //                 const childGroup = groups[childJob.itemName];
        //                 if (childGroup) {
        //                     const childBase = childGroup.items.find(i => i.name === 'Base Price');
        //                     const parentBase = parentGroup.items.find(i => i.name === 'Base Price');

        //                     if (childBase && parentBase) {
        //                         // console.log(`[calculateSummary] Adjusting Net Price: ${parentName} (${parentBase.total}) - ${childJob.itemName} (${childBase.total})`);
        //                         // parentBase.total = Math.max(0, parentBase.total - childBase.total);
        //                         // parentGroup.total = Math.max(0, parentGroup.total - childBase.total);
        //                     }
        //                 }
        //             });
        //         }
        //     });
        // }

        // Flatten to summary array
        Object.keys(groups).forEach(name => {
            summary.push({ name: name, ...groups[name] });
        });

        // Sort by Hierarchy (Lead Job -> Sub Job -> ...)
        if (data.jobs && data.jobs.length > 0) {
            const jobs = data.jobs;

            // Build Adjacency List for Hierarchy with String IDs
            const childrenMap = {};
            const allIds = new Set(jobs.map(j => String(j.id || j.ID)));
            const roots = [];

            jobs.forEach(j => {
                const pIdRaw = j.parentId || j.ParentID;
                const pId = pIdRaw ? String(pIdRaw) : null;
                const jId = String(j.id || j.ID);

                // Determine if root: No parent, parent is 0, or parent ID not in list
                if (!pId || pId === '0' || !allIds.has(pId)) {
                    roots.push(j);
                } else {
                    if (!childrenMap[pId]) childrenMap[pId] = [];
                    childrenMap[pId].push(j);
                }
            });

            // Recursive Flatten to get Ordered Names
            const orderedNames = [];
            const traverse = (job) => {
                orderedNames.push(job.itemName);
                const jId = String(job.id || job.ID);
                if (childrenMap[jId]) {
                    // Sort siblings by name to ensure consistent sub-ordering
                    childrenMap[jId].sort((a, b) => (a.itemName || '').localeCompare(b.itemName || ''));
                    childrenMap[jId].forEach(child => traverse(child));
                }
            };

            // Sort roots: Priority to Lead Job Code (L1, L2...), then Alpha
            roots.sort((a, b) => {
                const codeA = a.leadJobCode || '';
                const codeB = b.leadJobCode || '';

                // Extract numeric L-code if present
                const matchA = codeA.match(/^L(\d+)$/i);
                const matchB = codeB.match(/^L(\d+)$/i);

                if (matchA && matchB) {
                    return parseInt(matchA[1], 10) - parseInt(matchB[1], 10);
                }
                if (matchA) return -1; // A has code, comes first
                if (matchB) return 1;  // B has code, comes first

                // Fallback: Use Item Name if no code (or both no code)
                return (a.itemName || '').localeCompare(b.itemName || '');
            });
            roots.forEach(root => traverse(root));

            // Apply Sort to Summary
            summary.sort((a, b) => {
                const nameA = (a.name || '').trim();
                const nameB = (b.name || '').trim();

                const idxA = orderedNames.findIndex(n => n.trim() === nameA);
                const idxB = orderedNames.findIndex(n => n.trim() === nameB);

                if (idxA !== -1 && idxB !== -1) return idxA - idxB;
                if (idxA !== -1) return -1; // A is in hierarchy, comes first
                if (idxB !== -1) return 1;  // B is in hierarchy, comes first
                return nameA.localeCompare(nameB); // Fallback: Alpha
            });
        } else {
            summary.sort((a, b) => a.name.localeCompare(b.name));
        }

        // Generate Pricing Terms Content with Table
        let tableHtml = '<table contentEditable="false" style="width:100%; border-collapse:collapse; margin-bottom:16px;">';
        tableHtml += '<thead><tr style="background:#f8fafc; border:1px solid #cbd5e1;"><th style="padding:10px; border:1px solid #cbd5e1; text-align:left;">Description</th><th style="padding:10px; border:1px solid #cbd5e1; text-align:right;">Amount (BHD)</th></tr></thead>';
        tableHtml += '<tbody>';

        let htmlGrandTotal = 0;

        summary.forEach(grp => {
            // Filter 1: Check if group matches selected Lead Job Prefix (if active)
            // Filter 1: Check if group matches selected Lead Job Prefix (if active)
            if (enquiryData && enquiryData.leadJobPrefix) {
                const prefix = enquiryData.leadJobPrefix;
                // Direct match
                if (!grp.name.startsWith(prefix)) {
                    // Check hierarchy logic to see if this group (job) is a descendant of the selected Lead Job
                    let isRelatedToLead = false;
                    if (data.jobs) {
                        const job = data.jobs.find(j => j.itemName === grp.name);
                        if (job) {
                            // Check ancestors
                            let currentJob = job;
                            while (currentJob && currentJob.parentId) {
                                const parent = data.jobs.find(j => j.id === currentJob.parentId);
                                if (parent) {
                                    if (parent.itemName && parent.itemName.startsWith(prefix)) {
                                        isRelatedToLead = true;
                                        break;
                                    }
                                    currentJob = parent;
                                } else {
                                    break;
                                }
                            }
                        }
                    }

                    if (!isRelatedToLead) return;
                }
            }

            // Only add to Quote Table if Included
            // Check if group name corresponds to a selected job (or is General)
            // If grp.name is in activeJobs, we include it.
            if (grp.name && !activeJobs.includes(grp.name)) {
                // Check if it is a Job (Lead or Sub) that is unchecked
                const isSubJob = data.jobs?.some(j => j.itemName === grp.name);
                const isLeadJob = data.leadJob && (data.leadJob === grp.name || grp.name.includes(data.leadJob));

                // If it is a pricing group related to a Job, and it is NOT selected, skip it.
                if (isLeadJob || isSubJob) return;
            }

            const cleanedName = grp.name.replace(/^(LEAD JOB |SUB JOB) \/ /, '');

            // Add Header for the Group
            tableHtml += `<tr><td colspan="2" style="padding:10px; border:1px solid #cbd5e1; background-color:#f1f5f9; font-weight:bold;">${cleanedName}</td></tr>`;

            // Add Detail Rows
            grp.items.forEach(item => {
                tableHtml += `<tr><td style="padding:10px; border:1px solid #cbd5e1; padding-left: 20px;">${item.name}</td><td style="padding:10px; border:1px solid #cbd5e1; text-align:right;">BD ${item.total.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</td></tr>`;
            });

            // INDIVIDUAL TOTALS REMOVED (Step 871 Fix)
            /*
            if (grp.items.length > 1) {
                tableHtml += `<tr><td style="padding:10px; border:1px solid #cbd5e1; text-align:right; font-weight:600;">Total ${cleanedName}</td><td style="padding:10px; border:1px solid #cbd5e1; text-align:right; font-weight:600;">BD ${grp.total.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</td></tr>`;
            }
            */

            // Accumulate filtered total (Base Price Only for Grand Total)
            grp.items.forEach(item => {
                if (item.name === 'Base Price') {
                    htmlGrandTotal += item.total;
                }
            });
        });

        if (htmlGrandTotal > 0) {
            tableHtml += `<tr style="background:#f8fafc; font-weight:700;"><td style="padding:10px; border:1px solid #cbd5e1; text-align:right;">Grand Total (Base Price)</td><td style="padding:10px; border:1px solid #cbd5e1; text-align:right;">BD ${htmlGrandTotal.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</td></tr>`;
        }
        tableHtml += '</tbody></table>';

        // Update Pricing Terms Text with Dynamic Total
        let pricingText = defaultClauses.pricingTerms || '';
        if (htmlGrandTotal > 0 && !foundPricedOptional) {
            const formattedTotal = htmlGrandTotal.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
            const words = numberToWordsBHD(htmlGrandTotal);
            const totalString = `BD ${formattedTotal} (${words})`;

            pricingText = pricingText.replace('[Amount in figures and words]', totalString);
        }

        const pricingTermsFull = tableHtml + pricingText;
        const round6 = (n) => Number((Number(n) || 0).toFixed(6));
        let calcSig = '';
        try {
            calcSig = JSON.stringify({
                tabs: quoteTabsFingerprint,
                tab: String(activeQuoteTab || ''),
                scope: overrideScope ?? null,
                jobs: [...activeJobs].map(String).sort(),
                cust: String(activeCustomer || ''),
                sum: summary.map((g) => ({
                    n: g.name,
                    t: round6(g.total),
                    it: (g.items || []).map((it) => ({ n: it.name, t: round6(it.total) })),
                })),
                grand: round6(calculatedGrandTotal),
                htmlGrand: round6(htmlGrandTotal),
                hu: !!userHasEnteredPrice,
                fpo: !!foundPricedOptional,
                html: pricingTermsFull,
            });
        } catch (_) {
            calcSig = '';
        }
        if (calcSig && lastPricingCalcSigRef.current === calcSig) {
            lastQuickCalcInputRef.current = quickDigest;
            return;
        }
        lastPricingCalcSigRef.current = calcSig;
        lastQuickCalcInputRef.current = quickDigest;

        setHasUserPricing(userHasEnteredPrice);
        setGrandTotal(calculatedGrandTotal);
        setHasPricedOptional(foundPricedOptional);

        if (import.meta.env.DEV) {
            console.log('[calculateSummary] effectiveValuesLookup keys:', Object.keys(effectiveValuesLookup).length, 'scoped data.values keys:', Object.keys(scopedValuesFlat).length);
            console.log('[calculateSummary] included options (post filters):', includedOptionCount, 'unique option rows:', uniqueOptions.length, 'skipReasons (sample):', skipReasons.slice(0, 20));
            console.log('[calculateSummary] COMPLETE');
            console.log('[calculateSummary] Summary:', summary);
            console.log('[calculateSummary] Grand Total:', calculatedGrandTotal);
            console.log('[calculateSummary] Has User Pricing:', userHasEnteredPrice);
            console.log('[calculateSummary] Saving summary to state:', summary.length, 'groups');
        }

        setClauseContent((prev) => {
            if (prev && prev.pricingTerms === pricingTermsFull) return prev;
            return { ...prev, pricingTerms: pricingTermsFull };
        });

        setPricingSummary(summary);
    };

    const calculateSummaryRef = React.useRef(calculateSummary);
    React.useLayoutEffect(() => {
        calculateSummaryRef.current = calculateSummary;
    });

    // Branch isolation in calculateSummary uses activeQuoteTab; AutoLoad often skips loadQuote when quoteId is unchanged.
    // Re-run when tab/selection/scope change so the pricing summary (own job + subjob) stays in sync without an extra click.
    // Use selectedJobsSig so a new array reference with the same job names does not re-enter the effect.
    React.useEffect(() => {
        if (!pricingData?.options) return;
        calculateSummaryRef.current(pricingData, selectedJobs, toName, quoteContextScope);
    }, [activeQuoteTab, selectedJobsSig, quoteTabsFingerprint, quoteContextScope, pricingStableSig, toName]);

    // Search suggestions
    const handleSearchInput = (value) => {
        setSearchTerm(value);
        if (debounceRef.current) clearTimeout(debounceRef.current);

        console.log('Search Input:', value, 'Length:', value.length);

        if (value.trim().length >= 1) { // Changed to 1 to allow single digit testing if needed, though user typed 2
            debounceRef.current = setTimeout(async () => {
                try {
                    console.log('Fetching suggestions for:', value.trim());
                    const url = `${API_BASE}/api/enquiries?search=${encodeURIComponent(value.trim())}`;
                    console.log('Search URL:', url);

                    const res = await fetch(url);
                    console.log('Search Res Status:', res.status);

                    if (res.ok) {
                        const data = await res.json();
                        console.log('Search Data:', data);
                        setSuggestions(data.slice(0, 10));
                        setShowSuggestions(data.length > 0);
                    } else {
                        console.error('Search API Failed');
                    }
                } catch (err) {
                    console.error('Search error:', err);
                }
            }, 300);
        } else {
            console.log('Clearing suggestions');
            setSuggestions([]);
            setShowSuggestions(false);
        }
    };

    // Template Handlers
    const handleSaveTemplate = async () => {
        if (!savedTemplateName.trim()) return alert('Please enter a template name');

        const clausesConfig = {
            clauses,
            customClauses,
            orderedClauses
        };

        try {
            const res = await fetch(`${API_BASE}/api/quotes/config/templates`, {
                method: quoteId ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    templateName: savedTemplateName,
                    clausesConfig,
                    createdBy: currentUser?.name || currentUser?.FullName || 'Unknown'
                })
            });

            if (res.ok) {
                alert('Template saved successfully!');
                setSavedTemplateName('');
                // Refresh list
                const listRes = await fetch(`${API_BASE}/api/quotes/config/templates`);
                if (listRes.ok) setTemplates(await listRes.json());
            } else {
                alert('Failed to save template');
            }
        } catch (err) {
            console.error('Error saving template:', err);
            alert('Error saving template');
        }
    };

    const handleLoadTemplate = () => {
        if (!selectedTemplateId) return;
        const tmpl = templates.find(t => t.ID == selectedTemplateId);
        if (!tmpl) return;

        try {
            const config = JSON.parse(tmpl.ClausesConfig);
            if (config.clauses) setClauses(config.clauses);
            if (config.customClauses) setCustomClauses(config.customClauses);
            if (config.orderedClauses) setOrderedClauses(config.orderedClauses);
            alert('Template loaded successfully!');
        } catch (err) {
            console.error('Error parsing template:', err);
            alert('Failed to load template configuration');
        }
    };

    const handleDeleteTemplate = async () => {
        if (!selectedTemplateId) return;
        if (!window.confirm('Are you sure you want to delete this template?')) return;

        try {
            const res = await fetch(`${API_BASE}/api/quotes/config/templates/${selectedTemplateId}`, {
                method: 'DELETE'
            });
            if (res.ok) {
                setSelectedTemplateId('');
                const listRes = await fetch(`${API_BASE}/api/quotes/config/templates`);
                if (listRes.ok) setTemplates(await listRes.json());
            }
        } catch (err) {
            console.error('Error deleting template:', err);
        }
    };


    /** @param opts.preserveRecipient If true (tab-driven auto-load), do not overwrite To name/address — keeps customer dropdown stable.
     *  @param opts.skipPreparedSignatory If true (AutoLoad / programmatic sync), do not copy Prepared By from DB — use the logged-in user instead. Signatory / designation are always taken from the quote row when present so saved quotes preview correctly.
     */
    const loadQuote = (quote, opts = {}) => {
        if (!currentUser) {
            alert("Please login to access quotes.");
            return;
        }

        const preserveRecipient = opts.preserveRecipient === true;
        const skipPreparedSignatory = opts.skipPreparedSignatory === true;

        const userEmail = (currentUser.email || currentUser.EmailId || '').toLowerCase().trim();
        const preparedByEmail = (quote.PreparedByEmail || '').toLowerCase().trim();

        // 1. Check if user is the creator
        const isCreator = userEmail === preparedByEmail;

        // 2. Check if user is in CC list of any division for this enquiry
        let isInCC = false;
        if (enquiryData?.divisionEmails) {
            isInCC = enquiryData.divisionEmails.some(div => {
                const emails = [div.ccMailIds, div.commonMailIds].filter(Boolean).join(',');
                const allEmails = emails.split(',').map(e => e.trim().toLowerCase());
                return allEmails.includes(userEmail);
            });
        }

        // 3. Admin check
        const isAdmin = currentUser.Roles === 'Admin' || currentUser.role === 'Admin';

        // 4. Lead Access (from Pricing Access)
        const hasLeadAccess = pricingData?.access?.hasLeadAccess;

        // Removed restrictive view block to allow parent job users to view their subjob quotes
        // edit permissions are strictly handled by the canEdit() check on Save/Revise buttons.

        const qRowId = quoteRowId(quote);
        setQuoteId(qRowId !== undefined ? qRowId : null);
        setQuoteNumber(quote.QuoteNumber ?? quote.quoteNumber ?? '');
        setQuoteDate(quote.QuoteDate ? quote.QuoteDate.split('T')[0] : new Date().toISOString().split('T')[0]);
        setValidityDays(quote.ValidityDays || 30);
        setCustomerReference(quote.CustomerReference || quote.YourRef || '');
        setSubject(quote.Subject || '');
        {
            const fromQuote = String(quote.QuoteType || '')
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean);
            const fromEnq = Array.isArray(enquiryData?.enquiry?.SelectedEnquiryTypes)
                ? enquiryData.enquiry.SelectedEnquiryTypes.filter(Boolean)
                : [];
            setQuoteTypeList(fromQuote.length > 0 ? fromQuote : fromEnq);
            setQuoteEnquiryTypeSelect('');
        }
        if (!skipPreparedSignatory) {
            setPreparedBy(quote.PreparedBy || '');
        } else {
            setPreparedBy((currentUser?.FullName || currentUser?.name || '').trim());
        }
        setSignatory((quote.Signatory || '').trim());
        setSignatoryDesignation((quote.SignatoryDesignation || '').trim());

        if (!preserveRecipient) {
            setToName(quote.ToName || '');
            setToAddress(quote.ToAddress || '');
            setToPhone(quote.ToPhone || '');
            setToEmail(quote.ToEmail || '');
            setToFax(quote.ToFax || '');

            // Auto-fill missing details for internal customers if they are blank in the saved quote
            if (!quote.ToAddress && enquiryData?.availableProfiles) {
                const profile = enquiryData.availableProfiles.find(p =>
                    p.itemName.replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim() === (quote.ToName || '').trim() ||
                    (p.name && p.name.trim() === (quote.ToName || '').trim())
                );
                if (profile) {
                    console.log('[loadQuote] Healing missing address from internal profile:', profile.itemName);
                    if (!quote.ToAddress) setToAddress(profile.address || '');
                    if (!quote.ToPhone) setToPhone(profile.phone || '');
                    if (!quote.ToFax) setToFax(profile.fax || '');
                    if (!quote.ToEmail) setToEmail(profile.email || '');
                }
            }

            // Set Attention Of — internal quotes: only names allowed by Master_ConcernedSE / enquiry-data map
            const qToName = quote.ToName || '';
            if (isQuoteInternalCustomer(enquiryData, pricingData?.jobs, qToName)) {
                const intAtt = resolveQuoteInternalAttentionFlexible(enquiryData, qToName);
                const allowed = Array.isArray(intAtt?.options) ? intAtt.options.filter(Boolean) : [];
                const savedAtt = String(quote.ToAttention || '').trim();
                if (savedAtt && allowed.some((o) => normLooseAttention(o) === normLooseAttention(savedAtt))) {
                    setToAttention(savedAtt);
                } else if (intAtt?.defaultAttention) {
                    setToAttention(intAtt.defaultAttention);
                } else if (allowed.length) {
                    setToAttention(allowed[0]);
                } else {
                    setToAttention('');
                }
            } else if (quote.ToAttention) {
                setToAttention(quote.ToAttention);
            } else if (quote.ToName && enquiryData?.customerContacts) {
                const contact = enquiryData.customerContacts[quote.ToName.trim()];
                if (contact) {
                    setToAttention(contact);
                } else {
                    setToAttention(enquiryData?.enquiry?.ReceivedFrom || '');
                }
            } else {
                setToAttention(enquiryData?.enquiry?.ReceivedFrom || '');
            }
        }


        // Header/footer: with multiple branch tabs, branding is driven by the active tab + quote ref (useEffect).
        // Applying personalProfile here overwrote Civil/CIP with the logged-in user's AC identity after every loadQuote.
        const multiTabBranch = (calculatedTabs || []).length > 1;
        if (!multiTabBranch) {
            const personalProfile = enquiryData?.availableProfiles?.find(p => p.isPersonalProfile);
            const resolvedProfile = personalProfile || enquiryData?.companyDetails;

            if (resolvedProfile) {
                setFooterDetails(resolvedProfile);
                setQuoteCompanyName(resolvedProfile.name);
                setQuoteLogo(resolvedProfile.logo);
            } else {
                setFooterDetails({
                    name: 'Almoayyed Contracting',
                    address: 'P.O. Box 32232, Manama, Kingdom of Bahrain',
                    phone: '(+973) 17 400 407',
                    fax: '(+973) 17 400 396',
                    email: 'bms@almcg.com'
                });
                setQuoteCompanyName('Almoayyed Contracting');
                setQuoteLogo(null);
            }
        }

        // Clause Visibility Logic:
        // 1. If "Legacy" quote (missing ClauseOrder), default all into enabled (TRUE).
        //    This handles old data where '0' might be a misleading default.
        // 2. If "Modern" quote (has ClauseOrder), respect the saved TRUE/FALSE state.
        const isLegacy = !quote.ClauseOrder || quote.ClauseOrder === '[]';

        const isTrue = (val) => {
            if (isLegacy) return true; // Force ON for legacy
            return val !== false && val !== 0; // Respect saved state
        };

        setClauses({
            showScopeOfWork: isTrue(quote.ShowScopeOfWork),
            showBasisOfOffer: isTrue(quote.ShowBasisOfOffer),
            showExclusions: isTrue(quote.ShowExclusions),
            showPricingTerms: isTrue(quote.ShowPricingTerms),
            showSchedule: isTrue(quote.ShowSchedule),
            showWarranty: isTrue(quote.ShowWarranty),
            showResponsibilityMatrix: isTrue(quote.ShowResponsibilityMatrix),
            showTermsConditions: isTrue(quote.ShowTermsConditions),
            showAcceptance: isTrue(quote.ShowAcceptance),
            showBillOfQuantity: isTrue(quote.ShowBillOfQuantity)
        });

        setClauseContent({
            scopeOfWork: quote.ScopeOfWork || defaultClauses.scopeOfWork,
            basisOfOffer: quote.BasisOfOffer || defaultClauses.basisOfOffer,
            exclusions: quote.Exclusions || defaultClauses.exclusions,
            pricingTerms: quote.PricingTerms || defaultClauses.pricingTerms,
            schedule: quote.Schedule || defaultClauses.schedule,
            warranty: quote.Warranty || defaultClauses.warranty,
            responsibilityMatrix: quote.ResponsibilityMatrix || defaultClauses.responsibilityMatrix,
            termsConditions: quote.TermsConditions || defaultClauses.termsConditions,
            acceptance: quote.Acceptance || defaultClauses.acceptance,
            billOfQuantity: quote.BillOfQuantity || defaultClauses.billOfQuantity
        });

        let parsedCustom = [];
        try { parsedCustom = quote.CustomClauses ? JSON.parse(quote.CustomClauses) : []; } catch (e) { console.error('Error parsing custom clauses:', e); }
        setCustomClauses(parsedCustom);

        let parsedOrder = [];
        try { parsedOrder = quote.ClauseOrder ? JSON.parse(quote.ClauseOrder) : []; } catch (e) { console.error('Error parsing clause order:', e); }
        if (parsedOrder.length > 0) {
            setOrderedClauses(parsedOrder);
        } else {
            // Fallback to default order if not saved
            setOrderedClauses([
                'showScopeOfWork', 'showBasisOfOffer', 'showExclusions', 'showPricingTerms',
                'showBillOfQuantity', 'showSchedule', 'showWarranty', 'showResponsibilityMatrix', 'showTermsConditions', 'showAcceptance'
            ]);
        }

        setGrandTotal(quote.TotalAmount || 0);
        setExpandedClause(null);
        setPendingFiles([]); // Clear any pending files from previous session
        window.scrollTo({ top: 0, behavior: 'smooth' });

        // FORCE CORRECT CONTEXT FOR REVISIONS
        // Extract Scope from Quote Number (Format: Dept/Div/Ref/QuoteNo)
        // e.g. AAC/BMS/41... -> BMS
        const quoteParts = quote.QuoteNumber ? quote.QuoteNumber.split('/') : [];
        const scope = quoteParts.length > 1 ? quoteParts[1] : null;

        let newScope = null;
        // Only apply scope limit if it looks like a sub-division (e.g. BMS, ELE, PLFF)
        // Avoid limiting if it matches the lead job (unless specific)
        if (scope && scope !== 'AAC') {
            newScope = scope;
        }

        // VALIDATE SCOPE MATCH (Prevent Empty Quotes for Unmatched Codes like CVLP)
        if (newScope && pricingData && pricingData.jobs) {
            const hasMatch = pricingData.jobs.some(j => {
                const jn = j.itemName.toLowerCase();
                // CRITICAL: Ensure scope comparison is also case-insensitive to match "ELE" with "Electrical" logic in calculateSummary
                const sn = newScope.toLowerCase();
                return jn === sn || jn.includes(sn);
            });

            if (!hasMatch) {
                console.log('[loadQuote] Scope', newScope, 'not found in jobs. Reverting to Full Scope (Lead Context).');
                newScope = null;
            }
        }

        console.log('[loadQuote] Setting Context Scope:', newScope);
        setQuoteContextScope(newScope);

        // Trigger Summary Recalculation to update the Preview HTML with corrected scope
        // This fixes "Corrupted" quotes that were saved with full pricing
        if (pricingData) {
            const summaryToName = preserveRecipient ? (toName || quote.ToName) : quote.ToName;
            calculateSummary(pricingData, undefined, summaryToName, newScope);
            // Note: If pricingData is not for the correct customer, this might be slightly off provided values,
            // but structure will be correct. Usually Previous Quote Context implies same active enquiry.
        }
    };

    // Auto-load Quote or Clear Form when Active Tab Changes
    useEffect(() => {
        if (!activeQuoteTab || !calculatedTabs) return;

        // Ensure data is loaded
        if (!pricingData && !enquiryData) return;

        const activeTabObj = calculatedTabs.find(t => String(t.id) === String(activeQuoteTab));
        if (!activeTabObj) return;

        const activeTabRealId = activeTabObj.realId;
        // Use global jobsPool memo (Step 1240)

        console.log('[AutoLoad] Checking quotes for tab:', activeTabObj.label, 'ID:', activeTabRealId);

        // When scoped params apply, only scoped GET rows define this tuple — never fall back to existingQuotes
        // (empty scoped list + existingQuotes caused wrong auto-load and Save/Revision mismatch).
        const scopedOnly = !!scopedEnquiryQuotesParams;
        const sourceQuotes = scopedOnly
            ? quoteScopedForPanel
            : (quoteScopedForPanel.length > 0 ? quoteScopedForPanel : existingQuotes);

        if (scopedOnly && scopedQuotesFetchSettledKey !== scopedQuotePanelFetchKey) {
            console.log('[AutoLoad] Scoped fetch not settled for key; skip.');
            return;
        }

        // Filter quotes for this tab (Replicating render logic)
        // Robust resolution of lead code for filtering (Walking up to root L-code)
        const currentLeadCode = (() => {
            // PRIORITY 1: Resolve via explicit selectedLeadId (Stable and Robust)
            if (selectedLeadId && pricingData?.jobs) {
                const root = pricingData.jobs.find(j => String(j.id || j.ItemID) === String(selectedLeadId));
                if (root) {
                    const rCode = (root.leadJobCode || root.LeadJobCode || '').toUpperCase();
                    // Prefer L-tag extraction (Step 2660 Fix)
                    if (rCode.match(/L\d+/)) return rCode.match(/L\d+/)[0];
                    if (rCode && rCode.match(/^L\d+/)) return rCode.split('-')[0].trim();
                    if (root.itemName?.toUpperCase().match(/L\d+/)) return root.itemName.toUpperCase().match(/L\d+/)[0];

                    // Fallback to searching up from the current leadId to find the true root
                    let searchRoot = root;
                    let safety = 0;
                    while (searchRoot && searchRoot.parentId && searchRoot.parentId !== '0' && searchRoot.parentId !== 0 && safety < 10) {
                        const parent = pricingData.jobs.find(p => String(p.id || p.ItemID) === String(searchRoot.parentId));
                        if (parent) searchRoot = parent;
                        else break;
                        safety++;
                    }
                    const sCode = (searchRoot.leadJobCode || searchRoot.LeadJobCode || '').toUpperCase();
                    if (sCode.match(/L\d+/)) return sCode.match(/L\d+/)[0];
                    if (searchRoot.itemName?.toUpperCase().match(/L\d+/)) return searchRoot.itemName.toUpperCase().match(/L\d+/)[0];
                }
            }

            // FALLBACK 2: Use established leadJobPrefix
            const prefix = (enquiryData?.leadJobPrefix || '').toUpperCase();
            if (!prefix) return '';
            if (prefix.match(/L\d+/)) return prefix.match(/L\d+/)[0];

            // Find item in pool and walk up
            let job = jobsPool.find(j => {
                const name = (j.itemName || j.DivisionName || j.ItemName || '').toUpperCase();
                const clean = name.replace(/^(L\d+\s*-\s*)/, '').trim();
                return name === prefix || clean === prefix || (j.leadJobCode && j.leadJobCode.toUpperCase() === prefix);
            });

            if (job) {
                let root = job;
                let safety = 0;
                while (root && root.parentId && root.parentId !== '0' && root.parentId !== 0 && safety < 10) {
                    const parent = jobsPool.find(p => String(p.id || p.ItemID) === String(root.parentId));
                    if (parent) root = parent;
                    else break;
                    safety++;
                }
                const foundCode = (root.leadJobCode || root.LeadJobCode || '').toUpperCase();
                if (foundCode.match(/L\d+/)) return foundCode.match(/L\d+/)[0];
                return prefix;
            }
            return prefix;
        })();

        const tabQuotes = sourceQuotes.filter(q => {
            // Scoped API can return quotes for multiple OwnJobs; always narrow by the active tab's job.
            // Priority 1: OwnJob Match (The specific branch/tab this quote belongs to)
            const quoteOwnJob = collapseSpacesLower(stripQuoteJobPrefix(q.OwnJob || ''));
            const tabJobName = collapseSpacesLower(stripQuoteJobPrefix(activeTabObj.label || activeTabObj.name || ''));

            const isTabMatch =
                quoteOwnJob === tabJobName ||
                (activeTabRealId && String(q.DepartmentID) === String(activeTabRealId)) ||
                quoteNumberDivisionMatchesTab(q, activeTabObj, calculatedTabs.length > 1);

            if (!isTabMatch) return false;

            // Priority 2: Customer Match (Normalized)
            const normalizedQuoteTo = normalize(q.ToName || '');
            const normalizedCurrentTo = normalize(toName || '');

            const isExactMatch = normalizedCurrentTo && normalizedQuoteTo === normalizedCurrentTo;
            const curKey = normalizeCustomerKey(toName || '');
            const qKey = normalizeCustomerKey(q.ToName || '');
            const isCustomerKeyMatch = !!curKey && !!qKey && curKey === qKey;
            const qJobObjByOwnJob = jobsPool.find((j) =>
                collapseSpacesLower(stripQuoteJobPrefix(j.itemName || j.ItemName || j.DivisionName || '')) ===
                collapseSpacesLower(stripQuoteJobPrefix(q.OwnJob || ''))
            );
            const isSelfMatch =
                collapseSpacesLower(stripQuoteJobPrefix(qJobObjByOwnJob?.itemName || qJobObjByOwnJob?.DivisionName || '')) ===
                collapseSpacesLower(stripQuoteJobPrefix(toName || ''));

            // Ancestor match for internal quoting
            const isAncestorMatch = (() => {
                const tabJob = jobsPool.find(j => String(j.id || j.ItemID || j.ID) === String(activeTabRealId));
                if (!tabJob) return false;
                let curr = tabJob;
                let safety = 0;
                let visited = new Set();
                while (curr && (curr.parentId || curr.ParentID) && safety < 20) {
                    const pId = String(curr.parentId || curr.ParentID);
                    if (visited.has(pId)) break;
                    visited.add(pId);
                    const p = jobsPool.find(pj => String(pj.id || pj.ItemID) === pId);
                    if (!p) break;
                    const pNameNorm = normalize(p.itemName || '');
                    if (pNameNorm === normalizedCurrentTo) return true;
                    curr = p;
                    safety++;
                }
                return false;
            })();

            // Scoped GET already narrowed the tuple (enquiry + lead + customer context). Persisted ToName is often
            // the priced internal branch (e.g. "Civil Project") while the recipient dropdown shows the external customer ("BEMCO").
            if (
                !isExactMatch &&
                !isCustomerKeyMatch &&
                !isAncestorMatch &&
                !isSelfMatch &&
                !scopedOnly
            ) {
                console.log(`[AutoLoad] REJECTED: Customer mismatch. q:${normalizedQuoteTo} vs cur:${normalizedCurrentTo}`);
                return false;
            }

            // Priority 3: Division Code verification (use job / lead context — not tab label alone)
            const parts = q.QuoteNumber?.split('/') || [];
            const qDivCode = parts[1]?.toUpperCase();
            const divisionMatchContextName = divisionMatchContextForQuoteTab(
                selectedLeadId,
                pricingData,
                activeTabRealId,
                activeTabObj,
                calculatedTabs.length,
                jobsPool
            );
            const ownJobMatchesTab =
                collapseSpacesLower(stripQuoteJobPrefix(q.OwnJob || '')) ===
                collapseSpacesLower(stripQuoteJobPrefix(activeTabObj.label || activeTabObj.name || ''));
            const isTypeMatch =
                ownJobMatchesTab ||
                matchDivisionCode(qDivCode, divisionMatchContextName, activeTabObj.divisionCode);

            if (!isTypeMatch) {
                console.log(`[AutoLoad] REJECTED: Type mismatch. qDiv:${qDivCode} vs context:${divisionMatchContextName}`);
                return false;
            }

            // Authoritative: QuoteNumber division segment (e.g. BMP vs HVP) must match the active tab.
            if (calculatedTabs.length > 1 && !quoteNumberDivisionMatchesTab(q, activeTabObj, true)) {
                console.log(`[AutoLoad] REJECTED: Quote ref division does not match active tab: ${q.QuoteNumber}`);
                return false;
            }

            return true;
        });

        // Fast path: tab.quoteNo must resolve within tab-scoped rows only (never load another tab's ref from sourceQuotes).
        if (activeTabObj.quoteNo && tabQuotes.length > 0) {
            const want = String(activeTabObj.quoteNo).trim();
            const baseWant = want.split('-R')[0];
            const byNo = tabQuotes.find((q) => {
                const qn = String(q.QuoteNumber || '').trim();
                if (!qn) return false;
                return qn === want || qn.split('-R')[0] === baseWant;
            });
            if (byNo) {
                if (String(quoteRowId(byNo) ?? '') !== String(quoteId ?? '')) {
                    console.log('[AutoLoad] Loading from tab.quoteNo:', want);
                    loadQuote(byNo, { preserveRecipient: true, skipPreparedSignatory: true });
                }
                return;
            }
        }

        if (tabQuotes.length > 0) {
            // Found quotes: Sort by Revision (Desc) and Load Latest
            const sorted = tabQuotes.sort((a, b) => b.RevisionNo - a.RevisionNo);
            const latest = sorted[0];

            // Only load if different (using closure's quoteId)
            if (String(quoteRowId(latest) ?? '') !== String(quoteId ?? '')) {
                console.log('[AutoLoad] Loading latest quote:', latest.QuoteNumber, 'for branch:', currentLeadCode);
                loadQuote(latest, { preserveRecipient: true, skipPreparedSignatory: true });
            }
        } else {
            console.log('[AutoLoad] No quotes found for tab. Branch:', currentLeadCode);
            if (!(toName || '').trim()) {
                console.log('[AutoLoad] toName empty; skip reset until customer is set again.');
                return;
            }
            // Relaxed fallback: legacy only. When GET /by-enquiry is scoped (LeadJob + OwnJob + ToName), that list is
            // authoritative — never pull another tab's quote here (was showing BMS ref on HVAC with "No quotes for this tab").
            if (!scopedEnquiryQuotesParams) {
                const relaxedByCustomerAndLead = sourceQuotes.filter((q) => {
                    const sameCustomer =
                        normalize(q.ToName || '') === normalize(toName || '') ||
                        normalizeCustomerKey(q.ToName || '') === normalizeCustomerKey(toName || '');
                    if (!sameCustomer) return false;

                    const qParts = String(q.QuoteNumber || '').split('/');
                    const qLeadPart = (qParts[2] || '').toUpperCase();
                    const qLeadCode = qLeadPart.match(/L\d+/)?.[0] || '';
                    const curLeadCode = String(currentLeadCode || '').toUpperCase().match(/L\d+/)?.[0] || '';

                    // If either side has no L-code, do not reject on branch here (legacy formats).
                    if (qLeadCode && curLeadCode && qLeadCode !== curLeadCode) return false;

                    // With multiple job tabs (e.g. HVAC + BMS), never pick another tab's quote (was loading HVP on BMS tab).
                    if (calculatedTabs.length > 1) {
                        const quoteOwnJob = collapseSpacesLower(stripQuoteJobPrefix(q.OwnJob || ''));
                        const tabJobName = collapseSpacesLower(
                            stripQuoteJobPrefix(activeTabObj.label || activeTabObj.name || '')
                        );
                        const tabOwnJobMatches =
                            quoteOwnJob === tabJobName ||
                            (activeTabRealId && String(q.DepartmentID) === String(activeTabRealId));
                        const divMatchesTab = quoteNumberDivisionMatchesTab(q, activeTabObj, true);
                        if (!tabOwnJobMatches && !divMatchesTab) return false;
                    }

                    return true;
                });
                if (relaxedByCustomerAndLead.length > 0) {
                    const latestRelaxed = [...relaxedByCustomerAndLead].sort((a, b) => {
                        const r = (Number(b.RevisionNo) || 0) - (Number(a.RevisionNo) || 0);
                        if (r !== 0) return r;
                        const ta = Date.parse(a.QuoteDate || 0) || 0;
                        const tb = Date.parse(b.QuoteDate || 0) || 0;
                        return tb - ta;
                    })[0];
                    if (latestRelaxed && String(quoteRowId(latestRelaxed) ?? '') !== String(quoteId ?? '')) {
                        console.log('[AutoLoad] Relaxed fallback loading quote:', latestRelaxed.QuoteNumber);
                        loadQuote(latestRelaxed, { preserveRecipient: true, skipPreparedSignatory: true });
                        return;
                    }
                }
            }

            // SAFEGUARD: Don't clear if we just saved/revised for *this tab*. Never use full sourceQuotes here —
            // a sibling-tab quote in the scoped panel would block reset and keep the wrong Quote Ref on screen.
            const qnTrimGuard = (quoteNumber != null ? String(quoteNumber).trim() : '');
            const savedRowForGuard =
                quoteId != null && String(quoteId).trim() !== ''
                    ? existingQuotes.find((q) => String(quoteRowId(q) ?? '') === String(quoteId ?? ''))
                    : null;
            const savedRowSameRef =
                !!savedRowForGuard &&
                !!qnTrimGuard &&
                String(savedRowForGuard.QuoteNumber || savedRowForGuard.quoteNumber || '').trim() === qnTrimGuard;

            let savedBelongsToActiveTab = false;
            if (savedRowForGuard && activeTabObj && savedRowSameRef) {
                const quoteOwnJob = collapseSpacesLower(stripQuoteJobPrefix(savedRowForGuard.OwnJob || ''));
                const tabJobName = collapseSpacesLower(stripQuoteJobPrefix(activeTabObj.label || activeTabObj.name || ''));
                const jobMatch =
                    quoteOwnJob === tabJobName ||
                    (activeTabRealId && String(savedRowForGuard.DepartmentID) === String(activeTabRealId)) ||
                    quoteNumberDivisionMatchesTab(savedRowForGuard, activeTabObj, calculatedTabs.length > 1);
                const custMatch =
                    normalize(savedRowForGuard.ToName || '') === normalize(toName || '') ||
                    (normalizeCustomerKey(savedRowForGuard.ToName || '') &&
                        normalizeCustomerKey(savedRowForGuard.ToName || '') === normalizeCustomerKey(toName || '')) ||
                    !!scopedOnly;
                savedBelongsToActiveTab = !!(jobMatch && custMatch);
            }

            const isJustSaved =
                tabQuotes.some((q) => {
                    const qid = quoteRowId(q);
                    return (
                        String(qid ?? '') === String(quoteId ?? '') &&
                        String(q.QuoteNumber || q.quoteNumber || '').trim() === qnTrimGuard
                    );
                }) ||
                (scopedOnly && savedBelongsToActiveTab);

            if (quoteId !== null && !isJustSaved) {
                console.log('[AutoLoad] Resetting to blank form as no saved quotes match current tab/customer.');
                setQuoteId(null);
                setQuoteNumber('');
                const reg = tabStateRegistry.current[activeQuoteTab];
                if (reg && typeof reg === 'object') {
                    reg.quoteId = null;
                    reg.quoteNumber = '';
                }
                setClauseContent(defaultClauses);
                setClauses({
                    showScopeOfWork: true, showBasisOfOffer: true, showExclusions: true,
                    showPricingTerms: true, showSchedule: true, showWarranty: true,
                    showResponsibilityMatrix: true, showTermsConditions: true, showAcceptance: true, showBillOfQuantity: true
                });
                setQuoteDate(new Date().toISOString().split('T')[0]);
                setValidityDays(30);
                setSubject(enquiryData?.enquiry?.ProjectName ? `Proposal for ${enquiryData.enquiry.ProjectName}` : '');
                setCustomerReference(enquiryData?.enquiry?.CustomerRefNo || enquiryData?.enquiry?.RequestNo || '');
            }

            // Summary refresh on tab change is handled by the calculateSummary effect (paired tabs + same quoteId).
        }
    }, [
        activeQuoteTab,
        quoteTabsFingerprint,
        existingQuotes,
        quoteScopedForPanel,
        scopedEnquiryQuotesParams,
        scopedQuotesFetchSettledKey,
        scopedQuotePanelFetchKey,
        toName,
        selectedLeadId,
        pricingData,
        enquiryData,
        quoteId,
        jobsPool,
    ]);

    // Hard fallback: when server-scoped rows exist, load the latest only if it belongs to the active tab.
    // Never keep the full unfiltered panel when the tab filter is empty — that loaded another tab's Quote Ref (e.g. BMS on HVAC).
    useEffect(() => {
        if (!quoteScopedForPanel || quoteScopedForPanel.length === 0) return;
        if (
            scopedEnquiryQuotesParams &&
            scopedQuotesFetchSettledKey !== scopedQuotePanelFetchKey
        ) {
            return;
        }
        if (!(toName || '').trim()) return;

        const activeTabObj = calculatedTabs?.find((t) => String(t.id) === String(activeQuoteTab));
        let panel = quoteScopedForPanel;
        const scopeP = scopedEnquiryQuotesParams;
        const multiTab = (calculatedTabs?.length || 0) > 1;
        const narrowed =
            !!(activeTabObj && (activeTabObj.label || activeTabObj.name)) &&
            (multiTab || !!scopeP?.useDepartmentForOwnJob);

        if (narrowed) {
            const tabJobName = collapseSpacesLower(stripQuoteJobPrefix(activeTabObj.label || activeTabObj.name || ''));
            panel = quoteScopedForPanel.filter((q) => {
                const quoteOwnJob = collapseSpacesLower(stripQuoteJobPrefix(q.OwnJob || ''));
                return (
                    quoteOwnJob === tabJobName ||
                    (activeTabObj.realId && String(q.DepartmentID) === String(activeTabObj.realId)) ||
                    quoteNumberDivisionMatchesTab(q, activeTabObj, multiTab)
                );
            });
        }

        const currentInScope = quoteId
            ? panel.some((q) => String(quoteRowId(q) ?? '') === String(quoteId ?? ''))
            : false;
        if (currentInScope) return;

        const latest = [...panel].sort((a, b) => {
            const r = (Number(b.RevisionNo) || 0) - (Number(a.RevisionNo) || 0);
            if (r !== 0) return r;
            const ta = Date.parse(a.QuoteDate || 0) || 0;
            const tb = Date.parse(b.QuoteDate || 0) || 0;
            return tb - ta;
        })[0];

        if (!latest) {
            if (narrowed && (quoteId !== null || (quoteNumber || '').trim() !== '')) {
                console.log('[HardFallback] No scoped quote for active tab; clearing Quote Ref for draft preview.');
                setQuoteId(null);
                setQuoteNumber('');
                const reg = tabStateRegistry.current[activeQuoteTab];
                if (reg && typeof reg === 'object') {
                    reg.quoteId = null;
                    reg.quoteNumber = '';
                }
            }
            return;
        }
        loadQuote(latest, { preserveRecipient: true, skipPreparedSignatory: true });
        // eslint-disable-next-line react-hooks/exhaustive-deps -- calculatedTabs read from closure; quoteTabsFingerprint tracks meaningful tab/quoteNo changes
    }, [quoteScopedForPanel, quoteId, quoteNumber, toName, activeQuoteTab, quoteTabsFingerprint, scopedEnquiryQuotesParams, scopedQuotesFetchSettledKey, scopedQuotePanelFetchKey]);



    const handleAddQuoteType = useCallback(() => {
        const v = (quoteEnquiryTypeSelect || '').trim();
        if (v && !quoteTypeList.includes(v)) {
            setQuoteTypeList((prev) => [...prev, v]);
            setQuoteEnquiryTypeSelect('');
        }
    }, [quoteEnquiryTypeSelect, quoteTypeList]);

    const handleRemoveQuoteTypeAt = useCallback((idx) => {
        if (idx == null || idx < 0) return;
        setQuoteTypeList((prev) => prev.filter((_, i) => i !== idx));
    }, []);

    // Generic Mandatory Field Validation
    const validateMandatoryFields = useCallback(() => {
        const missingFields = [];
        if (!quoteDate) missingFields.push('Quote Date');
        if (!validityDays || validityDays <= 0) missingFields.push('Validity (Days)');
        if (!toAttention || !toAttention.trim()) missingFields.push('Attention of');
        if (!subject || !subject.trim()) missingFields.push('Subject');
        if (!preparedBy || !preparedBy.trim()) missingFields.push('Prepared By');
        if (!signatory || !signatory.trim()) missingFields.push('Signatory');
        if (!customerReference || !customerReference.trim()) missingFields.push('Customer Reference');
        if (!quoteTypeList || quoteTypeList.length === 0) missingFields.push('Enquiry Type');

        // Check for future date
        if (quoteDate) {
            const today = new Date();
            today.setHours(23, 59, 59, 999); // Allow today full
            if (new Date(quoteDate) > today) {
                missingFields.push('Quote Date (Future dates not allowed)');
            }
        }

        if (missingFields.length > 0) {
            alert(`Please fill the following mandatory fields before proceeding:\n\n• ${missingFields.join('\n• ')}`);
            return false;
        }
        return true;
    }, [quoteDate, validityDays, toAttention, subject, preparedBy, signatory, customerReference, quoteTypeList]);

    const handleRevise = async () => {
        console.log('[handleRevise] Starting revision process. QuoteId:', quoteId);
        if (!quoteId) {
            console.log('[handleRevise] No quoteId found, aborting');
            return;
        }

        // Validate mandatory fields before revision
        if (!validateMandatoryFields()) return;

        if (!window.confirm('Are you sure you want to create a new revision based on this quote?')) {
            console.log('[handleRevise] User cancelled');
            return;
        }

        setSaving(true);
        try {
            const payload = getQuotePayload();
            console.log('[handleRevise] Payload:', payload);
            console.log('[handleRevise] Calling API:', `${API_BASE}/api/quotes/${quoteId}/revise`);

            const res = await fetch(`${API_BASE}/api/quotes/${quoteId}/revise`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            console.log('[handleRevise] Response status:', res.status);

            if (res.ok) {
                const data = await res.json();
                console.log('[handleRevise] Success! New revision data:', data);

                const newRevId = data.id ?? data.ID ?? data.Id;
                const newRevQn = data.quoteNumber ?? data.QuoteNumber ?? '';
                // Update quote ID and number first
                setQuoteId(newRevId);
                setQuoteNumber(newRevQn);

                // Update local quotes list immediately so AutoLoad doesn't reset to Draft (Step 4488 FIX)
                setExistingQuotes(prev => [
                    ...prev,
                    {
                        ID: newRevId,
                        QuoteNumber: newRevQn,
                        ToName: toName,
                        RevisionNo: data.revisionNo ?? data.RevisionNo ?? 0,
                        Status: 'Saved',
                        QuoteDate: quoteDate,
                        PreparedBy: preparedBy,
                        TotalAmount: grandTotal,
                        OwnJob: payload.ownJob, // CRITICAL for AutoLoad matching
                        LeadJob: payload.leadJob  // CRITICAL for AutoLoad matching
                    }
                ]);

                if (scopedEnquiryQuotesParams) {
                    const optimisticRevRow = {
                        ID: newRevId,
                        QuoteNumber: newRevQn,
                        ToName: toName,
                        RevisionNo: data.revisionNo ?? data.RevisionNo ?? 0,
                        Status: 'Saved',
                        QuoteDate: quoteDate,
                        PreparedBy: preparedBy,
                        TotalAmount: grandTotal,
                        OwnJob: payload.ownJob,
                        LeadJob: payload.leadJob,
                    };
                    setQuoteScopedForPanel((prev) => {
                        const idStr = String(newRevId ?? '');
                        if (!idStr || idStr === 'undefined') return prev;
                        const withoutOldRev = prev.filter((q) => String(quoteRowId(q) ?? '') !== String(quoteId ?? ''));
                        if (withoutOldRev.some((q) => String(quoteRowId(q) ?? '') === idStr)) return withoutOldRev;
                        return [...withoutOldRev, optimisticRevRow];
                    });
                }

                // Note: Metadata is NOT cleared anymore to allow immediate viewing/working with the new revision.
                // Re-calculating existing quotes will pull the latest list.


                // Wait a moment for DB commit, then refresh the quotes list
                console.log('[handleRevise] Waiting 500ms for DB commit...');
                await new Promise(resolve => setTimeout(resolve, 500));

                console.log('[handleRevise] Refreshing quotes list...');
                const refreshed = await fetchExistingQuotes(enquiryData.enquiry.RequestNo);
                const match = Array.isArray(refreshed)
                    ? refreshed.find((q) => String(quoteRowId(q) ?? '') === String(newRevId ?? ''))
                    : null;
                if (match) {
                    queueMicrotask(() =>
                        loadQuote(match, { preserveRecipient: true, skipPreparedSignatory: true })
                    );
                }

                // Upload any pending files now that we have a new Revision ID
                if (pendingFiles.length > 0 && newRevId != null && newRevId !== '') {
                    console.log('[handleRevise] Uploading pending files to new revision...', pendingFiles.length);
                    await uploadFiles(pendingFiles, newRevId);
                    setPendingFiles([]); // Clear queue
                }

                console.log('[handleRevise] All updates complete!');
                alert('Revision created successfully!');
            } else {
                const err = await res.json();
                console.error('[handleRevise] Error response:', err);
                alert('Error: ' + (err.error || 'Failed to revise quote'));
            }
        } catch (err) {
            console.error('[handleRevise] Fatal error:', err);
            alert('Fatal error revising quote');
        } finally {
            setSaving(false);
        }
    };

    // Select enquiry
    // Trigger fetch when enquiry is loaded
    useEffect(() => {
        if (enquiryData?.enquiry?.RequestNo) {
            console.log('[QuoteForm] Enquiry loaded, fetching quotes for RequestNo:', enquiryData.enquiry.RequestNo);
            fetchExistingQuotes(enquiryData.enquiry.RequestNo);
        } else {
            console.log('[QuoteForm] Enquiry loaded but no RequestNo?', enquiryData);
        }
    }, [enquiryData?.enquiry?.RequestNo]); // Only trigger when RequestNo changes

    const fetchExistingQuotes = useCallback(async (requestNo) => {
        try {
            console.log('[fetchExistingQuotes] START fetching for:', requestNo);
            const em = (currentUser?.email || currentUser?.EmailId || '').toString();
            const qs = em ? `?${new URLSearchParams({ userEmail: em }).toString()}` : '';
            const url = `${API_BASE}/api/quotes/by-enquiry/${encodeURIComponent(requestNo)}${qs}`;
            console.log('[fetchExistingQuotes] URL:', url);

            const res = await fetch(url);
            console.log('[fetchExistingQuotes] Response status:', res.status);

            if (res.ok) {
                const quotes = await res.json();
                console.log('[fetchExistingQuotes] Received quotes payload:', quotes);
                console.log('[fetchExistingQuotes] Count:', quotes.length);
                quotes.forEach(q => console.log('  -', q.QuoteNumber, '| To:', q.ToName, '| OwnJob:', q.OwnJob, '| IdentityCode:', q.IdentityCode));
                setExistingQuotes(quotes);
                return quotes;
            }
            console.error('[fetchExistingQuotes] Failed to fetch, status:', res.status);
        } catch (err) {
            console.error('[fetchExistingQuotes] Error:', err);
        }
        return null;
    }, [currentUser]);

    // NEW: Auto-load latest revision for selected customer and lead job


    const handleSelectEnquiry = async (enq) => {
        setSearchTerm(enq.RequestNo);
        setSuggestions([]);
        setShowSuggestions(false);
        setLoading(true);
        setPricingData(null); // Reset pricing data to clear stale access rights
        setExistingQuotes([]);
        setQuoteScopedForPanel([]);
        setScopedQuotesFetchSettledKey(null);
        setPendingFiles([]); // Clear queue
        leadChoiceFingerprintRef.current = '';
        autoSelectCustomerAfterLeadChangeRef.current = false;
        preserveQuoteOnLeadChangeRef.current = null;
        setToName('');
        setToAddress('');
        setToPhone('');
        setToEmail('');
        setToAttention('');
        setPreparedBy((currentUser?.FullName || currentUser?.name || '').trim());
        setSignatory('');
        setSignatoryDesignation('');
        setQuoteId(null);
        setQuoteNumber('');
        setSelectedLeadId(null);
        setQuoteEnquiryTypeSelect('');
        setQuoteTypeList([]);

        // --- LOCKED LOGIC: Clear Tab State Registry on New Enquiry ---
        tabStateRegistry.current = {};

        try {
            const userEmail = currentUser?.EmailId || '';
            const res = await fetch(
                `${API_BASE}/api/quotes/enquiry-data/${encodeURIComponent(enq.RequestNo)}?userEmail=${encodeURIComponent(userEmail)}`,
                { cache: 'no-store' }
            );
            if (res.ok) {
                const data = await res.json();
                setEnquiryData(data);
                fetchExistingQuotes(enq.RequestNo);

                // Fetch Pricing Data (even without customer) to get initial Access Rights & Hierarchy
                loadPricingData(enq.RequestNo, '');

                setQuoteNumber(data.quoteNumber);
                setQuoteId(null); // New quote

                // Reset Clauses to Defaults
                setClauses({
                    showScopeOfWork: true, showBasisOfOffer: true, showExclusions: true,
                    showPricingTerms: true, showSchedule: true, showWarranty: true,
                    showResponsibilityMatrix: true, showTermsConditions: true, showAcceptance: true, showBillOfQuantity: true
                });
                setClauseContent({
                    scopeOfWork: defaultClauses.scopeOfWork,
                    basisOfOffer: defaultClauses.basisOfOffer,
                    exclusions: defaultClauses.exclusions,
                    pricingTerms: defaultClauses.pricingTerms,
                    schedule: defaultClauses.schedule,
                    warranty: defaultClauses.warranty,
                    responsibilityMatrix: defaultClauses.responsibilityMatrix,
                    termsConditions: defaultClauses.termsConditions,
                    acceptance: defaultClauses.acceptance,
                    billOfQuantity: defaultClauses.billOfQuantity
                });
                setOrderedClauses([
                    'showScopeOfWork', 'showBasisOfOffer', 'showExclusions', 'showPricingTerms',
                    'showBillOfQuantity', 'showSchedule', 'showWarranty', 'showResponsibilityMatrix', 'showTermsConditions', 'showAcceptance'
                ]);

                setCompanyProfiles(data.availableProfiles || []);

                const useTabDrivenQuoteBranding = enquiryPayloadSuggestsMultiBranchTabs(data);
                if (!useTabDrivenQuoteBranding) {
                    if (data.companyDetails) {
                        setQuoteCompanyName(data.companyDetails.name || 'Almoayyed Air Conditioning');
                        setQuoteLogo(data.companyDetails.logo);
                        setFooterDetails(data.companyDetails);
                    }

                    // ---------------------------------------------------------
                    // INTELLIGENT HEADER/FOOTER SELECTION BASED ON LOGGED-IN USER
                    // ---------------------------------------------------------
                    let selectedProfile = null;
                    const userDept = currentUser?.Department || ''; // e.g., "Civil", "MEP"

                    if (userDept && data.availableProfiles?.length > 0) {
                        console.log(`[Profile selection] User Dept: ${userDept}. Available profiles:`, data.availableProfiles.map(p => p.itemName));

                        // 1. Try to find an EXACT match for User Dept (Trimmed and Case-Insensitive)
                        const normalizedDept = userDept.trim().toLowerCase();
                        selectedProfile = data.availableProfiles.find(p => {
                            const pItemName = (p.itemName || '').trim().toLowerCase();
                            const pName = (p.name || '').trim().toLowerCase();
                            return pItemName === normalizedDept || pName === normalizedDept;
                        });

                        // 2. Try Heuristic Matches if no exact match
                        if (!selectedProfile) {
                            if (userDept.toLowerCase().includes('civil')) {
                                selectedProfile = data.availableProfiles.find(p =>
                                    p.itemName?.toLowerCase().includes('civil') ||
                                    p.code === 'ACC' ||
                                    p.divisionCode === 'CVLP'
                                );
                            } else if (userDept.toLowerCase().includes('bms')) {
                                selectedProfile = data.availableProfiles.find(p =>
                                    (p.itemName && p.itemName.toLowerCase().includes('bms')) ||
                                    p.divisionCode === 'BMS' ||
                                    p.divisionCode === 'BMP' ||
                                    (p.name && p.name.toLowerCase().includes('bms'))
                                );
                            } else if (userDept.toLowerCase().includes('hv') || userDept.toLowerCase().includes('condition')) {
                                selectedProfile = data.availableProfiles.find(p =>
                                    (p.itemName && (p.itemName.toLowerCase().includes('hv') || p.itemName.toLowerCase().includes('condition'))) ||
                                    p.divisionCode === 'HVP' || p.divisionCode === 'AMM'
                                );
                            } else if (userDept.toLowerCase().includes('mep')) {
                                selectedProfile = data.availableProfiles.find(p =>
                                    p.divisionCode === 'AAC' || p.divisionCode === 'ELP' || p.divisionCode === 'PLP'
                                );
                            }
                        }

                        // 3. Last Resort: Any personal profile if none matched above
                        if (!selectedProfile) {
                            selectedProfile = data.availableProfiles.find(p => p.isPersonalProfile);
                        }
                    }

                    // --- MANDATORY IDENTITY OVERRIDE (Step 4488) ---
                    const personalProfile = data.availableProfiles.find(p => p.isPersonalProfile);
                    if (personalProfile) {
                        selectedProfile = personalProfile;
                        console.log(`[Profile selection] ✓ ENFORCING personal identity: ${selectedProfile.name}`);
                    }

                    if (selectedProfile) {
                        console.log(`[Profile selection] ENFORCING user profile: "${userDept}" ->`, selectedProfile);
                        setQuoteCompanyName(selectedProfile.name);
                        setQuoteLogo(selectedProfile.logo);
                        setFooterDetails(selectedProfile);

                        data.companyDetails = { ...selectedProfile, isPersonalProfile: true };
                        data.enquiryLogo = selectedProfile.logo;
                        data.enquiryCompanyName = selectedProfile.name;

                        setEnquiryData({ ...data });
                    } else if (data.companyDetails) {
                        setQuoteCompanyName(data.companyDetails.name);
                        setQuoteLogo(data.companyDetails.logo);
                        setFooterDetails(data.companyDetails);
                        console.log(`[Profile selection] No specific user profile, using default identity: ${data.companyDetails.divisionCode}`);
                    }
                }

                // 3a. Auto-Select Lead Job
                console.log('[QuoteForm] Auto-Select Lead Job - divisions:', data.divisions);
                console.log('[QuoteForm] Auto-Select Lead Job - divisionsHierarchy:', data.divisionsHierarchy);

                // Use divisions if available, otherwise extract from divisionsHierarchy
                let availableDivisions = data.divisions || [];

                if (availableDivisions.length === 0 && data.divisionsHierarchy && data.divisionsHierarchy.length > 0) {
                    // Use ALL nodes in hierarchy as potential Lead Job context
                    availableDivisions = data.divisionsHierarchy.map(r => r.itemName || r.DivisionName);
                    console.log('[QuoteForm] Using all divisionsHierarchy nodes for Lead Job selection:', availableDivisions);
                }

                const leadJobs = availableDivisions.filter(d => d.trim().startsWith('L'));
                console.log('[QuoteForm] Filtered Lead Jobs:', leadJobs);

                if (leadJobs.length === 1) {
                    // Only ONE Lead Job available - Auto Select
                    const prefix = leadJobs[0].split('-')[0].trim();
                    data.leadJobPrefix = prefix;
                    console.log('[QuoteForm] Auto-selecting Single Lead Job:', prefix);
                } else if (leadJobs.length > 1) {
                    // Multiple Lead Jobs - Force User Selection
                    data.leadJobPrefix = '';
                    console.log('[QuoteForm] Multiple Lead Jobs found. User must select.');
                } else {
                    // No lead jobs found - try to use best match for current user department
                    const userDept = (currentUser?.Department || '').toLowerCase();
                    const bmsMatch = availableDivisions.find(d => d.toLowerCase().includes('bms'));
                    const elecMatch = availableDivisions.find(d => d.toLowerCase().includes('electrical'));

                    if (userDept.includes('bms') && bmsMatch) {
                        data.leadJobPrefix = bmsMatch;
                        console.log('[QuoteForm] Auto-selecting BMS for BMS user:', bmsMatch);
                    } else if (userDept.includes('electrical') && elecMatch) {
                        data.leadJobPrefix = elecMatch;
                        console.log('[QuoteForm] Auto-selecting Electrical for Electrical user:', elecMatch);
                    } else if (availableDivisions.length > 0) {
                        data.leadJobPrefix = availableDivisions[0].split('-')[0].trim();
                        console.log('[QuoteForm] Using first available division:', data.leadJobPrefix);
                    } else {
                        data.leadJobPrefix = '';
                        console.log('[QuoteForm] No divisions available at all');
                    }
                }

                // ---------------------------------------------------------

                setPreparedByOptions(data.preparedByOptions || []);

                // Signatory and Prepared By calculations moved to Signatory state
                // Customer options are handled by the useEffect for consistency


                // Ensure state update triggers effect
                // (enquiryData update below handles it)


                // Merge usersList with preparedByOptions for Signatory
                // Logic: Signatory should be standard users OR anyone involved (SE, CC, Common)
                const extendedSignatoryOptions = [
                    ...usersList.map(u => ({ value: u.FullName, label: u.FullName, designation: u.Designation })),
                    ...(data.preparedByOptions || [])
                ];
                // Deduplicate by value (name/email)
                const uniqueSigOptions = extendedSignatoryOptions.filter((v, i, a) => a.findIndex(t => (t.value === v.value)) === i);
                setSignatoryOptions(uniqueSigOptions);

                // Initialize Metadata
                setQuoteDate(new Date().toISOString().split('T')[0]);
                setValidityDays(30);
                setPreparedBy((currentUser?.FullName || currentUser?.name || '').trim());
                setSignatory('');
                setSignatoryDesignation('');

                setCustomerReference(data.enquiry.CustomerRefNo || data.enquiry.RequestNo || ''); // Default to Cust Ref or Enquiry No → YourRef on save
                setSubject(`Proposal for ${data.enquiry.ProjectName}`);
                {
                    const t = data.enquiry?.SelectedEnquiryTypes;
                    setQuoteTypeList(Array.isArray(t) && t.length > 0 ? [...t] : []);
                    setQuoteEnquiryTypeSelect('');
                }

                // Reset Customer Selection to ensure a clean slate (User must select manually)
                const defaultCustomer = '';
                setToName(defaultCustomer);
                // Final Data Update to Ensure all modifications (Lead Job Logic, etc.) are reflected in State
                setEnquiryData({ ...data });

                if (defaultCustomer) {
                    const normalize = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                    const target = normalize(defaultCustomer);

                    // Try exact match first, then robust normalized match
                    let cust = customersList.find(c => c.CompanyName === defaultCustomer);
                    if (!cust) {
                        cust = customersList.find(c => normalize(c.CompanyName) === target);
                    }

                    if (cust) {
                        // NOTE: We prioritize MASTER LIST address over enquiry data default.
                        const addr = [cust.Address1, cust.Address2].filter(Boolean).join('\n').trim();
                        setToAddress(addr);
                        setToPhone(`${cust.Phone1 || ''} ${cust.Phone2 ? '/ ' + cust.Phone2 : ''}`.trim());
                        setToEmail(cust.EmailId || ''); // Prioritize Master Email
                    } else {
                        // Customer NOT in Master List.
                        const enqCustName = data.enquiry?.CustomerName || '';
                        const enqCustList = enqCustName.split(',').map(c => normalize(c.trim()));

                        // Check if the selected target is in the enquiry's customer list
                        if (enqCustList.includes(target) && data.customerDetails) {
                            const details = data.customerDetails;
                            const addr = details.Address || [details.Address1, details.Address2].filter(Boolean).join('\n').trim();
                            setToAddress(addr);
                            setToPhone(`${details.Phone1 || ''} ${details.Phone2 ? '/ ' + details.Phone2 : ''} `.trim());
                            setToEmail(details.EmailId || '');
                        } else {
                            // Even if not in master list, allow it but CLEAR details to avoid internal division leak
                            setToAddress('');
                            setToPhone('');
                            setToEmail('');
                        }
                    }
                } else {
                    setToName('');
                    setToAddress('');
                    setToPhone('');
                    setToEmail('');
                    setToAttention('');
                }

                // Set Attention of (ReceivedFrom) for the default customer
                if (defaultCustomer && data.customerContacts) {
                    console.log('[handleSelectEnquiry] Setting Attention for default customer:', defaultCustomer);
                    console.log('[handleSelectEnquiry] customerContacts:', data.customerContacts);

                    if (data.customerContacts[defaultCustomer]) {
                        setToAttention(data.customerContacts[defaultCustomer]);
                        console.log('[handleSelectEnquiry] ✓ Set Attention to:', data.customerContacts[defaultCustomer]);
                    } else {
                        // Fallback to main enquiry ReceivedFrom if no specific contact
                        const fallback = data.enquiry?.ReceivedFrom || '';
                        setToAttention(fallback);
                        console.log('[handleSelectEnquiry] ✗ Not found in customerContacts, using fallback:', fallback);
                    }
                }


                // Default to enquiry customer for pricing load
                loadPricingData(data.enquiry.RequestNo, defaultCustomer);


                // System defaults for Prepared By / Signatory removed per User request Step 1440
            }
        } catch (err) {
            console.error('Error loading enquiry data:', err);
        } finally {
            setLoading(false);
        }
    };

    // --- Attachment Functions ---
    const fetchQuoteAttachments = useCallback(async (qId) => {
        if (!qId) return;
        try {
            const res = await fetch(`${API_BASE}/api/quotes/attachments/${qId}`);
            if (res.ok) {
                const data = await res.json();
                setQuoteAttachments((prev) => {
                    try {
                        if (JSON.stringify(prev) === JSON.stringify(data)) return prev;
                    } catch (_) {
                        /* ignore */
                    }
                    return data;
                });
            }
        } catch (err) {
            console.error('Error fetching attachments:', err);
        }
    }, []);

    const uploadFiles = useCallback(async (files, targetQuoteId) => {
        // If targetQuoteId is EXPLICITLY passed (e.g. from Save/Revise), we upload.
        // If it is NOT passed, we use component's quoteId and DECIDE whether to upload.
        // Rule: If we have ANY quoteId (Saved State), we queue files to pending so they go to the NEXT Revise/Save.
        const isInternalCall = targetQuoteId !== undefined;
        const effectiveId = isInternalCall ? targetQuoteId : quoteId;

        if (!effectiveId || (!isInternalCall && quoteId)) {
            // New Behavior: Queue files as pending until saved (Fresh Quote or Revision required)
            if (files && files.length > 0) {
                const fileArray = Array.from(files);
                // Simple duplication check based on name
                setPendingFiles(prev => {
                    const newFiles = fileArray.filter(f => !prev.some(p => p.name === f.name));
                    return [...prev, ...newFiles];
                });
            }
            return;
        }
        if (!files || files.length === 0) return;

        setIsUploading(true);
        const formData = new FormData();
        Array.from(files).forEach(file => {
            formData.append('files', file);
        });

        try {
            const res = await fetch(`${API_BASE}/api/quotes/attachments/${targetQuoteId}`, {
                method: 'POST',
                body: formData
            });
            if (res.ok) {
                await fetchQuoteAttachments(targetQuoteId);
            } else {
                const err = await res.json();
                alert('Failed to upload attachments: ' + (err.error || 'Unknown error'));
            }
        } catch (err) {
            console.error('Upload error:', err);
            alert('Error uploading files. Please try again or check the server status.');
        } finally {
            setIsUploading(false);
        }
    }, [quoteId, fetchQuoteAttachments]);

    const handleDeleteAttachment = async (attachmentId) => {
        if (!window.confirm('Delete this attachment?')) return;
        try {
            const res = await fetch(`${API_BASE}/api/quotes/attachments/${attachmentId}`, {
                method: 'DELETE'
            });
            if (res.ok) {
                setQuoteAttachments(prev => prev.filter(a => a.ID !== attachmentId));
            }
        } catch (err) {
            console.error('Error deleting attachment:', err);
        }
    };

    const handleDownloadAttachment = (id, fileName) => {
        window.open(`${API_BASE}/api/quotes/attachments/download/${id}?download=true`, '_blank');
    };


    useEffect(() => {
        if (quoteId) {
            fetchQuoteAttachments(quoteId);
        } else {
            setQuoteAttachments((prev) => (prev.length === 0 ? prev : []));
        }
    }, [quoteId, fetchQuoteAttachments]);

    // Clear selection
    const handleClear = () => {
        calculatedTabsCacheRef.current = { sig: '', tabs: EMPTY_CALCULATED_TABS };
        // --- LOCKED LOGIC: Clear Tab State Registry on Reset ---
        tabStateRegistry.current = {};
        setExistingQuotes([]);
        setQuoteScopedForPanel([]);
        setScopedQuotesFetchSettledKey(null);
        setPendingFiles([]); // Clear queue
        setExpandedGroups({});
        setSearchTerm('');
        setSuggestions([]);
        setShowSuggestions(false);
        setEnquiryData(null);
        setPricingData(null);

        // Reset all metadata and clauses
        resetFormState();
        setQuoteCompanyName('Almoayyed Air Conditioning');
        setQuoteLogo(null);
        setCompanyProfiles([]);
    };

    // Toggle clause visibility
    const toggleClause = (clauseKey) => {
        setClauses(prev => ({ ...prev, [clauseKey]: !prev[clauseKey] }));
    };

    // Update clause content
    const updateClauseContent = (key, value) => {
        setClauseContent(prev => ({ ...prev, [key]: value }));
    };


    const getQuotePayload = useCallback((customDivisionCode = null) => {
        // --- LOGGED-IN USER DRIVEN CODE RESOLUTION (Step 4488 FIX) ---
        // 1. STICK TO USER'S OWN IDENTITY: Find the profile the server matched to this user's email
        let personalProfile = (enquiryData?.availableProfiles || []).find(p => p.isPersonalProfile);

        let effectiveDivisionCode;
        let effectiveDeptCode;
        let identitySource = 'Default'; // Track source for logging

        // 2. Fallback: Lookup by Department Name if server flag is missing but we have the name
        const userDept = (currentUser?.Department || '').trim();
        if (!personalProfile && userDept) {
            personalProfile = (enquiryData?.availableProfiles || []).find(p => {
                const pItem = (p.itemName || '').trim().toLowerCase();
                const pName = (p.name || '').trim().toLowerCase();
                const uDept = userDept.toLowerCase();
                return pItem === uDept || pName === uDept ||
                    (uDept.includes('bms') && (pItem.includes('bms') || pName.includes('bms')));
            });
            if (personalProfile) {
                identitySource = `MatchedByDeptName(${userDept})`;
            }
        }

        // 3. Fallback: Absolute hard-override for BMS users (Requested by User)
        if (!personalProfile && userDept.toUpperCase().includes('BMS')) {
            console.log('[getQuotePayload] HARD OVERRIDE: BMS user detected, forcing AAC/BMP identity');
            effectiveDivisionCode = 'BMP';
            effectiveDeptCode = 'AAC';
            identitySource = 'BMSHardOverride';
        } else {
            // Default assignment if no personal profile or BMS override
            effectiveDivisionCode = personalProfile ? personalProfile.divisionCode : (enquiryData.companyDetails?.divisionCode || 'AAC');
            effectiveDeptCode = personalProfile ? personalProfile.departmentCode : (enquiryData.companyDetails?.departmentCode || 'AAC');
            if (personalProfile && identitySource === 'Default') identitySource = 'PersonalProfile';
            else if (!personalProfile && identitySource === 'Default') identitySource = 'EnquiryCompanyDetails';
        }

        if (customDivisionCode) {
            effectiveDivisionCode = customDivisionCode;
            identitySource = `CustomDivisionCode(${customDivisionCode})`;
        }

        console.log(`[getQuotePayload] Final Identity: Dept=${effectiveDeptCode}, Div=${effectiveDivisionCode} (Source: ${identitySource})`);

        return {
            divisionCode: effectiveDivisionCode,
            departmentCode: effectiveDeptCode,

            leadJobPrefix: (() => {
                // PRIORITY 1: Resolve based on current interactive selection
                if (selectedLeadId && pricingData?.jobs) {
                    const node = pricingData.jobs.find(j => String(j.id || j.ItemID) === String(selectedLeadId));
                    if (node) {
                        let root = node;
                        let safe = 0;
                        let vis = new Set();
                        while (root && (root.parentId || root.ParentID) && (root.parentId || root.ParentID) !== '0' && (root.parentId || root.ParentID) !== 0 && safe < 20) {
                            if (vis.has(String(root.id || root.ItemID))) break;
                            vis.add(String(root.id || root.ItemID));
                            const pId = String(root.parentId || root.ParentID);
                            const p = pricingData.jobs.find(pj => String(pj.id || pj.ItemID) === pId);
                            if (p) root = p;
                            else break;
                            safe++;
                        }
                        const rCode = (root.leadJobCode || root.LeadJobCode || '').toUpperCase();
                        if (rCode && rCode.match(/^L\d+/)) return rCode.split('-')[0].trim();
                        if (root.itemName?.toUpperCase().match(/^L\d+/)) return root.itemName.split('-')[0].trim().toUpperCase();
                    }
                }

                // FALLBACK: Original logic using enquiryData.leadJobPrefix
                const curr = enquiryData.leadJobPrefix || '';
                if (!curr) return '';
                if (curr.match(/^L\d+/)) return curr.split('-')[0].trim();

                const hierarchy = enquiryData.divisionsHierarchy || [];
                const normalize = s => (s || '').toLowerCase().trim();
                const target = normalize(curr);

                const node = hierarchy.find(d => {
                    const name = normalize(d.itemName);
                    const clean = name.replace(/^(l\d+\s*-\s*)/, '').trim();
                    return name === target || clean === target;
                });

                if (node) {
                    let root = node;
                    let rootSafety = 0;
                    let rootVisited = new Set();
                    while ((root.parentId || root.ParentID) && (root.parentId || root.ParentID) !== '0' && (root.parentId || root.ParentID) !== 0 && rootSafety < 20) {
                        const rId = String(root.id || root.ItemID);
                        if (rootVisited.has(rId)) break;
                        rootVisited.add(rId);
                        const pId = String(root.parentId || root.ParentID);
                        const parent = hierarchy.find(p => String(p.id || p.ItemID) === pId);
                        if (parent) root = parent;
                        else break;
                        rootSafety++;
                    }
                    if (root.leadJobCode || root.LeadJobCode) return root.leadJobCode || root.LeadJobCode;
                    if (root.itemName && root.itemName.match(/^L\d+/)) {
                        return root.itemName.split('-')[0].trim();
                    }
                }
                return curr;
            })(),
            requestNo: enquiryData.enquiry.RequestNo,
            validityDays,
            preparedBy: preparedBy,
            preparedByEmail: currentUser?.email || currentUser?.EmailId,
            ...clauses,
            ...clauseContent,
            totalAmount: grandTotal,
            customClauses,
            clauseOrder: orderedClauses,
            quoteDate,
            customerReference,
            quoteType: quoteTypeList.filter(Boolean).join(', '),
            subject,
            signatory,
            signatoryDesignation,
            toName: (() => {
                const tabs = calculatedTabs && calculatedTabs.length > 0 ? calculatedTabs : effectiveQuoteTabs;
                if (!tabs || tabs.length < 2) return toName;
                const tn = (toName || '').trim();
                const key = collapseSpacesLower(stripQuoteJobPrefix(tn));
                const pool = jobsPool.length > 0 ? jobsPool : enquiryData?.divisionsHierarchy || [];
                const recipientIsInternalJobName = pool.some((j) => {
                    const jn = collapseSpacesLower(stripQuoteJobPrefix(j.itemName || j.DivisionName || ''));
                    return jn === key && jn.length > 0;
                });
                // External recipient: ToName always stays the company name; internal job-as-customer may use lead label on subjob tabs.
                if (!recipientIsInternalJobName) return toName;
                const firstId = String(tabs[0]?.id);
                if (String(activeQuoteTab) === firstId) return toName;
                const parentLabel = stripQuoteJobPrefix(tabs[0]?.label || tabs[0]?.name || '').trim();
                return parentLabel || toName;
            })(),
            toAddress,
            toPhone,
            toEmail,
            toFax,
            toAttention,
            leadJob: (() => {
                if (selectedLeadId && pricingData?.jobs) {
                    const found = pricingData.jobs.find(j => String(j.id || j.ItemID) === String(selectedLeadId));
                    if (found) return found.itemName || found.ItemName || found.DivisionName;
                }
                return enquiryData.leadJobPrefix || '';
            })(),
            ownJob: (() => {
                const tabs = calculatedTabs && calculatedTabs.length > 0 ? calculatedTabs : effectiveQuoteTabs;
                if (activeQuoteTab && tabs) {
                    const tab = tabs.find(t => String(t.id) === String(activeQuoteTab));
                    if (tab) return tab.name || tab.label || '';
                }
                return '';
            })(),
            status: 'Saved'
        };
    }, [enquiryData, selectedJobs, pricingSummary, currentUser, pricingData, validityDays, preparedBy, clauses, clauseContent, grandTotal, customClauses, orderedClauses, quoteDate, customerReference, quoteTypeList, subject, signatory, signatoryDesignation, toName, toAddress, toPhone, toEmail, toFax, toAttention, activeQuoteTab, calculatedTabs, effectiveQuoteTabs, selectedLeadId, jobsPool]);



    const saveQuote = useCallback(async (isAutoSave = false, suppressCollisionAlert = false) => {
        if (!enquiryData) return null;

        // Validation for mandatory fields
        // CRITICAL: We check for TRUTHILY true to avoid 'event' objects from onClick triggering an 'auto-save' skip
        if (isAutoSave !== true) {
            // If already saved, we don't allow re-saving (Updates), only Revisions
            if (quoteId) {
                alert("This quote is already saved and cannot be edited directly. Please use the 'Revision' button to make changes.");
                return null;
            }

            if (!validateMandatoryFields()) return null;

            // Warning for the VERY FIRST save of a draft
            const confirmed = window.confirm(
                "Please ensure all the details are properly filled to generate the quote. Once saved, edit function will be disabled.\n\n" +
                "Do you want to proceed?"
            );
            if (!confirmed) return null;
        }

        if (!isAutoSave) setSaving(true);
        try {
            // 1. Get Base Payload first (Now handles its own robust division and lead job detection)
            const basePayload = getQuotePayload();
            const { divisionCode: effectiveDivisionCode, leadJobPrefix: effectiveLeadJobPrefix } = basePayload;

            console.log('[saveQuote] Derived context:', { effectiveDivisionCode, effectiveLeadJobPrefix });

            // Use the payload as-is for the actual save request
            const savePayload = { ...basePayload };

            if (!quoteId && existingQuotes.length > 0) {
                // Check if any existing quote has the same customer AND same lead job branch AND same division
                const sameCustomerQuote = existingQuotes.find(q => {
                    const matchCustomer = normalize(q.ToName) === normalize(basePayload.toName);

                    // Branch Isolation: Match the prefix exactly
                    // q.QuoteNumber part 2 (Ref) is usually 'RequestNo-LCode' or just 'RequestNo'
                    const qRef = q.QuoteNumber?.split('/')[2]?.toUpperCase() || '';
                    const myRefSuffix = String(effectiveLeadJobPrefix || '').toUpperCase();
                    const enquiryNo = String(enquiryData.enquiry.RequestNo);

                    let matchLeadJob = false;
                    if (myRefSuffix) {
                        // If I have an L-code (e.g. L1), match 19-L1 or L1
                        matchLeadJob = qRef === `${enquiryNo}-${myRefSuffix}` || qRef === myRefSuffix;
                    } else {
                        // If I have no specific suffix, only match the bare enquiry number
                        matchLeadJob = qRef === enquiryNo;
                    }

                    // STRICT DIVISION MATCH (e.g. BMS, ELE...)
                    let matchDivision = false;
                    if (q.QuoteNumber) {
                        const quoteParts = q.QuoteNumber.split('/');
                        if (quoteParts.length >= 2) {
                            const existingQuoteDivision = quoteParts[1];
                            matchDivision = existingQuoteDivision === effectiveDivisionCode;
                        }
                    }

                    return matchCustomer && matchLeadJob && matchDivision;
                });

                if (sameCustomerQuote) {
                    if (!suppressCollisionAlert) {
                        const branchMsg = effectiveLeadJobPrefix ? `branch ${effectiveLeadJobPrefix}` : 'the primary project branch';
                        alert(`A quote (${sameCustomerQuote.QuoteNumber}) already exists for this enquiry, customer, division, and ${branchMsg}.\n\nPlease select and REVISE the existing quote instead of creating a new one.`);
                    }
                    if (!isAutoSave) setSaving(false);
                    return { isCollision: true, existingQuote: sameCustomerQuote };
                }
            }

            let res;
            if (quoteId) {
                res = await fetch(`${API_BASE}/api/quotes/${quoteId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(savePayload)
                });
            } else {
                res = await fetch(`${API_BASE}/api/quotes`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(savePayload)
                });
            }

            if (res.ok) {
                const data = await res.json();
                const newId = data.id ?? data.ID ?? data.Id;
                const newQn = data.quoteNumber ?? data.QuoteNumber ?? '';

                // CRITICAL FIX: Update existingQuotes locally FIRST to prevent useEffect race condition
                setExistingQuotes(prev => [
                    ...prev,
                    {
                        ID: newId,
                        QuoteNumber: newQn,
                        ToName: toName,
                        RevisionNo: data.revisionNo ?? data.RevisionNo ?? 0,
                        Status: 'Saved',
                        QuoteDate: quoteDate,
                        PreparedBy: preparedBy,
                        TotalAmount: grandTotal,
                        OwnJob: savePayload.ownJob, // CRITICAL for AutoLoad matching
                        LeadJob: savePayload.leadJob  // CRITICAL for AutoLoad matching
                    }
                ]);

                /* Scoped GET does not re-run after save; without this row AutoLoad sees empty tabQuotes and clears Quote Ref → Draft. */
                if (scopedEnquiryQuotesParams) {
                    const optimisticRow = {
                        ID: newId,
                        QuoteNumber: newQn,
                        ToName: toName,
                        RevisionNo: data.revisionNo ?? data.RevisionNo ?? 0,
                        Status: 'Saved',
                        QuoteDate: quoteDate,
                        PreparedBy: preparedBy,
                        TotalAmount: grandTotal,
                        OwnJob: savePayload.ownJob,
                        LeadJob: savePayload.leadJob,
                    };
                    setQuoteScopedForPanel((prev) => {
                        const idStr = String(newId ?? '');
                        if (!idStr || idStr === 'undefined') return prev;
                        if (prev.some((q) => String(quoteRowId(q) ?? '') === idStr)) return prev;
                        return [...prev, optimisticRow];
                    });
                }

                console.log('[saveQuote] Success! Received data:', data);
                if (newId != null && newId !== '') {
                    console.log('[saveQuote] Setting QuoteId:', newId);
                    setQuoteId(newId);
                    // Proactive Sync with Registry
                    if (activeQuoteTab) {
                        if (!tabStateRegistry.current[activeQuoteTab]) tabStateRegistry.current[activeQuoteTab] = {};
                        tabStateRegistry.current[activeQuoteTab].quoteId = newId;
                        tabStateRegistry.current[activeQuoteTab].quoteNumber = newQn;
                    }
                }
                if (newQn) {
                    console.log('[saveQuote] Setting QuoteNumber:', newQn);
                    setQuoteNumber(newQn);
                }

                if (!isAutoSave) {
                    alert('Quote saved successfully!');
                }

                // --- TAB STATE SYNC: Ensure the new ID is stored in the registry immediately ---
                if (activeQuoteTab) {
                    if (!tabStateRegistry.current[activeQuoteTab]) tabStateRegistry.current[activeQuoteTab] = {};
                    tabStateRegistry.current[activeQuoteTab].quoteId = newId;
                    tabStateRegistry.current[activeQuoteTab].quoteNumber = newQn;
                }

                // Upload any pending files now that we have a Quote ID
                if (pendingFiles.length > 0 && newId != null && newId !== '') {
                    console.log('[saveQuote] Uploading pending files...', pendingFiles.length);
                    await uploadFiles(pendingFiles, newId);
                    setPendingFiles([]); // Clear queue
                }

                // Wait a moment for DB commit before calling fetchExistingQuotes to prevent race condition
                console.log('[saveQuote] Waiting 500ms for DB sync...');
                await new Promise(resolve => setTimeout(resolve, 500));

                let refreshed = null;
                if (enquiryData) {
                    refreshed = await fetchExistingQuotes(enquiryData.enquiry.RequestNo);
                }
                const match = Array.isArray(refreshed)
                    ? refreshed.find((q) => String(quoteRowId(q) ?? '') === String(newId ?? ''))
                    : null;
                if (match) {
                    queueMicrotask(() =>
                        loadQuote(match, { preserveRecipient: true, skipPreparedSignatory: true })
                    );
                }

                return { ...data, id: newId, quoteNumber: newQn };
            } else {
                const errorData = await res.json().catch(() => ({}));
                console.error('[saveQuote] Server Error:', res.status, errorData);
                if (!isAutoSave) alert(`Failed to save quote: ${errorData.error || errorData.details || res.statusText}`);
                else console.warn('[saveQuote] Auto-save failed on server.');
                return null;
            }
        } catch (err) {
            console.error('Error saving quote:', err);
            if (!isAutoSave) alert('Failed to save quote');
            return null;
        } finally {
            if (!isAutoSave) setSaving(false);
        }
    }, [enquiryData, toName, quoteId, existingQuotes, getQuotePayload, calculatedTabs, pricingData, selectedJobs, fetchExistingQuotes, validateMandatoryFields, grandTotal, scopedEnquiryQuotesParams]);

    // Paste Handle
    useEffect(() => {
        const handleGlobalPaste = (e) => {
            // Check for files in clipboard
            const items = e.clipboardData?.items;
            const filesToUpload = [];

            if (items) {
                for (let i = 0; i < items.length; i++) {
                    if (items[i].kind === 'file') {
                        const file = items[i].getAsFile();
                        if (file) filesToUpload.push(file);
                    }
                }
            }

            // Fallback for some browsers
            if (filesToUpload.length === 0 && e.clipboardData?.files?.length > 0) {
                for (let i = 0; i < e.clipboardData.files.length; i++) {
                    filesToUpload.push(e.clipboardData.files[i]);
                }
            }

            if (filesToUpload.length > 0) {
                if (!quoteId) {
                    if (!enquiryData || !toName) {
                        alert('Please select an enquiry and customer first to create a draft.');
                        return;
                    }

                    // Queue data as pending files
                    console.log('[Paste] Queuing files to pending list...');
                    uploadFiles(filesToUpload);
                    return;
                }

                e.preventDefault();
                console.log('[Paste] Detected files:', filesToUpload.length);
                uploadFiles(filesToUpload);
            }
        };

        window.addEventListener('paste', handleGlobalPaste);
        return () => window.removeEventListener('paste', handleGlobalPaste);
    }, [quoteId, uploadFiles, enquiryData, toName, saveQuote]);

    /** Placed stamps are per enquiry + lead job context + customer (not per user only). */
    const digitalStampScope = React.useMemo(() => {
        const requestNo = enquiryData?.enquiry?.RequestNo;
        if (!requestNo) return null;
        const customer = (toName || '').trim();
        const activeTabObj = (calculatedTabs || []).find((t) => String(t.id) === String(activeQuoteTab));
        const tabJobLabel = (activeTabObj?.label || activeTabObj?.name || '').trim();
        const leadPrefix = (enquiryData?.leadJobPrefix || '').trim();
        const leadKey = [leadPrefix, tabJobLabel].filter(Boolean).join(' | ') || tabJobLabel || leadPrefix;
        return { requestNo, leadKey, customer };
    }, [enquiryData?.enquiry?.RequestNo, enquiryData?.leadJobPrefix, toName, activeQuoteTab, quoteTabsFingerprint]);

    const stampScopeRef = useRef(null);
    useEffect(() => {
        stampScopeRef.current = digitalStampScope;
    }, [digitalStampScope]);

    useEffect(() => {
        if (!digitalStampScope) {
            setQuoteDigitalStamps([]);
            return;
        }
        const loaded = loadStampsForEnquiry(
            digitalStampScope.requestNo,
            digitalStampScope.leadKey,
            digitalStampScope.customer
        );
        setQuoteDigitalStamps((prev) => (JSON.stringify(prev) === JSON.stringify(loaded) ? prev : loaded));
    }, [digitalStampScope]);

    const commitQuoteDigitalStamps = useCallback((updater) => {
        setQuoteDigitalStamps((prev) => {
            const next = typeof updater === 'function' ? updater(prev) : updater;
            const ctx = stampScopeRef.current;
            if (ctx?.requestNo) saveStampsForEnquiry(ctx.requestNo, next, ctx.leadKey, ctx.customer);
            return next;
        });
    }, []);

    const handlePlaceDigitalStamp = useCallback(
        ({ imageDataUrl, sheetIndex, displayName, designation }) => {
            const iso = new Date().toISOString();
            const email = currentUser?.EmailId || currentUser?.email || '';
            commitQuoteDigitalStamps((prev) => [
                ...prev,
                {
                    id: globalThis.crypto?.randomUUID?.() || `st-${Date.now()}`,
                    sheetIndex: Math.max(0, Number(sheetIndex) || 0),
                    xPct: 82,
                    yPct: 38,
                    imageDataUrl,
                    displayName: (displayName || '').trim(),
                    designation: (designation || '').trim(),
                    placedAtIso: iso,
                    verificationCode: makeVerificationCode(email, iso),
                },
            ]);
        },
        [currentUser, commitQuoteDigitalStamps]
    );

    const handleMoveDigitalStamp = useCallback(
        (id, xPct, yPct) => {
            commitQuoteDigitalStamps((prev) => prev.map((s) => (s.id === id ? { ...s, xPct, yPct } : s)));
        },
        [commitQuoteDigitalStamps]
    );

    const handleRemoveDigitalStamp = useCallback(
        (id) => {
            commitQuoteDigitalStamps((prev) => prev.filter((s) => s.id !== id));
        },
        [commitQuoteDigitalStamps]
    );

    /** Profile menu → Manage signatures → Place on page (when Quote tab is active). */
    useEffect(() => {
        const onPlaceFromProfile = (ev) => {
            const d = ev?.detail;
            if (!d?.imageDataUrl) return;
            handlePlaceDigitalStamp({
                imageDataUrl: d.imageDataUrl,
                sheetIndex: d.sheetIndex ?? 0,
                displayName: (d.displayName || '').trim(),
                designation: (d.designation || '').trim(),
            });
        };
        window.addEventListener(EMS_QUOTE_PLACE_STAMP_EVENT, onPlaceFromProfile);
        return () => window.removeEventListener(EMS_QUOTE_PLACE_STAMP_EVENT, onPlaceFromProfile);
    }, [handlePlaceDigitalStamp]);

    // Print quote
    const printQuote = () => {
        const printRoot = document.getElementById('quote-print-root');
        const printContent = document.getElementById('quote-preview');
        const fragmentHtml = printRoot ? printRoot.innerHTML : printContent ? printContent.innerHTML : '';
        if (fragmentHtml) {
            const printWindow = window.open('', '_blank');
            printWindow.document.write(
                buildQuotePrintDocumentHtml(printWithHeader, fragmentHtml, tableStyles, '')
            );
            printWindow.document.close();
            printWindow.focus();

            // Increased delay to ensure rendering matches styles
            setTimeout(() => {
                printWindow.print();
                printWindow.close();
            }, 500);
        }
    };

    /** Vector PDF via server Puppeteer (selectable text — not canvas screenshots). */
    const downloadPDF = async () => {
        const printRoot = document.getElementById('quote-print-root');
        const printContent = document.getElementById('quote-preview');
        const fragmentHtml = printRoot ? printRoot.innerHTML : printContent ? printContent.innerHTML : '';
        if (!fragmentHtml) return;

        const envOrigin = typeof import.meta !== 'undefined' && import.meta.env?.VITE_SERVER_ORIGIN;
        const serverOrigin = envOrigin
            ? String(envOrigin).replace(/\/$/, '')
            : `${window.location.protocol}//${window.location.hostname}:5002`;

        setIsUploading(true);
        try {
            const html = buildQuotePrintDocumentHtml(printWithHeader, fragmentHtml, tableStyles, serverOrigin, true);
            const fname = `Quote_${quoteNumber.replace(/\//g, '_')}.pdf`;
            const res = await fetch(`${API_BASE}/api/quote-pdf/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ html, filename: fname }),
            });
            if (!res.ok) {
                let detail = res.statusText;
                try {
                    const j = await res.json();
                    detail = j.message || j.error || detail;
                } catch {
                    /* ignore */
                }
                throw new Error(detail);
            }
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fname;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('PDF generation error:', err);
            alert(
                `PDF download failed: ${err.message || err}\n\n` +
                    'Ensure the API server is running and Puppeteer is installed (cd server && npm install). ' +
                    'You can still use Print → Save as PDF for a vector file.'
            );
        } finally {
            setIsUploading(false);
        }
    };



    // Helper to format date as DD-MMM-YYYY
    const formatDate = (dateString) => {
        if (!dateString) return '';
        try {
            return format(new Date(dateString), 'dd-MMM-yyyy');
        } catch (e) {
            return dateString;
        }
    };

    // Calculate validity date
    const getValidityDate = () => {
        if (!quoteDate) return '';
        const date = new Date(quoteDate);
        date.setDate(date.getDate() + parseInt(validityDays || 0));
        return formatDate(date);
    };

    // Helper: Check if job is descendant of ancestor (Recursive) - Scoped to Component
    const isDescendantOf = (jobName, ancestorId) => {
        if (!pricingData || !pricingData.jobs) return false;
        const job = pricingData.jobs.find(j => j.itemName === jobName);
        if (!job) return false;
        if (job.parentId === ancestorId) return true;
        if (job.parentId) {
            const parent = pricingData.jobs.find(j => j.id === job.parentId);
            if (parent) return isDescendantOf(parent.itemName, ancestorId);
        }
        return false;
    };

    // Custom styles for CreatableSelect
    const customStyles = {
        control: (base) => ({
            ...base,
            minHeight: '34px',
            fontSize: '13px',
            padding: '0 4px',
            border: '1px solid #cbd5e1',
            borderRadius: '4px',
            boxShadow: 'none',
            '&:hover': {
                borderColor: '#a0aec0',
            },
        }),
        valueContainer: (base) => ({
            ...base,
            padding: '0 4px',
        }),
        input: (base) => ({
            ...base,
            margin: 0,
            padding: 0,
        }),
        placeholder: (base) => ({
            ...base,
            color: '#9ca3af',
        }),
        singleValue: (base) => ({
            ...base,
            color: '#1f2937',
        }),
        option: (base, state) => ({
            ...base,
            fontSize: '13px',
            backgroundColor: state.isFocused ? '#e2e8f0' : 'white',
            color: '#1f2937',
            '&:active': {
                backgroundColor: '#cbd5e1',
            },
        }),
    };


    const computedPreparedByOptions = React.useMemo(() => {
        if (!usersList || usersList.length === 0 || !enquiryData) return [];

        // 1. Resolve Active Division Name
        let activeFull = '';
        const activeTabObj = (calculatedTabs || []).find(t => String(t.id) === String(activeQuoteTab));
        const pool = (pricingData?.jobs && pricingData.jobs.length > 0 ? pricingData.jobs : (enquiryData?.divisionsHierarchy || []));

        if (activeTabObj) {
            const job = pool.find(j => String(j.id || j.ItemID || j.ID) === String(activeTabObj.realId));
            if (job) activeFull = (job.itemName || job.DivisionName || job.ItemName || '');
        }

        if (!activeFull) {
            const leadP = (enquiryData?.leadJobPrefix || '').toUpperCase();
            const leadJob = pool.find(j => {
                const name = (j.itemName || j.DivisionName || j.ItemName || '').toUpperCase();
                const code = (j.leadJobCode || j.LeadJobCode || '').toUpperCase();
                return (leadP && (name.startsWith(leadP) || code === leadP));
            });
            if (leadJob) activeFull = (leadJob.itemName || leadJob.DivisionName || leadJob.ItemName || '');
        }

        const activeLower = activeFull.toLowerCase();
        const activeClean = activeLower.replace(/^(l\d+|sub job)\s*-\s*/, '').replace(/-\d+$/, '').trim();
        const isInteriorsCtx = activeClean.includes('interiors');
        const isCivilCtx = activeClean.includes('civil') && !isInteriorsCtx;

        // 2. Strict Filter to matching department
        const results = usersList.filter(u => {
            const dNorm = (u.Department || '').trim().toLowerCase();

            // STRICT SEPARATION:
            if (isInteriorsCtx) return dNorm.includes('interiors');

            if (isCivilCtx) {
                const isMaintCtx = activeClean.includes('maint');
                const isProjectCtx = activeClean.includes('project');

                if (isMaintCtx) return dNorm.includes('civil') && dNorm.includes('maint');
                if (isProjectCtx) return dNorm.includes('civil') && dNorm.includes('project');

                return dNorm.includes('civil');
            }

            // Fallback for other divisions (BMS, Electrical, etc.)
            return dNorm && activeClean && (dNorm === activeClean || dNorm.includes(activeClean) || activeClean.includes(dNorm));
        });

        // Always include current user for safety
        const currentMail = (currentUser?.EmailId || '').toLowerCase().replace(/@almcg\.com/g, '@almoayyedcg.com').trim();
        const hasSelf = results.some(u => (u.EmailId || '').toLowerCase().replace(/@almcg\.com/g, '@almoayyedcg.com').trim() === currentMail);

        let finalOutput = results;
        if (!hasSelf && currentUser) {
            const self = usersList.find(u => (u.EmailId || '').toLowerCase().replace(/@almcg\.com/g, '@almoayyedcg.com').trim() === currentMail);
            if (self) finalOutput = [self, ...results];
        }

        return finalOutput
            .map((u) => ({
                value: u.FullName,
                label: u.FullName,
                type: 'OwnJob',
                designation: u.Designation || '',
                mobileNumber: (u.MobileNumber != null ? String(u.MobileNumber) : '').trim(),
            }))
            .filter((v, i, a) => a.findIndex((t) => t.value === v.value) === i);
    }, [usersList, currentUser, enquiryData, activeQuoteTab, calculatedTabs, pricingData]);

    const computedSignatoryOptions = React.useMemo(() => {
        if (!usersList || usersList.length === 0 || !enquiryData) return [];

        // 1. Resolve Active Division Context
        let activeFull = '';
        const activeTabObj = (calculatedTabs || []).find(t => String(t.id) === String(activeQuoteTab));
        const pool = (pricingData?.jobs && pricingData.jobs.length > 0 ? pricingData.jobs : (enquiryData?.divisionsHierarchy || []));

        if (activeTabObj) {
            const job = pool.find(j => String(j.id || j.ItemID || j.ID) === String(activeTabObj.realId));
            if (job) activeFull = (job.itemName || job.DivisionName || job.ItemName || '');
        }

        if (!activeFull) {
            const leadP = (enquiryData?.leadJobPrefix || '').toUpperCase();
            const leadJob = pool.find(j => {
                const name = (j.itemName || j.DivisionName || j.ItemName || '').toUpperCase();
                const code = (j.leadJobCode || j.LeadJobCode || '').toUpperCase();
                return (leadP && (name.startsWith(leadP) || code === leadP));
            });
            if (leadJob) activeFull = (leadJob.itemName || leadJob.DivisionName || leadJob.ItemName || '');
        }

        const activeLower = activeFull.toLowerCase();
        const activeClean = activeLower.replace(/^(l\d+|sub job)\s*-\s*/, '').replace(/-\d+$/, '').trim();
        const isAdmin = ['Admin', 'Admins'].includes(currentUser?.role || currentUser?.Roles);

        console.log('[Signatory Debug] Filtering for division:', activeClean);

        // 2. Extract CC Mails for this division branch
        const divisionEmails = Array.isArray(enquiryData.divisionEmails) ? enquiryData.divisionEmails : [];
        if (divisionEmails.length === 0) {
            return computedPreparedByOptions;
        }
        let ccMailsList = [];
        divisionEmails.forEach(div => {
            const divDept = (div.departmentName || '').trim().toLowerCase();
            const divItem = (div.itemName || '').toLowerCase();

            let isMatch = isAdmin;
            if (!isMatch && activeClean) {
                const isElecCtx = activeClean.includes('elec') || activeClean.includes('elm');
                const isDivElec = divDept.includes('elec') || divItem.includes('elec') || divDept.includes('electrical');

                if (isElecCtx) {
                    // Electrical Maintenance context: Must match electrical indicators in div data
                    isMatch = isDivElec && (divDept.includes('ac maint') || divItem.includes('ac maint') || divDept.includes('elm'));
                } else if (activeClean.includes('ac maint')) {
                    // Pure AC Maint (HVAC) context: Should NOT match electrical entries
                    isMatch = (divDept.includes('ac maint') || divItem.includes('ac maint')) && !isDivElec;
                } else {
                    // Regular fallback match
                    isMatch = (divDept === activeClean) || divDept.includes(activeClean) || activeClean.includes(divDept) ||
                        divItem.includes(activeClean);
                }
            }

            if (!isMatch && activeClean) {
                if (activeClean.includes('interiors') && (divDept.includes('interiors') || divItem.includes('interiors'))) isMatch = true;
                if (activeClean.includes('civil') && (divDept.includes('civil') || divItem.includes('civil'))) isMatch = true;
            }

            if (isMatch && div.ccMailIds) {
                const mails = div.ccMailIds.toLowerCase().replace(/@almcg\.com/g, '@almoayyedcg.com').split(',').map(m => m.trim().toLowerCase()).filter(Boolean);
                ccMailsList.push(...mails);
            }
        });

        const uniqueCCMails = [...new Set(ccMailsList)];
        console.log('[Signatory Debug] Unique CC Mails mapped:', uniqueCCMails);
        if (uniqueCCMails.length === 0) {
            return computedPreparedByOptions;
        }

        const matchedItems = usersList.filter(u => {
            const uMail = (u.EmailId || '').toLowerCase().replace(/@almcg\.com/g, '@almoayyedcg.com').trim();
            const uName = (u.FullName || '').toLowerCase().trim();
            return (uMail && uniqueCCMails.includes(uMail)) || (uName && uniqueCCMails.includes(uName));
        }).map(u => ({ value: u.FullName, label: u.FullName, designation: u.Designation }));

        // Deduplicate and Prioritize Managers/Heads/Chiefs to ensure best default signatory
        const uniqueItems = matchedItems.filter((v, i, a) => a.findIndex(t => (t.value === v.value)) === i);

        const sortedItems = uniqueItems.sort((a, b) => {
            const aDes = (a.designation || '').toLowerCase();
            const bDes = (b.designation || '').toLowerCase();
            const isAManager = aDes.includes('manager') || aDes.includes('chief') || aDes.includes('head') || aDes.includes('director');
            const isBManager = bDes.includes('manager') || bDes.includes('chief') || bDes.includes('head') || bDes.includes('director');

            if (isAManager && !isBManager) return -1;
            if (!isAManager && isBManager) return 1;
            return 0;
        });

        console.log('[Signatory Debug] Final Sorted Signatories found:', sortedItems.length);
        return sortedItems.length > 0 ? sortedItems : computedPreparedByOptions;
    }, [enquiryData, usersList, currentUser, activeQuoteTab, calculatedTabs, pricingData, computedPreparedByOptions]);

    /** Prepared-by line on quote preview: mobile from Master_ConcernedSE.MobileNumber (users list / enquiry options / logged-in profile). */
    const preparedByContactFromMaster = React.useMemo(() => {
        const name = (preparedBy || '').trim();
        if (!name) return '';
        const norm = (s) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
        const n = norm(name);
        const fromUsers = usersList.find((x) => norm(x.FullName) === n);
        const uMob = (fromUsers?.MobileNumber != null ? String(fromUsers.MobileNumber) : '').trim();
        if (uMob) return uMob;
        const po = preparedByOptions.find(
            (o) => norm(String(o.value || '')) === n || norm(String(o.label || '')) === n
        );
        const pMob = (po?.mobileNumber != null ? String(po.mobileNumber) : '').trim();
        if (pMob) return pMob;
        const selfName = (currentUser?.FullName || currentUser?.name || '').trim();
        if (norm(selfName) === n) {
            const cMob = (currentUser?.MobileNumber != null ? String(currentUser.MobileNumber) : '').trim();
            if (cMob) return cMob;
        }
        return '';
    }, [preparedBy, usersList, preparedByOptions, currentUser]);

    const attentionSelectOptions = React.useMemo(() => {
        const finish = (rawList) => {
            const norm = (Array.isArray(rawList) ? rawList : [])
                .map((s) => String(s || '').trim())
                .filter(Boolean);
            let sig = '';
            try {
                sig = [...norm].sort().join('\x1e');
            } catch {
                sig = `n:${norm.length}`;
            }
            if (!norm.length) {
                attentionOptionsCacheRef.current = { sig: '', arr: EMPTY_DEPT_ATTENTION_NAMES };
                return EMPTY_DEPT_ATTENTION_NAMES;
            }
            const c = attentionOptionsCacheRef.current;
            if (sig === c.sig && c.arr.length === norm.length) return c.arr;
            attentionOptionsCacheRef.current = { sig, arr: norm };
            return norm;
        };

        if (!toName || !enquiryData) {
            attentionOptionsCacheRef.current = { sig: '', arr: EMPTY_DEPT_ATTENTION_NAMES };
            return EMPTY_DEPT_ATTENTION_NAMES;
        }
        const toNameClean = collapseSpacesLower(stripQuoteJobPrefix(toName));
        const toKey = normalizeCustomerKey(toName);
        const intAttEarly = resolveQuoteInternalAttentionFlexible(enquiryData, toName);
        const hierarchyClean = new Set(
            (enquiryData.divisionsHierarchy || []).map(n =>
                collapseSpacesLower(stripQuoteJobPrefix(n.itemName || n.DivisionName || ''))
            )
        );
        const profileClean = new Set(
            (enquiryData.availableProfiles || []).map(p =>
                collapseSpacesLower(stripQuoteJobPrefix(p.itemName || ''))
            )
        );
        const pricingClean = new Set(
            (pricingData?.jobs || [])
                .filter(j => j.visible !== false)
                .map(j => collapseSpacesLower(stripQuoteJobPrefix(j.itemName || j.DivisionName || j.ItemName || '')))
                .filter(Boolean)
        );
        const isInternalCustomer =
            intAttEarly != null ||
            hierarchyClean.has(toNameClean) ||
            profileClean.has(toNameClean) ||
            [...pricingClean].some(
                pc =>
                    pc === toNameClean ||
                    (toKey &&
                        (normalizeCustomerKey(pc) === toKey ||
                            pc.includes(toNameClean) ||
                            toNameClean.includes(pc)))
            );

        if (isInternalCustomer) {
            const intAtt = intAttEarly || resolveQuoteInternalAttentionFlexible(enquiryData, toName);
            let list = Array.isArray(intAtt?.options) ? intAtt.options.filter(Boolean) : [];
            if (list.length === 0 && deptAttentionNames.length) {
                list = [...deptAttentionNames];
            }
            return finish(list);
        }
        const extMap = enquiryData.externalAttentionOptionsByCustomer || {};
        let extList = extMap[toName] || extMap[toName.trim()];
        if (!extList) {
            const tn = normalize(toName);
            const fk = Object.keys(extMap).find(k => normalize(k) === tn);
            if (fk) extList = extMap[fk];
        }
        if (Array.isArray(extList) && extList.length > 0) return finish(extList);
        const ccMap = enquiryData.customerContacts || {};
        const ccKey = ccMap[toName] ? toName : Object.keys(ccMap).find(k => normalize(k) === normalize(toName));
        const cc = ccKey ? ccMap[ccKey] : null;
        if (cc) return finish(String(cc).split(',').map(s => s.trim()).filter(Boolean));
        const rf = enquiryData.enquiry?.ReceivedFrom;
        if (rf) return finish(String(rf).split(',').map(s => s.trim()).filter(Boolean));
        return finish([]);
    }, [enquiryData, toName, pricingStableSig, deptAttentionNames]);

    const enquiryLoadSig = React.useMemo(
        () =>
            [
                String(enquiryData?.enquiry?.RequestNo || ''),
                String((enquiryData?.divisionsHierarchy || []).length),
                String((enquiryData?.availableProfiles || []).length),
                String(enquiryData?.leadJobPrefix || ''),
            ].join('\x1e'),
        [
            enquiryData?.enquiry?.RequestNo,
            enquiryData?.divisionsHierarchy?.length,
            enquiryData?.availableProfiles?.length,
            enquiryData?.leadJobPrefix,
        ]
    );

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const ed = enquiryDataRef.current;
            if (!toName.trim() || !ed) {
                setDeptAttentionNames((p) => (p.length === 0 ? p : EMPTY_DEPT_ATTENTION_NAMES));
                return;
            }
            if (!isQuoteInternalCustomer(ed, pricingData?.jobs, toName)) {
                setDeptAttentionNames((p) => (p.length === 0 ? p : EMPTY_DEPT_ATTENTION_NAMES));
                return;
            }
            const flex = resolveQuoteInternalAttentionFlexible(ed, toName);
            if (flex?.options?.length) {
                setDeptAttentionNames((p) => (p.length === 0 ? p : EMPTY_DEPT_ATTENTION_NAMES));
                return;
            }
            try {
                const res = await fetch(
                    `${API_BASE}/api/quotes/attention-by-department?dept=${encodeURIComponent(toName)}`
                );
                const arr = res.ok ? await res.json() : [];
                if (!cancelled && Array.isArray(arr)) {
                    const next = arr.map((x) => String(x || '').trim()).filter(Boolean);
                    setDeptAttentionNames((prev) => {
                        if (prev.length === next.length && prev.every((v, i) => v === next[i])) return prev;
                        return next;
                    });
                }
            } catch {
                if (!cancelled) {
                    setDeptAttentionNames((p) => (p.length === 0 ? p : EMPTY_DEPT_ATTENTION_NAMES));
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [toName, enquiryLoadSig, pricingStableSig]);

    const showAttentionAsSelect = React.useMemo(
        () =>
            isQuoteInternalCustomer(enquiryData, pricingData?.jobs, toName) ||
            attentionSelectOptions.length > 0,
        [enquiryData, pricingData?.jobs, toName, attentionSelectOptions]
    );

    const attentionSelectMerged = React.useMemo(() => {
        if (isQuoteInternalCustomer(enquiryData, pricingData?.jobs, toName)) {
            return attentionSelectOptions;
        }
        return [...new Set([...attentionSelectOptions, toAttention].filter(Boolean))];
    }, [enquiryData, pricingData?.jobs, toName, attentionSelectOptions, toAttention]);

    const attentionOptionsContentSig = React.useMemo(() => {
        if (!attentionSelectOptions.length) return '';
        try {
            return attentionSelectOptions.map((s) => String(s || '').trim()).sort().join('\x1e');
        } catch {
            return `n:${attentionSelectOptions.length}`;
        }
    }, [attentionSelectOptions]);

    // Drop stale Attention values that are not in the dropdown list (internal customers only).
    // Do not depend on `enquiryData` / `attentionSelectOptions` identity — they churned and re-fired this every render.
    useEffect(() => {
        const ed = enquiryDataRef.current;
        if (!toName?.trim() || !ed) return;
        if (!isQuoteInternalCustomer(ed, pricingData?.jobs, toName)) return;
        const allowed = attentionSelectOptions;
        if (allowed.length === 0) return;
        const cur = String(toAttention || '').trim();
        if (!cur) return;
        if (allowed.some((o) => normLooseAttention(o) === normLooseAttention(cur))) return;
        const intAtt = resolveQuoteInternalAttentionFlexible(ed, toName);
        const next = String(intAtt?.defaultAttention || allowed[0] || '').trim();
        setToAttention((prev) => {
            const p = String(prev || '').trim();
            if (normLooseAttention(p) === normLooseAttention(next)) return prev;
            return next;
        });
    }, [toName, toAttention, attentionOptionsContentSig, pricingStableSig]);

    // --- READ-ONLY TAB LOGIC ---
    const activeGlobalTabObj = (effectiveQuoteTabs || []).find(t => String(t.id) === String(activeQuoteTab));
    const isEditingRestricted = activeGlobalTabObj && !activeGlobalTabObj.isSelf;
    const activeGlobalTabName = activeGlobalTabObj ? (activeGlobalTabObj.name || activeGlobalTabObj.label) : 'Project';

    return (
        <div style={{ display: 'flex', height: 'calc(100vh - 80px)', background: '#f5f7fa' }}>
            {/* Left Panel - Controls */}
            <div style={{ width: `${sidebarWidth}px`, background: 'white', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', overflow: 'visible' }}>
                {/* Search Section */}
                <div style={{ padding: '16px', borderBottom: '1px solid #e2e8f0', position: 'relative', zIndex: 2000 }}>
                    <div style={{ position: 'relative' }} ref={searchRef}>
                        {/* Row 1: Enquiry No. and Lead Job */}
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                            {/* 1. Enquiry Input */}
                            <div style={{ flex: '0 0 50%', position: 'relative' }}>
                                <input
                                    type="text"
                                    placeholder="Enquiry No."
                                    value={searchTerm}
                                    onChange={(e) => handleSearchInput(e.target.value)}
                                    onFocus={() => setShowSuggestions(true)}
                                    style={{
                                        width: '100%',
                                        padding: '8px 12px',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: '6px',
                                        fontSize: '14px',
                                        backgroundColor: '#fff'
                                    }}
                                />
                                {showSuggestions && suggestions.length > 0 && (
                                    <div style={{
                                        position: 'absolute', top: '100%', left: 0, right: 0,
                                        background: 'white', border: '1px solid #e2e8f0', borderRadius: '6px',
                                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 10000, marginTop: '4px',
                                        maxHeight: '300px', overflowY: 'auto'
                                    }}>
                                        {suggestions.map((enq, idx) => (
                                            <div
                                                key={enq.RequestNo || idx}
                                                onClick={() => handleSelectEnquiry(enq)}
                                                style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: idx < suggestions.length - 1 ? '1px solid #f1f5f9' : 'none' }}
                                                onMouseOver={(e) => e.currentTarget.style.background = '#f8fafc'}
                                                onMouseOut={(e) => e.currentTarget.style.background = 'white'}
                                            >
                                                <div style={{ fontWeight: '600', fontSize: '13px' }}>{enq.RequestNo}</div>
                                                <div style={{ fontSize: '11px', color: '#64748b' }}>{enq.ProjectName}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Lead Job Dropdown + code pill (match Pricing module) */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                                {(() => {
                                        if (!enquiryData) {
                                            return (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
                                                    <div style={{ flex: 1, position: 'relative' }}>
                                                        <select disabled style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', background: '#f1f5f9' }}>
                                                            <option>Select Lead Job</option>
                                                        </select>
                                                    </div>
                                                </div>
                                            );
                                        }

                                        // 1. Get all potential lead jobs (roots)
                                        let allLeadJobs = enquiryData.divisions || [];
                                        if (allLeadJobs.length === 0 && enquiryData.divisionsHierarchy && enquiryData.divisionsHierarchy.length > 0) {
                                            allLeadJobs = enquiryData.divisionsHierarchy
                                                .filter(j => !(j.parentId || j.ParentID) || (j.parentId || j.ParentID) == '0' || (j.parentId || j.ParentID) == 0)
                                                .map(r => r.itemName || r.DivisionName);
                                        } else if (enquiryData.divisionsHierarchy && enquiryData.divisionsHierarchy.length > 0) {
                                            const rootNames = new Set(
                                                enquiryData.divisionsHierarchy
                                                    .filter(j => !(j.parentId || j.ParentID) || (j.parentId || j.ParentID) == '0' || (j.parentId || j.ParentID) == 0)
                                                    .map(j => j.itemName || j.DivisionName)
                                            );
                                            const filtered = allLeadJobs.filter(name => rootNames.has(name));
                                            if (filtered.length > 0) allLeadJobs = filtered;
                                        }

                                        const uniqueLeadJobs = [...new Set(allLeadJobs)];

                                        // 2. Filter based on user access (Pricing Data)
                                        let visibleLeadJobs = [];
                                        if (pricingData && pricingData.access) {
                                            visibleLeadJobs = uniqueLeadJobs.filter(leadJob => {
                                                const leadJobName = leadJob.replace(/^L\d+\s*-\s*/, '').trim();
                                                const jobNameLower = leadJobName.toLowerCase();

                                                if (currentUser?.role === 'Admin' || currentUser?.Roles === 'Admin') return true;

                                                const userDept = (currentUser?.Department || '').trim().toLowerCase();

                                                // Hard Filter: Explicitly exclude civil from non-civil and vice-versa if it's a root mismatch
                                                if (userDept && userDept === 'civil' && !jobNameLower.includes('civil')) return false;

                                                // Find the actual root job object in pricingData
                                                const rootJob = (pricingData.jobs || []).find(j => {
                                                    const isRoot = !j.parentId || j.parentId == '0' || j.parentId == 0;
                                                    const name = (j.itemName || j.DivisionName || j.ItemName || '').toLowerCase();
                                                    return isRoot && (name === jobNameLower || name === leadJob.toLowerCase());
                                                });

                                                if (!rootJob) return false;

                                                // 2.1 Direct Visibility Match
                                                if (rootJob.visible || rootJob.editable) return true;

                                                // 2.2 Hierarchy Match (is any accessible job a descendant of THIS root?)
                                                const isDescendantOfRoot = (job) => {
                                                    const pId = String(job.parentId || '');
                                                    if (!pId || pId === '0' || pId === 'undefined') return false;
                                                    if (pId === String(rootJob.id)) return true;

                                                    const parent = pricingData.jobs.find(pj => String(pj.id) === pId);
                                                    if (parent) return isDescendantOfRoot(parent);
                                                    return false;
                                                };

                                                const hasAccessibleTarget = (pricingData.jobs || []).some(j => (j.visible || j.editable) && isDescendantOfRoot(j));
                                                return hasAccessibleTarget;
                                            });
                                        }

                                        // 3. Selected value MUST match an <option value> (full division string), never a bare clean name.
                                        const selectedValue = resolveLeadJobSelectValue(
                                            visibleLeadJobs,
                                            selectedLeadId,
                                            pricingData?.jobs,
                                            enquiryData.leadJobPrefix
                                        );

                                        if (import.meta.env.DEV) {
                                            console.log('[Quote Lead Job Render] State:', {
                                                prefix: enquiryData.leadJobPrefix,
                                                options: visibleLeadJobs,
                                                selected: selectedValue
                                            });
                                        }

                                        const leadClean = (s) =>
                                            String(s || '')
                                                .replace(/^L\d+\s*-\s*/i, '')
                                                .trim()
                                                .toLowerCase();

                                        let selectedLeadCodeDisplay = '';
                                        if (selectedLeadId && pricingData?.jobs) {
                                            const root = pricingData.jobs.find((j) => String(j.id || j.ItemID) === String(selectedLeadId));
                                            selectedLeadCodeDisplay = String(root?.leadJobCode || root?.LeadJobCode || '').trim();
                                            if (!selectedLeadCodeDisplay && root) {
                                                const nm = String(root.itemName || root.DivisionName || root.ItemName || '');
                                                const m = nm.match(/^(L\d+)/i);
                                                if (m) selectedLeadCodeDisplay = m[1].toUpperCase();
                                            }
                                        }
                                        if (!selectedLeadCodeDisplay && selectedValue) {
                                            const m = String(selectedValue).trim().match(/^(L\d+)/i);
                                            if (m) selectedLeadCodeDisplay = m[1].toUpperCase();
                                        }

                                        const labelForCode =
                                            selectedValue && String(selectedValue).trim()
                                                ? selectedValue
                                                : enquiryData.leadJobPrefix && String(enquiryData.leadJobPrefix).trim()
                                                  ? enquiryData.leadJobPrefix
                                                  : '';
                                        const bareLOnly = labelForCode && /^L\d+$/i.test(String(labelForCode).trim());

                                        // Enquiry divisions are often clean names ("Civil Project"); L-code lives on hierarchy / pricing job.
                                        if (!selectedLeadCodeDisplay && !bareLOnly && enquiryData.divisionsHierarchy?.length && labelForCode) {
                                            const sv = leadClean(labelForCode);
                                            const node = enquiryData.divisionsHierarchy.find((d) => {
                                                const raw = String(d.itemName || d.DivisionName || '').trim();
                                                return (
                                                    leadClean(raw) === sv ||
                                                    raw.toLowerCase() === String(labelForCode).trim().toLowerCase()
                                                );
                                            });
                                            selectedLeadCodeDisplay = String(node?.leadJobCode || node?.LeadJobCode || '').trim();
                                            if (!selectedLeadCodeDisplay && node) {
                                                const fromName = String(node.itemName || node.DivisionName || '').match(/^(L\d+)/i);
                                                if (fromName) selectedLeadCodeDisplay = fromName[1].toUpperCase();
                                            }
                                        }
                                        if (!selectedLeadCodeDisplay && !bareLOnly && pricingData?.jobs?.length && labelForCode) {
                                            const sv = leadClean(labelForCode);
                                            const root = pricingData.jobs.find((j) => {
                                                const isRoot = !j.parentId || j.parentId == '0' || j.parentId == 0;
                                                if (!isRoot) return false;
                                                return leadClean(j.itemName || j.DivisionName || j.ItemName) === sv;
                                            });
                                            if (root) {
                                                selectedLeadCodeDisplay = String(root.leadJobCode || root.LeadJobCode || '').trim();
                                                if (!selectedLeadCodeDisplay) {
                                                    const nm = String(root.itemName || root.DivisionName || '');
                                                    const m = nm.match(/^(L\d+)/i);
                                                    if (m) selectedLeadCodeDisplay = m[1].toUpperCase();
                                                }
                                            }
                                        }
                                        if (!selectedLeadCodeDisplay && enquiryData.leadJobPrefix) {
                                            const rawP = String(enquiryData.leadJobPrefix).trim();
                                            let m = rawP.match(/^(L\d+)/i);
                                            if (!m) m = rawP.match(/(L\d+)/i);
                                            if (m) selectedLeadCodeDisplay = m[1].toUpperCase();
                                        }

                                        const leadCodePill = selectedLeadCodeDisplay ? (
                                            <span
                                                style={{
                                                    padding: '4px 8px',
                                                    borderRadius: '999px',
                                                    border: '1px solid #cbd5e1',
                                                    background: '#ffffff',
                                                    color: '#334155',
                                                    fontSize: '12px',
                                                    fontWeight: '600',
                                                    flexShrink: 0,
                                                    lineHeight: 1.2
                                                }}
                                            >
                                                {selectedLeadCodeDisplay}
                                            </span>
                                        ) : null;

                                        return (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
                                                <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
                                                    <select
                                                        style={{
                                                            width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #e2e8f0',
                                                            background: 'white', color: '#334155', fontWeight: '500',
                                                            fontSize: '13px', appearance: 'none', paddingRight: '30px', cursor: 'pointer'
                                                        }}
                                                        value={selectedValue}
                                                        onChange={(e) => {
                                                            const val = e.target.value;
                                                            if (!val || !String(val).trim()) return;
                                                            const nextFp = leadJobChoiceFingerprint(val);
                                                            const prevFp = leadChoiceFingerprintRef.current;
                                                            const didLeadChange = !!nextFp && nextFp !== prevFp;
                                                            if (didLeadChange) {
                                                                autoSelectCustomerAfterLeadChangeRef.current = true;
                                                                const tn = (toName || '').trim();
                                                                preserveQuoteOnLeadChangeRef.current =
                                                                    quoteId && tn
                                                                        ? {
                                                                              quoteId,
                                                                              quoteNumber: quoteNumber || '',
                                                                              toName: tn
                                                                          }
                                                                        : null;
                                                                clearCustomerForLeadSwitch();
                                                            }
                                                            leadChoiceFingerprintRef.current = nextFp || prevFp;

                                                            // Find the corresponding Hub ID for strict isolation (val is full <option> string)
                                                            const valClean = String(val || '')
                                                                .replace(/^L\d+\s*-\s*/i, '')
                                                                .trim()
                                                                .toLowerCase();
                                                            const jobObj = (pricingData?.jobs || []).find((j) => {
                                                                const isRoot = !j.parentId || j.parentId == '0' || j.parentId == 0;
                                                                if (!isRoot) return false;
                                                                const nm = String(j.itemName || j.DivisionName || j.ItemName || '').trim();
                                                                const nmLow = nm.toLowerCase();
                                                                return (
                                                                    nm === val ||
                                                                    nmLow === String(val || '').trim().toLowerCase() ||
                                                                    nmLow.replace(/^l\d+\s*-\s*/i, '').trim() === valClean
                                                                );
                                                            });
                                                            if (jobObj) setSelectedLeadId(jobObj.id || jobObj.ItemID);

                                                            const nextPrefixForPricing = val.match(/^L\d+/)
                                                                ? val.split('-')[0].trim()
                                                                : val;
                                                            if (val.match(/^L\d+/)) {
                                                                setEnquiryData(prev => ({ ...prev, leadJobPrefix: nextPrefixForPricing }));
                                                            } else {
                                                                setEnquiryData(prev => ({ ...prev, leadJobPrefix: val }));
                                                            }

                                                            const reqNo = enquiryData?.enquiry?.RequestNo;
                                                            const cx = (toNameRef.current || '').trim();
                                                            if (reqNo && cx) {
                                                                queueMicrotask(() =>
                                                                    loadPricingData(reqNo, cx, {
                                                                        leadJobPrefixOverride: nextPrefixForPricing
                                                                    })
                                                                );
                                                            }
                                                        }}
                                                    >
                                                        <option value="" disabled>Select Lead Job</option>
                                                        {visibleLeadJobs.map(div => {
                                                            const cleanName = div.replace(/^L\d+\s*-\s*/, '').trim();
                                                            return <option key={div} value={div}>{cleanName}</option>;
                                                        })}
                                                    </select>
                                                    <div style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#64748b' }}>
                                                        <ChevronDown size={14} />
                                                    </div>
                                                </div>
                                                {leadCodePill}
                                            </div>
                                        );
                                    })()}
                            </div>
                        </div>

                        {/* Row 2: Customer Dropdown and Search Button */}
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <div style={{ flex: 1, position: 'relative' }}>
                                <CreatableSelect
                                    isDisabled={!enquiryData}
                                    options={quoteCustomerDropdownOptions}
                                    value={customerSelectValue}
                                    getOptionValue={getCustomerOptionValue}
                                    getOptionLabel={getCustomerOptionLabel}
                                    styles={quoteCustomerCreatableStyles}
                                    onChange={(selected) => handleCustomerChange(selected)}
                                    placeholder="Select Customer..."
                                    formatCreateLabel={(inputValue) => `Use "${inputValue}"`}
                                    isClearable
                                />
                            </div>

                            {/* Search + Clear (same row as customer select) */}
                            <button
                                type="button"
                                onClick={() => searchTerm.trim() && handleSearchInput(searchTerm)}
                                style={{
                                    padding: '8px 16px',
                                    background: '#1e293b',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontWeight: '500',
                                    fontSize: '13px',
                                    whiteSpace: 'nowrap',
                                    flexShrink: 0
                                }}
                            >
                                Search
                            </button>
                            <button
                                type="button"
                                onClick={handleClear}
                                style={{
                                    padding: '8px 14px',
                                    background: '#e2e8f0',
                                    border: '1px solid #cbd5e1',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontSize: '13px',
                                    color: '#475569',
                                    fontWeight: '600',
                                    whiteSpace: 'nowrap',
                                    flexShrink: 0
                                }}
                            >
                                Clear
                            </button>
                        </div>
                    </div>
                </div>

                {/* Action Buttons (Clear lives next to Search above) */}
                {/* Visible ONLY when Enquiry Data, Lead Job AND Customer (toName) are selected */}
                {enquiryData && enquiryData.leadJobPrefix && toName?.trim() && (
                    <div style={{ padding: '8px 12px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>

                        {/* Left Actions: Save, Revision */}
                        <div style={{ display: 'flex', gap: '6px' }}>
                            {/* Save: enabled only when no persisted quote for this enquiry+lead+tab tuple+customer; Revision only when one exists */}
                            <button
                                onClick={() => saveQuote()}
                                disabled={saving || !canEdit() || !scopedQuoteTupleReady || hasPersistedQuoteForScope || isEditingRestricted}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '6px 12px',
                                    background: (!canEdit() || !scopedQuoteTupleReady || hasPersistedQuoteForScope || isEditingRestricted) ? '#f1f5f9' : '#1e293b',
                                    color: (!canEdit() || !scopedQuoteTupleReady || hasPersistedQuoteForScope || isEditingRestricted) ? '#94a3b8' : 'white',
                                    border: 'none',
                                    borderRadius: '44px',
                                    cursor: (!canEdit() || !scopedQuoteTupleReady || hasPersistedQuoteForScope || isEditingRestricted) ? 'not-allowed' : 'pointer',
                                    fontWeight: '600',
                                    fontSize: '12px',
                                    opacity: saving ? 0.7 : 1
                                }}
                                title={
                                    saving ? 'Saving…' :
                                    isEditingRestricted ? 'Editing is restricted for this tab' :
                                    !canEdit() ? 'No permission to save (admin/lead access, pricing scope, or tab ownership required)' :
                                    !scopedQuoteTupleReady ? 'Loading quote scope…' :
                                    hasPersistedQuoteForScope ? 'A quote already exists for this enquiry and customer. Use Revision to change it.' :
                                    ''
                                }
                            >
                                <Save size={14} /> {saving ? 'Saving...' : 'Save'}
                            </button>

                            {/* Revision Button */}
                            {hasPersistedQuoteForScope && (
                                <button onClick={handleRevise} disabled={saving || !canEdit() || isEditingRestricted || !quoteId} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: (!canEdit() || isEditingRestricted || !quoteId) ? '#94a3b8' : '#0284c7', color: 'white', border: 'none', borderRadius: '4px', cursor: (!canEdit() || isEditingRestricted || !quoteId) ? 'not-allowed' : 'pointer', fontWeight: '600', fontSize: '12px' }} title={isEditingRestricted ? "Editing is restricted for this tab" : !canEdit() ? "No permission to revise" : !quoteId ? "Loading quote…" : ""}>
                                    <Plus size={14} /> Revision
                                </button>
                            )}
                        </div>

                        {/* Right Actions: Print, Email */}
                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>

                            {/* Print with Header Checkbox */}
                            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#64748b', cursor: 'pointer', marginRight: '4px' }}>
                                <input
                                    type="checkbox"
                                    checked={printWithHeader}
                                    onChange={(e) => setPrintWithHeader(e.target.checked)}
                                />
                                With Header
                            </label>

                            {/* Print Preview - Icon Only */}
                            <button onClick={printQuote} disabled={!hasUserPricing} title="Print Preview" style={{ width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'white', color: '#1e293b', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer', opacity: !hasUserPricing ? 0.5 : 1 }}>
                                <Printer size={16} />
                            </button>

                            <button
                                type="button"
                                onClick={() => setSignatureVaultOpen(true)}
                                disabled={!hasUserPricing || !enquiryData?.enquiry?.RequestNo}
                                title="Signatures: open this, save to library, then use Place on page. On the quote preview, drag the stamp anywhere (except ×) to move it. Profile menu can manage defaults."
                                style={{
                                    width: '30px',
                                    height: '30px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    background: 'white',
                                    color: '#1e293b',
                                    border: '1px solid #cbd5e1',
                                    borderRadius: '4px',
                                    cursor: !hasUserPricing || !enquiryData?.enquiry?.RequestNo ? 'not-allowed' : 'pointer',
                                    opacity: !hasUserPricing || !enquiryData?.enquiry?.RequestNo ? 0.5 : 1,
                                }}
                            >
                                <PenLine size={16} />
                            </button>

                            {/* Email - Icon Only */}
                            <button title="Email Quote" style={{ width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'white', color: '#1e293b', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer' }}>
                                <Mail size={16} />
                            </button>
                        </div>
                    </div>
                )}




                {/* Scrollable Content Area: Pricing & Information */}
                {enquiryData && enquiryData.leadJobPrefix && toName?.trim() ? (
                    <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', minHeight: 0 }}>


                        {/* Unified Previous Quotes & Pricing Summary Section */}
                        <div style={{ padding: '8px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                            <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#475569' }}>Previous Quotes / Revisions (Updated):</h4>

                            {/* Tab Headers and Content Wrapper */}
                            {(() => {
                                let tabs = calculatedTabs || [];
                                if (tabs.length === 0) {
                                    tabs = [{ id: 'default', name: 'Own Job', label: 'Own Job', isSelf: true }];
                                }

                                return (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {/* Tab Headers */}
                                        <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid #e2e8f0', marginBottom: '4px', flexWrap: 'wrap' }}>
                                            {tabs.map(tab => (
                                                <button
                                                    key={tab.id}
                                                    onClick={() => handleTabChange(tab.id)}
                                                    style={{
                                                        padding: '4px 8px',
                                                        fontSize: '11px',
                                                        fontWeight: '600',
                                                        border: 'none',
                                                        background: activeQuoteTab === tab.id ? '#e0f2fe' : 'transparent',
                                                        color: activeQuoteTab === tab.id ? '#0284c7' : '#64748b',
                                                        borderBottom: activeQuoteTab === tab.id ? '2px solid #0284c7' : '2px solid transparent',
                                                        cursor: 'pointer',
                                                        borderRadius: '4px 4px 0 0'
                                                    }}
                                                >
                                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: '1' }}>
                                                        <span>{tab.name || tab.label}</span>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>

                                        {/* Content for Active Tab */}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            {(() => {
                                                const activeTabObj = tabs.find(t => String(t.id) === String(activeQuoteTab)) || tabs[0];
                                                if (!activeTabObj) return null;

                                                const activeTabRealId = activeTabObj.realId;

                                                /** Active tab job + all descendants in pool — sidebar shows only this branch (not sibling Civil/HVAC when Electrical is selected). */
                                                const tabScopeIdsForSidebar = (() => {
                                                    const s = new Set();
                                                    if (!activeTabRealId) return s;
                                                    s.add(String(activeTabRealId));
                                                    let changed = true;
                                                    while (changed) {
                                                        changed = false;
                                                        jobsPool.forEach((j) => {
                                                            const jId = String(j.id || j.ItemID || j.ID || '');
                                                            const pId = String(j.parentId ?? j.ParentID ?? '').trim();
                                                            if (!jId || s.has(jId)) return;
                                                            if (pId && s.has(pId)) {
                                                                s.add(jId);
                                                                changed = true;
                                                            }
                                                        });
                                                    }
                                                    return s;
                                                })();

                                                // Resolve current lead code for robust branch isolation
                                                const currentLeadCode = (() => {
                                                    // PRIORITY 1: Resolve via explicit selectedLeadId (Stable and Robust)
                                                    if (selectedLeadId && pricingData?.jobs) {
                                                        let root = pricingData.jobs.find(j => String(j.id || j.ItemID) === String(selectedLeadId));
                                                        if (root) {
                                                            const rCode = (root.leadJobCode || root.LeadJobCode || '').toUpperCase();
                                                            if (rCode && rCode.match(/^L\d+/)) return rCode.split('-')[0].trim();
                                                            if (root.itemName?.toUpperCase().match(/^L\d+/)) return root.itemName.split('-')[0].trim().toUpperCase();
                                                        }
                                                    }

                                                    // FALLBACK: Legacy name-based resolution
                                                    const prefix = (enquiryData.leadJobPrefix || '').toUpperCase();
                                                    if (!prefix) return '';
                                                    if (prefix.match(/^L\d+/)) return prefix.split('-')[0].trim().toUpperCase();

                                                    const hierarchy = enquiryData.divisionsHierarchy || [];
                                                    let job = hierarchy.find(j => {
                                                        const name = (j.itemName || j.ItemName || j.DivisionName || '').toUpperCase();
                                                        const clean = name.replace(/^(L\d+\s*-\s*)/, '').trim();
                                                        return name === prefix || clean === prefix || (j.leadJobCode && j.leadJobCode.toUpperCase() === prefix);
                                                    });

                                                    if (job) {
                                                        let root = job;
                                                        while (root && root.parentId && root.parentId !== '0' && root.parentId !== 0) {
                                                            const parent = hierarchy.find(p => String(p.id || p.ItemID) === String(root.parentId));
                                                            if (parent) root = parent;
                                                            else break;
                                                        }
                                                        if (root.leadJobCode || root.LeadJobCode) return (root.leadJobCode || root.LeadJobCode).toUpperCase();
                                                        if (root.itemName?.match(/^L\d+/)) return root.itemName.split('-')[0].trim().toUpperCase();
                                                    }
                                                    return prefix;
                                                })();

                                                // Filter and Render Previous Quotes (API-scoped list when available).
                                                // Scoped rows are the source of truth for the requested EnquiryQuotes tuple.
                                                const useScopedPanel = quoteScopedForPanel.length > 0;
                                                const quoteSourceList = useScopedPanel ? quoteScopedForPanel : existingQuotes;

                                                let filteredQuotes = quoteSourceList.filter(q => {
                                                    const normalizedQuoteTo = normalize(q.ToName || '');
                                                    const normalizedCurrentTo = normalize(toName || '');

                                                    if (!useScopedPanel) {
                                                        const activeTabAncestors = [];
                                                        let currAnc = activeTabRealId ? jobsPool.find(j => String(j.id || j.ItemID || j.ID) === String(activeTabRealId)) : null;
                                                        let ancSafety = 0;
                                                        let ancVisited = new Set();
                                                        while (currAnc && (currAnc.parentId || currAnc.ParentID) && (currAnc.parentId || currAnc.ParentID) !== '0' && (currAnc.parentId || currAnc.ParentID) !== 0 && ancSafety < 20) {
                                                            const pId = String(currAnc.parentId || currAnc.ParentID);
                                                            if (ancVisited.has(pId)) break;
                                                            ancVisited.add(pId);
                                                            const parent = jobsPool.find(j => String(j.id || j.ItemID || j.ID) === pId);
                                                            if (parent) {
                                                                activeTabAncestors.push(normalize(parent.itemName || parent.ItemName || parent.DivisionName || ''));
                                                                currAnc = parent;
                                                                ancSafety++;
                                                            } else {
                                                                break;
                                                            }
                                                        }

                                                        const isExactMatch = normalizedCurrentTo && (normalizedQuoteTo === normalizedCurrentTo);
                                                        const isAncestorMatch = activeTabAncestors.includes(normalizedQuoteTo);

                                                        if (!normalizedCurrentTo) return false;

                                                        if (!isExactMatch && !isAncestorMatch) return false;
                                                    }

                                                    // Scoped rows: server already matched EnquiryQuotes (LeadJob + RequestNo +
                                                    // OwnJob + ToName). Do not re-filter by QuoteNumber division — that can
                                                    // hide the correct tuple when the DB row is right.
                                                    if (useScopedPanel) {
                                                        if (scopedEnquiryQuotesParams?.useDepartmentForOwnJob && tabs.length > 1) {
                                                            return quoteNumberDivisionMatchesTab(q, activeTabObj, true);
                                                        }
                                                        return true;
                                                    }

                                                    const parts = q.QuoteNumber?.split('/') || [];
                                                    const qDivCode = parts[1]?.toUpperCase();
                                                    // Robust L-tag extraction: Handles AAC/BMS/17-L1/36 or AAC/BMS/L1-17/36
                                                    const qLeadPart = parts[2] ? parts[2].toUpperCase() : '';
                                                    const qLeadCodeOnly = qLeadPart.match(/L\d+/) ? qLeadPart.match(/L\d+/)[0] : '';

                                                    // Division match must use the active tab's job when multiple tabs (not parent lead only).
                                                    const divisionMatchContextName = divisionMatchContextForQuoteTab(
                                                        selectedLeadId,
                                                        pricingData,
                                                        activeTabRealId,
                                                        activeTabObj,
                                                        tabs.length,
                                                        jobsPool
                                                    );

                                                    const ownJobMatchesTab =
                                                        collapseSpacesLower(stripQuoteJobPrefix(q.OwnJob || '')) ===
                                                        collapseSpacesLower(stripQuoteJobPrefix(activeTabObj.label || activeTabObj.name || ''));
                                                    const isTypeMatch =
                                                        ownJobMatchesTab ||
                                                        matchDivisionCode(qDivCode, divisionMatchContextName, activeTabObj.divisionCode);

                                                    if (!isTypeMatch) return false;

                                                    if (tabs.length > 1 && !quoteNumberDivisionMatchesTab(q, activeTabObj, true)) return false;

                                                    // Branch Isolation: Ensure quote belongs to precisely this Lead/Subjob branch
                                                    const currentLeadCodeClean = currentLeadCode.match(/L\d+/) ? currentLeadCode.match(/L\d+/)[0] : '';
                                                    if (qLeadCodeOnly && currentLeadCodeClean && qLeadCodeOnly !== currentLeadCodeClean) return false;

                                                    // STRICT ISOLATION: Sub-users CANNOT see parent division quotes (Step 1922)
                                                    const userDept = (currentUser?.Department || currentUser?.Division || '').trim().toLowerCase();
                                                    const isSubUser = userDept && !['civil', 'admin'].includes(userDept) && !isAdmin;
                                                    if (isSubUser) {
                                                        const isParentCode = qDivCode === 'CVLP' || (qDivCode === 'AAC' && userDept !== 'air');
                                                        // If it's a parent code and not belonging to current tab, block it
                                                        const isMySpecificTab = isTypeMatch; // Already checked by isTypeMatch

                                                        if (isParentCode && !isMySpecificTab) return false;
                                                    }

                                                    return true;
                                                });

                                                // Do not inject out-of-scope loaded quotes into the list; panel must reflect scoped tuple only.

                                                // Group revisions
                                                const quoteGroups = filteredQuotes.reduce((acc, q) => {
                                                    const key = q.QuoteNumber?.split('-R')[0] || 'Unknown';
                                                    if (!acc[key]) acc[key] = [];
                                                    acc[key].push(q);
                                                    return acc;
                                                }, {});

                                                const quoteList = Object.entries(quoteGroups)
                                                    .sort(([a], [b]) => b.localeCompare(a))
                                                    .slice(0, 1) // Only one quote reference to appear strictly
                                                    .map(([quoteNo, revisions]) => {
                                                        const sorted = revisions.sort((a, b) => b.RevisionNo - a.RevisionNo);
                                                        const latest = sorted[0];
                                                        const isExpanded = expandedGroups[quoteNo];
                                                        const hasHistory = sorted.length > 1;

                                                        return (
                                                            <div key={quoteNo} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                                <div
                                                                    onClick={() => loadQuote(latest, { preserveRecipient: true })}
                                                                    style={{
                                                                        padding: '8px',
                                                                        background: String(quoteRowId(latest) ?? '') === String(quoteId ?? '') ? '#f0f9ff' : 'white',
                                                                        border: `1px solid ${String(quoteRowId(latest) ?? '') === String(quoteId ?? '') ? '#0ea5e9' : '#e2e8f0'}`,
                                                                        borderRadius: '8px',
                                                                        cursor: 'pointer',
                                                                        position: 'relative'
                                                                    }}
                                                                >
                                                                    {/* Expand Toggle */}
                                                                    {hasHistory && (
                                                                        <div
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                toggleExpanded(quoteNo);
                                                                            }}
                                                                            style={{
                                                                                position: 'absolute',
                                                                                right: '6px',
                                                                                top: '6px',
                                                                                padding: '2px',
                                                                                cursor: 'pointer',
                                                                                color: '#64748b'
                                                                            }}
                                                                        >
                                                                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                                                        </div>
                                                                    )}

                                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingRight: hasHistory ? '20px' : '0' }}>
                                                                        <span style={{ fontWeight: '700', fontSize: '12px' }}>{latest.QuoteNumber}</span>
                                                                        <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: latest.Status === 'Draft' ? '#f1f5f9' : '#dcfce7' }}>{latest.Status}</span>
                                                                    </div>
                                                                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                                                                        BD {parseFloat(latest.TotalAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 3 })}
                                                                    </div>
                                                                </div>

                                                                {/* Render History if Expanded */}
                                                                {isExpanded && sorted.slice(1).map(rev => (
                                                                        <div
                                                                            key={String(quoteRowId(rev) ?? rev.QuoteNumber ?? rev.quoteNumber ?? 'rev')}
                                                                            onClick={() => loadQuote(rev, { preserveRecipient: true })}
                                                                        style={{
                                                                            padding: '6px 8px',
                                                                            background: String(quoteRowId(rev) ?? '') === String(quoteId ?? '') ? '#eff6ff' : '#f8fafc',
                                                                            border: '1px solid #e2e8f0',
                                                                            borderRadius: '6px',
                                                                            marginLeft: '12px',
                                                                            fontSize: '11px',
                                                                            cursor: 'pointer',
                                                                            display: 'flex',
                                                                            justifyContent: 'space-between',
                                                                            alignItems: 'center'
                                                                        }}
                                                                    >
                                                                        <span style={{ color: '#475569' }}>{rev.QuoteNumber}</span>
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                            <span style={{ fontWeight: '600' }}>BD {parseFloat(rev.TotalAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 3 })}</span>
                                                                            <span style={{ fontSize: '9px', padding: '1px 4px', borderRadius: '2px', background: '#e2e8f0' }}>{rev.Status}</span>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        );
                                                    });

                                                // Filter Pricing Summary — under each subjob tab, only that job subtree (not all L1 siblings).
                                                const filteredPricing = pricingSummary.filter((grp) => {
                                                    const grpNameNorm = collapseSpacesLower(stripQuoteJobPrefix(grp.name || ''));
                                                    const matchingJobs = jobsPool.filter((j) =>
                                                        collapseSpacesLower(stripQuoteJobPrefix(j.itemName || j.DivisionName || j.ItemName || '')) === grpNameNorm
                                                    );
                                                    if (matchingJobs.length === 0) return activeTabObj.isSelf || tabs.length === 1;

                                                    if (tabs.length > 1 && activeTabRealId && tabScopeIdsForSidebar.size > 0) {
                                                        return matchingJobs.some((job) =>
                                                            tabScopeIdsForSidebar.has(String(job.id || job.ItemID || job.ID))
                                                        );
                                                    }

                                                    const isRelevant = matchingJobs.some(job => {
                                                        const jId = job.id || job.ItemID || job.ID;
                                                        const isMatch = String(jId) === String(activeTabRealId) || isDescendant(jId, activeTabRealId, jobsPool);
                                                        if (!isMatch) return false;

                                                        const getRootId = (id) => {
                                                            let curr = jobsPool.find(j => String(j.id || j.ItemID || j.ID) === String(id));
                                                            let visited = new Set();
                                                            while (curr && (curr.parentId || curr.ParentID) && (curr.parentId || curr.ParentID) !== '0' && !visited.has(curr.id || curr.ItemID)) {
                                                                visited.add(curr.id || curr.ItemID);
                                                                const parent = jobsPool.find(p => String(p.id || p.ItemID || p.ID) === String(curr.parentId || curr.ParentID));
                                                                if (!parent) break;
                                                                curr = parent;
                                                            }
                                                            return curr ? String(curr.id || curr.ItemID || curr.ID) : String(id);
                                                        };

                                                        const jobRootId = getRootId(jId);
                                                        const activeRootId = getRootId(activeTabRealId);
                                                        if (jobRootId !== activeRootId) return false;

                                                        return true;
                                                    });

                                                    if (!isRelevant) return false;

                                                    const userDept = (currentUser?.Department || currentUser?.Division || '').trim().toLowerCase();
                                                    const isStrictlyLimited = userDept && !['civil', 'admin', 'bms admin'].includes(userDept) && !isAdmin;

                                                    if (isStrictlyLimited) {
                                                        const isActualAncestor = matchingJobs.some(job => {
                                                            const jobIdStr = String(job.id || job.ItemID || job.ID);
                                                            let curr = activeTabRealId ? jobsPool.find(j => String(j.id || j.ItemID || j.ID) === String(activeTabRealId)) : null;
                                                            while (curr && (curr.parentId || curr.ParentID)) {
                                                                const pid = String(curr.parentId || curr.ParentID);
                                                                if (pid === jobIdStr) return true;
                                                                curr = jobsPool.find(pj => String(pj.id || pj.ItemID || pj.ID) === pid);
                                                            }
                                                            return false;
                                                        });
                                                        if (isActualAncestor) return false;
                                                    }

                                                    return true;
                                                });

                                                return (
                                                    <>
                                                        {quoteList.length > 0 ? quoteList : <div style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' }}>No quotes for this tab.</div>}

                                                        {/* Pricing Summary (Latest Price) */}
                                                        {(filteredPricing.length > 0) && (
                                                            <div style={{ padding: '8px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', marginTop: '12px' }}>
                                                                <h5 style={{ margin: '0 0 8px 0', fontSize: '11px', color: '#166534', fontWeight: '800' }}>PRICING SUMMARY (LATEST):</h5>
                                                                {filteredPricing.map((grp, i) => (
                                                                    <div key={i} style={{ marginBottom: '6px', paddingBottom: '4px', borderBottom: '1px dashed #e2e8f0' }}>
                                                                        <div style={{ fontSize: '11px', fontWeight: '700', color: '#166534', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                            <input type="checkbox" checked={selectedJobs.includes(grp.name)} onChange={() => handleJobToggle(grp.name)} />
                                                                            {grp.name}
                                                                        </div>
                                                                        <div style={{ marginLeft: '14px', fontSize: '10px', color: '#64748b' }}>
                                                                            {grp.items.map((item, idx) => (
                                                                                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                                                    <span>- {item.name}</span>
                                                                                    <span>BD {item.total.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</span>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                ))}

                                                                <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '2px solid #bbf7d0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                    <span style={{ fontSize: '11px', fontWeight: '800', color: '#166534' }}>GRAND BASE PRICE TOTAL:</span>
                                                                    <span style={{ fontSize: '12px', fontWeight: '800', color: '#15803d' }}>
                                                                        BD {filteredPricing
                                                                            .filter(g => selectedJobs.includes(g.name))
                                                                            .reduce((sum, g) => {
                                                                                // Sum only Base Price items
                                                                                const groupBase = g.items.reduce((s, i) => (i.name === 'Base Price' ? s + i.total : s), 0);
                                                                                return sum + groupBase;
                                                                            }, 0)
                                                                            .toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </>
                                                );
                                            })()}
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>

                        {/* LOCKED UI LOGIC: Hide Quote Details for non-Own Job tabs */}
                        {!isEditingRestricted && (
                            <div>
                                {/* Metadata Section (Quote Details) - Moved Below Pricing */}
                                <div style={{ padding: '16px', borderBottom: '1px solid #e2e8f0', background: '#fafafa' }}>

                                    <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#475569' }}>Quote Details:</h4>

                                    {/* Division is auto-selected based on user department - no manual selection needed */}

                                    <div style={{ marginBottom: '10px' }}>
                                        <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Quote Date <span style={{ color: '#ef4444' }}>*</span></label>
                                        <DateInput
                                            value={quoteDate}
                                            onChange={(e) => setQuoteDate(e.target.value)}
                                            max={format(new Date(), 'yyyy-MM-dd')}
                                            style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                                        />
                                    </div>



                                    <div style={{ marginBottom: '10px' }}>
                                        <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Validity (Days) <span style={{ color: '#ef4444' }}>*</span></label>
                                        <input type="number" value={validityDays} onChange={(e) => setValidityDays(parseInt(e.target.value) || 0)} style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px' }} />
                                    </div>

                                    <div style={{ marginBottom: '10px' }}>
                                        <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Customer Reference <span style={{ color: '#ef4444' }}>*</span></label>
                                        <input
                                            type="text"
                                            value={customerReference}
                                            onChange={(e) => setCustomerReference(e.target.value)}
                                            placeholder="Your Ref / LPO Number..."
                                            style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px' }}
                                        />
                                    </div>

                                    <div style={{ marginBottom: '10px' }}>
                                        <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Attention of <span style={{ color: '#ef4444' }}>*</span></label>
                                        {showAttentionAsSelect ? (
                                                <select
                                                    value={attentionSelectMerged.includes(toAttention) ? toAttention : ''}
                                                    onChange={(e) => setToAttention(e.target.value)}
                                                    style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', background: '#fff' }}
                                                >
                                                    <option value="">— Select —</option>
                                                    {attentionSelectMerged.map((opt) => (
                                                        <option key={opt} value={opt}>{opt}</option>
                                                    ))}
                                                </select>
                                        ) : (
                                            <input
                                                type="text"
                                                value={toAttention}
                                                onChange={(e) => setToAttention(e.target.value)}
                                                placeholder="Contact Person..."
                                                style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px' }}
                                            />
                                        )}
                                    </div>

                                    <div style={{ marginBottom: '10px' }}>
                                        <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Subject <span style={{ color: '#ef4444' }}>*</span></label>
                                        <textarea value={subject} onChange={(e) => setSubject(e.target.value)} rows={2} style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', resize: 'vertical' }} />
                                    </div>

                                    <div style={{ marginBottom: '10px' }}>
                                        <ListBoxControl
                                            label={
                                                <span style={{ fontSize: '12px', color: '#64748b' }}>
                                                    Enquiry Type<span style={{ color: '#ef4444' }}>*</span>
                                                </span>
                                            }
                                            options={enquiryTypesMaster}
                                            selectedOption={quoteEnquiryTypeSelect}
                                            onOptionChange={(val) => setQuoteEnquiryTypeSelect(val || '')}
                                            listBoxItems={quoteTypeList}
                                            onAdd={handleAddQuoteType}
                                            onRemove={handleRemoveQuoteTypeAt}
                                            minSearchLength={0}
                                            disabled={false}
                                            canRemove
                                        />
                                    </div>

                                    <div style={{ marginBottom: '10px' }}>
                                        <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Prepared By <span style={{ color: '#ef4444' }}>*</span></label>
                                        <CreatableSelect
                                            isClearable
                                            onChange={(newValue) => setPreparedBy(newValue ? newValue.value : '')}
                                            options={computedPreparedByOptions}
                                            value={preparedBy ? { label: preparedBy, value: preparedBy } : null}
                                            placeholder="Select or Type Name..."
                                            styles={{
                                                control: (base) => ({ ...base, minHeight: '34px', fontSize: '13px' }),
                                                valueContainer: (base) => ({ ...base, padding: '0 8px' }),
                                                input: (base) => ({ ...base, margin: 0, padding: 0 }),
                                            }}
                                        />
                                    </div>

                                    <div style={{ marginBottom: '10px' }}>
                                        <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Signatory <span style={{ color: '#ef4444' }}>*</span></label>
                                        <CreatableSelect
                                            isClearable
                                            onChange={(newValue) => {
                                                setSignatory(newValue ? newValue.value : '');
                                                // Update designation if selected from list
                                                if (newValue) {
                                                    if (newValue.designation) {
                                                        setSignatoryDesignation(newValue.designation);
                                                    } else {
                                                        const matched = usersList.find(u => u.FullName === newValue.value);
                                                        setSignatoryDesignation(matched?.Designation || '');
                                                    }
                                                }
                                            }}
                                            options={computedSignatoryOptions.length > 0 ? computedSignatoryOptions : computedPreparedByOptions}
                                            value={signatory ? { label: signatory, value: signatory } : null}
                                            placeholder="Select or Type Signatory..."
                                            styles={{
                                                control: (base) => ({ ...base, minHeight: '34px', fontSize: '13px' }),
                                                valueContainer: (base) => ({ ...base, padding: '0 8px' }),
                                                input: (base) => ({ ...base, margin: 0, padding: 0 }),
                                            }}
                                        />
                                    </div>

                                    <div style={{ marginBottom: '10px' }}>
                                        <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Signatory Designation</label>
                                        <input
                                            type="text"
                                            value={signatoryDesignation}
                                            onChange={(e) => setSignatoryDesignation(e.target.value)}
                                            placeholder="Signatory's Title..."
                                            style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px' }}
                                        />
                                    </div>

                                    <hr style={{ border: 'none', borderTop: '1px solid #e2e8f0', margin: '15px 0' }} />
                                    <h5 style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Recipient Info (Optional Override):</h5>

                                    <div style={{ marginBottom: '10px' }}>
                                        <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>To Address</label>
                                        <textarea
                                            value={toAddress}
                                            onChange={(e) => setToAddress(e.target.value)}
                                            rows={2}
                                            placeholder="Client Address..."
                                            style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', resize: 'vertical', fontSize: '12px' }}
                                        />
                                    </div>

                                    <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                                        <div style={{ flex: 1 }}>
                                            <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Phone</label>
                                            <input
                                                type="text"
                                                value={toPhone}
                                                onChange={(e) => setToPhone(e.target.value)}
                                                style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }}
                                            />
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Fax</label>
                                            <input
                                                type="text"
                                                value={toFax}
                                                onChange={(e) => setToFax(e.target.value)}
                                                style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }}
                                            />
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Email</label>
                                            <input
                                                type="email"
                                                value={toEmail}
                                                onChange={(e) => setToEmail(e.target.value)}
                                                style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Template Section */}
                                <div style={{ padding: '16px', borderBottom: '1px solid #e2e8f0', background: '#fff' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                        <h4 style={{ margin: 0, fontSize: '13px', color: '#475569' }}>Clause Templates:</h4>
                                    </div>

                                    {/* Save Template */}
                                    <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                                        <input
                                            type="text"
                                            placeholder="New Template Name"
                                            value={savedTemplateName}
                                            onChange={(e) => setSavedTemplateName(e.target.value)}
                                            style={{ flex: 1, padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }}
                                        />
                                        <button onClick={handleSaveTemplate} style={{ padding: '6px 12px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
                                            Save
                                        </button>
                                    </div>

                                    {/* Load Template */}
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <select
                                            value={selectedTemplateId}
                                            onChange={(e) => setSelectedTemplateId(e.target.value)}
                                            style={{ flex: 1, padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }}
                                        >
                                            <option value="">Select Template...</option>
                                            {templates.map(t => (
                                                <option key={t.ID} value={t.ID}>{t.TemplateName}</option>
                                            ))}
                                        </select>
                                        <button onClick={handleLoadTemplate} disabled={!selectedTemplateId} style={{ padding: '6px', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer', color: '#334155' }} title="Load">
                                            <FolderOpen size={14} />
                                        </button>
                                        <button onClick={handleDeleteTemplate} disabled={!selectedTemplateId} style={{ padding: '6px', background: '#fff', border: '1px solid #fee2e2', borderRadius: '4px', cursor: 'pointer', color: '#ef4444' }} title="Delete">
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>

                                {/* Clause Checkboxes */}
                                <div style={{ padding: '16px' }}>
                                    <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#475569' }}>Select & Reorder Clauses:</h4>
                                    {orderedClauses.map((id, index) => {

                                        const isCustom = id.startsWith('custom_');
                                        const customClause = isCustom ? customClauses.find(c => c.id === id) : null;
                                        const standardClause = !isCustom ? QUOTE_CLAUSE_DEFINITIONS.find(c => c.key === id) : null;

                                        if (!customClause && !standardClause) return null;

                                        const title = isCustom ? customClause.title : standardClause.title;
                                        const isChecked = isCustom ? customClause.isChecked : clauses[id];
                                        const contentKey = isCustom ? id : standardClause.contentKey;

                                        return (
                                            <div key={id} style={{ marginBottom: '8px', padding: '4px', background: isCustom ? '#fff' : 'transparent', borderBottom: '1px solid #f1f5f9' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    {/* Reorder Buttons */}
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                        <button
                                                            onClick={() => moveClause(index, 'up')}
                                                            disabled={index === 0}
                                                            style={{ padding: '0', cursor: index === 0 ? 'default' : 'pointer', border: 'none', background: 'none', color: index === 0 ? '#cbd5e1' : '#64748b' }}
                                                            title="Move Up"
                                                        >
                                                            <ChevronUp size={14} />
                                                        </button>
                                                        <button
                                                            onClick={() => moveClause(index, 'down')}
                                                            disabled={index === orderedClauses.length - 1}
                                                            style={{ padding: '0', cursor: index === orderedClauses.length - 1 ? 'default' : 'pointer', border: 'none', background: 'none', color: index === orderedClauses.length - 1 ? '#cbd5e1' : '#64748b' }}
                                                            title="Move Down"
                                                        >
                                                            <ChevronDown size={14} />
                                                        </button>
                                                    </div>

                                                    <label style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '8px', background: isChecked ? '#f0fdf4' : '#f8fafc', borderRadius: '6px', border: `1px solid ${isChecked ? '#86efac' : '#e2e8f0'}` }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={isChecked}
                                                            onChange={() => isCustom ? updateCustomClause(id, 'isChecked', !isChecked) : toggleClause(id)}
                                                            style={{ width: '16px', height: '16px' }}
                                                        />
                                                        <span style={{ fontSize: '13px', fontWeight: '500' }}>{title}</span>
                                                    </label>

                                                    {isCustom && (
                                                        <button
                                                            onClick={() => removeCustomClause(id)}
                                                            style={{ padding: '8px', color: '#ef4444', background: 'white', border: '1px solid #fee2e2', borderRadius: '6px', cursor: 'pointer' }}
                                                            title="Remove Clause"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    )}
                                                </div>


                                                {isChecked && (
                                                    <button
                                                        onClick={() => setExpandedClause(expandedClause === contentKey ? null : contentKey)}
                                                        style={{ marginTop: '4px', marginLeft: '32px', fontSize: '11px', color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer' }}
                                                    >
                                                        {expandedClause === contentKey ? '▼ Hide Editor' : '► Edit Content'}
                                                    </button>
                                                )}

                                                {expandedClause === contentKey && (
                                                    <div style={{ marginLeft: '32px' }}>
                                                        <ClauseEditor
                                                            html={isCustom ? customClause.content : clauseContent[contentKey]}
                                                            onChange={(val) => {
                                                                if (isCustom) updateCustomClause(id, 'content', val);
                                                                else updateClauseContent(contentKey, val);
                                                            }}
                                                            style={{
                                                                width: '100%',
                                                                marginTop: '8px',
                                                                padding: '12px',
                                                                border: '1px solid #e2e8f0',
                                                                borderRadius: '4px',
                                                                fontSize: '12px',
                                                                minHeight: '150px',
                                                                maxHeight: '400px',
                                                                overflowY: 'auto',
                                                                backgroundColor: 'white',
                                                                outline: 'none'
                                                            }}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}


                                    {/* Custom Clauses Section */}


                                    {/* Add New Clause Button */}
                                    <div style={{ marginTop: '16px', borderTop: '1px dashed #e2e8f0', paddingTop: '16px' }}>
                                        {isAddingClause ? (
                                            <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                                <input
                                                    type="text"
                                                    value={newClauseTitle}
                                                    onChange={(e) => setNewClauseTitle(e.target.value)}
                                                    placeholder="Clause Heading (e.g., Special Conditions)"
                                                    style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '13px', marginBottom: '8px' }}
                                                    autoFocus
                                                />
                                                <div style={{ display: 'flex', gap: '8px' }}>
                                                    <button onClick={addCustomClause} style={{ flex: 1, padding: '6px', background: '#3b82f6', color: 'white', borderRadius: '4px', border: 'none', fontSize: '12px', cursor: 'pointer' }}>Add</button>
                                                    <button onClick={() => setIsAddingClause(false)} style={{ flex: 1, padding: '6px', background: 'white', color: '#64748b', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px', cursor: 'pointer' }}>Cancel</button>
                                                </div>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => setIsAddingClause(true)}
                                                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '10px', background: 'white', color: '#3b82f6', border: '1px dashed #3b82f6', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '500' }}
                                            >
                                                <Plus size={16} /> Add New Clause
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '40px',
                        textAlign: 'center',
                        color: '#64748b',
                        background: '#f8fafc'
                    }}>
                        <div style={{ marginBottom: '16px', color: '#cbd5e1' }}>
                            <FolderOpen size={48} />
                        </div>
                        <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>No Customer Selected</h3>
                        <p style={{ fontSize: '13px', maxWidth: '200px' }}>
                            Please select a customer from the dropdown above to view pricing and create a quote.
                        </p>
                    </div>
                )
                }
            </div >

            {/* Resizer Handle */}
            < div
                onMouseDown={startResizing}
                title="Drag to resize sidebar"
                style={{
                    width: '10px',
                    backgroundColor: '#f1f5f9',
                    borderRight: '1px solid #e2e8f0',
                    borderLeft: '1px solid #e2e8f0',
                    cursor: 'col-resize',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 10,
                    transition: 'background-color 0.2s'
                }}
            >
                <div style={{ width: '4px', height: '32px', backgroundColor: '#cbd5e1', borderRadius: '2px' }}></div>
            </div >

            {/* Right Panel - Quote Preview */}
            < div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
                {
                    loading ? (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#64748b' }} >
                            Loading enquiry data...
                        </div >
                    ) : !enquiryData ? (
                        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div
                                className="no-print"
                                style={{
                                    flexShrink: 0,
                                    width: '100%',
                                    boxSizing: 'border-box',
                                    padding: '10px 12px',
                                    background: '#f8fafc',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: '8px',
                                    boxShadow: '0 2px 8px rgba(15, 23, 42, 0.06)',
                                }}
                            >
                                <div
                                    style={{
                                        display: 'flex',
                                        flexWrap: 'wrap',
                                        alignItems: 'center',
                                        justifyContent: 'flex-start',
                                        gap: '10px 16px',
                                        rowGap: '10px',
                                        width: '100%',
                                    }}
                                >
                                    <label
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            fontSize: '12px',
                                            fontWeight: '600',
                                            color: '#475569',
                                            margin: 0,
                                        }}
                                    >
                                        Category
                                        <select
                                            value={quoteListCategory}
                                            onChange={(e) => {
                                                const v = e.target.value;
                                                setQuoteListCategory(v);
                                                if (v === QUOTE_LIST_CATEGORY.PENDING) {
                                                    setQuoteSearchResults([]);
                                                }
                                            }}
                                            style={{
                                                minWidth: '148px',
                                                padding: '6px 10px',
                                                fontSize: '12px',
                                                borderRadius: '6px',
                                                border: '1px solid #cbd5e1',
                                                background: '#fff',
                                                color: '#334155',
                                                cursor: 'pointer',
                                            }}
                                        >
                                            <option value={QUOTE_LIST_CATEGORY.PENDING}>Pending Quote</option>
                                            <option value={QUOTE_LIST_CATEGORY.SEARCH}>Search Quote</option>
                                        </select>
                                    </label>
                                    <label
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            fontSize: '12px',
                                            fontWeight: '600',
                                            color: '#475569',
                                            margin: 0,
                                            flex: '1 1 200px',
                                            minWidth: '160px',
                                            maxWidth: '360px',
                                        }}
                                    >
                                        Search criteria
                                        <input
                                            type="text"
                                            value={quoteListSearchCriteria}
                                            onChange={(e) => setQuoteListSearchCriteria(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key !== 'Enter') return;
                                                e.preventDefault();
                                                if (quoteListCategory !== QUOTE_LIST_CATEGORY.SEARCH || quoteSearchLoading) return;
                                                handleQuoteListSearch();
                                            }}
                                            disabled={quoteListCategory !== QUOTE_LIST_CATEGORY.SEARCH}
                                            placeholder={
                                                quoteListCategory === QUOTE_LIST_CATEGORY.SEARCH
                                                    ? 'Quote ref, project, enquiry no., customer, client, consultant, prepared by…'
                                                    : 'Select "Search Quote" to enable'
                                            }
                                            style={{
                                                flex: 1,
                                                minWidth: '120px',
                                                padding: '6px 10px',
                                                fontSize: '12px',
                                                borderRadius: '6px',
                                                border: '1px solid #cbd5e1',
                                                background: quoteListCategory === QUOTE_LIST_CATEGORY.SEARCH ? '#fff' : '#f1f5f9',
                                                color: '#334155',
                                                opacity: quoteListCategory === QUOTE_LIST_CATEGORY.SEARCH ? 1 : 0.65,
                                                cursor: quoteListCategory === QUOTE_LIST_CATEGORY.SEARCH ? 'text' : 'not-allowed',
                                            }}
                                        />
                                    </label>
                                    <div
                                        style={{
                                            display: 'flex',
                                            flexWrap: 'wrap',
                                            alignItems: 'center',
                                            gap: '8px',
                                            fontSize: '12px',
                                            fontWeight: '600',
                                            color: '#475569',
                                            opacity: quoteListCategory === QUOTE_LIST_CATEGORY.SEARCH ? 1 : 0.65,
                                        }}
                                    >
                                        <span style={{ whiteSpace: 'nowrap' }}>From</span>
                                        <div
                                            style={{
                                                width: '128px',
                                                pointerEvents: quoteListCategory === QUOTE_LIST_CATEGORY.SEARCH ? 'auto' : 'none',
                                            }}
                                        >
                                            <DateInput
                                                value={quoteListDateFrom}
                                                onChange={(e) => setQuoteListDateFrom(e.target.value)}
                                                disabled={quoteListCategory !== QUOTE_LIST_CATEGORY.SEARCH}
                                                placeholder="DD-MMM-YYYY"
                                                style={{
                                                    fontSize: '12px',
                                                    padding: '6px 8px',
                                                    cursor: quoteListCategory === QUOTE_LIST_CATEGORY.SEARCH ? 'pointer' : 'not-allowed',
                                                }}
                                            />
                                        </div>
                                        <span style={{ whiteSpace: 'nowrap' }}>To</span>
                                        <div
                                            style={{
                                                width: '128px',
                                                pointerEvents: quoteListCategory === QUOTE_LIST_CATEGORY.SEARCH ? 'auto' : 'none',
                                            }}
                                        >
                                            <DateInput
                                                value={quoteListDateTo}
                                                onChange={(e) => setQuoteListDateTo(e.target.value)}
                                                disabled={quoteListCategory !== QUOTE_LIST_CATEGORY.SEARCH}
                                                placeholder="DD-MMM-YYYY"
                                                style={{
                                                    fontSize: '12px',
                                                    padding: '6px 8px',
                                                    cursor: quoteListCategory === QUOTE_LIST_CATEGORY.SEARCH ? 'pointer' : 'not-allowed',
                                                }}
                                            />
                                        </div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
                                            <button
                                                type="button"
                                                className="no-print"
                                                onClick={handleQuoteListSearch}
                                                disabled={quoteListCategory !== QUOTE_LIST_CATEGORY.SEARCH || quoteSearchLoading}
                                                style={{
                                                    padding: '6px 14px',
                                                    fontSize: '12px',
                                                    fontWeight: '600',
                                                    borderRadius: '6px',
                                                    border: '1px solid #2563eb',
                                                    background: quoteListCategory === QUOTE_LIST_CATEGORY.SEARCH ? '#2563eb' : '#e2e8f0',
                                                    color: quoteListCategory === QUOTE_LIST_CATEGORY.SEARCH ? '#fff' : '#94a3b8',
                                                    cursor: quoteListCategory === QUOTE_LIST_CATEGORY.SEARCH && !quoteSearchLoading ? 'pointer' : 'not-allowed',
                                                }}
                                            >
                                                {quoteSearchLoading ? 'Searching…' : 'Search'}
                                            </button>
                                            <button
                                                type="button"
                                                className="no-print"
                                                onClick={handleQuoteListClear}
                                                style={{
                                                    padding: '6px 14px',
                                                    fontSize: '12px',
                                                    fontWeight: '600',
                                                    borderRadius: '6px',
                                                    border: '1px solid #cbd5e1',
                                                    background: '#fff',
                                                    color: '#475569',
                                                    cursor: 'pointer',
                                                }}
                                            >
                                                Clear
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            {quoteListDisplayRows.length > 0 ? (
                                (() => {
                                    const sortedPendingQuotes = [...quoteListDisplayRows].sort((a, b) => {
                                        const { field, direction } = pendingQuotesSortConfig;
                                        let aVal = a[field];
                                        let bVal = b[field];
                                        if (field === 'DueDate' || field === 'EnquiryDate' || field === 'ListQuoteDate') {
                                            aVal = aVal ? new Date(aVal).getTime() : Infinity;
                                            bVal = bVal ? new Date(bVal).getTime() : Infinity;
                                        } else {
                                            aVal = (aVal || '').toString().toLowerCase();
                                            bVal = (bVal || '').toString().toLowerCase();
                                        }
                                        if (aVal < bVal) return direction === 'asc' ? -1 : 1;
                                        if (aVal > bVal) return direction === 'asc' ? 1 : -1;
                                        return 0;
                                    });
                                    const quoteSortField = pendingQuotesSortConfig.field;
                                    const quoteSortDir = pendingQuotesSortConfig.direction;
                                    const activeSortLabel = quoteSortField === 'DueDate' ? 'Due Date'
                                        : quoteSortField === 'RequestNo' ? 'Enquiry No.'
                                            : quoteSortField === 'ProjectName' ? 'Project Name'
                                                : quoteSortField === 'ListQuoteRef' ? 'Quote ref.'
                                                    : quoteSortField === 'ListQuoteDate' ? 'Quote date'
                                                        : quoteSortField === 'CustomerName' ? 'Customer'
                                                            : quoteSortField === 'ClientName' ? 'Client Name'
                                                                : quoteSortField === 'ConsultantName' ? 'Consultant Name'
                                                                    : quoteSortField === 'ListPreparedBy' ? 'Prepared by'
                                                                        : quoteSortField;
                                    const renderQSH = (field, label, style = {}) => {
                                        const isActive = quoteSortField === field;
                                        const isAsc = quoteSortDir === 'asc';
                                        return (
                                            <th
                                                key={field}
                                                onClick={() => setPendingQuotesSortConfig(prev =>
                                                    prev.field === field
                                                        ? { field, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
                                                        : { field, direction: 'asc' }
                                                )}
                                                style={{
                                                    padding: '10px 16px', textAlign: 'left', fontSize: '12px',
                                                    fontWeight: '600', color: isActive ? '#0284c7' : '#64748b',
                                                    borderBottom: '1px solid #e2e8f0', cursor: 'pointer',
                                                    userSelect: 'none', whiteSpace: 'nowrap', ...style
                                                }}
                                            >
                                                {label}{isActive ? (isAsc ? ' ▲' : ' ▼') : <span style={{ color: '#cbd5e1' }}> ⇅</span>}
                                            </th>
                                        );
                                    };
                                    return (
                                        <div style={{ background: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', width: '100%', margin: '0 auto' }}>
                                            <div style={{ padding: '16px 24px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <h2 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                    <FileText size={20} className="text-blue-600" />{' '}
                                                    {quoteListCategory === QUOTE_LIST_CATEGORY.SEARCH
                                                        ? `Search results (${quoteListDisplayRows.length})`
                                                        : `Pending updates (${quoteListDisplayRows.length})`}
                                                </h2>
                                                <span style={{ fontSize: '12px', color: '#64748b' }}>
                                                    Sorted by <strong>{activeSortLabel}</strong> {quoteSortDir === 'asc' ? '(Soonest first)' : '(Latest first)'}
                                                </span>
                                            </div>
                                            <div style={{ flex: 1, overflowY: 'auto' }}>
                                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                                    <thead style={{ background: '#f8fafc', position: 'sticky', top: 0, zIndex: 1 }}>
                                                        <tr>
                                                            {renderQSH('RequestNo', 'Enquiry No.', { width: '80px' })}
                                                            {renderQSH('ProjectName', 'Project Name', { minWidth: '234px' })}
                                                            {renderQSH('ListQuoteRef', 'Quote ref.', { minWidth: '120px' })}
                                                            {renderQSH('ListQuoteDate', 'Quote date', { minWidth: '110px' })}
                                                            {renderQSH('CustomerName', 'Customer Name')}
                                                            {renderQSH('DueDate', 'Due Date', { minWidth: '110px' })}
                                                            <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>Subjob Prices (Base Price)</th>
                                                            {renderQSH('ClientName', 'Client Name', { minWidth: '200px' })}
                                                            {renderQSH('ConsultantName', 'Consultant Name', { minWidth: '200px' })}
                                                            {renderQSH('ListPreparedBy', 'Prepared by', { minWidth: '160px' })}
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {sortedPendingQuotes.map((enq, idx) => (
                                                            <tr
                                                                key={enq.QuoteListKind ? `${enq.RequestNo}-${enq.QuoteListKind}` : `${String(enq.RequestNo ?? 'r')}-${String(enq.ListPendingPvId ?? enq.listpendingpvid ?? '').trim() || `row-${idx}`}`}
                                                                style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer', transition: 'background 0.15s' }}
                                                                onMouseOver={(e) => e.currentTarget.style.background = '#f8fafc'}
                                                                onMouseOut={(e) => e.currentTarget.style.background = 'white'}
                                                                onClick={() => handleSelectEnquiry(enq)}
                                                            >
                                                                <td style={{ padding: '12px 16px', fontSize: '13px', color: '#1e293b', fontWeight: '500', verticalAlign: 'top' }}>
                                                                    {enq.RequestNo}
                                                                    {quoteListCategory === QUOTE_LIST_CATEGORY.SEARCH && enq.QuoteListKind ? (
                                                                        <span style={{ marginLeft: '6px', fontSize: '10px', fontWeight: '600', color: enq.QuoteListKind === 'pending' ? '#b45309' : '#047857', textTransform: 'uppercase' }}>
                                                                            {enq.QuoteListKind === 'pending' ? 'To quote' : 'Quoted'}
                                                                        </span>
                                                                    ) : null}
                                                                </td>
                                                                <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b', verticalAlign: 'top', minWidth: '234px' }}>{enq.ProjectName || '-'}</td>
                                                                <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b', verticalAlign: 'top', minWidth: '132px' }}>
                                                                    <div style={{ whiteSpace: 'nowrap' }}>{enq.ListQuoteRef || '-'}</div>
                                                                    {enq.ListQuoteUnderRefTotal != null && enq.ListQuoteUnderRefTotal > 0 ? (
                                                                        <div style={{ marginTop: '6px', fontSize: '11px', fontWeight: '600', color: '#166534', whiteSpace: 'nowrap' }}>
                                                                            BD {Number(enq.ListQuoteUnderRefTotal).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                                        </div>
                                                                    ) : null}
                                                                </td>
                                                                <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b', verticalAlign: 'top', minWidth: '110px', whiteSpace: 'nowrap' }}>
                                                                    {enq.ListQuoteDate
                                                                        ? (() => {
                                                                            try {
                                                                                const d = new Date(enq.ListQuoteDate);
                                                                                return Number.isNaN(d.getTime()) ? '-' : format(d, 'dd-MMM-yyyy');
                                                                            } catch {
                                                                                return '-';
                                                                            }
                                                                        })()
                                                                        : '-'}
                                                                </td>
                                                                <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b', verticalAlign: 'top', minWidth: '250px' }}>
                                                                    {enq.CustomerName ? enq.CustomerName.split(',').map((cust, i) => {
                                                                        const cName = cust.trim();
                                                                        if (!cName) return null;

                                                                        // Skip the user's own division/job — they are the quoting party, not a customer
                                                                        const userDept = (currentUser?.Department || '').trim().toLowerCase();
                                                                        const cNorm = normalize(cName);
                                                                        const deptNorm = normalize(userDept);
                                                                        if (userDept && (cNorm === deptNorm || cNorm.includes(deptNorm) || deptNorm.includes(cNorm))) return null;

                                                                        const quoteMap = {};
                                                                        (enq.QuotedCustomers || '').split(';;').filter(Boolean).forEach(p => {
                                                                            const parts = p.split('|');
                                                                            if (parts.length >= 2) {
                                                                                const key = normalize(parts[0]);
                                                                                const valStr = parts[1].replace(/,/g, '');
                                                                                const val = parseFloat(valStr) || 0;
                                                                                quoteMap[key] = (quoteMap[key] || 0) + val;
                                                                            }
                                                                        });
                                                                        const pricingMap = {};
                                                                        (enq.PricingCustomerDetails || '').split(';;').filter(Boolean).forEach(p => {
                                                                            const parts = p.split('|');
                                                                            if (parts.length >= 2) {
                                                                                const key = normalize(parts[0]);
                                                                                const val = parseFloat(parts[1]) || 0;
                                                                                pricingMap[key] = (pricingMap[key] || 0) + val;
                                                                            }
                                                                        });


                                                                        const cNameNorm = normalize(cName);
                                                                        let quotedVal = quoteMap[cNameNorm];
                                                                        let pricingVal = pricingMap[cNameNorm];

                                                                        if (quotedVal === undefined) {
                                                                            // Fuzzy match: check if one contains the other
                                                                            const fuzzyKey = Object.keys(quoteMap).find(k => cNameNorm.includes(k) || k.includes(cNameNorm));
                                                                            if (fuzzyKey) quotedVal = quoteMap[fuzzyKey];
                                                                        }
                                                                        if (pricingVal === undefined) {
                                                                            const fuzzyKey = Object.keys(pricingMap).find(k => cNameNorm.includes(k) || k.includes(cNameNorm));
                                                                            if (fuzzyKey) pricingVal = pricingMap[fuzzyKey];
                                                                        }

                                                                        const displayQuoted = quotedVal !== undefined
                                                                            ? quotedVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                                                            : null;

                                                                        const displayPricing = pricingVal !== undefined && pricingVal > 0
                                                                            ? pricingVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                                                            : null;

                                                                        return (
                                                                            <div key={i} style={{ marginBottom: '4px' }}>
                                                                                <span style={{ fontWeight: '500', color: '#334155', whiteSpace: 'nowrap' }}>{cName}</span>
                                                                            </div>
                                                                        );
                                                                    }) : '-'}
                                                                </td>

                                                                <td style={{ padding: '12px 16px', fontSize: '13px', color: '#dc2626', fontWeight: '500', verticalAlign: 'top', minWidth: '110px', whiteSpace: 'nowrap' }}>{enq.DueDate ? format(new Date(enq.DueDate), 'dd-MMM-yyyy') : '-'}</td>
                                                                <td style={{ padding: '12px 16px', verticalAlign: 'top' }}>
                                                                    {(enq.SubJobPrices || enq.subJobPrices) ? (enq.SubJobPrices || enq.subJobPrices).split(';;').filter(Boolean).map((s, i) => {
                                                                        const parts = s.split('|');
                                                                        const name = parts[0];
                                                                        const rawPrice = parts[1];
                                                                        const rawDate = parts[2];
                                                                        const rawLevel = parts[3];

                                                                        const level = parseInt(rawLevel) || 0;
                                                                        const isUpdated = rawPrice && rawPrice !== 'Not Updated' && parseFloat(rawPrice) > 0;

                                                                        let displayPrice = rawPrice;
                                                                        if (isUpdated) {
                                                                            const num = parseFloat(rawPrice);
                                                                            if (!isNaN(num)) displayPrice = num.toLocaleString(undefined, { minimumFractionDigits: 2 });
                                                                        }

                                                                        let displayDate = '';
                                                                        if (rawDate) {
                                                                            try {
                                                                                displayDate = format(new Date(rawDate), 'dd-MMM-yy hh:mm a');
                                                                            } catch (e) { }
                                                                        }

                                                                        return (
                                                                            <div key={i} style={{
                                                                                fontSize: '11px',
                                                                                marginBottom: '4px',
                                                                                whiteSpace: 'nowrap',
                                                                                marginLeft: `${level * 20}px`,
                                                                                display: 'flex',
                                                                                alignItems: 'center',
                                                                                gap: '4px'
                                                                            }}>
                                                                                {level > 0 && <span style={{ color: '#94a3b8', marginRight: '2px' }}>↳</span>}
                                                                                <span style={{ fontWeight: '600', color: '#475569' }}>{name}:</span>
                                                                                <span style={{
                                                                                    color: isUpdated ? '#166534' : '#94a3b8',
                                                                                    marginLeft: '4px',
                                                                                    fontStyle: isUpdated ? 'normal' : 'italic',
                                                                                    background: isUpdated ? '#dcfce7' : '#f1f5f9',
                                                                                    padding: '1px 6px',
                                                                                    borderRadius: '4px',
                                                                                    fontSize: '10px'
                                                                                }}>
                                                                                    {isUpdated ? `BD ${displayPrice}` : 'Not Updated'}
                                                                                </span>
                                                                                {isUpdated && displayDate && (
                                                                                    <span style={{ marginLeft: '6px', color: '#94a3b8', fontSize: '10px' }}>
                                                                                        ({displayDate})
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                        );
                                                                    }) : (
                                                                        <div style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' }}>No subjobs found</div>
                                                                    )}
                                                                </td>
                                                                <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b', verticalAlign: 'top', minWidth: '200px' }}>{enq.ClientName || enq.clientName || '-'}</td>
                                                                <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b', verticalAlign: 'top', minWidth: '200px' }}>{enq.ConsultantName || enq.consultantName || '-'}</td>
                                                                <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b', verticalAlign: 'top', minWidth: '160px' }}>{enq.ListPreparedBy || enq.listpreparedby || '-'}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    );
                                })()
                            ) : (
                                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '14px', fontStyle: 'italic', background: 'white', borderRadius: '8px', border: '1px dashed #e2e8f0' }}>
                                    {quoteListCategory === QUOTE_LIST_CATEGORY.SEARCH
                                        ? 'No results for this search. Try different text or enquiry dates (both required when search text is empty).'
                                        : 'No pending updates found. Start by entering an enquiry number above.'}
                                </div>
                            )}
                        </div>
                    ) : (!enquiryData.leadJobPrefix || !toName?.trim()) ? (
                        <div style={{
                            height: '100%',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '40px',
                            textAlign: 'center',
                            color: '#64748b',
                            background: 'white',
                            borderRadius: '8px',
                            border: '1px solid #e2e8f0'
                        }}>
                            <div style={{ marginBottom: '16px', color: '#cbd5e1' }}>
                                <Plus size={48} />
                            </div>
                            <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>New Quote Preview</h3>
                            <p style={{ fontSize: '13px', maxWidth: '300px' }}>
                                Once a customer and lead job are selected, you can preview the generated quote here.
                            </p>
                        </div>
                    ) : (
                        <div
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                width: '100%',
                                minHeight: 0,
                            }}
                        >
                            {/* Sticky top bar — horizontal, left-aligned; stays under right-panel scroll */}
                            <div
                                className="no-print"
                                style={{
                                    position: 'sticky',
                                    top: 0,
                                    zIndex: 20,
                                    flexShrink: 0,
                                    width: '100%',
                                    boxSizing: 'border-box',
                                    marginBottom: '12px',
                                    padding: '10px 12px',
                                    background: '#f8fafc',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: '8px',
                                    boxShadow: '0 2px 8px rgba(15, 23, 42, 0.06)',
                                }}
                            >
                                <div
                                    style={{
                                        display: 'flex',
                                        flexWrap: 'wrap',
                                        alignItems: 'center',
                                        justifyContent: 'flex-start',
                                        gap: '10px 16px',
                                        rowGap: '10px',
                                        width: '100%',
                                    }}
                                >
                                    <label
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            fontSize: '12px',
                                            fontWeight: '600',
                                            color: '#475569',
                                            margin: 0,
                                        }}
                                    >
                                        Category
                                        <select
                                            value={quoteListCategory}
                                            onChange={(e) => {
                                                const v = e.target.value;
                                                setQuoteListCategory(v);
                                                if (v === QUOTE_LIST_CATEGORY.PENDING) {
                                                    setQuoteSearchResults([]);
                                                }
                                            }}
                                            style={{
                                                minWidth: '148px',
                                                padding: '6px 10px',
                                                fontSize: '12px',
                                                borderRadius: '6px',
                                                border: '1px solid #cbd5e1',
                                                background: '#fff',
                                                color: '#334155',
                                                cursor: 'pointer',
                                            }}
                                        >
                                            <option value={QUOTE_LIST_CATEGORY.PENDING}>Pending Quote</option>
                                            <option value={QUOTE_LIST_CATEGORY.SEARCH}>Search Quote</option>
                                        </select>
                                    </label>
                                    <label
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            fontSize: '12px',
                                            fontWeight: '600',
                                            color: '#475569',
                                            margin: 0,
                                            flex: '1 1 200px',
                                            minWidth: '160px',
                                            maxWidth: '360px',
                                        }}
                                    >
                                        Search criteria
                                        <input
                                            type="text"
                                            value={quoteListSearchCriteria}
                                            onChange={(e) => setQuoteListSearchCriteria(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key !== 'Enter') return;
                                                e.preventDefault();
                                                if (quoteListCategory !== QUOTE_LIST_CATEGORY.SEARCH || quoteSearchLoading) return;
                                                handleQuoteListSearch();
                                            }}
                                            disabled={quoteListCategory !== QUOTE_LIST_CATEGORY.SEARCH}
                                            placeholder={
                                                quoteListCategory === QUOTE_LIST_CATEGORY.SEARCH
                                                    ? 'Quote ref, project, enquiry no., customer, client, consultant, prepared by…'
                                                    : 'Select "Search Quote" to enable'
                                            }
                                            style={{
                                                flex: 1,
                                                minWidth: '120px',
                                                padding: '6px 10px',
                                                fontSize: '12px',
                                                borderRadius: '6px',
                                                border: '1px solid #cbd5e1',
                                                background: quoteListCategory === QUOTE_LIST_CATEGORY.SEARCH ? '#fff' : '#f1f5f9',
                                                color: '#334155',
                                                opacity: quoteListCategory === QUOTE_LIST_CATEGORY.SEARCH ? 1 : 0.65,
                                                cursor: quoteListCategory === QUOTE_LIST_CATEGORY.SEARCH ? 'text' : 'not-allowed',
                                            }}
                                        />
                                    </label>
                                    <div
                                        style={{
                                            display: 'flex',
                                            flexWrap: 'wrap',
                                            alignItems: 'center',
                                            gap: '8px',
                                            fontSize: '12px',
                                            fontWeight: '600',
                                            color: '#475569',
                                            opacity: quoteListCategory === QUOTE_LIST_CATEGORY.SEARCH ? 1 : 0.65,
                                        }}
                                    >
                                        <span style={{ whiteSpace: 'nowrap' }}>From</span>
                                        <div
                                            style={{
                                                width: '128px',
                                                pointerEvents: quoteListCategory === QUOTE_LIST_CATEGORY.SEARCH ? 'auto' : 'none',
                                            }}
                                        >
                                            <DateInput
                                                value={quoteListDateFrom}
                                                onChange={(e) => setQuoteListDateFrom(e.target.value)}
                                                disabled={quoteListCategory !== QUOTE_LIST_CATEGORY.SEARCH}
                                                placeholder="DD-MMM-YYYY"
                                                style={{
                                                    fontSize: '12px',
                                                    padding: '6px 8px',
                                                    cursor: quoteListCategory === QUOTE_LIST_CATEGORY.SEARCH ? 'pointer' : 'not-allowed',
                                                }}
                                            />
                                        </div>
                                        <span style={{ whiteSpace: 'nowrap' }}>To</span>
                                        <div
                                            style={{
                                                width: '128px',
                                                pointerEvents: quoteListCategory === QUOTE_LIST_CATEGORY.SEARCH ? 'auto' : 'none',
                                            }}
                                        >
                                            <DateInput
                                                value={quoteListDateTo}
                                                onChange={(e) => setQuoteListDateTo(e.target.value)}
                                                disabled={quoteListCategory !== QUOTE_LIST_CATEGORY.SEARCH}
                                                placeholder="DD-MMM-YYYY"
                                                style={{
                                                    fontSize: '12px',
                                                    padding: '6px 8px',
                                                    cursor: quoteListCategory === QUOTE_LIST_CATEGORY.SEARCH ? 'pointer' : 'not-allowed',
                                                }}
                                            />
                                        </div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
                                            <button
                                                type="button"
                                                className="no-print"
                                                onClick={handleQuoteListSearch}
                                                disabled={quoteListCategory !== QUOTE_LIST_CATEGORY.SEARCH || quoteSearchLoading}
                                                style={{
                                                    padding: '6px 14px',
                                                    fontSize: '12px',
                                                    fontWeight: '600',
                                                    borderRadius: '6px',
                                                    border: '1px solid #2563eb',
                                                    background: quoteListCategory === QUOTE_LIST_CATEGORY.SEARCH ? '#2563eb' : '#e2e8f0',
                                                    color: quoteListCategory === QUOTE_LIST_CATEGORY.SEARCH ? '#fff' : '#94a3b8',
                                                    cursor: quoteListCategory === QUOTE_LIST_CATEGORY.SEARCH && !quoteSearchLoading ? 'pointer' : 'not-allowed',
                                                }}
                                            >
                                                {quoteSearchLoading ? 'Searching…' : 'Search'}
                                            </button>
                                            <button
                                                type="button"
                                                className="no-print"
                                                onClick={handleQuoteListClear}
                                                style={{
                                                    padding: '6px 14px',
                                                    fontSize: '12px',
                                                    fontWeight: '600',
                                                    borderRadius: '6px',
                                                    border: '1px solid #cbd5e1',
                                                    background: '#fff',
                                                    color: '#475569',
                                                    cursor: 'pointer',
                                                }}
                                            >
                                                Clear
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            {/* Attachments Bar (Outlook Style) */}
                            <div className="no-print" style={{
                                marginBottom: '16px',
                                padding: '12px 16px',
                                background: '#f8fafc',
                                border: '1px solid #e2e8f0',
                                borderRadius: '8px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '12px'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#475569', fontSize: '13px', fontWeight: '600' }}>
                                        <Paperclip size={18} className="text-blue-500" />
                                        <span>Attachments {quoteAttachments.length > 0 && `(${quoteAttachments.length})`}</span>
                                        <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 'normal', marginLeft: '8px' }}>
                                            (Click 'Add Files' or <span style={{ color: '#3b82f6', fontWeight: '500' }}>Paste (Ctrl+V)</span> files - <span style={{ color: '#10b981', fontWeight: '600' }}>{quoteId ? 'Ready' : 'Pending Save'}</span>)
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button
                                            onClick={downloadPDF}
                                            disabled={!hasUserPricing}
                                            style={{
                                                fontSize: '11px',
                                                color: 'white',
                                                background: '#ef4444',
                                                border: '1px solid #ef4444',
                                                padding: '4px 12px',
                                                borderRadius: '4px',
                                                cursor: 'pointer',
                                                fontWeight: '600',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '4px',
                                                opacity: !hasUserPricing ? 0.5 : 1
                                            }}
                                        >
                                            <Download size={14} /> PDF Download
                                        </button>
                                        <button
                                            onClick={() => fileInputRef.current?.click()}
                                            style={{
                                                fontSize: '11px',
                                                color: '#3b82f6',
                                                background: 'white',
                                                border: '1px solid #3b82f6',
                                                padding: '4px 12px',
                                                borderRadius: '4px',
                                                cursor: 'pointer',
                                                fontWeight: '600',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '4px'
                                            }}
                                        >
                                            <Plus size={14} /> Add Files
                                        </button>
                                    </div>
                                    <input
                                        type="file"
                                        multiple
                                        ref={fileInputRef}
                                        onChange={(e) => uploadFiles(e.target.files)}
                                        style={{ display: 'none' }}
                                    />
                                </div>

                                {(quoteAttachments.length > 0 || pendingFiles.length > 0) ? (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                                        {pendingFiles.map((file, idx) => (
                                            <div
                                                key={`pending-${idx}`}
                                                className="attachment-card"
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '10px',
                                                    padding: '8px 12px',
                                                    background: '#fff7ed', // Orange tint for pending
                                                    border: '1px dashed #f97316',
                                                    borderRadius: '6px',
                                                    width: '240px',
                                                    maxWidth: '240px',
                                                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                                                    transition: 'all 0.2s',
                                                    position: 'relative'
                                                }}
                                            >
                                                <div style={{
                                                    width: '32px',
                                                    height: '32px',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    background: '#ffedd5',
                                                    borderRadius: '4px',
                                                    color: '#f97316'
                                                }}>
                                                    <FileText size={18} />
                                                </div>
                                                <div style={{ flex: 1, overflow: 'hidden' }}>
                                                    <div style={{ fontSize: '12px', fontWeight: '600', color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={file.name}>
                                                        {file.name}
                                                    </div>
                                                    <div style={{ fontSize: '10px', color: '#f97316', fontWeight: '600' }}>
                                                        Pending Save...
                                                    </div>
                                                </div>
                                                <div style={{ display: 'flex', gap: '2px' }}>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setPendingFiles(prev => prev.filter((_, i) => i !== idx));
                                                        }}
                                                        style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px', borderRadius: '4px' }}
                                                        title="Remove"
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}

                                        {quoteAttachments.map(att => (
                                            <div
                                                key={att.ID}
                                                className="attachment-card"
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '10px',
                                                    padding: '8px 12px',
                                                    background: 'white',
                                                    border: '1px solid #e2e8f0',
                                                    borderRadius: '6px',
                                                    width: '240px',
                                                    maxWidth: '240px',
                                                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                                                    transition: 'all 0.2s',
                                                    position: 'relative',
                                                    group: 'true'
                                                }}
                                            >
                                                <div style={{
                                                    width: '32px',
                                                    height: '32px',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    background: att.FileName.toLowerCase().endsWith('.pdf') ? '#fee2e2' : '#e0f2fe',
                                                    borderRadius: '4px',
                                                    color: att.FileName.toLowerCase().endsWith('.pdf') ? '#ef4444' : '#3b82f6'
                                                }}>
                                                    <FileText size={18} />
                                                </div>
                                                <div style={{ flex: 1, overflow: 'hidden' }}>
                                                    <div style={{ fontSize: '12px', fontWeight: '600', color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={att.FileName}>
                                                        {att.FileName}
                                                    </div>
                                                    <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                                                        {format(new Date(att.UploadedAt), 'dd MMM, HH:mm')}
                                                    </div>
                                                </div>
                                                <div style={{ display: 'flex', gap: '2px' }}>
                                                    <button
                                                        onClick={() => handleDownloadAttachment(att.ID, att.FileName)}
                                                        style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', padding: '4px', borderRadius: '4px' }}
                                                        title="Download"
                                                        onMouseOver={(e) => e.currentTarget.style.background = '#f1f5f9'}
                                                        onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                                                    >
                                                        <Download size={14} />
                                                    </button>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleDeleteAttachment(att.ID); }}
                                                        style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px', borderRadius: '4px' }}
                                                        title="Remove"
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div style={{
                                        border: '1px dashed #cbd5e1',
                                        borderRadius: '6px',
                                        padding: '12px',
                                        textAlign: 'center',
                                        fontSize: '12px',
                                        color: '#94a3b8',
                                        background: '#ffffff'
                                    }}>
                                        {quoteId ? "No attachments yet. Paste files here or Click 'Add Files' to attach documents." : "Start adding attachments anytime. They will be uploaded when you Save."}
                                    </div>
                                )}

                                {isUploading && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: '#3b82f6', fontWeight: '500' }}>
                                        <div className="animate-spin" style={{ width: '12px', height: '12px', border: '2px solid #3b82f6', borderTopColor: 'transparent', borderRadius: '50%' }}></div>
                                        Please wait...
                                    </div>
                                )}
                            </div>

                            {/* Print root: repeat header/footer are siblings of #quote-preview so position:fixed works in print (not inside absolute #quote-preview). */}
                            <div
                                id="quote-print-root"
                                data-print-with-header={printWithHeader ? '1' : '0'}
                                style={{ maxWidth: '210mm', margin: '0 auto', width: '100%', boxSizing: 'border-box' }}
                            >
                                <div className="quote-print-repeat-strip" aria-hidden="true">
                                    <div style={{ display: 'flex', alignItems: 'center', width: '100%', justifyContent: 'flex-end' }}>
                                        {quoteLogoDisplaySrc ? (
                                            <img src={quoteLogoDisplaySrc} alt="" style={{ height: '48px', width: 'auto', maxWidth: '180px', objectFit: 'contain' }} />
                                        ) : null}
                                    </div>
                                </div>
                                <div className="quote-print-page-indicator" aria-hidden="true" />
                                <div className="quote-print-footer-rule" aria-hidden="true" />

                            <style>{tableStyles}</style>
                            <style>
                                {`
                                .quote-print-repeat-strip,
                                .quote-print-page-indicator {
                                    display: none;
                                }
                                .header-section.quote-header-row {
                                    width: 100%;
                                    box-sizing: border-box;
                                }
                                .quote-header-address-col,
                                .quote-header-quote-col {
                                    min-width: 0;
                                }
                                .quote-clause-measure-host {
                                    position: absolute;
                                    left: -99999px;
                                    top: 0;
                                    pointer-events: none;
                                    visibility: hidden;
                                }
                                #quote-preview {
                                    display: flex;
                                    flex-direction: column;
                                    gap: 20px;
                                    border: none !important;
                                    outline: none !important;
                                }
                                .quote-document-root {
                                    border: none !important;
                                    outline: none !important;
                                }
                                .quote-a4-sheet {
                                    position: relative;
                                    background: #fff;
                                    box-sizing: border-box;
                                    max-width: 210mm;
                                    margin-left: auto;
                                    margin-right: auto;
                                    margin-bottom: 0;
                                    padding: 15mm;
                                    min-height: 297mm;
                                    border: none !important;
                                    outline: none !important;
                                    box-shadow: none;
                                    border-radius: 0;
                                    display: grid;
                                    grid-template-columns: minmax(0, 1fr);
                                    grid-template-rows: auto minmax(0, 1fr) auto;
                                    align-content: stretch;
                                }
                                .quote-sheet-main-flex {
                                    min-width: 0;
                                    min-height: 0;
                                    height: 100%;
                                    display: flex;
                                    flex-direction: column;
                                }
                                .quote-sheet-footer-push {
                                    flex-shrink: 0;
                                }
                                .quote-sheet-logo-row {
                                    flex-shrink: 0;
                                    display: flex;
                                    justify-content: flex-end;
                                    width: 100%;
                                }
                                .quote-continuation-header {
                                    display: flex;
                                    align-items: center;
                                    justify-content: flex-end;
                                    flex-shrink: 0;
                                    margin-bottom: 16px;
                                    padding-bottom: 0;
                                    border-bottom: none;
                                }
                                .quote-footer-full-rule {
                                    width: 100%;
                                    margin: 10px 0 0 0;
                                    padding: 0;
                                    border: 0;
                                    border-top: 1px solid #e2e8f0;
                                    height: 0;
                                    box-sizing: border-box;
                                }
                                .quote-print-footer-rule {
                                    display: none;
                                }
                                .quote-page-num-screen {
                                    margin-left: 50%;
                                    width: 50%;
                                    max-width: 50%;
                                    box-sizing: border-box;
                                    text-align: right;
                                    font-size: 11px;
                                    font-weight: 600;
                                    color: #64748b;
                                    padding-bottom: 6px;
                                }
                                @media print {
                                    body * {
                                        visibility: hidden;
                                    }
                                    #quote-print-root,
                                    #quote-print-root * {
                                        visibility: visible !important;
                                    }
                                    #quote-print-root {
                                        position: relative;
                                        left: 0;
                                        top: 0;
                                        width: 100%;
                                        max-width: none !important;
                                        margin: 0 !important;
                                        padding: 0 !important;
                                        padding-top: 18mm !important;
                                        padding-bottom: 44mm !important;
                                        box-sizing: border-box;
                                        background: white;
                                    }
                                    #quote-preview {
                                        position: relative !important;
                                        left: auto !important;
                                        top: auto !important;
                                        width: 100% !important;
                                        max-width: none !important;
                                        margin: 0 !important;
                                        padding: 0 !important;
                                        box-shadow: none !important;
                                        background: white !important;
                                        border: none !important;
                                        outline: none !important;
                                        display: block !important;
                                        gap: 0 !important;
                                    }
                                    .quote-clause-measure-host {
                                        display: none !important;
                                        visibility: hidden !important;
                                        height: 0 !important;
                                        overflow: hidden !important;
                                    }
                                    .quote-a4-sheet {
                                        box-shadow: none !important;
                                        border-radius: 0 !important;
                                        margin-bottom: 0 !important;
                                        min-height: 0 !important;
                                        page-break-after: always !important;
                                        break-after: page !important;
                                        border: none !important;
                                        outline: none !important;
                                    }
                                    .quote-a4-sheet:last-child {
                                        page-break-after: auto !important;
                                        break-after: auto !important;
                                    }
                                    @page {
                                        size: A4 portrait;
                                        margin: 12mm 14mm 14mm 14mm;
                                    }
                                    .no-print {
                                        display: none !important;
                                    }
                                    .page-one { min-height: 0 !important; }
                                    .page-break {
                                        page-break-before: always !important;
                                        break-before: page !important;
                                        min-height: 0 !important;
                                        margin-top: 0 !important;
                                    }
                                    .quote-header-address-col,
                                    .quote-header-quote-col {
                                        flex: 0 0 50% !important;
                                        width: 50% !important;
                                        max-width: 50% !important;
                                    }
                                    .quote-clause-block {
                                        break-inside: avoid-page;
                                        page-break-inside: avoid;
                                    }
                                    [data-print-with-header="1"] .quote-print-repeat-strip {
                                        display: flex !important;
                                        visibility: visible !important;
                                        position: fixed !important;
                                        top: 0;
                                        left: 14mm;
                                        right: 14mm;
                                        height: 18mm;
                                        align-items: center;
                                        justify-content: flex-end;
                                        gap: 10px;
                                        background: #fff !important;
                                        border-bottom: none !important;
                                        z-index: 2147483646;
                                        -webkit-print-color-adjust: exact !important;
                                        print-color-adjust: exact !important;
                                    }
                                    [data-print-with-header="1"] .quote-print-footer-rule {
                                        display: block !important;
                                        visibility: visible !important;
                                        position: fixed !important;
                                        left: 14mm;
                                        right: 14mm;
                                        bottom: 27mm;
                                        height: 0;
                                        margin: 0;
                                        padding: 0;
                                        border: 0;
                                        border-top: 1px solid #e2e8f0;
                                        z-index: 2147483645;
                                        -webkit-print-color-adjust: exact !important;
                                        print-color-adjust: exact !important;
                                    }
                                    [data-print-with-header="1"] .quote-footer-full-rule {
                                        visibility: hidden !important;
                                        height: 0 !important;
                                        margin: 0 !important;
                                        border: none !important;
                                    }
                                    [data-print-with-header="1"] .quote-print-repeat-strip img {
                                        max-height: 14mm;
                                        width: auto;
                                        object-fit: contain;
                                    }
                                    [data-print-with-header="1"] .print-logo-section {
                                        visibility: hidden !important;
                                        height: 0 !important;
                                        overflow: hidden !important;
                                        margin: 0 !important;
                                        padding: 0 !important;
                                    }
                                    [data-print-with-header="1"] .quote-sheet-logo-row {
                                        display: none !important;
                                        height: 0 !important;
                                        overflow: hidden !important;
                                        margin: 0 !important;
                                        padding: 0 !important;
                                    }
                                    [data-print-with-header="1"] .quote-print-page-indicator {
                                        display: block !important;
                                        visibility: visible !important;
                                        position: fixed !important;
                                        bottom: 34mm;
                                        right: 14mm;
                                        width: 50%;
                                        margin-left: 50%;
                                        text-align: right;
                                        font-size: 9pt;
                                        color: #64748b;
                                        z-index: 2147483645;
                                    }
                                    [data-print-with-header="1"] .quote-print-page-indicator::after {
                                        content: "Page " counter(page);
                                    }
                                    [data-print-with-header="1"] .quote-print-page-indicator::after {
                                        content: "Page " counter(page) " / " counter(pages);
                                    }
                                    [data-print-with-header="1"] .footer-section {
                                        position: fixed !important;
                                        visibility: visible !important;
                                        bottom: 10mm;
                                        right: 14mm;
                                        width: 50% !important;
                                        max-width: 50% !important;
                                        margin: 0 !important;
                                        margin-left: 50% !important;
                                        padding: 8px 0 0 0 !important;
                                        border-top: none !important;
                                        font-size: 9pt !important;
                                        text-align: right !important;
                                        background: #fff !important;
                                        z-index: 2147483646;
                                    }
                                    [data-print-with-header="0"] .quote-print-repeat-strip,
                                    [data-print-with-header="0"] .quote-print-page-indicator {
                                        display: none !important;
                                    }
                                    .quote-page-num-screen {
                                        display: none !important;
                                    }
                                    .quote-a4-clause-sheet {
                                        page-break-before: always !important;
                                        break-before: page !important;
                                    }
                                    [data-print-with-header="1"] .quote-continuation-header {
                                        display: none !important;
                                    }
                                }
                            `}
                            </style>

                            {/* Document Container — dark stack behind A4 “sheets” (screen); print flattens to white. */}
                            <div
                                id="quote-preview"
                                ref={quotePreviewLayoutRef}
                                className="quote-document-root"
                                style={{
                                    background: '#3f3f46',
                                    padding: 0,
                                    border: 'none',
                                    outline: 'none',
                                    borderRadius: 0,
                                    boxShadow: 'none',
                                    maxWidth: '210mm',
                                    margin: '0 auto',
                                    minHeight: 'auto',
                                    boxSizing: 'border-box',
                                    position: 'relative',
                                }}
                            >
                                <div
                                    ref={clauseMeasureHostRef}
                                    className="quote-clause-measure-host"
                                    aria-hidden
                                >
                                    {activeClausesList.map((clause, i) => (
                                        <div
                                            key={`m-${clause.listKey}`}
                                            data-clause-measure-index={i}
                                            className="quote-clause-block"
                                            style={{ marginBottom: '20px' }}
                                        >
                                            <h3 style={{ fontSize: '15px', fontWeight: '600', color: '#1e293b', marginBottom: '10px' }}>
                                                {i + 1}. {clause.title}
                                            </h3>
                                            <div
                                                style={{ fontSize: '13px', lineHeight: '1.6', paddingLeft: '15px', whiteSpace: 'pre-wrap' }}
                                                className="clause-content"
                                                dangerouslySetInnerHTML={{ __html: clause.content || '' }}
                                            />
                                        </div>
                                    ))}
                                </div>

                                <div className="quote-a4-sheet page-one">
                                    {/* Logo-only row; address + quote table align below this */}
                                    <div className="quote-sheet-logo-row" style={{ width: '100%', marginBottom: '20px' }}>
                                        <div style={{ textAlign: 'right', width: '100%' }}>
                                            {quoteLogoDisplaySrc ? (
                                                <img
                                                    src={quoteLogoDisplaySrc}
                                                    onError={(e) => console.error('[QuoteForm] Logo load fail:', e.target.src)}
                                                    alt="Company Logo"
                                                    style={{ height: '68px', width: 'auto', maxWidth: '212px', objectFit: 'contain' }}
                                                />
                                            ) : null}
                                        </div>
                                    </div>

                                    <div className="quote-sheet-main-flex">
                                        {/* 50% address | 50% quote details — top-aligned with each other */}
                                        <div
                                            className="header-section quote-header-row"
                                            style={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                marginBottom: '40px',
                                                alignItems: 'flex-start',
                                                width: '100%',
                                                boxSizing: 'border-box',
                                            }}
                                        >
                                            <div
                                                className="quote-header-address-col"
                                                style={{
                                                    flex: '0 0 50%',
                                                    width: '50%',
                                                    maxWidth: '50%',
                                                    boxSizing: 'border-box',
                                                    paddingRight: '12px',
                                                }}
                                            >
                                                <div style={{ fontWeight: '600', marginBottom: '8px', fontSize: '14px', color: '#334155' }}>To,</div>
                                                <div style={{ fontWeight: 'bold', color: '#0f172a', marginBottom: '4px', fontSize: '14px' }}>{toName}</div>
                                                {toAddress && <div style={{ fontSize: '13px', color: '#64748b', whiteSpace: 'pre-line', lineHeight: '1.5', marginBottom: '4px' }}>{toAddress}</div>}
                                                {toPhone && <div style={{ fontSize: '13px', color: '#64748b' }}>Tel: {toPhone} {toFax ? ` | Fax: ${toFax}` : ''}</div>}
                                                {toEmail && <div style={{ fontSize: '13px', color: '#64748b' }}>Email: {toEmail}</div>}
                                            </div>

                                            <div
                                                className="quote-header-quote-col"
                                                style={{
                                                    flex: '0 0 50%',
                                                    width: '50%',
                                                    maxWidth: '50%',
                                                    boxSizing: 'border-box',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    alignItems: 'flex-start',
                                                    paddingLeft: '12px',
                                                }}
                                            >
                                                <table
                                                    style={{
                                                        fontSize: '13px',
                                                        borderCollapse: 'collapse',
                                                        textAlign: 'left',
                                                        marginLeft: 'auto',
                                                        width: '100%',
                                                        tableLayout: 'fixed',
                                                    }}
                                                >
                                                    <colgroup>
                                                        <col style={{ width: '40%' }} />
                                                        <col style={{ width: '60%' }} />
                                                    </colgroup>
                                                    <tbody>
                                                        <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}>
                                                            <td style={{ padding: '4px 16px', fontWeight: 'bold', color: '#334155', verticalAlign: 'top' }}>Quote Ref:</td>
                                                            <td style={{ padding: '4px 16px', fontWeight: 'bold', color: loadedQuoteOutOfActiveTabScope ? '#ef4444' : (quoteNumber != null && String(quoteNumber).trim()) || (quoteId != null && String(quoteId).trim() !== '') ? '#0f172a' : '#ef4444', wordBreak: 'break-word', overflowWrap: 'anywhere', verticalAlign: 'top' }}>{loadedQuoteOutOfActiveTabScope ? 'Draft' : (quoteNumber != null && String(quoteNumber).trim()) ? String(quoteNumber).trim() : (quoteId != null && String(quoteId).trim() !== '') ? '—' : 'Draft'}</td>
                                                        </tr>
                                                        <tr><td style={{ padding: '2px 16px', fontWeight: '600', color: '#64748b', verticalAlign: 'top' }}>Date:</td><td style={{ padding: '2px 16px', wordBreak: 'break-word', overflowWrap: 'anywhere', verticalAlign: 'top' }}>{formatDate(quoteDate)}</td></tr>
                                                        <tr>
                                                            <td style={{ padding: '2px 16px', fontWeight: '600', color: '#64748b', verticalAlign: 'top' }}>Prepared By:</td>
                                                            <td style={{ padding: '2px 16px', wordBreak: 'break-word', overflowWrap: 'anywhere', verticalAlign: 'top' }}>
                                                                {preparedBy || 'N/A'}
                                                                {preparedByContactFromMaster ? (
                                                                    <>
                                                                        <br />
                                                                        <span style={{ fontWeight: '500', color: '#475569' }}>Tel: {preparedByContactFromMaster}</span>
                                                                    </>
                                                                ) : null}
                                                            </td>
                                                        </tr>
                                                        <tr><td style={{ padding: '2px 16px', fontWeight: '600', color: '#64748b', verticalAlign: 'top' }}>Type:</td><td style={{ padding: '2px 16px', wordBreak: 'break-word', overflowWrap: 'anywhere', verticalAlign: 'top' }}>{(quoteTypeList.length ? quoteTypeList.join(', ') : null) || enquiryData.enquiry.EnquiryType || 'Tender'}</td></tr>
                                                        <tr><td style={{ padding: '2px 16px', fontWeight: '600', color: '#64748b', verticalAlign: 'top' }}>Your Ref:</td><td style={{ padding: '2px 16px', wordBreak: 'break-word', overflowWrap: 'anywhere', verticalAlign: 'top' }}>{customerReference}</td></tr>
                                                        <tr><td style={{ padding: '2px 16px', fontWeight: '600', color: '#64748b', verticalAlign: 'top' }}>Validity:</td><td style={{ padding: '2px 16px', wordBreak: 'break-word', overflowWrap: 'anywhere', verticalAlign: 'top' }}>{getValidityDate()}</td></tr>
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>

                                        {/* Subject Section */}
                                        <table style={{ width: '100%', marginBottom: '24px', fontSize: '14px', borderCollapse: 'collapse' }}>
                                            <tbody>
                                                <tr style={{ background: '#f8fafc', borderTop: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0' }}>
                                                    <td style={{ fontWeight: 'bold', padding: '10px 12px', width: '140px', color: '#334155' }}>Project Name:</td>
                                                    <td style={{ padding: '10px 12px', fontWeight: '700', color: '#0f172a' }}>{quotePreviewProjectName || enquiryData.enquiry.ProjectName}</td>
                                                </tr>
                                                <tr>
                                                    <td style={{ fontWeight: '600', padding: '8px 12px', color: '#64748b' }}>Subject:</td>
                                                    <td style={{ padding: '8px 12px' }}>{quotePreviewSubject || subject}</td>
                                                </tr>
                                                <tr>
                                                    <td style={{ fontWeight: '600', padding: '8px 12px', color: '#64748b' }}>Attention of:</td>
                                                    <td style={{ padding: '8px 12px', fontWeight: '500' }}>
                                                        {toAttention ? toAttention.split(',').map(n => n.trim()).join(', ') : 'N/A'}
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>

                                        {/* Dear Sir/Madam */}
                                        <div style={{ marginBottom: '20px' }}>
                                            <p>Dear Sir/Madam,</p>
                                            <p>Thank you for providing us with this opportunity to submit our offer for the below-mentioned inclusions. We have carefully reviewed your requirements to ensure that our proposal aligns perfectly. We are pleased to submit our quotation as per the details mentioned below. It is our pleasure to serve you and we assure you that our best efforts will always be made to meet your needs.</p>
                                            <p>We hope you will find our offer competitive and kindly revert to us for any clarifications.</p>
                                        </div>

                                        {sanitizedPageOneClauseIndices.map((clauseIdx) => {
                                            const clause = activeClausesList[clauseIdx];
                                            if (!clause) return null;
                                            return (
                                                <div key={clause.listKey} className="quote-clause-block" style={{ marginBottom: '20px', pageBreakInside: 'avoid' }}>
                                                    <h3 style={{ fontSize: '15px', fontWeight: '600', color: '#1e293b', marginBottom: '10px' }}>
                                                        {clauseIdx + 1}. {clause.title}
                                                    </h3>
                                                    <div
                                                        style={{ fontSize: '13px', lineHeight: '1.6', paddingLeft: '15px', whiteSpace: 'pre-wrap' }}
                                                        className="clause-content"
                                                        dangerouslySetInnerHTML={{ __html: clause.content || '' }}
                                                    />
                                                </div>
                                            );
                                        })}
                                        <div className="quote-sheet-main-flex-fill" style={{ flex: '1 1 auto', minHeight: 0 }} aria-hidden />
                                    </div>

                                    {/* Bottom Section (Signature + Footer) — pinned to sheet bottom when content is short */}
                                    <div className="quote-sheet-footer-push" style={{ pageBreakInside: 'avoid' }}>

                                        {/* Signature Section */}
                                        <div style={{ marginTop: 0 }}>
                                            <div style={{ marginBottom: '112px' }}>
                                                For {quoteCompanyName || quotePreviewEnquiryCompanyFallback?.name || 'Almoayyed Contracting'},
                                            </div>
                                            <div style={{ fontWeight: '600' }}>{signatory || 'N/A'}</div>
                                            <div style={{ fontSize: '13px', color: '#64748b' }}>{signatoryDesignation || ''}</div>
                                        </div>

                                        {/* Page number (screen); print uses fixed strip / @page where supported */}
                                        <div className="quote-page-num-screen">
                                            Page 1 / {quotePreviewTotalPages}
                                        </div>
                                        <div className="quote-footer-full-rule" aria-hidden="true" />

                                        {/* Footer: right half only (A4 / print layout) */}
                                        <div
                                            className="footer-section"
                                            style={{
                                                marginTop: '8px',
                                                marginLeft: '50%',
                                                width: '50%',
                                                maxWidth: '50%',
                                                paddingTop: '15px',
                                                fontSize: '11px',
                                                color: '#64748b',
                                                textAlign: 'right',
                                                boxSizing: 'border-box',
                                            }}
                                        >
                                            <div>{footerDetails?.name || quotePreviewEnquiryCompanyFallback?.name || 'Almoayyed Contracting'}</div>
                                            <div>{footerDetails?.address || quotePreviewEnquiryCompanyFallback?.address || 'P.O. Box 32232, Manama, Kingdom of Bahrain'}</div>
                                            <div>
                                                {footerDetails?.phone ? `Tel: ${footerDetails.phone}` : (quotePreviewEnquiryCompanyFallback?.phone ? `Tel: ${quotePreviewEnquiryCompanyFallback.phone}` : 'Tel: (+973) 17 400 407')}
                                                {' | '}
                                                Fax: {footerDetails?.fax || quotePreviewEnquiryCompanyFallback?.fax || '(+973) 17 400 396'}
                                            </div>
                                            <div>E-mail: {footerDetails?.email || quotePreviewEnquiryCompanyFallback?.email || 'bms@almcg.com'}</div>
                                        </div>
                                    </div>
                                    {quoteDigitalStamps
                                        .filter((s) => s.sheetIndex === 0)
                                        .map((stamp) => (
                                            <QuoteSignatureStamp
                                                key={stamp.id}
                                                stamp={stamp}
                                                onRemove={handleRemoveDigitalStamp}
                                                onMove={handleMoveDigitalStamp}
                                                allowRemove={!hasPersistedQuoteForScope}
                                            />
                                        ))}
                                </div>

                                {sanitizedClausePageGroups.map((group, sheetIdx) => (
                                    <div
                                        key={`clause-page-${sheetIdx}-${group.join('-')}`}
                                        className="quote-a4-sheet quote-a4-clause-sheet page-break"
                                    >
                                        <div className="quote-continuation-header">
                                            {quoteLogoDisplaySrc ? (
                                                <img
                                                    src={quoteLogoDisplaySrc}
                                                    alt=""
                                                    style={{ height: '48px', width: 'auto', maxWidth: '180px', objectFit: 'contain' }}
                                                />
                                            ) : null}
                                        </div>

                                        <div className="quote-sheet-main-flex">
                                            {group.map((clauseIdx) => {
                                                const clause = activeClausesList[clauseIdx];
                                                if (!clause) return null;
                                                return (
                                                    <div key={clause.listKey} className="quote-clause-block" style={{ marginBottom: '20px', pageBreakInside: 'avoid' }}>
                                                        <h3 style={{ fontSize: '15px', fontWeight: '600', color: '#1e293b', marginBottom: '10px' }}>
                                                            {clauseIdx + 1}. {clause.title}
                                                        </h3>
                                                        <div
                                                            style={{ fontSize: '13px', lineHeight: '1.6', paddingLeft: '15px', whiteSpace: 'pre-wrap' }}
                                                            className="clause-content"
                                                            dangerouslySetInnerHTML={{ __html: clause.content }}
                                                        />
                                                    </div>
                                                );
                                            })}
                                            <div className="quote-sheet-main-flex-fill" style={{ flex: '1 1 auto', minHeight: 0 }} aria-hidden />
                                        </div>

                                        <div className="quote-continuation-footer quote-sheet-footer-push">
                                            <div className="quote-page-num-screen">
                                                Page {sheetIdx + 2} / {quotePreviewTotalPages}
                                            </div>
                                            <div className="quote-footer-full-rule" aria-hidden="true" />
                                            <div
                                                style={{
                                                    marginLeft: '50%',
                                                    width: '50%',
                                                    maxWidth: '50%',
                                                    paddingTop: '12px',
                                                    fontSize: '11px',
                                                    color: '#64748b',
                                                    textAlign: 'right',
                                                    boxSizing: 'border-box',
                                                }}
                                            >
                                                <div>{footerDetails?.name || quotePreviewEnquiryCompanyFallback?.name || 'Almoayyed Contracting'}</div>
                                                <div>{footerDetails?.address || quotePreviewEnquiryCompanyFallback?.address || 'P.O. Box 32232, Manama, Kingdom of Bahrain'}</div>
                                                <div>
                                                    {footerDetails?.phone ? `Tel: ${footerDetails.phone}` : (quotePreviewEnquiryCompanyFallback?.phone ? `Tel: ${quotePreviewEnquiryCompanyFallback.phone}` : 'Tel: (+973) 17 400 407')}
                                                    {' | '}
                                                    Fax: {footerDetails?.fax || quotePreviewEnquiryCompanyFallback?.fax || '(+973) 17 400 396'}
                                                </div>
                                                <div>E-mail: {footerDetails?.email || quotePreviewEnquiryCompanyFallback?.email || 'bms@almcg.com'}</div>
                                            </div>
                                        </div>
                                        {quoteDigitalStamps
                                            .filter((s) => s.sheetIndex === sheetIdx + 1)
                                            .map((stamp) => (
                                                <QuoteSignatureStamp
                                                    key={stamp.id}
                                                    stamp={stamp}
                                                    onRemove={handleRemoveDigitalStamp}
                                                    onMove={handleMoveDigitalStamp}
                                                    allowRemove={!hasPersistedQuoteForScope}
                                                />
                                            ))}
                                    </div>
                                ))}
                            </div>
                            </div>
                        </div>
                    )
                }
            </div >
            <SignatureVaultModal
                open={signatureVaultOpen}
                onClose={() => setSignatureVaultOpen(false)}
                userEmail={(currentUser?.EmailId || currentUser?.email || '').trim()}
                placementEnabled
                totalSheets={quotePreviewTotalPages}
                onPlaceStamp={handlePlaceDigitalStamp}
                displayName={signatory || preparedBy || currentUser?.FullName || currentUser?.name || ''}
                designation={signatoryDesignation || ''}
            />
        </div >
    );
};

export default QuoteForm;

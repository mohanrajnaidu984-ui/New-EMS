import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { FileText, Save, Printer, Mail, Plus, ChevronDown, ChevronUp, X, Trash2, FolderOpen, Paperclip, Download, PenTool, GripVertical } from 'lucide-react';
import CreatableSelect from 'react-select/creatable';
import { format, parseISO, addDays } from 'date-fns';
import DateInput from '../Enquiry/DateInput';
import { useAuth } from '../../context/AuthContext';
import ClauseEditor from './ClauseEditor';
import { resolveQuoteSummaryPriceFromRows } from './quoteEnquiryPricingLookup';
import ListBoxControl from '../Enquiry/ListBoxControl';
import { enquiryType as defaultEnquiryTypeOptions } from '../../data/mockData';
import { buildQuotePrintDocumentHtml, captureQuotePrintRootInnerHtmlForPdf } from './quotePrintDocumentHtml';
import {
    SignatureVaultModal,
    QuoteSignatureStamp,
    makeVerificationCode,
    loadStampsForEnquiry,
    saveStampsForEnquiry,
    loadSignatureLibrary,
    resolveDefaultSignatureImage,
    EMS_QUOTE_PLACE_STAMP_EVENT,
    parseDigitalSignaturesFromQuoteRow,
    serializeDigitalStampsForApi,
} from './QuoteDigitalSignature';

/** Confirms this file is the bundle executed by Vite (Main.jsx → ./Quote/QuoteForm). Hard-refresh if missing. */
console.log("QUOTE FILE LOADED");

const API_BASE = '';

/** Right-panel quote filter row (category drives which fields are enabled). */
const QUOTE_LIST_CATEGORY = {
    PENDING: 'pending_quote',
    SEARCH: 'search_quote',
};

/** Must match server `normalizeQuoteFormDraftUserEmail` (draft list is scoped to this user only). */
function normalizeDraftUserEmailForApi(raw) {
    return String(raw || '')
        .trim()
        .toLowerCase()
        .replace(/@almcg\.com/g, '@almoayyedcg.com');
}

/** Calendar YYYY-MM-DD for <input type="date" /> from EnquiryQuotes row (avoids TZ off-by-one on ISO datetimes). */
function quoteRowDateToInputYmd(quote) {
    if (!quote) return new Date().toISOString().split('T')[0];
    const ymd = quote.QuoteDateYmd ?? quote.quoteDateYmd;
    if (ymd && /^\d{4}-\d{2}-\d{2}$/.test(String(ymd).trim())) return String(ymd).trim();
    const raw = quote.QuoteDate ?? quote.quoteDate;
    if (raw == null || raw === '') return new Date().toISOString().split('T')[0];
    if (typeof raw === 'string') {
        const m = raw.trim().match(/^(\d{4}-\d{2}-\d{2})/);
        if (m) return m[1];
    }
    if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
        const y = raw.getFullYear();
        const mo = String(raw.getMonth() + 1).padStart(2, '0');
        const da = String(raw.getDate()).padStart(2, '0');
        return `${y}-${mo}-${da}`;
    }
    return new Date().toISOString().split('T')[0];
}

/**
 * A4 header block for **subjob** quote tabs: every value comes from the EnquiryQuotes row (not left-panel state).
 */
function buildSubjobQuoteHeaderDisplayFromRow(q, usersList, preparedByOptions) {
    if (!q || typeof q !== 'object') return null;
    const norm = (s) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const email = String(q.PreparedByEmail ?? q.preparedbyemail ?? '').toLowerCase().trim();
    let contact = '';
    if (email && Array.isArray(usersList)) {
        const u = usersList.find((x) => String(x.EmailId || x.email || '').toLowerCase().trim() === email);
        if (u?.MobileNumber != null) {
            contact = String(u.MobileNumber).trim().replace(/^tel\s*:?\s*/i, '').trim();
        }
    }
    const prepName = String(q.PreparedBy ?? q.preparedby ?? '').trim();
    if (!contact && prepName && Array.isArray(usersList)) {
        const n = norm(prepName);
        const fromU = usersList.find((x) => norm(x.FullName) === n);
        if (fromU?.MobileNumber != null) {
            contact = String(fromU.MobileNumber).trim().replace(/^tel\s*:?\s*/i, '').trim();
        }
    }
    if (!contact && prepName && Array.isArray(preparedByOptions)) {
        const n = norm(prepName);
        const po = preparedByOptions.find(
            (o) => norm(String(o.value || '')) === n || norm(String(o.label || '')) === n
        );
        const pMob = (po?.mobileNumber != null ? String(po.mobileNumber) : '').trim();
        if (pMob) contact = pMob.replace(/^tel\s*:?\s*/i, '').trim();
    }
    const ymd = quoteRowDateToInputYmd(q);
    let validityDisplay = '';
    try {
        const base = /^\d{4}-\d{2}-\d{2}$/.test(String(ymd).trim())
            ? parseISO(String(ymd).trim())
            : new Date(ymd);
        if (!Number.isNaN(base.getTime())) {
            validityDisplay = format(
                addDays(base, parseInt(q.ValidityDays ?? q.validitydays ?? 30, 10)),
                'dd-MMM-yyyy'
            );
        }
    } catch {
        validityDisplay = '';
    }
    const typeParts = String(q.QuoteType ?? q.quotetype ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    const quoteTypeLine = typeParts.length ? typeParts.join(', ') : '—';
    return {
        toName: String(q.ToName ?? q.toname ?? '').trim(),
        toAddress: String(q.ToAddress ?? q.toaddress ?? '').trim(),
        toPhone: String(q.ToPhone ?? q.tophone ?? '').trim(),
        toFax: String(q.ToFax ?? q.tofax ?? '').trim(),
        toEmail: String(q.ToEmail ?? q.toemail ?? '').trim(),
        toAttention: String(q.ToAttention ?? q.toattention ?? '').trim(),
        preparedBy: prepName,
        preparedByContact: contact,
        quoteNumber: String(q.QuoteNumber ?? q.quoteNumber ?? '').trim(),
        quoteDateYmd: ymd,
        validityDisplay,
        quoteTypeLine,
        customerReference: String(
            q.CustomerReference ?? q.customerreference ?? q.YourRef ?? q.yourref ?? ''
        ).trim(),
        subject: String(q.Subject ?? q.subject ?? '').trim(),
        signatory: String(q.Signatory ?? q.signatory ?? '').trim(),
        signatoryDesignation: String(q.SignatoryDesignation ?? q.signatorydesignation ?? '').trim(),
    };
}

function formatQuoteYmdForDisplay(ymd) {
    if (!ymd) return '';
    const s = String(ymd).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        try {
            return format(parseISO(s), 'dd-MMM-yyyy');
        } catch {
            return s;
        }
    }
    try {
        return format(new Date(s), 'dd-MMM-yyyy');
    } catch {
        return s;
    }
}

/**
 * Rollup key from API for colour + label. Accepts optional trailing "(…)" and ignores it for display.
 * Shown text is only: None Quoted | Partial Quoted | All Quoted (no parenthetical hint).
 */
function normalizeListQuoteRollupKey(raw) {
    let s = String(raw || '').trim();
    if (s === 'All Quoted' || s === 'Partial Quoted' || s === 'None Quoted') return s;
    const base = s.replace(/\s*\([^)]*\)\s*$/g, '').trim();
    if (base === 'All Quoted' || base === 'Partial Quoted' || base === 'None Quoted') return base;
    return 'None Quoted';
}

function formatListQuoteRollupStatusLine(raw) {
    return normalizeListQuoteRollupKey(raw);
}

function listQuoteRollupStatusColor(raw) {
    const k = normalizeListQuoteRollupKey(raw);
    if (k === 'All Quoted') return '#047857';
    if (k === 'Partial Quoted') return '#b45309';
    return '#64748b';
}

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

/** Canonical section numbers baked into default clause HTML (1.x, 2.x, …). Renumber when clause order changes. */
const CLAUSE_MAJOR_BY_LIST_KEY = {
    showScopeOfWork: 1,
    showBasisOfOffer: 2,
    showExclusions: 3,
    showPricingTerms: 4,
    showSchedule: 5,
    showWarranty: 6,
    showResponsibilityMatrix: 7,
    showTermsConditions: 8,
    showBillOfQuantity: null,
    showAcceptance: null,
};

function renumberClauseMajorInHtml(html, fromMajor, toMajor) {
    if (fromMajor == null || toMajor == null || fromMajor === toMajor || html == null) return html;
    const from = Number(fromMajor);
    const to = Number(toMajor);
    if (!Number.isFinite(from) || !Number.isFinite(to)) return String(html);
    return String(html).replace(new RegExp(`(?<![0-9.])${from}\\.(?=\\d)`, 'g'), `${to}.`);
}

/** Put each N.M. / N.M.K. sub-clause on its own line in the rendered quote (HTML or plain). */
function separateClauseSubNumberLines(html) {
    let s = String(html || '');
    if (!s.trim()) return s;
    if (!/<[a-z][\s\S]*>/i.test(s)) {
        s = s.replace(/\r?\n/g, '<br/>');
    }
    // "…follows:1.1." (no space) — break before first numbered sub-clause after : or ;
    s = s.replace(/([:;])(?=(?<![0-9.])\d{1,2}\.\d{1,2}\.(?!\d))/g, '$1<br/>');
    s = s.replace(/(\s)(?=\d{1,2}\.\d{1,2}\.\d{1,2}\.)/g, '<br/>');
    s = s.replace(/(\s)(?=(?<![0-9.])\d{1,2}\.\d{1,2}\.(?!\d))/g, '<br/>');
    return s;
}

/** Preview/PDF body: remap 3.x → N.x when this clause is the Nth active clause; stack sub-clauses vertically. */
function getClauseDisplayBodyHtml(html, listKey, displayMajor) {
    const canon = CLAUSE_MAJOR_BY_LIST_KEY[listKey];
    let out = renumberClauseMajorInHtml(html, canon, displayMajor);
    out = separateClauseSubNumberLines(out);
    return out;
}

/** Stable id on the auto-built pricing summary table so `calculateSummary` can replace it without wiping user HTML. */
const EMS_AUTO_PRICE_SUMMARY_TABLE_ID = 'ems-auto-price-summary-table';

/**
 * Replace only the auto pricing table; keep prose / pasted content after it.
 * @param {string} prevHtml
 * @param {string} tableFullHtml full <table>...</table> including id
 * @param {string} proseFallback template tail (e.g. 4.1…) when there is no user tail yet
 */
function mergePricingTermsClauseHtml(prevHtml, tableFullHtml, proseFallback) {
    const prev = String(prevHtml || '').trim();
    const idAttr = EMS_AUTO_PRICE_SUMMARY_TABLE_ID.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const idRe = new RegExp(`<table[^>]*id=["']${idAttr}["'][^>]*>[\\s\\S]*?<\\/table>\\s*`, 'i');
    if (idRe.test(prev)) {
        const rest = prev.replace(idRe, '').trim();
        return `${tableFullHtml}\n${rest || String(proseFallback || '').trim()}`;
    }
    if (/^<table/i.test(prev)) {
        const rest = prev.replace(/^<table[\s\S]*?<\/table>\s*/i, '').trim();
        return `${tableFullHtml}\n${rest || String(proseFallback || '').trim()}`;
    }
    return `${tableFullHtml}\n${String(proseFallback || '').trim()}`;
}

/**
 * Align clause 4.1 lump-sum prose with the auto-table total: replaces `[Amount in figures and words]` and
 * an already-filled `shall be BD … (…)` segment (e.g. from a loaded revision) so the table and 4.1 stay in sync.
 * @param {(n: number) => string} numberToWordsFn e.g. numberToWordsBHD
 */
function syncPricingTerms41LumpSumProse(html, grandTotalNum, foundPricedOptional, numberToWordsFn) {
    const raw = String(html || '');
    if (foundPricedOptional || grandTotalNum <= 0 || !Number.isFinite(Number(grandTotalNum))) return raw;
    const formattedTotal = Number(grandTotalNum).toLocaleString(undefined, {
        minimumFractionDigits: 3,
        maximumFractionDigits: 3,
    });
    const words = numberToWordsFn(grandTotalNum);
    const totalString = `BD ${formattedTotal} (${words})`;

    let out = raw.replace(/\[Amount in figures and words\]/g, totalString);

    const bdFigures = String.raw`BD(?:\s|&nbsp;)*[\d,]+\.\d{2,4}(?:\s|&nbsp;)*\([^)]+\)`;
    const clause41Lump = new RegExp(
        String.raw`(4\.1\.[\s\S]{0,1800}?\bshall be\s*)(${bdFigures})`,
        'i'
    );
    if (clause41Lump.test(out)) {
        out = out.replace(clause41Lump, `$1${totalString}`);
    } else {
        out = out.replace(new RegExp(String.raw`(\bshall be\s*)(${bdFigures})`, 'i'), `$1${totalString}`);
    }
    return out;
}

/**
 * Clause 4 auto table: **only** the same rows as checked in Pricing Summary (`activeJobs`).
 * Names may differ by `L2 - ` prefix etc.; `jobNameMatchesActiveJobsList` aligns them.
 * @param {Array<{ name: string, items: Array<{ name: string, total: number }> }>} summary
 * @param {string[]} activeJobs checked job / group names from the Pricing Summary panel
 * @returns {{ tableHtml: string, htmlGrandTotal: number }}
 */
function buildEmsAutoPricingTableHtml(summary, activeJobs) {
    let tableHtml = `<table id="${EMS_AUTO_PRICE_SUMMARY_TABLE_ID}" style="width:100%;border-collapse:collapse;margin-bottom:12px;">`;
    tableHtml +=
        '<thead><tr style="background:#f8fafc;"><th style="padding:10px;border:1px solid #64748b;text-align:left;">Description</th><th style="padding:10px;border:1px solid #64748b;text-align:right;">Amount (BHD)</th></tr></thead>';
    tableHtml += '<tbody>';

    let htmlGrandTotal = 0;
    const checked = Array.isArray(activeJobs) ? activeJobs : [];

    (summary || []).forEach((grp) => {
        if (!grp?.name || !jobNameMatchesActiveJobsList(grp.name, checked)) return;

        const cleanedName = String(grp.name).replace(/^(LEAD JOB |SUB JOB) \/ /, '');

        tableHtml += `<tr><td colspan="2" style="padding:10px;border:1px solid #64748b;background-color:#f1f5f9;font-weight:bold;">${cleanedName}</td></tr>`;

        (grp.items || []).forEach((item) => {
            tableHtml += `<tr><td style="padding:10px;border:1px solid #64748b;padding-left:20px;">${item.name}</td><td style="padding:10px;border:1px solid #64748b;text-align:right;">BD ${item.total.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</td></tr>`;
        });

        (grp.items || []).forEach((item) => {
            if (item.name === 'Base Price') {
                htmlGrandTotal += item.total;
            }
        });
    });

    if (htmlGrandTotal > 0) {
        tableHtml += `<tr style="background:#f8fafc;font-weight:700;"><td style="padding:10px;border:1px solid #64748b;text-align:right;">Grand Total (Base Price)</td><td style="padding:10px;border:1px solid #64748b;text-align:right;">BD ${htmlGrandTotal.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</td></tr>`;
    }
    tableHtml += '</tbody></table>';

    return { tableHtml, htmlGrandTotal };
}

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

/**
 * Previous Quotes / Revisions: hide rows that have signature slots but no usable images.
 * NULL / missing column = legacy row → show. `[]` = unsigned / draft → show (was wrongly hidden).
 */
function quoteRevisionShowsInSignedOnlyList(q) {
    const raw = q?.DigitalSignaturesJson ?? q?.digitalSignaturesJson;
    if (raw == null || raw === undefined) return true;
    const s = typeof raw === 'string' ? raw.trim() : '';
    if (s === '' || s === '[]') return true;
    try {
        const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!Array.isArray(arr)) return true;
        if (arr.length === 0) return true;
        return arr.some((st) => st && typeof st.imageDataUrl === 'string' && st.imageDataUrl.length > 10);
    } catch {
        return true;
    }
}

/** Trailing "(L2)" on EnquiryCustomer / dropdown labels — ties external customer to a lead branch. */
const extractTaggedLeadCodeFromCustomerLabel = (label) => {
    const m = String(label || '').trim().match(/\(\s*(L\d+)\s*\)\s*$/i);
    return m ? m[1].toUpperCase() : '';
};

/**
 * Map selected customer (often typed without suffix) to L-code using enquiry customerOptions
 * (e.g. option "Contratech S.P.C (L2)" + selection "Contratech S.P.C" → "L2").
 */
const resolveLeadCodeFromCustomerSelection = (selectedCustomer, customerOptions) => {
    const tn = String(selectedCustomer || '').trim();
    if (!tn) return '';
    const fromDirect = extractTaggedLeadCodeFromCustomerLabel(tn);
    if (fromDirect) return fromDirect;
    const opts = Array.isArray(customerOptions) ? customerOptions : [];
    const ntn = normalize(tn);
    const ntk = normalizeCustomerKey(tn);
    const hits = [];
    for (const raw of opts) {
        const o = String(raw || '').trim();
        if (!o) continue;
        const code = extractTaggedLeadCodeFromCustomerLabel(o);
        if (!code) continue;
        const base = o.replace(/\(\s*L\d+\s*\)\s*$/i, '').trim();
        if (!base) continue;
        if (
            ntn === normalize(o) ||
            ntk === normalizeCustomerKey(o) ||
            ntn === normalize(base) ||
            ntk === normalizeCustomerKey(base)
        ) {
            hits.push(code);
        }
    }
    if (hits.length === 0) return '';
    const uniq = [...new Set(hits)];
    return uniq.length === 1 ? uniq[0] : '';
};

const extractLeadCodeFromPricingJob = (job) => {
    if (!job) return '';
    const c = String(job.leadJobCode || job.LeadJobCode || '').trim().toUpperCase();
    const m1 = c.match(/^(L\d+)/);
    if (m1) return m1[1];
    const nm = String(job.itemName || job.ItemName || job.DivisionName || '').trim();
    const m2 = nm.match(/^(L\d+)/i);
    return m2 ? m2[1].toUpperCase() : '';
};

const walkUpToRootPricingJob = (jobs, start) => {
    if (!start || !Array.isArray(jobs)) return null;
    let cur = start;
    for (let i = 0; i < 40 && cur; i++) {
        const pid = cur.parentId ?? cur.ParentID;
        if (!pid || String(pid) === '0' || pid === 0) return cur;
        const next = jobs.find((j) => String(j.id ?? j.ItemID) === String(pid));
        if (!next) return cur;
        cur = next;
    }
    return cur;
};

const findPricingRootJobForLeadCode = (jobs, leadCodeUpper) => {
    const m = String(leadCodeUpper || '').trim().toUpperCase().match(/^(L\d+)/);
    if (!m || !Array.isArray(jobs)) return null;
    const code = m[1];
    return (
        jobs.find((j) => {
            const isRoot = !j.parentId || j.parentId === '0' || j.parentId === 0;
            if (!isRoot) return false;
            return extractLeadCodeFromPricingJob(j) === code;
        }) || null
    );
};

/**
 * LeadJob on EnquiryQuotes vs scoped param: "L1", "L1 - Civil Project", or display-only names for the same branch.
 */
const matchLeadJobForQuoteScope = (rowLead, paramLead) => {
    const a = normalize(String(rowLead || '').trim());
    const c = normalize(String(paramLead || '').trim());
    if (!c) return true;
    if (!a) return false;
    if (a === c) return true;
    const codeFrom = (raw) => {
        const t = String(raw || '').trim();
        const m1 = t.match(/^(L\d+)/i);
        if (m1) return m1[1].toLowerCase();
        const n = normalize(t);
        const m2 = n.match(/\b(l\d+)\b/);
        return m2 ? m2[1] : '';
    };
    const ca = codeFrom(rowLead);
    const cc = codeFrom(paramLead);
    if (ca && cc && ca === cc) return true;
    if (/^l\d+$/.test(c) && (a === c || a.startsWith(`${c} `) || a.startsWith(`${c}-`) || a.startsWith(`${c} -`))) return true;
    if (/^l\d+$/.test(a) && (c === a || c.startsWith(`${a} `) || c.startsWith(`${a}-`) || c.startsWith(`${a} -`))) return true;
    return false;
};

const matchOwnJobForQuoteScope = (rowOwn, pOwn, useDept) => {
    if (useDept) return true;
    const a = normalize(String(rowOwn || '').trim());
    const b = normalize(String(pOwn || '').trim());
    if (!b) return true;
    if (!a) return false;
    if (a === b) return true;
    if (a.startsWith(b) || b.startsWith(a)) return true;
    if (a.startsWith(`${b} `) || b.startsWith(`${a} `)) return true;
    return false;
};

/**
 * EnquiryQuotes row vs current panel: same tuple as persisted — RequestNo, LeadJob, ToName, OwnJob only
 * (no QuoteNumber / lead-prefix parsing).
 */
function quoteRowMatchesEnquiryScopedParams(q, p, requestNo) {
    if (!q || !p) return false;
    if (String(q.RequestNo ?? '').trim() !== String(requestNo ?? '').trim()) return false;
    const toRow = normalize(q.ToName || '');
    const toP = normalize(p.toName || '');
    const toKeyRow = normalizeCustomerKey(q.ToName || '');
    const toKeyP = normalizeCustomerKey(p.toName || '');
    if (toRow !== toP && !(toKeyRow && toKeyP && toKeyRow === toKeyP)) return false;
    if (!matchLeadJobForQuoteScope(q.LeadJob, p.leadJobName)) return false;
    return matchOwnJobForQuoteScope(q.OwnJob, p.ownJobName || '', !!p.useDepartmentForOwnJob);
}

const stripQuoteJobPrefix = (name) =>
    String(name || '').replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim();

const collapseSpacesLower = (s) =>
    String(s || '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();

/**
 * EnquiryPricingValues.EnquiryForItem / option rows often omit "L2 - " while `jobs[].itemName` is prefixed.
 * Checkboxes and `selectedJobs` must align with both forms.
 */
const jobNameMatchesActiveJobsList = (jobName, activeJobs) => {
    if (!activeJobs || activeJobs.length === 0) return false;
    if (!jobName) return false;
    if (activeJobs.includes(jobName)) return true;
    const n = collapseSpacesLower(stripQuoteJobPrefix(jobName));
    return activeJobs.some(
        (aj) => collapseSpacesLower(stripQuoteJobPrefix(String(aj || ''))) === n
    );
};

/**
 * Customer options for Quote "To" before Creatable append of current value — same rules as quoteCustomerDropdownOptions.
 *
 * Step 1 — Own job: `Master_ConcernedSE.Department` for the logged-in user (merged into `currentUser` from
 * `/api/auth/profile` using the session email — same identity as the header).
 *
 * Step 2 — EnquiryFor scope + dropdown source:
 * - If selected lead (item / lead bucket) matches own job → options from `EnquiryCustomer` (`customerOptions`).
 * - Else → parent row of the own-job node in `EnquiryFor` for this enquiry, scoped to the selected lead’s
 *   `LeadJobName` / lead prefix / L-code (same branch as the UI lead picker).
 */
function computeQuoteCustomerDropdownBaseOptions({
    enquiryData,
    pricingData,
    jobsPool,
    selectedLeadId,
    currentUser,
    isAdmin,
}) {
    if (!enquiryData) return { list: [], leadIsOwnJob: false, allJobNamesNormSet: new Set() };

    const cleanJobLabel = (s) =>
        String(s || '')
            .replace(/^(L\d+|Sub Job)\s*-\s*/i, '')
            .trim();

    const pool = jobsPool || [];
    const poolForEf = enquiryData.divisionsHierarchy?.length ? enquiryData.divisionsHierarchy : (pool.length > 0 ? pool : []);
    const allJobNamesNormSet = new Set(poolForEf.map((n) => normalize(n.itemName || n.DivisionName || '')));

    /** Authoritative own-job label from Master_ConcernedSE (client `Department`); do not use enquiry-derived dept here. */
    const ownjob = String(currentUser?.Department ?? currentUser?.department ?? '').trim();
    const ownjobLower = ownjob.toLowerCase();

    const pricingJobs = pricingData?.jobs || [];

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
    const leadPrefixClean = cleanJobLabel(String(enquiryData?.leadJobPrefix || '').trim()).toLowerCase();

    /** EnquiryFor rows that belong to the same lead branch as the selected lead (LeadJobName / prefix / L-code). */
    const leadBucketNorms = new Set();
    [selectedLeadLeadJobName, enquiryData?.leadJobPrefix, selectedLeadJob?.itemName, selectedLeadJob?.ItemName]
        .filter(Boolean)
        .forEach((raw) => {
            const n = normalize(cleanJobLabel(String(raw)));
            if (n) leadBucketNorms.add(n);
        });
    const selectedLeadCode = extractLeadCodeFromPricingJob(selectedLeadJob);

    const rowMatchesSelectedLeadBucket = (row) => {
        if (!row || leadBucketNorms.size === 0) return true;
        const rLead = normalize(cleanJobLabel(row.leadJobName || row.LeadJobName || ''));
        const rItem = normalize(cleanJobLabel(row.itemName || row.ItemName || row.DivisionName || ''));
        for (const b of leadBucketNorms) {
            if (!b) continue;
            if (rLead && (rLead === b || rLead.includes(b) || b.includes(rLead))) return true;
            if (rItem && (rItem === b || rItem.includes(b) || b.includes(rItem))) return true;
        }
        if (selectedLeadCode) {
            const rc = extractLeadCodeFromPricingJob(row);
            if (rc && rc === selectedLeadCode) return true;
        }
        return false;
    };

    const poolForSelectedLead = poolForEf.filter(rowMatchesSelectedLeadBucket);
    const poolScopedForOwnJob = poolForSelectedLead.length > 0 ? poolForSelectedLead : poolForEf;

    const ownJobMatchesDept = (j) => {
        if (!ownjob) return false;
        const itemClean = cleanJobLabel(j.itemName || j.ItemName || '').toLowerCase();
        return (
            itemClean === ownjobLower ||
            itemClean.includes(ownjobLower) ||
            ownjobLower.includes(itemClean)
        );
    };

    let ownJobNodeInBranch = poolScopedForOwnJob.find((j) => ownJobMatchesDept(j));
    if (!ownJobNodeInBranch) {
        ownJobNodeInBranch = poolForEf.find((j) => ownJobMatchesDept(j));
    }

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

    let filteredOptions = [];

    const leadBucketClean = cleanJobLabel(selectedLeadLeadJobName || String(enquiryData?.leadJobPrefix || '').trim()).toLowerCase();
    const leadIsOwnJob =
        (ownjobLower && selectedLeadJobNameClean === ownjobLower) ||
        (ownjobLower.length > 2 &&
            selectedLeadJobNameClean &&
            (selectedLeadJobNameClean.includes(ownjobLower) || ownjobLower.includes(selectedLeadJobNameClean))) ||
        (ownjobLower && leadBucketClean && leadBucketClean === ownjobLower) ||
        (ownjobLower.length > 2 &&
            leadBucketClean &&
            (leadBucketClean.includes(ownjobLower) || ownjobLower.includes(leadBucketClean))) ||
        (ownjobLower && leadPrefixClean && leadPrefixClean === ownjobLower) ||
        (ownjobLower.length > 2 &&
            leadPrefixClean &&
            (leadPrefixClean.includes(ownjobLower) || ownjobLower.includes(leadPrefixClean)));

    if (leadIsOwnJob) {
        filteredOptions = isAdmin || pricingData?.access?.hasLeadAccess ? mergePricingExtrasForAdmin() : [...enquiryCustomerOpts];
    } else {
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
            filteredOptions = [{ value: parentJobName, label: parentJobName, type: 'Internal Division' }];
        } else if (isAdmin || pricingData?.access?.hasLeadAccess) {
            filteredOptions = mergePricingExtrasForAdmin();
        } else {
            filteredOptions = [...enquiryCustomerOpts];
        }
    }

    return { list: filteredOptions, leadIsOwnJob, allJobNamesNormSet };
}

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
const resolveLeadJobSelectValue = (
    visibleLeadJobs,
    selectedLeadId,
    pricingJobs,
    leadJobPrefix,
    divisionsHierarchy
) => {
    const list = visibleLeadJobs || [];
    if (list.length === 0) return '';
    const normFull = (x) => String(x || '').trim().toLowerCase();
    const normClean = (x) => String(x || '').replace(/^L\d+\s*-\s*/i, '').trim().toLowerCase();

    if (selectedLeadId && pricingJobs?.length) {
        const found = pricingJobs.find((j) => String(j.id || j.ItemID) === String(selectedLeadId));
        if (found) {
            const name = String(found.itemName || found.DivisionName || found.ItemName || '');
            const matches = list.filter(
                (v) =>
                    normFull(v) === normFull(name) ||
                    normClean(v) === normClean(name) ||
                    normFull(v).endsWith(`- ${normClean(name)}`) ||
                    normFull(name).endsWith(normClean(v))
            );
            if (matches.length === 1) return matches[0];
            if (matches.length > 1) {
                const hNode = hierarchyRootSelfLeadForCleanName(divisionsHierarchy, normClean(name));
                const wantM = hNode && String(hNode.leadJobCode || hNode.LeadJobCode || '').match(/^(l\d+)/i);
                if (wantM) {
                    const pref = wantM[1].toLowerCase();
                    const byL = matches.find((v) => normFull(v).startsWith(pref));
                    if (byL) return byL;
                }
                return matches[0];
            }
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

const stripLeadForQuoteLead = (s) => String(s || '').replace(/^L\d+\s*-\s*/i, '').trim();

/** Pricing roots whose label matches the lead dropdown value (with or without "L# - " prefix). */
function pricingRootsMatchingLeadVal(val, pricingJobs) {
    const jobs = Array.isArray(pricingJobs) ? pricingJobs : [];
    const raw = String(val || '').trim();
    if (!raw) return [];
    const valClean = stripLeadForQuoteLead(raw).toLowerCase();
    const rawLow = raw.toLowerCase();
    return jobs.filter((j) => {
        const pid = j.parentId ?? j.ParentID;
        const isRoot = !pid || pid === '0' || pid === 0 || pid === '0';
        if (!isRoot) return false;
        const nm = String(j.itemName || j.DivisionName || j.ItemName || '').trim();
        const nmLow = nm.toLowerCase();
        return nm === raw || nmLow === rawLow || stripLeadForQuoteLead(nm).toLowerCase() === valClean;
    });
}

/**
 * When ItemName repeats (subjob under L1 vs own lead L2), prefer the hierarchy root where
 * stripped LeadJobName === stripped ItemName (EnquiryFor self-lead row).
 */
function hierarchyRootSelfLeadForCleanName(divisionsHierarchy, cleanLower) {
    const h = Array.isArray(divisionsHierarchy) ? divisionsHierarchy : [];
    const roots = h.filter((d) => {
        const pid = d.parentId ?? d.ParentID;
        const isRoot = !pid || pid === '0' || pid === 0;
        if (!isRoot) return false;
        const raw = String(d.itemName || d.DivisionName || '').trim();
        return stripLeadForQuoteLead(raw).toLowerCase() === cleanLower;
    });
    if (roots.length <= 1) return roots[0] || null;
    return (
        roots.find((d) => {
            const item = stripLeadForQuoteLead(String(d.itemName || d.DivisionName || '')).toLowerCase();
            const lj = stripLeadForQuoteLead(String(d.leadJobName ?? d.LeadJobName ?? '')).toLowerCase();
            return item && lj && item === lj;
        }) || roots[0]
    );
}

function extractLCodeUpperFromJobOrNode(jobOrNode) {
    if (!jobOrNode) return '';
    const c = String(jobOrNode.leadJobCode || jobOrNode.LeadJobCode || '').trim();
    const m1 = c.match(/^(L\d+)/i);
    if (m1) return m1[1].toUpperCase();
    const nm = String(jobOrNode.itemName || jobOrNode.ItemName || jobOrNode.DivisionName || '').trim();
    const m2 = nm.match(/^(L\d+)/i);
    return m2 ? m2[1].toUpperCase() : '';
}

/** Pick the EnquiryFor / pricing root row for the lead dropdown (handles duplicate clean names). */
function resolvePricingRootForLeadSelect(val, pricingJobs, divisionsHierarchy) {
    const raw = String(val || '').trim();
    if (!raw) return null;
    const explicit = raw.match(/^(L\d+)/i);
    const matches = pricingRootsMatchingLeadVal(raw, pricingJobs);
    if (explicit && matches.length) {
        const want = explicit[1].toUpperCase();
        const byCode = matches.find((j) =>
            String(j.leadJobCode || j.LeadJobCode || '')
                .trim()
                .toUpperCase()
                .startsWith(want)
        );
        if (byCode) return byCode;
    }
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) {
        const selfLead = matches.find((j) => {
            const item = stripLeadForQuoteLead(String(j.itemName || j.ItemName || '')).toLowerCase();
            const lj = stripLeadForQuoteLead(String(j.leadJobName || j.LeadJobName || '')).toLowerCase();
            return item && lj && item === lj;
        });
        return selfLead || matches[0];
    }
    const valClean = stripLeadForQuoteLead(raw).toLowerCase();
    const hNode = hierarchyRootSelfLeadForCleanName(divisionsHierarchy, valClean);
    if (!hNode) return null;
    const hid = hNode.id ?? hNode.ItemID;
    const jobs = Array.isArray(pricingJobs) ? pricingJobs : [];
    const hit = hid != null && jobs.find((j) => String(j.id || j.ItemID) === String(hid));
    return hit || hNode;
}

function resolveQuoteLeadCodePill({ selectedLeadId, selectedValue, pricingJobs, divisionsHierarchy }) {
    const sv = String(selectedValue || '').trim();
    const m0 = sv.match(/^(L\d+)/i);
    if (m0) return m0[1].toUpperCase();
    const rootPick = resolvePricingRootForLeadSelect(sv, pricingJobs, divisionsHierarchy);
    let code = extractLCodeUpperFromJobOrNode(rootPick);
    if (code) return code;
    const jobs = Array.isArray(pricingJobs) ? pricingJobs : [];
    if (selectedLeadId && jobs.length) {
        const node = jobs.find((j) => String(j.id || j.ItemID) === String(selectedLeadId));
        if (node) {
            const pid = node.parentId ?? node.ParentID;
            const isRoot = !pid || pid === '0' || pid === 0;
            if (isRoot) {
                code = extractLCodeUpperFromJobOrNode(node);
                if (code) return code;
            } else {
                const subClean = stripLeadForQuoteLead(String(node.itemName || node.ItemName || '')).toLowerCase();
                const hNode = hierarchyRootSelfLeadForCleanName(divisionsHierarchy, subClean);
                if (hNode) {
                    const hc = String(hNode.leadJobCode || hNode.LeadJobCode || '').trim();
                    const m1 = hc.match(/^(L\d+)/i);
                    if (m1) return m1[1].toUpperCase();
                }
            }
        }
    }
    return '';
}

/**
 * Canonical LeadJob for EnquiryQuotes + scoped GET: persist the root **lead job name** (EnquiryFor.LeadJobName
 * or display ItemName), not bare L1/L2 codes — must align with EnquiryPricingValues.LeadJobName for pending-quote logic.
 * QuoteNumber / branch identity still uses leadJobPrefix (L-code) from getQuotePayload separately.
 */
function resolveRootLeadJobLabelForQuotes(jobs, selectedLeadId, enquiryLeadPrefixFallback = '') {
    const pool = Array.isArray(jobs) && jobs.length ? jobs : null;
    if (!pool || selectedLeadId == null || String(selectedLeadId).trim() === '') {
        return String(enquiryLeadPrefixFallback || '').trim();
    }
    const node = pool.find((j) => String(j.id || j.ItemID || j.ID) === String(selectedLeadId));
    if (!node) return String(enquiryLeadPrefixFallback || '').trim();

    let root = node;
    let safe = 0;
    const vis = new Set();
    while (
        root &&
        (root.parentId || root.ParentID) &&
        (root.parentId || root.ParentID) !== '0' &&
        (root.parentId || root.ParentID) !== 0 &&
        safe < 25
    ) {
        const rid = String(root.id || root.ItemID);
        if (vis.has(rid)) break;
        vis.add(rid);
        const pId = String(root.parentId || root.ParentID);
        const p = pool.find((pj) => String(pj.id || pj.ItemID || pj.ID) === pId);
        if (!p) break;
        root = p;
        safe++;
    }

    const leadName = String(root.leadJobName || root.LeadJobName || '').trim();
    if (leadName) return leadName;

    const nm = String(root.itemName || root.ItemName || root.DivisionName || '').trim();
    if (nm) return nm;

    const codeRaw = String(root.leadJobCode || root.LeadJobCode || '').trim();
    const codeM = codeRaw.toUpperCase().match(/^(L\d+)/);
    if (codeM) return codeM[1];

    return String(enquiryLeadPrefixFallback || '').trim();
}

/**
 * EnquiryQuotes.ToName for GET /by-enquiry + save payload (must match getQuotePayload).
 * - First tab (own job): ToName = customer name dropdown (external or internal recipient).
 * - Direct subjob tab (not first): ToName = first tab’s own-job label (EnquiryFor ItemName / tab root), not the dropdown.
 */
function firstTabOwnJobDisplayNameForQuoteTuple(tabs, jobPool) {
    const first = tabs && tabs[0];
    if (!first) return '';
    const pool = Array.isArray(jobPool) && jobPool.length ? jobPool : [];
    if (first.realId && pool.length) {
        const node = pool.find((j) => String(j.id || j.ItemID || j.ID) === String(first.realId));
        const nm = (node?.itemName || node?.ItemName || node?.DivisionName || '').trim();
        if (nm) return stripQuoteJobPrefix(nm).trim() || nm;
    }
    return stripQuoteJobPrefix(String(first.label || first.name || '')).trim() || String(first.label || first.name || '').trim();
}

function resolveQuoteToNameForDbTuple(calculatedTabs, effectiveQuoteTabs, activeQuoteTab, toName, jobPool) {
    const tabs = calculatedTabs && calculatedTabs.length > 0 ? calculatedTabs : effectiveQuoteTabs;
    if (!tabs || !tabs.length) return (toName || '').trim();
    const firstId = String(tabs[0]?.id ?? '');
    const isFirstTab = String(activeQuoteTab) === firstId;
    if (tabs.length < 2 || isFirstTab) {
        return (toName || '').trim();
    }
    return firstTabOwnJobDisplayNameForQuoteTuple(tabs, jobPool) || (toName || '').trim();
}

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

/** True when form quoteId + Quote Ref already match this row (avoids skipping loadQuote when registry has id but empty ref → Draft). */
const isFormSyncedToQuoteRow = (row, formQuoteId, formQuoteNumber) => {
    const rid = quoteRowId(row);
    if (rid == null || String(rid) !== String(formQuoteId ?? '')) return false;
    const rowQn = String(row?.QuoteNumber || row?.quoteNumber || '').trim();
    const curQn = String(formQuoteNumber ?? '').trim();
    if (!rowQn) return curQn === '';
    return curQn === rowQn;
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
        margin-bottom: 8px !important;
        font-size: 12px !important;
        page-break-inside: auto !important;
    }
    .clause-content tr {
        page-break-inside: avoid !important;
    }
    .clause-content table th, .clause-content table td {
        border: 1px solid #64748b !important;
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
        line-height: 1.6 !important;
    }
    .clause-content p {
        margin: 0.4em 0 !important;
        padding: 0 !important;
        line-height: 1.6 !important;
        white-space: normal !important;
    }
    .clause-content p:first-child {
        margin-top: 0 !important;
    }
    .clause-content p:last-child {
        margin-bottom: 0 !important;
    }
    .clause-content ul, .clause-content ol {
        margin-top: 0.35em !important;
        margin-bottom: 0.65em !important;
        padding-left: 24px !important;
        white-space: normal !important;
        line-height: 1.6 !important;
    }
    .clause-content li {
        margin-bottom: 0.2em !important;
        line-height: 1.6 !important;
        display: list-item !important;
        list-style-position: outside !important;
    }
    .clause-content ul {
        list-style-type: disc !important;
    }
    .clause-content ol {
        list-style-type: decimal !important;
    }
    /* Footer: screen + print + PDF — column stack (default flex is row in some print UAs). */
    .footer-section {
        display: flex !important;
        flex-direction: column !important;
        align-items: stretch !important;
        width: 100% !important;
        max-width: 100% !important;
        box-sizing: border-box !important;
        break-inside: avoid !important;
        page-break-inside: avoid !important;
    }
    .quote-print-page-indicator {
        display: block !important;
        width: 100% !important;
        max-width: 100% !important;
        text-align: right !important;
        box-sizing: border-box !important;
    }
    .footer-section > hr {
        width: 100% !important;
        margin-left: 0 !important;
        margin-right: 0 !important;
        box-sizing: border-box !important;
    }
    .quote-print-footer-wrap {
        display: block !important;
        width: 50% !important;
        max-width: 50% !important;
        margin-left: auto !important;
        margin-right: 0 !important;
        box-sizing: border-box !important;
    }
    .quote-print-footer-company {
        display: block !important;
        width: 100% !important;
        max-width: 100% !important;
        text-align: right !important;
        box-sizing: border-box !important;
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
    /** Small tolerance only — large fudge caused packed sheets to exceed one printed page (footer jumped to next page). */
    const packFudgePx = Math.min(32, Math.round(usable * 0.035));
    const pages = [];
    let cur = [];
    let sum = 0;
    for (let i = 0; i < heights.length; i++) {
        const h = Math.max(heights[i] || 0, 1);
        if (cur.length > 0 && sum + h > usable + packFudgePx) {
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
 * One pass: pull leading clauses from page i onto page i-1 when combined height
 * still fits within cap (usable + slack — slack accounts for measure vs print).
 */
const rebalanceClausePageGroupsOnce = (groups, heights, usablePx) => {
    if (!groups?.length) return [];
    const slackPx = Math.min(48, Math.round(usablePx * 0.055));
    const cap = Math.max(usablePx + slackPx, 300);
    const hAt = (idx) => Math.max(heights[idx] || 0, 1);
    const out = groups.map((g) => [...g]);
    if (out.length < 2) return out.filter((g) => g.length > 0);
    for (let pi = 1; pi < out.length; pi++) {
        let safety = 0;
        while (out[pi].length && safety < heights.length + 8) {
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

/** Multi-pass rebalance so chains (e.g. pull clause 4 onto page 2, then 5 onto page 3) can settle. */
const rebalanceClausePageGroups = (groups, heights, usablePx) => {
    if (!groups || groups.length < 2) return groups;
    let out = groups.map((g) => [...g]).filter((g) => g.length > 0);
    if (out.length < 2) return out;
    for (let pass = 0; pass < 6; pass++) {
        const next = rebalanceClausePageGroupsOnce(out, heights, usablePx);
        if (clausePageGroupsEqual(next, out)) break;
        out = next;
        if (out.length < 2) break;
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
    /** Assigned each render after `handleClear` — lets toolbar Search reset the left panel without reordering declarations. */
    const clearLeftPanelForToolbarSearchRef = useRef(null);

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
    /** Increment to re-run scoped GET so Previous Quotes shows new revisions without a full page reload. */
    const [scopedQuotePanelRefreshNonce, setScopedQuotePanelRefreshNonce] = useState(0);
    const [selectedLeadId, setSelectedLeadId] = useState(null);
    /** Last lead <select> fingerprint — avoids clearing customer when the same lead is re-applied after re-render. */
    const leadChoiceFingerprintRef = useRef('');
    /** One-shot gate: after a real lead change, auto-select first available customer option. */
    const autoSelectCustomerAfterLeadChangeRef = useRef(false);
    /** When lead changes, keep quote id/number if auto-select picks the same customer again (avoids Quote Ref → Draft). */
    const preserveQuoteOnLeadChangeRef = useRef(null);
    /** After choosing an enquiry from search/pending results: set selectedLeadId once pricing jobs are available. */
    const quoteRowAutoSelectLeadRef = useRef(false);
    /** Full first lead `<option value>` (e.g. "L1 - Civil") from enquiry divisions — pairs with quoteRowAutoSelectLeadRef. */
    const quoteRowFirstLeadDivisionFullRef = useRef('');
    /** While true, skip external-customer "(L#)" effect so search-row "first division lead" is not overwritten. */
    const quoteRowDivisionLeadLockRef = useRef(false);
    /** After row enquiry pick: fill "To" from the same list as the customer dropdown (not raw customerOptions[0]). */
    const quoteRowSyncDropdownCustomerRef = useRef(false);
    /** When set, customer sync waits until selectedLeadId is set so internal parent (e.g. HVAC Project) resolves correctly. */
    const quoteRowAwaitingLeadForCustomerRef = useRef(false);
    /** After hydrating a quote form draft, block auto-load of latest saved quote (would overwrite clauses / tab snapshot). */
    const quoteDraftHydrateSkipAutoLoadUntilRef = useRef(0);
    const formDraftMenuWrapRef = useRef(null);
    /** Latest commitQuoteDigitalStamps — saveQuote/handleRevise are declared above this callback in the file. */
    const commitQuoteDigitalStampsRef = useRef(null);
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
    /** dataTransfer cannot hold large data URLs — stash payload for the duration of the drag. */
    const dragSignaturePayloadRef = useRef(null);
    const sigDragActiveRef = useRef(false);
    /** After a toolbar signature drag, browsers may emit a click — skip running place/open in that case. */
    const sigToolbarSuppressClickRef = useRef(false);
    const signatureLibraryEmail = (currentUser?.EmailId || currentUser?.email || '').trim();
    /** Stored default only — used for click-to-place on page 1 (same as vault “Place on page” with default image). */
    const defaultSignatureImageUrl = React.useMemo(() => {
        if (!signatureLibraryEmail) return null;
        return resolveDefaultSignatureImage(signatureLibraryEmail);
    }, [signatureLibraryEmail, signatureVaultOpen]);
    /** Default if set, else first library image — for dragging from the toolbar without opening the vault. */
    const toolbarDragSignatureImageUrl = React.useMemo(() => {
        if (!signatureLibraryEmail) return null;
        if (defaultSignatureImageUrl) return defaultSignatureImageUrl;
        const lib = loadSignatureLibrary(signatureLibraryEmail);
        return lib[0]?.imageDataUrl || null;
    }, [signatureLibraryEmail, signatureVaultOpen, defaultSignatureImageUrl]);
    /** Digital stamp caption = logged-in user (merged profile), not quote Signatory / Prepared By. */
    const digitalStampUserDisplayName = React.useMemo(
        () => (currentUser?.FullName || currentUser?.name || '').trim(),
        [currentUser?.FullName, currentUser?.name]
    );
    const digitalStampUserDesignation = React.useMemo(
        () => (currentUser?.Designation || currentUser?.designation || '').trim(),
        [currentUser?.Designation, currentUser?.designation]
    );
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
    const clauseContentRef = useRef(clauseContent);
    useLayoutEffect(() => {
        clauseContentRef.current = clauseContent;
    }, [clauseContent]);

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
    /** If auto-open fails, user can use this real link (second gesture) to open the same mailto: draft. */
    const [quoteEmailDraftHref, setQuoteEmailDraftHref] = useState(null);
    const [quoteListCategory, setQuoteListCategory] = useState(QUOTE_LIST_CATEGORY.PENDING);
    const [quoteListSearchCriteria, setQuoteListSearchCriteria] = useState('');
    const [quoteListDateFrom, setQuoteListDateFrom] = useState('');
    const [quoteListDateTo, setQuoteListDateTo] = useState('');
    const [showEmailModal, setShowEmailModal] = useState(false);
    const [emailSending, setEmailSending] = useState(false);
    const [emailDetails, setEmailDetails] = useState({ to: '', cc: '', bcc: '', subject: '', body: '', pdfBlob: null, pdfName: '' });
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
    /** From last EnquiryQuotes row — drives "Contact:" next to Prepared By (email match beats wrong name collisions). */
    const [loadedQuotePreparedByEmail, setLoadedQuotePreparedByEmail] = useState('');
    /** Subjob tab: right-hand A4 preview header reads only from this EnquiryQuotes row, not left-panel state. */
    const [loadedEnquiryQuoteRowForPreview, setLoadedEnquiryQuoteRowForPreview] = useState(null);
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
    /** When true with an enquiry open, right panel shows pending/search list instead of quote preview (after Search click). */
    const [showQuoteListSummaryOverQuote, setShowQuoteListSummaryOverQuote] = useState(false);
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
        setShowQuoteListSummaryOverQuote(true);
        clearLeftPanelForToolbarSearchRef.current?.();
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
        setShowQuoteListSummaryOverQuote(false);
        refetchPendingQuotes();
    }, [refetchPendingQuotes]);

    // Tab State for unified Quote and Pricing Sections
    const [activeQuoteTab, setActiveQuoteTab] = useState('self');

    // --- LOCKED LOGIC: Independent Tab State Management (Step 1722 fix) ---
    // Registry to store form state per tab to prevent data sharing/leakage.
    const tabStateRegistry = useRef({});
    /** After handleTabChange restores a snapshot, skip AutoLoad/HardFallback effects that would call loadQuote and overwrite it. */
    const quoteTabRestoreSuppressLoadQuoteUntilRef = useRef(0);
    const attentionOptionsCacheRef = React.useRef({ sig: '', arr: EMPTY_DEPT_ATTENTION_NAMES });

    // --- LOCKED LOGIC: Reusable Form Reset ---
    const resetFormState = useCallback(() => {
        setQuoteId(null);
        setQuoteNumber('');
        setQuoteDate(new Date().toISOString().split('T')[0]);
        setValidityDays(30);
        setPreparedBy((currentUser?.FullName || currentUser?.name || '').trim());
        setLoadedQuotePreparedByEmail('');
        setLoadedEnquiryQuoteRowForPreview(null);
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
            signatory, signatoryDesignation, preparedBy, preparedByEmail: loadedQuotePreparedByEmail,
            toName, toAddress, toPhone, toEmail, toFax, toAttention,
            quoteTypeList, quoteEnquiryTypeSelect,
            clauseContent, clauses, customClauses, orderedClauses,
            quoteId, quoteNumber, grandTotal,
        };

        // 2. Load or Reset New Tab State
        const saved = tabStateRegistry.current[newTabId];

        let filteredForNewTab = [];
        try {
            filteredForNewTab = getFilteredQuotesForPreviousQuotesTab(newTabId) || [];
        } catch {
            filteredForNewTab = [];
        }
        const latestForTab =
            filteredForNewTab.length > 0
                ? [...filteredForNewTab].sort((a, b) => (Number(b.RevisionNo) || 0) - (Number(a.RevisionNo) || 0))[0]
                : null;
        const savedQid =
            saved?.quoteId != null && String(saved.quoteId).trim() !== '' ? String(saved.quoteId).trim() : '';
        const savedRowBelongsToThisTab =
            savedQid && filteredForNewTab.some((q) => String(quoteRowId(q) ?? '') === savedQid);

        const destTabObj = (calculatedTabs || []).find((t) => String(t.id) === String(newTabId));
        if (destTabObj?.isSubJobTab && savedRowBelongsToThisTab && savedQid) {
            const matchedRow = filteredForNewTab.find((q) => String(quoteRowId(q) ?? '') === savedQid);
            setLoadedEnquiryQuoteRowForPreview(matchedRow || null);
        } else if (!destTabObj?.isSubJobTab) {
            setLoadedEnquiryQuoteRowForPreview(null);
        } else {
            setLoadedEnquiryQuoteRowForPreview(null);
        }

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
            setLoadedQuotePreparedByEmail(
                saved && typeof saved.preparedByEmail === 'string' ? saved.preparedByEmail : ''
            );

            // Recipient (customer dropdown + To fields) is one global choice for this session, not per job tab.
            // Restoring saved.toName here made HVAC/BMS tab switches snap the dropdown to the other tab's old value.
            setToName(currentCustomer.toName);
            setToAddress(currentCustomer.toAddress);
            setToPhone(currentCustomer.toPhone);
            setToEmail(currentCustomer.toEmail);
            setToAttention(
                savedRowBelongsToThisTab && saved && 'toAttention' in saved
                    ? saved.toAttention
                    : currentCustomer.toAttention
            );
            setToFax(String(saved.toFax != null && saved.toFax !== '' ? saved.toFax : toFax || ''));
            setQuoteTypeList(Array.isArray(saved.quoteTypeList) ? [...saved.quoteTypeList] : []);
            setQuoteEnquiryTypeSelect(saved.quoteEnquiryTypeSelect || '');

            setClauseContent(saved.clauseContent);
            setClauses(saved.clauses);
            setCustomClauses(saved.customClauses);
            setOrderedClauses(saved.orderedClauses);
            // Only restore Quote Ref if that row still belongs to this job tab's Previous Quotes list (avoids BMP ref on HVAC tab).
            if (savedRowBelongsToThisTab) {
                setQuoteId(saved.quoteId);
                setQuoteNumber(saved.quoteNumber);
            } else {
                setQuoteId(null);
                setQuoteNumber('');
                setLoadedQuotePreparedByEmail('');
            }
            if (saved.grandTotal != null && saved.grandTotal !== '') {
                setGrandTotal(Number(saved.grandTotal) || 0);
            }
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

        // When this tab has no valid saved Quote Ref for this branch, pick the latest row from Previous Quotes for preview.
        // `restoredPersistedQuote` must require the saved id to appear in this tab's filtered list — otherwise we kept
        // another tab's BMP ref while the HVAC tab was selected (wrong right-hand preview).
        const restoredPersistedQuote =
            savedRowBelongsToThisTab &&
            !!saved &&
            saved.quoteId != null &&
            saved.quoteId !== '' &&
            String(saved.quoteNumber || '').trim() !== '';
        /**
         * When the user has already visited this job tab, `handleTabChange` step 1 stored a snapshot under
         * `newTabId`. Do not immediately `loadQuote(latest)` — that overwrites restored Quote Details with the
         * other tab's / latest DB row (e.g. HVAC content on Civil after Civil → HVAC → Civil).
         */
        const hasPriorTabSnapshot =
            Object.prototype.hasOwnProperty.call(tabStateRegistry.current, newTabId) &&
            tabStateRegistry.current[newTabId] != null;
        if (!restoredPersistedQuote && latestForTab && !hasPriorTabSnapshot) {
            queueMicrotask(() => {
                try {
                    const latestId = quoteRowId(latestForTab);
                    if (latestId == null) return;
                    loadQuote(latestForTab, {
                        forActiveQuoteTab: newTabId,
                        preserveRecipient: true,
                        skipPreparedSignatory: true,
                    });
                } catch (e) {
                    console.warn('[handleTabChange] auto-select quote for preview', e);
                }
            });
        }

        // Skip the tab-change auto-load effect for this transition — it would call `loadQuote` and clobber the snapshot above.
        if (saved) {
            prevQuoteTabForAutoLoadRef.current = newTabId;
            if (typeof performance !== 'undefined') {
                quoteTabRestoreSuppressLoadQuoteUntilRef.current = performance.now() + 400;
            }
        }
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

    const [quoteFormDraftList, setQuoteFormDraftList] = useState([]);
    const [quoteFormDraftsLoading, setQuoteFormDraftsLoading] = useState(false);
    const [quoteFormDraftsError, setQuoteFormDraftsError] = useState(null);
    const [formDraftPanelOpen, setFormDraftPanelOpen] = useState(false);

    const fetchQuoteFormDrafts = useCallback(async () => {
        const em = normalizeDraftUserEmailForApi(currentUser?.EmailId || currentUser?.email || '');
        if (!em) {
            setQuoteFormDraftList([]);
            setQuoteFormDraftsError(null);
            return;
        }
        setQuoteFormDraftsLoading(true);
        setQuoteFormDraftsError(null);
        try {
            const qs = new URLSearchParams({ userEmail: em }).toString();
            const res = await fetch(`${API_BASE}/api/quotes/form-drafts?${qs}`, { cache: 'no-store' });
            if (!res.ok) {
                let msg = `Could not load drafts (HTTP ${res.status}).`;
                try {
                    const errBody = await res.json();
                    msg = errBody.hint || errBody.error || errBody.details || msg;
                } catch {
                    /* ignore */
                }
                setQuoteFormDraftsError(msg);
                setQuoteFormDraftList([]);
                return;
            }
            const data = await res.json();
            const rows = (Array.isArray(data) ? data : []).map((d) => ({
                id: d.id ?? d.Id,
                label: d.label ?? d.Label ?? '',
                savedAtIso: d.savedAtIso ?? d.SavedAtIso ?? '',
            }));
            setQuoteFormDraftList(rows);
        } catch (e) {
            console.warn('[QuoteForm] form-drafts fetch', e);
            setQuoteFormDraftsError('Could not load drafts (network error).');
            setQuoteFormDraftList([]);
        } finally {
            setQuoteFormDraftsLoading(false);
        }
    }, [currentUser?.EmailId, currentUser?.email]);

    useEffect(() => {
        void fetchQuoteFormDrafts();
    }, [fetchQuoteFormDrafts]);

    useEffect(() => {
        if (!formDraftPanelOpen) return undefined;
        const onDocMouseDown = (e) => {
            if (formDraftMenuWrapRef.current && !formDraftMenuWrapRef.current.contains(e.target)) {
                setFormDraftPanelOpen(false);
            }
        };
        document.addEventListener('mousedown', onDocMouseDown);
        return () => document.removeEventListener('mousedown', onDocMouseDown);
    }, [formDraftPanelOpen]);

    const markDraftHydrateSkipAutoLoad = () => {
        const t = typeof performance !== 'undefined' ? performance.now() : Date.now();
        quoteDraftHydrateSkipAutoLoadUntilRef.current = t + 5000;
    };

    const clearDraftHydrateSkipAutoLoad = () => {
        quoteDraftHydrateSkipAutoLoadUntilRef.current = 0;
    };

    const handleSaveQuoteFormDraft = async () => {
        const emailRaw = (currentUser?.EmailId || currentUser?.email || '').trim();
        if (!emailRaw) {
            alert('Sign in with a user email to store drafts.');
            return;
        }
        const email = normalizeDraftUserEmailForApi(emailRaw);

        tabStateRegistry.current[activeQuoteTab] = {
            subject,
            quoteDate,
            validityDays,
            customerReference,
            signatory,
            signatoryDesignation,
            preparedBy,
            preparedByEmail: loadedQuotePreparedByEmail,
            toName,
            toAddress,
            toPhone,
            toEmail,
            toFax,
            toAttention,
            quoteTypeList,
            quoteEnquiryTypeSelect,
            clauseContent,
            clauses,
            customClauses,
            orderedClauses,
            quoteId,
            quoteNumber,
            grandTotal,
        };

        let registryCopy;
        try {
            registryCopy = JSON.parse(JSON.stringify(tabStateRegistry.current));
        } catch {
            alert('Could not snapshot form state.');
            return;
        }

        Object.keys(registryCopy).forEach((k) => {
            const row = registryCopy[k];
            if (row && typeof row === 'object') {
                row.quoteId = null;
                row.quoteNumber = '';
            }
        });

        const requestNo = String(enquiryData?.enquiry?.RequestNo || '').trim() || String(searchTerm || '').trim();
        const headerSnapshot = {
            searchTerm: String(searchTerm || '').trim(),
            requestNo,
            leadJobPrefix: String(enquiryData?.leadJobPrefix || '').trim(),
            selectedLeadId:
                selectedLeadId != null && String(selectedLeadId).trim() !== '' ? String(selectedLeadId) : '',
            toName: String(toName || '').trim(),
        };
        const labelEnq = requestNo || '—';

        const label = `${labelEnq} · ${format(new Date(), 'dd-MMM-yyyy HH:mm')}`;

        let formUiSnapshot = {};
        try {
            formUiSnapshot = {
                toFax: String(toFax || ''),
                grandTotal: Number(grandTotal) || 0,
                expandedClause: expandedClause ?? null,
                quoteCompanyName: String(quoteCompanyName || ''),
                quoteLogo: typeof quoteLogo === 'string' || typeof quoteLogo === 'number' ? quoteLogo : null,
                footerDetails: footerDetails ? JSON.parse(JSON.stringify(footerDetails)) : null,
                companyProfiles: companyProfiles?.length ? JSON.parse(JSON.stringify(companyProfiles)) : [],
                quoteAttachments: quoteAttachments?.length ? JSON.parse(JSON.stringify(quoteAttachments)) : [],
                newClauseTitle: String(newClauseTitle || ''),
                isAddingClause: Boolean(isAddingClause),
                pricingSummary: pricingSummary?.length ? JSON.parse(JSON.stringify(pricingSummary)) : [],
                hasUserPricing: Boolean(hasUserPricing),
                printWithHeader: Boolean(printWithHeader),
            };
        } catch (e) {
            console.warn('[QuoteForm] draft formUiSnapshot', e);
            formUiSnapshot = {
                toFax: String(toFax || ''),
                grandTotal: Number(grandTotal) || 0,
                hasUserPricing: Boolean(hasUserPricing),
                printWithHeader: Boolean(printWithHeader),
            };
        }

        const payload = {
            version: 2,
            activeQuoteTab,
            registry: registryCopy,
            selectedJobs: Array.isArray(selectedJobs) ? [...selectedJobs] : [],
            quoteContextScope,
            headerSnapshot,
            formUiSnapshot,
        };

        let requestBody;
        try {
            requestBody = JSON.stringify({ userEmail: email, label, payload });
        } catch (e) {
            console.warn('[QuoteForm] draft JSON', e);
            alert('Could not serialize the draft (remove unusual attachments and try again).');
            return;
        }

        try {
            const res = await fetch(`${API_BASE}/api/quotes/form-drafts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: requestBody,
            });
            if (!res.ok) {
                let detail = '';
                try {
                    const errBody = await res.json();
                    detail = errBody.hint || errBody.error || errBody.details || '';
                } catch {
                    detail = await res.text();
                }
                console.warn('[QuoteForm] draft save', res.status, detail);
                alert(
                    res.status === 503
                        ? 'Draft storage is not set up on the server yet.\n\nRun on the database machine:\nnode server/migrations/run_create_quote_form_drafts.js\n\nThen refresh SSMS → Tables — you should see dbo.QuoteFormDrafts.'
                        : `Could not save draft on the server.${detail ? `\n\n${detail}` : ''}`
                );
                return;
            }
            const savedBody = await res.json().catch(() => ({}));
            const newRow = {
                id: savedBody.id,
                label: savedBody.label || label,
                savedAtIso: savedBody.savedAtIso || new Date().toISOString(),
            };
            if (newRow.id) {
                setQuoteFormDraftList((prev) =>
                    [newRow, ...prev.filter((p) => String(p.id) !== String(newRow.id))].slice(0, 40)
                );
            }
            setQuoteFormDraftsError(null);
            await fetchQuoteFormDrafts();
        } catch (e) {
            console.warn('[QuoteForm] draft save', e);
            alert('Could not save draft (network or server error).');
            return;
        }

        alert('Draft saved. Open “Load draft…” to restore it.');
    };

    const handleDeleteQuoteFormDraft = async (e, draftId) => {
        e?.stopPropagation?.();
        const id = String(draftId || '').trim();
        if (!id) return;
        if (!globalThis.confirm?.('Delete this draft? This cannot be undone.')) return;
        const email = normalizeDraftUserEmailForApi(currentUser?.EmailId || currentUser?.email || '');
        if (!email) return;
        try {
            const qs = new URLSearchParams({ userEmail: email }).toString();
            const res = await fetch(`${API_BASE}/api/quotes/form-drafts/${encodeURIComponent(id)}?${qs}`, {
                method: 'DELETE',
            });
            if (!res.ok) {
                let msg = 'Could not delete draft.';
                try {
                    const errBody = await res.json();
                    msg = errBody.error || msg;
                } catch {
                    /* ignore */
                }
                alert(msg);
                return;
            }
            await fetchQuoteFormDrafts();
        } catch (err) {
            console.warn('[QuoteForm] draft delete', err);
            alert('Could not delete draft.');
        }
    };

    const applyDraftRegistryToUi = (registry, atIn) => {
        let at = atIn;
        const keys = Object.keys(registry || {});
        if (!keys.includes(String(at))) {
            at = keys[0] || activeQuoteTab;
        }

        let registryCopy;
        try {
            registryCopy = JSON.parse(JSON.stringify(registry));
        } catch {
            return;
        }

        tabStateRegistry.current = registryCopy;
        setActiveQuoteTab(at);

        const saved = tabStateRegistry.current[at];
        if (saved && typeof saved === 'object') {
            setSubject(saved.subject || '');
            setQuoteDate(saved.quoteDate || new Date().toISOString().split('T')[0]);
            setValidityDays(typeof saved.validityDays === 'number' ? saved.validityDays : 30);
            setCustomerReference(saved.customerReference || '');
            setSignatory(saved.signatory || '');
            setSignatoryDesignation(saved.signatoryDesignation || '');
            setPreparedBy(
                (saved.preparedBy || '').trim() || (currentUser?.FullName || currentUser?.name || '').trim()
            );
            setLoadedQuotePreparedByEmail(
                typeof saved.preparedByEmail === 'string' ? saved.preparedByEmail : ''
            );
            setLoadedEnquiryQuoteRowForPreview(null);
            setToName(saved.toName || '');
            setToAddress(saved.toAddress || '');
            setToPhone(saved.toPhone || '');
            setToEmail(saved.toEmail || '');
            setToFax(saved.toFax || '');
            setToAttention(saved.toAttention || '');
            setQuoteTypeList(Array.isArray(saved.quoteTypeList) ? [...saved.quoteTypeList] : []);
            setQuoteEnquiryTypeSelect(saved.quoteEnquiryTypeSelect || '');
            setClauseContent(
                saved.clauseContent && typeof saved.clauseContent === 'object'
                    ? { ...defaultClauses, ...saved.clauseContent }
                    : { ...defaultClauses }
            );
            setClauses(
                saved.clauses && typeof saved.clauses === 'object'
                    ? {
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
                          ...saved.clauses,
                      }
                    : {
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
                      }
            );
            setCustomClauses(Array.isArray(saved.customClauses) ? [...saved.customClauses] : []);
            setOrderedClauses(
                Array.isArray(saved.orderedClauses) && saved.orderedClauses.length > 0
                    ? [...saved.orderedClauses]
                    : [
                          'showScopeOfWork',
                          'showBasisOfOffer',
                          'showExclusions',
                          'showPricingTerms',
                          'showBillOfQuantity',
                          'showSchedule',
                          'showWarranty',
                          'showResponsibilityMatrix',
                          'showTermsConditions',
                          'showAcceptance',
                      ]
            );
            setQuoteId(null);
            setQuoteNumber('');
            if (saved.grandTotal != null && saved.grandTotal !== '') {
                setGrandTotal(Number(saved.grandTotal) || 0);
            }
        }
    };

    const applyFormUiSnapshotFromDraft = (snap) => {
        if (!snap || typeof snap !== 'object') return;
        try {
            if (snap.toFax !== undefined) setToFax(String(snap.toFax ?? ''));
            if (snap.grandTotal != null) setGrandTotal(Number(snap.grandTotal) || 0);
            if ('expandedClause' in snap) setExpandedClause(snap.expandedClause ?? null);
            if (snap.quoteCompanyName != null) setQuoteCompanyName(String(snap.quoteCompanyName));
            if ('quoteLogo' in snap) setQuoteLogo(snap.quoteLogo ?? null);
            if ('footerDetails' in snap) setFooterDetails(snap.footerDetails ?? null);
            if (Array.isArray(snap.companyProfiles)) setCompanyProfiles(snap.companyProfiles);
            if (Array.isArray(snap.quoteAttachments)) setQuoteAttachments(snap.quoteAttachments);
            if (snap.newClauseTitle !== undefined) setNewClauseTitle(String(snap.newClauseTitle ?? ''));
            if (typeof snap.isAddingClause === 'boolean') setIsAddingClause(snap.isAddingClause);
            if (Array.isArray(snap.pricingSummary)) setPricingSummary(snap.pricingSummary);
            if (typeof snap.hasUserPricing === 'boolean') setHasUserPricing(snap.hasUserPricing);
            if (typeof snap.printWithHeader === 'boolean') setPrintWithHeader(snap.printWithHeader);
        } catch (e) {
            console.warn('[QuoteForm] applyFormUiSnapshotFromDraft', e);
        }
    };

    const handleSelectQuoteFormDraft = async (draftId) => {
        const id = String(draftId || '').trim();
        if (!id) return;
        const email = normalizeDraftUserEmailForApi(currentUser?.EmailId || currentUser?.email || '');
        if (!email) {
            alert('Sign in to load drafts.');
            return;
        }

        let registryBackup = {};
        try {
            registryBackup = JSON.parse(JSON.stringify(tabStateRegistry.current));
        } catch {
            registryBackup = {};
        }

        let entry;
        try {
            const qs = new URLSearchParams({ userEmail: email }).toString();
            const res = await fetch(`${API_BASE}/api/quotes/form-drafts/${encodeURIComponent(id)}?${qs}`, {
                cache: 'no-store',
            });
            if (!res.ok) {
                alert(res.status === 404 ? 'Draft not found.' : 'Could not load draft from the server.');
                return;
            }
            entry = await res.json();
        } catch (e) {
            console.warn('[QuoteForm] draft fetch', e);
            alert('Could not load draft from the server.');
            return;
        }

        if (!entry?.payload?.registry) {
            alert('This draft has no saved form data.');
            return;
        }

        markDraftHydrateSkipAutoLoad();

        const header = entry.payload.headerSnapshot || {};
        const rn = String(header.requestNo || header.searchTerm || '').trim();
        const { registry, selectedJobs: sj, quoteContextScope: qcs } = entry.payload;
        const at = entry.payload.activeQuoteTab;

        if (rn) {
            let ok = false;
            try {
                ok = await handleSelectEnquiry({ RequestNo: rn, ProjectName: '' });
            } catch (e) {
                console.warn('[QuoteForm] draft load enquiry', e);
            }
            if (!ok) {
                clearDraftHydrateSkipAutoLoad();
                tabStateRegistry.current = registryBackup;
                alert('Could not load enquiry for this draft. Check the enquiry number and try again.');
                return;
            }
            const lp = String(header.leadJobPrefix || '').trim();
            if (lp) {
                setEnquiryData((prev) => (prev?.enquiry ? { ...prev, leadJobPrefix: lp } : prev));
            }
        }

        applyDraftRegistryToUi(registry, at);

        if (Array.isArray(sj)) setSelectedJobs([...sj]);
        if (qcs !== undefined) setQuoteContextScope(qcs);

        const searchDisplay = String(header.searchTerm || header.requestNo || rn || '').trim();
        if (searchDisplay) setSearchTerm(searchDisplay);
        const sid = header.selectedLeadId;
        if (sid != null && String(sid).trim() !== '') {
            const n = Number(sid);
            setSelectedLeadId(Number.isFinite(n) && String(n) === String(sid).trim() ? n : sid);
        } else if (!rn) {
            setSelectedLeadId(null);
        }
        if (String(header.toName || '').trim()) {
            setToName(String(header.toName).trim());
        }

        applyFormUiSnapshotFromDraft(entry.payload.formUiSnapshot);

        setQuoteDigitalStamps([]);
    };

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

    /** Checked-only serial for the left clause list (updates when order changes). */
    const clauseSidebarSerialByIndex = React.useMemo(() => {
        const arr = new Array(orderedClauses.length).fill(0);
        let n = 0;
        orderedClauses.forEach((id, i) => {
            const isCustom = String(id).startsWith('custom_');
            const checked = isCustom
                ? Boolean(customClauses.find((c) => c.id === id)?.isChecked)
                : Boolean(clauses[id]);
            if (checked) {
                n += 1;
                arr[i] = n;
            }
        });
        return arr;
    }, [orderedClauses, clauses, customClauses]);

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

        /* Match PDF: sheets are always 210mm wide (see .quote-a4-sheet). Measure at inner content width (210mm − 15mm padding each side, box-sizing: border-box). */
        const sheetInnerContentMm = 210 - 15 * 2;
        const innerW = Math.round(quoteMmToPx(sheetInnerContentMm));
        host.style.width = `${Math.max(280, innerW)}px`;

        const measureHeights = () =>
            activeClausesList.map((_, i) => {
                const n = host.querySelector(`[data-clause-measure-index="${i}"]`);
                if (!n) return 0;
                const rect = n.getBoundingClientRect();
                const cs = typeof window !== 'undefined' ? window.getComputedStyle(n) : null;
                const marginY =
                    (cs ? parseFloat(cs.marginTop) || 0 : 0) + (cs ? parseFloat(cs.marginBottom) || 0 : 0);
                return Math.round(rect.height + marginY);
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
            /**
             * Sheet 2+ chrome (logo row + footer + print margins). Extra mm → shorter clause stacks per sheet
             * so the browser is less likely to split one `.quote-a4-sheet` across two printed pages.
             * Min usable height must stay below (sheetInnerMm - chrome) or Math.max() clamps and ignores extra chrome.
             */
            /** Reserve for logo row + footer + margins; higher = shorter clause stacks = less print split inside one sheet. */
            const continuationChromeMm = 96;
            const contUsablePx = quoteMmToPx(Math.max(sheetInnerMm - continuationChromeMm, 118));

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
    }, [clausePaginationLayoutKey, isQuotePreviewVisible]);

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
 
    const sheets = React.useMemo(() => {
        const res = [];
        // Page 1
        res.push({
            isFirstPage: true,
            clauses: sanitizedPageOneClauseIndices.map((idx) => activeClausesList[idx]),
        });
        // Subsequent continuation pages
        sanitizedClausePageGroups.forEach((group) => {
            res.push({
                isFirstPage: false,
                clauses: group.map((idx) => activeClausesList[idx]),
            });
        });
        return res;
    }, [sanitizedPageOneClauseIndices, sanitizedClausePageGroups, activeClausesList]);

    const quotePreviewTotalPages =
        activeClausesList.length === 0 ? 1 : sheets.length;

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
                const userEmailNorm = (currentUser?.email || currentUser?.EmailId || currentUser?.MailId || '')
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
                    departmentCode: tab.departmentCode || node.departmentCode || node.DepartmentCode || node.code,
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

    /** Clause 4 sidebar: same auto-table as PDF body; shown outside Jodit (editor often does not reflect merged table HTML). */
    const pricingTermsAutoTablePreviewHtml = React.useMemo(() => {
        if (!pricingSummary?.length || !pricingData) return '';
        const { tableHtml } = buildEmsAutoPricingTableHtml(pricingSummary, selectedJobs);
        return tableHtml;
    }, [pricingSummary, selectedJobs, selectedJobsSig, pricingStableSig]);

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

    /** Document preview: project name from EnquiryMaster.ProjectName (API: enquiry.ProjectName / projectname). */
    const quotePreviewProjectName = React.useMemo(() => {
        const enq = enquiryData?.enquiry;
        if (!enq) return '';
        return String(enq.ProjectName ?? enq.projectname ?? '').trim();
    }, [enquiryData?.enquiry?.ProjectName, enquiryData?.enquiry?.projectname]);

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

    /** Company line in the standard cover letter (first page) — same source as print footer when possible. */
    const quoteCoverOfferCompanyName = React.useMemo(() => {
        const n = String(footerDetails?.name || quotePreviewEnquiryCompanyFallback?.name || '').trim();
        return n || 'Almoayyed Air Conditioning W.L.L.';
    }, [footerDetails?.name, quotePreviewEnquiryCompanyFallback?.name]);

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

        // Same descendant closure as `calculateSummary` (expandBranchIdsFromSeeds): every job under any quote tab
        // root must default to checked. Direct-children-only (`collectDirectChildJobIdsFromPools`) omitted deeper
        // rows (e.g. AC Maint-HVAC) so they stayed unchecked while still shown in PRICING SUMMARY.
        const pairedBranchIds = new Set();
        const expandPairedBranchIdsFromSeeds = (seedIds) => {
            (seedIds || []).forEach((id) => {
                const s = String(id ?? '').trim();
                if (s && s !== 'undefined') pairedBranchIds.add(s);
            });
            let changed = true;
            let guard = 0;
            while (changed && guard < 200) {
                guard += 1;
                changed = false;
                jobsPool.forEach((j) => {
                    const jId = String(j.id || j.ItemID || j.ID || '');
                    const pId = String(j.parentId || j.ParentID || j.ParentIDVal || '');
                    if (!jId || jId === 'undefined') return;
                    if (pairedBranchIds.has(jId)) return;
                    if (pId && pId !== '0' && pairedBranchIds.has(pId)) {
                        pairedBranchIds.add(jId);
                        changed = true;
                    }
                });
            }
        };
        tabs.forEach((t) => {
            if (t?.realId != null && String(t.realId).trim() !== '') {
                expandPairedBranchIdsFromSeeds([t.realId]);
            }
        });

        const names = pricingSummary
            .filter((grp) => {
                const grpNameNorm = collapseSpacesLower(stripQuoteJobPrefix(grp.name || ''));
                const matchingJobs = jobsPool.filter((j) =>
                    collapseSpacesLower(stripQuoteJobPrefix(j.itemName || j.DivisionName || j.ItemName || '')) === grpNameNorm
                );
                if (matchingJobs.length === 0) return false;
                return matchingJobs.some((job) => pairedBranchIds.has(String(job.id || job.ItemID || job.ID)));
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
     * Quote customer dropdown: see `computeQuoteCustomerDropdownBaseOptions` (session email → profile Department;
     * lead vs own job → EnquiryCustomer vs parent internal job from EnquiryFor scoped to selected lead).
     */
    const quoteCustomerDropdownOptions = React.useMemo(() => {
        if (!enquiryData) return [];

        const { list, leadIsOwnJob, allJobNamesNormSet } = computeQuoteCustomerDropdownBaseOptions({
            enquiryData,
            pricingData,
            jobsPool,
            selectedLeadId,
            currentUser,
            isAdmin,
        });
        let filteredOptions = [...list];

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
     * - LeadJob = root lead job **name** (LeadJobName / ItemName), same as persisted on save — not bare L-codes.
     * - OwnJob = first tab job (or department) on own tab; selected subjob tab’s job name when a direct subjob tab is active.
     * - ToName = customer dropdown on first tab; on a direct subjob tab = first tab’s own-job name (not the dropdown).
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
        } else {
            // Subjob tab (not first): OwnJob = selected tab’s job (matches EnquiryQuotes.OwnJob intent)
            ownJobName = (ownJobNameFromJobNode(active) || activeLabelRaw).trim();
        }

        // ToName must match getQuotePayload (external customer stays HVAC; internal job-as-customer uses parent tab label).
        const toNameParam = resolveQuoteToNameForDbTuple(
            calculatedTabs,
            effectiveQuoteTabs,
            activeQuoteTab,
            toName,
            mergedJobPool
        );

        const leadJobName = resolveRootLeadJobLabelForQuotes(
            mergedJobPool,
            selectedLeadId,
            enquiryData?.leadJobPrefix || ''
        );

        if (!leadJobName || !toNameParam) return null;
        if (!useDepartmentForOwnJob && !ownJobName) return null;

        return {
            leadJobName,
            toName: toNameParam,
            ownJobName: useDepartmentForOwnJob ? null : ownJobName,
            useDepartmentForOwnJob,
        };
    }, [calculatedTabs, effectiveQuoteTabs, activeQuoteTab, toName, selectedLeadId, pricingData, enquiryData?.leadJobPrefix, jobsPool, enquiryData?.divisionsHierarchy]);

    /**
     * Same quote filtering as "Previous Quotes / Revisions" tab content (for programmatic auto-select on tab switch).
     * After `scopedEnquiryQuotesParams` — callback body and deps reference it (TDZ-safe).
     */
    const getFilteredQuotesForPreviousQuotesTab = React.useCallback(
        (tabId) => {
            let tabs = calculatedTabs && calculatedTabs.length > 0 ? calculatedTabs : [];
            if (tabs.length === 0) {
                tabs = [{ id: 'default', name: 'Own Job', label: 'Own Job', isSelf: true }];
            }
            const activeTabObj = tabs.find((t) => String(t.id) === String(tabId)) || tabs[0];
            if (!activeTabObj) return [];

            const activeTabRealId = activeTabObj.realId;

            const currentLeadCode = (() => {
                if (selectedLeadId && pricingData?.jobs) {
                    let root = pricingData.jobs.find((j) => String(j.id || j.ItemID) === String(selectedLeadId));
                    if (root) {
                        const rCode = (root.leadJobCode || root.LeadJobCode || '').toUpperCase();
                        if (rCode && rCode.match(/^L\d+/)) return rCode.split('-')[0].trim();
                        if (root.itemName?.toUpperCase().match(/^L\d+/)) return root.itemName.split('-')[0].trim().toUpperCase();
                    }
                }
                const prefix = (enquiryData?.leadJobPrefix || '').toUpperCase();
                if (!prefix) return '';
                if (prefix.match(/^L\d+/)) return prefix.split('-')[0].trim().toUpperCase();
                const hierarchy = enquiryData?.divisionsHierarchy || [];
                let job = hierarchy.find((j) => {
                    const name = (j.itemName || j.ItemName || j.DivisionName || '').toUpperCase();
                    const clean = name.replace(/^(L\d+\s*-\s*)/, '').trim();
                    return name === prefix || clean === prefix || (j.leadJobCode && j.leadJobCode.toUpperCase() === prefix);
                });
                if (job) {
                    let root = job;
                    while (root && root.parentId && root.parentId !== '0' && root.parentId !== 0) {
                        const parent = hierarchy.find((p) => String(p.id || p.ItemID) === String(root.parentId));
                        if (parent) root = parent;
                        else break;
                    }
                    if (root.leadJobCode || root.LeadJobCode) return (root.leadJobCode || root.LeadJobCode).toUpperCase();
                    if (root.itemName?.match(/^L\d+/)) return root.itemName.split('-')[0].trim().toUpperCase();
                }
                return prefix;
            })();

            const useScopedPanel = quoteScopedForPanel.length > 0;
            const quoteSourceList = useScopedPanel ? quoteScopedForPanel : existingQuotes;

            /** When `forceUnscopedToName`, re-apply ToName / tab-ancestor rules on enquiry-wide rows (scoped SQL can omit tuples). */
            function rowMatchesPreviousQuotesTab(q, forceUnscopedToName) {
                const scopedPanel = forceUnscopedToName ? false : useScopedPanel;
                const normalizedQuoteTo = normalize(q.ToName || '');
                const normalizedCurrentTo = normalize(toName || '');

                if (!scopedPanel) {
                    const activeTabAncestors = [];
                    let currAnc = activeTabRealId ? jobsPool.find((j) => String(j.id || j.ItemID || j.ID) === String(activeTabRealId)) : null;
                    let ancSafety = 0;
                    const ancVisited = new Set();
                    while (
                        currAnc &&
                        (currAnc.parentId || currAnc.ParentID) &&
                        (currAnc.parentId || currAnc.ParentID) !== '0' &&
                        (currAnc.parentId || currAnc.ParentID) !== 0 &&
                        ancSafety < 20
                    ) {
                        const pId = String(currAnc.parentId || currAnc.ParentID);
                        if (ancVisited.has(pId)) break;
                        ancVisited.add(pId);
                        const parent = jobsPool.find((j) => String(j.id || j.ItemID || j.ID) === pId);
                        if (parent) {
                            activeTabAncestors.push(normalize(parent.itemName || parent.ItemName || parent.DivisionName || ''));
                            currAnc = parent;
                            ancSafety++;
                        } else {
                            break;
                        }
                    }
                    const isExactMatch = normalizedCurrentTo && normalizedQuoteTo === normalizedCurrentTo;
                    const isAncestorMatch = activeTabAncestors.includes(normalizedQuoteTo);
                    if (!normalizedCurrentTo) return false;
                    if (!isExactMatch && !isAncestorMatch) return false;
                }

                if (scopedPanel) {
                    if (scopedEnquiryQuotesParams?.useDepartmentForOwnJob && tabs.length > 1) {
                        return quoteNumberDivisionMatchesTab(q, activeTabObj, true);
                    }
                    return true;
                }

                const parts = q.QuoteNumber?.split('/') || [];
                const qDivCode = parts[1]?.toUpperCase();
                const qLeadPart = parts[2] ? parts[2].toUpperCase() : '';
                const qLeadCodeOnly = qLeadPart.match(/L\d+/) ? qLeadPart.match(/L\d+/)[0] : '';

                const divisionMatchContextName = divisionMatchContextForQuoteTab(
                    selectedLeadId,
                    pricingData,
                    activeTabRealId,
                    activeTabObj,
                    tabs.length,
                    jobsPool
                );

                const quoteOwnCmp = collapseSpacesLower(stripQuoteJobPrefix(q.OwnJob || ''));
                const tabLabelCmp = collapseSpacesLower(
                    stripQuoteJobPrefix(activeTabObj.label || activeTabObj.name || '')
                );
                const ownJobMatchesTab = quoteOwnCmp === tabLabelCmp;

                /** Quotes are often stored with the parent lead's OwnJob (e.g. HVAC) while the tab is a subjob (BMS). */
                let ownJobMatchesActiveTabAncestor = false;
                if (!ownJobMatchesTab && activeTabRealId && tabs.length > 1 && quoteOwnCmp) {
                    let anc = jobsPool.find((j) => String(j.id || j.ItemID || j.ID) === String(activeTabRealId));
                    let ancSafety = 0;
                    while (anc && ancSafety++ < 30) {
                        const nm = collapseSpacesLower(
                            stripQuoteJobPrefix(anc.itemName || anc.ItemName || anc.DivisionName || '')
                        );
                        if (nm && nm === quoteOwnCmp) {
                            ownJobMatchesActiveTabAncestor = true;
                            break;
                        }
                        const pid = anc.parentId ?? anc.ParentID;
                        if (!pid || String(pid) === '0' || pid === 0) break;
                        anc = jobsPool.find((j) => String(j.id || j.ItemID || j.ID) === String(pid));
                    }
                }

                const isTypeMatch =
                    ownJobMatchesTab ||
                    ownJobMatchesActiveTabAncestor ||
                    matchDivisionCode(qDivCode, divisionMatchContextName, activeTabObj.divisionCode);

                if (!isTypeMatch) return false;
                if (
                    tabs.length > 1 &&
                    !quoteNumberDivisionMatchesTab(q, activeTabObj, true) &&
                    !ownJobMatchesActiveTabAncestor
                ) {
                    return false;
                }

                const currentLeadCodeClean = currentLeadCode.match(/L\d+/) ? currentLeadCode.match(/L\d+/)[0] : '';
                if (qLeadCodeOnly && currentLeadCodeClean && qLeadCodeOnly !== currentLeadCodeClean) return false;

                const userDept = (currentUser?.Department || currentUser?.Division || '').trim().toLowerCase();
                const isSubUser = userDept && !['civil', 'admin'].includes(userDept) && !isAdmin;
                if (isSubUser) {
                    const isParentCode = qDivCode === 'CVLP' || (qDivCode === 'AAC' && userDept !== 'air');
                    const isMySpecificTab = isTypeMatch;
                    if (isParentCode && !isMySpecificTab) return false;
                }

                return true;
            }

            let rows = quoteSourceList
                .filter((q) => rowMatchesPreviousQuotesTab(q, false))
                .filter(quoteRevisionShowsInSignedOnlyList);
            if (
                rows.length === 0 &&
                useScopedPanel &&
                Array.isArray(existingQuotes) &&
                existingQuotes.length > 0
            ) {
                rows = existingQuotes
                    .filter((q) => rowMatchesPreviousQuotesTab(q, true))
                    .filter(quoteRevisionShowsInSignedOnlyList);
            }
            return rows;
        },
        [
            calculatedTabs,
            quoteScopedForPanel,
            existingQuotes,
            toName,
            selectedLeadId,
            pricingData,
            enquiryData?.leadJobPrefix,
            enquiryData?.divisionsHierarchy,
            jobsPool,
            currentUser,
            isAdmin,
            scopedEnquiryQuotesParams,
        ]
    );

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
            String(scopedQuotePanelRefreshNonce),
        ].join('\x1e');
    }, [
        scopedEnquiryQuotesParams?.leadJobName,
        scopedEnquiryQuotesParams?.toName,
        scopedEnquiryQuotesParams?.ownJobName,
        scopedEnquiryQuotesParams?.useDepartmentForOwnJob,
        currentUser?.email,
        currentUser?.EmailId,
        scopedQuotePanelRefreshNonce,
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

    /**
     * When GET /by-enquiry returns 0 rows (e.g. legacy OwnJob "BMS" vs client ownJobName "BMS Project"), still detect
     * the same tuple on unscoped existingQuotes so Save/Revision and preview match the Previous Quotes list.
     */
    const quotesMatchingScopedTuple = React.useMemo(() => {
        const rn = enquiryData?.enquiry?.RequestNo;
        const p = scopedEnquiryQuotesParams;
        if (!rn || !p) return [];
        const rnNorm = String(rn).trim();
        return (existingQuotes || []).filter((q) =>
            quoteRowMatchesEnquiryScopedParams(q, p, rnNorm)
        );
    }, [enquiryData?.enquiry?.RequestNo, scopedEnquiryQuotesParams, existingQuotes]);

    /** Save only when no DB quote for this enquiry+lead+ownjob+ToName tuple; Revision only when one exists. */
    const hasPersistedQuoteForScope = React.useMemo(() => {
        if (!enquiryData?.enquiry?.RequestNo) return false;
        const qn = String(quoteNumber || '').trim();
        const savedRefShape = qn.includes('/') && /-R\d+/i.test(qn);
        const hasRowId = quoteId != null && String(quoteId).trim() !== '';

        if (scopedEnquiryQuotesParams) {
            // Client-side tuple (unscoped list) — do not wait on scoped GET; fixes Save/Revision when API row shape or fetch key lags.
            if (quotesMatchingScopedTuple.length > 0) return true;
            // In-memory quote ref must still belong to THIS RequestNo+LeadJob+ToName+OwnJob tuple (not another row on same enquiry).
            if (hasRowId && savedRefShape) {
                const hit = (existingQuotes || []).find((q) => String(quoteRowId(q) ?? '') === String(quoteId ?? ''));
                if (
                    hit &&
                    quoteRowMatchesEnquiryScopedParams(
                        hit,
                        scopedEnquiryQuotesParams,
                        String(enquiryData?.enquiry?.RequestNo ?? '').trim()
                    )
                ) {
                    return true;
                }
            }
            if (scopedQuotesFetchSettledKey !== scopedQuotePanelFetchKey) return false;
            const rn = String(enquiryData?.enquiry?.RequestNo ?? '').trim();
            const strictScoped = (quoteScopedForPanel || []).filter((q) =>
                quoteRowMatchesEnquiryScopedParams(q, scopedEnquiryQuotesParams, rn)
            );
            return strictScoped.length > 0;
        }
        return hasRowId;
    }, [
        enquiryData?.enquiry?.RequestNo,
        scopedEnquiryQuotesParams,
        scopedQuotesFetchSettledKey,
        scopedQuotePanelFetchKey,
        quoteScopedForPanel,
        quotesMatchingScopedTuple.length,
        quoteId,
        quoteNumber,
        existingQuotes,
    ]);

    /** Enable Revision when quoteId is set or a matching tuple row has a DB id (scoped GET may be empty). */
    const latestPersistedRowForRevise = React.useMemo(() => {
        if (!quotesMatchingScopedTuple?.length) return null;
        return [...quotesMatchingScopedTuple].sort((a, b) => {
            const r = (Number(b.RevisionNo) || 0) - (Number(a.RevisionNo) || 0);
            if (r !== 0) return r;
            const ta = Date.parse(a.QuoteDate || 0) || 0;
            const tb = Date.parse(b.QuoteDate || 0) || 0;
            return tb - ta;
        })[0];
    }, [quotesMatchingScopedTuple]);

    const canRevisePersistedQuote = React.useMemo(() => {
        const ridLatest = quoteRowId(latestPersistedRowForRevise);
        if (ridLatest != null && String(ridLatest).trim() !== '') return true;
        const p = scopedEnquiryQuotesParams;
        const rn = enquiryData?.enquiry?.RequestNo;
        if (quoteId != null && String(quoteId).trim() !== '' && p && rn) {
            const hit = (existingQuotes || []).find((q) => String(quoteRowId(q) ?? '') === String(quoteId ?? ''));
            return !!(
                hit &&
                quoteRowMatchesEnquiryScopedParams(hit, p, String(rn).trim())
            );
        }
        return false;
    }, [quoteId, latestPersistedRowForRevise, scopedEnquiryQuotesParams, enquiryData?.enquiry?.RequestNo, existingQuotes]);

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

        const tabJobForLogo =
            activeTab?.realId != null
                ? jobsPool.find((j) => String(j.id || j.ItemID || j.ID) === String(activeTab.realId))
                : null;
        const hierarchyLogoNode =
            activeTab?.realId != null && Array.isArray(enquiryData?.divisionsHierarchy)
                ? enquiryData.divisionsHierarchy.find(
                      (d) => String(d.id || d.ItemID || d.ID) === String(activeTab.realId)
                  )
                : null;
        const logoFromActiveJob =
            (activeTab.companyLogo && String(activeTab.companyLogo).trim()) ||
            tabJobForLogo?.companyLogo ||
            tabJobForLogo?.CompanyLogo ||
            hierarchyLogoNode?.companyLogo ||
            hierarchyLogoNode?.CompanyLogo ||
            null;

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
                const mefLogo = (mefHit.companyLogo && String(mefHit.companyLogo).trim()) || null;
                const logo = mefLogo || logoFromActiveJob || (enquiryData?.enquiryLogo ? String(enquiryData.enquiryLogo).trim() : null) || null;
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

        const jobNode = tabJobForLogo;

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

        const jobLogo =
            jobNode?.companyLogo ||
            jobNode?.CompanyLogo ||
            hierarchyLogoNode?.companyLogo ||
            hierarchyLogoNode?.CompanyLogo ||
            null;
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
                logoFromActiveJob ||
                jobLogo ||
                (cdSafe?.logo ?? null) ||
                (enquiryData?.enquiryLogo ? String(enquiryData.enquiryLogo).trim() : null) ||
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
                ? logoFromActiveJob || jobLogo || (enquiryData?.enquiryLogo ? String(enquiryData.enquiryLogo).trim() : null) || personalProfile?.logo || null
                : personalProfile?.logo || logoFromActiveJob || jobLogo || (enquiryData?.enquiryLogo ? String(enquiryData.enquiryLogo).trim() : null) || null;
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
        enquiryData?.divisionsHierarchy,
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
        // Loaded revision: attention comes from loadQuote(row). Do not replace with enquiry heuristics.
        if (quoteId != null && String(quoteId).trim() !== '') return;

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
    }, [toName, enquiryData, pricingData?.jobs, quoteId]); // toAttention intentionally excluded — see note above



    // Load Pricing Data when enquiry and customer are selected (bootstrap with empty customer during row-pick sync)
    useEffect(() => {
        const req = enquiryData?.enquiry?.RequestNo;
        if (!req) return;
        const cx = (toName || '').trim();
        if (cx) {
            console.log('[useEffect] Loading pricing data for:', req, 'Customer:', cx);
            loadPricingData(req, cx);
        } else if (quoteRowSyncDropdownCustomerRef.current) {
            console.log('[useEffect] Bootstrap pricing for row enquiry (empty customer):', req);
            loadPricingData(req, '');
        }
    }, [enquiryData, toName]);

    // Pick pricing root for lead dropdown after list-row enquiry load (searchTerm / pending click).
    useEffect(() => {
        if (!quoteRowAutoSelectLeadRef.current) return;
        if (!pricingData?.jobs?.length || !enquiryData?.leadJobPrefix) return;

        const ed = enquiryData;
        const full = String(quoteRowFirstLeadDivisionFullRef.current || '').trim();
        let jobObj = null;
        if (full) {
            jobObj = resolvePricingRootForLeadSelect(full, pricingData.jobs, ed.divisionsHierarchy);
        }
        if (!jobObj) {
            const roots = (pricingData.jobs || []).filter(
                (j) => !j.parentId || j.parentId === '0' || j.parentId === 0 || String(j.parentId) === '0'
            );
            const pNorm = String(ed.leadJobPrefix || '').trim().toUpperCase();
            jobObj =
                roots.find((j) => {
                    const lc = String(j.leadJobCode || j.LeadJobCode || '').trim().toUpperCase();
                    if (lc && (lc === pNorm || lc.startsWith(pNorm) || pNorm.startsWith(lc.slice(0, 3)))) return true;
                    const m = String(j.itemName || j.ItemName || j.DivisionName || '').match(/^(L\d+)/i);
                    return m && m[1].toUpperCase() === pNorm;
                }) || null;
        }
        if (jobObj) {
            const id = jobObj.id ?? jobObj.ItemID;
            if (id != null && String(id).trim() !== '') {
                setSelectedLeadId(id);
            }
        } else {
            quoteRowDivisionLeadLockRef.current = false;
            quoteRowAwaitingLeadForCustomerRef.current = false;
        }
        quoteRowAutoSelectLeadRef.current = false;
        quoteRowFirstLeadDivisionFullRef.current = '';
    }, [pricingData, enquiryData]);

    // External customer row on EnquiryCustomer often carries "(L#)"; align lead dropdown + L pill with that branch.
    useEffect(() => {
        if (quoteRowDivisionLeadLockRef.current) return;
        if (!enquiryData?.enquiry?.RequestNo || !pricingData?.jobs?.length) return;
        const tn = (toName || '').trim();
        if (!tn) return;
        if (isQuoteInternalCustomer(enquiryData, pricingData.jobs, tn)) return;

        const leadCode = resolveLeadCodeFromCustomerSelection(tn, enquiryData.customerOptions);
        if (!leadCode) return;

        const root = findPricingRootJobForLeadCode(pricingData.jobs, leadCode);
        if (!root) return;

        const nextId = root.id ?? root.ItemID;
        if (nextId == null || String(nextId).trim() === '') return;

        let activeRootCode = '';
        if (selectedLeadId != null && String(selectedLeadId).trim() !== '') {
            const node = pricingData.jobs.find((j) => String(j.id || j.ItemID) === String(selectedLeadId));
            if (node) {
                const r = walkUpToRootPricingJob(pricingData.jobs, node);
                activeRootCode = extractLeadCodeFromPricingJob(r);
            }
        }

        const prefix = String(enquiryData.leadJobPrefix || '').trim().toUpperCase();
        const prefixAligned =
            prefix === leadCode ||
            prefix.startsWith(`${leadCode} `) ||
            prefix.startsWith(`${leadCode}-`);

        if (activeRootCode === leadCode && prefixAligned && String(selectedLeadId) === String(nextId)) {
            return;
        }

        setSelectedLeadId(nextId);
        setEnquiryData((prev) => {
            if (!prev) return prev;
            const p = String(prev.leadJobPrefix || '').trim().toUpperCase();
            if (p === leadCode || p.startsWith(`${leadCode} `) || p.startsWith(`${leadCode}-`)) return prev;
            return { ...prev, leadJobPrefix: leadCode };
        });
    }, [
        enquiryData?.enquiry?.RequestNo,
        enquiryData?.customerOptions,
        enquiryData?.leadJobPrefix,
        toName,
        pricingData?.jobs,
        selectedLeadId,
    ]);

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

    /** Clears customer fields for a lead-only switch. Quote id is never carried across lead branches. */
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
    const handleCustomerChange = (selectedOption, opts = {}) => {
        const leadJobAutoReselect = !!opts.leadJobAutoReselect;
        const selectedName = selectedOption ? selectedOption.value : '';
        console.log('[handleCustomerChange] Selected:', selectedName);

        // Only reset if effectively changed (prevents auto-selection from clearing active quote).
        // After a lead-job change we may re-apply the same customer label; tuple changed so we must not no-op.
        if (!leadJobAutoReselect && normalize(selectedName) === normalize(toName)) {
            console.log('[handleCustomerChange] Customer name unchanged (normalized), skipping reset.');
            return;
        }

        quoteRowDivisionLeadLockRef.current = false;

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
            setQuoteNumber(''); // Stale ref (e.g. BEMCO) must not stay on preview for a new "To" customer
            setLoadedEnquiryQuoteRowForPreview(null);
            setQuoteDate(''); // Reset date to blank for new customer selection
            setPreparedBy((currentUser?.FullName || currentUser?.name || '').trim());
            setSignatory('');
            setSignatoryDesignation('');
        } else {
            preserveQuoteOnLeadChangeRef.current = null;
            autoSelectCustomerAfterLeadChangeRef.current = false;
            // Same customer re-picked after a lead-job change: still a different tuple (enquiry + lead + customer).
            setQuoteId(null);
            setQuoteNumber('');
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

    // Search/pending row enquiry pick: "To" = first entry in the same list as the customer dropdown (not EnquiryCustomer row order).
    useEffect(() => {
        if (!quoteRowSyncDropdownCustomerRef.current) return;
        if (!enquiryData || !pricingData?.jobs?.length) return;
        if (
            quoteRowAwaitingLeadForCustomerRef.current &&
            (selectedLeadId == null || String(selectedLeadId).trim() === '')
        ) {
            return;
        }

        const { list } = computeQuoteCustomerDropdownBaseOptions({
            enquiryData,
            pricingData,
            jobsPool,
            selectedLeadId,
            currentUser,
            isAdmin,
        });
        const first = list[0];
        const fallback =
            Array.isArray(enquiryData.customerOptions) && enquiryData.customerOptions.length > 0
                ? String(enquiryData.customerOptions[0]).trim()
                : String(enquiryData.enquiry?.CustomerName || '')
                      .split(',')[0]
                      .trim() || '';

        if (!first?.value?.trim() && !fallback) {
            quoteRowSyncDropdownCustomerRef.current = false;
            quoteRowAwaitingLeadForCustomerRef.current = false;
            return;
        }

        quoteRowSyncDropdownCustomerRef.current = false;
        quoteRowAwaitingLeadForCustomerRef.current = false;

        if (first?.value?.trim()) {
            handleCustomerChange(
                {
                    value: first.value.trim(),
                    label: first.label || first.value,
                    type: first.type,
                },
                { leadJobAutoReselect: true }
            );
            return;
        }
        handleCustomerChange({ value: fallback, label: fallback }, { leadJobAutoReselect: true });
        // eslint-disable-next-line react-hooks/exhaustive-deps -- handleCustomerChange is stable enough per render; avoid dep churn
    }, [enquiryData, pricingData, selectedLeadId, currentUser, isAdmin, jobsPool]);

    // After changing lead job: re-apply the same customer when preserved (so scoped quote fetch matches saved ToName);
    // otherwise auto-pick the first customer from the newly filtered list.
    useEffect(() => {
        if (!autoSelectCustomerAfterLeadChangeRef.current) return;
        if (!enquiryData) return;

        const current = (toName || '').trim();
        if (current) {
            // User/manual selection already exists; do not override.
            autoSelectCustomerAfterLeadChangeRef.current = false;
            return;
        }

        const preserved = (preserveQuoteOnLeadChangeRef.current?.toName || '').trim();
        const first = quoteCustomerDropdownOptions[0];
        const targetNorm = preserved ? normalize(preserved) : '';
        const matchOpt =
            (preserved &&
                quoteCustomerDropdownOptions.find((o) => o?.value && normalize(o.value) === targetNorm)) ||
            first;
        if (!matchOpt?.value) return; // Wait until options arrive/recompute.

        handleCustomerChange(matchOpt, { leadJobAutoReselect: true });
        autoSelectCustomerAfterLeadChangeRef.current = false;
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
        const had = jobNameMatchesActiveJobsList(jobName, selectedJobs);
        const nJob = collapseSpacesLower(stripQuoteJobPrefix(jobName));
        const newSelected = had
            ? selectedJobs.filter(
                  (j) => collapseSpacesLower(stripQuoteJobPrefix(String(j || ''))) !== nJob
              )
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
            const optJob = opt.itemName
                ? jobsPool.find(
                      (j) =>
                          (j.itemName || j.ItemName || j.DivisionName || '').trim().toLowerCase() ===
                          opt.itemName.trim().toLowerCase()
                  ) ||
                  jobsPool.find(
                      (j) =>
                          collapseSpacesLower(
                              stripQuoteJobPrefix(j.itemName || j.ItemName || j.DivisionName || '')
                          ) === collapseSpacesLower(stripQuoteJobPrefix(opt.itemName || ''))
                  )
                : null;
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
            const isJobIncluded = !opt.itemName || jobNameMatchesActiveJobsList(opt.itemName, activeJobs);

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
                    const nameKeyFull = `${opt.id}_${job.itemName}`;
                    const nameKeyStripped = `${opt.id}_${stripQuoteJobPrefix(job.itemName || '')}`;
                    let val =
                        effectiveValuesLookup[key] ||
                        effectiveValuesLookup[nameKeyFull] ||
                        effectiveValuesLookup[nameKeyStripped];
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
                                    const vNameKeyFull = `${iOpt.id}_${job.itemName}`;
                                    const vNameKeyStrip = `${iOpt.id}_${stripQuoteJobPrefix(job.itemName || '')}`;
                                    const iVal =
                                        vals[vKey] || vals[vNameKeyFull] || vals[vNameKeyStrip];
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
                                    const vNameKeyFull = `${iOpt.id}_${job.itemName}`;
                                    const vNameKeyStrip = `${iOpt.id}_${stripQuoteJobPrefix(job.itemName || '')}`;
                                    const iVal =
                                        vals[vKey] || vals[vNameKeyFull] || vals[vNameKeyStrip];
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
                        const isThisJobActive =
                            activeJobs.length === 0 || jobNameMatchesActiveJobsList(job.itemName, activeJobs);
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

        const { tableHtml, htmlGrandTotal } = buildEmsAutoPricingTableHtml(summary, activeJobs);

        // Update Pricing Terms Text with Dynamic Total
        let pricingText = defaultClauses.pricingTerms || '';
        if (htmlGrandTotal > 0 && !foundPricedOptional) {
            const formattedTotal = htmlGrandTotal.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
            const words = numberToWordsBHD(htmlGrandTotal);
            const totalString = `BD ${formattedTotal} (${words})`;

            pricingText = pricingText.replace('[Amount in figures and words]', totalString);
        }

        let pricingTermsFull = mergePricingTermsClauseHtml(
            clauseContentRef.current?.pricingTerms,
            tableHtml,
            pricingText
        );
        if (htmlGrandTotal > 0 && !foundPricedOptional) {
            pricingTermsFull = syncPricingTerms41LumpSumProse(
                pricingTermsFull,
                htmlGrandTotal,
                foundPricedOptional,
                numberToWordsBHD
            );
        }

        /** Same as sidebar "GRAND BASE PRICE TOTAL": Base Price only for jobs checked in Pricing Summary (EnquiryQuotes.TotalAmount). */
        const grandBasePriceFromCheckedJobs =
            !activeJobs || activeJobs.length === 0
                ? 0
                : summary.reduce(
                      (sum, g) =>
                          jobNameMatchesActiveJobsList(g.name, activeJobs)
                              ? sum +
                                (g.items || []).reduce(
                                    (s, i) => (i.name === 'Base Price' ? s + i.total : s),
                                    0
                                )
                              : sum,
                      0
                  );

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
                grand: round6(grandBasePriceFromCheckedJobs),
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
        setGrandTotal(grandBasePriceFromCheckedJobs);
        setHasPricedOptional(foundPricedOptional);

        if (import.meta.env.DEV) {
            console.log('[calculateSummary] effectiveValuesLookup keys:', Object.keys(effectiveValuesLookup).length, 'scoped data.values keys:', Object.keys(scopedValuesFlat).length);
            console.log('[calculateSummary] included options (post filters):', includedOptionCount, 'unique option rows:', uniqueOptions.length, 'skipReasons (sample):', skipReasons.slice(0, 20));
            console.log('[calculateSummary] COMPLETE');
            console.log('[calculateSummary] Summary:', summary);
            console.log('[calculateSummary] Grand Total (checked Base Price):', grandBasePriceFromCheckedJobs, 'legacy calc:', calculatedGrandTotal);
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


    /**
     * @param opts.preserveRecipient When true (all AutoLoad / sidebar / tab paths), never copy To* from the quote row —
     *   the customer line stays the selected dropdown value. Subjob tabs also skip row To* via `isSubJobTab`.
     * @param opts.forActiveQuoteTab When set, treat this as the active Previous Quotes tab for subjob vs parent detection.
     *   `handleTabChange` passes this in a microtask so `loadQuote` does not see a stale `activeQuoteTab` before React commits
     *   (was copying `ToName` from the row while still on the parent tab → wrong customer on subjob preview).
     * @param opts.skipPreparedSignatory If true and the quote row has **no** Prepared By, default to the logged-in user
     *   (auto-load / tab sync). When Prepared By exists on the row it is **always** shown so parent/subjob previews match the saved revision.
     */
    const loadQuote = (quote, opts = {}) => {
        if (!currentUser) {
            alert("Please login to access quotes.");
            return;
        }

        const skipPreparedSignatory = opts.skipPreparedSignatory === true;
        const preserveRecipient = opts.preserveRecipient === true;
        const effectiveQuoteTab =
            opts.forActiveQuoteTab != null && String(opts.forActiveQuoteTab).trim() !== ''
                ? String(opts.forActiveQuoteTab)
                : String(activeQuoteTab ?? '');

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
        setQuoteDate(quoteRowDateToInputYmd(quote));
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
        {
            const fromRow = String(quote.PreparedBy ?? quote.preparedby ?? '').trim();
            if (fromRow) {
                setPreparedBy(fromRow);
            } else if (skipPreparedSignatory) {
                setPreparedBy((currentUser?.FullName || currentUser?.name || '').trim());
            } else {
                setPreparedBy('');
            }
        }
        setSignatory((quote.Signatory || '').trim());
        setSignatoryDesignation((quote.SignatoryDesignation || '').trim());

        setLoadedQuotePreparedByEmail(String(quote.PreparedByEmail ?? quote.preparedbyemail ?? '').trim());

        const tabAtLoadForRecipient = (calculatedTabs || []).find((t) => String(t.id) === effectiveQuoteTab);
        const skipRecipientFromRow = !!tabAtLoadForRecipient?.isSubJobTab || preserveRecipient;
        // Subjob tab OR preserveRecipient: do not overwrite the **dropdown** (e.g. external lead customer). A4 "To" for
        // subjobs still comes from EnquiryQuotes (`loadedEnquiryQuoteRowForPreview` + `quotePreviewToBlockDisplay`).
        if (!skipRecipientFromRow) {
            setToName(String(quote.ToName ?? quote.toname ?? '').trim());
            setToAddress(String(quote.ToAddress ?? quote.toaddress ?? '').trim());
            setToPhone(String(quote.ToPhone ?? quote.tophone ?? '').trim());
            setToEmail(String(quote.ToEmail ?? quote.toemail ?? '').trim());
            setToFax(String(quote.ToFax ?? quote.tofax ?? '').trim());
        }

        // Do not merge profiles onto a persisted EnquiryQuotes row — that replaced subjob "To" block with parent HVAC profile.
        const isPersistedEnquiryQuoteRow = quoteRowId(quote) !== undefined;
        if (!skipRecipientFromRow && !isPersistedEnquiryQuoteRow && !quote.ToAddress && enquiryData?.availableProfiles) {
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

        // Attention: always honour DB when non-empty (subjob quotes often use names outside the dropdown list).
        const savedAttTrim = String(quote.ToAttention ?? quote.toattention ?? '').trim();
        const deriveAttentionFromCustomerName = (customerishName) => {
            const nm = String(customerishName || '').trim();
            if (!nm) return '';
            if (isQuoteInternalCustomer(enquiryData, pricingData?.jobs, nm)) {
                const intAtt = resolveQuoteInternalAttentionFlexible(enquiryData, nm);
                const allowed = Array.isArray(intAtt?.options) ? intAtt.options.filter(Boolean) : [];
                if (intAtt?.defaultAttention) return String(intAtt.defaultAttention).trim();
                if (allowed.length) return String(allowed[0]).trim();
                return '';
            }
            if (nm && enquiryData?.customerContacts) {
                const contact = enquiryData.customerContacts[nm.trim()];
                if (contact) return String(contact).trim();
            }
            return String(enquiryData?.enquiry?.ReceivedFrom || '').trim();
        };
        if (savedAttTrim) {
            setToAttention(savedAttTrim);
        } else {
            const qToName = quote.ToName || '';
            const ownJob = String(quote.OwnJob || '').trim();
            const ownNorm = ownJob ? collapseSpacesLower(stripQuoteJobPrefix(ownJob)) : '';
            const toNorm = qToName ? collapseSpacesLower(stripQuoteJobPrefix(qToName)) : '';
            let derived = '';
            if (ownNorm && toNorm && ownNorm !== toNorm) {
                derived = deriveAttentionFromCustomerName(ownJob);
            }
            if (!derived) derived = deriveAttentionFromCustomerName(qToName);
            setToAttention(derived);
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
        {
            const stampsFromDb = parseDigitalSignaturesFromQuoteRow(quote);
            setQuoteDigitalStamps(stampsFromDb);
        }
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
            const rowToForSummary = String(quote.ToName ?? quote.toname ?? '').trim();
            const summaryToName = skipRecipientFromRow
                ? rowToForSummary || String(toNameRef.current || '').trim()
                : rowToForSummary;
            calculateSummary(pricingData, undefined, summaryToName, newScope);
            // Note: If pricingData is not for the correct customer, this might be slightly off provided values,
            // but structure will be correct. Usually Previous Quote Context implies same active enquiry.
        }

        const tabAtLoad = (calculatedTabs || []).find((t) => String(t.id) === effectiveQuoteTab);
        if (tabAtLoad?.isSubJobTab) {
            setLoadedEnquiryQuoteRowForPreview(quote);
        } else {
            setLoadedEnquiryQuoteRowForPreview(null);
        }
    };

    // Auto-load Quote or Clear Form when Active Tab Changes
    useEffect(() => {
        if (!activeQuoteTab || !calculatedTabs) return;
        if (typeof performance !== 'undefined' && performance.now() < quoteDraftHydrateSkipAutoLoadUntilRef.current) {
            return;
        }
        if (
            typeof performance !== 'undefined' &&
            performance.now() < quoteTabRestoreSuppressLoadQuoteUntilRef.current
        ) {
            return;
        }

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
        const rnScope = String(enquiryData?.enquiry?.RequestNo ?? '').trim();
        const rawSource = scopedOnly
            ? quoteScopedForPanel
            : (quoteScopedForPanel.length > 0 ? quoteScopedForPanel : existingQuotes);
        /** GET /by-enquiry is keyed off the new tuple before the response arrives — drop prior-customer rows. */
        const sourceQuotes =
            scopedOnly && scopedEnquiryQuotesParams && rnScope
                ? (rawSource || []).filter((q) =>
                      quoteRowMatchesEnquiryScopedParams(q, scopedEnquiryQuotesParams, rnScope)
                  )
                : rawSource;

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

        // Must match "Previous Quotes / Revisions" list logic (getFilteredQuotesForPreviousQuotesTab).
        // When scoped GET returns [] for the new tab's tuple, `sourceQuotes` is empty but the sidebar still uses
        // `existingQuotes` (see render: useScopedPanel = quoteScopedForPanel.length > 0). Intersecting with []
        // made tabQuotes always empty → else branch cleared Quote Ref to Draft on every subjob tab switch.
        const filteredForActiveTab = getFilteredQuotesForPreviousQuotesTab(activeQuoteTab);
        const tabQuotes =
            sourceQuotes.length > 0
                ? filteredForActiveTab.filter((q) =>
                      sourceQuotes.some((s) => String(quoteRowId(s) ?? '') === String(quoteRowId(q) ?? ''))
                  )
                : filteredForActiveTab;

        /** User picked a specific revision in this tab — do not snap the preview back to tab.quoteNo / latest. */
        const formViewingSomeTabQuote =
            quoteId != null &&
            String(quoteId).trim() !== '' &&
            tabQuotes.some((q) => isFormSyncedToQuoteRow(q, quoteId, quoteNumber));

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
                if (
                    !isFormSyncedToQuoteRow(byNo, quoteId, quoteNumber) &&
                    !formViewingSomeTabQuote
                ) {
                    console.log('[AutoLoad] Loading from tab.quoteNo:', want);
                    loadQuote(byNo, { preserveRecipient: true, skipPreparedSignatory: true });
                }
                return;
            }
        }

        if (tabQuotes.length > 0) {
            // Found quotes: Sort by Revision (Desc) and Load Latest
            const sorted = [...tabQuotes].sort((a, b) => (Number(b.RevisionNo) || 0) - (Number(a.RevisionNo) || 0));
            const latest = sorted[0];

            if (!formViewingSomeTabQuote && !isFormSyncedToQuoteRow(latest, quoteId, quoteNumber)) {
                console.log('[AutoLoad] Loading latest quote:', latest.QuoteNumber, 'for branch:', currentLeadCode);
                loadQuote(latest, { preserveRecipient: true, skipPreparedSignatory: true });
            }
        } else {
            console.log('[AutoLoad] No quotes found for tab. Branch:', currentLeadCode);
            if (!(toName || '').trim()) {
                console.log('[AutoLoad] toName empty; skip reset until customer is set again.');
                return;
            }
            // No persisted row for this RequestNo+LeadJob+ToName+OwnJob tuple but UI may still hold another customer's Quote Ref.
            if (
                scopedEnquiryQuotesParams &&
                quotesMatchingScopedTuple.length === 0 &&
                (quoteNumber || '').trim() &&
                (quoteId == null || String(quoteId).trim() === '')
            ) {
                setQuoteNumber('');
                setLoadedEnquiryQuoteRowForPreview(null);
                const regStale = tabStateRegistry.current[activeQuoteTab];
                if (regStale && typeof regStale === 'object') {
                    regStale.quoteNumber = '';
                }
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
                    const viewingFromRelaxed =
                        quoteId != null &&
                        String(quoteId).trim() !== '' &&
                        relaxedByCustomerAndLead.some((q) =>
                            isFormSyncedToQuoteRow(q, quoteId, quoteNumber)
                        );
                    if (
                        latestRelaxed &&
                        !viewingFromRelaxed &&
                        !isFormSyncedToQuoteRow(latestRelaxed, quoteId, quoteNumber)
                    ) {
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
        quoteNumber,
        jobsPool,
        getFilteredQuotesForPreviousQuotesTab,
        quotesMatchingScopedTuple,
    ]);

    // Hard fallback: when scoped API rows exist (or client-matched existingQuotes), load the latest for the active tab.
    // Never keep the full unfiltered panel when the tab filter is empty — that loaded another tab's Quote Ref (e.g. BMS on HVAC).
    useEffect(() => {
        if (typeof performance !== 'undefined' && performance.now() < quoteDraftHydrateSkipAutoLoadUntilRef.current) {
            return;
        }
        if (
            typeof performance !== 'undefined' &&
            performance.now() < quoteTabRestoreSuppressLoadQuoteUntilRef.current
        ) {
            return;
        }
        if (!(toName || '').trim()) return;

        const rnHard = String(enquiryData?.enquiry?.RequestNo ?? '').trim();
        const scopePHard = scopedEnquiryQuotesParams;
        let basePanel =
            quoteScopedForPanel?.length > 0
                ? quoteScopedForPanel
                : quotesMatchingScopedTuple?.length > 0
                  ? quotesMatchingScopedTuple
                  : [];
        if (scopePHard && rnHard && basePanel.length > 0) {
            basePanel = basePanel.filter((q) => quoteRowMatchesEnquiryScopedParams(q, scopePHard, rnHard));
        }

        // Only wait for scoped GET when we have no rows from API and no client-side tuple match yet.
        if (
            scopedEnquiryQuotesParams &&
            scopedQuotesFetchSettledKey !== scopedQuotePanelFetchKey &&
            basePanel.length === 0
        ) {
            return;
        }

        if (!basePanel.length) return;

        const activeTabObj = calculatedTabs?.find((t) => String(t.id) === String(activeQuoteTab));
        let panel = basePanel;
        const scopeP = scopedEnquiryQuotesParams;
        const multiTab = (calculatedTabs?.length || 0) > 1;
        const narrowed =
            !!(activeTabObj && (activeTabObj.label || activeTabObj.name)) &&
            (multiTab || !!scopeP?.useDepartmentForOwnJob);

        // Same narrowing as Previous Quotes list + AutoLoad (getFilteredQuotesForPreviousQuotesTab). The old
        // OwnJob / division filter could empty the panel while the sidebar still showed a row — then `!latest`
        // cleared Quote Ref to Draft after a successful load.
        if (narrowed && activeTabObj) {
            const aligned = getFilteredQuotesForPreviousQuotesTab(activeQuoteTab);
            const baseIds = new Set(
                basePanel.map((q) => String(quoteRowId(q) ?? '')).filter((id) => id !== '' && id !== 'undefined')
            );
            panel = aligned.filter((q) => baseIds.has(String(quoteRowId(q) ?? '')));
        }

        const currentInScope =
            !!quoteId && panel.some((q) => isFormSyncedToQuoteRow(q, quoteId, quoteNumber));
        if (currentInScope) return;

        const latest = [...panel].sort((a, b) => {
            const r = (Number(b.RevisionNo) || 0) - (Number(a.RevisionNo) || 0);
            if (r !== 0) return r;
            const ta = Date.parse(a.QuoteDate || 0) || 0;
            const tb = Date.parse(b.QuoteDate || 0) || 0;
            return tb - ta;
        })[0];

        if (!latest) {
            const aligned = getFilteredQuotesForPreviousQuotesTab(activeQuoteTab);
            const rescue = aligned.find((q) =>
                basePanel.some((b) => String(quoteRowId(b) ?? '') === String(quoteRowId(q) ?? ''))
            );
            if (rescue && !isFormSyncedToQuoteRow(rescue, quoteId, quoteNumber)) {
                loadQuote(rescue, { preserveRecipient: true, skipPreparedSignatory: true });
                return;
            }
            const trulyNoRowForTab = !aligned.some((q) =>
                basePanel.some((b) => String(quoteRowId(b) ?? '') === String(quoteRowId(q) ?? ''))
            );
            if (narrowed && trulyNoRowForTab && (quoteId !== null || (quoteNumber || '').trim() !== '')) {
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
        if (!isFormSyncedToQuoteRow(latest, quoteId, quoteNumber)) {
            loadQuote(latest, { preserveRecipient: true, skipPreparedSignatory: true });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- calculatedTabs read from closure; quoteTabsFingerprint tracks meaningful tab/quoteNo changes
    }, [
        quoteScopedForPanel,
        quotesMatchingScopedTuple,
        quoteId,
        quoteNumber,
        toName,
        activeQuoteTab,
        quoteTabsFingerprint,
        scopedEnquiryQuotesParams,
        scopedQuotesFetchSettledKey,
        scopedQuotePanelFetchKey,
        getFilteredQuotesForPreviousQuotesTab,
    ]);

    /** When the user switches Previous Quotes job tabs, load the latest saved quote for that tab (matches sidebar list). */
    const prevQuoteTabForAutoLoadRef = React.useRef(null);
    const lastTabAutoLoadEnquiryRef = React.useRef(null);
    useEffect(() => {
        if (typeof performance !== 'undefined' && performance.now() < quoteDraftHydrateSkipAutoLoadUntilRef.current) {
            return;
        }
        if (
            typeof performance !== 'undefined' &&
            performance.now() < quoteTabRestoreSuppressLoadQuoteUntilRef.current
        ) {
            return;
        }
        const rn = enquiryData?.enquiry?.RequestNo;
        if (rn && lastTabAutoLoadEnquiryRef.current !== rn) {
            lastTabAutoLoadEnquiryRef.current = rn;
            prevQuoteTabForAutoLoadRef.current = null;
            quoteTabRestoreSuppressLoadQuoteUntilRef.current = 0;
        }
        if (!rn || !(toName || '').trim() || !activeQuoteTab || !calculatedTabs?.length) return;
        if (!pricingData && !enquiryData) return;

        const prevTab = prevQuoteTabForAutoLoadRef.current;
        if (prevTab === null) {
            prevQuoteTabForAutoLoadRef.current = activeQuoteTab;
            return;
        }
        if (prevTab === activeQuoteTab) return;

        const filtered = getFilteredQuotesForPreviousQuotesTab(activeQuoteTab);
        // Scoped / by-enquiry quotes often arrive after the tab change. Do NOT advance prevQuoteTabForAutoLoadRef
        // until we have rows — otherwise the next run sees prev === active and never loads the preview (Draft stuck).
        if (!filtered.length) return;

        prevQuoteTabForAutoLoadRef.current = activeQuoteTab;

        const latest = [...filtered].sort((a, b) => (Number(b.RevisionNo) || 0) - (Number(a.RevisionNo) || 0))[0];
        if (isFormSyncedToQuoteRow(latest, quoteId, quoteNumber)) return;

        loadQuote(latest, { preserveRecipient: true, skipPreparedSignatory: true });
        // eslint-disable-next-line react-hooks/exhaustive-deps -- loadQuote is defined in-component; tab-change guard uses ref
    }, [
        activeQuoteTab,
        enquiryData?.enquiry?.RequestNo,
        toName,
        calculatedTabs,
        getFilteredQuotesForPreviousQuotesTab,
        quoteId,
        quoteNumber,
        quoteScopedForPanel,
        existingQuotes,
        quoteTabsFingerprint,
        pricingData,
        enquiryData,
    ]);



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
        const sortedTuple = (() => {
            if (!quotesMatchingScopedTuple?.length) return [];
            return [...quotesMatchingScopedTuple].sort((a, b) => {
                const r = (Number(b.RevisionNo) || 0) - (Number(a.RevisionNo) || 0);
                if (r !== 0) return r;
                const ta = Date.parse(a.QuoteDate || 0) || 0;
                const tb = Date.parse(b.QuoteDate || 0) || 0;
                return tb - ta;
            });
        })();
        const tupleLatest = sortedTuple[0];
        const idFromTuple = tupleLatest ? quoteRowId(tupleLatest) : undefined;
        const effectiveReviseId =
            quoteId != null && String(quoteId).trim() !== '' ? quoteId : idFromTuple;

        if (tupleLatest && (!quoteId || String(quoteId).trim() === '') && idFromTuple) {
            loadQuote(tupleLatest, { preserveRecipient: true, skipPreparedSignatory: true });
        }

        console.log('[handleRevise] Starting revision process. QuoteId:', effectiveReviseId);
        if (effectiveReviseId == null || String(effectiveReviseId).trim() === '') {
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
            console.log('[handleRevise] Calling API:', `${API_BASE}/api/quotes/${effectiveReviseId}/revise`);

            const res = await fetch(`${API_BASE}/api/quotes/${effectiveReviseId}/revise`, {
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
                        LeadJob: payload.leadJob, // CRITICAL for AutoLoad matching
                        DigitalSignaturesJson: payload.digitalSignaturesJson,
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
                        DigitalSignaturesJson: payload.digitalSignaturesJson,
                    };
                    setQuoteScopedForPanel((prev) => {
                        const idStr = String(newRevId ?? '');
                        if (!idStr || idStr === 'undefined') return prev;
                        if (prev.some((q) => String(quoteRowId(q) ?? '') === idStr)) return prev;
                        return [...prev, optimisticRevRow];
                    });
                }

                commitQuoteDigitalStampsRef.current?.((prev) =>
                    prev.map((s) => ({ ...s, removableBeforeNextCommit: false }))
                );

                // Note: Metadata is NOT cleared anymore to allow immediate viewing/working with the new revision.
                // Re-calculating existing quotes will pull the latest list.


                // Wait a moment for DB commit, then refresh the quotes list
                console.log('[handleRevise] Waiting 500ms for DB commit...');
                await new Promise(resolve => setTimeout(resolve, 500));

                console.log('[handleRevise] Refreshing quotes list...');
                const refreshed = await fetchExistingQuotes(enquiryData.enquiry.RequestNo);
                if (scopedEnquiryQuotesParams) {
                    setScopedQuotePanelRefreshNonce((n) => n + 1);
                }
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
        let enquiryLoadSucceeded = false;
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
        quoteRowAutoSelectLeadRef.current = false;
        quoteRowFirstLeadDivisionFullRef.current = '';
        quoteRowDivisionLeadLockRef.current = false;
        quoteRowSyncDropdownCustomerRef.current = false;
        quoteRowAwaitingLeadForCustomerRef.current = false;
        setShowQuoteListSummaryOverQuote(false);
        setToName('');
        setToAddress('');
        setToPhone('');
        setToEmail('');
        setToAttention('');
        setPreparedBy((currentUser?.FullName || currentUser?.name || '').trim());
        setLoadedQuotePreparedByEmail('');
        setLoadedEnquiryQuoteRowForPreview(null);
        setSignatory('');
        setSignatoryDesignation('');
        setQuoteId(null);
        setQuoteNumber('');
        setSelectedLeadId(null);
        setQuoteEnquiryTypeSelect('');
        setQuoteTypeList([]);

        // --- LOCKED LOGIC: Clear Tab State Registry on New Enquiry ---
        tabStateRegistry.current = {};
        quoteTabRestoreSuppressLoadQuoteUntilRef.current = 0;

        try {
            const userEmail = currentUser?.EmailId || '';
            const res = await fetch(
                `${API_BASE}/api/quotes/enquiry-data/${encodeURIComponent(enq.RequestNo)}?userEmail=${encodeURIComponent(userEmail)}`,
                { cache: 'no-store' }
            );
            if (res.ok) {
                const data = await res.json();
                fetchExistingQuotes(enq.RequestNo);

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

                // 3a. Auto-Select Lead Job — always pick first L-job (sorted by L number) when multiple exist
                console.log('[QuoteForm] Auto-Select Lead Job - divisions:', data.divisions);
                console.log('[QuoteForm] Auto-Select Lead Job - divisionsHierarchy:', data.divisionsHierarchy);

                let firstLeadDivisionFull = '';
                let availableDivisions = data.divisions || [];

                if (availableDivisions.length === 0 && data.divisionsHierarchy && data.divisionsHierarchy.length > 0) {
                    availableDivisions = data.divisionsHierarchy.map((r) => r.itemName || r.DivisionName);
                    console.log('[QuoteForm] Using all divisionsHierarchy nodes for Lead Job selection:', availableDivisions);
                }

                const leadJobs = availableDivisions.filter((d) => String(d).trim().startsWith('L'));
                const leadSortKey = (s) => {
                    const m = String(s).trim().match(/^L(\d+)/i);
                    return m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER;
                };
                const sortedLeadJobs = [...leadJobs].sort((a, b) => leadSortKey(a) - leadSortKey(b));
                console.log('[QuoteForm] Filtered Lead Jobs (sorted):', sortedLeadJobs);

                if (sortedLeadJobs.length >= 1) {
                    firstLeadDivisionFull = String(sortedLeadJobs[0]).trim();
                    data.leadJobPrefix = firstLeadDivisionFull.split('-')[0].trim();
                    console.log('[QuoteForm] Auto-selecting first Lead Job:', data.leadJobPrefix, firstLeadDivisionFull);
                } else {
                    const userDeptL = (currentUser?.Department || '').toLowerCase();
                    const bmsMatch = availableDivisions.find((d) => d.toLowerCase().includes('bms'));
                    const elecMatch = availableDivisions.find((d) => d.toLowerCase().includes('electrical'));

                    if (userDeptL.includes('bms') && bmsMatch) {
                        firstLeadDivisionFull = String(bmsMatch).trim();
                        data.leadJobPrefix = firstLeadDivisionFull.split('-')[0].trim();
                        console.log('[QuoteForm] Auto-selecting BMS for BMS user:', data.leadJobPrefix);
                    } else if (userDeptL.includes('electrical') && elecMatch) {
                        firstLeadDivisionFull = String(elecMatch).trim();
                        data.leadJobPrefix = firstLeadDivisionFull.split('-')[0].trim();
                        console.log('[QuoteForm] Auto-selecting Electrical for Electrical user:', data.leadJobPrefix);
                    } else if (availableDivisions.length > 0) {
                        firstLeadDivisionFull = String(availableDivisions[0]).trim();
                        data.leadJobPrefix = firstLeadDivisionFull.split('-')[0].trim();
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

                quoteRowFirstLeadDivisionFullRef.current = firstLeadDivisionFull;
                quoteRowAutoSelectLeadRef.current = Boolean(data.leadJobPrefix);
                quoteRowDivisionLeadLockRef.current = Boolean(data.leadJobPrefix);
                quoteRowSyncDropdownCustomerRef.current = true;
                quoteRowAwaitingLeadForCustomerRef.current = Boolean(data.leadJobPrefix);

                // Final Data Update to Ensure all modifications (Lead Job Logic, etc.) are reflected in State
                setEnquiryData({ ...data });

                // "To" customer: filled by useEffect to match quoteCustomerDropdownOptions (internal parent vs EnquiryCustomer[0])

                // Bootstrap pricing with empty customer, then sync effect applies first dropdown option (see quoteRowSyncDropdownCustomerRef)

                // System defaults for Prepared By / Signatory removed per User request Step 1440
                enquiryLoadSucceeded = true;
            }
        } catch (err) {
            console.error('Error loading enquiry data:', err);
        } finally {
            setLoading(false);
        }
        return enquiryLoadSucceeded;
    };

    const quoteListSummaryBody = React.useMemo(() => {
        if (!quoteListDisplayRows.length) {
            return (
                <div
                    style={{
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#94a3b8',
                        fontSize: '14px',
                        fontStyle: 'italic',
                        background: 'white',
                        borderRadius: '8px',
                        border: '1px dashed #e2e8f0',
                    }}
                >
                    {quoteListCategory === QUOTE_LIST_CATEGORY.SEARCH
                        ? 'No results for this search. Try different text or enquiry dates (both required when search text is empty).'
                        : 'No pending updates found. Start by entering an enquiry number above.'}
                </div>
            );
        }
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
        const activeSortLabel =
            quoteSortField === 'DueDate'
                ? 'Due Date'
                : quoteSortField === 'RequestNo'
                  ? 'Enquiry No.'
                  : quoteSortField === 'ProjectName'
                    ? 'Project Name'
                    : quoteSortField === 'ListQuoteRef'
                      ? 'To Customer and Quote details'
                      : quoteSortField === 'ListQuoteDate'
                        ? 'Quote date'
                        : quoteSortField === 'CustomerName'
                          ? 'Customer'
                          : quoteSortField === 'ConsultantName'
                            ? 'Consultant Name'
                            : quoteSortField;
        const renderQSH = (field, label, style = {}) => {
            const isActive = quoteSortField === field;
            const isAsc = quoteSortDir === 'asc';
            return (
                <th
                    key={field}
                    onClick={() =>
                        setPendingQuotesSortConfig((prev) =>
                            prev.field === field
                                ? { field, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
                                : { field, direction: 'asc' },
                        )
                    }
                    style={{
                        padding: '10px 16px',
                        textAlign: 'left',
                        fontSize: '12px',
                        fontWeight: '600',
                        color: isActive ? '#0284c7' : '#64748b',
                        borderBottom: '1px solid #e2e8f0',
                        cursor: 'pointer',
                        userSelect: 'none',
                        whiteSpace: 'nowrap',
                        ...style,
                    }}
                >
                    {label}
                    {isActive ? (isAsc ? ' ▲' : ' ▼') : <span style={{ color: '#cbd5e1' }}> ⇅</span>}
                </th>
            );
        };
        return (
            <div
                style={{
                    background: 'white',
                    borderRadius: '8px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    width: '100%',
                    margin: '0 auto',
                    minHeight: 0,
                }}
            >
                <div
                    style={{
                        padding: '16px 24px',
                        borderBottom: '1px solid #e2e8f0',
                        background: '#f8fafc',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                    }}
                >
                    <h2 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <FileText size={20} className="text-blue-600" />{' '}
                        {quoteListCategory === QUOTE_LIST_CATEGORY.SEARCH
                            ? `Search results (${quoteListDisplayRows.length})`
                            : `Pending updates (${quoteListDisplayRows.length})`}
                    </h2>
                    <span style={{ fontSize: '12px', color: '#64748b' }}>
                        Sorted by <strong>{activeSortLabel}</strong>{' '}
                        {quoteSortDir === 'asc' ? '(Soonest first)' : '(Latest first)'}
                    </span>
                </div>
                <div style={{ flex: 1, overflowX: 'auto', overflowY: 'auto', minHeight: 0 }}>
                    <table style={{ width: 'max-content', minWidth: '100%', borderCollapse: 'collapse', tableLayout: 'auto' }}>
                        <thead style={{ background: '#f8fafc', position: 'sticky', top: 0, zIndex: 1 }}>
                            <tr>
                                {renderQSH('RequestNo', 'Enquiry No.', { width: '96px' })}
                                {renderQSH('ProjectName', 'Project Name', { minWidth: '200px' })}
                                {renderQSH('ListQuoteRef', 'To Customer and Quote details', { minWidth: 'max-content', maxWidth: '72vw', whiteSpace: 'normal' })}
                                {renderQSH('DueDate', 'Due Date', { minWidth: '110px' })}
                                {renderQSH('ConsultantName', 'Consultant Name', { minWidth: '200px' })}
                            </tr>
                        </thead>
                        <tbody>
                            {sortedPendingQuotes.map((enq, idx) => (
                                <tr
                                    key={
                                        enq.QuoteListKind
                                            ? `${enq.RequestNo}-${enq.QuoteListKind}`
                                            : `${String(enq.RequestNo ?? 'r')}-${
                                                  Array.isArray(enq.ListMergedPendingPvIds)
                                                      ? enq.ListMergedPendingPvIds.join('-')
                                                      : String(enq.ListPendingPvId ?? enq.listpendingpvid ?? '').trim() || `row-${idx}`
                                              }`
                                    }
                                    style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer', transition: 'background 0.15s' }}
                                    onMouseOver={(e) => {
                                        e.currentTarget.style.background = '#f8fafc';
                                    }}
                                    onMouseOut={(e) => {
                                        e.currentTarget.style.background = 'white';
                                    }}
                                    onClick={() => handleSelectEnquiry(enq)}
                                >
                                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#1e293b', fontWeight: '500', verticalAlign: 'top' }}>
                                        <div>{enq.RequestNo}</div>
                                        <div
                                            style={{
                                                marginTop: '8px',
                                                fontSize: '11px',
                                                fontWeight: 700,
                                                letterSpacing: '0.02em',
                                                color: listQuoteRollupStatusColor(enq.ListQuoteRollupStatus),
                                            }}
                                        >
                                            {formatListQuoteRollupStatusLine(enq.ListQuoteRollupStatus)}
                                        </div>
                                    </td>
                                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b', verticalAlign: 'top', minWidth: '234px' }}>
                                        {enq.ProjectName || '-'}
                                    </td>
                                    <td
                                        style={{
                                            padding: '12px 16px',
                                            fontSize: '11px',
                                            color: '#64748b',
                                            verticalAlign: 'top',
                                            minWidth: 'max-content',
                                            maxWidth: '72vw',
                                            whiteSpace: 'normal',
                                            wordBreak: 'break-word',
                                        }}
                                    >
                                        {(() => {
                                            const rowPreparedBy = String(enq.ListPreparedBy ?? enq.listpreparedby ?? '').trim();
                                            const fmtQuoteDate = (raw) => {
                                                try {
                                                    const d = raw ? new Date(raw) : null;
                                                    return d && !Number.isNaN(d.getTime()) ? format(d, 'dd-MMM-yyyy') : '—';
                                                } catch {
                                                    return '—';
                                                }
                                            };
                                            const compactLineStyle = {
                                                display: 'flex',
                                                flexWrap: 'wrap',
                                                alignItems: 'baseline',
                                                gap: '6px',
                                                fontSize: '11px',
                                                lineHeight: 1.35,
                                                color: '#334155',
                                            };
                                            const refDateStyle = { fontSize: '11px', color: '#475569', wordBreak: 'break-word' };
                                            const bdStyle = {
                                                fontSize: '11px',
                                                fontWeight: 600,
                                                color: '#166534',
                                                whiteSpace: 'nowrap',
                                                background: '#dcfce7',
                                                padding: '2px 8px',
                                                borderRadius: '4px',
                                            };
                                            const preparedByStyle = {
                                                fontSize: '11px',
                                                color: '#800000',
                                                fontWeight: 500,
                                                whiteSpace: 'normal',
                                                wordBreak: 'break-word',
                                            };

                                            if (Array.isArray(enq.ListQuoteDetailLines) && enq.ListQuoteDetailLines.length > 0) {
                                                return enq.ListQuoteDetailLines.map((ln, li) => {
                                                    const linePrep = String(
                                                        ln.preparedBy ?? ln.PreparedBy ?? ''
                                                    ).trim();
                                                    return (
                                                    <div key={`dl-${li}`} style={{ ...compactLineStyle, marginTop: li ? 8 : 0 }}>
                                                        <span style={refDateStyle}>{ln.textLine}</span>
                                                        {ln.bdTotal != null && ln.bdTotal > 0 ? (
                                                            <span style={{ ...bdStyle, fontSize: '10px' }}>
                                                                BD{' '}
                                                                {Number(ln.bdTotal).toLocaleString(undefined, {
                                                                    minimumFractionDigits: 2,
                                                                    maximumFractionDigits: 2,
                                                                })}
                                                            </span>
                                                        ) : null}
                                                        {linePrep ? <span style={preparedByStyle}>{linePrep}</span> : null}
                                                    </div>
                                                    );
                                                });
                                            }

                                            const toNameCell = String(enq.ListQuoteDetailToName ?? '').trim() || '—';
                                            if (Array.isArray(enq.ListMultiLeadQuoteRefs) && enq.ListMultiLeadQuoteRefs.length > 0) {
                                                const joined = enq.ListMultiLeadQuoteRefs
                                                    .map((line) => `${toNameCell} (${line.quoteNumber} - ${fmtQuoteDate(line.quoteDate)})`)
                                                    .join(' · ');
                                                const multiPrep = [
                                                    ...new Set(
                                                        enq.ListMultiLeadQuoteRefs.map((line) =>
                                                            String(line.preparedBy ?? line.PreparedBy ?? '').trim()
                                                        ).filter(Boolean)
                                                    ),
                                                ].join(' · ');
                                                return (
                                                    <div style={compactLineStyle}>
                                                        <span style={refDateStyle}>{joined}</span>
                                                        {enq.ListQuoteUnderRefTotal != null && enq.ListQuoteUnderRefTotal > 0 ? (
                                                            <span style={bdStyle}>
                                                                BD{' '}
                                                                {Number(enq.ListQuoteUnderRefTotal).toLocaleString(undefined, {
                                                                    minimumFractionDigits: 2,
                                                                    maximumFractionDigits: 2,
                                                                })}
                                                            </span>
                                                        ) : null}
                                                        {multiPrep ? (
                                                            <span style={preparedByStyle}>{multiPrep}</span>
                                                        ) : rowPreparedBy ? (
                                                            <span style={preparedByStyle}>{rowPreparedBy}</span>
                                                        ) : null}
                                                    </div>
                                                );
                                            }
                                            if (enq.ListQuoteRef) {
                                                return (
                                                    <div style={compactLineStyle}>
                                                        <span style={refDateStyle}>
                                                            {toNameCell} ({enq.ListQuoteRef} - {fmtQuoteDate(enq.ListQuoteDate)})
                                                        </span>
                                                        {enq.ListQuoteUnderRefTotal != null && enq.ListQuoteUnderRefTotal > 0 ? (
                                                            <span style={bdStyle}>
                                                                BD{' '}
                                                                {Number(enq.ListQuoteUnderRefTotal).toLocaleString(undefined, {
                                                                    minimumFractionDigits: 2,
                                                                    maximumFractionDigits: 2,
                                                                })}
                                                            </span>
                                                        ) : null}
                                                        {rowPreparedBy ? (
                                                            <span style={preparedByStyle}>{rowPreparedBy}</span>
                                                        ) : null}
                                                    </div>
                                                );
                                            }
                                            return <div style={{ color: '#94a3b8', fontSize: '12px' }}>—</div>;
                                        })()}
                                    </td>
                                    <td
                                        style={{
                                            padding: '12px 16px',
                                            fontSize: '13px',
                                            color: '#dc2626',
                                            fontWeight: '500',
                                            verticalAlign: 'top',
                                            minWidth: '110px',
                                            whiteSpace: 'nowrap',
                                        }}
                                    >
                                        {enq.DueDate ? format(new Date(enq.DueDate), 'dd-MMM-yyyy') : '-'}
                                    </td>
                                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b', verticalAlign: 'top', minWidth: '200px' }}>
                                        {enq.ConsultantName || enq.consultantName || '-'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    }, [quoteListDisplayRows, pendingQuotesSortConfig, quoteListCategory, handleSelectEnquiry]);

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
    clearLeftPanelForToolbarSearchRef.current = handleClear;

    // Toggle clause visibility
    const toggleClause = (clauseKey) => {
        setClauses(prev => ({ ...prev, [clauseKey]: !prev[clauseKey] }));
    };

    // Update clause content
    const updateClauseContent = (key, value) => {
        setClauseContent(prev => ({ ...prev, [key]: value }));
    };


    const getQuotePayload = useCallback((customDivisionCode = null) => {
        /** Session user (header / AuthContext) — same source as API userEmail; not read from login storage alone. */
        const sessionUserEmail = (currentUser?.email || currentUser?.EmailId || currentUser?.MailId || '').trim();

        /** Quote ref Dept/Div must follow the **active Previous Quotes tab job** (e.g. HVAC → HVP), not the login profile’s default division (e.g. BMS → BMP). */
        const branchCodesFromActiveQuoteTab = (() => {
            const tabs =
                calculatedTabs && calculatedTabs.length > 0 ? calculatedTabs : effectiveQuoteTabs;
            if (!tabs?.length || activeQuoteTab == null || String(activeQuoteTab).trim() === '') return null;
            const tab = tabs.find((t) => String(t.id) === String(activeQuoteTab));
            if (!tab) return null;
            const pool =
                (pricingData?.jobs && pricingData.jobs.length > 0 ? pricingData.jobs : null) ||
                jobsPool ||
                enquiryData?.divisionsHierarchy ||
                [];
            let node = null;
            if (tab.realId != null && String(tab.realId).trim() !== '') {
                node = pool.find((j) => String(j.id || j.ItemID || j.ID) === String(tab.realId));
            }
            const div = String(tab.divisionCode || node?.divisionCode || node?.DivisionCode || '').trim();
            const dep = String(
                tab.departmentCode ||
                    node?.departmentCode ||
                    node?.DepartmentCode ||
                    tab.code ||
                    node?.code ||
                    ''
            ).trim();
            // Quote ref division must come from the job row / tab, not company defaults (would re-apply login/BMS BMP).
            if (!div) return null;
            return {
                divisionCode: div,
                departmentCode:
                    dep || String(enquiryData?.companyDetails?.departmentCode || 'AAC').trim(),
            };
        })();

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

        // 3. Fallback: Absolute hard-override for BMS users (Requested by User) — skipped when a concrete tab job supplies codes (HVAC vs BMS).
        if (!branchCodesFromActiveQuoteTab && !personalProfile && userDept.toUpperCase().includes('BMS')) {
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
        } else if (branchCodesFromActiveQuoteTab?.divisionCode) {
            effectiveDivisionCode = branchCodesFromActiveQuoteTab.divisionCode;
            effectiveDeptCode = branchCodesFromActiveQuoteTab.departmentCode || effectiveDeptCode || 'AAC';
            identitySource = 'ActiveQuoteTabJob';
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
            preparedByEmail: sessionUserEmail,
            ...clauses,
            ...clauseContent,
            totalAmount: Number.isFinite(Number(grandTotal)) ? Number(grandTotal) : 0,
            customClauses,
            clauseOrder: orderedClauses,
            quoteDate,
            customerReference,
            quoteType: quoteTypeList.filter(Boolean).join(', '),
            subject,
            signatory,
            signatoryDesignation,
            toName: resolveQuoteToNameForDbTuple(
                calculatedTabs,
                effectiveQuoteTabs,
                activeQuoteTab,
            toName,
                jobsPool.length > 0 ? jobsPool : enquiryData?.divisionsHierarchy || []
            ),
            toAddress,
            toPhone,
            toEmail,
            toFax,
            toAttention,
            leadJob: resolveRootLeadJobLabelForQuotes(
                (pricingData?.jobs && pricingData.jobs.length > 0 ? pricingData.jobs : null) || jobsPool || [],
                selectedLeadId,
                enquiryData?.leadJobPrefix || ''
            ),
            ownJob: (() => {
                const tabs = calculatedTabs && calculatedTabs.length > 0 ? calculatedTabs : effectiveQuoteTabs;
                if (activeQuoteTab && tabs) {
                    const tab = tabs.find(t => String(t.id) === String(activeQuoteTab));
                    if (tab) return tab.name || tab.label || '';
                }
                return '';
            })(),
            status: 'Saved',
            digitalSignaturesJson: serializeDigitalStampsForApi(quoteDigitalStamps),
        };
    }, [enquiryData, selectedJobs, pricingSummary, currentUser, pricingData, validityDays, preparedBy, clauses, clauseContent, grandTotal, customClauses, orderedClauses, quoteDate, customerReference, quoteTypeList, subject, signatory, signatoryDesignation, toName, toAddress, toPhone, toEmail, toFax, toAttention, activeQuoteTab, calculatedTabs, effectiveQuoteTabs, selectedLeadId, jobsPool, enquiryData?.divisionsHierarchy, enquiryData?.companyDetails, quoteDigitalStamps]);



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

            if (!quoteId && existingQuotes.length > 0 && scopedEnquiryQuotesParams) {
                const rnSave = String(enquiryData.enquiry.RequestNo ?? '').trim();
                const sameTupleQuote = existingQuotes.find((q) =>
                    quoteRowMatchesEnquiryScopedParams(q, scopedEnquiryQuotesParams, rnSave)
                );
                if (sameTupleQuote) {
                    if (!suppressCollisionAlert) {
                        alert(
                            `A quote (${sameTupleQuote.QuoteNumber || sameTupleQuote.quoteNumber || ''}) already exists for this enquiry with the same Lead job, customer (To), and Own job.\n\nUse Revision to change it, or pick a different customer / branch.`
                        );
                    }
                    if (!isAutoSave) setSaving(false);
                    return { isCollision: true, existingQuote: sameTupleQuote };
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
                        LeadJob: savePayload.leadJob, // CRITICAL for AutoLoad matching
                        DigitalSignaturesJson: savePayload.digitalSignaturesJson,
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
                        DigitalSignaturesJson: savePayload.digitalSignaturesJson,
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

                /* Lock all stamps to the quote as saved; new placements after this get removableBeforeNextCommit until the next save. */
                commitQuoteDigitalStampsRef.current?.((prev) =>
                    prev.map((s) => ({ ...s, removableBeforeNextCommit: false }))
                );

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
                if (scopedEnquiryQuotesParams) {
                    setScopedQuotePanelRefreshNonce((n) => n + 1);
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
        if (quoteId != null && String(quoteId).trim() !== '') {
            return;
        }
        const loaded = loadStampsForEnquiry(
            digitalStampScope.requestNo,
            digitalStampScope.leadKey,
            digitalStampScope.customer
        );
        setQuoteDigitalStamps((prev) => (JSON.stringify(prev) === JSON.stringify(loaded) ? prev : loaded));
    }, [digitalStampScope, quoteId]);

    const commitQuoteDigitalStamps = useCallback((updater) => {
        setQuoteDigitalStamps((prev) => {
            const next = typeof updater === 'function' ? updater(prev) : updater;
            const ctx = stampScopeRef.current;
            if (ctx?.requestNo) saveStampsForEnquiry(ctx.requestNo, next, ctx.leadKey, ctx.customer);
            return next;
        });
    }, []);
    useLayoutEffect(() => {
        commitQuoteDigitalStampsRef.current = commitQuoteDigitalStamps;
    }, [commitQuoteDigitalStamps]);

    const handlePlaceDigitalStamp = useCallback(
        ({ imageDataUrl, sheetIndex, displayName, designation, xPct: xIn, yPct: yIn }) => {
            const iso = new Date().toISOString();
            const email = currentUser?.EmailId || currentUser?.email || '';
            const xPct = typeof xIn === 'number' && Number.isFinite(xIn) ? Math.min(96, Math.max(2, xIn)) : 82;
            const yPct = typeof yIn === 'number' && Number.isFinite(yIn) ? Math.min(92, Math.max(2, yIn)) : 38;
            commitQuoteDigitalStamps((prev) => [
                ...prev,
                {
                    id: globalThis.crypto?.randomUUID?.() || `st-${Date.now()}`,
                    sheetIndex: Math.max(0, Number(sheetIndex) || 0),
                    xPct,
                    yPct,
                    imageDataUrl,
                    displayName: (displayName || '').trim(),
                    designation: (designation || '').trim(),
                    placedAtIso: iso,
                    verificationCode: makeVerificationCode(email, iso),
                    removableBeforeNextCommit: true,
                },
            ]);
        },
        [currentUser, commitQuoteDigitalStamps]
    );

    const handleQuoteSheetSignatureDragOver = useCallback((e) => {
        if (!sigDragActiveRef.current) return;
        e.preventDefault();
        try {
            e.dataTransfer.dropEffect = 'copy';
        } catch {
            /* ignore */
        }
    }, []);

    const handleQuotePreviewSignatureDrop = useCallback(
        (e) => {
            e.preventDefault();
            e.stopPropagation();
            let marker = '';
            try {
                marker = e.dataTransfer.getData('text/plain');
            } catch {
                /* ignore */
            }
            if (marker !== 'ems-quote-signature-drag') return;
            const payload = dragSignaturePayloadRef.current;
            if (!payload?.imageDataUrl) {
                sigDragActiveRef.current = false;
                return;
            }

            const sheet = e.currentTarget;
            const rect = sheet.getBoundingClientRect();
            if (!rect.width || !rect.height) {
                sigDragActiveRef.current = false;
                return;
            }
            const xPct = ((e.clientX - rect.left) / rect.width) * 100;
            const yPct = ((e.clientY - rect.top) / rect.height) * 100;

            const preview = document.getElementById('quote-preview');
            const sheets = preview ? [...preview.querySelectorAll('.quote-a4-sheet')] : [];
            const sheetIndex0 = Math.max(0, sheets.indexOf(sheet));
            /** Stamps filter uses 1-based page index (`sheetIdx + 1`). */
            const sheetIndex = sheetIndex0 + 1;

            dragSignaturePayloadRef.current = null;
            handlePlaceDigitalStamp({
                imageDataUrl: payload.imageDataUrl,
                sheetIndex,
                displayName: digitalStampUserDisplayName,
                designation: digitalStampUserDesignation,
                xPct,
                yPct,
            });
            sigDragActiveRef.current = false;
        },
        [handlePlaceDigitalStamp, digitalStampUserDisplayName, digitalStampUserDesignation]
    );

    const handleToolbarSignatureDragStart = useCallback(
        (e) => {
            if (!toolbarDragSignatureImageUrl) return;
            dragSignaturePayloadRef.current = { imageDataUrl: toolbarDragSignatureImageUrl };
            try {
                e.dataTransfer.setData('text/plain', 'ems-quote-signature-drag');
                e.dataTransfer.effectAllowed = 'copy';
            } catch {
                /* ignore */
            }
            sigDragActiveRef.current = true;
        },
        [toolbarDragSignatureImageUrl]
    );

    const handleToolbarSignatureDragEnd = useCallback(() => {
        sigDragActiveRef.current = false;
        dragSignaturePayloadRef.current = null;
        sigToolbarSuppressClickRef.current = true;
        window.setTimeout(() => {
            sigToolbarSuppressClickRef.current = false;
        }, 150);
    }, []);

    /** 0-based index of the quote sheet most visible inside the print preview scroll area (for click-to-place). */
    const getActiveQuoteSheetIndex0Based = useCallback(() => {
        if (typeof document === 'undefined') return 0;
        const preview = document.getElementById('quote-preview');
        if (!preview) return 0;
        const sheets = [...preview.querySelectorAll('.quote-a4-sheet')];
        if (sheets.length === 0) return 0;
        const root = document.getElementById('quote-print-root');
        const scroller = root || preview;
        const rootRect = scroller.getBoundingClientRect();
        if (!rootRect.width || !rootRect.height) return 0;
        const cx = rootRect.left + rootRect.width * 0.5;
        const cy = rootRect.top + rootRect.height * 0.42;
        for (let i = 0; i < sheets.length; i++) {
            const r = sheets[i].getBoundingClientRect();
            if (cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom) return i;
        }
        let best = 0;
        let bestArea = -1;
        for (let i = 0; i < sheets.length; i++) {
            const r = sheets[i].getBoundingClientRect();
            const ix = Math.max(0, Math.min(r.right, rootRect.right) - Math.max(r.left, rootRect.left));
            const iy = Math.max(0, Math.min(r.bottom, rootRect.bottom) - Math.max(r.top, rootRect.top));
            const area = ix * iy;
            if (area > bestArea) {
                bestArea = area;
                best = i;
            }
        }
        return bestArea > 0 ? best : 0;
    }, []);

    const handleSignaturesToolbarPrimaryClick = useCallback(
        (e) => {
            if (!hasUserPricing || !enquiryData?.enquiry?.RequestNo) return;
            if (e?.shiftKey) {
                setSignatureVaultOpen(true);
                return;
            }
            /** Plain click: place default-or-first library image on the active sheet (no vault). */
            if (!toolbarDragSignatureImageUrl) {
                setSignatureVaultOpen(true);
                return;
            }
            const sheet0 = getActiveQuoteSheetIndex0Based();
            const sheetIndex = sheet0 + 1;
            handlePlaceDigitalStamp({
                imageDataUrl: toolbarDragSignatureImageUrl,
                sheetIndex,
                displayName: digitalStampUserDisplayName,
                designation: digitalStampUserDesignation,
            });
        },
        [
            hasUserPricing,
            enquiryData?.enquiry?.RequestNo,
            toolbarDragSignatureImageUrl,
            getActiveQuoteSheetIndex0Based,
            handlePlaceDigitalStamp,
            digitalStampUserDisplayName,
            digitalStampUserDesignation,
            setSignatureVaultOpen,
        ]
    );

    const handleSignaturesToolbarControlClick = useCallback(
        (e) => {
            if (sigToolbarSuppressClickRef.current) return;
            handleSignaturesToolbarPrimaryClick(e);
        },
        [handleSignaturesToolbarPrimaryClick]
    );

    const handleMoveDigitalStamp = useCallback(
        (id, xPct, yPct) => {
            if (String(id).startsWith('inherited-')) return;
            commitQuoteDigitalStamps((prev) => prev.map((s) => (s.id === id ? { ...s, xPct, yPct } : s)));
        },
        [commitQuoteDigitalStamps]
    );

    const handleRemoveDigitalStamp = useCallback(
        (id) => {
            if (String(id).startsWith('inherited-')) return;
            commitQuoteDigitalStamps((prev) => prev.filter((s) => s.id !== id));
        },
        [commitQuoteDigitalStamps]
    );

    /** Parent own-job tab: show this tab's stamps plus latest saved stamps from each direct subjob quote row. */
    const quotePreviewDigitalStamps = React.useMemo(() => {
        const base = Array.isArray(quoteDigitalStamps) ? quoteDigitalStamps : [];
        const tabs = calculatedTabs && calculatedTabs.length > 0 ? calculatedTabs : [];
        const activeTabObj = tabs.find((t) => String(t.id) === String(activeQuoteTab));
        if (!activeTabObj?.isOwnJobTab) return base;

        const subTabs = tabs.filter((t) => t.isSubJobTab);
        if (!subTabs.length || !enquiryData?.enquiry?.RequestNo) return base;

        const requestNoNorm = String(enquiryData.enquiry.RequestNo).trim();
        const currentToNorm = normalize(toName || '');
        const currentToKey = normalizeCustomerKey(toName || '');

        const currentLeadCodeClean = (() => {
            if (selectedLeadId && pricingData?.jobs) {
                const root = pricingData.jobs.find((j) => String(j.id || j.ItemID) === String(selectedLeadId));
                if (root) {
                    const rCode = (root.leadJobCode || root.LeadJobCode || '').toUpperCase();
                    if (rCode && rCode.match(/L\d+/)) return rCode.match(/L\d+/)[0];
                    if (root.itemName?.toUpperCase().match(/L\d+/)) return root.itemName.toUpperCase().match(/L\d+/)[0];
                }
            }
            const prefix = (enquiryData?.leadJobPrefix || '').toUpperCase();
            if (prefix && prefix.match(/L\d+/)) return prefix.match(/L\d+/)[0];
            return '';
        })();

        const merged = [...base];
        for (const st of subTabs) {
            const childLabel = (st.label || st.name || '').trim();
            const childOwnNorm = collapseSpacesLower(stripQuoteJobPrefix(childLabel));

            const candidates = (existingQuotes || []).filter((q) => {
                if (String(q.RequestNo || '').trim() !== requestNoNorm) return false;
                const qTo = normalize(q.ToName || '');
                const qToKey = normalizeCustomerKey(q.ToName || '');
                const toOk =
                    (currentToNorm && qTo === currentToNorm) ||
                    (currentToKey && qToKey && currentToKey === qToKey);
                if (!toOk) return false;
                const qOwn = collapseSpacesLower(stripQuoteJobPrefix(q.OwnJob || ''));
                if (qOwn !== childOwnNorm) return false;
                const parts = q.QuoteNumber?.split('/') || [];
                const qLeadPart = parts[2] ? parts[2].toUpperCase() : '';
                const qLeadCodeOnly = qLeadPart.match(/L\d+/) ? qLeadPart.match(/L\d+/)[0] : '';
                if (qLeadCodeOnly && currentLeadCodeClean && qLeadCodeOnly !== currentLeadCodeClean) return false;
                return true;
            });

            if (!candidates.length) continue;
            const row = [...candidates].sort((a, b) => {
                const r = (Number(b.RevisionNo) || 0) - (Number(a.RevisionNo) || 0);
                if (r !== 0) return r;
                const qn = (Number(b.QuoteNo) || 0) - (Number(a.QuoteNo) || 0);
                if (qn !== 0) return qn;
                const ta = Date.parse(b.UpdatedAt || b.CreatedAt || 0) || 0;
                const tb = Date.parse(a.UpdatedAt || a.CreatedAt || 0) || 0;
                return ta - tb;
            })[0];

            const childStamps = parseDigitalSignaturesFromQuoteRow(row);
            for (const s of childStamps) {
                merged.push({
                    ...s,
                    id: `inherited-${st.id}-${s.id}`,
                    removableBeforeNextCommit: false,
                    inheritedFromSubJob: true,
                });
            }
        }
        return merged;
    }, [
        quoteDigitalStamps,
        calculatedTabs,
        activeQuoteTab,
        existingQuotes,
        enquiryData?.enquiry?.RequestNo,
        enquiryData?.leadJobPrefix,
        toName,
        selectedLeadId,
        pricingData?.jobs,
    ]);

    /** Profile menu → Manage signatures → Place on page (when Quote tab is active). */
    useEffect(() => {
        const onPlaceFromProfile = (ev) => {
            const d = ev?.detail;
            if (!d?.imageDataUrl) return;
            handlePlaceDigitalStamp({
                imageDataUrl: d.imageDataUrl,
                /** Profile menu sends 0-based page index; stamp filter uses 1-based. */
                sheetIndex: (Number.isFinite(Number(d.sheetIndex)) ? Number(d.sheetIndex) : 0) + 1,
                displayName: digitalStampUserDisplayName,
                designation: digitalStampUserDesignation,
            });
        };
        window.addEventListener(EMS_QUOTE_PLACE_STAMP_EVENT, onPlaceFromProfile);
        return () => window.removeEventListener(EMS_QUOTE_PLACE_STAMP_EVENT, onPlaceFromProfile);
    }, [handlePlaceDigitalStamp, digitalStampUserDisplayName, digitalStampUserDesignation]);

    // Print quote — same HTML shell as vector PDF preview (`buildQuotePrintDocumentHtml` preview mode).
    const printQuote = useCallback(() => {
        const printRoot = document.getElementById('quote-print-root');
        const printContent = document.getElementById('quote-preview');
        const fragmentHtml = printRoot
            ? captureQuotePrintRootInnerHtmlForPdf(printRoot)
            : printContent
              ? printContent.innerHTML
              : '';
        if (fragmentHtml) {
            const envOrigin = typeof import.meta !== 'undefined' && import.meta.env?.VITE_SERVER_ORIGIN;
            const serverOrigin = envOrigin
                ? String(envOrigin).replace(/\/$/, '')
                : `${window.location.protocol}//${window.location.hostname}:5002`;
            const printWindow = window.open('', '_blank');
            if (!printWindow) {
                window.alert('Pop-up blocked — allow pop-ups for this site to print, or use the Print button in the quote panel.');
                return;
            }
            /* Same HTML path as PDF download (preview mode) so Print and Download stay aligned */
            printWindow.document.write(
                buildQuotePrintDocumentHtml(printWithHeader, fragmentHtml, tableStyles, serverOrigin, 'preview', {
                    pdfAssetOriginRewriteFrom: typeof window !== 'undefined' ? window.location.origin : '',
                })
            );
            printWindow.document.close();
            printWindow.focus();

            // Increased delay to ensure rendering matches styles
            setTimeout(() => {
                printWindow.print();
                printWindow.close();
            }, 900);
        }
    }, [printWithHeader]);

    /** Browser Ctrl+P prints the whole flex layout (narrow quote column). Route to the same window as the Print button. */
    useEffect(() => {
        const onKeyDown = (e) => {
            if (String(e.key).toLowerCase() !== 'p') return;
            if (!e.ctrlKey && !e.metaKey) return;
            if (!hasUserPricing) return;
            const printRoot = document.getElementById('quote-print-root');
            const printContent = document.getElementById('quote-preview');
            const fragmentHtml = (
                printRoot ? captureQuotePrintRootInnerHtmlForPdf(printRoot) : printContent?.innerHTML || ''
            ).trim();
            if (!fragmentHtml) return;
            e.preventDefault();
            e.stopPropagation();
            printQuote();
        };
        window.addEventListener('keydown', onKeyDown, true);
        return () => window.removeEventListener('keydown', onKeyDown, true);
    }, [hasUserPricing, printQuote]);

    const triggerBlobDownload = (blob, fileName) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        // Revoke after a delay so chained downloads (email flow) are not cancelled by Chrome.
        window.setTimeout(() => {
            try {
                URL.revokeObjectURL(url);
            } catch (_) {
                /* ignore */
            }
        }, 4500);
    };

    /** Same PDF bytes as Download PDF — used by download + Outlook email flow */
    const fetchQuotePdfBlob = async () => {
        const printRoot = document.getElementById('quote-print-root');
        const printContent = document.getElementById('quote-preview');
        const fragmentHtml = printRoot
            ? captureQuotePrintRootInnerHtmlForPdf(printRoot)
            : printContent
              ? printContent.innerHTML
              : '';
        if (!fragmentHtml) throw new Error('No quote document to export');

        const envOrigin = typeof import.meta !== 'undefined' && import.meta.env?.VITE_SERVER_ORIGIN;
        const serverOrigin = envOrigin
            ? String(envOrigin).replace(/\/$/, '')
            : `${window.location.protocol}//${window.location.hostname}:5002`;

        const html = buildQuotePrintDocumentHtml(printWithHeader, fragmentHtml, tableStyles, serverOrigin, 'preview', {
            pdfAssetOriginRewriteFrom: typeof window !== 'undefined' ? window.location.origin : '',
        });
        const safeRef = String(quoteNumber || quoteId || 'Draft').replace(/\//g, '_');
        const fname = `Quote_${safeRef}.pdf`;
        const res = await fetch(`${API_BASE}/api/quote-pdf/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ html, filename: fname, emulateScreen: true }),
        });
        if (!res.ok) {
            const raw = await res.text();
            let detail = res.statusText;
            try {
                const j = JSON.parse(raw);
                detail = j.message || j.error || detail;
                if (j.hint && String(j.hint).trim()) {
                    detail = `${detail}\n\n${String(j.hint).trim()}`;
                }
            } catch {
                if (raw && raw.trim()) detail = raw.trim().slice(0, 400);
            }
            throw new Error(detail || `HTTP ${res.status}`);
        }
        const blob = await res.blob();
        return { blob, fileName: fname };
    };

    /** Vector PDF via server Puppeteer (selectable text — not canvas screenshots). */
    const downloadPDF = async () => {
        setIsUploading(true);
        try {
            const { blob, fileName } = await fetchQuotePdfBlob();
            triggerBlobDownload(blob, fileName);
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

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    /**
     * Browsers cannot attach files to Outlook directly. Open mailto: from a **synchronous** click handler (not an
     * async function entry), try window.open first, then defer PDF/attachment downloads so they do not compete with
     * the mail-client handoff.
     */
    const openMailtoFromUserClick = React.useCallback((href) => {
        try {
            const popup = window.open(href, '_blank', 'noopener,noreferrer');
            if (popup != null) {
                return;
            }
        } catch (e) {
            console.warn('[email-quote] window.open(mailto)', e);
        }
        try {
            if (window.top && window.top !== window.self) {
                window.top.location.href = href;
                return;
            }
        } catch (e) {
            console.warn('[email-quote] top mailto (cross-origin iframe?)', e);
        }
        try {
            window.location.assign(href);
            return;
        } catch (e) {
            console.warn('[email-quote] location.assign(mailto)', e);
        }
        try {
            const ifr = document.createElement('iframe');
            ifr.setAttribute('aria-hidden', 'true');
            Object.assign(ifr.style, {
                position: 'fixed',
                width: '1px',
                height: '1px',
                left: '-20px',
                top: '0',
                border: '0',
                opacity: '0',
                pointerEvents: 'none',
            });
            document.body.appendChild(ifr);
            ifr.src = href;
            window.setTimeout(() => {
                try {
                    ifr.remove();
                } catch (_) {
                    /* ignore */
                }
            }, 10000);
            return;
        } catch (e) {
            console.warn('[email-quote] iframe mailto', e);
        }
        try {
            const mailA = document.createElement('a');
            mailA.href = href;
            mailA.target = '_top';
            mailA.rel = 'noopener noreferrer';
            document.body.appendChild(mailA);
            mailA.click();
            mailA.remove();
        } catch (e2) {
            console.error('[email-quote] mailto anchor', e2);
            alert(
                'Could not open Outlook from this page.\n\n' +
                    'Try “Open mail draft (mailto)” again, or use Windows Default apps to confirm MAILTO is set to Outlook.'
            );
        }
    }, []);

    /** ASCII-only subject line avoids odd mailto decoding; Unicode em dash can confuse some clients. */
    const sanitizeMailLine = (s) =>
        String(s || '')
            .replace(/\u2013|\u2014|\u2212/g, '-')
            .replace(/\r\n|\r|\n/g, ' ')
            .trim();

    /** Returns mailto href + text used for the email body. */
    const buildQuoteEmailDraftPayload = () => {
        if (!enquiryData?.enquiry?.RequestNo || !toName?.trim()) {
            alert('Select an enquiry and customer before emailing the quote.');
            return null;
        }
        const printRoot = document.getElementById('quote-print-root');
        const printContent = document.getElementById('quote-preview');
        const fragmentHtml = printRoot ? printRoot.innerHTML : printContent ? printContent.innerHTML : '';
        if (!fragmentHtml) {
            alert('Quote preview is not ready yet.');
            return null;
        }

        const to = (toEmail || '').trim();
        const reqNo = enquiryData.enquiry.RequestNo;
        const subj = sanitizeMailLine(
            `Quotation ${String(quoteNumber || '').trim() || '(draft)'} - ${toName.trim()}`
        );
        const amt = typeof grandTotal !== 'undefined' && grandTotal != null ? String(grandTotal) : '';
        const attCount = (quoteAttachments || []).length;
        const pendingNote =
            pendingFiles?.length > 0
                ? ` ${pendingFiles.length} extra file(s) are only in EMS (not uploaded yet) - add manually if needed.`
                : '';

        const mailBodyCompact = [
            ...(to ? [] : ['(Fill the To line in Outlook; the Email field on this quote in EMS is empty.)']),
            'Dear Sir/Madam,',
            '',
            `EMS will download the quote PDF and ${attCount} saved attachment(s) to your Downloads folder.${pendingNote}`,
            'Attach those files to this message in Outlook.',
            '',
            `Enquiry: ${reqNo}`,
            `Quote: ${String(quoteNumber || '-').trim()}`,
            amt ? `Amount: ${amt}` : '',
            `Customer: ${toName.trim()}`,
            '',
            'Kind regards,',
            String(currentUser?.FullName || currentUser?.name || '').trim() || '',
        ]
            .filter((line) => line !== '')
            .join('\r\n');

        const subjShort = subj.length > 200 ? `${subj.slice(0, 197)}...` : subj;
        const encSubject = encodeURIComponent(subjShort);
        let encBody = encodeURIComponent(mailBodyCompact);
        const toAddr = to.length > 320 ? `${to.slice(0, 317)}...` : to;
        let mailtoHref = toAddr
            ? `mailto:${encodeURIComponent(toAddr)}?subject=${encSubject}&body=${encBody}`
            : `mailto:?subject=${encSubject}&body=${encBody}`;
        if (mailtoHref.length > 2000) {
            encBody = encodeURIComponent(
                `Quote ${String(quoteNumber || reqNo).trim()}: PDF + ${attCount} file(s) downloading to Downloads - attach in Outlook.`
            );
            mailtoHref = toAddr
                ? `mailto:${encodeURIComponent(toAddr)}?subject=${encSubject}&body=${encBody}`
                : `mailto:?subject=${encSubject}&body=${encBody}`;
        }
        return {
            mailtoHref,
            subjectLine: subjShort,
            bodyText: mailBodyCompact,
            toAddr,
        };
    };

    /**
     * mailto: opens the default mail app (e.g. Outlook) with subject/body. Recipient optional.
     * Browsers cannot attach the PDF via mailto — the same click also saves the PDF to Downloads to attach in Outlook.
     */
    const buildMailtoHrefFromEmailModal = () => {
        if (!emailDetails.pdfBlob) {
            alert('The quote PDF is not available. Close this dialog and try again.');
            return null;
        }
        const toRaw = (emailDetails.to || '').trim();
        const subjectForUrl = (() => {
            const s = sanitizeMailLine(emailDetails.subject) || 'Quotation';
            return s.length > 200 ? `${s.slice(0, 197)}...` : s;
        })();
        const pdfName = (emailDetails.pdfName || 'quotation.pdf').trim();
        const attachNote =
            `\r\n\r\n---\r\n` +
            `The quote PDF (${pdfName}) is also being saved to your Downloads folder — attach it in Outlook (websites cannot add attachments via mail links).`;
        const bodyText = String(emailDetails.body || '');
        const fullBody = bodyText.replace(/\r?\n/g, '\r\n').trimEnd() + attachNote;

        const encSubject = encodeURIComponent(subjectForUrl);
        let encBody = encodeURIComponent(fullBody);
        const toAddr = toRaw.length > 320 ? `${toRaw.slice(0, 317)}...` : toRaw;
        let mailtoHref = toAddr
            ? `mailto:${encodeURIComponent(toAddr)}?subject=${encSubject}&body=${encBody}`
            : `mailto:?subject=${encSubject}&body=${encBody}`;
        if (mailtoHref.length > 2000) {
            const shorterBody =
                bodyText.replace(/\r?\n/g, '\r\n').trimEnd().slice(0, 500) +
                '\r\n\r\n[Message truncated for mail link length limit.]' +
                attachNote;
            encBody = encodeURIComponent(shorterBody);
            mailtoHref = toAddr
                ? `mailto:${encodeURIComponent(toAddr)}?subject=${encSubject}&body=${encBody}`
                : `mailto:?subject=${encSubject}&body=${encBody}`;
            if (mailtoHref.length > 2000) {
                encBody = encodeURIComponent(
                    `Compose your message in Outlook.\r\n${attachNote}`
                );
                mailtoHref = toAddr
                    ? `mailto:${encodeURIComponent(toAddr)}?subject=${encSubject}&body=${encBody}`
                    : `mailto:?subject=${encSubject}&body=${encBody}`;
            }
        }
        return mailtoHref;
    };

    const handlePreviewQuotePdf = () => {
        if (!emailDetails.pdfBlob) {
            alert('No PDF to preview.');
            return;
        }
        try {
            const url = URL.createObjectURL(emailDetails.pdfBlob);
            const w = window.open(url, '_blank', 'noopener,noreferrer');
            if (!w) {
                URL.revokeObjectURL(url);
                alert('Pop-up blocked. Allow pop-ups for this site to preview the PDF.');
                return;
            }
            window.setTimeout(() => {
                try {
                    URL.revokeObjectURL(url);
                } catch (_) {
                    /* ignore */
                }
            }, 120000);
        } catch (e) {
            console.error('[email-quote] pdf preview', e);
            alert('Could not open PDF preview.');
        }
    };

    const runQuoteEmailDownloads = async () => {
        setIsUploading(true);
        try {
            const { blob, fileName } = await fetchQuotePdfBlob();
            triggerBlobDownload(blob, fileName);
            await sleep(450);

            for (const att of quoteAttachments || []) {
                if (!att?.ID) continue;
                try {
                    const url = `${API_BASE}/api/quotes/attachments/download/${att.ID}?download=true`;
                    const r = await fetch(url, { credentials: 'include' });
                    if (!r.ok) continue;
                    const b = await r.blob();
                    const nm = String(att.FileName || `attachment-${att.ID}`).replace(/[/\\?%*:|"<>]/g, '_');
                    triggerBlobDownload(b, nm);
                    await sleep(350);
                } catch (e) {
                    console.warn('[email-quote] attachment skip', att?.ID, e);
                }
            }
        } catch (err) {
            console.error('Email quote flow error:', err);
            alert(`Could not prepare the quote PDF for email: ${err.message || err}`);
        } finally {
            setIsUploading(false);
        }
    };

    /** Sync entry from the button — now shows the internal Email Compose modal. */
    const startQuoteEmailFlow = async () => {
        if (!hasUserPricing) return;
        
        setIsUploading(true);
        try {
            // 1. Generate the PDF
            const { blob, fileName } = await fetchQuotePdfBlob();
            
            // 2. Build default mail details
            const payload = buildQuoteEmailDraftPayload();
            if (!payload) return;

            // 3. Prepare body with a nice message
            const initialBody = `Dear Sir/Madam,\n\nPlease find the attached quotation regarding Enquiry Ref: ${enquiryData?.enquiry?.RequestNo || 'N/A'} for the ${quotePreviewProjectName || enquiryData?.enquiry?.ProjectName || 'N/A'}.\n\nWe have detailed the pricing, scope, and terms for your review. Should you have any questions or require further techno-commercial clarification regarding this proposal, please do not hesitate to contact us.\n\nWe look forward to the possibility of working with you on this project.\n\nBest Regards,\n${(currentUser?.FullName || currentUser?.name || '').trim()}`;

            setEmailDetails({
                to: payload.toAddr || '',
                cc: '', // Can be pre-filled from division CCMailIds if needed
                bcc: '',
                subject: payload.subjectLine || `Quotation - ${enquiryData?.enquiry?.ProjectName || ''}`,
                body: initialBody,
                pdfBlob: blob,
                pdfName: fileName
            });

            setShowEmailModal(true);
        } catch (err) {
            console.error('Email preparation failed:', err);
            alert('Failed to prepare quote PDF for email.');
        } finally {
            setIsUploading(false);
        }
    };

    const handleSendEmailViaApi = async () => {
        if (!emailDetails.to || !emailDetails.pdfBlob) {
            alert('Recipients and PDF attachment are missing.');
            return;
        }

        setEmailSending(true);
        try {
            const pdfBase64 = await blobToBase64(emailDetails.pdfBlob);
            
            const res = await fetch(`${API_BASE}/api/quotes/send-email`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to: emailDetails.to,
                    cc: emailDetails.cc,
                    bcc: emailDetails.bcc,
                    subject: emailDetails.subject,
                    body: emailDetails.body.replace(/\n/g, '<br>'), // Convert newlines to HTML
                    attachmentName: emailDetails.pdfName,
                    pdfBase64,
                    reqNo: enquiryData?.enquiry?.RequestNo
                })
            });

            if (res.ok) {
                alert('Email sent successfully!');
                setShowEmailModal(false);
            } else {
                const data = await res.json();
                throw new Error(data.error || 'Failed to send email');
            }
        } catch (err) {
            console.error('Email send error:', err);
            alert(`Failed to send email: ${err.message}`);
        } finally {
            setEmailSending(false);
        }
    };

    const handleOpenInOutlook = () => {
        const href = buildMailtoHrefFromEmailModal();
        if (!href) return;

        setQuoteEmailDraftHref(href);
        openMailtoFromUserClick(href);
        triggerBlobDownload(emailDetails.pdfBlob, emailDetails.pdfName);
        setShowEmailModal(false);
    };

    const blobToBase64 = (blob) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result.split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    };

    // Helper to format date as DD-MMM-YYYY
    const formatDate = (dateInput) => {
        if (!dateInput) return '';
        try {
            if (dateInput instanceof Date && !Number.isNaN(dateInput.getTime())) {
                return format(dateInput, 'dd-MMM-yyyy');
            }
            const ds = String(dateInput).trim();
            if (/^\d{4}-\d{2}-\d{2}$/.test(ds)) {
                return format(parseISO(ds), 'dd-MMM-yyyy');
            }
            return format(new Date(ds), 'dd-MMM-yyyy');
        } catch (e) {
            return String(dateInput);
        }
    };

    // Calculate validity date
    const getValidityDate = () => {
        if (!quoteDate) return '';
        try {
            const base = /^\d{4}-\d{2}-\d{2}$/.test(String(quoteDate).trim())
                ? parseISO(String(quoteDate).trim())
                : new Date(quoteDate);
            if (Number.isNaN(base.getTime())) return '';
            return format(addDays(base, parseInt(validityDays || 0, 10)), 'dd-MMM-yyyy');
        } catch {
            return '';
        }
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
        const rowEmail = (loadedQuotePreparedByEmail || '').toLowerCase().trim();
        if (rowEmail && Array.isArray(usersList) && usersList.length > 0) {
            const byEmail = usersList.find((x) => {
                const xe = String(x.EmailId || x.email || '').toLowerCase().trim();
                return xe && xe === rowEmail;
            });
            const mob = (byEmail?.MobileNumber != null ? String(byEmail.MobileNumber) : '').trim();
            if (mob) return mob;
        }
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
    }, [loadedQuotePreparedByEmail, preparedBy, usersList, preparedByOptions, currentUser]);

    /** Quote preview / PDF: enquiry types as a single line (reference “Type” row). */
    const quotePreviewTypeLine = React.useMemo(() => {
        const parts = (quoteTypeList || []).map((x) => String(x || '').trim()).filter(Boolean);
        return parts.length ? parts.join(', ') : '—';
    }, [quoteTypeList]);

    /** Prepared By contact number only (no "Tel:") for quote header "Contact:" row. */
    const quotePreviewPreparedByContactDisplay = React.useMemo(() => {
        let t = String(preparedByContactFromMaster || '').trim();
        if (!t) return '';
        t = t.replace(/^tel\s*:?\s*/i, '').trim();
        return t;
    }, [preparedByContactFromMaster]);

    /** Subjob tabs: A4 document header uses EnquiryQuotes row only (own-job tab uses left-panel state via memos above). */
    const subjobQuoteA4HeaderDisplay = React.useMemo(() => {
        const tab = (calculatedTabs || []).find((t) => String(t.id) === String(activeQuoteTab));
        if (!tab?.isSubJobTab || !loadedEnquiryQuoteRowForPreview) return null;
        return buildSubjobQuoteHeaderDisplayFromRow(
            loadedEnquiryQuoteRowForPreview,
            usersList,
            preparedByOptions
        );
    }, [calculatedTabs, activeQuoteTab, loadedEnquiryQuoteRowForPreview, usersList, preparedByOptions]);

    /**
     * A4 cover "To," block: first tab = left form (`toName` / address).
     * Direct subjob tab + loaded EnquiryQuotes row: always use **saved** ToName / ToAddress / contact from that row
     * (LeadJob + RequestNo + OwnJob = active subjob tab; ToName = first-tab internal customer as stored — do not
     * replace with the subjob tab label or `availableProfiles` for OwnJob, or preview shows wrong "To").
     */
    const quotePreviewToBlockDisplay = React.useMemo(() => {
        const pick = (fromRow, fromForm) => {
            const r = String(fromRow ?? '').trim();
            return r || String(fromForm ?? '').trim();
        };
        const baseForm = {
            toName: String(toName || '').trim(),
            toAddress: String(toAddress || ''),
            toPhone: String(toPhone || '').trim(),
            toFax: String(toFax || '').trim(),
            toEmail: String(toEmail || '').trim(),
        };
        const sj = subjobQuoteA4HeaderDisplay;
        const row = loadedEnquiryQuoteRowForPreview;
        if (!sj || !row) return baseForm;

        return {
            toName: pick(sj.toName, toName),
            toAddress: pick(sj.toAddress, toAddress),
            toPhone: pick(sj.toPhone, toPhone),
            toFax: pick(sj.toFax, toFax),
            toEmail: pick(sj.toEmail, toEmail),
        };
    }, [
        subjobQuoteA4HeaderDisplay,
        loadedEnquiryQuoteRowForPreview,
        toName,
        toAddress,
        toPhone,
        toFax,
        toEmail,
    ]);

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
        if (quoteId != null && String(quoteId).trim() !== '') return;
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
    }, [toName, toAttention, attentionOptionsContentSig, pricingStableSig, quoteId]);

    // --- READ-ONLY TAB LOGIC ---
    const activeGlobalTabObj = (effectiveQuoteTabs || []).find(t => String(t.id) === String(activeQuoteTab));
    const isEditingRestricted = activeGlobalTabObj && !activeGlobalTabObj.isSelf;
    const activeGlobalTabName = activeGlobalTabObj ? (activeGlobalTabObj.name || activeGlobalTabObj.label) : 'Project';

    return (
        <>
            <div style={{ display: 'flex', height: 'calc(100vh - 100px)', background: '#f5f7fa' }}>
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
                                            enquiryData.leadJobPrefix,
                                            enquiryData.divisionsHierarchy
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

                                        let selectedLeadCodeDisplay = resolveQuoteLeadCodePill({
                                            selectedLeadId,
                                            selectedValue,
                                            pricingJobs: pricingData?.jobs,
                                            divisionsHierarchy: enquiryData?.divisionsHierarchy,
                                        });

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
                                                    quoteRowDivisionLeadLockRef.current = false;
                                                    const val = e.target.value;
                                                            if (!val || !String(val).trim()) return;
                                                            const nextFp = leadJobChoiceFingerprint(val);
                                                            const prevFp = leadChoiceFingerprintRef.current;
                                                            const didLeadChange = !!nextFp && nextFp !== prevFp;
                                                            if (didLeadChange) {
                                                                autoSelectCustomerAfterLeadChangeRef.current = true;
                                                                const tn = (toName || '').trim();
                                                                // Never reuse another lead branch's saved quote when only ToName is re-applied.
                                                                preserveQuoteOnLeadChangeRef.current = tn ? { toName: tn } : null;
                                                    setQuoteId(null);
                                                                setQuoteNumber('');
                                                                const reg = tabStateRegistry.current[activeQuoteTab];
                                                                if (reg && typeof reg === 'object') {
                                                                    reg.quoteId = null;
                                                                    reg.quoteNumber = '';
                                                                }
                                                                clearCustomerForLeadSwitch();
                                                            }
                                                            leadChoiceFingerprintRef.current = nextFp || prevFp;

                                                            // Match EnquiryFor root for dropdown value (duplicate clean names: L1 subjob vs L2 lead).
                                                            const jobObj = resolvePricingRootForLeadSelect(
                                                                val,
                                                                pricingData?.jobs,
                                                                enquiryData?.divisionsHierarchy
                                                            );
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

                {/* Action row: Draft Save always visible; Save / Revision only when enquiry + lead + customer are set */}
                <div style={{ padding: '8px 12px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: '6px', flexWrap: 'wrap' }}>

                        {/* Draft Save + load — PDF / Email / With Header / Print / Signatures are on the right panel toolbar. */}
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                            <div
                                ref={formDraftMenuWrapRef}
                                style={{ position: 'relative', display: 'inline-flex', alignItems: 'stretch' }}
                            >
                                <div
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'stretch',
                                        gap: 0,
                                        borderRadius: '44px',
                                        overflow: 'hidden',
                                        border: '1px solid #cbd5e1',
                                    }}
                                >
                                    <button
                                        type="button"
                                        onClick={() => void handleSaveQuoteFormDraft()}
                                        disabled={saving || !canEdit() || isEditingRestricted}
                                        title="Save a draft of this quote form (all tabs) on the server for your account only. Does not create a saved quote."
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            padding: '6px 12px',
                                            background: !canEdit() || isEditingRestricted ? '#f1f5f9' : '#fff',
                                            color: !canEdit() || isEditingRestricted ? '#94a3b8' : '#334155',
                                            border: 'none',
                                            borderRadius: 0,
                                            cursor: !canEdit() || isEditingRestricted ? 'not-allowed' : 'pointer',
                                            fontWeight: '600',
                                            fontSize: '12px',
                                            whiteSpace: 'nowrap',
                                        }}
                                    >
                                        <FileText size={14} /> Draft Save
                                    </button>
                                    <button
                                        type="button"
                                        aria-expanded={formDraftPanelOpen}
                                        aria-haspopup="listbox"
                                        onClick={() => {
                                            if (!normalizeDraftUserEmailForApi(currentUser?.EmailId || currentUser?.email || '')) {
                                                alert('Sign in with a user email to list drafts.');
                                                return;
                                            }
                                            setFormDraftPanelOpen((o) => !o);
                                        }}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            padding: '6px 10px',
                                            fontSize: '11px',
                                            fontWeight: 600,
                                            border: 'none',
                                            borderLeft: '1px solid #cbd5e1',
                                            background: '#f8fafc',
                                            color: '#475569',
                                            cursor: 'pointer',
                                            outline: 'none',
                                            whiteSpace: 'nowrap',
                                        }}
                                        title="Open list of your saved drafts (server). Other users cannot see them."
                                    >
                                        Load draft… <ChevronDown size={12} />
                                    </button>
                                </div>
                                {formDraftPanelOpen && (
                                    <div
                                        style={{
                                            position: 'absolute',
                                            top: 'calc(100% + 6px)',
                                            left: 0,
                                            minWidth: '300px',
                                            maxWidth: 'min(380px, 94vw)',
                                            maxHeight: '260px',
                                            overflowY: 'auto',
                                            background: '#fff',
                                            border: '1px solid #cbd5e1',
                                            borderRadius: '8px',
                                            boxShadow: '0 10px 28px rgba(15,23,42,0.14)',
                                            zIndex: 80,
                                            padding: '4px 0',
                                        }}
                                    >
                                        {quoteFormDraftsError ? (
                                            <div
                                                style={{
                                                    padding: '10px 12px',
                                                    fontSize: '11px',
                                                    color: '#b91c1c',
                                                    lineHeight: 1.45,
                                                    borderBottom: '1px solid #fecaca',
                                                    background: '#fff1f2',
                                                }}
                                            >
                                                {quoteFormDraftsError}
                                            </div>
                                        ) : null}
                                        {quoteFormDraftsLoading ? (
                                            <div style={{ padding: '10px 12px', fontSize: '12px', color: '#64748b' }}>
                                                Loading drafts…
                                            </div>
                                        ) : !quoteFormDraftsError && quoteFormDraftList.length === 0 ? (
                                            <div style={{ padding: '10px 12px', fontSize: '12px', color: '#64748b' }}>
                                                No drafts saved yet.
                                            </div>
                                        ) : quoteFormDraftList.length > 0 ? (
                                            quoteFormDraftList.map((d) => {
                                                const rowId = d.id ?? d.Id;
                                                const rowLabel = d.label ?? d.Label ?? rowId;
                                                return (
                                                    <div
                                                        key={rowId}
                                                        style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '8px',
                                                            padding: '6px 10px',
                                                            borderBottom: '1px solid #f1f5f9',
                                                        }}
                                                    >
                                                        <span
                                                            style={{
                                                                flex: 1,
                                                                fontSize: '12px',
                                                                color: '#334155',
                                                                minWidth: 0,
                                                                overflow: 'hidden',
                                                                textOverflow: 'ellipsis',
                                                            }}
                                                            title={rowLabel}
                                                        >
                                                            {rowLabel}
                                                        </span>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                void handleSelectQuoteFormDraft(rowId)
                                                                    .catch((err) => console.warn('[QuoteForm] draft load', err))
                                                                    .finally(() => setFormDraftPanelOpen(false));
                                                            }}
                                                            style={{
                                                                fontSize: '11px',
                                                                fontWeight: 600,
                                                                padding: '4px 8px',
                                                                borderRadius: '6px',
                                                                border: '1px solid #cbd5e1',
                                                                background: '#1e293b',
                                                                color: '#fff',
                                                                cursor: 'pointer',
                                                                flexShrink: 0,
                                                            }}
                                                        >
                                                            Load
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={(ev) =>
                                                                void handleDeleteQuoteFormDraft(ev, rowId)
                                                            }
                                                            title="Delete this draft"
                                                            style={{
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                width: '28px',
                                                                height: '28px',
                                                                padding: 0,
                                                                borderRadius: '6px',
                                                                border: '1px solid #fecaca',
                                                                background: '#fff1f2',
                                                                color: '#b91c1c',
                                                                cursor: 'pointer',
                                                                flexShrink: 0,
                                                            }}
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                );
                                            })
                                        ) : null}
                                    </div>
                                )}
                            </div>

                            {enquiryData && enquiryData.leadJobPrefix && toName?.trim() && (
                            <>
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
                                <button
                                    onClick={handleRevise}
                                    disabled={saving || !canEdit() || isEditingRestricted || !canRevisePersistedQuote}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        padding: '6px 12px',
                                        background:
                                            !canEdit() || isEditingRestricted || !canRevisePersistedQuote
                                                ? '#94a3b8'
                                                : '#0284c7',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '4px',
                                        cursor:
                                            !canEdit() || isEditingRestricted || !canRevisePersistedQuote
                                                ? 'not-allowed'
                                                : 'pointer',
                                        fontWeight: '600',
                                        fontSize: '12px',
                                    }}
                                    title={
                                        isEditingRestricted
                                            ? 'Editing is restricted for this tab'
                                            : !canEdit()
                                              ? 'No permission to revise'
                                              : !canRevisePersistedQuote
                                                ? 'Loading quote…'
                                                : ''
                                    }
                                >
                                    <Plus size={14} /> Revision
                                </button>
                            )}
                            </>
                            )}
                        </div>
                    </div>




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

                                                const filteredQuotes = getFilteredQuotesForPreviousQuotesTab(activeTabObj.id);

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
                                                                    onClick={() =>
                                                                        loadQuote(latest, {
                                                                            preserveRecipient: true,
                                                                            skipPreparedSignatory: true,
                                                                        })
                                                                    }
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
                                                                            onClick={() =>
                                                                                loadQuote(rev, {
                                                                                    preserveRecipient: true,
                                                                                    skipPreparedSignatory: true,
                                                                                })
                                                                            }
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
                                                                            <input
                                                                                type="checkbox"
                                                                                checked={jobNameMatchesActiveJobsList(grp.name, selectedJobs)}
                                                                                onChange={() => handleJobToggle(grp.name)}
                                                                            />
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
                                                                            .filter((g) => jobNameMatchesActiveJobsList(g.name, selectedJobs))
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
                                        const sideSerial = clauseSidebarSerialByIndex[index] || 0;

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
                                                        <span style={{ fontSize: '13px', fontWeight: '500' }}>
                                                            {sideSerial ? `${sideSerial}. ` : ''}
                                                            {title}
                                                        </span>
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


                                                {isChecked && !isCustom && contentKey === 'pricingTerms' && (
                                                    <div style={{ marginLeft: '32px', marginTop: '10px' }}>
                                                        <div
                                                            style={{
                                                                fontSize: '11px',
                                                                fontWeight: 600,
                                                                color: '#475569',
                                                                marginBottom: '6px',
                                                            }}
                                                        >
                                                            Latest pricing (checked jobs in Pricing Summary)
                                                        </div>
                                                        {pricingTermsAutoTablePreviewHtml ? (
                                                            <div
                                                                className="quote-pricing-terms-auto-table-preview"
                                                                dangerouslySetInnerHTML={{
                                                                    __html: pricingTermsAutoTablePreviewHtml,
                                                                }}
                                                            />
                                                        ) : (
                                                            <div
                                                                style={{
                                                                    fontSize: '11px',
                                                                    color: '#94a3b8',
                                                                    fontStyle: 'italic',
                                                                    padding: '8px 0',
                                                                }}
                                                            >
                                                                Load an enquiry with pricing to populate this table.
                                                            </div>
                                                        )}
                                                        <style>
                                                            {`
                                                            .quote-pricing-terms-auto-table-preview table,
                                                            .quote-pricing-terms-auto-table-preview td,
                                                            .quote-pricing-terms-auto-table-preview th {
                                                                border: 1px solid #64748b !important;
                                                                border-collapse: collapse !important;
                                                            }
                                                            .quote-pricing-terms-auto-table-preview table {
                                                                width: 100%;
                                                                border-collapse: collapse;
                                                                margin-bottom: 8px;
                                                                font-size: 12px;
                                                            }
                                                            `}
                                                        </style>
                                                    </div>
                                                )}

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
            </div>

            {/* Resizer Handle */}
            <div
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
            </div>

            {/* Right Panel - Quote Preview */}
            <div style={{ flex: 1, overflow: 'auto', padding: '0 20px 20px 20px' }}>
                {
                    loading ? (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#64748b' }} >
                            Loading enquiry data...
                        </div>
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
                                        flexDirection: 'row',
                                        flexWrap: 'nowrap',
                                        alignItems: 'flex-end',
                                        justifyContent: 'flex-start',
                                        gap: '10px',
                                        width: '100%',
                                        overflowX: 'auto',
                                        boxSizing: 'border-box',
                                    }}
                                >
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flexShrink: 0 }}>
                                        <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', lineHeight: 1.2 }}>Category</span>
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
                                                minWidth: '132px',
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
                                    </div>
                                    <div
                                        style={{
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '4px',
                                            flex: '1 1 160px',
                                            minWidth: '120px',
                                            maxWidth: '360px',
                                        }}
                                    >
                                        <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', lineHeight: 1.2 }}>Search criteria</span>
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
                                                    ? 'Quote details, project, enquiry no., client, consultant…'
                                                    : 'Select "Search Quote" to enable'
                                            }
                                            style={{
                                                width: '100%',
                                                boxSizing: 'border-box',
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
                                    </div>
                                    <div
                                        style={{
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '4px',
                                            flexShrink: 0,
                                            opacity: quoteListCategory === QUOTE_LIST_CATEGORY.SEARCH ? 1 : 0.65,
                                        }}
                                    >
                                        <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', lineHeight: 1.2 }}>From</span>
                                        <div
                                            style={{
                                                width: '118px',
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
                                    </div>
                                    <div
                                        style={{
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '4px',
                                            flexShrink: 0,
                                            opacity: quoteListCategory === QUOTE_LIST_CATEGORY.SEARCH ? 1 : 0.65,
                                        }}
                                    >
                                        <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', lineHeight: 1.2 }}>To</span>
                                        <div
                                            style={{
                                                width: '118px',
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
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'row', flexWrap: 'nowrap', gap: '8px', flexShrink: 0 }}>
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
                            {quoteListSummaryBody}
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
                            {/* Sticky top bar — single row; labels above controls; action icons on the right */}
                            <div
                                className="no-print"
                                style={{
                                    position: 'sticky',
                                    top: 0,
                                    zIndex: 20,
                                    flexShrink: 0,
                                    width: '100%',
                                    boxSizing: 'border-box',
                                    marginTop: 0,
                                    marginBottom: '8px',
                                    padding: '8px 12px',
                                background: '#f8fafc',
                                border: '1px solid #e2e8f0',
                                    borderTop: 'none',
                                    borderRadius: '0 0 8px 8px',
                                    boxShadow: '0 2px 8px rgba(15, 23, 42, 0.06)',
                                }}
                            >
                                <div
                                    style={{
                                        display: 'flex',
                                        flexDirection: 'row',
                                        flexWrap: 'nowrap',
                                        alignItems: 'flex-end',
                                        justifyContent: 'flex-start',
                                        gap: '10px',
                                        width: '100%',
                                        overflowX: 'auto',
                                        boxSizing: 'border-box',
                                    }}
                                >
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flexShrink: 0 }}>
                                        <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', lineHeight: 1.2 }}>Category</span>
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
                                                minWidth: '132px',
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
                                    </div>
                                    <div
                                        style={{
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '4px',
                                            flex: '1 1 160px',
                                            minWidth: '120px',
                                            maxWidth: '360px',
                                        }}
                                    >
                                        <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', lineHeight: 1.2 }}>Search criteria</span>
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
                                                    ? 'Quote details, project, enquiry no., client, consultant…'
                                                    : 'Select "Search Quote" to enable'
                                            }
                                            style={{
                                                width: '100%',
                                                boxSizing: 'border-box',
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
                                    </div>
                                    <div
                                        style={{
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '4px',
                                            flexShrink: 0,
                                            opacity: quoteListCategory === QUOTE_LIST_CATEGORY.SEARCH ? 1 : 0.65,
                                        }}
                                    >
                                        <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', lineHeight: 1.2 }}>From</span>
                                        <div
                                            style={{
                                                width: '118px',
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
                                    </div>
                                    <div
                                        style={{
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '4px',
                                            flexShrink: 0,
                                            opacity: quoteListCategory === QUOTE_LIST_CATEGORY.SEARCH ? 1 : 0.65,
                                        }}
                                    >
                                        <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', lineHeight: 1.2 }}>To</span>
                                        <div
                                            style={{
                                                width: '118px',
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
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'row', flexWrap: 'nowrap', gap: '8px', flexShrink: 0 }}>
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
                                    <div
                                        className="no-print"
                                        style={{
                                            display: 'flex',
                                            flexWrap: 'nowrap',
                                            alignItems: 'center',
                                            gap: '6px',
                                            marginLeft: 'auto',
                                            flexShrink: 0,
                                            paddingBottom: '2px',
                                        }}
                                    >
                                        <button
                                            type="button"
                                            onClick={downloadPDF}
                                            disabled={!hasUserPricing}
                                            title="Download quote PDF"
                                            aria-label="Download quote PDF"
                                            style={{
                                                width: '32px',
                                                height: '32px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                color: 'white',
                                                background: '#ef4444',
                                                border: '1px solid #ef4444',
                                                borderRadius: '6px',
                                                cursor: !hasUserPricing ? 'not-allowed' : 'pointer',
                                                opacity: !hasUserPricing ? 0.5 : 1,
                                            }}
                                        >
                                            <Download size={16} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={startQuoteEmailFlow}
                                            disabled={!hasUserPricing || isUploading}
                                            title={
                                                !toEmail?.trim()
                                                    ? 'Opens a draft without To — fill recipient in Outlook. Enter Email on the quote (left) to pre-fill next time.'
                                                    : 'Tries desktop Outlook (mailto), then downloads the quote PDF and saved attachments to Downloads — attach them in Outlook.'
                                            }
                                            aria-label="Email quote"
                                            style={{
                                                width: '32px',
                                                height: '32px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                color: '#1e40af',
                                                background: 'white',
                                                border: '1px solid #3b82f6',
                                                borderRadius: '6px',
                                                cursor: !hasUserPricing || isUploading ? 'not-allowed' : 'pointer',
                                                opacity: !hasUserPricing || isUploading ? 0.5 : 1,
                                            }}
                                        >
                                            <Mail size={16} />
                                        </button>
                                        <label
                                            className="no-print"
                                            style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#64748b', cursor: 'pointer', whiteSpace: 'nowrap' }}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={printWithHeader}
                                                onChange={(e) => setPrintWithHeader(e.target.checked)}
                                            />
                                            With Header
                                        </label>
                                        <button
                                            type="button"
                                            onClick={printQuote}
                                            disabled={!hasUserPricing}
                                            title="Print preview (uses With Header)"
                                            aria-label="Print quote"
                                            style={{
                                                width: '32px',
                                                height: '32px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                background: 'white',
                                                color: '#1e293b',
                                                border: '1px solid #cbd5e1',
                                                borderRadius: '6px',
                                                cursor: !hasUserPricing ? 'not-allowed' : 'pointer',
                                                opacity: !hasUserPricing ? 0.5 : 1,
                                            }}
                                        >
                                            <Printer size={16} />
                                        </button>
                                        <div
                                            className="no-print"
                                            role="button"
                                            tabIndex={!hasUserPricing || !enquiryData?.enquiry?.RequestNo ? -1 : 0}
                                            aria-disabled={!hasUserPricing || !enquiryData?.enquiry?.RequestNo}
                                            aria-label="Signatures: click to place or open library; drag anywhere on this control onto the quote to drop"
                                            draggable={Boolean(
                                                hasUserPricing &&
                                                    enquiryData?.enquiry?.RequestNo &&
                                                    toolbarDragSignatureImageUrl
                                            )}
                                            onDragStart={handleToolbarSignatureDragStart}
                                            onDragEnd={handleToolbarSignatureDragEnd}
                                            onClick={handleSignaturesToolbarControlClick}
                                            onKeyDown={(e) => {
                                                if (e.key !== 'Enter' && e.key !== ' ') return;
                                                e.preventDefault();
                                                handleSignaturesToolbarControlClick(e);
                                            }}
                                            title={
                                                !hasUserPricing || !enquiryData?.enquiry?.RequestNo
                                                    ? 'Save the quote context to use signatures.'
                                                    : toolbarDragSignatureImageUrl
                                                      ? 'Click: place on the page in view. Drag from anywhere on this button onto the quote for an exact position. Shift+click: signature library.'
                                                      : 'Click: open library to add a signature. Shift+click: library.'
                                            }
                                            style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '4px',
                                                height: '32px',
                                                minWidth: '44px',
                                                padding: '0 8px',
                                                border: '1px solid #cbd5e1',
                                                borderRadius: '6px',
                                                background: 'white',
                                                color: '#475569',
                                                opacity: !hasUserPricing || !enquiryData?.enquiry?.RequestNo ? 0.5 : 1,
                                                pointerEvents: !hasUserPricing || !enquiryData?.enquiry?.RequestNo ? 'none' : 'auto',
                                                cursor: !hasUserPricing || !enquiryData?.enquiry?.RequestNo
                                                    ? 'not-allowed'
                                                    : toolbarDragSignatureImageUrl
                                                      ? 'grab'
                                                      : 'pointer',
                                                userSelect: 'none',
                                                boxSizing: 'border-box',
                                            }}
                                        >
                                            <PenTool size={16} aria-hidden />
                                            {toolbarDragSignatureImageUrl &&
                                            hasUserPricing &&
                                            enquiryData?.enquiry?.RequestNo ? (
                                                <GripVertical size={12} color="#94a3b8" aria-hidden />
                                            ) : null}
                                        </div>
                                    </div>
                                </div>
                            </div>
                            {showQuoteListSummaryOverQuote ? (
                                <div
                                    style={{
                                        flex: 1,
                                        minHeight: 0,
                                        marginTop: '8px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        overflow: 'hidden',
                                    }}
                                >
                                    {quoteListSummaryBody}
                                </div>
                            ) : (
                                <>
                                    {/* DOM: attachments then print root. flex row-reverse shows quote preview left and attachments on the right. */}
                                    <div
                                        style={{
                                            display: 'flex',
                                            flexDirection: 'row-reverse',
                                            flex: 1,
                                            minHeight: 0,
                                            gap: '16px',
                                            alignItems: 'stretch',
                                            width: '100%',
                                            marginTop: 0,
                                        }}
                                    >
                            <div
                                className="no-print"
                                style={{
                                    width: '196px',
                                    minWidth: '154px',
                                    maxWidth: '224px',
                                    flexShrink: 0,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '12px',
                                    minHeight: 0,
                                    overflowY: 'auto',
                                    padding: '12px 14px',
                                    background: '#f8fafc',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: '8px',
                                    boxSizing: 'border-box',
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#475569', fontSize: '13px', fontWeight: '600' }}>
                                            <Paperclip size={18} className="text-blue-500" />
                                            <span>Attachments {quoteAttachments.length > 0 && `(${quoteAttachments.length})`}</span>
                                        </div>
                                        <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 'normal', lineHeight: 1.4 }}>
                                            Click &quot;Add Files&quot; or <span style={{ color: '#3b82f6', fontWeight: '500' }}>Paste (Ctrl+V)</span> —{' '}
                                            <span style={{ color: '#10b981', fontWeight: '600' }}>{quoteId ? 'Ready' : 'Pending Save'}</span>
                                        </span>
                                    </div>
                                    <button
                                        type="button"
                                            onClick={() => fileInputRef.current?.click()}
                                            style={{
                                                fontSize: '11px',
                                                color: '#3b82f6',
                                                background: 'white',
                                                border: '1px solid #3b82f6',
                                            padding: '4px 10px',
                                                borderRadius: '4px',
                                                cursor: 'pointer',
                                                fontWeight: '600',
                                                display: 'flex',
                                                alignItems: 'center',
                                            gap: '4px',
                                            flexShrink: 0,
                                            }}
                                        >
                                            <Plus size={14} /> Add Files
                                        </button>
                                    </div>
                                {quoteEmailDraftHref && (
                                    <div style={{ fontSize: '11px', color: '#475569', lineHeight: 1.45 }}>
                                        <div style={{ color: '#334155', marginBottom: '4px' }}>
                                            <strong>Desktop Outlook:</strong> some builds log a successful{' '}
                                            <code style={{ fontSize: '10px', background: '#f1f5f9', padding: '1px 4px' }}>mailto:</code>
                                            {' '}hand-off but do not show a new message window. Use the link below to retry, then attach the PDF/files from Downloads if needed.
                                        </div>
                                        <div>
                                            <a
                                                href={quoteEmailDraftHref}
                                                style={{ color: '#2563eb', fontWeight: 600, textDecoration: 'underline' }}
                                            >
                                                Open mail draft (mailto)
                                            </a>
                                            <span style={{ marginLeft: '6px', color: '#94a3b8' }}>same draft as Email.</span>
                                        </div>
                                    </div>
                                )}
                                    <input
                                        type="file"
                                        multiple
                                        ref={fileInputRef}
                                        onChange={(e) => uploadFiles(e.target.files)}
                                        style={{ display: 'none' }}
                                    />

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
                                style={{
                                    flex: 1,
                                    minWidth: '210mm',
                                    minHeight: 0,
                                    overflow: 'auto',
                                    maxWidth: '100%',
                                    margin: '0 auto',
                                    width: '100%',
                                    boxSizing: 'border-box',
                                }}
                            >
                                <div className="quote-print-repeat-strip" aria-hidden="true">
                                    <div style={{ display: 'flex', alignItems: 'center', width: '100%', justifyContent: 'flex-end' }}>
                                        {quoteLogoDisplaySrc ? (
                                            <img src={quoteLogoDisplaySrc} alt="" style={{ height: '68px', width: 'auto', maxWidth: '212px', objectFit: 'contain' }} />
                                        ) : null}
                                    </div>
                                </div>
                            <style>{tableStyles}</style>
                            <style>
                                {`
                                    .quote-print-repeat-strip {
                                        display: none;
                                    }
                                    .footer-section {
                                        display: flex;
                                        flex-direction: column;
                                        align-items: stretch;
                                        width: 100%;
                                        max-width: 100%;
                                        box-sizing: border-box;
                                        break-inside: avoid;
                                        page-break-inside: avoid;
                                    }
                                    .quote-print-page-indicator {
                                        display: block;
                                        width: 100%;
                                        max-width: 100%;
                                        text-align: right;
                                        box-sizing: border-box;
                                    }
                                    .quote-print-footer-wrap {
                                        width: 50%;
                                        max-width: 50%;
                                        margin-left: auto;
                                        margin-right: 0;
                                        box-sizing: border-box;
                                    }
                                    .quote-print-footer-company {
                                        width: 100%;
                                        max-width: 100%;
                                        text-align: right;
                                        box-sizing: border-box;
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
                                        align-items: center;
                                        gap: 10px;
                                        width: 210mm !important;
                                        min-width: 210mm !important;
                                        max-width: 210mm !important;
                                        box-sizing: border-box;
                                        padding: 20px 0 28px;
                                        background: #e2e8f0;
                                        border: none !important;
                                        outline: none !important;
                                        overflow-x: visible;
                                        overflow-y: visible;
                                        margin: 0 auto;
                                    }
                                    #quote-preview .quote-a4-sheet {
                                        flex-shrink: 0;
                                    }
                                    .quote-document-root {
                                        border: none !important;
                                        outline: none !important;
                                    }
                                    .quote-a4-sheet {
                                        position: relative;
                                        background: #fff;
                                        box-sizing: border-box;
                                        width: 210mm;
                                        min-width: 210mm;
                                        max-width: 210mm;
                                        margin-left: auto;
                                        margin-right: auto;
                                        margin-bottom: 0;
                                        padding: 15mm;
                                        min-height: 297mm;
                                        border: none !important;
                                        outline: none !important;
                                        box-shadow:
                                            0 1px 2px rgba(0, 0, 0, 0.12),
                                            0 6px 16px rgba(0, 0, 0, 0.14),
                                            0 0 0 1px rgba(0, 0, 0, 0.06);
                                        border-radius: 1px;
                                        display: grid;
                                        grid-template-columns: minmax(0, 1fr);
                                        grid-template-rows: auto minmax(0, 1fr) auto;
                                        align-content: stretch;
                                        page-break-after: always;
                                        break-after: page;
                                    }
                                    .quote-a4-sheet:last-child {
                                        page-break-after: auto;
                                        break-after: auto;
                                    }
                                    /* Continuation pages: avoid stretching clause stack; keep footer at sheet bottom. */
                                    .quote-a4-sheet--continuation .quote-sheet-main-flex {
                                        min-height: 0 !important;
                                    }
                                    .quote-a4-sheet--continuation .content-section {
                                        flex: 0 1 auto !important;
                                    }
                                    .quote-sheet-main-flex {
                                        min-width: 0;
                                        min-height: 0;
                                        height: 100%;
                                        width: 100%;
                                        display: flex;
                                        flex-direction: column;
                                    }
                                    .content-section {
                                        width: 100%;
                                        max-width: 100%;
                                        box-sizing: border-box;
                                        text-align: left;
                                    }
                                    .quote-clause-block {
                                        width: 100%;
                                        max-width: 100%;
                                        box-sizing: border-box;
                                        text-align: left;
                                    }
                                    .quote-clause-block .clause-content {
                                        text-align: left;
                                    }
                                    .quote-sheet-logo-row {
                                        flex-shrink: 0;
                                        display: flex;
                                        justify-content: flex-end;
                                        width: 100%;
                                    }
                                    .quote-cover-first-page {
                                        flex-shrink: 0;
                                        margin-bottom: 22px;
                                    }
                                    .quote-section-rule {
                                        border: 0;
                                        border-top: 1px solid #94a3b8;
                                        margin: 0 0 16px 0;
                                        height: 0;
                                        box-sizing: border-box;
                                    }
                                    .quote-section-rule--after-header {
                                        margin-top: 10px;
                                        margin-bottom: 16px;
                                    }
                                    .quote-section-rule--before-cover-letter {
                                        margin-top: 0;
                                        margin-bottom: 20px;
                                    }
                                    .quote-cover-letter {
                                        padding-top: 10px;
                                    }
                                    .quote-header-quote-panel {
                                        width: 100%;
                                        border: none;
                                        border-radius: 0;
                                        overflow: visible;
                                        font-size: 13px;
                                        box-sizing: border-box;
                                    }
                                    .quote-header-quote-panel-body {
                                        display: flex;
                                        flex-direction: column;
                                        width: 100%;
                                        padding: 4px 0 14px 0;
                                        box-sizing: border-box;
                                    }
                                    .quote-header-quote-panel-row--ref {
                                        background: #e8edf4 !important;
                                        -webkit-print-color-adjust: exact;
                                        print-color-adjust: exact;
                                        padding: 9px 0 9px 0 !important;
                                        margin: 0 0 2px 0;
                                        box-sizing: border-box;
                                    }
                                    .quote-header-quote-panel-row--ref .quote-header-quote-panel-label {
                                        font-weight: 600 !important;
                                        color: #475569 !important;
                                    }
                                    .quote-header-quote-panel-row--ref .quote-header-quote-panel-value {
                                        font-weight: 700 !important;
                                        color: #0f172a !important;
                                    }
                                    .quote-header-quote-panel-row {
                                        display: flex;
                                        flex-direction: row;
                                        align-items: flex-start;
                                        padding: 5px 0;
                                        min-width: 0;
                                        line-height: 1.38;
                                    }
                                    .quote-header-quote-panel-label {
                                        flex: 0 0 34%;
                                        max-width: 132px;
                                        color: #000;
                                        font-weight: 400;
                                        padding-right: 12px;
                                        box-sizing: border-box;
                                    }
                                    .quote-header-quote-panel-value {
                                        flex: 1 1 auto;
                                        min-width: 0;
                                        color: #000;
                                        font-weight: 400;
                                    }
                                    .quote-cover-page1-spacer {
                                        flex: 1 1 auto;
                                        min-height: 8mm;
                                    }
                                    .quote-cover-sign-off {
                                        flex-shrink: 0;
                                        width: 100%;
                                        box-sizing: border-box;
                                        padding-top: 4px;
                                    }
                                    .quote-cover-sign-off-for {
                                        margin: 0 0 calc(1.58em * 3) 0;
                                        font-size: 13px;
                                        line-height: 1.58;
                                        color: #0f172a;
                                        font-weight: 600;
                                    }
                                    .quote-cover-signatory-line {
                                        margin-top: 0;
                                        font-size: 13px;
                                        color: #0f172a;
                                    }
                                    .quote-cover-signatory-designation {
                                        margin-top: 4px;
                                        font-size: 12px;
                                        line-height: 1.45;
                                        color: #475569;
                                        font-weight: 400;
                                    }
                                    .quote-cover-meta-table {
                                        width: 100%;
                                        table-layout: fixed;
                                        border-collapse: collapse;
                                        font-size: 13px;
                                        margin-bottom: 0;
                                    }
                                    .quote-cover-meta-table td {
                                        border: none !important;
                                        padding: 7px 10px 7px 0;
                                        vertical-align: top;
                                        line-height: 1.45;
                                    }
                                    .quote-cover-meta-table td:first-child {
                                        width: 26%;
                                        max-width: 132px;
                                        color: #64748b;
                                        font-weight: 500;
                                    }
                                    .quote-cover-meta-table td:last-child {
                                        color: #0f172a;
                                        font-weight: 400;
                                    }
                                    .quote-cover-meta-row-project td {
                                        background: #e8edf4 !important;
                                        -webkit-print-color-adjust: exact !important;
                                        print-color-adjust: exact !important;
                                        padding-top: 9px;
                                        padding-bottom: 9px;
                                    }
                                    .quote-cover-meta-row-project td:first-child {
                                        font-weight: 600 !important;
                                        color: #475569 !important;
                                    }
                                    .quote-cover-meta-row-project td:last-child {
                                        font-weight: 700 !important;
                                        color: #0f172a !important;
                                    }
                                    .quote-cover-letter p {
                                        margin: 0 0 11px 0;
                                        font-size: 13px;
                                        line-height: 1.58;
                                        color: #0f172a;
                                    }
                                    .quote-cover-letter p:last-of-type {
                                        margin-bottom: 0;
                                        font-weight: 400;
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
                                        font-size: 11px;
                                        font-weight: 600;
                                        color: #64748b;
                                        padding-bottom: 6px;
                                    }
                                    @media print {
                                        /* Hide everything first */
                                        .no-print, 
                                        .sidebar-container, 
                                        .top-nav, 
                                        [role="complementary"],
                                        [role="navigation"],
                                        button,
                                        .modal-backdrop {
                                        display: none !important;
                                    }

                                        html, body {
                                            width: 210mm !important;
                                            height: auto !important;
                                            margin: 0 !important;
                                            padding: 0 !important;
                                            background: #fff !important;
                                            overflow: visible !important;
                                        }

                                        /* Force show only the print root and its hierarchy */
                                        #quote-print-root {
                                            display: block !important;
                                            position: static !important;
                                            width: 210mm !important;
                                            margin: 0 !important;
                                            padding: 0 !important;
                                            visibility: visible !important;
                                            overflow: visible !important;
                                        }

                                        #quote-preview {
                                            display: flex !important;
                                            flex-direction: column !important;
                                            align-items: center !important;
                                            width: 210mm !important;
                                            min-width: 210mm !important;
                                            max-width: 210mm !important;
                                            margin: 0 auto !important;
                                            padding: 0 !important;
                                            background: #fff !important;
                                        }

                                        .quote-a4-sheet {
                                            display: grid !important;
                                            grid-template-columns: minmax(0, 1fr) !important;
                                            grid-template-rows: auto minmax(0, 1fr) auto !important;
                                            width: 210mm !important;
                                            min-width: 210mm !important;
                                            max-width: 210mm !important;
                                            min-height: 297mm !important;
                                            height: auto !important;
                                            max-height: none !important;
                                            padding: 15mm !important;
                                            margin: 0 auto !important;
                                            page-break-after: always !important;
                                            break-after: page !important;
                                            border: none !important;
                                            box-shadow: none !important;
                                            box-sizing: border-box !important;
                                            background: white !important;
                                            visibility: visible !important;
                                            overflow: visible !important;
                                        }

                                        .quote-a4-sheet--continuation .quote-sheet-main-flex {
                                            min-height: 0 !important;
                                        }
                                        .quote-a4-sheet--continuation .content-section {
                                            flex: 0 1 auto !important;
                                        }

                                        .quote-sheet-logo-row, 
                                        .quote-continuation-header {
                                            display: flex !important;
                                            visibility: visible !important;
                                        }
                                        .footer-section {
                                            display: flex !important;
                                            flex-direction: column !important;
                                            align-items: stretch !important;
                                            width: 100% !important;
                                            max-width: 100% !important;
                                            box-sizing: border-box !important;
                                            break-inside: avoid !important;
                                            page-break-inside: avoid !important;
                                            visibility: visible !important;
                                        }
                                        .quote-print-page-indicator {
                                            display: block !important;
                                            width: 100% !important;
                                            max-width: 100% !important;
                                            text-align: right !important;
                                            box-sizing: border-box !important;
                                            visibility: visible !important;
                                        }
                                        .quote-print-footer-wrap {
                                            width: 50% !important;
                                            max-width: 50% !important;
                                            margin-left: auto !important;
                                            margin-right: 0 !important;
                                            box-sizing: border-box !important;
                                        }
                                        .quote-print-footer-company {
                                            width: 100% !important;
                                            max-width: 100% !important;
                                            text-align: right !important;
                                            box-sizing: border-box !important;
                                        }

                                        img {
                                            -webkit-print-color-adjust: exact !important;
                                            print-color-adjust: exact !important;
                                            display: block !important;
                                        }

                                        /* Fix for logo specifically */
                                        .quote-sheet-logo-row img {
                                            max-height: 68px !important;
                                        }
                                        .no-print { display: none !important; }
                                        .quote-a4-sheet { box-shadow: none !important; }
                                        .quote-cover-meta-row-project td {
                                            -webkit-print-color-adjust: exact !important;
                                            print-color-adjust: exact !important;
                                            background: #e8edf4 !important;
                                        }
                                }
                            `}
                            </style>

                                <div
                                    id="quote-preview"
                                    ref={quotePreviewLayoutRef}
                                    className="quote-document-root"
                                    style={{
                                        padding: 0,
                                        border: 'none',
                                        outline: 'none',
                                        borderRadius: 0,
                                        boxShadow: 'none',
                                        width: '210mm',
                                        minWidth: '210mm',
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
                                        {activeClausesList.map((clause, clauseMeasureIdx) => (
                                            <div
                                                key={`measure-${clause.key}`}
                                                id={`measure-clause-${clause.key}`}
                                                data-clause-measure-index={clauseMeasureIdx}
                                                className="quote-clause-block quote-clause-section"
                                                style={{
                                                    width: '180mm',
                                                    maxWidth: '100%',
                                                    marginBottom: '20px',
                                                    boxSizing: 'border-box',
                                                }}
                                            >
                                                <h3
                                                    style={{
                                                        fontSize: '14px',
                                                        fontWeight: 'bold',
                                                        marginBottom: '8px',
                                                    }}
                                                >
                                                    {clauseMeasureIdx + 1}. {clause.title}
                                                </h3>
                                                <div
                                                    className="clause-content"
                                                    style={{ fontSize: '13px', lineHeight: '1.6' }}
                                                    dangerouslySetInnerHTML={{
                                                        __html: getClauseDisplayBodyHtml(
                                                            clause.content,
                                                            clause.listKey,
                                                            clauseMeasureIdx + 1
                                                        ),
                                                    }}
                                                />
                                            </div>
                                        ))}
                                    </div>

                                    {sheets.map((sheet, sheetIdx) => (
                                        <div 
                                            key={`sheet-${sheetIdx}`} 
                                            className={`quote-a4-sheet${sheetIdx > 0 ? ' quote-a4-sheet--continuation' : ''}`}
                                            onDragOver={handleQuoteSheetSignatureDragOver}
                                            onDrop={handleQuotePreviewSignatureDrop}
                                        >
                                            {/* Repeating Header (Logo) for Print */}
                                            <div className="quote-sheet-logo-row" aria-hidden="true" style={{ width: '100%', marginBottom: '20px' }}>
                                                <div style={{ textAlign: 'right', width: '100%' }}>
                                                    {quoteLogoDisplaySrc ? (
                                                        <img src={quoteLogoDisplaySrc} alt="" style={{ height: '68px', width: 'auto', maxWidth: '212px', objectFit: 'contain' }} />
                                                    ) : null}
                                                </div>
                                            </div>

                                            {/* Page Content */}
                                            <div
                                                className="quote-sheet-main-flex"
                                                style={{
                                                    minHeight: sheetIdx === 0 ? '250mm' : 0,
                                    display: 'flex',
                                    flexDirection: 'column',
                                                }}
                                            >
                                                {sheetIdx === 0 && (
                                                    <div className="header-section quote-header-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0' }}>
                                                        <div className="quote-header-address-col" style={{ width: '50%' }}>
                                                            <div style={{ fontWeight: '600', marginBottom: '8px' }}>To,</div>
                                                            <div style={{ fontWeight: 'bold', fontSize: '14px' }}>
                                                                {quotePreviewToBlockDisplay.toName}
                                                            </div>
                                                            <div style={{ fontSize: '13px', color: '#475569', whiteSpace: 'pre-line' }}>
                                                                {quotePreviewToBlockDisplay.toAddress}
                                                            </div>
                                                            {(quotePreviewToBlockDisplay.toPhone || '').trim() ? (
                                                                <div style={{ fontSize: '13px', color: '#475569', marginTop: '6px' }}>
                                                                    Tel: {quotePreviewToBlockDisplay.toPhone.trim()}
                                                                </div>
                                                            ) : null}
                                                            {(quotePreviewToBlockDisplay.toFax || '').trim() ? (
                                                                <div style={{ fontSize: '13px', color: '#475569' }}>Fax: {quotePreviewToBlockDisplay.toFax.trim()}</div>
                                                            ) : null}
                                                            {(quotePreviewToBlockDisplay.toEmail || '').trim() ? (
                                                                <div style={{ fontSize: '13px', color: '#475569' }}>E-mail: {quotePreviewToBlockDisplay.toEmail.trim()}</div>
                                                            ) : null}
                                            </div>
                                                        <div className="quote-header-quote-col" style={{ width: '45%' }}>
                                                            <div className="quote-header-quote-panel">
                                                                <div className="quote-header-quote-panel-body">
                                                                    <div className="quote-header-quote-panel-row quote-header-quote-panel-row--ref">
                                                                        <span className="quote-header-quote-panel-label">Quote Ref:</span>
                                                                        <span className="quote-header-quote-panel-value">
                                                                            {String(
                                                                                subjobQuoteA4HeaderDisplay
                                                                                    ? subjobQuoteA4HeaderDisplay.quoteNumber
                                                                                    : quoteNumber || ''
                                                                            ).trim() || 'Draft'}
                                                                        </span>
                                                            </div>
                                                                    <div className="quote-header-quote-panel-row">
                                                                        <span className="quote-header-quote-panel-label">Date:</span>
                                                                        <span className="quote-header-quote-panel-value">
                                                                            {subjobQuoteA4HeaderDisplay
                                                                                ? formatQuoteYmdForDisplay(
                                                                                      subjobQuoteA4HeaderDisplay.quoteDateYmd
                                                                                  ) || ''
                                                                                : formatQuoteYmdForDisplay(quoteDate) || ''}
                                                                        </span>
                                                </div>
                                                                    <div className="quote-header-quote-panel-row">
                                                                        <span className="quote-header-quote-panel-label">Prepared By:</span>
                                                                        <span className="quote-header-quote-panel-value">
                                                                            {String(
                                                                                subjobQuoteA4HeaderDisplay
                                                                                    ? subjobQuoteA4HeaderDisplay.preparedBy
                                                                                    : preparedBy || ''
                                                                            ).trim() || '—'}
                                                                        </span>
                                            </div>
                                                                    {subjobQuoteA4HeaderDisplay?.preparedByContact ||
                                                                    quotePreviewPreparedByContactDisplay ? (
                                                                        <div className="quote-header-quote-panel-row">
                                                                            <span className="quote-header-quote-panel-label">Contact:</span>
                                                                            <span className="quote-header-quote-panel-value">
                                                                                {subjobQuoteA4HeaderDisplay?.preparedByContact ||
                                                                                    quotePreviewPreparedByContactDisplay}
                                                                            </span>
                                        </div>
                                                                    ) : null}
                                                                    <div className="quote-header-quote-panel-row">
                                                                        <span className="quote-header-quote-panel-label">Type:</span>
                                                                        <span className="quote-header-quote-panel-value">
                                                                            {subjobQuoteA4HeaderDisplay
                                                                                ? subjobQuoteA4HeaderDisplay.quoteTypeLine
                                                                                : quotePreviewTypeLine}
                                                                        </span>
                                                                    </div>
                                                                    <div className="quote-header-quote-panel-row">
                                                                        <span className="quote-header-quote-panel-label">Your Ref:</span>
                                                                        <span className="quote-header-quote-panel-value">
                                                                            {String(
                                                                                subjobQuoteA4HeaderDisplay
                                                                                    ? subjobQuoteA4HeaderDisplay.customerReference
                                                                                    : customerReference || ''
                                                                            ).trim() || ''}
                                                                        </span>
                                                                    </div>
                                                                    <div className="quote-header-quote-panel-row">
                                                                        <span className="quote-header-quote-panel-label">Validity:</span>
                                                                        <span className="quote-header-quote-panel-value">
                                                                            {subjobQuoteA4HeaderDisplay
                                                                                ? subjobQuoteA4HeaderDisplay.validityDisplay || ''
                                                                                : getValidityDate() || ''}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}

                                                {sheetIdx === 0 ? (
                                                    <hr className="quote-section-rule quote-section-rule--after-header" aria-hidden="true" />
                                                ) : null}

                                                <div
                                                    className="content-section"
                                                    style={{
                                                        flex: sheetIdx === 0 ? 1 : '0 1 auto',
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        minHeight: 0,
                                                    }}
                                                >
                                                    {sheetIdx === 0 && (
                                                        <div className="quote-cover-first-page">
                                                            <table className="quote-cover-meta-table" role="presentation">
                                            <tbody>
                                                                    <tr className="quote-cover-meta-row-project">
                                                                        <td>Project Name:</td>
                                                                        <td>{String(quotePreviewProjectName || '').trim() || '—'}</td>
                                                </tr>
                                                <tr>
                                                                        <td>Subject:</td>
                                                                        <td>
                                                                            {String(
                                                                                subjobQuoteA4HeaderDisplay
                                                                                    ? subjobQuoteA4HeaderDisplay.subject ||
                                                                                          ''
                                                                                    : quotePreviewSubject || ''
                                                                            ).trim() || '—'}
                                                                        </td>
                                                </tr>
                                                <tr>
                                                                        <td>Attention of:</td>
                                                                        <td>
                                                                            {String(
                                                                                subjobQuoteA4HeaderDisplay
                                                                                    ? subjobQuoteA4HeaderDisplay.toAttention
                                                                                    : toAttention || ''
                                                                            ).trim() || '—'}
                                                                        </td>
                                                </tr>
                                            </tbody>
                                        </table>
                                                            <hr className="quote-section-rule quote-section-rule--before-cover-letter" aria-hidden="true" />
                                                            <div className="quote-cover-letter">
                                            <p>Dear Sir/Madam,</p>
                                                                <p>
                                                                    Thank you for providing us with this opportunity to submit our
                                                                    offer for the below-mentioned inclusions. We have carefully
                                                                    reviewed your requirements to ensure that our proposal aligns
                                                                    perfectly. We are pleased to submit our quotation as per the
                                                                    details mentioned below. It is our pleasure to serve you and we
                                                                    assure you that our best efforts will always be made to meet your
                                                                    needs.
                                                                </p>
                                                                <p>
                                                                    We hope you will find our offer competitive and kindly revert to
                                                                    us for any clarifications.
                                                                </p>
                                        </div>
                                                        </div>
                                                    )}

                                                    {sheet.clauses.map((clause) => {
                                                        const globalIdx = activeClausesList.findIndex((c) => c.listKey === clause.listKey);
                                                        const displayMajor = globalIdx >= 0 ? globalIdx + 1 : 1;
                                                        const bodyHtml = getClauseDisplayBodyHtml(
                                                            clause.content,
                                                            clause.listKey,
                                                            displayMajor
                                                        );
                                                        return (
                                                            <div key={clause.key} className="quote-clause-block" style={{ marginBottom: '20px' }}>
                                                                <h3 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '8px' }}>
                                                                    {displayMajor}. {clause.title}
                                                                </h3>
                                                                <div
                                                                    className="clause-content"
                                                                    style={{ fontSize: '13px', lineHeight: '1.6' }}
                                                                    dangerouslySetInnerHTML={{ __html: bodyHtml }}
                                                                />
                                                            </div>
                                                        );
                                                    })}

                                                    {sheetIdx === 0 ? (
                                                        <>
                                                            <div className="quote-cover-page1-spacer" aria-hidden="true" />
                                                            <div className="quote-cover-sign-off">
                                                                <p className="quote-cover-sign-off-for">For {quoteCoverOfferCompanyName},</p>
                                                                <div className="quote-cover-signatory-line">
                                                                    {String(
                                                                        subjobQuoteA4HeaderDisplay
                                                                            ? subjobQuoteA4HeaderDisplay.signatory
                                                                            : signatory || ''
                                                                    ).trim() || 'N/A'}
                                                                </div>
                                                                {String(
                                                                    subjobQuoteA4HeaderDisplay
                                                                        ? subjobQuoteA4HeaderDisplay.signatoryDesignation
                                                                        : signatoryDesignation || ''
                                                                ).trim() ? (
                                                                    <div className="quote-cover-signatory-designation">
                                                                        {String(
                                                                            subjobQuoteA4HeaderDisplay
                                                                                ? subjobQuoteA4HeaderDisplay.signatoryDesignation
                                                                                : signatoryDesignation
                                                                        ).trim()}
                                                                    </div>
                                                                ) : null}
                                                            </div>
                                                        </>
                                                    ) : null}
                                        </div>

                                                <div className="footer-section" style={{ marginTop: 'auto', paddingTop: '20px' }}>
                                                     <div className="quote-print-page-indicator" style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>
                                                         Page {sheetIdx + 1} of {sheets.length}
                                                     </div>
                                                     <hr className="quote-section-rule" style={{ marginTop: '8px', marginBottom: '10px' }} aria-hidden="true" />
                                                     <div className="quote-print-footer-wrap">
                                                         <div
                                                             className="quote-print-footer-company"
                                                             style={{
                                                                 fontSize: '11px',
                                                                 color: '#64748b',
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
                                                </div>
                                            </div>

                                            {/* Digital Stamps (parent tab includes subjob signatures as read-only overlays) */}
                                            {quotePreviewDigitalStamps
                                                .filter((s) => s.sheetIndex === sheetIdx + 1)
                                                .map((stamp) => (
                                                    <QuoteSignatureStamp
                                                        key={stamp.id}
                                                        stamp={stamp}
                                                        onRemove={handleRemoveDigitalStamp}
                                                        onMove={handleMoveDigitalStamp}
                                                        allowRemove={
                                                            !stamp.inheritedFromSubJob &&
                                                            stamp.removableBeforeNextCommit === true
                                                        }
                                                    />
                                                ))}
                                        </div>
                                    ))}
                                 </div>
                            </div>
                        </div>
                                </>
                            )}
                        </div>
                )}
            </div>
            </div>

            <SignatureVaultModal
                open={signatureVaultOpen}
                onClose={() => setSignatureVaultOpen(false)}
                userEmail={(currentUser?.EmailId || currentUser?.email || '').trim()}
                placementEnabled
                totalSheets={quotePreviewTotalPages}
                onPlaceStamp={handlePlaceDigitalStamp}
                displayName={digitalStampUserDisplayName}
                designation={digitalStampUserDesignation}
            />

            {/* Email Compose Modal */}
            {showEmailModal && (
                <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1060 }}>
                    <div className="modal-dialog modal-lg modal-dialog-centered">
                        <div className="modal-content border-0 shadow-lg">
                            <div className="modal-header bg-primary text-white">
                                <h5 className="modal-title d-flex align-items-center">
                                    <i className="bi bi-envelope-paper-fill me-2"></i>
                                    Draft Quote Email
                                </h5>
                                <button type="button" className="btn-close btn-close-white" onClick={() => setShowEmailModal(false)}></button>
                            </div>
                            <div className="modal-body p-4">
                                <div className="mb-4">
                                    <label className="form-label fw-bold text-muted small text-uppercase">Recipient</label>
                                    <div className="input-group">
                                        <span className="input-group-text bg-light border-end-0"><i className="bi bi-person-fill text-primary"></i></span>
                                        <input
                                            type="email"
                                            className="form-control border-start-0 ps-0"
                                            placeholder="recipient@example.com"
                                            value={emailDetails.to}
                                            onChange={(e) => setEmailDetails({ ...emailDetails, to: e.target.value })}
                                                />
                                            </div>
                                </div>
                                <div className="mb-4">
                                    <label className="form-label fw-bold text-muted small text-uppercase">Subject</label>
                                    <div className="input-group">
                                        <span className="input-group-text bg-light border-end-0"><i className="bi bi-type text-primary"></i></span>
                                        <input
                                            type="text"
                                            className="form-control border-start-0 ps-0"
                                            placeholder="Email subject..."
                                            value={emailDetails.subject}
                                            readOnly={emailDetails.isDefault}
                                            onChange={(e) => setEmailDetails({ ...emailDetails, subject: e.target.value })}
                                        />
                                    </div>
                                </div>
                                <div className="mb-4">
                                    <label className="form-label fw-bold text-muted small text-uppercase">Message (Optional)</label>
                                    <textarea
                                        className="form-control"
                                        rows={4}
                                        placeholder="Add a personal message to the recipient..."
                                        value={emailDetails.body}
                                        onChange={(e) => setEmailDetails({ ...emailDetails, body: e.target.value })}
                                    ></textarea>
                                </div>
                                <div className="p-3 bg-light rounded-3 border d-flex align-items-center flex-wrap gap-2">
                                    <div className="bg-white p-2 rounded shadow-sm">
                                        <i className="bi bi-file-earmark-pdf-fill text-danger fs-4"></i>
                                    </div>
                                    <div className="flex-grow-1" style={{ minWidth: '140px' }}>
                                        <div className="text-success small fw-bold">
                                            <i className="bi bi-check-circle-fill me-1"></i>
                                            Ready
                                        </div>
                                        {emailDetails.pdfName ? (
                                            <div className="text-muted small text-truncate" title={emailDetails.pdfName}>
                                                {emailDetails.pdfName}
                                            </div>
                                        ) : null}
                                    </div>
                                    <button
                                        type="button"
                                        className="btn btn-outline-primary btn-sm ms-sm-auto"
                                        onClick={handlePreviewQuotePdf}
                                        disabled={!emailDetails.pdfBlob}
                                    >
                                        <i className="bi bi-eye me-1"></i>
                                        Preview
                                    </button>
                                </div>
                            </div>
                            <div className="modal-footer bg-light border-0 px-4 pb-4">
                                <button
                                    type="button"
                                    className="btn btn-outline-secondary me-auto"
                                    onClick={handleOpenInOutlook}
                                    disabled={emailSending}
                                    title="Opens your mail app with subject and message. The PDF is saved to Downloads so you can attach it (browsers cannot attach files via mail links)."
                                >
                                    <i className="bi bi-microsoft me-2"></i>
                                    Open in Outlook
                                </button>
                                
                                <button
                                    type="button"
                                    className="btn btn-light"
                                    onClick={() => setShowEmailModal(false)}
                                    disabled={emailSending}
                                >
                                    Cancel
                                </button>
                                
                                <button
                                    type="button"
                                    className="btn btn-primary px-4 shadow"
                                    onClick={handleSendEmailViaApi}
                                    disabled={emailSending || !emailDetails.to}
                                >
                                    {emailSending ? (
                                         <>
                                             <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                                             Sending...
                                         </>
                                     ) : (
                                         <>
                                             <i className="bi bi-send-fill me-2"></i>
                                             Send Quote
                                         </>
                                     )}
                                 </button>
                                    </div>
                                </div>
                            </div>
                </div>
            )}
                        </>
    );
};

export default QuoteForm;

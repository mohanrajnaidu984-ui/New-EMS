/**
 * Split clause HTML into measurable segments and pack them across A4 continuation sheets.
 * Tables split by row with repeated <thead>; lists may split by <li> when long.
 */

/** @typedef {{ clauseIdx: number, clause: object, html: string, showHeading: boolean, displayMajor: number, key: string }} ClauseSegment */

const EMS_AUTO_PRICE_SUMMARY_TABLE_ID = 'ems-auto-price-summary-table';
/** Tables with at most this many body rows stay on one segment (e.g. division + grand total). */
const TABLE_KEEP_WHOLE_MAX_ROWS = 8;

/**
 * @param {string} html
 * @returns {string[]}
 */
export function splitClauseHtmlToSegments(html) {
    const raw = String(html || '').trim();
    if (!raw) return [''];

    if (typeof DOMParser === 'undefined') return [raw];

    const doc = new DOMParser().parseFromString(`<div id="ems-clause-root">${raw}</div>`, 'text/html');
    const root = doc.getElementById('ems-clause-root');
    if (!root) return [raw];

    /** @type {string[]} */
    const segments = [];

    const push = (h) => {
        const t = String(h || '').trim();
        if (t) segments.push(t);
    };

    /**
     * @param {HTMLTableElement} table
     */
    const splitTable = (table) => {
        const tableAttrs = [...table.attributes]
            .map((a) => `${a.name}="${String(a.value).replace(/"/g, '&quot;')}"`)
            .join(' ');
        const open = tableAttrs ? `<table ${tableAttrs}>` : '<table>';

        let theadHtml = '';
        const thead = table.querySelector('thead');
        if (thead) {
            theadHtml = thead.outerHTML;
        } else {
            const firstTr = table.querySelector('tbody tr, tr');
            if (firstTr && firstTr.querySelector('th')) {
                theadHtml = `<thead>${firstTr.outerHTML}</thead>`;
            }
        }

        const bodyRows = [...table.querySelectorAll('tbody tr')];
        const allRows =
            bodyRows.length > 0
                ? bodyRows
                : [...table.querySelectorAll('tr')].filter((tr) => {
                      if (theadHtml && tr.querySelector('th')) return false;
                      return true;
                  });

        if (!allRows.length) {
            push(table.outerHTML);
            return;
        }

        const tableId = String(table.id || table.getAttribute('id') || '').trim();
        const keepWhole =
            tableId === EMS_AUTO_PRICE_SUMMARY_TABLE_ID || allRows.length <= TABLE_KEEP_WHOLE_MAX_ROWS;

        if (keepWhole) {
            push(table.outerHTML);
            return;
        }

        for (const row of allRows) {
            push(`${open}${theadHtml}<tbody>${row.outerHTML}</tbody></table>`);
        }
    };

    /**
     * @param {Element} el
     */
    const splitList = (el) => {
        const tag = el.tagName.toLowerCase();
        /* Never split <ol> — one-item lists each restart at 1 in preview/PDF. */
        if (tag === 'ol') {
            push(el.outerHTML);
            return;
        }
        const items = [...el.children].filter((c) => c.tagName === 'LI');
        if (items.length > 4) {
            const attrs = [...el.attributes]
                .map((a) => ` ${a.name}="${String(a.value).replace(/"/g, '&quot;')}"`)
                .join('');
            for (const li of items) {
                push(`<${tag}${attrs}>${li.outerHTML}</${tag}>`);
            }
        } else {
            push(el.outerHTML);
        }
    };

    const nodes = [...root.childNodes].filter((n) => {
        if (n.nodeType === Node.TEXT_NODE) return Boolean(String(n.textContent || '').trim());
        return n.nodeType === Node.ELEMENT_NODE;
    });

    if (!nodes.length) {
        push(raw);
        return segments.length ? segments : [raw];
    }

    for (const node of nodes) {
        if (node.nodeType === Node.TEXT_NODE) {
            const t = String(node.textContent || '').trim();
            if (t) push(`<p>${t}</p>`);
            continue;
        }
        const el = /** @type {Element} */ (node);
        const tag = el.tagName;
        if (tag === 'TABLE') {
            splitTable(/** @type {HTMLTableElement} */ (el));
        } else if (tag === 'UL' || tag === 'OL') {
            splitList(el);
        } else if (tag === 'P' || tag === 'DIV') {
            const inner = el.innerHTML;
            if (/<br\s*\/?>/i.test(inner)) {
                const parts = inner.split(/<br\s*\/?>/gi).map((p) => p.trim()).filter(Boolean);
                if (parts.length > 1) {
                    const tagName = tag.toLowerCase();
                    for (const part of parts) {
                        push(`<${tagName}>${part}</${tagName}>`);
                    }
                    continue;
                }
            }
            push(el.outerHTML);
        } else {
            push(el.outerHTML);
        }
    }

    return segments.length ? segments : [raw];
}

/**
 * @param {Array<{ clause: object, content: string, listKey: string }>} activeClausesList
 * @param {(html: string, listKey: string, displayMajor: number) => string} formatBodyHtml
 * @returns {ClauseSegment[]}
 */
export function buildClauseSegmentsForPagination(activeClausesList, formatBodyHtml) {
    /** @type {ClauseSegment[]} */
    const out = [];
    activeClausesList.forEach((clause, clauseIdx) => {
        const displayMajor = clauseIdx + 1;
        const bodyHtml = formatBodyHtml(clause.content, clause.listKey, displayMajor);
        const parts = splitClauseHtmlToSegments(bodyHtml);
        parts.forEach((html, partIdx) => {
            const key = `${clause.listKey ?? clause.key ?? clause.id ?? clauseIdx}-${partIdx}`;
            out.push({
                clauseIdx,
                clause,
                html,
                showHeading: partIdx === 0,
                displayMajor,
                key,
            });
        });
    });
    return out;
}

/**
 * Merge consecutive segments from the same clause on one sheet into render blocks.
 * @param {number[]} segmentIndices global segment indices for this sheet
 * @param {ClauseSegment[]} segments
 */
export function mergeSegmentsIntoSheetBlocks(segmentIndices, segments) {
    /** @type {Array<{ clause: object, bodyHtml: string, showHeading: boolean, displayMajor: number, listKey: string }>} */
    const blocks = [];
    let curClauseIdx = -1;
    let acc = '';
    /** @type {ClauseSegment | null} */
    let head = null;

    const flush = () => {
        if (!head) return;
        blocks.push({
            clause: head.clause,
            bodyHtml: acc,
            showHeading: Boolean(head.showHeading),
            displayMajor: head.displayMajor,
            listKey: head.clause.listKey ?? head.clause.key ?? head.clause.id,
        });
        curClauseIdx = -1;
        acc = '';
        head = null;
    };

    for (const si of segmentIndices) {
        const seg = segments[si];
        if (!seg) continue;
        if (seg.clauseIdx !== curClauseIdx) {
            flush();
            curClauseIdx = seg.clauseIdx;
            head = seg;
            acc = seg.html;
        } else {
            acc += seg.html;
        }
    }
    flush();
    return blocks;
}

/**
 * @param {number[][]} groups
 * @param {number[][]} other
 */
/**
 * Pack segment indices using merged block heights (matches on-sheet render, not sum of parts).
 * @param {number[]} indices
 * @param {(groupIndices: number[]) => number} measureMergedGroupPx
 * @param {number} usablePx
 */
export function packSegmentIndicesByMergedHeight(indices, measureMergedGroupPx, usablePx) {
    if (!indices?.length) return [];
    const usable = Math.max(usablePx, 240);
    const packFudgePx = Math.min(28, Math.round(usable * 0.025));
    const pages = [];
    let cur = [];

    for (const i of indices) {
        const tryGroup = [...cur, i];
        const h = Math.max(measureMergedGroupPx(tryGroup) || 0, 1);
        if (cur.length > 0 && h > usable + packFudgePx) {
            pages.push(cur);
            cur = [i];
        } else {
            cur = tryGroup;
        }
    }
    if (cur.length) pages.push(cur);
    return pages;
}

/**
 * Pull leading segments from page i onto i-1 when the merged group still fits.
 * @param {number[][]} groups
 * @param {(groupIndices: number[]) => number} measureMergedGroupPx
 * @param {number} usablePx
 */
export function rebalanceSegmentPageGroups(groups, measureMergedGroupPx, usablePx) {
    if (!groups || groups.length < 2) return groups || [];
    const slackPx = Math.min(40, Math.round(usablePx * 0.04));
    const cap = Math.max(usablePx + slackPx, 300);
    let out = groups.map((g) => [...g]).filter((g) => g.length > 0);
    if (out.length < 2) return out;

    for (let pass = 0; pass < 8; pass++) {
        let moved = false;
        for (let pi = 1; pi < out.length; pi++) {
            let safety = 0;
            while (out[pi].length && safety < 64) {
                safety += 1;
                const moveIdx = out[pi][0];
                const merged = [...out[pi - 1], moveIdx];
                if (measureMergedGroupPx(merged) <= cap) {
                    out[pi - 1].push(out[pi].shift());
                    moved = true;
                } else {
                    break;
                }
            }
        }
        out = out.filter((g) => g.length > 0);
        if (!moved || out.length < 2) break;
    }
    return out.filter((g) => g.length > 0);
}

export function segmentPageGroupsEqual(groups, other) {
    if (groups === other) return true;
    if (!groups || !other || groups.length !== other.length) return false;
    for (let i = 0; i < groups.length; i++) {
        const a = groups[i];
        const b = other[i];
        if (a.length !== b.length) return false;
        for (let j = 0; j < a.length; j++) {
            if (a[j] !== b[j]) return false;
        }
    }
    return true;
}

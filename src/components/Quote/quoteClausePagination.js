/**
 * Split clause HTML into measurable segments and pack them across A4 continuation sheets.
 * User HTML is never restructured (no paragraph→table conversion, no cell splitting).
 * Large tables may be split one <tr> per segment for height packing only; segments are rejoined on render.
 */

/** @typedef {{ clauseIdx: number, clause: object, html: string, showHeading: boolean, displayMajor: number, key: string }} ClauseSegment */

const EMS_AUTO_PRICE_SUMMARY_TABLE_ID = 'ems-auto-price-summary-table';

/** Extra px reserved so packed content never overlaps continuation logo/footer (PDF uses 13px/1.45 vs editor 12px). */
const PACK_HEIGHT_SAFETY_PX = 52;

export function segmentHtmlContainsTable(html) {
    return /<table\b/i.test(String(html || ''));
}

/**
 * BOQ rows with many stacked <p>/<div> in one cell are split into one <tr> per block so pagination can pack by height.
 * @param {HTMLTableRowElement} row
 * @returns {HTMLTableRowElement[]}
 */
function expandTableRowForPagination(row) {
    if (!row?.cells?.length) return [row];
    const cells = [...row.cells];
    let targetIdx = -1;
    let maxBlocks = 0;
    for (let i = 0; i < cells.length; i += 1) {
        const blocks = [...cells[i].children].filter(
            (c) =>
                c.nodeType === Node.ELEMENT_NODE &&
                /^(P|DIV|UL|OL|LI|H[1-6])$/i.test(c.tagName)
        );
        if (blocks.length > maxBlocks) {
            maxBlocks = blocks.length;
            targetIdx = i;
        }
    }
    if (targetIdx < 0 || maxBlocks <= 1) return [row];

    const targetCell = cells[targetIdx];
    const blocks = [...targetCell.children].filter(
        (c) =>
            c.nodeType === Node.ELEMENT_NODE &&
            /^(P|DIV|UL|OL|LI|H[1-6])$/i.test(c.tagName)
    );
    if (blocks.length <= 1) return [row];

    /** @type {HTMLTableRowElement[]} */
    const out = [];
    blocks.forEach((block, blockIdx) => {
        const tr = /** @type {HTMLTableRowElement} */ (row.cloneNode(true));
        const clonedCells = [...tr.cells];
        const cell = clonedCells[targetIdx];
        if (!cell) return;
        cell.innerHTML = block.outerHTML;
        if (blockIdx > 0) {
            for (let i = 0; i < targetIdx; i += 1) {
                const c = clonedCells[i];
                if (String(c.textContent || '').trim()) c.textContent = '';
            }
        }
        out.push(tr);
    });
    return out.length ? out : [row];
}

/**
 * Split one HTML table into one segment per body row (never recurses — safe for fallback passes).
 * @param {HTMLTableElement} table
 * @returns {string[]}
 */
function splitTableToRowSegmentHtml(table) {
    const tableAttrs = [...table.attributes]
        .map((a) => `${a.name}="${String(a.value).replace(/"/g, '&quot;')}"`)
        .join(' ');

    let theadHtml = '';
    /** @type {HTMLTableRowElement | null} */
    let headerRowPromotedToThead = null;
    const thead = table.querySelector('thead');
    if (thead) {
        theadHtml = thead.outerHTML;
    } else {
        const firstTr = table.querySelector('tbody tr, tr');
        if (firstTr && firstTr.querySelector('th')) {
            theadHtml = `<thead>${firstTr.outerHTML}</thead>`;
            headerRowPromotedToThead = /** @type {HTMLTableRowElement} */ (firstTr);
        }
    }

    const bodyRows = [...table.querySelectorAll('tbody tr')].filter(
        (tr) => tr !== headerRowPromotedToThead
    );
    const allRows =
        bodyRows.length > 0
            ? bodyRows
            : [...table.querySelectorAll('tr')].filter((tr) => {
                  if (tr === headerRowPromotedToThead) return false;
                  if (theadHtml && tr.querySelector('th')) return false;
                  return true;
              });

    if (!allRows.length) return [table.outerHTML];

    const tableId = String(table.id || table.getAttribute('id') || '').trim();
    const keepWhole =
        tableId === EMS_AUTO_PRICE_SUMMARY_TABLE_ID && allRows.length <= 12;
    if (keepWhole) return [table.outerHTML];

    const splitId = `ems-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const splitOpen = tableAttrs
        ? `<table ${tableAttrs} data-ems-table-split="1" data-ems-split-id="${splitId}">`
        : `<table data-ems-table-split="1" data-ems-split-id="${splitId}">`;

    /** @type {string[]} */
    const out = [];
    for (const row of allRows) {
        for (const rowPart of expandTableRowForPagination(row)) {
            out.push(`${splitOpen}${theadHtml}<tbody>${rowPart.outerHTML}</tbody></table>`);
        }
    }
    return out.length ? out : [table.outerHTML];
}

/**
 * When the DOM walk left one blob with a multi-row table, split that table inline (no recursion).
 * @param {string[]} segments
 * @returns {string[]}
 */
function ensureMultiRowTablesSplit(segments) {
    if (!segments?.length || segments.length > 1) return segments || [];
    const only = String(segments[0] || '').trim();
    if (!segmentHtmlContainsTable(only) || typeof DOMParser === 'undefined') return segments;

    const doc = new DOMParser().parseFromString(`<div id="ems-clause-root">${only}</div>`, 'text/html');
    const root = doc.getElementById('ems-clause-root');
    if (!root) return segments;

    const tables = [...root.querySelectorAll('table')];
    if (tables.length !== 1) return segments;

    const table = /** @type {HTMLTableElement} */ (tables[0]);
    const rowCount = table.querySelectorAll('tbody tr, tr').length;
    if (rowCount < 4) return segments;

    const rowSegments = splitTableToRowSegmentHtml(table);
    if (rowSegments.length <= 1) return segments;

    const tableHtml = table.outerHTML;
    const idx = only.indexOf(tableHtml);
    if (idx < 0) return rowSegments;

    /** @type {string[]} */
    const out = [];
    const before = only.slice(0, idx).trim();
    const after = only.slice(idx + tableHtml.length).trim();
    if (before) out.push(before);
    out.push(...rowSegments);
    if (after) out.push(after);
    return out.length ? out : rowSegments;
}

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

    const splitTable = (table) => {
        for (const part of splitTableToRowSegmentHtml(/** @type {HTMLTableElement} */ (table))) {
            push(part);
        }
    };

    const processElement = (el) => {
        const tag = el.tagName;
        if (tag === 'TABLE') {
            splitTable(/** @type {HTMLTableElement} */ (el));
            return;
        }
        if (tag === 'DIV' || tag === 'FIGURE' || tag === 'SECTION' || tag === 'ARTICLE') {
            const blockChildren = [...el.children].filter((c) => c.nodeType === Node.ELEMENT_NODE);
            if (blockChildren.length > 0) {
                blockChildren.forEach((child) => processElement(/** @type {Element} */ (child)));
                return;
            }
        }
        push(el.outerHTML);
    };

    const nodes = [...root.childNodes].filter((n) => {
        if (n.nodeType === Node.TEXT_NODE) return Boolean(String(n.textContent || '').trim());
        return n.nodeType === Node.ELEMENT_NODE;
    });

    if (!nodes.length) {
        push(raw);
        return ensureMultiRowTablesSplit(segments.length ? segments : [raw]);
    }

    for (const node of nodes) {
        if (node.nodeType === Node.TEXT_NODE) {
            const t = String(node.textContent || '').trim();
            if (t) push(`<p>${t}</p>`);
            continue;
        }
        processElement(/** @type {Element} */ (node));
    }

    const out = segments.length ? segments : [raw];
    return ensureMultiRowTablesSplit(out);
}

const TABLE_SIG_ATTR_SEP = '\u0001';
const TABLE_SIG_HEAD_SEP = '\u0002';

function tableSplitSignature(table) {
    const splitId = table.getAttribute('data-ems-split-id');
    if (splitId) return `id:${splitId}`;
    const parts = [];
    for (const attr of table.attributes) {
        if (attr.name === 'data-ems-table-split' || attr.name === 'data-ems-split-id') continue;
        parts.push(`${attr.name}${TABLE_SIG_ATTR_SEP}${attr.value}`);
    }
    parts.sort();
    const thead = table.querySelector('thead');
    return `${parts.join(TABLE_SIG_ATTR_SEP)}${TABLE_SIG_HEAD_SEP}${
        thead ? thead.outerHTML : ''
    }`;
}

/** Pass-through: preview/PDF must mirror editor HTML (no table restructuring). */
export function normalizeClauseTableHtml(html) {
    return String(html || '').trim();
}

function getSplitTableBodyRows(table) {
    const tbody = table.querySelector('tbody');
    if (tbody) return [...tbody.querySelectorAll(':scope > tr')];
    return [...table.querySelectorAll(':scope > tr')].filter((tr) => !tr.closest('thead'));
}

/**
 * Build one merged table from a template + collected body rows.
 * @param {Document} doc
 * @param {HTMLTableElement} template
 * @param {HTMLTableRowElement[]} rows
 */
function buildRejoinedTableOuterHtml(doc, template, rows) {
    const table = /** @type {HTMLTableElement} */ (template.cloneNode(true));
    table.removeAttribute('data-ems-table-split');
    table.removeAttribute('data-ems-split-id');
    table.querySelectorAll('tbody').forEach((tb) => tb.remove());
    const tbody = doc.createElement('tbody');
    rows.forEach((tr) => tbody.appendChild(tr.cloneNode(true)));
    const thead = table.querySelector('thead');
    if (thead) thead.after(tbody);
    else table.appendChild(tbody);
    return table.outerHTML;
}

/**
 * Pagination splits large tables one row per segment; merge those fragments back into
 * a single table for preview/PDF without changing cell content or structure.
 *
 * Uses split-id grouping over the whole subtree so prose/wrappers between row fragments
 * cannot prevent rejoin (fixes stacked mini-tables when a prior clause is long).
 * @param {string} html
 */
export function rejoinSplitTableHtml(html) {
    const raw = String(html || '').trim();
    if (!raw.includes('<table') || !raw.includes('data-ems-table-split')) return raw;
    if (typeof DOMParser === 'undefined') return raw;

    const doc = new DOMParser().parseFromString(
        `<div id="ems-rejoin-root">${raw}</div>`,
        'text/html'
    );
    const root = doc.getElementById('ems-rejoin-root');
    if (!root) return raw;

    const splitTables = [...root.querySelectorAll('table[data-ems-table-split="1"]')];
    if (splitTables.length === 0) return raw;
    if (splitTables.length === 1) {
        const only = /** @type {HTMLTableElement} */ (splitTables[0]);
        const rows = getSplitTableBodyRows(only);
        return buildRejoinedTableOuterHtml(doc, only, rows);
    }

    /** @type {Map<string, { template: HTMLTableElement, rows: HTMLTableRowElement[], tables: HTMLTableElement[] }>} */
    const groups = new Map();
    /** @type {string[]} */
    const groupOrder = [];

    for (const table of splitTables) {
        const t = /** @type {HTMLTableElement} */ (table);
        const splitId = t.getAttribute('data-ems-split-id') || tableSplitSignature(t);
        if (!groups.has(splitId)) {
            groups.set(splitId, { template: t, rows: [], tables: [] });
            groupOrder.push(splitId);
        }
        const group = groups.get(splitId);
        group.rows.push(...getSplitTableBodyRows(t));
        group.tables.push(t);
    }

    for (const splitId of groupOrder) {
        const group = groups.get(splitId);
        if (!group?.rows.length || !group.tables.length) continue;

        const first = group.tables[0];
        const mergedHtml = buildRejoinedTableOuterHtml(doc, group.template, group.rows);
        const holder = doc.createElement('div');
        holder.innerHTML = mergedHtml;
        const mergedTable = holder.querySelector('table');
        if (!mergedTable) continue;

        first.replaceWith(mergedTable);
        group.tables.slice(1).forEach((tb) => tb.remove());
    }

    return root.innerHTML.trim() || raw;
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
        const joined = String(acc || '').trim();
        blocks.push({
            clause: head.clause,
            bodyHtml: rejoinSplitTableHtml(joined),
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
            acc += String(seg.html || '');
        }
    }
    flush();
    return blocks;
}

/**
 * Pack segment indices using merged block heights (matches on-sheet render, not sum of parts).
 * @param {number[]} indices
 * @param {(groupIndices: number[]) => number} measureMergedGroupPx
 * @param {number} usablePx
 */
export function packSegmentIndicesByMergedHeight(indices, measureMergedGroupPx, usablePx) {
    if (!indices?.length) return [];
    const usable = Math.max(usablePx - PACK_HEIGHT_SAFETY_PX, 200);
    const pages = [];
    let cur = [];

    for (const i of indices) {
        const tryGroup = [...cur, i];
        const h = Math.max(measureMergedGroupPx(tryGroup) || 0, 1);
        if (cur.length > 0 && h > usable) {
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
 * If a page group is only prose (e.g. BOQ intro) and the next group starts the table, merge forward
 * so the intro is not stranded on an otherwise empty sheet.
 * @param {number[][]} groups
 * @param {ClauseSegment[]} segments
 */
export function mergeIntroOnlyGroupsForward(groups, segments) {
    if (!groups?.length || groups.length < 2) return groups;
    const out = [];
    let i = 0;
    while (i < groups.length) {
        const g = groups[i];
        const onlyProse =
            g.length > 0 &&
            g.every((idx) => {
                const seg = segments[idx];
                return seg && !segmentHtmlContainsTable(seg.html);
            });
        const next = groups[i + 1];
        const nextHasTable =
            next?.length &&
            next.some((idx) => {
                const seg = segments[idx];
                return seg && segmentHtmlContainsTable(seg.html);
            });
        if (onlyProse && nextHasTable) {
            out.push([...g, ...next]);
            i += 2;
        } else {
            out.push(g);
            i += 1;
        }
    }
    return out.length ? out : groups;
}

/**
 * Greedy height split for one packed group (used when merged block still exceeds printable height).
 * @param {number[]} group
 * @param {(groupIndices: number[]) => number} measureMergedGroupPx
 * @param {number} usable
 * @returns {number[][]}
 */
function splitSegmentGroupByMergedHeight(group, measureMergedGroupPx, usable) {
    if (!group?.length) return [];
    if (group.length <= 1) return [group];
    /** @type {number[][]} */
    const pages = [];
    let cur = [];
    for (const idx of group) {
        const tryGroup = [...cur, idx];
        const h = Math.max(measureMergedGroupPx(tryGroup) || 0, 1);
        if (cur.length > 0 && h > usable) {
            pages.push(cur);
            cur = [idx];
        } else {
            cur = tryGroup;
        }
    }
    if (cur.length) pages.push(cur);
    return pages.length ? pages : [group];
}

/**
 * Split any group still taller than the printable area until every group fits or is a single segment.
 * @param {number[][]} groups
 * @param {(groupIndices: number[]) => number} measureMergedGroupPx
 * @param {number} usablePx
 */
export function rebalanceSegmentPageGroups(groups, measureMergedGroupPx, usablePx) {
    if (!groups?.length) return groups;
    const usable = Math.max(usablePx - PACK_HEIGHT_SAFETY_PX, 200);
    let pending = groups.map((g) => [...g]);
    for (let pass = 0; pass < 48; pass += 1) {
        /** @type {number[][]} */
        const next = [];
        let splitAny = false;
        for (const group of pending) {
            if (!group?.length) continue;
            const h = measureMergedGroupPx(group);
            if (h <= usable) {
                next.push(group);
                continue;
            }
            if (group.length <= 1) {
                next.push(group);
                continue;
            }
            const parts = splitSegmentGroupByMergedHeight(group, measureMergedGroupPx, usable);
            if (parts.length <= 1 && parts[0]?.length === group.length) {
                const mid = Math.ceil(group.length / 2);
                next.push(group.slice(0, mid), group.slice(mid));
            } else {
                parts.forEach((p) => next.push(p));
            }
            splitAny = true;
        }
        pending = next;
        if (!splitAny) break;
    }
    return pending.length ? pending : groups;
}

/**
 * Ensure every segment index appears once and no packed group exceeds printable height.
 * @param {number[][]} groups
 * @param {number[]} indices
 * @param {(groupIndices: number[]) => number} measureMergedGroupPx
 * @param {number} usablePx
 */
export function enforcePackedSegmentGroups(groups, indices, measureMergedGroupPx, usablePx) {
    const usable = Math.max(usablePx - PACK_HEIGHT_SAFETY_PX, 200);
    const want = indices?.length ? [...indices] : [];
    const seen = new Set();
    /** @type {number[][]} */
    let result = (groups || []).map((g) => [...g]).filter((g) => g?.length);

    for (const group of result) {
        for (const idx of group) seen.add(idx);
    }
    for (const idx of want) {
        if (!seen.has(idx)) {
            result.push([idx]);
            seen.add(idx);
        }
    }

    for (let pass = 0; pass < 64; pass += 1) {
        /** @type {number[][]} */
        const next = [];
        let changed = false;
        for (const group of result) {
            if (!group?.length) continue;
            const h = measureMergedGroupPx(group);
            if (h <= usable || group.length <= 1) {
                next.push(group);
                continue;
            }
            const parts = splitSegmentGroupByMergedHeight(group, measureMergedGroupPx, usable);
            if (parts.length > 1) {
                parts.forEach((p) => next.push(p));
                changed = true;
            } else {
                const mid = Math.ceil(group.length / 2);
                if (mid > 0 && mid < group.length) {
                    next.push(group.slice(0, mid), group.slice(mid));
                    changed = true;
                } else {
                    next.push(group);
                }
            }
        }
        result = next;
        if (!changed) break;
    }
    return result.length ? result : groups;
}

/**
 * Pack clause segments onto continuation sheets and balance until content fits printable height.
 * @param {number[]} indices
 * @param {(groupIndices: number[]) => number} measureMergedGroupPx
 * @param {number} usablePx
 * @param {ClauseSegment[]} segments
 */
export function packClauseSegmentsForContinuationPages(
    indices,
    measureMergedGroupPx,
    usablePx,
    segments
) {
    let groups = packSegmentIndicesByMergedHeight(indices, measureMergedGroupPx, usablePx);
    groups = mergeIntroOnlyGroupsForward(groups, segments);
    groups = rebalanceSegmentPageGroups(groups, measureMergedGroupPx, usablePx);
    return enforcePackedSegmentGroups(groups, indices, measureMergedGroupPx, usablePx);
}

/**
 * @param {number[][]} groups
 * @param {number[][]} other
 */
export function segmentPageGroupsEqual(groups, other) {
    if (groups === other) return true;
    if (!groups || !other || groups.length !== other.length) return false;
    return groups.every((g, i) => {
        const o = other[i];
        if (!g || !o || g.length !== o.length) return false;
        return g.every((v, j) => v === o[j]);
    });
}

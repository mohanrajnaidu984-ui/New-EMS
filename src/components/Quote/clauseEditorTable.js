/**
 * Keep clause editor tables uniform when rows/columns are added via Jodit popup.
 */

/** Same commands Jodit `selectCells` handles when cell selection is enabled. */
const TABLE_STRUCTURE_CMD_RE =
    /table(splitv|splitg|merge|empty|bin|binrow|bincolumn|addcolumn|addrow)/i;

function getJoditTableModule(jodit) {
    try {
        return jodit.getInstance?.('Table', jodit.o) || null;
    } catch {
        return null;
    }
}

function getActiveTableCell(jodit, getEditorBody) {
    const tableModule = getJoditTableModule(jodit);
    const selected = tableModule?.getAllSelectedCells?.() || [];
    if (selected.length) return selected[0];

    if (jodit.__emsActiveTableCell) {
        return jodit.__emsActiveTableCell;
    }

    const root =
        (typeof getEditorBody === 'function' && getEditorBody()) ||
        jodit.editor ||
        null;
    const range = jodit.s?.range;
    let node = range?.startContainer;
    if (!node) {
        node = root?.ownerDocument?.getSelection?.()?.anchorNode;
    }
    return getTableCellFromNode(node);
}

function setActiveTableCell(jodit, cell) {
    jodit.__emsActiveTableCell = cell || null;
}

function getSelectedTableCells(jodit) {
    const tableModule = getJoditTableModule(jodit);
    return [...(tableModule?.getAllSelectedCells?.() || [])];
}

function clearAllTableCellSelection(jodit) {
    const tableModule = getJoditTableModule(jodit);
    tableModule?.getAllSelectedCells?.().forEach((td) => tableModule.removeSelection(td));
}

/** EMS drag-select (replaces disabled Jodit selectCells plugin). */
function selectTableCellRange(jodit, table, cellA, cellB) {
    const tableModule = getJoditTableModule(jodit);
    if (!tableModule || !table || !cellA || !cellB) return [];
    clearAllTableCellSelection(jodit);
    const bound = tableModule.getSelectedBound(table, [cellA, cellB]);
    const box = tableModule.formalMatrix(table);
    const picked = [];
    for (let i = bound[0][0]; i <= bound[1][0]; i += 1) {
        for (let j = bound[0][1]; j <= bound[1][1]; j += 1) {
            const cell = box[i]?.[j];
            if (cell) {
                tableModule.addSelection(cell);
                picked.push(cell);
            }
        }
    }
    return picked;
}

function getSelectedCellsBounds(cells) {
    if (!cells?.length) return null;
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    cells.forEach((cell) => {
        const r = cell.getBoundingClientRect();
        left = Math.min(left, r.left);
        top = Math.min(top, r.top);
        right = Math.max(right, r.right);
        bottom = Math.max(bottom, r.bottom);
    });
    return {
        left,
        top,
        width: Math.max(0, right - left),
        height: Math.max(0, bottom - top),
    };
}

function selectionContainsCell(jodit, cell) {
    if (!cell) return false;
    return getSelectedTableCells(jodit).includes(cell);
}

/** One cell = caret only; two or more = keep Jodit blue selection for merge / multi-cell ops. */
function syncTableSelectionVisual(jodit, getEditorBody) {
    if (jodit.__emsSkipTableSelSync) return;

    const tableModule = getJoditTableModule(jodit);
    if (!tableModule) return;

    const root =
        (typeof getEditorBody === 'function' && getEditorBody()) ||
        jodit.editor ||
        null;
    const sel = root?.ownerDocument?.getSelection?.();
    const anchor = sel?.anchorNode;
    const anchorCell = getTableCellFromNode(anchor);

    const cells = getSelectedTableCells(jodit);
    if (cells.length <= 1) {
        tableModule.getAllSelectedCells().forEach((td) => tableModule.removeSelection(td));
        const cell = cells[0] || anchorCell;
        if (cell && (!root || root.contains(cell))) {
            jodit.__emsActiveTableCell = cell;
        } else {
            jodit.__emsActiveTableCell = null;
            jodit.__emsFormatTableCells = null;
        }
        return;
    }
    jodit.__emsActiveTableCell = cells[0];
}

function scheduleTableSelectionSync(jodit, getEditorBody) {
    if (jodit.__emsTableSelSyncTimer) {
        window.clearTimeout(jodit.__emsTableSelSyncTimer);
    }
    jodit.__emsTableSelSyncTimer = window.setTimeout(() => {
        jodit.__emsTableSelSyncTimer = null;
        requestAnimationFrame(() => syncTableSelectionVisual(jodit, getEditorBody));
    }, 0);
}

/** True when the user highlighted characters (toolbar should use Jodit inline formatting). */
function hasActiveTextRangeSelection(jodit, getEditorBody) {
    const root =
        (typeof getEditorBody === 'function' && getEditorBody()) ||
        jodit?.editor ||
        null;
    const sel = root?.ownerDocument?.getSelection?.();
    if (!sel || sel.isCollapsed) return false;
    if (!String(sel).trim()) return false;
    const anchor = sel.anchorNode;
    return Boolean(anchor && root?.contains(anchor));
}

/** Multi-cell table selection clears the text range — toolbar formatting needs a target. */
function getCellsForTableFormatting(jodit, getEditorBody) {
    if (hasActiveTextRangeSelection(jodit, getEditorBody)) {
        jodit.__emsFormatTableCells = null;
        jodit.__emsToolbarCellFormat = false;
        return [];
    }
    const live = getSelectedTableCells(jodit);
    if (live.length >= 2) {
        jodit.__emsFormatTableCells = live;
        return live;
    }
    // Stash is only valid right after a toolbar click while 2+ cells were selected.
    const stashed = jodit.__emsFormatTableCells;
    if (
        jodit.__emsToolbarCellFormat &&
        stashed?.length >= 2 &&
        stashed.every((c) => c?.isConnected)
    ) {
        return stashed;
    }
    jodit.__emsFormatTableCells = null;
    jodit.__emsToolbarCellFormat = false;
    return [];
}

function restoreTableCellSelection(jodit, cells) {
    const tableModule = getJoditTableModule(jodit);
    if (!tableModule || !cells?.length) return;
    tableModule.getAllSelectedCells().forEach((td) => {
        if (!cells.includes(td)) {
            tableModule.removeSelection(td);
        }
    });
    cells.forEach((td) => {
        if (td.isConnected) {
            tableModule.addSelection(td);
        }
    });
}

function applyCommitStyleToEachCell(jodit, cells, styleOptions) {
    cells.forEach((cell) => {
        try {
            const range = cell.ownerDocument.createRange();
            range.selectNodeContents(cell);
            jodit.s.selectRange(range);
            jodit.s.commitStyle(styleOptions);
        } catch {
            /* ignore */
        }
    });
    restoreTableCellSelection(jodit, cells);
}

function applyTextAlignToCells(cells, command) {
    const cmd = String(command || '').toLowerCase();
    let align = '';
    if (cmd === 'justifyfull') align = 'justify';
    else if (cmd === 'justifyright') align = 'right';
    else if (cmd === 'justifyleft') align = 'left';
    else if (cmd === 'justifycenter') align = 'center';
    if (!align) return;
    cells.forEach((cell) => {
        cell.style.textAlign = align;
        cell.setAttribute('align', align);
        cell.querySelectorAll('p, div, span, li').forEach((el) => {
            el.style.textAlign = align;
        });
    });
}

function applyInlineStyleToCells(cells, styleProp, value) {
    cells.forEach((cell) => {
        if (value === '' || value == null) {
            cell.style.removeProperty(styleProp);
        } else {
            cell.style[styleProp] = value;
        }
    });
}

function tryApplyFormatToMultiSelectedCells(jodit, getEditorBody, command, value) {
    const cells = getCellsForTableFormatting(jodit, getEditorBody);
    if (cells.length < 2) return false;

    const cmd = String(command || '').toLowerCase();
    jodit.__emsSkipTableSelSync = true;

    try {
        switch (cmd) {
            case 'bold':
                applyCommitStyleToEachCell(jodit, cells, { element: 'strong' });
                break;
            case 'italic':
                applyCommitStyleToEachCell(jodit, cells, { element: 'em' });
                break;
            case 'underline':
                applyCommitStyleToEachCell(jodit, cells, { element: 'u' });
                break;
            case 'strikethrough':
                applyCommitStyleToEachCell(jodit, cells, { element: 's' });
                break;
            case 'superscript':
                applyCommitStyleToEachCell(jodit, cells, { element: 'sup' });
                break;
            case 'subscript':
                applyCommitStyleToEachCell(jodit, cells, { element: 'sub' });
                break;
            case 'forecolor':
                applyCommitStyleToEachCell(jodit, cells, {
                    attributes: { style: { color: value || '' } },
                });
                break;
            case 'background':
                applyCommitStyleToEachCell(jodit, cells, {
                    attributes: { style: { backgroundColor: value || '' } },
                });
                break;
            case 'fontsize': {
                let size = value != null ? String(value) : '';
                if (size && !/px|pt|em|rem|%$/i.test(size)) {
                    size = `${size}px`;
                }
                applyInlineStyleToCells(cells, 'fontSize', size);
                break;
            }
            case 'fontname':
                applyInlineStyleToCells(cells, 'fontFamily', value || '');
                break;
            case 'applylineheight':
                applyInlineStyleToCells(cells, 'lineHeight', value != null ? String(value) : '');
                break;
            case 'justifyleft':
            case 'justifycenter':
            case 'justifyright':
            case 'justifyfull':
                applyTextAlignToCells(cells, cmd);
                break;
            case 'eraser':
                cells.forEach((cell) => {
                    cell.removeAttribute('style');
                    cell.querySelectorAll('[style]').forEach((el) => {
                        el.removeAttribute('style');
                    });
                });
                break;
            default:
                return false;
        }
    } finally {
        restoreTableCellSelection(jodit, cells);
        jodit.__emsSkipTableSelSync = false;
        jodit.__emsToolbarCellFormat = false;
    }

    if (typeof jodit.synchronizeValues === 'function') {
        jodit.synchronizeValues();
    }
    return true;
}

/** Toolbar commands while multiple table cells are selected (bold, colors, align, etc.). */
function registerTableMultiCellFormatting(jodit, getEditorBody) {
    if (!jodit || jodit.__emsTableMultiFormat) return;
    jodit.__emsTableMultiFormat = true;

    jodit.e.on('beforeCommand.emsMultiCellFmt', (command, _ui, value) => {
        if (TABLE_STRUCTURE_CMD_RE.test(String(command || ''))) {
            return;
        }
        if (tryApplyFormatToMultiSelectedCells(jodit, getEditorBody, command, value)) {
            return false;
        }
    });

    jodit.events.on(
        'mousedown',
        (e) => {
            const target = e.target;
            if (!target?.closest) return;
            if (
                target.closest('.jodit-toolbar, .jodit-toolbar__box, .jodit-popup') &&
                getSelectedTableCells(jodit).length >= 2 &&
                !hasActiveTextRangeSelection(jodit, getEditorBody)
            ) {
                jodit.__emsToolbarCellFormat = true;
                jodit.__emsFormatTableCells = getSelectedTableCells(jodit);
            }
        },
        true
    );
}

/** When the user selects text inside a cell, drop multi-cell stash so forecolor/background work. */
function registerTableTextSelectionGuard(jodit, getEditorBody) {
    if (!jodit || jodit.__emsTableTextSelGuard) return;
    jodit.__emsTableTextSelGuard = true;

    const onSelectionChange = () => {
        if (jodit.__emsToolbarCellFormat) return;
        if (hasActiveTextRangeSelection(jodit, getEditorBody)) {
            jodit.__emsFormatTableCells = null;
            clearAllTableCellSelection(jodit);
            return;
        }
        if (getSelectedTableCells(jodit).length < 2) {
            jodit.__emsFormatTableCells = null;
        }
    };

    const attach = () => {
        const root =
            (typeof getEditorBody === 'function' && getEditorBody()) ||
            jodit.editor ||
            null;
        if (!root || root.__emsTableTextSelGuardBound) return;
        root.__emsTableTextSelGuardBound = true;
        const doc = root.ownerDocument || document;
        doc.addEventListener('selectionchange', onSelectionChange);
        jodit.e.on('beforeDestruct', () => {
            doc.removeEventListener('selectionchange', onSelectionChange);
        });
    };

    jodit.e.on('afterInit', attach);
    attach();
}

const JODIT_TABLE_COMMANDS = [
    'tableaddrowafter',
    'tableaddrowbefore',
    'tableaddcolumnafter',
    'tableaddcolumnbefore',
    'tablebin',
    'tablebinrow',
    'tablebincolumn',
    'tablemerge',
    'tableempty',
    'tablesplitv',
    'tablesplitg',
];

function joditBeforeCommandEventName(command) {
    const cmd = String(command || '').toLowerCase();
    return `beforeCommand${cmd.charAt(0).toUpperCase()}${cmd.slice(1)}`;
}

/**
 * Run add/delete row/column etc. Jodit selectCells returns false even when no cells
 * are selected (after our single-cell visual sync), which blocks the command — handle
 * on the per-command beforeCommand* events that fire first.
 */
function executeTableStructureCommand(jodit, getEditorBody, command) {
    const cmd = String(command || '').toLowerCase();
    if (!TABLE_STRUCTURE_CMD_RE.test(cmd)) return false;

    const subCmd = cmd.replace(/table/gi, '');
    const tableModule = getJoditTableModule(jodit);
    if (!tableModule) return false;

    let workCells = getSelectedTableCells(jodit);
    const cell = workCells[0] || getActiveTableCell(jodit, getEditorBody);
    if (!cell) return false;

    const table = cell.closest('table');
    if (!table) return false;

    const root =
        (typeof getEditorBody === 'function' && getEditorBody()) ||
        jodit.editor ||
        null;
    if (root && !root.contains(table)) return false;

    if (!workCells.length) {
        workCells = [cell];
    }

    switch (subCmd) {
        case 'splitv':
            tableModule.splitVertical(table);
            break;
        case 'splitg':
            tableModule.splitHorizontal(table);
            break;
        case 'merge':
            tableModule.mergeSelected(table);
            break;
        case 'empty':
            workCells.forEach((td) => {
                td.innerHTML = '<br>';
            });
            break;
        case 'bin':
            table.remove();
            break;
        case 'binrow':
            new Set(workCells.map((td) => td.parentNode)).forEach((row) => {
                if (row && typeof row.rowIndex === 'number') {
                    tableModule.removeRow(table, row.rowIndex);
                }
            });
            break;
        case 'bincolumn': {
            const columnsSet = new Set();
            const columns = [];
            workCells.forEach((td) => {
                const coord = tableModule.formalCoordinate(table, td);
                const col = Array.isArray(coord) ? coord[1] : coord?.col;
                if (col == null || columnsSet.has(col)) return;
                columns.push(col);
                columnsSet.add(col);
            });
            columns
                .sort((a, b) => b - a)
                .forEach((col) => tableModule.removeColumn(table, col));
            break;
        }
        case 'addcolumnafter':
        case 'addcolumnbefore':
            tableModule.appendColumn(table, cell, subCmd === 'addcolumnafter');
            break;
        case 'addrowafter':
        case 'addrowbefore':
            tableModule.appendRow(table, cell.parentNode, subCmd === 'addrowafter');
            break;
        default:
            return false;
    }

    if (typeof jodit.synchronizeValues === 'function') {
        jodit.synchronizeValues();
    }
    if (root) {
        requestAnimationFrame(() => harmonizeInsertedTableCells(root));
    }
    return true;
}

function registerTableStructureCommands(jodit, getEditorBody) {
    if (!jodit || jodit.__emsTableStructureCmd) return;
    jodit.__emsTableStructureCmd = true;

    const run = (command) => {
        if (!executeTableStructureCommand(jodit, getEditorBody, command)) {
            return;
        }
        requestAnimationFrame(() => syncTableSelectionVisual(jodit, getEditorBody));
        return false;
    };

    JODIT_TABLE_COMMANDS.forEach((command) => {
        jodit.e.on(`${joditBeforeCommandEventName(command)}.emsTableCmd`, () => run(command));
    });
}

function isCellEffectivelyEmpty(cell) {
    if (!cell) return true;
    const text = String(cell.textContent || '').replace(/\u00a0/g, ' ').trim();
    if (text) return false;
    return !cell.querySelector('img, table, svg');
}

const MIN_TABLE_COLUMN_WIDTH = 24;
const MIN_TABLE_ROW_HEIGHT = 18;

function applyTableLayoutDefaults(table) {
    if (!table) return;
    table.style.tableLayout = 'fixed';
    const w = (table.style.width || '').trim();
    if (!w || w === '100%') {
        table.style.removeProperty('width');
    }
}

function getTableRows(table) {
    return [...table.querySelectorAll('tr')];
}

function getColumnCount(rows) {
    return Math.max(0, ...rows.map((r) => r.cells?.length || 0));
}

/** Account for colspan when Excel merges header cells. */
function getLogicalColumnCount(rows) {
    let max = 0;
    rows.forEach((row) => {
        let cols = 0;
        [...row.cells].forEach((cell) => {
            cols += Math.max(1, Number(cell.colSpan) || 1);
        });
        max = Math.max(max, cols);
    });
    return max;
}

/** Measure rendered column widths once after an Excel/Word paste (before EMS col model exists). */
function readOfficeTableColumnWidthsPx(table, rows, colCount) {
    const widths = new Array(colCount).fill(0);

    // 1. Try colgroup <col> inline widths (set by our iframe inlineComputedOfficeTableStyles).
    const cg = table.querySelector('colgroup');
    if (cg) {
        const cols = [...cg.querySelectorAll('col')];
        cols.forEach((col, j) => {
            if (j >= colCount || widths[j] > 0) return;
            const w = parseCssPx(col.style.width) ||
                parseFloat(col.getAttribute('width') || '0');
            if (w > 0) widths[j] = Math.max(MIN_TABLE_COLUMN_WIDTH, Math.round(w));
        });
    }

    // 2. Try inline style.width on the first row's cells.
    const firstRow = rows[0];
    if (firstRow) {
        for (let j = 0; j < colCount; j += 1) {
            if (widths[j] > 0) continue;
            for (const row of rows) {
                const cell = row.cells[j];
                if (!cell) continue;
                const w = parseCssPx(cell.style.width);
                if (w > 0) {
                    const span = Math.max(1, Number(cell.colSpan) || 1);
                    const slice = Math.max(MIN_TABLE_COLUMN_WIDTH, Math.round(w / span));
                    for (let k = 0; k < span && j + k < colCount; k += 1) {
                        if (widths[j + k] <= 0) widths[j + k] = slice;
                    }
                    break;
                }
            }
        }
    }

    // 3. Fall back to table.style.width split evenly across columns if still missing.
    const tableStyleW = parseCssPx(table.style.width);
    for (let j = 0; j < colCount; j += 1) {
        if (widths[j] <= 0) {
            widths[j] = tableStyleW > 0
                ? Math.max(MIN_TABLE_COLUMN_WIDTH, Math.round(tableStyleW / colCount))
                : DEFAULT_TABLE_COLUMN_WIDTH;
        }
    }

    // 4. Fit-to-container: scale to A4 inner width so editor + preview match.
    const availableW = getA4InnerContentWidthPx(table.ownerDocument) || 0;
    const totalW = widths.reduce((s, w) => s + (w || 0), 0);
    if (availableW > 0 && totalW > availableW * 1.02) {
        const ratio = availableW / totalW;
        let newTotal = 0;
        for (let j = 0; j < colCount; j += 1) {
            widths[j] = Math.max(MIN_TABLE_COLUMN_WIDTH, Math.round((widths[j] || 0) * ratio));
            newTotal += widths[j];
        }
        // Correct rounding drift so sum ~= availableW.
        const drift = Math.round(availableW - newTotal);
        if (drift !== 0 && colCount) {
            widths[colCount - 1] = Math.max(
                MIN_TABLE_COLUMN_WIDTH,
                Math.round((widths[colCount - 1] || 0) + drift)
            );
        }
    }

    return widths;
}

/** Enable EMS column drag-resize on Excel/Word pasted tables without stripping their colors. */
export function initializeOfficePastedTableColumns(table) {
    if (!table || !isOfficePasteTable(table)) return;
    if (isTableStructureResizeActiveForTable(table)) return;

    const rows = getTableRows(table);
    if (!rows.length) return;
    const colCount = getLogicalColumnCount(rows) || getColumnCount(rows);
    if (!colCount) return;

    if (table.getAttribute('data-ems-col-widths')) {
        applyTableLayoutDefaults(table);
        return;
    }

    const widths = readOfficeTableColumnWidthsPx(table, rows, colCount);
    applyColumnWidths(table, rows, widths);
}

export function initializeAllOfficePastedTableColumns(root) {
    if (!root?.querySelectorAll) return;
    root.querySelectorAll('table[data-ems-paste-source="office"], table.ems-office-paste-table').forEach((table) => {
        initializeOfficePastedTableColumns(table);
    });
}

const DEFAULT_TABLE_COLUMN_WIDTH = 96;
let EMS_A4_INNER_WIDTH_PX_CACHE = null;

function getA4InnerContentWidthPx(doc) {
    if (EMS_A4_INNER_WIDTH_PX_CACHE != null) return EMS_A4_INNER_WIDTH_PX_CACHE;
    try {
        const d = doc || (typeof document !== 'undefined' ? document : null);
        if (!d?.createElement) return null;
        const el = d.createElement('div');
        // A4 is 210mm wide; preview uses 15mm padding both sides → 180mm inner width.
        el.style.cssText =
            'position:fixed;left:-99999px;top:0;width:180mm;height:1px;opacity:0;pointer-events:none';
        d.body?.appendChild?.(el);
        const w = Math.round(el.getBoundingClientRect().width || 0);
        el.remove();
        EMS_A4_INNER_WIDTH_PX_CACHE = w > 0 ? w : null;
        return EMS_A4_INNER_WIDTH_PX_CACHE;
    } catch {
        EMS_A4_INNER_WIDTH_PX_CACHE = null;
        return null;
    }
}

function parseCssPx(value) {
    if (!value) return 0;
    const m = String(value).trim().match(/^([\d.]+)px$/i);
    return m ? parseFloat(m[1]) : 0;
}

function getOrSyncColgroup(table, colCount) {
    const doc = table.ownerDocument || document;
    let cg = table.querySelector('colgroup');
    if (!cg) {
        cg = doc.createElement('colgroup');
        table.insertBefore(cg, table.firstChild);
    }
    let cols = [...cg.querySelectorAll('col')];
    while (cols.length < colCount) {
        cg.appendChild(doc.createElement('col'));
        cols.push(cg.lastElementChild);
    }
    while (cols.length > colCount) {
        cols.pop()?.remove();
    }
    return { colgroup: cg, cols: [...cg.querySelectorAll('col')] };
}

/** Read stored px widths — never use getBoundingClientRect (browser equalizes unknown cols). */
function readColumnWidthsPx(table, rows, colCount) {
    const widths = new Array(colCount).fill(0);
    const stored = table.getAttribute('data-ems-col-widths');
    if (stored) {
        const parts = stored.split(',').map((s) => parseFloat(s.trim()));
        for (let j = 0; j < colCount; j += 1) {
            if (parts[j] > 0) widths[j] = parts[j];
        }
    }
    const { cols } = getOrSyncColgroup(table, colCount);
    cols.forEach((col, j) => {
        if (j >= colCount || widths[j] > 0) return;
        const w = parseCssPx(col.style.width) || parseFloat(col.getAttribute('width') || '0');
        if (w > 0) widths[j] = w;
    });
    const firstRow = rows[0];
    for (let j = 0; j < colCount; j += 1) {
        if (widths[j] > 0) continue;
        const w = parseCssPx(firstRow?.cells[j]?.style?.width);
        if (w > 0) widths[j] = w;
    }
    for (let j = 0; j < colCount; j += 1) {
        if (widths[j] <= 0) widths[j] = DEFAULT_TABLE_COLUMN_WIDTH;
    }
    return widths;
}

function isColumnAllEmpty(rows, colIndex) {
    for (const row of rows) {
        const cell = row.cells[colIndex];
        if (cell && !isCellEffectivelyEmpty(cell)) return false;
    }
    return true;
}

const DEFAULT_TABLE_ROW_HEIGHT = 24;

function isRowAllEmpty(row) {
    const cells = [...row.querySelectorAll('td, th')];
    return cells.length > 0 && cells.every(isCellEffectivelyEmpty);
}

function readRowHeightsPx(table, rows) {
    const heights = new Array(rows.length).fill(0);
    const stored = table.getAttribute('data-ems-row-heights');
    if (stored) {
        const parts = stored.split(',').map((s) => parseFloat(s.trim()));
        for (let i = 0; i < rows.length; i += 1) {
            if (parts[i] > 0) heights[i] = parts[i];
        }
    }
    rows.forEach((row, i) => {
        if (heights[i] > 0) return;
        const h = parseCssPx(row.style.height);
        if (h > 0) heights[i] = h;
    });
    for (let i = 0; i < rows.length; i += 1) {
        if (heights[i] <= 0) heights[i] = DEFAULT_TABLE_ROW_HEIGHT;
    }
    return heights;
}

function lockRowHeight(tr, px) {
    if (!tr) return;
    const h = `${Math.max(MIN_TABLE_ROW_HEIGHT, Math.round(px))}px`;
    tr.style.boxSizing = 'border-box';
    tr.style.height = h;
    tr.style.minHeight = h;
    tr.style.maxHeight = h;
    tr.querySelectorAll('td, th').forEach((cell) => {
        cell.style.boxSizing = 'border-box';
        cell.style.height = h;
        cell.style.minHeight = h;
        cell.style.maxHeight = h;
    });
}

function applyRowHeights(table, rows, heights) {
    rows.forEach((row, i) => {
        const px = Math.max(MIN_TABLE_ROW_HEIGHT, Math.round(heights[i] || DEFAULT_TABLE_ROW_HEIGHT));
        heights[i] = px;
        lockRowHeight(row, px);
    });
    table.setAttribute('data-ems-row-heights', heights.join(','));
}

export function isTableRowResizeActive(root) {
    return !!root?.querySelector?.('table[data-ems-row-resizing="1"]');
}

export function isTableStructureResizeActive(root) {
    return isTableColumnResizeActive(root) || isTableRowResizeActive(root);
}

function lockCellColumnWidth(cell, px) {
    if (!cell?.style) return;
    const w = `${px}px`;
    cell.style.boxSizing = 'border-box';
    cell.style.width = w;
    cell.style.minWidth = w;
    cell.style.maxWidth = w;
}

/** Fixed px per column (colgroup + every cell); table width = sum — does not stretch to page. */
function applyColumnWidths(table, rows, widths) {
    const colCount = widths.length;
    if (!colCount) return;

    applyTableLayoutDefaults(table);
    const { cols } = getOrSyncColgroup(table, colCount);
    const { grid } = buildTableCellGrid(table);
    let sum = 0;

    for (let j = 0; j < colCount; j += 1) {
        const px = Math.max(MIN_TABLE_COLUMN_WIDTH, Math.round(widths[j] || 0));
        widths[j] = px;
        sum += px;
        if (cols[j]) {
            cols[j].style.width = `${px}px`;
            cols[j].setAttribute('width', String(px));
        }

        const seen = new Set();
        for (let r = 0; r < grid.length; r += 1) {
            const cell = grid[r]?.[j];
            if (!cell || seen.has(cell)) continue;
            seen.add(cell);
            const pos = findCellGridPosition(grid, cell);
            const span = Math.max(1, Number(cell.colSpan) || 1);
            if (pos && pos.col === j && span === 1) {
                lockCellColumnWidth(cell, px);
            } else if (pos && pos.col === j && span > 1) {
                let total = 0;
                for (let k = j; k < j + span && k < colCount; k += 1) total += widths[k] || 0;
                lockCellColumnWidth(cell, total);
            }
        }
        rows.forEach((row) => {
            const cell = row.cells[j];
            if (cell && !seen.has(cell)) lockCellColumnWidth(cell, px);
        });
    }

    table.setAttribute('data-ems-col-widths', widths.join(','));
    if (sum > 0) {
        const w = `${sum}px`;
        table.style.width = w;
        table.style.minWidth = w;
        table.style.maxWidth = w;
    }
}

export function isTableColumnResizeActive(root) {
    return !!root?.querySelector?.('table[data-ems-col-resizing="1"]');
}

function isTableStructureResizeActiveForTable(table) {
    return (
        table?.getAttribute('data-ems-col-resizing') === '1' ||
        table?.getAttribute('data-ems-row-resizing') === '1'
    );
}

export function normalizeTableColumnWidths(table) {
    if (!table) return;
    const rows = getTableRows(table);
    if (!rows.length) return;
    const colCount = getColumnCount(rows);
    if (!colCount) return;
    const widths = readColumnWidthsPx(table, rows, colCount);
    applyColumnWidths(table, rows, widths);
}

/** Match newly inserted empty rows/columns to the neighbor above/below or left/right. */
export function harmonizeInsertedTableCells(root) {
    if (!root?.querySelectorAll) return;
    if (isTableStructureResizeActive(root)) return;

    root.querySelectorAll('table').forEach((table) => {
        if (isOfficePasteTable(table)) {
            initializeOfficePastedTableColumns(table);
            return;
        }
        if (isTableStructureResizeActiveForTable(table)) return;

        applyTableLayoutDefaults(table);

        const rows = getTableRows(table);
        if (!rows.length) return;

        const colCount = getColumnCount(rows);
        if (!colCount) return;

        let widths = readColumnWidthsPx(table, rows, colCount);
        let structureChanged = false;

        // New empty column: copy width from column to the left (or right if first).
        for (let j = 0; j < colCount; j += 1) {
            if (!isColumnAllEmpty(rows, j)) continue;
            const refJ = j > 0 ? j - 1 : j + 1;
            if (refJ >= 0 && refJ < colCount && widths[refJ] > 0) {
                if (widths[j] !== widths[refJ]) {
                    widths[j] = widths[refJ];
                    structureChanged = true;
                }
            }
        }

        // Only re-apply when model is new or we patched a new column — not on every style tick.
        if (!table.getAttribute('data-ems-col-widths') || structureChanged) {
            applyColumnWidths(table, rows, widths);
        }

        let rowHeights = readRowHeightsPx(table, rows);
        let rowStructureChanged = false;
        rows.forEach((row, i) => {
            if (!isRowAllEmpty(row)) return;
            const refRow =
                row.previousElementSibling?.tagName === 'TR'
                    ? row.previousElementSibling
                    : row.nextElementSibling?.tagName === 'TR'
                      ? row.nextElementSibling
                      : null;
            if (!refRow) return;
            const refIdx = rows.indexOf(refRow);
            if (refIdx >= 0 && rowHeights[refIdx] > 0 && rowHeights[i] !== rowHeights[refIdx]) {
                rowHeights[i] = rowHeights[refIdx];
                rowStructureChanged = true;
            }
        });
        if (!table.getAttribute('data-ems-row-heights') || rowStructureChanged) {
            applyRowHeights(table, rows, rowHeights);
        }
    });
}

function getTableCellFromNode(node) {
    let el = node;
    if (el?.nodeType === 3) el = el.parentElement;
    return el?.closest?.('td, th') || null;
}

/** Logical row/col grid (handles colspan/rowspan). grid[row][col] -> cell element. */
function buildTableCellGrid(table) {
    const rows = [...table.querySelectorAll('tr')];
    /** @type {Array<Array<Element|null>>} */
    const grid = [];

    rows.forEach((tr, rowIndex) => {
        if (!grid[rowIndex]) grid[rowIndex] = [];
        let col = 0;
        [...tr.cells].forEach((cell) => {
            while (grid[rowIndex][col]) col += 1;
            const colSpan = Math.max(1, Number(cell.colSpan) || 1);
            const rowSpan = Math.max(1, Number(cell.rowSpan) || 1);
            for (let r = 0; r < rowSpan; r += 1) {
                const ri = rowIndex + r;
                if (!grid[ri]) grid[ri] = [];
                for (let c = 0; c < colSpan; c += 1) {
                    grid[ri][col + c] = cell;
                }
            }
            col += colSpan;
        });
    });

    return { rows, grid };
}

function findCellGridPosition(grid, cell) {
    for (let r = 0; r < grid.length; r += 1) {
        const row = grid[r] || [];
        for (let c = 0; c < row.length; c += 1) {
            if (row[c] === cell) return { row: r, col: c };
        }
    }
    return null;
}

/** Find a cell whose right edge aligns with logical column `colIndex` (handles merged Excel headers). */
function findCellAtColumnRightEdge(table, colIndex) {
    const { grid } = buildTableCellGrid(table);
    for (let r = 0; r < grid.length; r += 1) {
        const cell = grid[r]?.[colIndex];
        if (!cell) continue;
        const pos = findCellGridPosition(grid, cell);
        if (!pos) continue;
        const span = Math.max(1, Number(cell.colSpan) || 1);
        if (pos.col + span - 1 === colIndex) return cell;
    }
    return getTableRows(table).find((row) => row.cells[colIndex])?.cells[colIndex] || null;
}

function getColumnRightEdgeX(table, colIndex) {
    const rows = getTableRows(table);
    const colCount = getLogicalColumnCount(rows) || getColumnCount(rows);
    if (!colCount || colIndex < 0 || colIndex >= colCount) return null;

    const tableRect = table.getBoundingClientRect();
    const stored = table.getAttribute('data-ems-col-widths');
    if (stored) {
        const widths = stored.split(',').map((s) => parseFloat(s.trim()) || 0);
        if (widths.length >= colCount) {
            let offset = 0;
            for (let j = 0; j <= colIndex; j += 1) offset += widths[j] || 0;
            return tableRect.left + offset;
        }
    }

    const cell = findCellAtColumnRightEdge(table, colIndex);
    return cell ? cell.getBoundingClientRect().right : null;
}

function isOfficePasteTable(table) {
    return (
        table?.getAttribute?.('data-ems-paste-source') === 'office' ||
        table?.classList?.contains?.('ems-office-paste-table')
    );
}

function focusTableCell(cell, jodit, atEnd = false) {
    if (!cell) return false;
    const doc = cell.ownerDocument;
    const range = doc.createRange();

    const placeInElement = (el, collapseEnd) => {
        if (!el) return false;
        const walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let firstText = null;
        let lastText = null;
        let n;
        while ((n = walker.nextNode())) {
            if (!firstText) firstText = n;
            lastText = n;
        }
        if (collapseEnd && lastText) {
            range.setStart(lastText, lastText.length);
            range.collapse(true);
            return true;
        }
        if (!collapseEnd && firstText) {
            range.setStart(firstText, 0);
            range.collapse(true);
            return true;
        }
        if (el.tagName === 'P' || el.tagName === 'DIV') {
            if (!el.firstChild) {
                el.innerHTML = '<br>';
            }
            range.setStart(el, 0);
            range.collapse(true);
            return true;
        }
        return false;
    };

    if (!placeInElement(cell.querySelector('p, div') || cell, atEnd)) {
        range.selectNodeContents(cell);
        range.collapse(!atEnd);
    }

    try {
        if (jodit?.s?.selectRange) {
            jodit.s.selectRange(range);
            return true;
        }
    } catch {
        /* fall through */
    }
    const sel = doc.getSelection();
    if (!sel) return false;
    sel.removeAllRanges();
    sel.addRange(range);
    return true;
}

function moveTableCellFocus(root, cell, key, jodit, getEditorBody) {
    const table = cell.closest('table');
    if (!table) return false;

    const { grid } = buildTableCellGrid(table);
    const pos = findCellGridPosition(grid, cell);
    if (!pos) return false;

    let nextRow = pos.row;
    let nextCol = pos.col;
    if (key === 'ArrowUp') nextRow -= 1;
    else if (key === 'ArrowDown') nextRow += 1;
    else if (key === 'ArrowLeft') nextCol -= 1;
    else if (key === 'ArrowRight') nextCol += 1;
    else return false;

    const targetCell = grid[nextRow]?.[nextCol];
    if (!targetCell || !root.contains(targetCell)) return false;

    const atEnd = key === 'ArrowRight' || key === 'ArrowDown';
    const moved = focusTableCell(targetCell, jodit, atEnd);
    if (moved) {
        setActiveTableCell(jodit, targetCell);
        syncTableSelectionVisual(jodit, getEditorBody);
    }
    return moved;
}

function bindTableArrowNavigation(root, jodit, getEditorBody) {
    if (!root || root.__emsTableArrowBound) return;
    root.__emsTableArrowBound = true;

    const onKeyDown = (e) => {
        const key = e.key;
        if (key !== 'ArrowUp' && key !== 'ArrowDown' && key !== 'ArrowLeft' && key !== 'ArrowRight') {
            return;
        }

        const range = jodit.s?.range;
        let node = range?.startContainer;
        if (!node) {
            node = root.ownerDocument?.getSelection?.()?.anchorNode;
        }
        const cell = getTableCellFromNode(node);
        if (!cell || !root.contains(cell)) return;

        if (!moveTableCellFocus(root, cell, key, jodit, getEditorBody)) return;

        e.preventDefault();
        e.stopImmediatePropagation();
        if (typeof jodit.synchronizeValues === 'function') {
            jodit.synchronizeValues();
        }
    };

    root.addEventListener('keydown', onKeyDown, true);
}

/** Table cell toolbar (fill, borders, merge, delete) — right-click only, not on normal click. */
function registerTablePopupContextMenuOnly(jodit, getEditorBody) {
    if (!jodit || jodit.__emsTablePopupCtxOnly) return;
    jodit.__emsTablePopupCtxOnly = true;

    jodit.e.on('showPopup.tableCtxOnly', (table, getPosition, type) => {
        if (type !== 'cells') return;
        if (!jodit.__emsAllowTableCellPopup) {
            jodit.e.fire('hidePopup', 'cells');
        } else {
            jodit.__emsAllowTableCellPopup = false;
        }
    });

    const attach = () => {
        const root =
            (typeof getEditorBody === 'function' && getEditorBody()) ||
            jodit.editor ||
            null;
        if (!root || root.__emsTableCtxPopupBound) return;
        root.__emsTableCtxPopupBound = true;

        root.addEventListener(
            'mousedown',
            (e) => {
                if (e.button === 2) {
                    /* Keep multi-cell block when opening the context menu. */
                    if (getSelectedTableCells(jodit).length > 1) {
                        jodit.__emsPreserveMultiTableSelect = true;
                        jodit.__emsSkipTableSelSync = true;
                        e.stopImmediatePropagation();
                    }
                    return;
                }
                jodit.__emsAllowTableCellPopup = false;
                jodit.e.fire('hidePopup', 'cells');
            },
            true
        );

        root.addEventListener(
            'contextmenu',
            (e) => {
                const cell = getTableCellFromNode(e.target);
                if (!cell || !root.contains(cell)) return;

                const table = cell.closest('table');
                if (!table) return;

                e.preventDefault();
                e.stopPropagation();

                const selected = getSelectedTableCells(jodit);
                const multiKeep =
                    selected.length > 1 && selectionContainsCell(jodit, cell);

                jodit.__emsAllowTableCellPopup = true;
                jodit.__emsSkipTableSelSync = true;

                if (!multiKeep) {
                    setActiveTableCell(jodit, cell);
                    focusTableCell(cell, jodit, false);
                } else {
                    jodit.__emsActiveTableCell = selected[0];
                }

                jodit.e.fire(
                    'showPopup',
                    table,
                    () =>
                        multiKeep
                            ? getSelectedCellsBounds(selected)
                            : (() => {
                                  const r = cell.getBoundingClientRect();
                                  return {
                                      left: r.left,
                                      top: r.top,
                                      width: r.width,
                                      height: r.height,
                                  };
                              })(),
                    'cells'
                );

                window.setTimeout(() => {
                    jodit.__emsSkipTableSelSync = false;
                    jodit.__emsPreserveMultiTableSelect = false;
                }, 0);
            },
            true
        );
    };

    jodit.e.on('afterInit', attach);
    attach();
}

function registerTableArrowNavigation(jodit, getEditorBody) {
    if (!jodit || jodit.__emsTableArrowNav) return;
    jodit.__emsTableArrowNav = true;

    const attach = () => {
        const root =
            (typeof getEditorBody === 'function' && getEditorBody()) ||
            jodit.editor ||
            null;
        bindTableArrowNavigation(root, jodit, getEditorBody);
    };

    jodit.e.on('afterInit', attach);
    attach();
}

/** Image/add-line only — do not remove Jodit column resize handle. */
const FLOATING_CHROME_SELECTOR =
    '.jodit-resizer, .jodit-add-new-line, .jodit-workplace > .jodit-resizer';

const TABLE_EDGE_NEAR = 8;
/** Hit zone at cell left/right edge for column resize (px). */
const TABLE_COL_EDGE_NEAR = 18;
const TABLE_ROW_EDGE_NEAR = 10;

function getEditorWorkplace(jodit) {
    return jodit.workplace || jodit.container?.querySelector('.jodit-workplace') || null;
}

function hideTableResizeHandles(jodit) {
    const workplace = getEditorWorkplace(jodit);
    workplace?.querySelector('.jodit-table-resizer')?.remove();
    workplace?.querySelector('.ems-table-col-resizer')?.remove();
    workplace?.querySelector('.ems-table-row-resizer')?.remove();
    if (jodit.__emsRowResizeHide) {
        jodit.__emsRowResizeHide();
    }
}

function detectColumnResizeIndex(cell, clientX) {
    if (!cell || clientX == null) return -1;
    const table = cell.closest('table');
    if (!table) return -1;
    const { grid } = buildTableCellGrid(table);
    const pos = findCellGridPosition(grid, cell);
    if (!pos) return -1;
    const rect = cell.getBoundingClientRect();
    const x = clientX - rect.left;
    const w = rect.width;
    if (w <= 0) return -1;
    const span = Math.max(1, Number(cell.colSpan) || 1);
    if (x >= w - TABLE_COL_EDGE_NEAR) return pos.col + span - 1;
    if (x <= TABLE_COL_EDGE_NEAR && pos.col > 0) return pos.col - 1;
    return -1;
}

/** Only the dragged column changes width; others stay fixed (colgroup px). */
function registerEmsTableColumnResize(jodit, getEditorBody) {
    if (!jodit || jodit.__emsTableColResize) return;
    jodit.__emsTableColResize = true;

    let handle = null;
    let hideTimeout = 0;
    let drag = false;
    let startX = 0;
    let startWidths = null;
    let resizeCol = -1;
    let workTable = null;
    let hoverCell = null;

    const getHandleParent = () => jodit.container || getEditorWorkplace(jodit) || jodit.ed?.body;

    const clearHideTimeout = () => {
        if (hideTimeout) {
            window.clearTimeout(hideTimeout);
            hideTimeout = 0;
        }
    };

    const clearColResizeHover = () => {
        hoverCell = null;
    };

    const hideHandle = () => {
        if (drag) return;
        clearHideTimeout();
        clearColResizeHover();
        hideTimeout = window.setTimeout(() => handle?.remove(), jodit.defaultTimeout || 80);
    };

    const ensureHandle = () => {
        if (handle) return;
        const doc = jodit.ed?.ownerDocument || document;
        handle = doc.createElement('div');
        handle.className = 'ems-table-col-resizer';
        handle.setAttribute('title', 'Drag to resize column');
        handle.addEventListener('mousedown', onHandleMouseDown, true);
        handle.addEventListener('mouseenter', clearHideTimeout);
    };

    const positionHandle = (table, colIndex) => {
        const parent = getHandleParent();
        if (!parent || !table || colIndex < 0) return;
        const edgeX = getColumnRightEdgeX(table, colIndex);
        const anchorCell = findCellAtColumnRightEdge(table, colIndex);
        if (edgeX == null && !anchorCell) return;
        ensureHandle();
        const tableRect = table.getBoundingClientRect();
        handle.style.position = 'fixed';
        handle.style.left = `${Math.round((edgeX ?? anchorCell.getBoundingClientRect().right) - 4)}px`;
        handle.style.top = `${Math.round(tableRect.top)}px`;
        handle.style.height = `${Math.max(tableRect.height, anchorCell?.getBoundingClientRect().height || 0)}px`;
        handle.style.display = 'block';
        clearHideTimeout();
        parent.appendChild(handle);
        workTable = table;
        resizeCol = colIndex;
    };

    const applyResize = (delta) => {
        if (!workTable || resizeCol < 0 || !startWidths) return;
        const rows = getTableRows(workTable);
        const next = [...startWidths];
        next[resizeCol] = Math.max(
            MIN_TABLE_COLUMN_WIDTH,
            Math.round(startWidths[resizeCol] + delta)
        );
        applyColumnWidths(workTable, rows, next);
        positionHandle(workTable, resizeCol);
    };

    const setColResizingFlag = (table, active) => {
        if (!table) return;
        if (active) {
            table.setAttribute('data-ems-col-resizing', '1');
            jodit.__emsColResizing = true;
        } else {
            table.removeAttribute('data-ems-col-resizing');
            jodit.__emsColResizing = false;
        }
    };

    const onHandleMouseDown = (e) => {
        if (!workTable || resizeCol < 0 || jodit.isLocked) return;
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        const rows = getTableRows(workTable);
        startWidths = readColumnWidthsPx(
            workTable,
            rows,
            getLogicalColumnCount(rows) || getColumnCount(rows)
        );
        startX = e.clientX;
        drag = true;
        setColResizingFlag(workTable, true);
        handle?.classList.add('ems-table-col-resizer_moved');
        jodit.lock('ems-table-col-resize');

        const onMove = (ev) => applyResize(ev.clientX - startX);
        const onUp = () => {
            drag = false;
            setColResizingFlag(workTable, false);
            handle?.classList.remove('ems-table-col-resizer_moved');
            jodit.unlock();
            jodit.e?.off(jodit.ew, 'mousemove.emsColResize touchmove.emsColResize', onMove);
            jodit.e?.off(jodit.ow, 'mouseup.emsColResize touchend.emsColResize', onUp);
            startWidths = null;
            document.body.style.removeProperty('cursor');
            document.body.style.removeProperty('user-select');
            if (typeof jodit.synchronizeValues === 'function') jodit.synchronizeValues();
            jodit.s?.focus?.();
        };

        jodit.e.on(jodit.ew, 'mousemove.emsColResize touchmove.emsColResize', onMove);
        jodit.e.on(jodit.ow, 'mouseup.emsColResize touchend.emsColResize', onUp);
    };

    const onEditorMouseMove = (event) => {
        if (jodit.isLocked || drag || jodit.__emsRowResizing) return;
        const root =
            (typeof getEditorBody === 'function' && getEditorBody()) ||
            jodit.editor ||
            null;
        const cell = event.target?.closest?.('td, th');
        if (!cell || !root?.contains(cell)) {
            hideHandle();
            return;
        }
        const table = cell.closest('table');
        if (!table) {
            hideHandle();
            return;
        }
        const colIndex = detectColumnResizeIndex(cell, event.clientX);
        if (colIndex < 0) {
            hideHandle();
            return;
        }
        if (hoverCell !== cell) {
            hoverCell = cell;
        }
        positionHandle(table, colIndex);
    };

    const attachColResizeListeners = () => {
        const root =
            (typeof getEditorBody === 'function' && getEditorBody()) ||
            jodit.editor ||
            null;
        if (!root || root.__emsColResizeMoveBound) return;
        root.__emsColResizeMoveBound = true;
        root.addEventListener('mousemove', onEditorMouseMove);
        root.addEventListener('mouseleave', hideHandle);
    };

    jodit.__emsBindColResizeListeners = attachColResizeListeners;
    jodit.e.on('afterInit', () => requestAnimationFrame(attachColResizeListeners));
    requestAnimationFrame(attachColResizeListeners);
}

function detectRowResizeIndex(cell, clientX, clientY) {
    if (!cell || clientX == null || clientY == null) return -1;
    const rect = cell.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const w = rect.width;
    const h = rect.height;
    if (h <= 0 || w <= 0) return -1;
    if (y < h - TABLE_ROW_EDGE_NEAR) return -1;
    if (x <= TABLE_COL_EDGE_NEAR || x >= w - TABLE_COL_EDGE_NEAR) return -1;
    const tr = cell.closest('tr');
    if (!tr?.parentNode) return -1;
    return [...tr.parentNode.querySelectorAll('tr')].indexOf(tr);
}

/** Only the dragged row changes height; others stay fixed (data-ems-row-heights). */
function registerTableRowResize(jodit, getEditorBody) {
    if (!jodit || jodit.__emsTableRowResize) return;
    jodit.__emsTableRowResize = true;

    let handle = null;
    let hideTimeout = 0;
    let drag = false;
    let startY = 0;
    let startHeights = null;
    let resizeRow = -1;
    let workTable = null;
    let hoverCell = null;

    const getHandleParent = () => jodit.container || getEditorWorkplace(jodit) || jodit.ed?.body;

    const clearHideTimeout = () => {
        if (hideTimeout) {
            window.clearTimeout(hideTimeout);
            hideTimeout = 0;
        }
    };

    const clearRowResizeHover = () => {
        hoverCell = null;
    };

    const hideHandle = () => {
        if (drag) return;
        clearHideTimeout();
        clearRowResizeHover();
        hideTimeout = window.setTimeout(() => handle?.remove(), 80);
    };

    jodit.__emsRowResizeHide = hideHandle;

    const ensureHandle = () => {
        if (handle) return;
        const doc = jodit.ed?.ownerDocument || document;
        handle = doc.createElement('div');
        handle.className = 'ems-table-row-resizer';
        handle.setAttribute('title', 'Drag to resize row');
        handle.addEventListener('mousedown', onHandleMouseDown, true);
        handle.addEventListener('mouseenter', clearHideTimeout);
    };

    const positionHandleForRow = (table, rowIndex) => {
        const rows = getTableRows(table);
        const tr = rows[rowIndex];
        if (!tr) return;
        ensureHandle();
        const tableRect = table.getBoundingClientRect();
        const rowRect = tr.getBoundingClientRect();
        handle.style.position = 'fixed';
        handle.style.left = `${Math.round(tableRect.left)}px`;
        handle.style.top = `${Math.round(rowRect.bottom - 4)}px`;
        handle.style.width = `${Math.max(tableRect.width, 20)}px`;
        handle.style.display = 'block';
        clearHideTimeout();
        getHandleParent()?.appendChild(handle);
        workTable = table;
        resizeRow = rowIndex;
    };

    const applyResize = (delta) => {
        if (!workTable || resizeRow < 0 || !startHeights) return;
        const rows = getTableRows(workTable);
        const next = [...startHeights];
        next[resizeRow] = Math.max(
            MIN_TABLE_ROW_HEIGHT,
            Math.round(startHeights[resizeRow] + delta)
        );
        applyRowHeights(workTable, rows, next);
        positionHandleForRow(workTable, resizeRow);
    };

    const setRowResizingFlag = (table, active) => {
        if (!table) return;
        if (active) {
            table.setAttribute('data-ems-row-resizing', '1');
            jodit.__emsRowResizing = true;
        } else {
            table.removeAttribute('data-ems-row-resizing');
            jodit.__emsRowResizing = false;
        }
    };

    const onHandleMouseDown = (e) => {
        if (!workTable || resizeRow < 0 || jodit.isLocked) return;
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        const rows = getTableRows(workTable);
        startHeights = readRowHeightsPx(workTable, rows);
        startY = e.clientY;
        drag = true;
        setRowResizingFlag(workTable, true);
        handle?.classList.add('ems-table-row-resizer_moved');
        jodit.lock('ems-table-row-resize');

        const onMove = (ev) => applyResize(ev.clientY - startY);
        const onUp = () => {
            drag = false;
            setRowResizingFlag(workTable, false);
            handle?.classList.remove('ems-table-row-resizer_moved');
            jodit.unlock();
            jodit.e?.off(jodit.ew, 'mousemove.emsRowResize touchmove.emsRowResize', onMove);
            jodit.e?.off(jodit.ow, 'mouseup.emsRowResize touchend.emsRowResize', onUp);
            startHeights = null;
            document.body.style.removeProperty('cursor');
            document.body.style.removeProperty('user-select');
            if (typeof jodit.synchronizeValues === 'function') jodit.synchronizeValues();
            jodit.s?.focus?.();
        };

        jodit.e.on(jodit.ew, 'mousemove.emsRowResize touchmove.emsRowResize', onMove);
        jodit.e.on(jodit.ow, 'mouseup.emsRowResize touchend.emsRowResize', onUp);
    };

    const onEditorMouseMove = (event) => {
        if (jodit.isLocked || drag || jodit.__emsColResizing) return;
        const root =
            (typeof getEditorBody === 'function' && getEditorBody()) ||
            jodit.editor ||
            null;
        const cell = event.target?.closest?.('td, th');
        if (!cell || !root?.contains(cell)) {
            hideHandle();
            return;
        }
        const table = cell.closest('table');
        if (!table) {
            hideHandle();
            return;
        }
        const rowIndex = detectRowResizeIndex(cell, event.clientX, event.clientY);
        if (rowIndex < 0) {
            hideHandle();
            return;
        }
        if (hoverCell !== cell) {
            hoverCell = cell;
        }
        positionHandleForRow(table, rowIndex);
    };

    const attachRowResizeListeners = () => {
        const root =
            (typeof getEditorBody === 'function' && getEditorBody()) ||
            jodit.editor ||
            null;
        if (!root || root.__emsRowResizeMoveBound) return;
        root.__emsRowResizeMoveBound = true;
        root.addEventListener('mousemove', onEditorMouseMove);
        root.addEventListener('mouseleave', hideHandle);
    };

    jodit.__emsBindRowResizeListeners = attachRowResizeListeners;
    jodit.e.on('afterInit', () => requestAnimationFrame(attachRowResizeListeners));
    requestAnimationFrame(attachRowResizeListeners);
}

function purgeWorkplaceFloatingChrome(jodit) {
    try {
        jodit.e.fire('hideResizer');
        jodit.e.fire('hideHelpers');
        jodit.e.fire('hidePopup');
    } catch {
        /* ignore */
    }
    const roots = new Set();
    if (jodit.workplace) roots.add(jodit.workplace);
    if (jodit.container) roots.add(jodit.container);
    const workplace = jodit.workplace || jodit.container?.querySelector('.jodit-workplace');
    if (workplace) roots.add(workplace);
    roots.forEach((root) => {
        root.querySelectorAll(FLOATING_CHROME_SELECTOR).forEach((el) => el.remove());
    });
}

/** Single-cell click: no blue box; drag across cells: show blue selection. */
function registerConditionalTableSelection(jodit, getEditorBody) {
    if (!jodit || jodit.__emsConditionalTableSel) return;
    jodit.__emsConditionalTableSel = true;

    const attach = () => {
        const root =
            (typeof getEditorBody === 'function' && getEditorBody()) ||
            jodit.editor ||
            null;
        if (!root || root.__emsConditionalTableSelBound) return;
        root.__emsConditionalTableSelBound = true;

        root.addEventListener(
            'mousedown',
            (e) => {
                if (e.button === 2) {
                    if (getSelectedTableCells(jodit).length > 1) {
                        jodit.__emsPreserveMultiTableSelect = true;
                        jodit.__emsSkipTableSelSync = true;
                        e.stopImmediatePropagation();
                    }
                    return;
                }
                const target = e.target;
                const cell = getTableCellFromNode(target);
                if (cell && root.contains(cell)) {
                    // Always record the start cell so we can detect cross-cell drag.
                    // Do NOT prevent the default or stop propagation here — the browser
                    // must be free to start a text selection within this cell.
                    setActiveTableCell(jodit, cell);
                    clearAllTableCellSelection(jodit);
                    jodit.__emsFormatTableCells = null;
                    jodit.__emsTableDragStartCell = cell;
                    jodit.__emsTableDragActive = true;   // tentative — confirmed only on cross-cell move
                    jodit.__emsTableDragMoved = false;
                    jodit.__emsTableDragCrossedCell = false;
                    jodit.__emsTableDragStartX = e.clientX;
                    jodit.__emsTableDragStartY = e.clientY;
                } else {
                    jodit.__emsTableDragActive = false;
                    jodit.__emsTableDragStartCell = null;
                    jodit.__emsActiveTableCell = null;
                    jodit.__emsFormatTableCells = null;
                    clearAllTableCellSelection(jodit);
                }
            },
            true
        );

        root.addEventListener(
            'mousemove',
            (e) => {
                if (!jodit.__emsTableDragActive || e.buttons !== 1) return;
                const dx = Math.abs(e.clientX - (jodit.__emsTableDragStartX || 0));
                const dy = Math.abs(e.clientY - (jodit.__emsTableDragStartY || 0));
                if (dx > 3 || dy > 3) {
                    jodit.__emsTableDragMoved = true;
                }
                // Only enter multi-cell mode when the mouse actually enters a DIFFERENT cell.
                const startCell = jodit.__emsTableDragStartCell;
                if (startCell && !jodit.__emsTableDragCrossedCell) {
                    const overCell = getTableCellFromNode(e.target);
                    if (overCell && overCell !== startCell && startCell.closest('table') === overCell.closest('table')) {
                        jodit.__emsTableDragCrossedCell = true;
                        // Cancel browser text selection — we are doing cell selection now.
                        jodit.s?.sel?.removeAllRanges?.();
                    }
                }
            },
            true
        );

        root.addEventListener(
            'mouseup',
            (e) => {
                if (e.button !== 0) return;
                if (jodit.__emsPreserveMultiTableSelect || jodit.__emsSkipTableSelSync) {
                    jodit.__emsTableDragActive = false;
                    return;
                }
                jodit.__emsTableDragActive = false;
                const clickCell = getTableCellFromNode(e.target);
                const startCell = jodit.__emsTableDragStartCell;
                jodit.__emsTableDragStartCell = null;
                if (!clickCell || !root.contains(clickCell)) {
                    jodit.__emsActiveTableCell = null;
                    jodit.__emsFormatTableCells = null;
                    clearAllTableCellSelection(jodit);
                    return;
                }
                if (jodit.__emsTableDragCrossedCell && startCell) {
                    // Cross-cell drag completed — select the cell range.
                    const table = startCell.closest('table');
                    const picked =
                        table && selectTableCellRange(jodit, table, startCell, clickCell);
                    if (picked?.length >= 2) {
                        jodit.__emsFormatTableCells = picked;
                        jodit.s?.sel?.removeAllRanges?.();
                    } else {
                        jodit.__emsFormatTableCells = null;
                        clearAllTableCellSelection(jodit);
                    }
                    return;
                }
                // Same-cell drag: normal text selection — don't interfere.
                jodit.__emsTableDragMoved = false;
                jodit.__emsFormatTableCells = null;
                clearAllTableCellSelection(jodit);
            },
            true
        );
    };

    jodit.e.on('afterInit', attach);
    jodit.e.on('afterCommand.emsTableSelSync', (command) => {
        if (TABLE_STRUCTURE_CMD_RE.test(String(command || ''))) {
            scheduleTableSelectionSync(jodit, getEditorBody);
        }
    });
    attach();
}

/** On scroll, hide resize handles so they do not cover the scrollbar (reappear on hover). */
function registerEditorScrollCleanup(jodit, getEditorBody) {
    if (!jodit || jodit.__emsEditorScrollCleanup) return;
    jodit.__emsEditorScrollCleanup = true;

    const hideFloatingHandles = () => {
        purgeWorkplaceFloatingChrome(jodit);
        hideTableResizeHandles(jodit);
    };

    const bind = () => {
        const workplace = jodit.container?.querySelector('.jodit-workplace');
        const wysiwyg =
            (typeof getEditorBody === 'function' && getEditorBody()) ||
            jodit.editor ||
            null;
        if (workplace && !workplace.__emsScrollCleanupBound) {
            workplace.__emsScrollCleanupBound = true;
            workplace.addEventListener('scroll', hideFloatingHandles, { passive: true });
        }
        if (wysiwyg && wysiwyg !== workplace && !wysiwyg.__emsScrollCleanupBound) {
            wysiwyg.__emsScrollCleanupBound = true;
            wysiwyg.addEventListener('scroll', hideFloatingHandles, { passive: true });
        }
    };

    jodit.e.on('afterInit', bind);
    bind();
}

function isRowInThead(tr) {
    return Boolean(tr?.closest?.('thead'));
}

function getTableBodyRows(table) {
    const tbody = table.querySelector('tbody');
    if (tbody) return [...tbody.querySelectorAll(':scope > tr')];
    return [...table.querySelectorAll('tr')].filter((tr) => !tr.closest('thead'));
}

function ensureTableSections(table) {
    const doc = table.ownerDocument || document;
    let thead = table.querySelector('thead');
    let tbody = table.querySelector('tbody');

    const looseRows = [...table.children].filter((el) => el.tagName === 'TR');

    if (!tbody) {
        tbody = doc.createElement('tbody');
        table.appendChild(tbody);
    }

    looseRows.forEach((tr) => {
        if (!tr.closest('thead') && !tr.closest('tbody')) {
            tbody.appendChild(tr);
        }
    });

    if (!thead) {
        thead = doc.createElement('thead');
        table.insertBefore(thead, tbody);
    }

    return { thead, tbody };
}

function convertCellToTh(cell) {
    if (!cell || cell.tagName === 'TH') return cell;
    const th = cell.ownerDocument.createElement('th');
    [...cell.attributes].forEach((a) => th.setAttribute(a.name, a.value));
    th.innerHTML = cell.innerHTML;
    cell.replaceWith(th);
    return th;
}

function convertCellToTd(cell) {
    if (!cell || cell.tagName === 'TD') return cell;
    const td = cell.ownerDocument.createElement('td');
    [...cell.attributes].forEach((a) => td.setAttribute(a.name, a.value));
    td.innerHTML = cell.innerHTML;
    cell.replaceWith(td);
    return td;
}

function convertRowCellsToHeader(tr) {
    [...tr.cells].forEach(convertCellToTh);
}

function convertRowCellsToBody(tr) {
    [...tr.cells].forEach(convertCellToTd);
}

function getSelectedTableRows(jodit, getEditorBody) {
    const cells = getSelectedTableCells(jodit);
  /** @type {HTMLTableRowElement[]} */
    const rows = [];
    const seen = new Set();

    if (cells.length) {
        cells.forEach((cell) => {
            const tr = cell.closest('tr');
            if (tr && !seen.has(tr)) {
                seen.add(tr);
                rows.push(tr);
            }
        });
    } else {
        const cell = getActiveTableCell(jodit, getEditorBody);
        const tr = cell?.closest('tr');
        if (tr) rows.push(tr);
    }

    const table = rows[0]?.closest('table');
    if (!table) return rows;

    const order = getTableRows(table);
    return rows.sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

function canToggleRepeatHeaderRows(jodit, getEditorBody) {
    return getSelectedTableRows(jodit, getEditorBody).length > 0;
}

function isRepeatHeaderSelectionActive(jodit, getEditorBody) {
    const rows = getSelectedTableRows(jodit, getEditorBody);
    if (!rows.length) return false;
  /** Active when every selected row is already in thead (Word-style toggle). */
    return rows.every(isRowInThead);
}

function syncRepeatHeaderAttribute(table) {
    if (!table) return;
    if (table.querySelector('thead tr')) {
        table.setAttribute('data-ems-repeat-header', '1');
    } else {
        table.removeAttribute('data-ems-repeat-header');
    }
}

/** Move selected top row(s) into <thead> for print/PDF repeat — like Word “Repeat header rows”. */
export function toggleRepeatHeaderRows(jodit, getEditorBody) {
    const rows = getSelectedTableRows(jodit, getEditorBody);
    if (!rows.length) return false;

    const table = rows[0].closest('table');
    if (!table) return false;

    const root =
        (typeof getEditorBody === 'function' && getEditorBody()) ||
        jodit.editor ||
        null;
    if (root && !root.contains(table)) return false;

    const { thead, tbody } = ensureTableSections(table);
    const allSelectedInThead = rows.every(isRowInThead);

    if (allSelectedInThead) {
        [...rows].forEach((tr) => {
            convertRowCellsToBody(tr);
            tbody.insertBefore(tr, tbody.firstChild);
        });
        if (!thead.querySelector('tr')) {
            thead.remove();
        }
        syncRepeatHeaderAttribute(table);
    } else {
        const bodyRows = getTableBodyRows(table);
        const indices = rows.map((r) => bodyRows.indexOf(r));
        if (indices.some((i) => i < 0)) {
            window.alert('Select row(s) at the top of the table body to repeat as header.');
            return false;
        }
        indices.sort((a, b) => a - b);
        if (indices[0] !== 0) {
            window.alert('Header rows must start at the first row below any existing header.');
            return false;
        }
        for (let i = 1; i < indices.length; i += 1) {
            if (indices[i] !== indices[i - 1] + 1) {
                window.alert('Select consecutive rows at the top of the table.');
                return false;
            }
        }
        rows.forEach((tr) => {
            convertRowCellsToHeader(tr);
            thead.appendChild(tr);
        });
        syncRepeatHeaderAttribute(table);
    }

    harmonizeInsertedTableCells(root || table.parentElement);
    if (typeof jodit.synchronizeValues === 'function') {
        jodit.synchronizeValues();
    }
    return true;
}

export const EMS_TABLE_REPEAT_HEADER_CONTROL = {
    name: 'emsRepeatHeader',
    icon: 'th-list',
    tooltip: 'Repeat header row at top of each page',
    exec: (editor) => {
        const getBody =
            typeof editor.__emsClauseEditorBody === 'function'
                ? editor.__emsClauseEditorBody
                : () => editor.editor || null;
        toggleRepeatHeaderRows(editor, getBody);
        editor.e?.fire('hidePopup');
        return false;
    },
    isActive: (editor) => {
        const getBody =
            typeof editor.__emsClauseEditorBody === 'function'
                ? editor.__emsClauseEditorBody
                : () => editor.editor || null;
        return isRepeatHeaderSelectionActive(editor, getBody);
    },
    isDisabled: (editor) => {
        const getBody =
            typeof editor.__emsClauseEditorBody === 'function'
                ? editor.__emsClauseEditorBody
                : () => editor.editor || null;
        return !canToggleRepeatHeaderRows(editor, getBody);
    },
};

function registerTableRepeatHeaderControl(jodit, getEditorBody) {
    if (!jodit || jodit.__emsRepeatHeaderControl) return;
    jodit.__emsRepeatHeaderControl = true;

    jodit.registerCommand('emsTableRepeatHeader', () => {
        toggleRepeatHeaderRows(jodit, getEditorBody);
        return false;
    });

    if (!jodit.o.controls.emsRepeatHeader) {
        jodit.o.controls.emsRepeatHeader = EMS_TABLE_REPEAT_HEADER_CONTROL;
    }

    const cellsPopup = jodit.o.popup?.cells;
    if (
        Array.isArray(cellsPopup) &&
        !cellsPopup.some((item) => (typeof item === 'string' ? item : item?.name) === 'emsRepeatHeader')
    ) {
        const deleteIdx = cellsPopup.findIndex(
            (item) => typeof item === 'object' && item?.name === 'deleteTable'
        );
        const insertAt = deleteIdx >= 0 ? deleteIdx : cellsPopup.length;
        cellsPopup.splice(insertAt, 0, '\n', 'emsRepeatHeader');
    }
}

export function registerClauseEditorTableHooks(jodit, getEditorBody) {
    if (!jodit || jodit.__emsTableHooks) return;
    jodit.__emsTableHooks = true;

    jodit.e.on('afterInit.emsTablePx', () => {
        requestAnimationFrame(() => {
            const root =
                (typeof getEditorBody === 'function' && getEditorBody()) ||
                jodit.editor ||
                null;
            if (root) harmonizeInsertedTableCells(root);
        });
    });

    registerTableStructureCommands(jodit, getEditorBody);
    registerTableMultiCellFormatting(jodit, getEditorBody);
    registerTableTextSelectionGuard(jodit, getEditorBody);
    registerConditionalTableSelection(jodit, getEditorBody);
    registerEditorScrollCleanup(jodit, getEditorBody);
    registerTableRepeatHeaderControl(jodit, getEditorBody);
    registerTablePopupContextMenuOnly(jodit, getEditorBody);
    registerTableArrowNavigation(jodit, getEditorBody);
    registerTableRowResize(jodit, getEditorBody);
    registerEmsTableColumnResize(jodit, getEditorBody);

    const observeWorkplace = () => {
        const workplace = jodit.workplace || jodit.container?.querySelector('.jodit-workplace');
        if (!workplace || workplace.__emsFloaterObs) return;
        workplace.__emsFloaterObs = true;
        const obs = new MutationObserver(() => {
            workplace.querySelectorAll(FLOATING_CHROME_SELECTOR).forEach((el) => el.remove());
            jodit.container
                ?.querySelectorAll(FLOATING_CHROME_SELECTOR)
                .forEach((el) => el.remove());
        });
        obs.observe(workplace, { childList: true });
        jodit.e.on('beforeDestruct', () => obs.disconnect());
    };
    jodit.e.on('afterInit', observeWorkplace);
    observeWorkplace();

    let scheduled = false;
    const runHarmonize = () => {
        scheduled = false;
        if (jodit.__emsColResizing || jodit.__emsRowResizing) return;
        const root =
            (typeof getEditorBody === 'function' && getEditorBody()) ||
            jodit.editor ||
            null;
        if (root) harmonizeInsertedTableCells(root);
    };

    const scheduleHarmonize = () => {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                runHarmonize();
                window.setTimeout(runHarmonize, 0);
            });
        });
    };

    jodit.e.on('afterCommand', (command) => {
        const cmd = String(command || '').toLowerCase();
        if (TABLE_STRUCTURE_CMD_RE.test(cmd)) {
            scheduleHarmonize();
        }
    });

    const root =
        (typeof getEditorBody === 'function' && getEditorBody()) || jodit.editor || null;
    if (root && typeof MutationObserver !== 'undefined') {
        const obs = new MutationObserver((records) => {
            const touched = records.some((r) => {
                for (const node of r.addedNodes || []) {
                    if (node.nodeType !== 1) continue;
                    const el = /** @type {Element} */ (node);
                    if (el.tagName === 'TABLE') return true;
                    if (el.tagName === 'TR' || el.tagName === 'TD' || el.tagName === 'TH') return true;
                    if (el.querySelector?.('table, tr, td, th')) return true;
                }
                return false;
            });
            if (touched) {
                scheduleHarmonize();
                jodit.__emsBindColResizeListeners?.();
                jodit.__emsBindRowResizeListeners?.();
            }
        });
        obs.observe(root, { childList: true, subtree: true });
        jodit.e.on('beforeDestruct', () => obs.disconnect());
    }
}

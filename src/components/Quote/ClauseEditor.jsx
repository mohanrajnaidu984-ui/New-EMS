import React, { useRef, useMemo, useState, useEffect, useCallback } from 'react';
import JoditEditor from 'jodit-react';
import {
    registerClauseEditorListCommands,
    normalizeClauseListHtml,
    normalizeClauseListHtmlInString,
    EMS_UL_TOOLBAR_CONTROL,
    EMS_OL_TOOLBAR_CONTROL,
    CLAUSE_LIST_STYLES_CSS,
} from './clauseEditorListPresets';
import {
    harmonizeInsertedTableCells,
    isTableStructureResizeActive,
    registerClauseEditorTableHooks,
    EMS_TABLE_REPEAT_HEADER_CONTROL,
} from './clauseEditorTable';

/**
 * Excel / Word pastes inflate table row heights because they ship:
 *   - inline `height` attribute or `style="height: ..."` on <tr>/<td>/<th>
 *   - multiple <p> tags per cell (which then hit the editor's `p + p { margin-top: 5px }` rule)
 *   - a trailing empty paragraph (e.g. <p><br></p> or <p>&nbsp;</p>) that takes a full line
 *   - Office-only `mso-*` line-height / margin styles on cell content
 * Both functions below strip those — once on the clipboard HTML string before Jodit
 * inserts it, and again on the live DOM as a safety net (Jodit / browser post-processing
 * sometimes re-applies inline styles a few hundred ms after the paste).
 */
/** Inline style props to strip from <tr>/<td>/<th>. We deliberately KEEP source padding / margin
 *  because Word and Excel set tight values (1–3pt) and our default editor CSS replaces them with
 *  0.4em — losing that data inflates row heights, which is exactly the bug we are fixing. */
const CELL_KILL_STYLE_PROPS = [
    'height',
    'min-height',
    'mso-line-height-alt',
    'mso-line-height-rule',
    'mso-margin-top-alt',
    'mso-margin-bottom-alt',
];

/** Stricter strip list for <p>/<div>/<li>/<span>/<font> *inside* cells — these inflate row heights
 *  via per-element margins / line-heights that the source did not actually want preserved. */
const CELL_CHILD_KILL_STYLE_PROPS = [
    'height',
    'min-height',
    'line-height',
    'margin-top',
    'margin-bottom',
    'padding-top',
    'padding-bottom',
    'mso-line-height-alt',
    'mso-line-height-rule',
    'mso-margin-top-alt',
    'mso-margin-bottom-alt',
];

const isCellEmptyOfText = (el) =>
    !el || !el.textContent || !el.textContent.replace(/\u00a0/g, '').trim();

const cellHasOnlyBrChild = (el) =>
    el && el.children && el.children.length === 1 && el.firstElementChild?.tagName === 'BR';

const cleanCellSpacingNodes = (cell) => {
    if (!cell) return;
    // Walk from the end and drop trailing empty <p>/<br> noise so Excel's terminator
    // paragraph (<p><br></p>) doesn't take a full line.
    let last = cell.lastElementChild;
    while (last) {
        const empty =
            isCellEmptyOfText(last) &&
            (last.tagName === 'BR' ||
                (last.tagName === 'P' && (last.children.length === 0 || cellHasOnlyBrChild(last))));
        if (!empty) break;
        const prev = last.previousElementSibling;
        last.remove();
        last = prev;
    }
    // If a cell now has a single empty <p>, collapse its inner <br> so the cell stays
    // editable without an extra line of height.
    if (cell.children.length === 1) {
        const only = cell.firstElementChild;
        if (only && only.tagName === 'P' && isCellEmptyOfText(only) && cellHasOnlyBrChild(only)) {
            only.innerHTML = '';
        }
    }
};

const normalizePastedTables = (root) => {
    if (!root || typeof root.querySelectorAll !== 'function') return;
    if (isTableStructureResizeActive(root)) return;
    const tables = root.querySelectorAll('table');
    tables.forEach((table) => {
        table.style.tableLayout = 'fixed';
        if (table.style.width === '100%') table.style.removeProperty('width');
        const keepRowHeights = table.hasAttribute('data-ems-row-heights');
        const stripProps = keepRowHeights
            ? CELL_KILL_STYLE_PROPS.filter((p) => p !== 'height' && p !== 'min-height')
            : CELL_KILL_STYLE_PROPS;
        table.querySelectorAll('tr, td, th').forEach((cell) => {
            if (!keepRowHeights) cell.removeAttribute('height');
            if (cell.style) {
                stripProps.forEach((p) => cell.style.removeProperty(p));
            }
        });
        table.querySelectorAll('td, th').forEach(cleanCellSpacingNodes);
        // Inside cells: strip margin / line-height noise on inline wrappers so each cell
        // gets its height from the actual text, not from Word/Excel <p> defaults.
        table.querySelectorAll(
            'td p, td div, td li, td span, td font, th p, th div, th li, th span, th font'
        ).forEach((el) => {
            if (el.style) {
                CELL_CHILD_KILL_STYLE_PROPS.forEach((p) => el.style.removeProperty(p));
            }
            el.removeAttribute('height');
        });
    });
    harmonizeInsertedTableCells(root);
};

/** Word/Excel block styles that pull pasted lines to the extreme left of the editor. */
const PASTE_BLOCK_ALIGN_KILL_PROPS = [
    'margin-left',
    'margin-right',
    'padding-left',
    'padding-right',
    'text-indent',
    'left',
    'right',
    'position',
    'top',
    'transform',
    'mso-margin-left-alt',
    'mso-padding-alt',
];

const isInsideTable = (el) => Boolean(el?.closest?.('table'));

/** Remove Office hanging-indent / zero-margin inline styles on paragraphs and lists. */
const normalizePastedBlockAlignment = (root) => {
    if (!root || typeof root.querySelectorAll !== 'function') return;

    root.querySelectorAll('div[class*="WordSection"], div[class*="OutlineElement"], div[class*="Mso"]').forEach((wrapper) => {
        if (isInsideTable(wrapper)) return;
        if (wrapper.style) {
            PASTE_BLOCK_ALIGN_KILL_PROPS.forEach((p) => wrapper.style.removeProperty(p));
        }
        const parent = wrapper.parentElement;
        if (!parent) return;
        const unwrap =
            parent.id === '__ems_paste_root' ||
            parent.classList?.contains('jodit-wysiwyg') ||
            parent.classList?.contains('clause-editor-wrapper');
        if (!unwrap) return;
        while (wrapper.firstChild) {
            parent.insertBefore(wrapper.firstChild, wrapper);
        }
        wrapper.remove();
    });

    root.querySelectorAll('p, div, ul, ol, li, blockquote').forEach((el) => {
        if (isInsideTable(el)) return;
        if (el.style) {
            PASTE_BLOCK_ALIGN_KILL_PROPS.forEach((p) => el.style.removeProperty(p));
        }
    });
};

/** Same cleanup on clipboard HTML before Jodit inserts it (tables + block alignment). */
const sanitizePastedHtmlString = (html) => {
    if (!html || typeof html !== 'string' || !/<[a-z][\s>]/i.test(html)) return html;
    let doc;
    try {
        doc = new DOMParser().parseFromString(`<div id="__ems_paste_root">${html}</div>`, 'text/html');
    } catch (_e) {
        return html;
    }
    const root = doc.getElementById('__ems_paste_root');
    if (!root) return html;
    normalizePastedTables(root);
    normalizePastedBlockAlignment(root);
    return root.innerHTML;
};

// Custom Table Icon
const TableIcon = () => (
    <svg viewBox="0 0 18 18">
        <rect className="ql-fill" height="12" width="12" x="3" y="3" />
        <rect className="ql-fill" height="2" width="12" x="3" y="8" />
        <rect className="ql-fill" height="12" width="2" x="8" y="3" />
    </svg>
);

const ClauseEditor = ({ html, onChange, style }) => {
    const editor = useRef(null);
    const wrapperRef = useRef(null);
    /**
     * Last HTML we reported via onChange. When parent echoes the same string, we must not update the `value`
     * passed to jodit-react — its useEffect does `jodit.value = value` whenever strings differ from Jodit's
     * normalized HTML, which resets the caret. We only sync React `value` when html truly changes from outside.
     */
    const lastEmittedRef = useRef(html ?? '');
    const [value, setValue] = useState(() => html ?? '');

    useEffect(() => {
        const incoming = html ?? '';
        if (incoming === lastEmittedRef.current) {
            return;
        }
        lastEmittedRef.current = incoming;
        setValue(incoming);
    }, [html]);

    /** Resolve the contenteditable body. Prefer the Jodit instance's `.editor` field; fall back to
     *  a DOM query inside our wrapper so this works across jodit-react versions / minified builds. */
    const getEditorBody = useCallback(() => {
        const inst = editor.current;
        const fromRef =
            inst?.editor?.editor ||
            inst?.editor ||
            (inst && typeof inst === 'object' && inst.s?.html?.parentNode) ||
            null;
        if (fromRef && fromRef.querySelectorAll) return fromRef;
        return wrapperRef.current?.querySelector('.jodit-wysiwyg') || null;
    }, []);

    /** Run multiple times: once now, again on next frame, again ~300ms / ~1.2s out — covers any
     *  Jodit post-paste pass (autoresize / cleanHTML / mso-style stripper) that re-introduces spacing. */
    const cleanupAfterPaste = useCallback(() => {
        const root = getEditorBody();
        if (!root) return;
        normalizePastedTables(root);
        normalizePastedBlockAlignment(root);
        normalizeClauseListHtml(root);
        requestAnimationFrame(() => {
            const r = getEditorBody();
            normalizePastedTables(r);
            normalizePastedBlockAlignment(r);
            normalizeClauseListHtml(r);
        });
        setTimeout(() => {
            const r = getEditorBody();
            normalizePastedTables(r);
            normalizePastedBlockAlignment(r);
            normalizeClauseListHtml(r);
        }, 300);
        setTimeout(() => {
            const r = getEditorBody();
            normalizePastedTables(r);
            normalizePastedBlockAlignment(r);
            normalizeClauseListHtml(r);
        }, 1200);
    }, [getEditorBody]);

    /** Intercept clipboard HTML BEFORE Jodit inserts it so the editor never sees the dirty Excel/Word
     *  height/margin attributes. Jodit fires `processPaste(event, text, types)` and lets the handler
     *  return a replacement string. */
    const processPasteHandler = useCallback((_e, text /* , _types */) => {
        if (typeof text !== 'string') return undefined;
        if (!/<[a-z][\s>]/i.test(text)) return undefined;
        return sanitizePastedHtmlString(text);
    }, []);

    /** Keep tables clean even if Jodit / a Word-paste plugin re-injects inline styles later. */
    useEffect(() => {
        const root = getEditorBody();
        if (!root || typeof MutationObserver === 'undefined') return undefined;
        let scheduled = false;
        const run = () => {
            scheduled = false;
            normalizePastedTables(root);
        };
        const obs = new MutationObserver((records) => {
            // Only react if something inside a table changed — avoid loops on plain typing.
            const touchesTable = records.some((r) => {
                if (r.target && r.target.closest && r.target.closest('table')) return true;
                return Array.from(r.addedNodes || []).some(
                    (n) => n.nodeType === 1 && (n.tagName === 'TABLE' || n.querySelector?.('table'))
                );
            });
            if (!touchesTable || scheduled) return;
            if (isTableStructureResizeActive(root)) return;
            scheduled = true;
            requestAnimationFrame(run);
        });
        obs.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['height', 'style'] });
        return () => obs.disconnect();
        // Re-bind when the editor instance becomes available — `value` change is the most reliable
        // proxy for "editor mounted" in jodit-react.
    }, [value, getEditorBody]);

    /** Fix split <ol> blocks and duplicate typed "1." prefixes in loaded clause HTML. */
    useEffect(() => {
        const root = getEditorBody();
        if (!root) return;
        normalizePastedBlockAlignment(root);
        normalizeClauseListHtml(root);
        requestAnimationFrame(() => {
            const r = getEditorBody();
            normalizePastedBlockAlignment(r);
            normalizeClauseListHtml(r);
        });
    }, [value, getEditorBody]);

    const config = useMemo(() => ({
        readonly: false,
        placeholder: 'Start typing...',
        height: style?.height || 400,
        minHeight: 200,
        /** Built-in orderedList plugin uses commitStyle and only wraps part of the selection — conflicts with EMS list presets. */
        disablePlugins: ['orderedList', 'resizeCells', 'resizer', 'addNewLine'],
        /** Enter-icon “add line” handle (before/after tables) uses position:fixed and blocks the horizontal scrollbar when scrolling. */
        addNewLine: false,
        addNewLineOnDBLClick: false,
        enableDragAndDropFileToEditor: true,
        /** Skip Word/Excel paste plugin so Jodit does not run applyStyles() (it strips border* from inline CSS). */
        askBeforePasteFromWord: false,
        askBeforePasteHTML: false,
        processPasteFromWord: false,
        uploader: {
            insertImageAsBase64URI: true
        },
        colorPickerDefaultTab: 'color',
        toolbarAdaptive: false,
        toolbarButtonSize: 'xsmall',
        globalFullSize: true,
        buttons: [
            'undo', 'redo', '|',
            'bold', 'italic', 'underline', 'strikethrough', '|',
            'brush', 'font', 'fontsize', 'paragraph', '|',
            'ul', 'ol', 'indent', 'outdent', '|',
            'image', 'table', 'emsRepeatHeader', 'link', '|',
            'left', 'center', 'right', 'justify', '|',
            'hr', 'eraser', 'fullsize'
        ],
        controls: {
            ul: EMS_UL_TOOLBAR_CONTROL,
            ol: EMS_OL_TOOLBAR_CONTROL,
            emsRepeatHeader: EMS_TABLE_REPEAT_HEADER_CONTROL,
        },
        showCharsCounter: false,
        showWordsCounter: false,
        showXPathInStatusbar: false,
        /** Image corner handles only; table columns use EMS col resize (not Jodit % resize). */
        allowResizeTags: new Set(['img']),
        tableAllowCellResize: false,
        table: {
            splitBlockOnInsertTable: true,
            useExtraClassesOptions: true,
            /** Blue highlight only when 2+ cells selected (see clauseEditorTable sync). */
            selectionCellStyle:
                'background-color: rgba(30, 136, 229, 0.18) !important; outline: 1px solid #1e88e5 !important;',
            allowCellSelection: true,
        },
        /** Strip Excel/Word height + empty trailing <p><br></p> noise:
         *   - processPaste: clean the clipboard HTML BEFORE Jodit inserts it (primary defense).
         *   - afterPaste / paste: clean the live DOM as a fallback (Jodit / plugins may add styles later). */
        events: {
            processPaste: processPasteHandler,
            afterPaste: cleanupAfterPaste,
            paste: cleanupAfterPaste,
            afterInit: (jodit) => {
                const getBody = () =>
                    jodit.editor ||
                    wrapperRef.current?.querySelector('.jodit-wysiwyg') ||
                    null;
                jodit.__emsClauseEditorBody = getBody;
                registerClauseEditorListCommands(jodit);
                registerClauseEditorTableHooks(jodit, getBody);
                jodit.e.on('toggleFullSize.emsClause', (enable) => {
                    const wrap = wrapperRef.current;
                    const container = jodit.container;
                    if (wrap) wrap.classList.toggle('clause-editor-fullsize', !!enable);
                    if (container) {
                        if (enable) {
                            container.style.setProperty('width', '100vw', 'important');
                            container.style.setProperty('height', '100vh', 'important');
                            container.style.setProperty('max-width', 'none', 'important');
                        } else {
                            container.style.removeProperty('width');
                            container.style.removeProperty('height');
                            container.style.removeProperty('max-width');
                        }
                    }
                    document.body.style.overflow = enable ? 'hidden' : '';
                });
            },
        },
    }), [style?.height, cleanupAfterPaste, processPasteHandler]);

    const handleChange = (newContent) => {
        const root = getEditorBody();
        const domHtml = root?.innerHTML ?? '';
        let content = newContent ?? '';
        /* Jodit value can omit <table> after list toolbar sync even when the DOM still has it. */
        if (domHtml.includes('<table') && !String(content).includes('<table')) {
            content = domHtml;
        }
        const normalized = normalizeClauseListHtmlInString(content);
        const fromParent = onChange(normalized);
        // Parent may post-process the HTML (e.g. re-sync clause 4.1 with the table total). In that case
        // the next render will arrive with `html = synced` — keep `lastEmittedRef` aligned so the editor
        // does not see it as an external change and reset the caret.
        lastEmittedRef.current = typeof fromParent === 'string' ? fromParent : normalized;
        /** Intentionally no setValue — keeps `value` prop stable so jodit-react does not overwrite Jodit's DOM. */
    };

    return (
        <div
            ref={wrapperRef}
            style={{ width: '100%', minHeight: 0, ...style, display: 'flex', flexDirection: 'column' }}
            className="clause-editor-wrapper"
        >
            <JoditEditor
                ref={editor}
                value={value}
                config={config}
                tabIndex={1} // tabIndex of textarea
                onChange={handleChange}
            />
            <style>
                {`
                .clause-editor-wrapper .jodit-container {
                     border: 1px solid #e2e8f0 !important;
                     border-radius: 4px;
                     display: flex !important;
                     flex-direction: column !important;
                     width: 100% !important;
                     min-height: 0 !important;
                }
                /* Fullscreen — escape narrow left panel (100% !important was blocking Jodit resize). */
                .clause-editor-wrapper .jodit-container.jodit_fullsize,
                .clause-editor-wrapper.clause-editor-fullsize .jodit-container {
                    position: fixed !important;
                    top: 0 !important;
                    left: 0 !important;
                    right: 0 !important;
                    bottom: 0 !important;
                    width: 100vw !important;
                    height: 100vh !important;
                    max-width: none !important;
                    min-width: 0 !important;
                    margin: 0 !important;
                    border-radius: 0 !important;
                    z-index: 100001 !important;
                }
                .clause-editor-wrapper .jodit-container.jodit_fullsize .jodit-workplace,
                .clause-editor-wrapper.clause-editor-fullsize .jodit-workplace {
                    flex: 1 1 auto !important;
                    min-height: 0 !important;
                    height: auto !important;
                    overflow: auto !important;
                }
                .clause-editor-wrapper.clause-editor-fullsize {
                    position: static !important;
                    z-index: 100001 !important;
                    overflow: visible !important;
                }
                .clause-editor-wrapper .jodit-toolbar__box {
                    background-color: #f8fafc;
                    border-bottom: 1px solid #e2e8f0;
                    flex-shrink: 0;
                    padding: 1px 2px !important;
                }
                .clause-editor-wrapper .jodit-toolbar-editor-collection {
                    gap: 0 !important;
                }
                .clause-editor-wrapper .jodit-ui-group {
                    gap: 0 !important;
                    margin: 0 !important;
                }
                .clause-editor-wrapper .jodit-toolbar-button {
                    width: 22px !important;
                    height: 22px !important;
                    min-width: 22px !important;
                    margin: 0 1px !important;
                }
                .clause-editor-wrapper .jodit-toolbar-button__button {
                    width: 22px !important;
                    height: 22px !important;
                    min-height: 22px !important;
                    padding: 0 !important;
                }
                .clause-editor-wrapper .jodit-toolbar-button__icon,
                .clause-editor-wrapper .jodit-toolbar-button__icon svg {
                    width: 13px !important;
                    height: 13px !important;
                }
                .clause-editor-wrapper .jodit-toolbar-button__text {
                    font-size: 10px !important;
                    line-height: 1 !important;
                }
                /* Split buttons need room for the dropdown chevron (22px width was clipping it). */
                .clause-editor-wrapper .jodit-toolbar-button_with-trigger_true {
                    width: auto !important;
                    min-width: 28px !important;
                }
                .clause-editor-wrapper .jodit-toolbar-button_with-trigger_true .jodit-toolbar-button__button {
                    width: 18px !important;
                    min-width: 18px !important;
                }
                .clause-editor-wrapper .jodit-toolbar-select {
                    height: 22px !important;
                    min-width: auto !important;
                }
                .clause-editor-wrapper .jodit-toolbar-button__trigger,
                .clause-editor-wrapper .jodit-toolbar-select__trigger {
                    opacity: 0.9 !important;
                    flex-shrink: 0;
                    width: 10px !important;
                    min-width: 10px !important;
                    color: #334155;
                }
                .clause-editor-wrapper .jodit-toolbar-button__trigger svg,
                .clause-editor-wrapper .jodit-toolbar-select__trigger svg {
                    width: 8px !important;
                    height: 8px !important;
                    fill: #334155 !important;
                    stroke: #334155 !important;
                    opacity: 1 !important;
                }
                .clause-editor-wrapper .jodit-workplace {
                    overflow: auto !important;
                    flex: 1 1 auto !important;
                    min-height: 0 !important;
                }
                /* Image/add-line floaters must not cover the horizontal scrollbar. */
                .clause-editor-wrapper .jodit-resizer,
                .clause-editor-wrapper .jodit-workplace > .jodit-resizer,
                .clause-editor-wrapper .jodit-add-new-line {
                    display: none !important;
                    pointer-events: none !important;
                    visibility: hidden !important;
                }
                .clause-editor-wrapper .jodit-table-resizer {
                    display: none !important;
                    pointer-events: none !important;
                }
                /* Column resize — vertical grab at cell border. */
                .clause-editor-wrapper .jodit-wysiwyg td.ems-col-resize-hover,
                .clause-editor-wrapper .jodit-wysiwyg th.ems-col-resize-hover {
                    cursor: col-resize !important;
                }
                .clause-editor-wrapper .ems-table-col-resizer {
                    position: fixed;
                    z-index: 10000;
                    width: 10px;
                    margin-left: -5px;
                    cursor: col-resize !important;
                    pointer-events: auto !important;
                    display: block !important;
                    background: rgba(30, 136, 229, 0.12);
                }
                .clause-editor-wrapper .ems-table-col-resizer:hover,
                .clause-editor-wrapper .ems-table-col-resizer_moved {
                    background-color: rgba(30, 136, 229, 0.35);
                }
                .clause-editor-wrapper .jodit-wysiwyg td.ems-row-resize-hover,
                .clause-editor-wrapper .jodit-wysiwyg th.ems-row-resize-hover {
                    cursor: row-resize !important;
                }
                /* Row resize (EMS) — horizontal grab at bottom of row. */
                .clause-editor-wrapper .ems-table-row-resizer {
                    position: fixed;
                    z-index: 10000;
                    height: 8px;
                    margin-top: -4px;
                    cursor: row-resize !important;
                    pointer-events: auto !important;
                    display: block !important;
                    background: rgba(30, 136, 229, 0.12);
                }
                .clause-editor-wrapper .ems-table-row-resizer:hover,
                .clause-editor-wrapper .ems-table-row-resizer_moved {
                    background-color: rgba(30, 136, 229, 0.35);
                }
                .clause-editor-wrapper .jodit-workplace {
                    position: relative;
                }
                .clause-editor-wrapper .jodit-workplace::-webkit-scrollbar {
                    height: 14px;
                }
                .clause-editor-wrapper .jodit-workplace::-webkit-scrollbar-thumb {
                    background: #94a3b8;
                    border-radius: 4px;
                }
                /* Single-cell caret: no stray outline; multi-cell blue comes from Jodit selectionCellStyle. */
                .clause-editor-wrapper .jodit-wysiwyg td,
                .clause-editor-wrapper .jodit-wysiwyg th {
                    outline: none;
                }
                /* Left editor only: tight rhythm (~half cursor between paragraphs). */
                .clause-editor-wrapper .jodit-wysiwyg {
                    line-height: 1.25 !important;
                    padding: 6px 8px !important;
                    box-sizing: border-box !important;
                    overflow-x: auto !important;
                    overflow-y: visible !important;
                    min-height: 100%;
                    user-select: text !important;
                    -webkit-user-select: text !important;
                    cursor: text;
                }
                /* Top-level blocks share the same left edge as typed text (not flush to the box border). */
                .clause-editor-wrapper .jodit-wysiwyg > p,
                .clause-editor-wrapper .jodit-wysiwyg > div,
                .clause-editor-wrapper .jodit-wysiwyg > ul,
                .clause-editor-wrapper .jodit-wysiwyg > ol,
                .clause-editor-wrapper .jodit-wysiwyg > blockquote {
                    margin-left: 0 !important;
                    margin-right: 0 !important;
                    text-indent: 0 !important;
                }
                .clause-editor-wrapper .jodit-wysiwyg p,
                .clause-editor-wrapper .jodit-wysiwyg li {
                    margin-top: 0 !important;
                    margin-bottom: 0 !important;
                    line-height: 1.25 !important;
                }
                .clause-editor-wrapper .jodit-wysiwyg > ul,
                .clause-editor-wrapper .jodit-wysiwyg > ol {
                    padding-left: 1.5em !important;
                }
                .clause-editor-wrapper .jodit-wysiwyg ol > li,
                .clause-editor-wrapper .jodit-wysiwyg ul > li {
                    display: list-item !important;
                }
                .clause-editor-wrapper .jodit-wysiwyg p + p {
                    margin-top: 5px !important;
                }
                .clause-editor-wrapper .jodit-wysiwyg table,
                .clause-editor-wrapper .jodit-wysiwyg td,
                .clause-editor-wrapper .jodit-wysiwyg th {
                    border: 1px solid #64748b !important;
                    border-collapse: collapse !important;
                }
                .clause-editor-wrapper .jodit-wysiwyg table thead th,
                .clause-editor-wrapper .jodit-wysiwyg table thead td {
                    background-color: #f1f5f9 !important;
                    font-weight: 600 !important;
                }
                .clause-editor-wrapper .jodit-wysiwyg table {
                    border-collapse: collapse !important;
                    border-spacing: 0 !important;
                    table-layout: fixed !important;
                    width: auto !important;
                    max-width: none !important;
                }
                .clause-editor-wrapper .jodit-wysiwyg table[data-ems-col-widths] {
                    width: auto !important;
                }
                /* Pasted tables from Excel/Word should keep their source rhythm.
                   The cleanup runs in JS, but these rules act as a safety net so
                   the global p / p+p rules above never inflate cell heights. */
                .clause-editor-wrapper .jodit-wysiwyg table {
                    margin-top: 4px !important;
                    margin-bottom: 4px !important;
                }
                .clause-editor-wrapper .jodit-wysiwyg table tr,
                .clause-editor-wrapper .jodit-wysiwyg table td,
                .clause-editor-wrapper .jodit-wysiwyg table th {
                    line-height: 1.25 !important;
                    vertical-align: middle !important;
                    box-sizing: border-box !important;
                }
                /* Jodit's default is padding: 0.4em (~6px each side) which inflates rows when source
                   inline padding is absent. Use a compact Word-typical default — written WITHOUT
                   !important so an explicit inline 'padding' from the pasted source still wins. */
                .clause-editor-wrapper .jodit-wysiwyg table tr td,
                .clause-editor-wrapper .jodit-wysiwyg table tr th {
                    padding: 2px 6px;
                }
                .clause-editor-wrapper .jodit-wysiwyg td p,
                .clause-editor-wrapper .jodit-wysiwyg th p,
                .clause-editor-wrapper .jodit-wysiwyg td div,
                .clause-editor-wrapper .jodit-wysiwyg th div,
                .clause-editor-wrapper .jodit-wysiwyg td li,
                .clause-editor-wrapper .jodit-wysiwyg th li {
                    margin: 0 !important;
                    padding: 0 !important;
                    line-height: 1.25 !important;
                }
                .clause-editor-wrapper .jodit-wysiwyg td p + p,
                .clause-editor-wrapper .jodit-wysiwyg th p + p {
                    margin-top: 0 !important;
                }
                /* Hide stray empty trailing <p><br></p> that Excel/Word leaves at the end of cells. */
                .clause-editor-wrapper .jodit-wysiwyg td > p:empty,
                .clause-editor-wrapper .jodit-wysiwyg th > p:empty {
                    display: none;
                }
                ${CLAUSE_LIST_STYLES_CSS}
            `}
            </style>
        </div>
    );
};

export default ClauseEditor;

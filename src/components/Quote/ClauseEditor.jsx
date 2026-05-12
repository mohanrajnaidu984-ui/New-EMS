import React, { useRef, useMemo, useState, useEffect, useCallback } from 'react';
import JoditEditor from 'jodit-react';

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
    const tables = root.querySelectorAll('table');
    tables.forEach((table) => {
        table.querySelectorAll('tr, td, th').forEach((cell) => {
            cell.removeAttribute('height');
            if (cell.style) {
                CELL_KILL_STYLE_PROPS.forEach((p) => cell.style.removeProperty(p));
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
};

/** Same cleanup as normalizePastedTables, but operating on an HTML string before Jodit inserts it. */
const sanitizePastedHtmlString = (html) => {
    if (!html || typeof html !== 'string' || !/<table[\s>]/i.test(html)) return html;
    let doc;
    try {
        doc = new DOMParser().parseFromString(`<div id="__ems_paste_root">${html}</div>`, 'text/html');
    } catch (_e) {
        return html;
    }
    const root = doc.getElementById('__ems_paste_root');
    if (!root) return html;
    normalizePastedTables(root);
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
        requestAnimationFrame(() => normalizePastedTables(root));
        setTimeout(() => normalizePastedTables(root), 300);
        setTimeout(() => normalizePastedTables(root), 1200);
    }, [getEditorBody]);

    /** Intercept clipboard HTML BEFORE Jodit inserts it so the editor never sees the dirty Excel/Word
     *  height/margin attributes. Jodit fires `processPaste(event, text, types)` and lets the handler
     *  return a replacement string. */
    const processPasteHandler = useCallback((_e, text /* , _types */) => {
        if (typeof text !== 'string') return undefined;
        const cleaned = sanitizePastedHtmlString(text);
        return cleaned !== text ? cleaned : undefined;
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
            scheduled = true;
            requestAnimationFrame(run);
        });
        obs.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['height', 'style'] });
        return () => obs.disconnect();
        // Re-bind when the editor instance becomes available — `value` change is the most reliable
        // proxy for "editor mounted" in jodit-react.
    }, [value, getEditorBody]);

    const config = useMemo(() => ({
        readonly: false,
        placeholder: 'Start typing...',
        height: style?.height || 400,
        minHeight: 200,
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
        buttons: [
            'undo', 'redo', '|',
            'bold', 'italic', 'underline', 'strikethrough', '|',
            'brush', 'font', 'fontsize', 'paragraph', '|',
            'ul', 'ol', '|',
            'image', 'table', 'link', '|',
            'left', 'center', 'right', 'justify', '|',
            'hr', 'eraser', 'fullsize'
        ],
        showCharsCounter: false,
        showWordsCounter: false,
        showXPathInStatusbar: false,
        table: {
            splitBlockOnInsertTable: true,
            useExtraClassesOptions: true,
            // Highly visible blue overlay on multi-selected cells — drag across cells (or shift-click) to select
            // multiple rows / columns, then use the table popup's "Delete row"/"Delete column" buttons.
            selectionCellStyle:
                'background-color: rgba(37, 99, 235, 0.18) !important; outline: 2px solid #2563eb !important; outline-offset: -2px !important;',
            allowCellSelection: true,
            allowCellResize: true,
        },
        /** Strip Excel/Word height + empty trailing <p><br></p> noise:
         *   - processPaste: clean the clipboard HTML BEFORE Jodit inserts it (primary defense).
         *   - afterPaste / paste: clean the live DOM as a fallback (Jodit / plugins may add styles later). */
        events: {
            processPaste: processPasteHandler,
            afterPaste: cleanupAfterPaste,
            paste: cleanupAfterPaste,
        },
    }), [style?.height, cleanupAfterPaste, processPasteHandler]);

    const handleChange = (newContent) => {
        const fromParent = onChange(newContent);
        // Parent may post-process the HTML (e.g. re-sync clause 4.1 with the table total). In that case
        // the next render will arrive with `html = synced` — keep `lastEmittedRef` aligned so the editor
        // does not see it as an external change and reset the caret.
        lastEmittedRef.current = typeof fromParent === 'string' ? fromParent : newContent;
        /** Intentionally no setValue — keeps `value` prop stable so jodit-react does not overwrite Jodit's DOM. */
    };

    return (
        <div ref={wrapperRef} style={{ ...style, display: 'flex', flexDirection: 'column' }} className="clause-editor-wrapper">
            <JoditEditor
                ref={editor}
                value={value}
                config={config}
                tabIndex={1} // tabIndex of textarea
                onChange={handleChange}
            />
            <style>
                {`
                .jodit-container {
                     border: 1px solid #e2e8f0 !important;
                     border-radius: 4px;
                }
                .jodit-toolbar__box {
                    background-color: #f8fafc;
                    border-bottom: 1px solid #e2e8f0;
                }
                .jodit-workplace {
                    overflow-y: auto !important;
                }
                /* Left editor only: tight rhythm (~half cursor between paragraphs). */
                .clause-editor-wrapper .jodit-wysiwyg {
                    line-height: 1.25 !important;
                }
                .clause-editor-wrapper .jodit-wysiwyg p,
                .clause-editor-wrapper .jodit-wysiwyg li {
                    margin: 0 !important;
                    line-height: 1.25 !important;
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
                .clause-editor-wrapper .jodit-wysiwyg table {
                    border-collapse: collapse !important;
                    border-spacing: 0 !important;
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
                    height: auto !important;
                    line-height: 1.25 !important;
                    vertical-align: middle !important;
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
            `}
            </style>
        </div>
    );
};

export default ClauseEditor;

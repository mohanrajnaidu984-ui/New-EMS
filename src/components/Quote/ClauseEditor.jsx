import React, { useRef, useMemo, useEffect, useCallback } from 'react';
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
    initializeAllOfficePastedTableColumns,
    initializeOfficePastedTableColumns,
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
            /* Keep <br> so the caret has a visible target — empty <p></p> is hidden by CSS. */
            only.innerHTML = '<br>';
        }
    }
};

const OFFICE_PASTE_TABLE_ATTR = 'data-ems-paste-source';
const OFFICE_PASTE_TABLE_VALUE = 'office';

const OFFICE_STYLE_STRIP_RE = /mso-[a-z-]+:[^;]+;?/gi;

const convertOfficeCssUnits = (css) =>
    String(css || '').replace(/([0-9.]+)(pt|cm)/gi, (match, units, metrics) => {
        switch (String(metrics).toLowerCase()) {
            case 'pt':
                return `${(parseFloat(units) * 1.328).toFixed(2)}px`;
            case 'cm':
                return `${(parseFloat(units) * 37.7952755906).toFixed(2)}px`;
            default:
                return match;
        }
    });

const normalizeOfficeInlineCss = (css) =>
    convertOfficeCssUnits(String(css || '').replace(OFFICE_STYLE_STRIP_RE, ''));

const extractOfficeHtmlFragment = (html) => {
    let s = String(html || '');
    const start = s.search(/<!--StartFragment-->/i);
    if (start !== -1) s = s.substring(start + '<!--StartFragment-->'.length);
    const end = s.search(/<!--EndFragment-->/i);
    if (end !== -1) s = s.substring(0, end);
    return s.trim();
};

const extractStyleBlocksFromOfficeHtml = (html) => {
    const styles = [];
    const source = String(html || '');
    const re = /<style[^>]*>([\s\S]*?)<\/style>/gi;
    let match = re.exec(source);
    while (match) {
        styles.push(match[1]);
        match = re.exec(source);
    }
    return styles.join('\n');
};

const buildOfficePreviewDocumentHtml = (html) => {
    const raw = String(html || '').trim();
    if (!raw) return '';
    if (/<html[\s>]/i.test(raw)) return raw;
    const fragment = extractOfficeHtmlFragment(raw) || raw;
    const styleText = extractStyleBlocksFromOfficeHtml(raw);
    const headInner = styleText ? `<style>${styleText}</style>` : '';
    return `<!DOCTYPE html><html><head>${headInner}</head><body>${fragment}</body></html>`;
};

/** Copy rendered Excel/Word styles onto inline style attributes (colors, borders, fonts, merges). */
const OFFICE_INLINE_STYLE_PROPS = [
    'background-color',
    'color',
    'font-size',
    'font-family',
    'font-weight',
    'font-style',
    'text-align',
    'vertical-align',
    'text-decoration',
    'border',
    'border-top',
    'border-right',
    'border-bottom',
    'border-left',
    'padding',
    'padding-top',
    'padding-right',
    'padding-bottom',
    'padding-left',
    'width',
    'height',
];

const inlineComputedOfficeTableStyles = (doc, win) => {
    if (!doc?.body || !win?.getComputedStyle) return;
    doc.body.querySelectorAll('table tr, table td, table th, table span, table font, table p, table div').forEach((el) => {
        if (!el.closest?.('table')) return;
        const computed = win.getComputedStyle(el);
        const parts = [];
        OFFICE_INLINE_STYLE_PROPS.forEach((prop) => {
            let val = computed.getPropertyValue(prop);
            if (!val) return;
            val = val.trim();
            if (!val || val === 'initial' || val === 'auto' || val === 'normal' || val === '0px') return;
            if (prop.includes('border') && /none/i.test(val)) return;
            if (prop === 'background-color' && (val === 'rgba(0, 0, 0, 0)' || val === 'transparent')) return;
            parts.push(`${prop}:${val}`);
        });
        if (parts.length) {
            const existing = el.getAttribute('style') || '';
            el.setAttribute('style', normalizeOfficeInlineCss(`${parts.join(';')};${existing}`));
        }
    });
};

/** Apply Excel/Word styles using the full clipboard document (styles live in <head>, not the fragment). */
const applyOfficeClipboardHtml = (html) => {
    const raw = String(html || '').trim();
    if (!raw || !/<[a-z][\s>]/i.test(raw)) return raw;
    if (typeof document === 'undefined') return raw;

    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = 'position:fixed;left:-9999px;top:0;width:900px;height:600px;opacity:0;pointer-events:none';
    document.body.appendChild(iframe);

    try {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        const iframeWin = iframe.contentWindow;
        if (!iframeDoc || !iframeWin) return raw;

        iframeDoc.open();
        iframeDoc.write(buildOfficePreviewDocumentHtml(raw));
        iframeDoc.close();

        inlineComputedOfficeTableStyles(iframeDoc, iframeWin);

        iframeDoc.body.querySelectorAll('[bgcolor]').forEach((el) => {
            const bg = el.getAttribute('bgcolor');
            if (bg && el.style && !el.style.backgroundColor) {
                el.style.backgroundColor = bg;
            }
        });

        iframeDoc.body.querySelectorAll('col, o\\:p, style, meta, link').forEach((el) => {
            if (el.closest('table')) return;
            el.remove();
        });

        iframeDoc.body.querySelectorAll('table').forEach((table) => {
            table.setAttribute(OFFICE_PASTE_TABLE_ATTR, OFFICE_PASTE_TABLE_VALUE);
            if (!table.style.borderCollapse) table.style.borderCollapse = 'collapse';
            table.querySelectorAll('[class]').forEach((cell) => cell.removeAttribute('class'));
            table.removeAttribute('class');
            table.classList.add('ems-office-paste-table');
        });

        const tables = iframeDoc.body.querySelectorAll('table');
        if (tables.length === 1) return tables[0].outerHTML;
        if (tables.length > 1) {
            const wrap = iframeDoc.createElement('div');
            tables.forEach((table) => wrap.appendChild(table.cloneNode(true)));
            return wrap.innerHTML;
        }
        return iframeDoc.body.innerHTML;
    } catch {
        return extractOfficeHtmlFragment(raw) || raw;
    } finally {
        iframe.remove();
    }
};

const isOfficePastedTable = (table) =>
    table?.getAttribute?.(OFFICE_PASTE_TABLE_ATTR) === OFFICE_PASTE_TABLE_VALUE ||
    table?.classList?.contains?.('ems-office-paste-table');

const normalizeOfficePastedTable = (table) => {
    if (!table) return;
    table.querySelectorAll('td, th').forEach(cleanCellSpacingNodes);
    table.querySelectorAll('tr, td, th').forEach((cell) => {
        if (!cell.style) return;
        CELL_KILL_STYLE_PROPS.forEach((p) => cell.style.removeProperty(p));
        cell.removeAttribute('height');
    });
    table.querySelectorAll('td p, td div, th p, th div, td span, th span, td font, th font').forEach((el) => {
        if (!el.style) return;
        ['height', 'min-height', 'margin-top', 'margin-bottom', 'mso-line-height-alt', 'mso-line-height-rule'].forEach(
            (p) => el.style.removeProperty(p)
        );
        el.removeAttribute('height');
    });
    initializeOfficePastedTableColumns(table);
};

/** Excel/Word sometimes inlines cursor:none or transparent text — hides pointer / caret. */
const stripPastedEditorArtifacts = (root) => {
    if (!root?.querySelectorAll) return;
    root.querySelectorAll('table [style]').forEach((el) => {
        if (!el.style) return;
        el.style.removeProperty('cursor');
        // Word/Excel may paste white-space variants that prevent wrapping inside cells.
        // Normalize to allow wrapping; we also enforce via CSS for safety.
        if (el.style.whiteSpace) {
            el.style.whiteSpace = 'normal';
        }
        // Word may paste positioned/translated runs which can paint outside the cell box.
        // Normalize these so content participates in normal flow and wraps within the cell.
        if (el.style.position && el.style.position !== 'static') {
            el.style.position = 'static';
        }
        ['left', 'top', 'right', 'bottom'].forEach((p) => el.style.removeProperty(p));
        el.style.removeProperty('transform');
        el.style.removeProperty('translate');
        el.style.removeProperty('float');

        const isCellDesc =
            el.closest?.('td, th') && !/^(TD|TH|TR|TABLE|COL|COLGROUP|TBODY|THEAD|TFOOT)$/i.test(el.tagName);
        if (isCellDesc) {
            // Prevent wide inline boxes from overflowing into neighbor columns.
            el.style.maxWidth = '100%';
            if (el.style.width) el.style.width = 'auto';
        }
        const color = (el.style.color || '').replace(/\s/g, '').toLowerCase();
        const fill = (el.style.webkitTextFillColor || '').replace(/\s/g, '').toLowerCase();
        if (color === 'transparent' || fill === 'transparent') {
            el.style.removeProperty('color');
            el.style.removeProperty('-webkit-text-fill-color');
        }
    });
};

const normalizePastedTables = (root) => {
    if (!root || typeof root.querySelectorAll !== 'function') return;
    if (isTableStructureResizeActive(root)) return;
    stripPastedEditorArtifacts(root);
    const tables = root.querySelectorAll('table');
    tables.forEach((table) => {
        if (isOfficePastedTable(table)) {
            normalizeOfficePastedTable(table);
            return;
        }
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

const escapeHtmlText = (value) =>
    String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

/** Build an HTML table when Excel only exposes tab-separated plain text on the clipboard. */
const tsvPlainToHtmlTable = (plain) => {
    const normalized = String(plain || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const rows = normalized.split('\n');
    while (rows.length && rows[rows.length - 1].trim() === '') rows.pop();
    if (!rows.length) return '';
    const body = rows
        .map((row) => {
            const cells = row.split('\t');
            return `<tr>${cells.map((cell) => `<td>${escapeHtmlText(cell)}</td>`).join('')}</tr>`;
        })
        .join('');
    return `<table cellspacing="0" cellpadding="0"><tbody>${body}</tbody></table>`;
};

/** Excel/Word put both text/html and image/png on the clipboard; Jodit's uploader prefers the PNG. */
const clipboardHasOfficeTableData = (dataTransfer) => {
    if (!dataTransfer) return false;
    const html = dataTransfer.getData?.('text/html') || '';
    const plain = dataTransfer.getData?.('text/plain') || '';
    // Excel always puts tab-separated values on the clipboard for cell ranges.
    if (plain.includes('\t')) return true;
    if (html && /<[a-z][\s>]/i.test(html)) {
        if (/<table[\s>]/i.test(html)) return true;
        if (/schemas-microsoft-com:office|Excel\.Sheet|Word\.Document|ProgId/i.test(html)) return true;
        if (/mso-/i.test(html) && /<tr[\s>]/i.test(html)) return true;
    }
    return false;
};

const clipboardHasOfficeHtml = (html) =>
    html &&
    /<[a-z][\s>]/i.test(html) &&
    (/<table[\s>]/i.test(html) ||
        /<t[dh][\s>]/i.test(html) ||
        /<tr[\s>]/i.test(html) ||
        /schemas-microsoft-com:office|Excel\.Sheet|Word\.Document|ProgId|mso-/i.test(html));

const extractOfficeTableHtmlFromClipboard = (dataTransfer) => {
    if (!dataTransfer) return '';
    const htmlRaw = (dataTransfer.getData?.('text/html') || '').trim();
    const plain = dataTransfer.getData?.('text/plain') || '';

    // Excel always ships text/html alongside tab-separated plain text — HTML has colors/merges.
    if (htmlRaw && (clipboardHasOfficeHtml(htmlRaw) || plain.includes('\t'))) {
        return sanitizePastedHtmlString(applyOfficeClipboardHtml(htmlRaw));
    }

    if (plain.includes('\t')) {
        return sanitizePastedHtmlString(tsvPlainToHtmlTable(plain));
    }
    return '';
};

/** jodit-react ref is the Jodit instance; `.editor` on it is the contenteditable DOM node. */
const resolveJoditInstance = (editorRef, joditInstRef) => {
    const fromCallback = joditInstRef?.current;
    if (fromCallback?.s?.insertHTML && !fromCallback.isInDestruct && !fromCallback.isDestructed) {
        return fromCallback;
    }
    const fromRef = editorRef?.current;
    if (fromRef?.s?.insertHTML && !fromRef.isInDestruct && !fromRef.isDestructed) {
        return fromRef;
    }
    return null;
};

const isJoditAlive = (jodit) =>
    jodit && !jodit.isInDestruct && !jodit.isDestructed && typeof jodit.s?.insertHTML === 'function';

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
    const joditInstRef = useRef(null);
    const wrapperRef = useRef(null);
    /**
     * Last HTML we reported via onChange. When parent echoes the same string, we must not update the `value`
     * passed to jodit-react — its useEffect does `jodit.value = value` whenever strings differ from Jodit's
     * normalized HTML, which resets the caret. We only sync React `value` when html truly changes from outside.
     */
    const lastEmittedRef = useRef(html ?? '');
    /** Initial HTML only — jodit-react must not receive a changing `value` prop. */
    const initialHtmlRef = useRef(html ?? '');
    const handlersRef = useRef({});
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    /** Resolve the contenteditable body. Never touch Jodit selection APIs (e.g. `s.html`) — that can
     *  throw while the instance is mid-paste or tearing down. */
    const getEditorBody = useCallback(() => {
        const jodit = joditInstRef.current || editor.current;
        if (isJoditAlive(jodit)) {
            const ed = jodit.editor;
            if (ed && typeof ed.querySelectorAll === 'function') return ed;
        }
        return wrapperRef.current?.querySelector('.jodit-wysiwyg') || null;
    }, []);

    const isEditorFocused = useCallback(() => {
        const root = getEditorBody();
        const active = document.activeElement;
        return Boolean(root && active && (active === root || root.contains(active)));
    }, [getEditorBody]);

    useEffect(() => {
        const incoming = html ?? '';
        if (incoming === lastEmittedRef.current) {
            return;
        }
        lastEmittedRef.current = incoming;
        initialHtmlRef.current = incoming;
        if (isEditorFocused()) {
            return;
        }
        const jodit = joditInstRef.current;
        if (isJoditAlive(jodit)) {
            jodit.value = incoming;
        }
    }, [html, isEditorFocused]);

    /** Push live editor DOM into parent state (preview reads clauseContent, not Jodit directly). */
    const syncEditorToParent = useCallback(() => {
        try {
            if (!isJoditAlive(joditInstRef.current || editor.current)) return;
            const root = getEditorBody();
            const domHtml = root?.innerHTML ?? '';
            if (domHtml == null) return;
            let content = domHtml;
            if (domHtml.includes('<table') && !String(content).includes('<table')) {
                content = domHtml;
            }
            const normalized = normalizeClauseListHtmlInString(content);
            const fromParent = onChangeRef.current(normalized);
            lastEmittedRef.current = typeof fromParent === 'string' ? fromParent : normalized;
        } catch (_e) {
            /* Ignore while Jodit is mid-paste or destructing. */
        }
    }, [getEditorBody]);

    /** Run multiple times: once now, again on next frame, again ~300ms / ~1.2s out — covers any
     *  Jodit post-paste pass (autoresize / cleanHTML / mso-style stripper) that re-introduces spacing. */
    const cleanupAfterPaste = useCallback(() => {
        const root = getEditorBody();
        if (!root) return;
        const runOfficeColumnInit = () => initializeAllOfficePastedTableColumns(getEditorBody());
        const finish = () => {
            runOfficeColumnInit();
            syncEditorToParent();
        };
        normalizePastedTables(root);
        normalizePastedBlockAlignment(root);
        normalizeClauseListHtml(root);
        finish();
        requestAnimationFrame(() => {
            const r = getEditorBody();
            normalizePastedTables(r);
            normalizePastedBlockAlignment(r);
            normalizeClauseListHtml(r);
            finish();
        });
        setTimeout(() => {
            const r = getEditorBody();
            normalizePastedTables(r);
            normalizePastedBlockAlignment(r);
            normalizeClauseListHtml(r);
            finish();
        }, 300);
        setTimeout(() => {
            const r = getEditorBody();
            normalizePastedTables(r);
            normalizePastedBlockAlignment(r);
            normalizeClauseListHtml(r);
            finish();
        }, 1200);
    }, [getEditorBody, syncEditorToParent]);

    /** Intercept clipboard HTML BEFORE Jodit inserts it so the editor never sees the dirty Excel/Word
     *  height/margin attributes. Jodit fires `processPaste(event, text, types)` and lets the handler
     *  return a replacement string. */
    const processPasteHandler = useCallback((_e, text /* , _types */) => {
        if (typeof text !== 'string') return undefined;
        if (!/<[a-z][\s>]/i.test(text)) return undefined;
        const processed =
            clipboardHasOfficeHtml(text) || /<table[\s>]/i.test(text)
                ? applyOfficeClipboardHtml(text)
                : text;
        return sanitizePastedHtmlString(processed);
    }, []);

    /** Excel also copies a PNG; Jodit's base64 uploader grabs that before HTML is processed. */
    const insertOfficeTableFromClipboard = useCallback(
        (e) => {
            const dt = e?.clipboardData;
            if (!clipboardHasOfficeTableData(dt)) return false;
            const html = extractOfficeTableHtmlFromClipboard(dt);
            if (!html || !html.trim()) return false;
            const jodit = resolveJoditInstance(editor, joditInstRef);
            if (!isJoditAlive(jodit)) return false;
            e.preventDefault();
            e.stopImmediatePropagation?.();
            try {
                jodit.s.focus();
                jodit.s.insertHTML(html);
                if (typeof jodit.synchronizeValues === 'function') {
                    jodit.synchronizeValues();
                }
                jodit.e?.fire?.('afterPaste', e);
                cleanupAfterPaste();
            } catch (_err) {
                return false;
            }
            return true;
        },
        [cleanupAfterPaste]
    );

    const beforePastePreferOfficeHtml = useCallback(
        (e) => (insertOfficeTableFromClipboard(e) ? false : undefined),
        [insertOfficeTableFromClipboard]
    );

    handlersRef.current = {
        cleanupAfterPaste,
        processPasteHandler,
        beforePastePreferOfficeHtml,
        insertOfficeTableFromClipboard,
        syncEditorToParent,
        getEditorBody,
        wrapperRef,
    };

    /** Clear col-resize / crosshair left on document.body by other Quote panels. */
    useEffect(() => {
        const wrap = wrapperRef.current;
        if (!wrap) return undefined;
        const clearStuckBodyCursor = () => {
            document.body.style.removeProperty('cursor');
            document.body.style.removeProperty('user-select');
        };
        wrap.addEventListener('mouseenter', clearStuckBodyCursor, true);
        wrap.addEventListener('mousedown', clearStuckBodyCursor, true);
        return () => {
            wrap.removeEventListener('mouseenter', clearStuckBodyCursor, true);
            wrap.removeEventListener('mousedown', clearStuckBodyCursor, true);
        };
    }, []);

    const config = useMemo(() => ({
        readonly: false,
        placeholder: 'Start typing...',
        height: style?.height || 400,
        minHeight: 200,
        /** Built-in orderedList plugin uses commitStyle and only wraps part of the selection — conflicts with EMS list presets. */
        disablePlugins: ['orderedList', 'resizeCells', 'resizer', 'addNewLine', 'selectCells'],
        /** Enter-icon “add line” handle (before/after tables) uses position:fixed and blocks the horizontal scrollbar when scrolling. */
        addNewLine: false,
        addNewLineOnDBLClick: false,
        /** Off — uploader paste hook grabs Excel's PNG and ignores the HTML table on the clipboard. */
        enableDragAndDropFileToEditor: false,
        /** Skip Word/Excel paste plugin so Jodit does not run applyStyles() (it strips border* from inline CSS). */
        askBeforePasteFromWord: false,
        askBeforePasteHTML: false,
        processPasteFromWord: false,
        defaultActionOnPaste: 'insert_as_html',
        uploader: {
            insertImageAsBase64URI: false,
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
            /** EMS handles multi-cell highlight; Jodit selectCells plugin is disabled (it hid the text caret). */
            selectionCellStyle:
                'background-color: rgba(30, 136, 229, 0.18) !important; outline: 1px solid #1e88e5 !important;',
            allowCellSelection: false,
        },
        /** Strip Excel/Word height + empty trailing <p><br></p> noise:
         *   - processPaste: clean the clipboard HTML BEFORE Jodit inserts it (primary defense).
         *   - afterPaste / paste: clean the live DOM as a fallback (Jodit / plugins may add styles later). */
        events: {
            beforePaste: (e) => handlersRef.current.beforePastePreferOfficeHtml?.(e),
            processPaste: (...args) => handlersRef.current.processPasteHandler?.(...args),
            afterPaste: () => handlersRef.current.cleanupAfterPaste?.(),
            afterInit: (jodit) => {
                joditInstRef.current = jodit;
                const h = () => handlersRef.current;
                const seed = initialHtmlRef.current ?? '';
                if (!jodit.__emsValueBootstrapped) {
                    jodit.__emsValueBootstrapped = true;
                    if (seed && (!jodit.value || jodit.value === '<p><br></p>')) {
                        jodit.value = seed;
                    }
                }
                jodit.e.on(
                    'beforePaste.emsOfficeTable',
                    (e) => h().beforePastePreferOfficeHtml?.(e),
                    { top: true }
                );
                const getBody = () =>
                    jodit.editor ||
                    h().wrapperRef?.current?.querySelector('.jodit-wysiwyg') ||
                    null;
                jodit.__emsClauseEditorBody = getBody;
                registerClauseEditorListCommands(jodit);
                registerClauseEditorTableHooks(jodit, getBody);

                const wrap = h().wrapperRef?.current;
                if (wrap && !wrap.__emsPasteCaptureBound) {
                    wrap.__emsPasteCaptureBound = true;
                    wrap.addEventListener(
                        'paste',
                        (e) => h().insertOfficeTableFromClipboard?.(e),
                        true
                    );
                }

                const initDom = () => {
                    const root = getBody();
                    if (!root) return;
                    normalizePastedTables(root);
                    normalizePastedBlockAlignment(root);
                    normalizeClauseListHtml(root);
                    requestAnimationFrame(() => {
                        const r = getBody();
                        if (!r) return;
                        normalizePastedTables(r);
                        normalizePastedBlockAlignment(r);
                        normalizeClauseListHtml(r);
                    });
                };
                if (!jodit.__emsClauseDomInit) {
                    jodit.__emsClauseDomInit = true;
                    requestAnimationFrame(initDom);
                }

                if (!jodit.__emsTablePasteObs && typeof MutationObserver !== 'undefined') {
                    const root = getBody();
                    if (root) {
                        jodit.__emsTablePasteObs = true;
                        let scheduled = false;
                        const obs = new MutationObserver((records) => {
                            const newTablePasted = records.some((r) =>
                                Array.from(r.addedNodes || []).some(
                                    (n) =>
                                        n.nodeType === 1 &&
                                        (n.tagName === 'TABLE' || n.querySelector?.('table'))
                                )
                            );
                            if (!newTablePasted || scheduled) return;
                            if (isTableStructureResizeActive(root)) return;
                            scheduled = true;
                            requestAnimationFrame(() => {
                                scheduled = false;
                                normalizePastedTables(getBody());
                            });
                        });
                        obs.observe(root, {
                            childList: true,
                            subtree: true,
                            attributes: true,
                            attributeFilter: ['height', 'style'],
                        });
                        jodit.e.on('beforeDestruct', () => obs.disconnect());
                    }
                }

                jodit.e.on('afterCommand.emsClausePreview', (command) => {
                    const cmd = String(command || '').toLowerCase();
                    if (
                        /^(forecolor|background|bold|italic|underline|strikethrough|brush|justify)/.test(
                            cmd
                        )
                    ) {
                        requestAnimationFrame(() => h().syncEditorToParent?.());
                    }
                });

                jodit.e.on('toggleFullSize.emsClause', (enable) => {
                    const wrapEl = h().wrapperRef?.current;
                    const container = jodit.container;
                    if (wrapEl) wrapEl.classList.toggle('clause-editor-fullsize', !!enable);
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
    }), [style?.height]);

    const handleChange = useCallback((newContent) => {
        const root = getEditorBody();
        const domHtml = root?.innerHTML ?? '';
        let content = newContent ?? '';
        if (domHtml.includes('<table') && !String(content).includes('<table')) {
            content = domHtml;
        }
        const normalized = normalizeClauseListHtmlInString(content);
        const fromParent = onChangeRef.current(normalized);
        lastEmittedRef.current = typeof fromParent === 'string' ? fromParent : normalized;
    }, [getEditorBody]);

    /** MUST be stable — jodit-react re-inits Jodit when `editorRef` identity changes (destroys typed text). */
    const bindEditorInstance = useCallback((inst) => {
        joditInstRef.current = inst;
    }, []);

    return (
        <div
            ref={wrapperRef}
            style={{ width: '100%', minHeight: 0, ...style, display: 'flex', flexDirection: 'column' }}
            className="clause-editor-wrapper"
        >
            <JoditEditor
                ref={editor}
                editorRef={bindEditorInstance}
                config={config}
                tabIndex={1}
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
                /* Column resize cursor only on the drag handle — not the whole cell. */
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
                /* Visible text caret while typing (including dark header cells). */
                .clause-editor-wrapper .jodit-wysiwyg,
                .clause-editor-wrapper .jodit-wysiwyg * {
                    caret-color: #000 !important;
                }
                .clause-editor-wrapper .jodit-wysiwyg ::selection,
                .clause-editor-wrapper .jodit-wysiwyg *::selection {
                    background: rgba(30, 136, 229, 0.35) !important;
                    color: inherit !important;
                }
                .clause-editor-wrapper .jodit-wysiwyg table td p,
                .clause-editor-wrapper .jodit-wysiwyg table th p {
                    text-align: inherit;
                }
                /* No table cell chrome while editing — only EMS multi-select (2+ cells) adds blue. */
                .clause-editor-wrapper .jodit-wysiwyg:focus td,
                .clause-editor-wrapper .jodit-wysiwyg:focus th {
                    outline: none !important;
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
                    cursor: auto !important;
                }
                .clause-editor-wrapper .jodit-wysiwyg p,
                .clause-editor-wrapper .jodit-wysiwyg div,
                .clause-editor-wrapper .jodit-wysiwyg span,
                .clause-editor-wrapper .jodit-wysiwyg li,
                .clause-editor-wrapper .jodit-wysiwyg td,
                .clause-editor-wrapper .jodit-wysiwyg th {
                    cursor: auto !important;
                }
                .clause-editor-wrapper .jodit-toolbar-button,
                .clause-editor-wrapper .jodit-toolbar-button__button {
                    cursor: pointer !important;
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
                /* Default borders for manually inserted tables only — Excel/Word pastes keep inline styles. */
                .clause-editor-wrapper .jodit-wysiwyg table:not([data-ems-paste-source="office"]),
                .clause-editor-wrapper .jodit-wysiwyg table:not([data-ems-paste-source="office"]) td,
                .clause-editor-wrapper .jodit-wysiwyg table:not([data-ems-paste-source="office"]) th {
                    border: 1px solid #64748b !important;
                    border-collapse: collapse !important;
                }
                .clause-editor-wrapper .jodit-wysiwyg table:not([data-ems-paste-source="office"]) thead th,
                .clause-editor-wrapper .jodit-wysiwyg table:not([data-ems-paste-source="office"]) thead td {
                    background-color: #f1f5f9 !important;
                    font-weight: 600 !important;
                }
                .clause-editor-wrapper .jodit-wysiwyg table[data-ems-paste-source="office"] {
                    border-collapse: collapse !important;
                    border-spacing: 0 !important;
                    table-layout: fixed !important;
                    /* Let inline px width from paste/resize win. */
                    width: auto;
                    max-width: none !important;
                }
                .clause-editor-wrapper .jodit-wysiwyg table {
                    border-collapse: collapse !important;
                    border-spacing: 0 !important;
                    table-layout: fixed !important;
                    /* Let inline px width from paste/resize win. */
                    width: auto;
                    max-width: none !important;
                }
                .clause-editor-wrapper .jodit-wysiwyg table[data-ems-col-widths] {
                    /* Let inline px width from paste/resize win. */
                    width: auto;
                }
                /* EMS auto pricing summary (Clause 4): match right-side preview sizing/format. */
                .clause-editor-wrapper .jodit-wysiwyg table#ems-auto-price-summary-table {
                    /* Allow EMS column resize to set px widths. */
                    width: auto !important;
                    max-width: none !important;
                    border-collapse: collapse !important;
                    table-layout: fixed !important;
                    margin-top: 12px !important;
                    margin-bottom: 6px !important;
                    font-size: 11px !important;
                    line-height: 1.35 !important;
                    border: 1px solid #cbd5e1 !important;
                    box-sizing: border-box !important;
                }
                .clause-editor-wrapper .jodit-wysiwyg table#ems-auto-price-summary-table th,
                .clause-editor-wrapper .jodit-wysiwyg table#ems-auto-price-summary-table td {
                    border: 0.5px solid #cbd5e1 !important;
                    padding: 5px 10px !important;
                    font-size: 11px !important;
                    line-height: 1.35 !important;
                    color: #0f172a !important;
                    vertical-align: middle !important;
                }
                .clause-editor-wrapper .jodit-wysiwyg table#ems-auto-price-summary-table thead th {
                    background: #1e3a5f !important;
                    color: #ffffff !important;
                    font-weight: 600 !important;
                    border: 1px solid #94a3b8 !important;
                }
                .clause-editor-wrapper .jodit-wysiwyg table#ems-auto-price-summary-table tr[data-ems-row="grand"] td {
                    background: #f8fafc !important;
                    font-weight: 700 !important;
                    border-top: 1px solid #94a3b8 !important;
                }
                .clause-editor-wrapper .jodit-wysiwyg table#ems-auto-price-summary-table th:nth-child(2),
                .clause-editor-wrapper .jodit-wysiwyg table#ems-auto-price-summary-table td:nth-child(2),
                .clause-editor-wrapper .jodit-wysiwyg table#ems-auto-price-summary-table td[data-ems-amount],
                .clause-editor-wrapper .jodit-wysiwyg table#ems-auto-price-summary-table tr[data-ems-row="grand"] td:first-child {
                    text-align: right !important;
                }
                /* Pasted tables from Excel/Word should keep their source rhythm.
                   The cleanup runs in JS, but these rules act as a safety net so
                   the global p / p+p rules above never inflate cell heights. */
                .clause-editor-wrapper .jodit-wysiwyg table {
                    margin-top: 4px !important;
                    margin-bottom: 4px !important;
                }
                .clause-editor-wrapper .jodit-wysiwyg table:not([data-ems-paste-source="office"]) tr,
                .clause-editor-wrapper .jodit-wysiwyg table:not([data-ems-paste-source="office"]) td,
                .clause-editor-wrapper .jodit-wysiwyg table:not([data-ems-paste-source="office"]) th {
                    line-height: 1.25 !important;
                    vertical-align: middle !important;
                    box-sizing: border-box !important;
                }
                .clause-editor-wrapper .jodit-wysiwyg table[data-ems-paste-source="office"] td,
                .clause-editor-wrapper .jodit-wysiwyg table[data-ems-paste-source="office"] th {
                    box-sizing: border-box !important;
                    vertical-align: top !important;
                    white-space: normal !important;
                    overflow-wrap: anywhere !important;
                    word-break: break-word !important;
                    overflow: hidden !important;
                }
                /* Word often sets nowrap on nested spans/fonts; override at all depths. */
                .clause-editor-wrapper .jodit-wysiwyg table[data-ems-paste-source="office"] td *,
                .clause-editor-wrapper .jodit-wysiwyg table[data-ems-paste-source="office"] th * {
                    white-space: normal !important;
                    overflow-wrap: anywhere !important;
                    word-break: break-word !important;
                    max-width: 100% !important;
                }
                /* Jodit's default is padding: 0.4em (~6px each side) which inflates rows when source
                   inline padding is absent. Use a compact Word-typical default — written WITHOUT
                   !important so an explicit inline 'padding' from the pasted source still wins. */
                .clause-editor-wrapper .jodit-wysiwyg table:not([data-ems-paste-source="office"]) tr td,
                .clause-editor-wrapper .jodit-wysiwyg table:not([data-ems-paste-source="office"]) tr th {
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
                /* Do not use display:none on cell paragraphs — it hides the text caret in contenteditable. */
                ${CLAUSE_LIST_STYLES_CSS}
            `}
            </style>
        </div>
    );
};

export default ClauseEditor;

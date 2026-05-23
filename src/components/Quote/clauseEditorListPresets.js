/**
 * MS Word–style bullet & numbering presets for ClauseEditor (Jodit).
 * Classes are persisted in saved HTML so print/PDF must include CLAUSE_LIST_STYLES_CSS.
 */

export const BULLET_LIST_OPTIONS = {
    none: 'None',
    disc: '●  Solid round',
    circle: '○  Hollow round',
    square: '■  Solid square',
    check: '✓  Checkmark',
    arrow: '➤  Arrow',
    diamond: '◆  Diamond',
};

export const NUMBER_LIST_OPTIONS = {
    none: 'None',
    decimal: '1.  2.  3.',
    'decimal-paren': '1)  2)  3)',
    'upper-roman': 'I.  II.  III.',
    'upper-alpha': 'A.  B.  C.',
    'lower-alpha-paren': 'a)  b)  c)',
    'lower-alpha': 'a.  b.  c.',
    'lower-roman': 'i.  ii.  iii.',
};

const BULLET_CLASS_NAMES = [
    'ems-bullet-disc',
    'ems-bullet-circle',
    'ems-bullet-square',
    'ems-bullet-check',
    'ems-bullet-arrow',
    'ems-bullet-diamond',
];

const OL_CLASS_NAMES = [
    'ems-num-decimal',
    'ems-num-decimal-paren',
    'ems-num-upper-roman',
    'ems-num-upper-alpha',
    'ems-num-lower-alpha-paren',
    'ems-num-lower-alpha',
    'ems-num-lower-roman',
];

const UL_PRESETS = {
    disc: { listStyleType: 'disc', classes: ['ems-bullet-disc'], native: true },
    circle: { listStyleType: 'circle', classes: ['ems-bullet-circle'], native: true },
    square: { listStyleType: 'square', classes: ['ems-bullet-square'], native: true },
    check: { listStyleType: 'none', classes: ['ems-bullet-check'] },
    arrow: { listStyleType: 'none', classes: ['ems-bullet-arrow'] },
    diamond: { listStyleType: 'none', classes: ['ems-bullet-diamond'] },
};

const OL_PRESETS = {
    /** Browser-native 1. 2. 3. — avoids custom counters that break when Jodit uses multiple <ol>. */
    decimal: { listStyleType: 'decimal', classes: ['ems-num-decimal'], native: true },
    'decimal-paren': { classes: ['ems-num-decimal-paren'] },
    'upper-roman': { classes: ['ems-num-upper-roman'] },
    'upper-alpha': { classes: ['ems-num-upper-alpha'] },
    'lower-alpha-paren': { classes: ['ems-num-lower-alpha-paren'] },
    'lower-alpha': { classes: ['ems-num-lower-alpha'] },
    'lower-roman': { classes: ['ems-num-lower-roman'] },
};

/** Only strip obvious duplicate markers (e.g. placeholder "1. Warranty"), not values like "1.5". */
const LEADING_LIST_MARKER_RE = /^\s*(?:\d+[\.\)]\s+)(?=[A-Za-z\[])/;

/** Contenteditable root — must match ClauseEditor `getEditorBody()` (not Jodit chrome wrapper). */
function getWysiwygEditor(jodit) {
    if (!jodit) return null;
    if (typeof jodit.__emsClauseEditorBody === 'function') {
        const fromWrapper = jodit.__emsClauseEditorBody();
        if (fromWrapper?.querySelectorAll) return fromWrapper;
    }
    let root = jodit.editor?.editor || jodit.editor || null;
    if (root && !root.classList?.contains('jodit-wysiwyg')) {
        const wys = root.querySelector?.('.jodit-wysiwyg');
        if (wys) root = wys;
    }
    if (!root?.querySelectorAll) {
        let node = jodit.s?.range?.startContainer;
        if (node?.nodeType === 3) node = node.parentElement;
        while (node) {
            if (node.classList?.contains('jodit-wysiwyg')) return node;
            node = node.parentElement;
        }
        root = jodit.container?.querySelector?.('.jodit-wysiwyg') || root;
    }
    return root;
}

function stripClasses(el, names) {
    names.forEach((c) => el.classList.remove(c));
}

function getFirstTextNode(el) {
    if (!el) return null;
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    return walk.nextNode();
}

/** Remove typed "1. " / "1) " prefixes so list markers come only from CSS. */
function stripLeadingListMarkers(root) {
    if (!root?.querySelectorAll) return;
    root.querySelectorAll('ol > li, ul > li').forEach((li) => {
        const textNode = getFirstTextNode(li);
        if (!textNode) return;
        const next = textNode.textContent.replace(LEADING_LIST_MARKER_RE, '');
        if (next !== textNode.textContent) textNode.textContent = next;
    });
}

/** Fingerprint so adjacent lists merge only when the same bullet/number style. */
function listStyleFingerprint(list) {
    if (!list) return '';
    const cls = String(list.className || '').trim();
    const lst = String(list.style?.listStyleType || '').trim();
    const styleAttr = String(list.getAttribute('style') || '').trim();
    return `${list.tagName}|${cls}|${lst}|${styleAttr}`;
}

function rangeIntersectsNode(range, node) {
    if (!range || !node) return false;
    try {
        const doc = node.ownerDocument;
        const lr = doc.createRange();
        lr.selectNodeContents(node);
        return (
            range.compareBoundaryPoints(Range.END_TO_START, lr) < 0 &&
            range.compareBoundaryPoints(Range.START_TO_END, lr) > 0
        );
    } catch {
        return false;
    }
}

function rangeFullyContainsNode(range, node) {
    if (!range || !node) return false;
    try {
        const doc = node.ownerDocument;
        const lr = doc.createRange();
        lr.selectNodeContents(node);
        return (
            range.compareBoundaryPoints(Range.START_TO_START, lr) <= 0 &&
            range.compareBoundaryPoints(Range.END_TO_END, lr) >= 0
        );
    } catch {
        return false;
    }
}

/** Tables/images must never be wiped by a whole-editor list rebuild. */
function editorHasProtectedStructures(root) {
    if (!root?.querySelector) return false;
    return !!root.querySelector('table, img, video, iframe, object, embed');
}

const PROTECTED_STRUCTURE_SELECTOR = 'table, img, video, iframe, object, embed';

/** True when node contains a table/image that is not part of the current selection. */
function nodeHasProtectedDescendantOutsideRange(node, range) {
    if (!node?.querySelector || !range) return false;
    for (const el of node.querySelectorAll(PROTECTED_STRUCTURE_SELECTOR)) {
        if (!rangeIntersectsNode(range, el)) return true;
    }
    return false;
}

/** Clone tables before list edits so we can re-insert them if DOM surgery drops them. */
function snapshotEditorTables(root) {
    if (!root?.querySelectorAll) return [];
    return [...root.querySelectorAll('table')].map((t) => t.cloneNode(true));
}

function restoreMissingEditorTables(root, tableClones) {
    if (!root || !tableClones.length) return;
    const existing = root.querySelectorAll('table').length;
    if (existing >= tableClones.length) return;
    tableClones.forEach((clone) => {
        root.appendChild(clone.cloneNode(true));
    });
}

/** Re-append tables if list logic removed them; sync DOM → Jodit without setEditorValue. */
function finishListPresetApply(jodit, tableSnapshots) {
    const afterRoot = getWysiwygEditor(jodit);
    if (afterRoot) restoreMissingEditorTables(afterRoot, tableSnapshots);
    syncEditorFromDom(jodit);
}

/** Lines from a block, clipped to the active range (avoids bulleting unselected <br> rows). */
function getLineHtmlsFromElementInRange(el, range) {
    if (!el || !range || !rangeIntersectsNode(range, el)) return [];
    const allLines = getLineHtmlsFromElement(el);
    if (!allLines.length) return [];
    if (allLines.length === 1 || rangeFullyContainsNode(range, el)) return allLines;

    const doc = el.ownerDocument;
    try {
        const blockRange = doc.createRange();
        blockRange.selectNodeContents(el);
        const clipped = doc.createRange();
        clipped.setStart(
            range.compareBoundaryPoints(Range.START_TO_START, blockRange) > 0
                ? range.startContainer
                : blockRange.startContainer,
            range.compareBoundaryPoints(Range.START_TO_START, blockRange) > 0
                ? range.startOffset
                : blockRange.startOffset
        );
        clipped.setEnd(
            range.compareBoundaryPoints(Range.END_TO_END, blockRange) < 0
                ? range.endContainer
                : blockRange.endContainer,
            range.compareBoundaryPoints(Range.END_TO_END, blockRange) < 0
                ? range.endOffset
                : blockRange.endOffset
        );
        const holder = doc.createElement('div');
        holder.appendChild(clipped.cloneContents());
        const fromClip = expandLineHtmlsForList(getLineHtmlsFromElement(holder));
        if (fromClip.length) return fromClip;
    } catch {
        /* fall through */
    }
    return allLines;
}

function getLineHtmlsFromElement(el) {
    let html = String(el?.innerHTML || '');
    html = html
        .replace(/^(\s|&nbsp;|<br\s*\/?>)+/gi, '')
        .replace(/(\s|&nbsp;|<br\s*\/?>)+$/gi, '');
    if (!html.trim()) return [];
    if (/<br\s*\/?>/i.test(html)) {
        return html
            .split(/<br\s*\/?>/gi)
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
    }
    return [html];
}

function lineHtmlHasText(html) {
    return String(html || '')
        .replace(/<[^>]+>/g, '')
        .replace(/\u00a0/g, ' ')
        .trim().length > 0;
}

/** Flatten collected lines; split any entry that still contains <br> into separate list rows. */
function expandLineHtmlsForList(lines) {
    /** @type {string[]} */
    const out = [];
    lines.forEach((html) => {
        const parts = getLineHtmlsFromElement({ innerHTML: html });
        if (parts.length > 1) parts.forEach((p) => out.push(p));
        else out.push(html);
    });
    return out.filter(lineHtmlHasText);
}

/** Fallback when block-walk misses lines inside a partial DOM selection. */
function collectLineHtmlsFromRangeFragment(root, range) {
    if (!root || !range || range.collapsed) return [];
    const doc = root.ownerDocument;
    let fragment;
    try {
        fragment = range.cloneContents();
    } catch {
        return [];
    }
    if (!fragment) return [];

    const holder = doc.createElement('div');
    holder.appendChild(fragment);

    /** @type {string[]} */
    const lines = [];
    const pushEl = (el) => {
        getLineHtmlsFromElement(el).forEach((h) => lines.push(h));
    };

    holder.querySelectorAll('li').forEach((li) => pushEl(li));
    [...holder.children].forEach((node) => {
        if (node.nodeType !== 1) return;
        const tag = node.tagName;
        if (tag === 'UL' || tag === 'OL' || tag === 'TABLE') return;
        if (tag === 'LI') return;
        if (['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(tag)) {
            pushEl(node);
        }
    });
    if (!lines.length) {
        getLineHtmlsFromElement(holder).forEach((h) => lines.push(h));
    }
    return expandLineHtmlsForList(lines);
}

/** All visual lines in the current selection (block walk + fragment fallback). */
function collectSelectedLineHtmls(root, range) {
    let lines = expandLineHtmlsForList(collectLineHtmlsInRange(root, range));
    if (lines.length < 2) {
        const fromFragment = collectLineHtmlsFromRangeFragment(root, range);
        if (fromFragment.length > lines.length) lines = fromFragment;
    }
    return lines;
}

/** Collect every visual line in the selection (lists, paragraphs, or <br>-split blocks). */
function collectLineHtmlsInRange(root, range) {
    /** @type {string[]} */
    const lines = [];

    const pushBlock = (el) => {
        if (!el || !rangeIntersectsNode(range, el)) return;
        getLineHtmlsFromElementInRange(el, range).forEach((h) => lines.push(h));
    };

    const walk = (parent) => {
        if (!parent?.childNodes) return;
        [...parent.childNodes].forEach((node) => {
            if (node.nodeType !== 1) return;
            const tag = node.tagName;
            if (tag === 'TABLE') return;
            if (tag === 'UL' || tag === 'OL') {
                [...node.children].forEach((c) => {
                    if (c.tagName === 'LI') pushBlock(c);
                });
                return;
            }
            if (tag === 'LI') {
                pushBlock(node);
                return;
            }
            if (!['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(tag)) return;
            if (node.closest('ul, ol, table')) return;
            const hasInnerBlocks = node.querySelector(':scope > p, :scope > div, :scope > ul, :scope > ol');
            if (tag === 'DIV' && hasInnerBlocks) {
                walk(node);
                return;
            }
            pushBlock(node);
        });
    };

    walk(root);
    return lines;
}

/** Every visual line in document order (nested <p>, <li>, <br> splits — not only direct children). */
function collectAllBlockLinesInOrder(root) {
    if (!root?.ownerDocument) return [];
    /** @type {string[]} */
    const lines = [];
    const doc = root.ownerDocument;
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
        acceptNode(node) {
            const tag = node.tagName;
            if (!tag) return NodeFilter.FILTER_SKIP;
            if (tag === 'TABLE' || tag === 'THEAD' || tag === 'TBODY' || tag === 'TR') {
                return NodeFilter.FILTER_REJECT;
            }
            if (tag === 'UL' || tag === 'OL') return NodeFilter.FILTER_SKIP;
            if (tag === 'LI') return NodeFilter.FILTER_ACCEPT;
            if (['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(tag)) {
                if (node.closest('ul, ol, li, table')) return NodeFilter.FILTER_SKIP;
                if (node.querySelector(':scope > p, :scope > div, :scope > ul, :scope > ol')) {
                    return NodeFilter.FILTER_SKIP;
                }
                return NodeFilter.FILTER_ACCEPT;
            }
            return NodeFilter.FILTER_SKIP;
        },
    });

    while (walker.nextNode()) {
        const el = /** @type {Element} */ (walker.currentNode);
        getLineHtmlsFromElement(el).forEach((h) => {
            const t = h.replace(/<[^>]+>/g, '').replace(/\u00a0/g, ' ').trim();
            if (t) lines.push(h);
        });
    }
    return lines;
}

function isPerLineBulletLayout(root, allLines) {
    if (!root || allLines.length < 2) return false;
    const lists = [...root.querySelectorAll('ul, ol')].filter((l) => !l.closest('table'));
    const singleLiLists = lists.filter((l) => l.querySelectorAll(':scope > li').length === 1);
    return singleLiLists.length >= 2 && singleLiLists.length >= allLines.length - 1;
}

function shouldRebuildAllLinesAsOneList(jodit, root, allLines) {
    if (!root || allLines.length < 2) return false;
    if (isPerLineBulletLayout(root, allLines)) return false;
    /* Never replace the whole editor body when tables/media are present. */
    if (editorHasProtectedStructures(root)) return false;

    const range = getEffectiveListRange(jodit);
    const hasSelection = range && !range.collapsed;

    /* Full rebuild only when the selection truly covers every text line in the clause. */
    if (hasSelection) {
        const selLines = collectSelectedLineHtmls(root, range);
        if (selLines.length < 2) return false;
        return selLines.length >= allLines.length;
    }

    /* Toolbar click collapsed the native range — never guess full rebuild if a table exists. */
    if (editorHasProtectedStructures(root)) return false;

    /* No stashed selection: only rebuild mixed layouts when the whole clause has no table. */
    if (editorNeedsFullListRebuild(root)) return true;
    return false;
}

function isPartialLineSelection(jodit, root, allLines) {
    const range = getEffectiveListRange(jodit);
    if (!range || range.collapsed || !root) return false;
    const selLines = collectSelectedLineHtmls(root, range);
    return selLines.length >= 2 && selLines.length < allLines.length;
}

/** Apply bullets/numbers to the current partial line selection only. */
function tryApplyListToSelectedLines(
    jodit,
    editorRoot,
    tagName,
    preset,
    clearClassNames,
    oppositeClearClassNames
) {
    const range = getEffectiveListRange(jodit);
    if (!range || range.collapsed || !editorRoot) return false;

    const selLines = collectSelectedLineHtmls(editorRoot, range);
    if (selLines.length < 2) return false;

    const oppClear = oppositeClearClassNames || (tagName === 'ul' ? OL_CLASS_NAMES : BULLET_CLASS_NAMES);

    let rebuilt =
        replaceSelectedBlocksWithList(
            jodit,
            tagName,
            selLines,
            preset,
            clearClassNames,
            oppositeClearClassNames
        ) ||
        replaceSelectionWithSingleList(
            jodit,
            tagName,
            preset,
            clearClassNames,
            oppositeClearClassNames
        );

    if (!rebuilt) {
        const wrapped = wrapPlainBlocksInList(
            jodit,
            tagName,
            preset,
            clearClassNames,
            oppositeClearClassNames
        );
        rebuilt = wrapped[0] || null;
    }

    if (!rebuilt) {
        if (tagName === 'ul') {
            convertListsInScope(jodit, 'ol', 'ul', oppClear);
        } else {
            convertListsInScope(jodit, 'ul', 'ol', oppClear);
        }
        let lists = getListsToStyle(jodit, tagName);
        if (!lists.length) {
            lists = getListsIntersectingRange(jodit, tagName);
        }
        if (lists.length) {
            lists.forEach((list) =>
                applyPresetToListElement(list, preset, clearClassNames, oppClear)
            );
            rebuilt = lists[0];
        }
    }

    if (!rebuilt) return false;

    const after = getWysiwygEditor(jodit);
    if (after) {
        cleanupNestedAndEmptyListItems(after);
        mergeAdjacentLists(after, 'ul');
        mergeAdjacentLists(after, 'ol');
        stripLeadingListMarkers(after);
        stripClauseInlineFontSizes(after);
    }
    return true;
}

function buildListElement(doc, tagName, lineHtmls, preset, clearClassNames, oppositeClearClassNames) {
    const list = doc.createElement(tagName);
    lineHtmls.forEach((html) => {
        const li = doc.createElement('li');
        li.innerHTML = html;
        list.appendChild(li);
    });
    applyPresetToListElement(list, preset, clearClassNames, oppositeClearClassNames);
    return list;
}

/** Push live DOM to Jodit value/onChange without setEditorValue (that can strip tables). */
function syncEditorFromDom(jodit) {
    const root = getWysiwygEditor(jodit);
    const domHtml = root?.innerHTML;
    if (domHtml != null && domHtml !== '') {
        jodit.value = domHtml;
    }
    if (typeof jodit.synchronizeValues === 'function') {
        jodit.synchronizeValues();
    }
}

/** Replace entire editor HTML — only for select-all rebuilds with no tables below. */
function setJoditEditorHtml(jodit, html) {
    const root = getWysiwygEditor(jodit);
    if (root) root.innerHTML = html;
    if (typeof jodit.setEditorValue === 'function') {
        jodit.setEditorValue(html);
    } else if (jodit.editor != null) {
        jodit.value = html;
    }
    syncEditorFromDom(jodit);
}

/** Shrink a range so it never includes tables/media (prevents deleteContents wiping them). */
function clampRangeExcludingProtectedStructures(root, range) {
    if (!root || !range || range.collapsed) return range;
    const doc = root.ownerDocument;
    let clipped = range.cloneRange();

    root.querySelectorAll('table, img, video, iframe, object, embed').forEach((node) => {
        try {
            const nodeRange = doc.createRange();
            if (node.tagName === 'TABLE') {
                nodeRange.selectNode(node);
            } else {
                nodeRange.selectNode(node);
            }
            const intersects =
                clipped.compareBoundaryPoints(Range.END_TO_START, nodeRange) < 0 &&
                clipped.compareBoundaryPoints(Range.START_TO_END, nodeRange) > 0;
            if (!intersects) return;

            const next = doc.createRange();
            if (clipped.compareBoundaryPoints(Range.START_TO_START, nodeRange) >= 0 &&
                clipped.compareBoundaryPoints(Range.START_TO_END, nodeRange) <= 0) {
                next.setStartAfter(node);
            } else {
                next.setStart(clipped.startContainer, clipped.startOffset);
            }
            if (clipped.compareBoundaryPoints(Range.END_TO_END, nodeRange) <= 0 &&
                clipped.compareBoundaryPoints(Range.END_TO_START, nodeRange) >= 0) {
                next.setEndBefore(node);
            } else {
                next.setEnd(clipped.endContainer, clipped.endOffset);
            }
            if (!next.collapsed) clipped = next;
        } catch {
            /* ignore */
        }
    });

    return clipped.collapsed ? range : clipped;
}

/**
 * Replace selected plain blocks with one list (one <li> per visual line).
 * More reliable than range.deleteContents() across multiple <p>/<div> siblings.
 */
function replaceSelectedBlocksWithList(jodit, tagName, lineHtmls, preset, clearClassNames, oppositeClearClassNames) {
    if (lineHtmls.length < 2) return null;
    const doc = getWysiwygEditor(jodit)?.ownerDocument;
    if (!doc) return null;

    const range = getEffectiveListRange(jodit);
    const blocks = getPlainBlocksInRange(jodit).filter(
        (block) => !nodeHasProtectedDescendantOutsideRange(block, range)
    );
    if (!blocks.length) return null;

    const list = buildListElement(doc, tagName, lineHtmls, preset, clearClassNames, oppositeClearClassNames);
    const first = blocks[0];
    const parent = first.parentNode;
    if (!parent) return null;

    parent.insertBefore(list, first);
    blocks.forEach((block) => {
        if (block.parentNode && !nodeHasProtectedDescendantOutsideRange(block, range)) {
            block.remove();
        }
    });
    splitListItemsOnBr(list);
    return list;
}

/**
 * Select-all + bullet: replace the whole selection with one list (one <li> per line).
 * Avoids Jodit leaving plain/indented lines outside <ul>.
 */
function replaceSelectionWithSingleList(jodit, tagName, preset, clearClassNames, oppositeClearClassNames) {
    const root = getWysiwygEditor(jodit);
    const range = getEffectiveListRange(jodit);
    if (!range || range.collapsed || !root) return null;

    const lineHtmls = collectSelectedLineHtmls(root, range);
    if (lineHtmls.length < 2) return null;

    const fromBlocks = replaceSelectedBlocksWithList(
        jodit,
        tagName,
        lineHtmls,
        preset,
        clearClassNames,
        oppositeClearClassNames
    );
    if (fromBlocks) return fromBlocks;

    const doc = root.ownerDocument;
    const list = buildListElement(doc, tagName, lineHtmls, preset, clearClassNames, oppositeClearClassNames);
    splitListItemsOnBr(list);

    try {
        range.deleteContents();
        range.insertNode(list);
        range.setStartAfter(list);
        range.collapse(true);
        if (jodit.s?.selectRange) jodit.s.selectRange(range);
    } catch {
        return null;
    }
    return list;
}

function getEditorLineSummary(root) {
    if (!root) {
        return { totalLines: 0, liCount: 0, listCount: 0, singleLiListCount: 0 };
    }
    const doc = root.ownerDocument;
    const range = doc.createRange();
    range.selectNodeContents(root);
    const totalLines = collectLineHtmlsInRange(root, range).length;
    const lists = [...root.querySelectorAll('ul, ol')].filter((l) => !l.closest('table'));
    const liCount = lists.reduce(
        (n, l) => n + l.querySelectorAll(':scope > li').length,
        0
    );
    const singleLiListCount = lists.filter(
        (l) => l.querySelectorAll(':scope > li').length === 1
    ).length;
    return { totalLines, liCount, listCount: lists.length, singleLiListCount };
}

/**
 * Partial apply: e.g. 2 bullets + 8 plain lines. Does not trigger for per-line bullets
 * (many separate single-item lists).
 */
function editorNeedsFullListRebuild(root) {
    const { totalLines, liCount, listCount, singleLiListCount } = getEditorLineSummary(root);
    if (totalLines < 2 || liCount === 0) return false;
    if (liCount >= totalLines) return false;
    if (singleLiListCount >= 2 && singleLiListCount >= totalLines - 1) return false;
    if (listCount >= 2 && singleLiListCount === listCount) return false;
    return true;
}

/** Full rebuild when user selected most/all plain lines (select-all + bullet). */
function selectionCoversMostEditorLines(jodit, root) {
    const range = jodit.s?.range;
    if (!range || range.collapsed) return false;
    const doc = root.ownerDocument;
    const full = doc.createRange();
    full.selectNodeContents(root);
    const totalLines = collectLineHtmlsInRange(root, full).length;
    const selLines = collectLineHtmlsInRange(root, range).length;
    if (totalLines < 2 || selLines < 2) return false;
    return selLines >= totalLines - 1 || selLines >= Math.ceil(totalLines * 0.75);
}

function shouldUseFullEditorListRebuild(jodit, root) {
    if (!root) return false;
    if (editorNeedsFullListRebuild(root)) return true;
    const { totalLines, liCount } = getEditorLineSummary(root);
    if (totalLines >= 2 && liCount === 0 && selectionCoversMostEditorLines(jodit, root)) {
        return true;
    }
    return false;
}

/** Rebuild entire clause editor body as one list (fallback when toolbar click drops selection). */
function replaceEditorBodyWithSingleList(jodit, tagName, preset, clearClassNames, oppositeClearClassNames) {
    const root = getWysiwygEditor(jodit);
    if (!root) return null;

    const doc = root.ownerDocument;
    const range = doc.createRange();
    range.selectNodeContents(root);
    const lineHtmls = collectLineHtmlsInRange(root, range);
    if (lineHtmls.length < 2) return null;

    const list = doc.createElement(tagName);
    lineHtmls.forEach((html) => {
        const li = doc.createElement('li');
        li.innerHTML = html;
        list.appendChild(li);
    });
    applyPresetToListElement(list, preset, clearClassNames, oppositeClearClassNames);
    root.innerHTML = '';
    root.appendChild(list);
    return list;
}

/** Remember the last non-empty editor selection (opening the bullet menu often collapses it). */
function rememberEditorListSelection(jodit) {
    try {
        const range = jodit.s?.range;
        if (!jodit.s?.isInsideArea || !range || range.collapsed) return;
        const root = getWysiwygEditor(jodit);
        const clipped = root ? clampRangeExcludingProtectedStructures(root, range) : range;
        if (clipped.collapsed) return;
        jodit.__emsLastGoodListRange = clipped.cloneRange();
    } catch {
        /* ignore */
    }
}

/** Toolbar list menus steal focus — stash selection before the click. */
function stashListToolbarSelection(jodit) {
    try {
        const range = jodit.s?.range;
        if (jodit.s?.isInsideArea && range && !range.collapsed) {
            jodit.__emsSavedListRange = range.cloneRange();
            jodit.__emsLastGoodListRange = range.cloneRange();
            jodit.s.save(true);
            jodit.__emsListToolbarSelStashed = true;
            return;
        }
        if (jodit.__emsLastGoodListRange) {
            jodit.__emsSavedListRange = jodit.__emsLastGoodListRange.cloneRange();
            jodit.__emsListToolbarSelStashed = true;
        }
    } catch {
        /* ignore */
    }
}

function restoreListToolbarSelection(jodit) {
    let restored = false;
    if (jodit.__emsSavedListRange) {
        try {
            jodit.s.selectRange(jodit.__emsSavedListRange);
            restored = true;
        } catch {
            /* ignore */
        }
        jodit.__emsSavedListRange = null;
    }
    if (jodit.__emsListToolbarSelStashed) {
        try {
            jodit.s.restore();
            restored = true;
        } catch {
            /* ignore */
        }
        jodit.__emsListToolbarSelStashed = false;
    }
    if (!restored && jodit.__emsLastGoodListRange) {
        try {
            jodit.s.selectRange(jodit.__emsLastGoodListRange);
            restored = true;
        } catch {
            /* ignore */
        }
    }
    return restored;
}

const LIST_TOOLBAR_POPUP_RE =
    /Solid round|Hollow round|Solid square|Checkmark|Arrow|Diamond|1\.\s+2\.|upper-roman|lower-roman/i;

function isListToolbarInteractionTarget(target) {
    const t = /** @type {Element | null} */ (target);
    if (!t?.closest) return false;
    if (t.closest('.jodit-toolbar-button[data-ref="ul"], .jodit-toolbar-button[data-ref="ol"]')) {
        return true;
    }
    const popup = t.closest('.jodit-popup');
    if (popup && LIST_TOOLBAR_POPUP_RE.test(popup.textContent || '')) {
        return true;
    }
    return false;
}

function registerListToolbarSelectionHooks(jodit) {
    if (!jodit || jodit.__emsListToolbarSelHooks) return;
    jodit.__emsListToolbarSelHooks = true;

    const onEditorSelectionActivity = () => rememberEditorListSelection(jodit);

    jodit.events.on('mouseup', onEditorSelectionActivity);
    jodit.events.on('keyup', onEditorSelectionActivity);
    jodit.events.on('changeSelection', onEditorSelectionActivity);

    jodit.events.on(
        'mousedown',
        (e) => {
            const t = e.target;
            if (!t?.closest) return;
            const wysiwyg = t.closest('.jodit-wysiwyg');
            if (wysiwyg) {
                rememberEditorListSelection(jodit);
                return;
            }
            const inListUi = isListToolbarInteractionTarget(t);
            const inToolbar = t.closest('.jodit-toolbar, .jodit-popup');
            if (!inListUi && !inToolbar) return;
            if (inListUi || t.closest('.jodit-toolbar-button[data-ref="ul"], .jodit-toolbar-button[data-ref="ol"]')) {
                stashListToolbarSelection(jodit);
            }
        },
        true
    );

    const root = getWysiwygEditor(jodit);
    const doc = root?.ownerDocument;
    if (doc && !doc.__emsListSelChangeBound) {
        doc.__emsListSelChangeBound = true;
        doc.addEventListener('selectionchange', () => rememberEditorListSelection(jodit));
    }
}

function getSelectedListItems(list, range) {
    if (!list || !range) return [];
    return [...list.children].filter((c) => {
        if (c.tagName !== 'LI') return false;
        return rangeIntersectsNode(range, c);
    });
}

/**
 * Split one <ul>/<ol> so only selected <li> items move into their own list(s).
 * Unselected segments keep the original list styling.
 */
function splitListPreserveStyles(list, selectedLis) {
    const allItems = [...list.children].filter((c) => c.tagName === 'LI');
    if (!selectedLis.length || selectedLis.length === allItems.length || !list.parentNode) {
        return [list];
    }

    const parent = list.parentNode;
    const doc = list.ownerDocument;
    const tag = list.tagName.toLowerCase();
    /** @type {Array<{ selected: boolean, items: Element[] }>} */
    const segments = [];
    let cur = null;

    for (const li of allItems) {
        const sel = selectedLis.includes(li);
        if (!cur || cur.selected !== sel) {
            cur = { selected: sel, items: [] };
            segments.push(cur);
        }
        cur.items.push(li);
    }

    const frag = doc.createDocumentFragment();
    /** @type {Element[]} */
    const selectedLists = [];

    for (const seg of segments) {
        const nl = doc.createElement(tag);
        if (!seg.selected) {
            nl.className = list.className;
            const styleAttr = list.getAttribute('style');
            if (styleAttr) nl.setAttribute('style', styleAttr);
            if (list.style?.listStyleType) nl.style.listStyleType = list.style.listStyleType;
        }
        seg.items.forEach((li) => nl.appendChild(li));
        frag.appendChild(nl);
        if (seg.selected) selectedLists.push(nl);
    }

    parent.replaceChild(frag, list);
    return selectedLists.length ? selectedLists : [list];
}

/** Merge consecutive sibling lists only when bullet/number style matches. */
function mergeAdjacentLists(root, tagName = 'ol') {
    if (!root?.querySelectorAll) return;
    const tag = tagName.toUpperCase();

    const mergeInParent = (parent) => {
        if (!parent?.children) return;
        let i = 0;
        while (i < parent.children.length) {
            const node = parent.children[i];
            if (node.tagName === tag) {
                let j = i + 1;
                while (j < parent.children.length && parent.children[j].tagName === tag) {
                    const next = parent.children[j];
                    if (listStyleFingerprint(node) !== listStyleFingerprint(next)) break;
                    while (next.firstChild) {
                        node.appendChild(next.firstChild);
                    }
                    next.remove();
                }
            } else if (node.nodeType === 1) {
                mergeInParent(node);
            }
            i += 1;
        }
    };

    mergeInParent(root);
}

/** Remove empty <li> shells and hoist nested lists (fixes extra bullets when changing style). */
function cleanupNestedAndEmptyListItems(root) {
    if (!root?.querySelectorAll) return;
    let changed = true;
    while (changed) {
        changed = false;
        root.querySelectorAll('ul, ol').forEach((list) => {
            [...list.querySelectorAll(':scope > li')].forEach((li) => {
                const nested = li.querySelector(':scope > ul, :scope > ol');
                const text = String(li.textContent || '')
                    .replace(/\u00a0/g, ' ')
                    .trim();
                const onlyNested =
                    nested &&
                    !text &&
                    [...li.childNodes].every(
                        (n) =>
                            n.nodeType === 3 ||
                            (n.nodeType === 1 &&
                                (n.tagName === 'BR' || n.tagName === 'UL' || n.tagName === 'OL'))
                    );
                if (onlyNested && nested.parentNode === li) {
                    const parent = li.parentNode;
                    while (nested.firstChild) {
                        parent.insertBefore(nested.firstChild, li);
                    }
                    li.remove();
                    changed = true;
                    return;
                }
                if (!text && !nested && !li.querySelector('img, table')) {
                    li.remove();
                    changed = true;
                }
            });
        });
    }
}

/** Changing bullet style on an existing list — restyle in place, do not wrap/rebuild. */
function shouldApplyListPresetInPlaceOnly(jodit, editorRoot, tagName) {
    if (!editorRoot) return false;
    if (getPlainBlocksInRange(jodit).length > 0) return false;
    const oppTag = tagName === 'ul' ? 'ol' : 'ul';
    return (
        getListsIntersectingRange(jodit, tagName).length > 0 ||
        getListsIntersectingRange(jodit, oppTag).length > 0
    );
}

function applyListPresetInPlace(jodit, editorRoot, tagName, preset, clearClassNames, oppClear) {
    if (tagName === 'ul') {
        convertListsInScope(jodit, 'ol', 'ul', oppClear);
    } else {
        convertListsInScope(jodit, 'ul', 'ol', oppClear);
    }
    let lists = getListsToStyle(jodit, tagName);
    if (!lists.length) {
        lists = getListsIntersectingRange(jodit, tagName);
    }
    lists.forEach((list) =>
        applyPresetToListElement(list, preset, clearClassNames, oppClear)
    );
    cleanupNestedAndEmptyListItems(editorRoot);
    mergeAdjacentLists(editorRoot, 'ul');
    mergeAdjacentLists(editorRoot, 'ol');
    stripLeadingListMarkers(editorRoot);
    stripClauseInlineFontSizes(editorRoot);
}

/** Lists touched by the current selection (or all lists in the editor if none). */
function getListsInScope(jodit, tagName) {
    const editor = getWysiwygEditor(jodit);
    if (!editor) return [];
    const tag = tagName.toUpperCase();
    const found = new Set();
    const range = jodit.s?.range;
    if (range) {
        let node = range.startContainer;
        if (node?.nodeType === 3) node = node.parentElement;
        while (node && node !== editor) {
            if (node.tagName === tag) found.add(node);
            node = node.parentElement;
        }
    }
    /* Do not restyle every list in the clause when the caret is in plain text. */
    if (found.size === 0 && range && !range.collapsed) {
        editor.querySelectorAll(tagName).forEach((el) => found.add(el));
    }
    return [...found];
}

/** Lists that should receive the new preset (split mixed lists so other lines keep their style). */
function getListsToStyle(jodit, tagName) {
    const range = jodit.s?.range;
    let lists = getListsIntersectingRange(jodit, tagName);
    if (!range || !lists.length) return lists;

    /** @type {Element[]} */
    const out = [];
    for (const list of lists) {
        const selectedLis = getSelectedListItems(list, range);
        if (selectedLis.length > 0 && selectedLis.length < list.querySelectorAll(':scope > li').length) {
            out.push(...splitListPreserveStyles(list, selectedLis));
        } else {
            out.push(list);
        }
    }
    return out;
}

function getEffectiveListRange(jodit) {
    const root = getWysiwygEditor(jodit);
    const range = jodit.s?.range;
    let effective = range && !range.collapsed ? range : null;
    if (!effective && jodit.__emsSavedListRange) effective = jodit.__emsSavedListRange;
    if (!effective && jodit.__emsLastGoodListRange) effective = jodit.__emsLastGoodListRange;
    if (!effective) return range || null;
    return root ? clampRangeExcludingProtectedStructures(root, effective) : effective;
}

/** Plain blocks (p/div) in the current selection that are not already inside a list. */
function getPlainBlocksInRange(jodit) {
    const editor = getWysiwygEditor(jodit);
    const range = getEffectiveListRange(jodit);
    if (!editor || !range || range.collapsed) return [];

    /** @type {Element[]} */
    const candidates = [];

    const walk = (parent) => {
        if (!parent?.children) return;
        [...parent.children].forEach((child) => {
            if (child.nodeType !== 1) return;
            const tag = child.tagName;
            if (tag === 'UL' || tag === 'OL' || tag === 'TABLE') return;
            if (!['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(tag)) return;
            if (child.closest('ul, ol, table')) return;

            if (!rangeIntersectsNode(range, child)) {
                if (tag === 'DIV') walk(child);
                return;
            }

            /* Do not replace a wrapper that also contains the table below the selection. */
            if (nodeHasProtectedDescendantOutsideRange(child, range)) {
                walk(child);
                return;
            }

            const innerPs = [...child.querySelectorAll(':scope > p')].filter((p) =>
                rangeIntersectsNode(range, p)
            );
            if (tag === 'DIV' && innerPs.length > 0) {
                innerPs.forEach((p) => candidates.push(p));
            } else {
                candidates.push(child);
            }
        });
    };

    walk(editor);
    return candidates;
}

/** Wrap plain paragraphs/divs in the selection (one <li> per visual line, merged when multi-block). */
function wrapPlainBlocksInList(jodit, tagName, preset, clearClassNames, oppositeClearClassNames) {
    const doc = getWysiwygEditor(jodit)?.ownerDocument;
    if (!doc) return [];

    const range = getEffectiveListRange(jodit);
    const blocks = getPlainBlocksInRange(jodit).filter(
        (block) => !nodeHasProtectedDescendantOutsideRange(block, range)
    );
    if (!blocks.length) return [];

    /** @type {string[]} */
    const lineHtmls = [];
    blocks.forEach((block) => {
        getLineHtmlsFromElement(block).forEach((h) => lineHtmls.push(h));
    });
    const expanded = expandLineHtmlsForList(lineHtmls);
    if (!expanded.length) return [];

    const list = buildListElement(doc, tagName, expanded, preset, clearClassNames, oppositeClearClassNames);
    splitListItemsOnBr(list);

    const first = blocks[0];
    const parent = first.parentNode;
    if (!parent) return [];

    parent.insertBefore(list, first);
    blocks.forEach((block) => {
        if (block.parentNode) block.remove();
    });

    return [list];
}

/** One <li> with <br> line breaks → one <li> per visual line (each gets a bullet). */
function splitListItemsOnBr(list) {
    if (!list?.querySelectorAll) return;
    const doc = list.ownerDocument;
    const items = [...list.querySelectorAll(':scope > li')];

    for (const li of items) {
        const html = li.innerHTML;
        if (!/<br\s*\/?>/i.test(html)) continue;
        const parts = html
            .split(/<br\s*\/?>/gi)
            .map((s) => s.trim())
            .filter(Boolean);
        if (parts.length < 2) continue;

        li.innerHTML = parts[0];
        let after = li;
        for (let i = 1; i < parts.length; i += 1) {
            const newLi = doc.createElement('li');
            newLi.innerHTML = parts[i];
            after = list.insertBefore(newLi, after.nextSibling);
        }
    }
}

/** When the user selects many lines and applies one list style, merge into a single list. */
function mergeListsIntersectingRange(jodit, tagName) {
    const range = jodit.s?.range;
    if (!range || range.collapsed) return;
    const lists = [...getListsIntersectingRange(jodit, tagName)];
    if (lists.length < 2) return;

    const first = lists[0];
    for (let i = 1; i < lists.length; i += 1) {
        const list = lists[i];
        while (list.firstChild) {
            first.appendChild(list.firstChild);
        }
        list.remove();
    }
}

/** All lists of a tag that overlap the current selection (more reliable than ancestor-only). */
function getListsIntersectingRange(jodit, tagName) {
    const editor = getWysiwygEditor(jodit);
    if (!editor) return [];
    const range = jodit.s?.range;
    const fromAncestor = getListsInScope(jodit, tagName);
    if (!range || range.collapsed) return fromAncestor;

    const found = new Set(fromAncestor);
    const doc = editor.ownerDocument;
    editor.querySelectorAll(tagName).forEach((list) => {
        try {
            const lr = doc.createRange();
            lr.selectNodeContents(list);
            const overlaps =
                range.compareBoundaryPoints(Range.END_TO_START, lr) < 0 &&
                range.compareBoundaryPoints(Range.START_TO_END, lr) > 0;
            if (overlaps) found.add(list);
        } catch {
            /* ignore detached nodes */
        }
    });
    return [...found];
}

/** Replace <ol> with <ul> or the reverse so bullet/number toolbar matches the chosen list type. */
function replaceListElement(list, newTagName) {
    if (!list?.parentNode) return list;
    const cur = list.tagName?.toLowerCase();
    const nextTag = String(newTagName || '').toLowerCase();
    if (!cur || !nextTag || cur === nextTag) return list;
    const doc = list.ownerDocument;
    const replacement = doc.createElement(nextTag);
    while (list.firstChild) {
        replacement.appendChild(list.firstChild);
    }
    list.parentNode.replaceChild(replacement, list);
    return replacement;
}

function convertListsInScope(jodit, fromTag, toTag, clearClassNames) {
    const lists = [...getListsIntersectingRange(jodit, fromTag)];
    lists.forEach((list) => {
        stripClasses(list, clearClassNames);
        if (list.style) {
            list.style.listStyleType = '';
        }
        replaceListElement(list, toTag);
    });
    const editor = getWysiwygEditor(jodit);
    if (editor) {
        mergeAdjacentLists(editor, toTag);
        stripLeadingListMarkers(editor);
    }
    return lists.length;
}

function applyPresetToListElement(list, preset, clearClassNames, oppositeClearClassNames) {
    if (!list) return;
    stripClasses(list, clearClassNames);
    if (oppositeClearClassNames) stripClasses(list, oppositeClearClassNames);
    list.className = preset.classes.join(' ').trim();
    if (preset.native && preset.listStyleType) {
        list.style.listStyleType = preset.listStyleType;
    } else if (preset.listStyleType != null && preset.listStyleType !== 'none') {
        list.style.listStyleType = preset.listStyleType;
    } else if (preset.classes.length > 0) {
        list.style.listStyleType = 'none';
    } else {
        list.style.listStyleType = preset.listStyleType || '';
    }
}

/** Ensure saved/preview HTML carries EMS classes (Jodit often keeps only inline list-style-type). */
function inferListClassesFromStyles(root) {
    if (!root?.querySelectorAll) return;

    root.querySelectorAll('ul').forEach((ul) => {
        const hasBulletClass = BULLET_CLASS_NAMES.some((c) => ul.classList.contains(c));
        if (hasBulletClass) return;

        const styleAttr = String(ul.getAttribute('style') || '').toLowerCase();
        const inlineType = (ul.style?.listStyleType || '').toLowerCase();
        const m = styleAttr.match(/list-style-type\s*:\s*([^;]+)/i);
        const type = (inlineType || (m ? m[1] : '') || 'disc').trim().toLowerCase();

        if (type === 'none') return;
        if (type === 'circle') ul.classList.add('ems-bullet-circle');
        else if (type === 'square') ul.classList.add('ems-bullet-square');
        else ul.classList.add('ems-bullet-disc');
    });

    root.querySelectorAll('ol').forEach((ol) => {
        const hasNumClass = OL_CLASS_NAMES.some((c) => ol.classList.contains(c));
        if (hasNumClass) return;
        const styleAttr = String(ol.getAttribute('style') || '').toLowerCase();
        const inlineType = (ol.style?.listStyleType || '').toLowerCase();
        if (inlineType === 'none' || /list-style-type\s*:\s*none/i.test(styleAttr)) return;
        ol.classList.add('ems-num-decimal');
        if (!ol.style.listStyleType) ol.style.listStyleType = 'decimal';
    });
}

function normalizeListsInEditor(jodit, tagName) {
    const editor = getWysiwygEditor(jodit);
    if (!editor) return;
    mergeAdjacentLists(editor, 'ol');
    mergeAdjacentLists(editor, 'ul');
    if (tagName === 'ol') {
        stripLeadingListMarkers(editor);
    }
}

/** Remove inline font-size Jodit sometimes adds when toggling lists. */
function stripClauseInlineFontSizes(root) {
    if (!root?.querySelectorAll) return;
    root.querySelectorAll('li, p, span, font').forEach((el) => {
        if (el.style) el.style.removeProperty('font-size');
        if (el.tagName === 'FONT' && el.hasAttribute('size')) el.removeAttribute('size');
        const st = el.getAttribute?.('style');
        if (st != null && !String(st).trim()) el.removeAttribute('style');
    });
}

/** Turn <ul>/<ol> into plain <p> blocks (Word "None" — no bullets/numbers). */
function unwrapListsToParagraphs(lists) {
    [...lists].forEach((list) => {
        if (!list?.parentNode) return;
        const parent = list.parentNode;
        const doc = list.ownerDocument;
        const items = [...list.children].filter((c) => c.tagName === 'LI');
        const nodes = items.map((li) => {
            const p = doc.createElement('p');
            p.innerHTML = li.innerHTML;
            return p;
        });
        if (!nodes.length) {
            list.remove();
            return;
        }
        const frag = doc.createDocumentFragment();
        nodes.forEach((n) => {
            stripClauseInlineFontSizes(n);
            frag.appendChild(n);
        });
        parent.insertBefore(frag, list);
        list.remove();
    });
}

function clearListPreset(jodit, tagName, clearClassNames) {
    const lists = getListsIntersectingRange(jodit, tagName);
    lists.forEach((list) => {
        stripClasses(list, clearClassNames);
        if (list.style) list.style.listStyleType = '';
        list.className = '';
        list.removeAttribute('data-ems-list');
    });
    unwrapListsToParagraphs(lists);
    const editor = getWysiwygEditor(jodit);
    if (editor) stripClauseInlineFontSizes(editor);
    syncEditorFromDom(jodit);
    return true;
}

function applyListPreset(jodit, tagName, type, presets, clearClassNames, oppositeClearClassNames) {
    if (type === 'none') {
        return clearListPreset(jodit, tagName, clearClassNames);
    }

    const key = type == null || type === 'default' ? (tagName === 'ul' ? 'disc' : 'decimal') : type;
    const preset = presets[key] || (tagName === 'ul' ? UL_PRESETS.disc : OL_PRESETS.decimal);
    const oppClear = oppositeClearClassNames || (tagName === 'ul' ? OL_CLASS_NAMES : BULLET_CLASS_NAMES);

    restoreListToolbarSelection(jodit);

    const editorRoot = getWysiwygEditor(jodit);
    if (!editorRoot) return true;

    const tableSnapshots = snapshotEditorTables(editorRoot);

    const allLines = collectAllBlockLinesInOrder(editorRoot);
    let range = getEffectiveListRange(jodit);
    if (range && !range.collapsed) {
        try {
            jodit.s.selectRange(range);
        } catch {
            /* ignore */
        }
    }

    /* Selected lines only (not the whole clause) — must run before full-body rebuild. */
    if (isPartialLineSelection(jodit, editorRoot, allLines)) {
        if (
            tryApplyListToSelectedLines(
                jodit,
                editorRoot,
                tagName,
                preset,
                clearClassNames,
                oppositeClearClassNames
            )
        ) {
            finishListPresetApply(jodit, tableSnapshots);
            return true;
        }
    }

    /* Already a list — change bullet/number style only (no wrap/rebuild). */
    if (shouldApplyListPresetInPlaceOnly(jodit, editorRoot, tagName)) {
        applyListPresetInPlace(jodit, editorRoot, tagName, preset, clearClassNames, oppClear);
        finishListPresetApply(jodit, tableSnapshots);
        return true;
    }

    /* Primary path: one <li> per visual line (fixes select-all + bullet and 2 bullets + plain lines). */
    if (shouldRebuildAllLinesAsOneList(jodit, editorRoot, allLines)) {
        const list = buildListElement(
            editorRoot.ownerDocument,
            tagName,
            allLines,
            preset,
            clearClassNames,
            oppClear
        );
        setJoditEditorHtml(jodit, list.outerHTML);
        const after = getWysiwygEditor(jodit);
        if (after) {
            stripLeadingListMarkers(after);
            stripClauseInlineFontSizes(after);
        }
        finishListPresetApply(jodit, tableSnapshots);
        return true;
    }

    /* Multi-line selection (including stashed range after toolbar click). */
    if (range && !range.collapsed) {
        if (
            tryApplyListToSelectedLines(
                jodit,
                editorRoot,
                tagName,
                preset,
                clearClassNames,
                oppositeClearClassNames
            )
        ) {
            finishListPresetApply(jodit, tableSnapshots);
            return true;
        }
    }

    /* Single-line / per-line bullet: style only lists touched by the caret. */
    if (tagName === 'ul') {
        convertListsInScope(jodit, 'ol', 'ul', oppClear);
    } else {
        convertListsInScope(jodit, 'ul', 'ol', oppClear);
    }

    let lists = getListsToStyle(jodit, tagName);
    if (lists.length === 0) {
        lists = wrapPlainBlocksInList(jodit, tagName, preset, clearClassNames, oppClear);
    }

    lists.forEach((list) => applyPresetToListElement(list, preset, clearClassNames, oppClear));

    const editor = getWysiwygEditor(jodit);
    if (editor) {
        const listsToSplit = new Set([...lists, ...getListsIntersectingRange(jodit, tagName)]);
        listsToSplit.forEach((list) => splitListItemsOnBr(list));
        cleanupNestedAndEmptyListItems(editor);
        if (tagName === 'ol') stripLeadingListMarkers(editor);
        if (tagName === 'ul') stripLeadingListMarkers(editor);
    }

    finishListPresetApply(jodit, tableSnapshots);
    return true;
}

/** Override Jodit list commands with Word-style bullet/number libraries. */
export function registerClauseEditorListCommands(jodit) {
    if (!jodit || jodit.__emsListCommandsRegistered) return;
    jodit.__emsListCommandsRegistered = true;
    registerListToolbarSelectionHooks(jodit);

    jodit.e.on('beforeCommand', (command) => {
        const c = String(command || '').toLowerCase();
        if (c === 'insertunorderedlist' || c === 'insertorderedlist') {
            return false;
        }
    });

    jodit.registerCommand('insertUnorderedList', (_cmd, _mode, type) => {
        applyListPreset(jodit, 'ul', type, UL_PRESETS, BULLET_CLASS_NAMES, OL_CLASS_NAMES);
        return true;
    });
    jodit.registerCommand('insertOrderedList', (_cmd, _mode, type) => {
        applyListPreset(jodit, 'ol', type, OL_PRESETS, OL_CLASS_NAMES, BULLET_CLASS_NAMES);
        return true;
    });
}

export const EMS_UL_TOOLBAR_CONTROL = {
    name: 'ul',
    tags: ['ul'],
    tooltip: 'Bullet Library',
    list: BULLET_LIST_OPTIONS,
    exec: (jodit, _current, { control }) => {
        restoreListToolbarSelection(jodit);
        const key = control.args?.[0] ?? 'disc';
        applyListPreset(jodit, 'ul', key, UL_PRESETS, BULLET_CLASS_NAMES, OL_CLASS_NAMES);
        return true;
    },
};

export const EMS_OL_TOOLBAR_CONTROL = {
    name: 'ol',
    tags: ['ol'],
    tooltip: 'Numbering Library',
    list: NUMBER_LIST_OPTIONS,
    exec: (jodit, _current, { control }) => {
        restoreListToolbarSelection(jodit);
        const key = control.args?.[0] ?? 'decimal';
        applyListPreset(jodit, 'ol', key, OL_PRESETS, OL_CLASS_NAMES, BULLET_CLASS_NAMES);
        return true;
    },
};

/** Editor + print/PDF — keep in sync with clause HTML class names. */
export const CLAUSE_LIST_STYLES_CSS = `
    /* Standard bullets — class must match editor so preview/print render the same */
    .clause-editor-wrapper .jodit-wysiwyg ul.ems-bullet-disc,
    .clause-editor-wrapper .jodit-wysiwyg ul,
    .clause-editor-wrapper .jodit-wysiwyg ol,
    .clause-content ul,
    .clause-content ol {
        font-size: inherit !important;
    }
    .clause-editor-wrapper .jodit-wysiwyg li,
    .clause-content li {
        font-size: inherit !important;
    }

    .clause-content ul.ems-bullet-disc {
        list-style-type: disc !important;
        list-style-position: outside !important;
        padding-left: 1.5em !important;
    }
    .clause-editor-wrapper .jodit-wysiwyg ul.ems-bullet-circle,
    .clause-content ul.ems-bullet-circle {
        list-style-type: circle !important;
        list-style-position: outside !important;
        padding-left: 1.5em !important;
    }
    .clause-editor-wrapper .jodit-wysiwyg ul.ems-bullet-square,
    .clause-content ul.ems-bullet-square {
        list-style-type: square !important;
        list-style-position: outside !important;
        padding-left: 1.5em !important;
    }

    .clause-editor-wrapper .jodit-wysiwyg ul.ems-bullet-check,
    .clause-editor-wrapper .jodit-wysiwyg ul.ems-bullet-arrow,
    .clause-editor-wrapper .jodit-wysiwyg ul.ems-bullet-diamond,
    .clause-content ul.ems-bullet-check,
    .clause-content ul.ems-bullet-arrow,
    .clause-content ul.ems-bullet-diamond {
        list-style: none !important;
        padding-left: 1.75em !important;
    }
    .clause-editor-wrapper .jodit-wysiwyg ul.ems-bullet-check > li,
    .clause-editor-wrapper .jodit-wysiwyg ul.ems-bullet-arrow > li,
    .clause-editor-wrapper .jodit-wysiwyg ul.ems-bullet-diamond > li,
    .clause-content ul.ems-bullet-check > li,
    .clause-content ul.ems-bullet-arrow > li,
    .clause-content ul.ems-bullet-diamond > li {
        position: relative;
        list-style: none !important;
    }
    .clause-editor-wrapper .jodit-wysiwyg ul.ems-bullet-check > li::before,
    .clause-content ul.ems-bullet-check > li::before {
        content: '\\2713';
        position: absolute;
        left: -1.35em;
        font-weight: 700;
    }
    .clause-editor-wrapper .jodit-wysiwyg ul.ems-bullet-arrow > li::before,
    .clause-content ul.ems-bullet-arrow > li::before {
        content: '\\25B8';
        position: absolute;
        left: -1.2em;
        font-weight: 700;
    }
    .clause-editor-wrapper .jodit-wysiwyg ul.ems-bullet-diamond > li::before,
    .clause-content ul.ems-bullet-diamond > li::before {
        content: '\\25C6';
        position: absolute;
        left: -1.25em;
    }

    /* 1. 2. 3. — native browser numbering (one <ol>, many <li>) */
    .clause-editor-wrapper .jodit-wysiwyg ol.ems-num-decimal,
    .clause-content ol.ems-num-decimal {
        list-style-type: decimal !important;
        list-style-position: outside !important;
        padding-left: 2.1em !important;
    }
    .clause-editor-wrapper .jodit-wysiwyg ol.ems-num-decimal > li,
    .clause-content ol.ems-num-decimal > li {
        display: list-item !important;
        list-style-type: inherit !important;
        list-style-position: outside !important;
    }
    .clause-editor-wrapper .jodit-wysiwyg ol.ems-num-decimal > li::before,
    .clause-content ol.ems-num-decimal > li::before {
        content: none !important;
        display: none !important;
    }

    /* Other numbering styles — CSS counters (after lists are merged) */
    .clause-editor-wrapper .jodit-wysiwyg ol[class*='ems-num-']:not(.ems-num-decimal),
    .clause-content ol[class*='ems-num-']:not(.ems-num-decimal) {
        list-style: none !important;
        padding-left: 2.1em !important;
        counter-reset: emsol;
    }
    .clause-editor-wrapper .jodit-wysiwyg ol[class*='ems-num-']:not(.ems-num-decimal) > li,
    .clause-content ol[class*='ems-num-']:not(.ems-num-decimal) > li {
        position: relative;
        list-style: none !important;
        display: list-item !important;
        counter-increment: emsol;
    }
    .clause-editor-wrapper .jodit-wysiwyg ol[class*='ems-num-']:not(.ems-num-decimal) > li::before,
    .clause-content ol[class*='ems-num-']:not(.ems-num-decimal) > li::before {
        position: absolute;
        left: -2.1em;
        width: 1.9em;
        text-align: right;
    }
    .clause-editor-wrapper .jodit-wysiwyg ol.ems-num-decimal-paren > li::before,
    .clause-content ol.ems-num-decimal-paren > li::before {
        content: counter(emsol) ') ';
    }
    .clause-editor-wrapper .jodit-wysiwyg ol.ems-num-upper-roman > li::before,
    .clause-content ol.ems-num-upper-roman > li::before {
        content: counter(emsol, upper-roman) '. ';
    }
    .clause-editor-wrapper .jodit-wysiwyg ol.ems-num-upper-alpha > li::before,
    .clause-content ol.ems-num-upper-alpha > li::before {
        content: counter(emsol, upper-alpha) '. ';
    }
    .clause-editor-wrapper .jodit-wysiwyg ol.ems-num-lower-alpha-paren > li::before,
    .clause-content ol.ems-num-lower-alpha-paren > li::before {
        content: counter(emsol, lower-alpha) ') ';
    }
    .clause-editor-wrapper .jodit-wysiwyg ol.ems-num-lower-alpha > li::before,
    .clause-content ol.ems-num-lower-alpha > li::before {
        content: counter(emsol, lower-alpha) '. ';
    }
    .clause-editor-wrapper .jodit-wysiwyg ol.ems-num-lower-roman > li::before,
    .clause-content ol.ems-num-lower-roman > li::before {
        content: counter(emsol, lower-roman) '. ';
    }
`;

/** Normalize list HTML when loading clause content (fixes existing "all 1" lists). */
export function normalizeClauseListHtml(root) {
    if (!root) return;
    reconcileListTagClasses(root);
    mergeAdjacentLists(root, 'ol');
    mergeAdjacentLists(root, 'ul');
    cleanupNestedAndEmptyListItems(root);
    stripLeadingListMarkers(root);
    inferListClassesFromStyles(root);
    stripClauseInlineFontSizes(root);
}

/** Normalize clause HTML string before save / preview (merge lists + EMS classes). */
export function normalizeClauseListHtmlInString(html) {
    const raw = String(html || '');
    if (!raw || !/<[a-z][\s>]/i.test(raw)) return raw;
    try {
        const doc = new DOMParser().parseFromString(`<div id="__ems_clause_root">${raw}</div>`, 'text/html');
        const root = doc.getElementById('__ems_clause_root');
        if (!root) return raw;
        normalizeClauseListHtml(root);
        return root.innerHTML;
    } catch {
        return raw;
    }
}

/** If a <ul> still has numbering classes, or <ol> has bullet classes, fix on load. */
function reconcileListTagClasses(root) {
    if (!root?.querySelectorAll) return;
    root.querySelectorAll('ul').forEach((ul) => {
        stripClasses(ul, OL_CLASS_NAMES);
    });
    root.querySelectorAll('ol').forEach((ol) => {
        stripClasses(ol, BULLET_CLASS_NAMES);
    });
}

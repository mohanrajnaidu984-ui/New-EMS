/**
 * Standalone HTML document for quote print preview and server-side vector PDF (Puppeteer).
 */

import {
    EMS_QUOTE_ACCENT_HEADER_PADDING,
    EMS_QUOTE_ACCENT_HEADER_FONT_SIZE,
    EMS_QUOTE_ACCENT_HEADER_LINE_HEIGHT,
    EMS_QUOTE_COVER_META_MID_BG,
    EMS_QUOTE_CLAUSE_HEADING_BG,
    EMS_QUOTE_CLAUSE_HEADING_TEXT_COLOR,
    EMS_QUOTE_CLAUSE_HEADING_BORDER_RADIUS,
    EMS_QUOTE_CLAUSE_HEADING_PADDING_Y,
    EMS_QUOTE_CLAUSE_HEADING_PADDING_X,
    EMS_QUOTE_CLAUSE_HEADING_MARGIN_TOP,
    EMS_QUOTE_CLAUSE_HEADING_MARGIN_BOTTOM,
    EMS_QUOTE_CLAUSE_HEADING_FONT_SIZE,
    EMS_QUOTE_CLAUSE_HEADING_LINE_HEIGHT,
    EMS_QUOTE_COVER_SIGN_OFF_MIN_HEIGHT,
    EMS_QUOTE_PANEL_LABEL_NAV_GRADIENT,
    EMS_QUOTE_HEADER_ADDRESS_COL_MAX_WIDTH,
    EMS_QUOTE_HEADER_QUOTE_COL_WIDTH,
    EMS_QUOTE_HEADER_QUOTE_LABEL_WIDTH,
    EMS_QUOTE_PRINT_FOOTER_MIN_HEIGHT,
    EMS_QUOTE_PRINT_FOOTER_RULE_WIDTH,
    EMS_QUOTE_PRINT_FOOTER_RULE_WIDTH_PDF,
    EMS_QUOTE_PDF_TABLE_BORDER_WIDTH,
    EMS_QUOTE_LOGO_ROW_MARGIN_BOTTOM,
    EMS_QUOTE_PRICING_TABLE_CELL_BORDER,
    EMS_QUOTE_PRICING_TABLE_OUTER_BORDER,
    EMS_QUOTE_PRICING_TABLE_HEAD_CELL_BORDER,
    EMS_QUOTE_PRICING_TABLE_MARGIN_TOP,
    EMS_QUOTE_PRICING_TABLE_HEADER_BG,
    EMS_QUOTE_PRICING_TABLE_HEADER_COLOR,
    EMS_QUOTE_PRICING_TABLE_TOTAL_BG,
    EMS_QUOTE_PRICING_TABLE_BORDER_COLOR,
} from '../../constants/emsTheme';
const QUOTE_APP_FONT_STACK = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/** Same stack as #quote-preview in QuoteForm.jsx — do not substitute Inter in PDF. */
export const QUOTE_PREVIEW_FONT_STACK =
    "'Segoe UI', 'Segoe UI Web (West European)', system-ui, -apple-system, sans-serif";

function sanitizeHoistedPreviewCssForPdf(css) {
    return String(css)
        .replace(/box-shadow\s*:[^;]+;?/gi, '')
        .replace(/backdrop-filter\s*:[^;]+;?/gi, '')
        .replace(/filter\s*:[^;]+;?/gi, '')
        .replace(/-webkit-font-smoothing\s*:[^;]+;?/gi, '')
        .replace(/-moz-osx-font-smoothing\s*:[^;]+;?/gi, '')
        .replace(/text-rendering\s*:[^;]+;?/gi, '');
}

function stripEmbeddedStyleTags(html) {
    return html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
}

function stripAllStyleTags(html) {
    if (!html) return { css: '', html: '' };
    const chunks = [];
    const out = String(html).replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (_, inner) => {
        chunks.push(inner);
        return '';
    });
    return { css: chunks.join('\n\n'), html: out.trim() };
}

/** Base padding on Dear Sir panel; extra is added so letter→signatory gap matches table→letter gap. */
export const COVER_LETTER_PAD_BOTTOM_BASE_PX = 12;

/**
 * Grow Dear Sir padding-bottom until gap above signatory matches gap below meta table.
 * @param {HTMLElement} letterEl `.quote-cover-letter`
 * @param {{ lockSpacerForPdf?: boolean }} [options] When true, freeze flex spacer height on the live DOM before PDF clone.
 */
export function applyEqualCoverGaps(letterEl, options = {}) {
    const { lockSpacerForPdf = false } = options;
    if (!letterEl || typeof window === 'undefined') return null;
    const sheet0 = letterEl.closest('.quote-a4-sheet');
    const firstPage = sheet0?.querySelector('.quote-cover-first-page');
    const table = firstPage?.querySelector('.quote-cover-meta-table');
    const signOff = sheet0?.querySelector('.quote-cover-sign-off');
    if (!table || !signOff) return null;

    const gap1 = letterEl.getBoundingClientRect().top - table.getBoundingClientRect().bottom;
    const gap2 = signOff.getBoundingClientRect().top - letterEl.getBoundingClientRect().bottom;
    const targetGap = Math.max(0, Math.round(gap1));
    const pb = parseFloat(window.getComputedStyle(letterEl).paddingBottom) || 0;
    const currentExtra = Math.max(0, pb - COVER_LETTER_PAD_BOTTOM_BASE_PX);
    const extra = Math.max(0, Math.round(gap2 + currentExtra - targetGap));
    const padBottom = COVER_LETTER_PAD_BOTTOM_BASE_PX + extra;

    letterEl.style.setProperty('--quote-cover-letter-pad-bottom', `${padBottom}px`);
    letterEl.style.setProperty('padding-bottom', `${padBottom}px`, 'important');

    const finalGap2 = Math.max(
        0,
        Math.round(signOff.getBoundingClientRect().top - letterEl.getBoundingClientRect().bottom)
    );
    sheet0?.style.setProperty('--quote-cover-letter-sign-gap', `${finalGap2}px`);

    const spacer = sheet0?.querySelector('.quote-cover-page1-spacer');
    if (lockSpacerForPdf && spacer) {
        const signOffMt = Math.round(parseFloat(window.getComputedStyle(signOff).marginTop) || 0);
        const spacerH = Math.max(0, finalGap2 - signOffMt);
        spacer.style.setProperty('flex', '0 0 auto');
        spacer.style.setProperty('height', `${spacerH}px`);
        spacer.style.setProperty('min-height', '0');
        spacer.style.setProperty('max-height', `${spacerH}px`);
    }

    return { padBottom, extra, gap: finalGap2 };
}

/** Run immediately before PDF HTML capture so clone carries synced padding + spacer height. */
export function syncCoverLetterGapBeforePdfCapture(letterEl) {
    if (!letterEl) return;
    const run = () => applyEqualCoverGaps(letterEl, { lockSpacerForPdf: true });
    run();
    if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(run);
    }
}

export function captureQuotePrintRootInnerHtmlForPdf(rootEl) {
    const root = rootEl || (typeof document !== 'undefined' ? document.getElementById('quote-print-root') : null);
    if (!root) return '';
    const clone = root.cloneNode(true);
    const removeSel = ['.quote-clause-measure-host', '.quote-print-footer-rule'];
    for (const sel of removeSel) {
        clone.querySelectorAll(sel).forEach((n) => n.remove());
    }
    /** Strip only the duplicate fixed-header strip outside sheets — keep per-sheet logos inside `.quote-a4-sheet`. */
    clone.querySelectorAll(':scope > .quote-print-repeat-strip').forEach((n) => n.remove());
    return clone.innerHTML;
}

const PDF_SELF_CLOSE_FIX_TAGS = ['div', 'span', 'p', 'a', 'section', 'article', 'main', 'header', 'footer', 'label', 'li', 'td', 'th', 'tr', 'tbody', 'thead', 'table', 'h1', 'h2', 'h3'];

function fixInvalidSelfClosingTags(html) {
    let out = String(html);
    for (const tag of PDF_SELF_CLOSE_FIX_TAGS) {
        const re = new RegExp(`<${tag}([^>]*?)\\s*\\/\\s*>`, 'gi');
        out = out.replace(re, `<${tag}$1></${tag}>`);
    }
    return out;
}

function normalizePdfStaticAssets(html, apiOrigin, rewriteFromOrigin) {
    if (!html || !apiOrigin) return html;
    const api = String(apiOrigin).replace(/\/$/, '');
    let out = html;
    const from = String(rewriteFromOrigin || '').replace(/\/$/, '');
    if (from && from.toLowerCase() !== api.toLowerCase()) {
        const esc = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        out = out.replace(new RegExp(esc, 'gi'), api);
    }
    out = out.replace(/(\ssrc=["'])(\/uploads\/[^"']+)(["'])/gi, (_, q1, path, q2) => `${q1}${api}${path}${q2}`);
    out = out.replace(/(url\(["']?)(\/uploads\/[^)"']+)(["']?\))/gi, (_, a, path, b) => `${a}${api}${path}${b}`);
    return out;
}

function getServerPdfHeaderModeCss(printWithHeader) {
    if (!printWithHeader) {
        /**
         * Keep layout: visibility:hidden preserves box size (no reflow). Page "Page X of Y" stays visible;
         * only logo band + company address block are invisible. Repeat strip is off-flow → display:none.
         */
        return (
            '.quote-sheet-logo-row, .quote-continuation-header { visibility: hidden !important; } ' +
            '.quote-print-footer-wrap { visibility: hidden !important; } ' +
            '.quote-print-repeat-strip, .print-logo-section { display: none !important; }'
        );
    }
    return `.quote-print-repeat-strip, .quote-print-footer-rule { display: none !important; }`;
}

/**
 * Puppeteer uses the same HTML as the Quote tab but must not override sheet height with a fixed 297mm —
 * that squeezed flex/grid body vs on-screen `min-height: 297mm`, bunching list lines and shifting tables.
 * Keep parity with QuoteForm embedded `#quote-preview` / `.quote-a4-sheet` rules (min-height + height auto).
 */
const PREVIEW_PDF_SCREEN_OVERRIDES = `
html[data-preview-pdf="1"] body {
    background: white !important;
    margin: 0 !important;
    padding: 0 !important;
    display: flex !important;
    flex-direction: column !important;
    align-items: center !important;
    justify-content: flex-start !important;
    box-sizing: border-box !important;
    min-width: 210mm !important;
}
html[data-preview-pdf="1"] #quote-print-root {
    background: white !important;
    padding: 0 !important;
    margin: 0 auto !important;
    width: 210mm !important;
    max-width: 210mm !important;
    display: block !important;
    box-sizing: border-box !important;
}
html[data-preview-pdf="1"] #quote-preview {
    display: flex !important;
    flex-direction: column !important;
    align-items: center !important;
    gap: 0 !important;
    padding: 0 !important;
    margin: 0 auto !important;
    background: white !important;
    width: 210mm !important;
    min-width: 210mm !important;
    max-width: 210mm !important;
    box-sizing: border-box !important;
}
html[data-preview-pdf="1"] #quote-preview .quote-a4-sheet {
    flex-shrink: 0 !important;
}
html[data-preview-pdf="1"] .quote-document-root {
    width: 100% !important;
    max-width: 210mm !important;
    margin-left: auto !important;
    margin-right: auto !important;
    box-sizing: border-box !important;
}
/** Print/PDF: block imgs ignore parent text-align — keep logo right-aligned like on-screen flex layout */
html[data-preview-pdf="1"] .quote-sheet-logo-row {
    grid-row: 1 !important;
    display: flex !important;
    flex-direction: row !important;
    justify-content: flex-end !important;
    align-items: flex-start !important;
    width: 100% !important;
    margin-bottom: ${EMS_QUOTE_LOGO_ROW_MARGIN_BOTTOM} !important;
    box-sizing: border-box !important;
}
html[data-preview-pdf="1"] .quote-sheet-logo-row > div {
    width: 100% !important;
    max-width: 100% !important;
    text-align: right !important;
    box-sizing: border-box !important;
}
html[data-preview-pdf="1"] .header-section.quote-header-row {
    display: flex !important;
    flex-direction: row !important;
    align-items: stretch !important;
    gap: 16px !important;
    width: 100% !important;
    box-sizing: border-box !important;
    margin-bottom: 6px !important;
}
html[data-preview-pdf="1"] .quote-header-address-col,
html[data-preview-pdf="1"] .quote-header-quote-col {
    box-sizing: border-box !important;
    min-width: 0 !important;
    display: flex !important;
    flex-direction: column !important;
    align-self: stretch !important;
}
html[data-preview-pdf="1"] .quote-header-address-col {
    flex: 1 1 0 !important;
    width: auto !important;
    max-width: ${EMS_QUOTE_HEADER_ADDRESS_COL_MAX_WIDTH} !important;
}
html[data-preview-pdf="1"] .quote-header-quote-col {
    flex: 0 1 ${EMS_QUOTE_HEADER_QUOTE_COL_WIDTH} !important;
    width: auto !important;
    max-width: ${EMS_QUOTE_HEADER_QUOTE_COL_WIDTH} !important;
}
html[data-preview-pdf="1"] .quote-preview-panel-shell {
    border: 1px solid #e2e8f0 !important;
    border-radius: 5px !important;
    overflow: hidden !important;
    box-shadow:
        0 2px 10px rgba(15, 23, 42, 0.08),
        0 1px 2px rgba(15, 23, 42, 0.06) !important;
}
html[data-preview-pdf="1"] .quote-header-quote-stack {
    display: flex !important;
    flex-direction: column !important;
    gap: 10px !important;
    width: 100% !important;
    flex: 1 1 auto !important;
    min-height: 0 !important;
}
html[data-preview-pdf="1"] .quote-header-address-panel {
    border-radius: 5px !important;
    overflow: hidden !important;
    display: flex !important;
    flex-direction: column !important;
    flex: 1 1 auto !important;
    min-height: 0 !important;
    width: 100% !important;
    box-sizing: border-box !important;
}
html[data-preview-pdf="1"] .quote-header-address-panel-row--header {
    display: flex !important;
    flex-direction: row !important;
    align-items: center !important;
    background: ${EMS_QUOTE_PANEL_LABEL_NAV_GRADIENT} !important;
    border-radius: 5px 5px 0 0 !important;
    padding: ${EMS_QUOTE_ACCENT_HEADER_PADDING} !important;
    margin: 0 !important;
    box-sizing: border-box !important;
    line-height: ${EMS_QUOTE_ACCENT_HEADER_LINE_HEIGHT} !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
}
html[data-preview-pdf="1"] .quote-header-address-panel-row--header .quote-header-address-panel-label--solo {
    flex: 1 1 auto !important;
    max-width: none !important;
    width: 100% !important;
    padding-right: 0 !important;
    font-weight: 600 !important;
    color: rgba(252, 252, 253, 0.96) !important;
    font-size: ${EMS_QUOTE_ACCENT_HEADER_FONT_SIZE} !important;
    line-height: ${EMS_QUOTE_ACCENT_HEADER_LINE_HEIGHT} !important;
    letter-spacing: 0.02em !important;
    box-sizing: border-box !important;
}
html[data-preview-pdf="1"] .quote-header-address-panel-customer {
    font-size: 13px !important;
    font-weight: 500 !important;
    color: #0f172a !important;
    line-height: 1.45 !important;
    margin: 0 0 4px 0 !important;
}
html[data-preview-pdf="1"] .quote-header-address-panel-body {
    flex: 1 1 auto !important;
    min-height: 0 !important;
    background: ${EMS_QUOTE_COVER_META_MID_BG} !important;
    border-radius: 0 0 5px 5px !important;
    padding: 6px 8px 8px 8px !important;
    box-sizing: border-box !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
}
html[data-preview-pdf="1"] .quote-header-address-panel-address {
    font-size: 12px !important;
    color: #475569 !important;
    white-space: pre-line !important;
    line-height: 1.32 !important;
    flex: 1 1 auto !important;
    min-width: 0 !important;
}
html[data-preview-pdf="1"] .quote-header-address-panel-address-with-icon {
    display: flex !important;
    flex-direction: row !important;
    align-items: flex-start !important;
    gap: 6px !important;
    margin-top: 2px !important;
}
html[data-preview-pdf="1"] .quote-header-address-meta-ic-wrap {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    flex-shrink: 0 !important;
    width: 17px !important;
    height: 17px !important;
    border-radius: 4px !important;
    box-sizing: border-box !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
}
html[data-preview-pdf="1"] .quote-header-address-meta-ic-wrap svg {
    display: block !important;
    stroke: #ffffff !important;
}
html[data-preview-pdf="1"] .quote-header-address-meta-ic-wrap--map {
    background: #0369a1 !important;
}
html[data-preview-pdf="1"] .quote-header-address-meta-ic-wrap--tel {
    background: #047857 !important;
}
html[data-preview-pdf="1"] .quote-header-address-meta-ic-wrap--fax {
    background: #475569 !important;
}
html[data-preview-pdf="1"] .quote-header-address-meta-ic-wrap--mail {
    background: #4f46e5 !important;
}
html[data-preview-pdf="1"] .quote-header-address-panel-contact {
    font-size: 12px !important;
    color: #475569 !important;
    margin-top: 6px !important;
    line-height: 1.32 !important;
    display: flex !important;
    flex-direction: column !important;
    align-items: stretch !important;
    gap: 4px !important;
}
html[data-preview-pdf="1"] .quote-header-address-panel-contact-line {
    display: flex !important;
    flex-direction: row !important;
    align-items: flex-start !important;
    gap: 6px !important;
    width: 100% !important;
}
html[data-preview-pdf="1"] .quote-header-address-panel-contact-line span:last-child {
    flex: 1 1 auto !important;
    min-width: 0 !important;
}
html[data-preview-pdf="1"] .quote-header-quote-panel > .quote-header-address-panel-row--header {
    flex-shrink: 0 !important;
}
html[data-preview-pdf="1"] .quote-header-quote-panel {
    width: 100% !important;
    border-radius: 5px !important;
    overflow: hidden !important;
    font-size: 13px !important;
    box-sizing: border-box !important;
    flex: 0 0 auto !important;
    min-height: 0 !important;
    display: flex !important;
    flex-direction: column !important;
}
html[data-preview-pdf="1"] .quote-header-quote-panel--no-header .quote-header-quote-panel-mid {
    border-radius: 5px !important;
}
html[data-preview-pdf="1"] .quote-header-quote-panel-body {
    display: flex !important;
    flex-direction: column !important;
    width: 100% !important;
    padding: 0 !important;
    box-sizing: border-box !important;
    flex: 1 1 auto !important;
    min-height: 0 !important;
}
html[data-preview-pdf="1"] .quote-header-quote-meta-ic-wrap {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    flex-shrink: 0 !important;
}
html[data-preview-pdf="1"] .quote-header-quote-panel-mid .quote-header-quote-meta-ic-wrap {
    width: 17px !important;
    height: 17px !important;
    border-radius: 4px !important;
    box-sizing: border-box !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
}
html[data-preview-pdf="1"] .quote-header-quote-panel-mid .quote-header-quote-meta-ic-wrap svg {
    display: block !important;
    stroke: #ffffff !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
}
html[data-preview-pdf="1"] .quote-header-quote-meta-ic-wrap--ref {
    color: #ffffff !important;
    background: #2563eb !important;
}
html[data-preview-pdf="1"] .quote-header-quote-meta-ic-wrap--date {
    color: #ffffff !important;
    background: #059669 !important;
}
html[data-preview-pdf="1"] .quote-header-quote-meta-ic-wrap--user {
    color: #ffffff !important;
    background: #7c3aed !important;
}
html[data-preview-pdf="1"] .quote-header-quote-meta-ic-wrap--phone {
    color: #ffffff !important;
    background: #0d9488 !important;
}
html[data-preview-pdf="1"] .quote-header-quote-meta-ic-wrap--tag {
    color: #ffffff !important;
    background: #d97706 !important;
}
html[data-preview-pdf="1"] .quote-header-quote-meta-ic-wrap--custref {
    color: #ffffff !important;
    background: #4f46e5 !important;
}
html[data-preview-pdf="1"] .quote-header-quote-meta-ic-wrap--clock {
    color: #ffffff !important;
    background: #db2777 !important;
}
html[data-preview-pdf="1"] .quote-header-quote-panel-mid [class*="quote-header-quote-meta-ic-wrap--"] {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
}
html[data-preview-pdf="1"] .quote-header-quote-panel-mid {
    background: ${EMS_QUOTE_COVER_META_MID_BG} !important;
    border-radius: 0 0 5px 5px !important;
    overflow: hidden !important;
    padding: 2px 10px 7px 10px !important;
    box-sizing: border-box !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    flex: 1 1 auto !important;
    min-height: 0 !important;
}
html[data-preview-pdf="1"] .quote-header-quote-panel-mid .quote-header-quote-panel-row {
    padding: 5px 0 !important;
    margin: 0 !important;
    line-height: 1.28 !important;
}
html[data-preview-pdf="1"]
    .quote-header-quote-panel-mid
    .quote-header-quote-panel-row
    + .quote-header-quote-panel-row
    .quote-header-quote-panel-value {
    border-top: 1px solid #e2e8f0 !important;
}
html[data-preview-pdf="1"] .quote-header-quote-panel-mid .quote-header-quote-panel-label {
    display: flex !important;
    flex-wrap: nowrap !important;
    align-items: center !important;
    gap: 6px !important;
    flex: 0 0 ${EMS_QUOTE_HEADER_QUOTE_LABEL_WIDTH} !important;
    max-width: ${EMS_QUOTE_HEADER_QUOTE_LABEL_WIDTH} !important;
    min-width: 0 !important;
    white-space: nowrap !important;
    color: #334155 !important;
    font-weight: 400 !important;
}
html[data-preview-pdf="1"] .quote-header-quote-panel-mid .quote-header-quote-panel-value {
    color: #0f172a !important;
    font-weight: 400 !important;
}
html[data-preview-pdf="1"]
    .quote-header-quote-panel:not(.quote-header-quote-panel--no-header)
    .quote-header-quote-panel-mid
    .quote-header-quote-panel-row:first-child
    .quote-header-quote-panel-label,
html[data-preview-pdf="1"]
    .quote-header-quote-panel:not(.quote-header-quote-panel--no-header)
    .quote-header-quote-panel-mid
    .quote-header-quote-panel-row:first-child
    .quote-header-quote-panel-value {
    font-weight: 700 !important;
}
html[data-preview-pdf="1"] .quote-header-quote-panel-row {
    display: flex !important;
    flex-direction: row !important;
    align-items: flex-start !important;
    padding: 5px 0 !important;
    min-width: 0 !important;
    line-height: 1.38 !important;
    box-sizing: border-box !important;
}
html[data-preview-pdf="1"] .quote-header-quote-panel-label {
    flex: 0 0 ${EMS_QUOTE_HEADER_QUOTE_LABEL_WIDTH} !important;
    max-width: ${EMS_QUOTE_HEADER_QUOTE_LABEL_WIDTH} !important;
    color: #000 !important;
    font-weight: 400 !important;
    padding-right: 10px !important;
    box-sizing: border-box !important;
    white-space: nowrap !important;
}
html[data-preview-pdf="1"] .quote-header-quote-panel-value {
    flex: 1 1 auto !important;
    min-width: 0 !important;
    color: #000 !important;
    font-weight: 400 !important;
    box-sizing: border-box !important;
}
html[data-preview-pdf="1"] .quote-section-rule {
    border: 0 !important;
    border-top: 1px solid #94a3b8 !important;
    margin: 0 0 16px 0 !important;
    height: 0 !important;
    box-sizing: border-box !important;
}
html[data-preview-pdf="1"] .quote-section-rule--after-header {
    margin-top: 10px !important;
    margin-bottom: 16px !important;
}
html[data-preview-pdf="1"] .quote-section-rule--before-cover-letter {
    margin-top: 0 !important;
    margin-bottom: 20px !important;
}
html[data-preview-pdf="1"] .quote-cover-letter {
    margin-top: 0 !important;
}
html[data-preview-pdf="1"] .quote-cover-first-page .quote-cover-letter.quote-cover-body-panel {
    padding-top: calc(12px * 1.69) !important;
    padding-right: calc(14px * 1.69) !important;
    padding-left: var(--quote-cover-text-inset) !important;
    /** Synced in preview (inline + --quote-cover-letter-pad-bottom); do not force 12px or PDF gap ≠ preview. */
    padding-bottom: var(--quote-cover-letter-pad-bottom, 12px) !important;
}
html[data-preview-pdf="1"] .quote-cover-first-page {
    margin-top: 6px !important;
    margin-bottom: 0 !important;
    display: flex !important;
    flex-direction: column !important;
    gap: 18px !important;
    --quote-cover-text-inset: 8px !important;
}
html[data-preview-pdf="1"] .quote-cover-first-page .quote-cover-body-panel {
    margin-top: 0 !important;
}
html[data-preview-pdf="1"] .quote-cover-sign-off.quote-cover-body-panel {
    margin-top: 18px !important;
}
html[data-preview-pdf="1"] .quote-cover-sign-off.quote-cover-body-panel.quote-preview-panel-shell {
    overflow: visible !important;
    height: auto !important;
}
html[data-preview-pdf="1"] .quote-cover-body-panel {
    --quote-cover-text-inset: 8px !important;
    border-radius: 5px !important;
    border: 1px solid #e2e8f0 !important;
    background: ${EMS_QUOTE_COVER_META_MID_BG} !important;
    box-sizing: border-box !important;
    box-shadow:
        0 2px 10px rgba(15, 23, 42, 0.08),
        0 1px 2px rgba(15, 23, 42, 0.06) !important;
    text-align: left !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
}
html[data-preview-pdf="1"] .quote-cover-body-panel:not(.quote-cover-letter):not(.quote-clause-heading-panel) {
    margin-top: 18px !important;
    padding: calc(12px * 1.69) calc(14px * 1.69) calc(12px * 1.69) var(--quote-cover-text-inset) !important;
}
html[data-preview-pdf="1"] .quote-clause-block--continuation {
    margin-bottom: 12px !important;
}
html[data-preview-pdf="1"] .quote-clause-heading-panel.quote-cover-body-panel.quote-preview-panel-shell {
    margin-top: ${EMS_QUOTE_CLAUSE_HEADING_MARGIN_TOP} !important;
    margin-bottom: ${EMS_QUOTE_CLAUSE_HEADING_MARGIN_BOTTOM} !important;
    padding-top: ${EMS_QUOTE_CLAUSE_HEADING_PADDING_Y} !important;
    padding-bottom: ${EMS_QUOTE_CLAUSE_HEADING_PADDING_Y} !important;
    padding-left: var(--quote-cover-text-inset) !important;
    padding-right: ${EMS_QUOTE_CLAUSE_HEADING_PADDING_X} !important;
    border-radius: ${EMS_QUOTE_CLAUSE_HEADING_BORDER_RADIUS} !important;
    border: 1px solid ${EMS_QUOTE_CLAUSE_HEADING_BG} !important;
    background: ${EMS_QUOTE_CLAUSE_HEADING_BG} !important;
    box-shadow: none !important;
    box-sizing: border-box !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
}
html[data-preview-pdf="1"]
    .content-section
    > .quote-clause-block--continuation:first-child
    .quote-clause-heading-panel {
    margin-top: 0 !important;
}
html[data-preview-pdf="1"] .quote-clause-heading-panel > h3 {
    margin: 0 !important;
    padding: 0 !important;
    font-size: ${EMS_QUOTE_CLAUSE_HEADING_FONT_SIZE} !important;
    font-weight: 600 !important;
    line-height: ${EMS_QUOTE_CLAUSE_HEADING_LINE_HEIGHT} !important;
    color: ${EMS_QUOTE_CLAUSE_HEADING_TEXT_COLOR} !important;
}
html[data-preview-pdf="1"] .quote-clause-block--continuation .clause-content {
    font-size: 13px !important;
    color: #0f172a !important;
    padding-left: var(--quote-cover-text-inset, 8px) !important;
    padding-right: calc(14px * 1.69) !important;
    box-sizing: border-box !important;
}
html[data-preview-pdf="1"] .quote-sheet-main-flex {
    width: 100% !important;
    box-sizing: border-box !important;
}
html[data-preview-pdf="1"] .clause-content table {
    width: 100% !important;
    max-width: 100% !important;
    box-sizing: border-box !important;
}
html[data-preview-pdf="1"] .quote-cover-meta-table {
    width: 100% !important;
    table-layout: fixed !important;
    border-collapse: separate !important;
    border-spacing: 0 !important;
    font-size: 14px !important;
    margin-bottom: 0 !important;
    box-sizing: border-box !important;
    border: 1px solid #e2e8f0 !important;
    border-radius: 5px !important;
    overflow: hidden !important;
    box-shadow:
        0 2px 10px rgba(15, 23, 42, 0.08),
        0 1px 2px rgba(15, 23, 42, 0.06) !important;
}
html[data-preview-pdf="1"] .quote-cover-meta-table td {
    border: none !important;
    padding: 7px 10px 7px 0 !important;
    vertical-align: top !important;
    line-height: 1.45 !important;
    box-sizing: border-box !important;
}
html[data-preview-pdf="1"] .quote-cover-meta-table td:first-child {
    width: 22% !important;
    max-width: 150px !important;
    padding-right: 4px !important;
    color: #64748b !important;
    font-weight: 400 !important;
}
html[data-preview-pdf="1"] .quote-cover-meta-table td:last-child {
    color: #0f172a !important;
    font-weight: 400 !important;
    padding-left: 4px !important;
}
html[data-preview-pdf="1"] .quote-cover-meta-table tbody tr.quote-cover-meta-row-mid:first-child td:first-child {
    border-radius: 5px 0 0 0 !important;
}
html[data-preview-pdf="1"] .quote-cover-meta-table tbody tr.quote-cover-meta-row-mid:first-child td:last-child {
    border-radius: 0 5px 0 0 !important;
}
html[data-preview-pdf="1"] .quote-cover-meta-row-mid td {
    border-left: none !important;
    border-right: none !important;
    border-bottom: none !important;
    border-top: none !important;
    border-radius: 0 !important;
    padding: 7px 6px 7px 8px !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
}
html[data-preview-pdf="1"] .quote-cover-meta-table tbody tr.quote-cover-meta-row-mid + tr.quote-cover-meta-row-mid td:first-child {
    border-top: none !important;
}
html[data-preview-pdf="1"] .quote-cover-meta-table tbody tr.quote-cover-meta-row-mid + tr.quote-cover-meta-row-mid td:last-child {
    border-top: 1px solid #e2e8f0 !important;
    border-bottom: none !important;
    border-left: none !important;
    border-right: none !important;
}
html[data-preview-pdf="1"] .quote-cover-meta-row-mid td:first-child {
    background: ${EMS_QUOTE_COVER_META_MID_BG} !important;
    color: #334155 !important;
    font-weight: 400 !important;
    padding: 7px 4px 7px 8px !important;
}
html[data-preview-pdf="1"] .quote-cover-meta-row-mid td:last-child {
    background: ${EMS_QUOTE_COVER_META_MID_BG} !important;
    color: #0f172a !important;
    font-weight: 400 !important;
    padding: 7px 8px 7px 4px !important;
}
html[data-preview-pdf="1"] .quote-cover-meta-table tbody tr.quote-cover-meta-row-mid:last-child td:first-child {
    border-radius: 0 0 0 5px !important;
}
html[data-preview-pdf="1"] .quote-cover-meta-table tbody tr.quote-cover-meta-row-mid:last-child td:last-child {
    border-radius: 0 0 5px 0 !important;
}
html[data-preview-pdf="1"] .quote-sheet-main-flex > .content-section {
    flex: 1 1 auto !important;
    min-height: 0 !important;
    display: flex !important;
    flex-direction: column !important;
}
/** Height set inline at PDF capture from preview measurement; do not flex-grow or gap drifts. */
html[data-preview-pdf="1"] .quote-cover-page1-spacer {
    flex: 0 0 auto !important;
    min-height: 0 !important;
}
html[data-preview-pdf="1"] .quote-cover-sign-off {
    flex-shrink: 0 !important;
    width: 100% !important;
    box-sizing: border-box !important;
    min-height: auto !important;
    height: auto !important;
    display: flex !important;
    flex-direction: column !important;
    overflow: visible !important;
    margin-bottom: 6px !important;
}
html[data-preview-pdf="1"] .quote-cover-signatory-block {
    flex: 0 0 auto !important;
    display: flex !important;
    flex-direction: column !important;
    justify-content: flex-start !important;
    min-height: calc(13px * 1.58 + 4px + 12px * 1.45) !important;
    margin-top: 0 !important;
}
html[data-preview-pdf="1"] .quote-cover-sign-off-for {
    flex-shrink: 0 !important;
    /** Shorter than preview (3.15em) so panel fits above footer; section gap is synced via letter padding + spacer. */
    margin: 0 0 calc(1.58em * 2.35) 0 !important;
    font-size: 13px !important;
    line-height: 1.58 !important;
    color: #0f172a !important;
    font-weight: 600 !important;
}
html[data-preview-pdf="1"] .quote-cover-signatory-line {
    margin-top: 0 !important;
    min-height: calc(13px * 1.58) !important;
    font-size: 13px !important;
    line-height: 1.58 !important;
    color: #0f172a !important;
}
html[data-preview-pdf="1"] .quote-cover-signatory-designation {
    margin-top: 4px !important;
    min-height: calc(12px * 1.45) !important;
    font-size: 12px !important;
    line-height: 1.45 !important;
    color: #475569 !important;
    font-weight: 400 !important;
}
html[data-preview-pdf="1"] .quote-cover-letter p {
    margin: 0 0 10px 0 !important;
    font-size: 14px !important;
    line-height: 1.45 !important;
    color: #0f172a !important;
}
html[data-preview-pdf="1"] .quote-cover-letter p:last-of-type {
    margin-bottom: 0 !important;
    font-weight: 400 !important;
}
html[data-preview-pdf="1"] .content-section {
    width: 100% !important;
    max-width: 100% !important;
    box-sizing: border-box !important;
    text-align: left !important;
    display: flex !important;
    flex-direction: column !important;
    min-height: 0 !important;
}
html[data-preview-pdf="1"] .quote-clause-block {
    width: 100% !important;
    max-width: 100% !important;
    box-sizing: border-box !important;
    text-align: left !important;
}
html[data-preview-pdf="1"] .quote-clause-block .clause-content {
    /* Block flow default; table cell alignment comes from editor HTML. */
    text-align: left;
}
html[data-preview-pdf="1"] .quote-a4-sheet {
    box-sizing: border-box !important;
    width: 210mm !important;
    min-width: 210mm !important;
    max-width: 210mm !important;
    padding: 15mm !important;
    margin: 0 auto !important;
    border: none !important;
    box-shadow: none !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) !important;
    grid-template-rows: auto minmax(0, 1fr) auto !important;
    align-content: stretch !important;
    page-break-after: auto !important;
    break-after: auto !important;
    overflow: visible !important;
}
/** Cover + clause sheets: exactly one A4 block each (height:auto on cover spilled a blank PDF page 2). */
html[data-preview-pdf="1"] .quote-a4-sheet {
    min-height: 297mm !important;
    height: 297mm !important;
    max-height: 297mm !important;
}
/** Clause pages only — avoid break-before on cover's sibling (blank page). */
html[data-preview-pdf="1"] .quote-a4-sheet.quote-a4-sheet--continuation {
    page-break-before: always !important;
    break-before: page !important;
}
html[data-preview-pdf="1"] .quote-a4-sheet:last-child {
    page-break-after: auto !important;
    break-after: auto !important;
}
html[data-preview-pdf="1"] .quote-a4-sheet--continuation .quote-sheet-main-flex {
    min-height: 0 !important;
    height: auto !important;
    max-height: none !important;
    overflow: visible !important;
}
html[data-preview-pdf="1"] .quote-a4-sheet--continuation .content-section {
    flex: 0 1 auto !important;
    max-height: none !important;
    overflow: visible !important;
}
html[data-preview-pdf="1"] .clause-content table {
    table-layout: fixed !important;
    border-collapse: collapse !important;
}
html[data-preview-pdf="1"] .clause-content > table + table,
html[data-preview-pdf="1"] .clause-content table[data-ems-table-split] + table[data-ems-table-split] {
    margin-top: 0 !important;
    border-top: none !important;
}
html[data-preview-pdf="1"] .clause-content table[data-ems-table-split] + table[data-ems-table-split] thead {
    display: none !important;
}
html[data-preview-pdf="1"] .clause-content table th,
html[data-preview-pdf="1"] .clause-content table td {
    vertical-align: top !important;
    word-wrap: break-word !important;
    overflow-wrap: anywhere !important;
}
html[data-preview-pdf="1"] .quote-sheet-main-flex {
    grid-row: 2 !important;
    display: flex !important;
    flex-direction: column !important;
    width: 100% !important;
    min-width: 0 !important;
    min-height: 0 !important;
    height: 100% !important;
    box-sizing: border-box !important;
}
html[data-preview-pdf="1"] img {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
}
html[data-preview-pdf="1"] .quote-sheet-logo-row img,
html[data-preview-pdf="1"] .quote-continuation-header img {
    height: 68px !important;
    width: auto !important;
    max-width: 212px !important;
    display: block !important;
    margin-left: auto !important;
    margin-right: 0 !important;
    object-fit: contain !important;
}
html[data-preview-pdf="1"] .clause-content table,
html[data-preview-pdf="1"] .clause-content table th,
html[data-preview-pdf="1"] .clause-content table td {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
}
html[data-preview-pdf="1"] .quote-a4-sheet > .footer-section {
    grid-row: 3 !important;
    align-self: end !important;
    margin-top: 0 !important;
    padding-top: 3px !important;
    flex-shrink: 0 !important;
    min-height: ${EMS_QUOTE_PRINT_FOOTER_MIN_HEIGHT} !important;
    box-sizing: border-box !important;
}
html[data-preview-pdf="1"] .footer-section {
    display: flex !important;
    flex-direction: column !important;
    align-items: stretch !important;
    width: 100% !important;
    max-width: 100% !important;
    box-sizing: border-box !important;
    break-inside: avoid !important;
    page-break-inside: avoid !important;
}
html[data-preview-pdf="1"] .quote-print-page-indicator {
    display: block !important;
    width: 100% !important;
    max-width: 100% !important;
    text-align: right !important;
    box-sizing: border-box !important;
}
html[data-preview-pdf="1"] .quote-print-footer-wrap {
    display: block !important;
    width: 50% !important;
    max-width: 50% !important;
    margin-left: auto !important;
    margin-right: 0 !important;
    box-sizing: border-box !important;
}
html[data-preview-pdf="1"] .quote-print-footer-company {
    display: block !important;
    width: 100% !important;
    max-width: 100% !important;
    text-align: right !important;
    box-sizing: border-box !important;
}
html[data-preview-pdf="1"] .footer-section .quote-print-page-indicator {
    padding-bottom: 3px !important;
}
html[data-preview-pdf="1"] .footer-section > hr.quote-section-rule {
    border: none !important;
    height: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    border-top: ${EMS_QUOTE_PRINT_FOOTER_RULE_WIDTH_PDF} solid #94a3b8 !important;
    box-sizing: border-box !important;
}
html[data-preview-pdf="1"] .footer-section .quote-print-footer-company > div {
    margin: 0 !important;
    line-height: 1.1 !important;
}
/**
 * Print dialog (popup from Print button) loads hoisted @media rules from QuoteForm that used to force
 * #quote-preview { width: 100% } and fixed sheet heights — blank or narrow pages. These rules win via
 * higher specificity + @media print so output matches on-screen preview.
 */
@media print {
    html[data-preview-pdf="1"],
    html[data-preview-pdf="1"] body {
        width: 210mm !important;
        max-width: 210mm !important;
        margin: 0 auto !important;
        padding: 0 !important;
        background: #fff !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
    }
    html[data-preview-pdf="1"] #quote-print-root.print-wrapper {
        width: 210mm !important;
        min-width: 210mm !important;
        max-width: 210mm !important;
        margin: 0 auto !important;
        padding: 0 !important;
    }
    html[data-preview-pdf="1"] #quote-preview {
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
    html[data-preview-pdf="1"] #quote-preview .quote-a4-sheet {
        flex-shrink: 0 !important;
    }
    html[data-preview-pdf="1"] .quote-a4-sheet {
        width: 210mm !important;
        min-width: 210mm !important;
        max-width: 210mm !important;
        min-height: 297mm !important;
        height: 297mm !important;
        max-height: 297mm !important;
        overflow: visible !important;
        page-break-after: auto !important;
        break-after: auto !important;
        box-sizing: border-box !important;
    }
    html[data-preview-pdf="1"] .quote-a4-sheet.quote-a4-sheet--continuation {
        page-break-before: always !important;
        break-before: page !important;
    }
    html[data-preview-pdf="1"] .quote-a4-sheet:last-child {
        page-break-after: auto !important;
        break-after: auto !important;
    }
    html[data-preview-pdf="1"] .quote-a4-sheet--continuation .quote-sheet-main-flex {
        min-height: 0 !important;
        overflow: visible !important;
    }
    html[data-preview-pdf="1"] .quote-a4-sheet--continuation .content-section {
        flex: 0 1 auto !important;
        overflow: visible !important;
    }
    html[data-preview-pdf="1"] .quote-sheet-logo-row {
        grid-row: 1 !important;
        display: flex !important;
        flex-direction: row !important;
        justify-content: flex-end !important;
        align-items: flex-start !important;
        width: 100% !important;
        margin-bottom: ${EMS_QUOTE_LOGO_ROW_MARGIN_BOTTOM} !important;
        box-sizing: border-box !important;
    }
    html[data-preview-pdf="1"] .quote-sheet-logo-row img,
    html[data-preview-pdf="1"] .quote-continuation-header img {
        margin-left: auto !important;
        margin-right: 0 !important;
    }
    html[data-preview-pdf="1"] .quote-a4-sheet > .footer-section {
        grid-row: 3 !important;
        align-self: end !important;
        margin-top: 0 !important;
        padding-top: 3px !important;
        flex-shrink: 0 !important;
        min-height: ${EMS_QUOTE_PRINT_FOOTER_MIN_HEIGHT} !important;
        box-sizing: border-box !important;
    }
    html[data-preview-pdf="1"] .footer-section {
        display: flex !important;
        flex-direction: column !important;
        align-items: stretch !important;
        width: 100% !important;
        max-width: 100% !important;
        box-sizing: border-box !important;
        break-inside: avoid !important;
        page-break-inside: avoid !important;
    }
    html[data-preview-pdf="1"] .quote-print-page-indicator {
        display: block !important;
        width: 100% !important;
        max-width: 100% !important;
        text-align: right !important;
        box-sizing: border-box !important;
    }
    html[data-preview-pdf="1"] .quote-print-footer-wrap {
        display: block !important;
        width: 50% !important;
        max-width: 50% !important;
        margin-left: auto !important;
        margin-right: 0 !important;
        box-sizing: border-box !important;
    }
    html[data-preview-pdf="1"] .quote-print-footer-company {
        display: block !important;
        width: 100% !important;
        max-width: 100% !important;
        text-align: right !important;
        box-sizing: border-box !important;
    }
    html[data-preview-pdf="1"] .footer-section .quote-print-page-indicator {
        padding-bottom: 3px !important;
    }
    html[data-preview-pdf="1"] .footer-section > hr.quote-section-rule {
        border: 0 !important;
        border-top: ${EMS_QUOTE_PRINT_FOOTER_RULE_WIDTH_PDF} solid #94a3b8 !important;
        height: 0 !important;
        box-sizing: border-box !important;
    }
    html[data-preview-pdf="1"] .footer-section .quote-print-footer-company > div {
        margin: 0 !important;
        line-height: 1.1 !important;
    }
    html[data-preview-pdf="1"] .no-print,
    html[data-preview-pdf="1"] .ems-browser-pdf-hint {
        display: none !important;
    }
}
`;

const SERVER_PDF_STYLES = `
html[data-server-pdf="1"] #quote-print-root { background: #fff; padding: 0; }
html[data-server-pdf="1"] .no-print { display: none !important; }
html[data-server-pdf="1"] .quote-a4-sheet { display: block !important; height: auto !important; }
`;

/** Last in style block — clarity only (font stays Segoe UI from hoisted preview CSS). */
const PDF_FINAL_OVERRIDES = `
html[data-preview-pdf="1"] #quote-preview {
    background: #fff !important;
    padding: 0 !important;
    gap: 0 !important;
    font-family: ${QUOTE_PREVIEW_FONT_STACK} !important;
    -webkit-font-smoothing: antialiased !important;
    -moz-osx-font-smoothing: grayscale !important;
    text-rendering: auto !important;
}
html[data-preview-pdf="1"] #quote-preview *:not(.quote-digital-signature-stamp):not(.quote-signature-stamp-caption):not(.quote-signature-stamp-body) {
    transform: none !important;
    filter: none !important;
    backdrop-filter: none !important;
}
html[data-preview-pdf="1"] .quote-a4-sheet {
    position: relative !important;
}
html[data-preview-pdf="1"] .quote-digital-signature-stamp {
    position: absolute !important;
    /* left/top: inline calc(xPct/yPct) from placement — never override for PDF parity */
}
html[data-preview-pdf="1"] #quote-preview .quote-a4-sheet,
html[data-preview-pdf="1"] #quote-preview .quote-document-root {
    font-family: inherit !important;
}
html[data-preview-pdf="1"] .quote-a4-sheet,
html[data-preview-pdf="1"] .quote-preview-panel-shell,
html[data-preview-pdf="1"] .quote-cover-body-panel,
html[data-preview-pdf="1"] .quote-clause-heading-panel,
html[data-preview-pdf="1"] .quote-cover-meta-table {
    box-shadow: none !important;
}
html[data-preview-pdf="1"] .clause-content,
html[data-preview-pdf="1"] .clause-content p,
html[data-preview-pdf="1"] .clause-content li,
html[data-preview-pdf="1"] .clause-content td,
html[data-preview-pdf="1"] .clause-content th {
    font-family: inherit !important;
    font-size: 13px !important;
    line-height: 1.45 !important;
    -webkit-font-smoothing: antialiased !important;
    -moz-osx-font-smoothing: grayscale !important;
    text-rendering: auto !important;
}
html[data-preview-pdf="1"] .quote-clause-heading-panel h3 {
    font-family: inherit !important;
    font-size: ${EMS_QUOTE_CLAUSE_HEADING_FONT_SIZE} !important;
    line-height: ${EMS_QUOTE_CLAUSE_HEADING_LINE_HEIGHT} !important;
    font-weight: 600 !important;
    color: ${EMS_QUOTE_CLAUSE_HEADING_TEXT_COLOR} !important;
    -webkit-font-smoothing: antialiased !important;
    -moz-osx-font-smoothing: grayscale !important;
    text-rendering: auto !important;
}
html[data-preview-pdf="1"] .quote-cover-meta-table {
    font-size: 14px !important;
}
html[data-preview-pdf="1"] .quote-cover-letter p {
    font-size: 14px !important;
}
html[data-preview-pdf="1"] .quote-header-quote-panel,
html[data-preview-pdf="1"] .quote-header-quote-panel-mid {
    font-size: 13px !important;
}
html[data-preview-pdf="1"] .footer-section > hr.quote-section-rule,
html[data-preview-pdf="1"] .footer-section > hr {
    border: none !important;
    border-top: ${EMS_QUOTE_PRINT_FOOTER_RULE_WIDTH_PDF} solid #94a3b8 !important;
    height: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    box-sizing: border-box !important;
}
html[data-preview-pdf="1"] #ems-auto-price-summary-table {
    border: ${EMS_QUOTE_PRICING_TABLE_OUTER_BORDER} !important;
    margin-top: ${EMS_QUOTE_PRICING_TABLE_MARGIN_TOP} !important;
    font-size: 11px !important;
    line-height: 1.35 !important;
    box-sizing: border-box !important;
}
html[data-preview-pdf="1"] #ems-auto-price-summary-table th,
html[data-preview-pdf="1"] #ems-auto-price-summary-table td {
    border: ${EMS_QUOTE_PDF_TABLE_BORDER_WIDTH} solid ${EMS_QUOTE_PRICING_TABLE_BORDER_COLOR} !important;
    padding: 5px 10px !important;
    color: #0f172a !important;
}
html[data-preview-pdf="1"] #ems-auto-price-summary-table thead th {
    background: ${EMS_QUOTE_PRICING_TABLE_HEADER_BG} !important;
    color: ${EMS_QUOTE_PRICING_TABLE_HEADER_COLOR} !important;
    font-weight: 600 !important;
    border: ${EMS_QUOTE_PRICING_TABLE_HEAD_CELL_BORDER} !important;
}
html[data-preview-pdf="1"] #ems-auto-price-summary-table tr[data-ems-row="grand"] td {
    background: ${EMS_QUOTE_PRICING_TABLE_TOTAL_BG} !important;
    font-weight: 700 !important;
    border-top: 1px solid #94a3b8 !important;
}
`;

export function buildQuotePrintDocumentHtml(printWithHeader, fragmentHtml, tableStyles, serverOrigin = '', pdfMode = false, options = {}) {
    const usePreviewMatchedPdf = pdfMode === 'preview';
    const pdfAssetOriginRewriteFrom = options?.pdfAssetOriginRewriteFrom || '';
    const baseTag = serverOrigin ? `<base href="${String(serverOrigin).replace(/\/?$/, '/')}">` : '';

    let fragmentForBody = fragmentHtml;
    if (usePreviewMatchedPdf && serverOrigin) {
        fragmentForBody = normalizePdfStaticAssets(fragmentForBody, serverOrigin, pdfAssetOriginRewriteFrom);
    }

    let previewHoistedSheetCss = '';
    if (usePreviewMatchedPdf) {
        const { css, html: bodyWithoutStyles } = stripAllStyleTags(fragmentForBody);
        previewHoistedSheetCss = sanitizeHoistedPreviewCssForPdf(css);
        fragmentForBody = fixInvalidSelfClosingTags(bodyWithoutStyles.trim());
    }

    const googleFontLinks = `
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">`;

    const htmlDataAttrs = usePreviewMatchedPdf ? ' data-preview-pdf="1"' : '';
    const docFontStack = usePreviewMatchedPdf ? QUOTE_PREVIEW_FONT_STACK : QUOTE_APP_FONT_STACK;
    const rootTypography = usePreviewMatchedPdf
        ? '-webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; text-rendering: auto;'
        : '-webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility;';

    const browserSavePdfHint = options?.browserSavePdfHint
        ? `<div class="no-print ems-browser-pdf-hint" style="position:fixed;top:0;left:0;right:0;z-index:99999;padding:10px 14px;background:#eff6ff;border-bottom:1px solid #3b82f6;font:14px 'Segoe UI',system-ui,sans-serif;color:#1e3a8a;text-align:center;box-sizing:border-box;">In the print dialog, choose <strong>Save as PDF</strong> or <strong>Microsoft Print to PDF</strong>, then click Save.</div>`
        : '';
    const docTitle = String(options?.documentTitle || 'EMS Quote').replace(/</g, '');

    return `<!DOCTYPE html><html lang="en"${htmlDataAttrs}><head><title>${docTitle}</title>${baseTag}${
        usePreviewMatchedPdf ? '' : googleFontLinks
    }<style>
        @page { size: A4 portrait; margin: 0; }
        html, body {
            margin: 0 !important; padding: 0 !important; background: white !important;
            font-family: ${docFontStack}; font-size: 14px; line-height: 1.6;
            ${rootTypography}
            display: block !important; font-size: 0 !important;
        }
        .print-wrapper {
            display: block !important;
            font-family: ${docFontStack} !important;
            font-size: 14px !important; line-height: 1.6 !important;
            width: 210mm !important; margin: 0 !important; padding: 0 !important;
        }
        ${previewHoistedSheetCss}
        ${PREVIEW_PDF_SCREEN_OVERRIDES}
        ${pdfMode === true ? SERVER_PDF_STYLES : ''}
        ${getServerPdfHeaderModeCss(printWithHeader)}
        ${String(tableStyles || '').trim()}
        ${usePreviewMatchedPdf ? PDF_FINAL_OVERRIDES : ''}
    </style></head><body>${browserSavePdfHint}<div id="quote-print-root" class="print-wrapper" data-print-with-header="${printWithHeader ? '1' : '0'}">${fragmentForBody}</div></body></html>`.trim().replace(/>\s*>/g, '>');
}

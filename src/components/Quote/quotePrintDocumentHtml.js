/**
 * Standalone HTML document for quote print preview and server-side vector PDF (Puppeteer).
 */

const QUOTE_APP_FONT_STACK = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

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
        return `.print-logo-section, .footer-section, .quote-print-repeat-strip, .quote-print-page-indicator, .quote-print-footer-rule { display: none !important; } .page-one { min-height: auto !important; }`;
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
html[data-preview-pdf="1"] .header-section.quote-header-row {
    display: flex !important;
    flex-direction: row !important;
    justify-content: space-between !important;
    align-items: flex-start !important;
    width: 100% !important;
    box-sizing: border-box !important;
}
html[data-preview-pdf="1"] .quote-header-address-col,
html[data-preview-pdf="1"] .quote-header-quote-col {
    box-sizing: border-box !important;
    min-width: 0 !important;
}
html[data-preview-pdf="1"] .quote-header-address-col {
    flex: 0 1 50% !important;
    width: 50% !important;
    max-width: 50% !important;
}
html[data-preview-pdf="1"] .quote-header-quote-col {
    flex: 0 1 45% !important;
    width: 45% !important;
    max-width: 45% !important;
}
html[data-preview-pdf="1"] .quote-header-quote-panel {
    width: 100% !important;
    border: none !important;
    border-radius: 0 !important;
    overflow: visible !important;
    font-size: 13px !important;
    box-sizing: border-box !important;
}
html[data-preview-pdf="1"] .quote-header-quote-panel-body {
    display: flex !important;
    flex-direction: column !important;
    width: 100% !important;
    padding: 4px 0 14px 0 !important;
    box-sizing: border-box !important;
}
html[data-preview-pdf="1"] .quote-header-quote-panel-row--ref {
    background: #e8edf4 !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    padding: 9px 0 9px 0 !important;
    margin: 0 0 2px 0 !important;
    box-sizing: border-box !important;
}
html[data-preview-pdf="1"] .quote-header-quote-panel-row--ref .quote-header-quote-panel-label {
    font-weight: 600 !important;
    color: #475569 !important;
}
html[data-preview-pdf="1"] .quote-header-quote-panel-row--ref .quote-header-quote-panel-value {
    font-weight: 700 !important;
    color: #0f172a !important;
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
    flex: 0 0 34% !important;
    max-width: 132px !important;
    color: #000 !important;
    font-weight: 400 !important;
    padding-right: 12px !important;
    box-sizing: border-box !important;
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
    padding-top: 10px !important;
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
    border-collapse: collapse !important;
    font-size: 13px !important;
    margin-bottom: 0 !important;
    box-sizing: border-box !important;
}
html[data-preview-pdf="1"] .quote-cover-meta-table td {
    border: none !important;
    padding: 7px 10px 7px 0 !important;
    vertical-align: top !important;
    line-height: 1.45 !important;
    box-sizing: border-box !important;
}
html[data-preview-pdf="1"] .quote-cover-meta-table td:first-child {
    width: 26% !important;
    max-width: 132px !important;
    color: #64748b !important;
    font-weight: 500 !important;
}
html[data-preview-pdf="1"] .quote-cover-meta-table td:last-child {
    color: #0f172a !important;
    font-weight: 400 !important;
}
html[data-preview-pdf="1"] .quote-cover-meta-row-project td {
    background: #e8edf4 !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    padding-top: 9px !important;
    padding-bottom: 9px !important;
}
html[data-preview-pdf="1"] .quote-cover-meta-row-project td:first-child {
    font-weight: 600 !important;
    color: #475569 !important;
}
html[data-preview-pdf="1"] .quote-cover-meta-row-project td:last-child {
    font-weight: 700 !important;
    color: #0f172a !important;
}
html[data-preview-pdf="1"] .quote-cover-page1-spacer {
    flex: 1 1 auto !important;
    min-height: 8mm !important;
}
html[data-preview-pdf="1"] .quote-cover-sign-off {
    flex-shrink: 0 !important;
    width: 100% !important;
    box-sizing: border-box !important;
}
html[data-preview-pdf="1"] .quote-cover-sign-off-for {
    margin: 0 0 calc(1.58em * 3) 0 !important;
    font-size: 13px !important;
    line-height: 1.58 !important;
    color: #0f172a !important;
    font-weight: 600 !important;
}
html[data-preview-pdf="1"] .quote-cover-signatory-line {
    margin-top: 0 !important;
    font-size: 13px !important;
    color: #0f172a !important;
}
html[data-preview-pdf="1"] .quote-cover-signatory-designation {
    margin-top: 4px !important;
    font-size: 12px !important;
    line-height: 1.45 !important;
    color: #475569 !important;
    font-weight: 400 !important;
}
html[data-preview-pdf="1"] .quote-cover-letter p {
    margin: 0 0 11px 0 !important;
    font-size: 13px !important;
    line-height: 1.58 !important;
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
    text-align: left !important;
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
    min-height: 297mm !important;
    height: auto !important;
    page-break-after: always !important;
    break-after: page !important;
    overflow: visible !important;
}
html[data-preview-pdf="1"] .quote-a4-sheet:last-child {
    page-break-after: auto !important;
    break-after: auto !important;
}
html[data-preview-pdf="1"] .quote-a4-sheet--continuation .quote-sheet-main-flex {
    min-height: 0 !important;
}
html[data-preview-pdf="1"] .quote-a4-sheet--continuation .content-section {
    flex: 0 1 auto !important;
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
}
html[data-preview-pdf="1"] .clause-content table,
html[data-preview-pdf="1"] .clause-content table th,
html[data-preview-pdf="1"] .clause-content table td {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
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
        height: auto !important;
        max-height: none !important;
        overflow: visible !important;
        page-break-after: always !important;
        break-after: page !important;
        box-sizing: border-box !important;
    }
    html[data-preview-pdf="1"] .quote-a4-sheet:last-child {
        page-break-after: auto !important;
        break-after: auto !important;
    }
    html[data-preview-pdf="1"] .quote-a4-sheet--continuation .quote-sheet-main-flex {
        min-height: 0 !important;
    }
    html[data-preview-pdf="1"] .quote-a4-sheet--continuation .content-section {
        flex: 0 1 auto !important;
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
}
`;

const SERVER_PDF_STYLES = `
html[data-server-pdf="1"] #quote-print-root { background: #fff; padding: 0; }
html[data-server-pdf="1"] .no-print { display: none !important; }
html[data-server-pdf="1"] .quote-a4-sheet { display: block !important; height: auto !important; }
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
        previewHoistedSheetCss = css;
        fragmentForBody = fixInvalidSelfClosingTags(bodyWithoutStyles.trim());
    }

    const googleFontLinks = `
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">`;

    const htmlDataAttrs = usePreviewMatchedPdf ? ' data-preview-pdf="1"' : '';

    return `<!DOCTYPE html><html lang="en"${htmlDataAttrs}><head><title>.</title>${baseTag}${googleFontLinks}<style>
        @page { size: A4 portrait; margin: 0; }
        html, body {
            margin: 0 !important; padding: 0 !important; background: white !important;
            font-family: ${QUOTE_APP_FONT_STACK}; font-size: 14px; line-height: 1.6;
            -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility;
            display: block !important; font-size: 0 !important;
        }
        .print-wrapper {
            display: block !important; font-size: 14px !important; line-height: 1.6 !important;
            width: 210mm !important; margin: 0 !important; padding: 0 !important;
        }
        ${previewHoistedSheetCss}
        ${PREVIEW_PDF_SCREEN_OVERRIDES}
        ${pdfMode === true ? SERVER_PDF_STYLES : ''}
        ${getServerPdfHeaderModeCss(printWithHeader)}
        ${String(tableStyles || '').trim()}
    </style></head><body><div id="quote-print-root" class="print-wrapper" data-print-with-header="${printWithHeader ? '1' : '0'}">${fragmentForBody}</div></body></html>`.trim().replace(/>\s*>/g, '>');
}

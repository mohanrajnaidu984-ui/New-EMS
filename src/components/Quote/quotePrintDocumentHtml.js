/**
 * Standalone HTML document for quote print preview and server-side vector PDF (Puppeteer).
 * @param {boolean} printWithHeader
 * @param {string} fragmentHtml innerHTML of #quote-print-root or #quote-preview (innerHTML omits the root node; this document re-wraps with id="quote-print-root" so embedded @media print visibility rules match)
 * @param {string} tableStyles clause table CSS (same as QuoteForm tableStyles)
 * @param {string} [serverOrigin] e.g. http://localhost:5002 — adds <base> so /uploads resolve when rendering off the Vite dev server
 * @param {boolean|string} [pdfMode] false = legacy print shell (differs from download). true = legacy stripped HTML + SERVER_PDF_STYLES. 'preview' = same snapshot + shell as PDF download: @page, base, fonts, asset rewrites, #quote-preview white+gap:0 for Chromium (avoids extra gray PDF page), PREVIEW_PDF_SCREEN_OVERRIDES (canvas + hide chrome/measure; sheet/stamp layout from hoisted fragment CSS only).
 * @param {{ pdfAssetOriginRewriteFrom?: string }} [options] for pdfMode 'preview': set `pdfAssetOriginRewriteFrom` to `window.location.origin` so serialized img src hosts match the API (logos).
 */

/** Same as `src/index.css` `:root --font-family` / `body` — Quote preview inherits this from the app. */
const QUOTE_APP_FONT_STACK =
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

/** Strip all inline style elements from captured HTML (tableStyles still passed separately in head). */
function stripEmbeddedStyleTags(html) {
    return html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
}

/**
 * Extract every `<style>...</style>` from a string. Chromium’s print-to-PDF often emits a **blank first page**
 * when `<style>` blocks sit in `<body>` before real content (serialized quote fragment).
 * @returns {{ css: string, html: string }}
 */
function stripAllStyleTags(html) {
    if (!html) return { css: '', html: '' };
    const chunks = [];
    const out = String(html).replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (_, inner) => {
        chunks.push(inner);
        return '';
    });
    return { css: chunks.join('\n\n'), html: out.trim() };
}

/**
 * Serialize `#quote-print-root` for vector PDF / print window. Clones the live DOM and removes nodes that
 * must not participate in print layout — `display:none` + off-screen measure hosts have still produced a
 * blank first PDF page in headless Chromium.
 * @param {HTMLElement | null} [rootEl]
 * @returns {string}
 */
export function captureQuotePrintRootInnerHtmlForPdf(rootEl) {
    const root =
        rootEl && typeof rootEl.cloneNode === 'function'
            ? rootEl
            : typeof document !== 'undefined'
              ? document.getElementById('quote-print-root')
              : null;
    if (!root) return '';
    const clone = root.cloneNode(true);
    const removeSel = [
        '.quote-clause-measure-host',
        '.quote-print-repeat-strip',
        '.quote-print-page-indicator',
        '.quote-print-footer-rule',
    ];
    for (const sel of removeSel) {
        clone.querySelectorAll(sel).forEach((n) => n.remove());
    }
    return clone.innerHTML;
}

const PDF_SELF_CLOSE_FIX_TAGS = [
    'div',
    'span',
    'p',
    'a',
    'section',
    'article',
    'main',
    'header',
    'footer',
    'label',
    'li',
    'td',
    'th',
    'tr',
    'tbody',
    'thead',
    'table',
    'h1',
    'h2',
    'h3',
];

/** `<div ... />` is invalid HTML5 for non-void elements; parsers can leave stray `/>` text in PDF output. */
function fixInvalidSelfClosingTags(html) {
    let out = String(html);
    for (const tag of PDF_SELF_CLOSE_FIX_TAGS) {
        const re = new RegExp(`<${tag}([^>]*?)\\s*\\/\\s*>`, 'gi');
        out = out.replace(re, `<${tag}$1></${tag}>`);
    }
    return out;
}

/**
 * Puppeteer loads HTML off the dev app; serialized `innerHTML` often uses the Vite origin
 * (e.g. http://localhost:5173/uploads/...) while static files are served by the API (:5002).
 * Rewrite browser origin → API origin and force absolute /uploads URLs so logos load in PDF.
 */
function normalizePdfStaticAssets(html, apiOrigin, rewriteFromOrigin) {
    if (!html || !apiOrigin) return html;
    const api = String(apiOrigin).replace(/\/$/, '');
    let out = html;
    const from = String(rewriteFromOrigin || '').replace(/\/$/, '');
    if (from && from.toLowerCase() !== api.toLowerCase()) {
        const esc = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        out = out.replace(new RegExp(esc, 'gi'), api);
    }
    out = out.replace(
        /(\ssrc=["'])(\/uploads\/[^"']+)(["'])/gi,
        (_, q1, path, q2) => `${q1}${api}${path}${q2}`
    );
    out = out.replace(
        /(url\(["']?)(\/uploads\/[^)"']+)(["']?\))/gi,
        (_, a, path, b) => `${a}${api}${path}${b}`
    );
    return out;
}

/** Header chrome for server PDF: never inject @media print position:fixed (Chromium PDF mispositions it). */
function getServerPdfHeaderModeCss(printWithHeader) {
    if (!printWithHeader) {
        return `
                            .print-logo-section, .footer-section,
                            .quote-print-repeat-strip, .quote-print-page-indicator,
                            .quote-print-footer-rule { display: none !important; }
                            .page-one { min-height: auto !important; }
                        `;
    }
    return `
                            .quote-print-repeat-strip,
                            .quote-print-page-indicator,
                            .quote-print-footer-rule { display: none !important; }
                        `;
}

/**
 * Puppeteer uses emulateMediaType('screen'). Sheet layout MUST come from the hoisted fragment `<style>`
 * (same rules as the Quote tab). Do **not** override stamps, flex, or sheet height here — forcing stamps to
 * `position: relative` made every placed stamp stack vertically in the PDF (N stamps = N blocks).
 */
const PREVIEW_PDF_SCREEN_OVERRIDES = `
html[data-preview-pdf="1"] body {
    background: white !important;
}
html[data-preview-pdf="1"] #quote-print-root {
    background: white !important;
    padding: 0 !important;
    margin: 0 !important;
    width: 100% !important;
    max-width: none !important;
}
html[data-preview-pdf="1"] #quote-preview {
    gap: 0 !important;
    background: white !important;
    padding: 0 !important;
    margin: 0 !important;
    display: block !important;
    min-width: 210mm !important;
    box-sizing: border-box !important;
}
html[data-preview-pdf="1"] .no-print {
    display: none !important;
}
/* Remove print-chrome + off-screen measure host from pagination (hidden nodes have caused blank PDF pages in Chromium). */
html[data-preview-pdf="1"] .quote-print-repeat-strip,
html[data-preview-pdf="1"] .quote-print-page-indicator,
html[data-preview-pdf="1"] .quote-print-footer-rule {
    display: none !important;
    visibility: hidden !important;
    height: 0 !important;
    max-height: 0 !important;
    width: 0 !important;
    overflow: hidden !important;
    margin: 0 !important;
    padding: 0 !important;
    border: none !important;
    position: absolute !important;
    left: -9999px !important;
    pointer-events: none !important;
}
html[data-preview-pdf="1"] .quote-clause-measure-host {
    display: none !important;
    visibility: hidden !important;
    height: 0 !important;
    max-height: 0 !important;
    overflow: hidden !important;
    position: absolute !important;
    left: -9999px !important;
    margin: 0 !important;
    padding: 0 !important;
}
/*
 * Blank / extra PDF pages in Chromium: do not pair break-after: page on every sheet with another forced
 * break-before. Hoisted fragment uses both; here we reset page-one and clause sheets for vector PDF only.
 */
html[data-preview-pdf="1"] .quote-a4-sheet.page-one {
    page-break-before: auto !important;
    break-before: auto !important;
    page-break-after: auto !important;
    break-after: auto !important;
}
html[data-preview-pdf="1"] .quote-a4-clause-sheet {
    page-break-before: always !important;
    break-before: page !important;
    page-break-after: auto !important;
    break-after: auto !important;
}
html[data-preview-pdf="1"] .quote-a4-sheet.page-one + .quote-a4-clause-sheet {
    page-break-before: auto !important;
    break-before: auto !important;
}
html[data-preview-pdf="1"] img {
    print-color-adjust: exact !important;
    -webkit-print-color-adjust: exact !important;
    max-width: 100%;
}
html[data-preview-pdf="1"] .quote-sheet-logo-row img,
html[data-preview-pdf="1"] .quote-continuation-header img {
    height: 68px !important;
    max-width: 212px !important;
    width: auto !important;
    object-fit: contain !important;
}
`;

/**
 * Vector PDF (Puppeteer, emulateMediaType('print')):
 * Fragment <style> is stripped — restore rules that print CSS normally handled (e.g. .no-print).
 * Flow-based layout; avoid row/footer break rules that inflate Chromium’s page count vs on-screen sheets.
 */
const SERVER_PDF_STYLES = `
html[data-server-pdf="1"] #quote-print-root {
    padding: 0 !important;
    margin: 0 !important;
    max-width: none !important;
    background: #fff;
}
html[data-server-pdf="1"] .no-print {
    display: none !important;
    visibility: hidden !important;
    width: 0 !important;
    height: 0 !important;
    overflow: hidden !important;
    margin: 0 !important;
    padding: 0 !important;
    border: none !important;
    pointer-events: none !important;
}
html[data-server-pdf="1"] .quote-print-repeat-strip,
html[data-server-pdf="1"] .quote-print-page-indicator,
html[data-server-pdf="1"] .quote-print-footer-rule {
    display: none !important;
    height: 0 !important;
    max-height: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow: hidden !important;
    visibility: hidden !important;
    border: none !important;
    line-height: 0 !important;
}
/* In-vector PDF, React’s “Page 1 / 4” is logical clause pagination — Chromium’s page count differs → hide to avoid confusion */
html[data-server-pdf="1"] .quote-page-num-screen {
    display: none !important;
}
html[data-server-pdf="1"] #quote-preview {
    display: block !important;
    flex-direction: unset !important;
    gap: 0 !important;
    background: #fff !important;
    border: none !important;
    outline: none !important;
    padding: 0 !important;
    margin: 0 auto !important;
    width: 100% !important;
    max-width: 210mm !important;
    box-sizing: border-box !important;
    box-shadow: none !important;
}
html[data-server-pdf="1"] .quote-document-root {
    border: none !important;
    outline: none !important;
    max-width: 210mm !important;
    margin: 0 auto !important;
}
html[data-server-pdf="1"] .header-section.quote-header-row {
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
}
html[data-server-pdf="1"] .quote-header-address-col,
html[data-server-pdf="1"] .quote-header-quote-col {
    min-width: 0;
    box-sizing: border-box;
}
html[data-server-pdf="1"] .quote-header-quote-col table {
    width: 100% !important;
    max-width: 100% !important;
}
html[data-server-pdf="1"] .quote-clause-measure-host {
    display: none !important;
    height: 0 !important;
    overflow: hidden !important;
    visibility: hidden !important;
}
/*
 * Headless Chromium: never force one printed page per .quote-a4-sheet and never avoid breaks on whole sheets —
 * that orphans signatures and creates blank pages when body text is taller than one page.
 * Let page-one flow; only continuation clause stacks force a new page.
 */
html[data-server-pdf="1"] .quote-a4-sheet {
    display: block !important;
    background: #fff !important;
    box-sizing: border-box;
    width: 100%;
    max-width: 210mm;
    margin: 0 auto !important;
    padding: 12mm 14mm !important;
    min-height: 0 !important;
    height: auto !important;
    border: none !important;
    outline: none !important;
    box-shadow: none !important;
    border-radius: 0;
    break-inside: auto !important;
    page-break-inside: auto !important;
}
html[data-server-pdf="1"] .quote-a4-sheet:last-child {
    margin-bottom: 0 !important;
}
html[data-server-pdf="1"] .quote-sheet-main-flex {
    min-width: 0;
    min-height: 0;
    height: auto !important;
    display: block !important;
}
html[data-server-pdf="1"] .quote-sheet-main-flex-fill {
    display: none !important;
    height: 0 !important;
    min-height: 0 !important;
    flex: none !important;
}
/* avoid here caused Chromium to move the whole footer/signature to the next PDF page → blank “middle” pages */
html[data-server-pdf="1"] .quote-sheet-footer-push {
    flex-shrink: 0;
    page-break-inside: auto !important;
    break-inside: auto !important;
}
/* Absolute % positioning inside a tall sheet confuses print layout; flow the stamp after the footer in PDF */
html[data-server-pdf="1"] .quote-digital-signature-stamp {
    position: relative !important;
    left: auto !important;
    top: auto !important;
    right: auto !important;
    bottom: auto !important;
    transform: none !important;
    width: 100% !important;
    max-width: 100% !important;
    margin: 12px 0 0 0 !important;
    padding: 0 !important;
    display: block !important;
    box-sizing: border-box !important;
    page-break-inside: auto !important;
    break-inside: auto !important;
}
html[data-server-pdf="1"] .quote-signature-spacer {
    margin-bottom: 28px !important;
}
html[data-server-pdf="1"] .quote-sheet-logo-row {
    flex-shrink: 0;
    display: flex;
    justify-content: flex-end;
    width: 100%;
}
html[data-server-pdf="1"] .quote-continuation-header {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    flex-shrink: 0;
    margin-bottom: 16px;
    padding-bottom: 0;
    border-bottom: none;
    page-break-after: avoid !important;
    break-after: avoid-page !important;
}
html[data-server-pdf="1"] .quote-footer-full-rule {
    width: 100%;
    margin: 10px 0 0 0;
    padding: 0;
    border: 0;
    border-top: 1px solid #e2e8f0;
    height: 0;
    box-sizing: border-box;
}
html[data-server-pdf="1"] .quote-print-footer-rule {
    display: none !important;
}
html[data-server-pdf="1"] .clause-content {
    max-width: 100%;
    overflow-wrap: anywhere;
    word-break: break-word;
}
html[data-server-pdf="1"] .clause-content table {
    width: 100% !important;
    max-width: 100% !important;
    box-sizing: border-box !important;
}
html[data-server-pdf="1"] .clause-content tr {
    page-break-inside: auto !important;
    break-inside: auto !important;
}
/* tableStyles uses .clause-content tr { break-inside: avoid } — must override for PDF or huge tables force extra pages */
html[data-server-pdf="1"] .clause-content table tr,
html[data-server-pdf="1"] .clause-content tbody tr {
    page-break-inside: auto !important;
    break-inside: auto !important;
}
/* Override inline pageBreakInside from JSX for vector PDF */
html[data-server-pdf="1"] .quote-clause-block {
    break-inside: auto !important;
    page-break-inside: auto !important;
}

@media print {
    html[data-server-pdf="1"] .print-wrapper {
        padding: 0 !important;
        min-height: 0 !important;
    }
    html[data-server-pdf="1"] #quote-print-root[data-print-with-header="1"] .footer-section {
        position: static !important;
        bottom: auto !important;
        right: auto !important;
        visibility: visible !important;
        width: 50% !important;
        max-width: 50% !important;
        margin-left: 50% !important;
        margin-top: 0 !important;
        padding: 15px 0 0 0 !important;
        border-top: none !important;
        font-size: 11px !important;
        text-align: right !important;
        background: transparent !important;
        z-index: auto !important;
    }
    html[data-server-pdf="1"] .quote-a4-sheet {
        page-break-after: auto !important;
        break-after: auto !important;
        break-inside: auto !important;
        page-break-inside: auto !important;
        min-height: 0 !important;
        margin-bottom: 0 !important;
    }
    html[data-server-pdf="1"] .quote-a4-clause-sheet {
        page-break-before: always !important;
        break-before: page !important;
    }
    /* First continuation: do not force a fresh page if page-one still has room (was causing +1 blank PDF page vs preview). */
    html[data-server-pdf="1"] .quote-a4-sheet.page-one + .quote-a4-clause-sheet {
        page-break-before: auto !important;
        break-before: auto !important;
    }
    html[data-server-pdf="1"] .quote-a4-clause-sheet + .quote-a4-clause-sheet {
        page-break-before: always !important;
        break-before: page !important;
    }
    html[data-server-pdf="1"] .page-break {
        page-break-before: always !important;
        break-before: page !important;
        min-height: 0 !important;
        margin-top: 0 !important;
    }
    html[data-server-pdf="1"] .quote-header-address-col,
    html[data-server-pdf="1"] .quote-header-quote-col {
        flex: 0 0 50% !important;
        width: 50% !important;
        max-width: 50% !important;
    }
    html[data-server-pdf="1"] .quote-clause-block {
        break-inside: auto !important;
        page-break-inside: auto !important;
    }
    html[data-server-pdf="1"] .page-one {
        min-height: 0 !important;
    }
}
`;

export function buildQuotePrintDocumentHtml(
    printWithHeader,
    fragmentHtml,
    tableStyles,
    serverOrigin = '',
    pdfMode = false,
    options = {}
) {
    const useLegacyStrippedPdf = pdfMode === true;
    const usePreviewMatchedPdf = pdfMode === 'preview';
    const pdfAssetOriginRewriteFrom =
        options && typeof options.pdfAssetOriginRewriteFrom === 'string' ? options.pdfAssetOriginRewriteFrom : '';

    const baseTag = serverOrigin ? `<base href="${String(serverOrigin).replace(/\/?$/, '/')}">` : '';

    let fragmentForBody = useLegacyStrippedPdf ? stripEmbeddedStyleTags(fragmentHtml) : fragmentHtml;
    let tableStylesForDoc = tableStyles || '';
    if (usePreviewMatchedPdf && serverOrigin) {
        fragmentForBody = normalizePdfStaticAssets(fragmentForBody, serverOrigin, pdfAssetOriginRewriteFrom);
        tableStylesForDoc = normalizePdfStaticAssets(tableStylesForDoc, serverOrigin, pdfAssetOriginRewriteFrom);
    }

    /** Hoist `<style>` from serialized fragment into `<head>` to avoid Chromium blank first PDF page + fix `/>`. */
    let previewHoistedSheetCss = '';
    if (usePreviewMatchedPdf) {
        const { css, html: bodyWithoutStyles } = stripAllStyleTags(fragmentForBody);
        if (String(css).trim().length > 0) {
            previewHoistedSheetCss = css;
            fragmentForBody = fixInvalidSelfClosingTags(bodyWithoutStyles.trim());
        } else {
            fragmentForBody = fixInvalidSelfClosingTags(String(fragmentForBody).trim());
        }
    }
    const sheetCssBlock =
        usePreviewMatchedPdf && String(previewHoistedSheetCss).trim().length > 0
            ? previewHoistedSheetCss
            : tableStylesForDoc;

    const headerModeCss = !printWithHeader
        ? `
                            .print-logo-section, .footer-section,
                            .quote-print-repeat-strip, .quote-print-page-indicator,
                            .quote-print-footer-rule { display: none !important; }
                            .page-one { min-height: auto !important; }
                        `
        : `
                            .quote-print-repeat-strip,
                            .quote-print-page-indicator,
                            .quote-print-footer-rule { display: none !important; }
                            @media print {
                                [data-print-with-header="1"] .quote-print-repeat-strip {
                                    display: flex !important;
                                    visibility: visible !important;
                                    position: fixed !important;
                                    top: 0;
                                    left: 14mm;
                                    right: 14mm;
                                    height: 18mm;
                                    align-items: center;
                                    justify-content: flex-end;
                                    gap: 10px;
                                    background: #fff !important;
                                    border-bottom: none !important;
                                    z-index: 2147483646;
                                    -webkit-print-color-adjust: exact !important;
                                    print-color-adjust: exact !important;
                                }
                                [data-print-with-header="1"] .quote-print-footer-rule {
                                    display: block !important;
                                    visibility: visible !important;
                                    position: fixed !important;
                                    left: 14mm;
                                    right: 14mm;
                                    bottom: 27mm;
                                    height: 0;
                                    margin: 0;
                                    padding: 0;
                                    border: 0;
                                    border-top: 1px solid #e2e8f0;
                                    z-index: 2147483645;
                                    -webkit-print-color-adjust: exact !important;
                                    print-color-adjust: exact !important;
                                }
                                [data-print-with-header="1"] .quote-footer-full-rule {
                                    visibility: hidden !important;
                                    height: 0 !important;
                                    margin: 0 !important;
                                    border: none !important;
                                }
                                [data-print-with-header="1"] .print-logo-section {
                                    visibility: hidden !important;
                                    height: 0 !important;
                                    overflow: hidden !important;
                                    margin: 0 !important;
                                    padding: 0 !important;
                                }
                                [data-print-with-header="1"] .quote-sheet-logo-row {
                                    display: none !important;
                                    height: 0 !important;
                                    overflow: hidden !important;
                                    margin: 0 !important;
                                    padding: 0 !important;
                                }
                                /* counter(page)/counter(pages) unreliable in Chromium print; use .quote-page-num-screen from fragment */
                                [data-print-with-header="1"] .quote-print-page-indicator {
                                    display: none !important;
                                }
                                [data-print-with-header="1"] .footer-section {
                                    position: fixed !important;
                                    visibility: visible !important;
                                    bottom: 10mm;
                                    right: 14mm;
                                    width: 50% !important;
                                    max-width: 50% !important;
                                    margin: 0 !important;
                                    margin-left: 50% !important;
                                    padding: 8px 0 0 0 !important;
                                    border-top: none !important;
                                    font-size: 9pt !important;
                                    text-align: right !important;
                                    background: #fff !important;
                                    z-index: 2147483646;
                                }
                            }
                        `;

    const headerCssInjected =
        useLegacyStrippedPdf || usePreviewMatchedPdf ? getServerPdfHeaderModeCss(printWithHeader) : headerModeCss;

    /**
     * Preview PDF only: on-screen preview uses a gray canvas + flex gap between sheets; Chromium PDF must be
     * flat white + gap:0 + no sheet shadows so page count matches print output.
     */
    const quotePreviewBlock = useLegacyStrippedPdf
        ? ''
        : usePreviewMatchedPdf
          ? `
        html[data-preview-pdf="1"] #quote-print-root {
            background: #ffffff !important;
        }
        html[data-preview-pdf="1"] #quote-preview.quote-document-root,
        html[data-preview-pdf="1"] #quote-preview {
            background: #ffffff !important;
            gap: 0 !important;
            padding: 0 !important;
        }
        `
          : `
        #quote-preview {
            background: white !important;
            padding: 0 !important;
            border: none !important;
            outline: none !important;
            box-shadow: none !important;
            display: block !important;
            gap: 0 !important;
        }`;

    const quoteA4BreakBlock =
        useLegacyStrippedPdf || usePreviewMatchedPdf
            ? ''
            : `
        .quote-a4-sheet {
            page-break-after: always;
            break-after: page;
            box-shadow: none !important;
            border: none !important;
            outline: none !important;
        }
        .quote-a4-sheet:last-child {
            page-break-after: auto;
            break-after: auto;
        }`;

    const printMediaBlock = useLegacyStrippedPdf || usePreviewMatchedPdf ? '' : `
        @media print {
            @page {
                size: A4 portrait;
                margin: 12mm 14mm 14mm 14mm;
            }
            body { margin: 0 !important; }
            .print-wrapper { padding: 0 !important; }
            .page-break {
                page-break-before: always !important;
                break-before: page !important;
            }
            .quote-a4-clause-sheet {
                page-break-before: always !important;
                break-before: page !important;
            }
            .quote-header-address-col,
            .quote-header-quote-col {
                flex: 0 0 50% !important;
                width: 50% !important;
                max-width: 50% !important;
            }
            .quote-clause-block {
                break-inside: avoid-page;
                page-break-inside: avoid;
            }
            .page-one { min-height: 0 !important; }
            .print-wrapper {
                min-height: 0 !important;
                box-shadow: none !important;
                padding-top: 18mm !important;
                padding-bottom: 44mm !important;
                box-sizing: border-box;
            }
        }`;

    const serverPdfHeadAppend = useLegacyStrippedPdf
        ? SERVER_PDF_STYLES
        : usePreviewMatchedPdf
          ? PREVIEW_PDF_SCREEN_OVERRIDES
          : '';

    const htmlDataAttrs = `${useLegacyStrippedPdf ? ' data-server-pdf="1"' : ''}${
        usePreviewMatchedPdf ? ' data-preview-pdf="1"' : ''
    }`;

    /** Avoid external font CSS for server/Puppeteer — `waitUntil: load` would block on blocked CDNs; keep PDF self-contained */
    const googleFontLinks = usePreviewMatchedPdf
        ? ''
        : `
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">`;

    const bodyFontFamily = usePreviewMatchedPdf
        ? QUOTE_APP_FONT_STACK
        : `'Inter', ${QUOTE_APP_FONT_STACK}`;

    const bodyZoomCss = usePreviewMatchedPdf ? '' : '            zoom: 0.96;\n';

    /** Omit `@page` for Puppeteer preview PDF — server uses format:A4 + margin:0; CSS @page + mm blocks caused blank/extra pages. */
    const rootPageRule = usePreviewMatchedPdf
        ? `/* @page omitted for vector quote PDF (Chromium + preferCSS off) */`
        : `@page {
            size: A4 portrait;
            margin: 12mm 14mm 14mm 14mm;
        }`;

    let doc = `<!DOCTYPE html>
<html lang="en"${htmlDataAttrs}>
<head>
    <title>.</title>
    ${baseTag}
    ${googleFontLinks}
    <style>
        ${rootPageRule}

        html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: white;
            width: 100%;
            font-family: ${bodyFontFamily};
            font-size: 14px;
            line-height: 1.6;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            text-rendering: optimizeLegibility;
${bodyZoomCss}        }

        .print-wrapper {
            padding: 0;
            width: 100%;
            box-sizing: border-box;
        }

        ${sheetCssBlock}
${quotePreviewBlock}
        .quote-document-root {
            border: none !important;
            outline: none !important;
        }
        .quote-clause-measure-host {
            display: none !important;
            height: 0 !important;
            overflow: hidden !important;
            visibility: hidden !important;
        }
${quoteA4BreakBlock}
        ${headerCssInjected}
${printMediaBlock}
${serverPdfHeadAppend}
    </style>
</head>
<body>
    <!-- Must match app print CSS: fragment is innerHTML only, but styles use #quote-print-root to undo body * { visibility: hidden } in @media print -->
    <div id="quote-print-root" class="print-wrapper" data-print-with-header="${printWithHeader ? '1' : '0'}">
        ${fragmentForBody}
    </div>
    <script>
        document.title = ".";
    </script>
</body>
</html>`;
    if (usePreviewMatchedPdf) {
        doc = doc.replace(/<body([^>]*)>\s*\/>\s*/i, '<body$1>');
        doc = doc.replace(/(<div id="quote-print-root"[^>]*>)\s*\/>\s*/i, '$1');
    }
    return doc;
}

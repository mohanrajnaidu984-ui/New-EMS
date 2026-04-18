/**
 * Standalone HTML document for quote print preview and server-side vector PDF (Puppeteer).
 * @param {boolean} printWithHeader
 * @param {string} fragmentHtml innerHTML of #quote-print-root or #quote-preview (innerHTML omits the root node; this document re-wraps with id="quote-print-root" so embedded @media print visibility rules match)
 * @param {string} tableStyles clause table CSS (same as QuoteForm tableStyles)
 * @param {string} [serverOrigin] e.g. http://localhost:5002 — adds <base> so /uploads resolve when rendering off the Vite dev server
 * @param {boolean} [forServerPdf] when true, strip embedded fragment style tags (avoids position:fixed / body* visibility in headless PDF) and use preview-matched CSS only
 */

/** Strip all inline style elements from captured HTML (tableStyles still passed separately in head). */
function stripEmbeddedStyleTags(html) {
    return html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
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
 * Vector PDF layout: Chromium PDF breaks badly on min-height:297mm + grid 1fr + height:100% (collapsed body, blank pages, gray slabs).
 * Use simple block flow, white stack (no dark gutter in PDF), one sheet ≈ one page via break-inside: avoid on .quote-a4-sheet.
 */
const SERVER_PDF_STYLES = `
html[data-server-pdf="1"] #quote-print-root {
    padding: 0 !important;
    margin: 0 !important;
    max-width: none !important;
    background: #fff;
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
html[data-server-pdf="1"] #quote-preview {
    display: flex !important;
    flex-direction: column !important;
    gap: 0 !important;
    background: #fff !important;
    border: none !important;
    outline: none !important;
    padding: 0 !important;
    margin: 0 !important;
    width: 100% !important;
    max-width: none !important;
    box-sizing: border-box !important;
    box-shadow: none !important;
}
html[data-server-pdf="1"] .quote-document-root {
    border: none !important;
    outline: none !important;
}
html[data-server-pdf="1"] .header-section.quote-header-row {
    width: 100%;
    box-sizing: border-box;
}
html[data-server-pdf="1"] .quote-header-address-col,
html[data-server-pdf="1"] .quote-header-quote-col {
    min-width: 0;
}
html[data-server-pdf="1"] .quote-clause-measure-host {
    display: none !important;
    height: 0 !important;
    overflow: hidden !important;
    visibility: hidden !important;
}
/* Block flow — not grid — so flex children keep height in headless PDF */
html[data-server-pdf="1"] .quote-a4-sheet {
    display: block !important;
    background: #fff !important;
    box-sizing: border-box;
    max-width: 210mm;
    margin: 0 auto 10mm auto;
    padding: 15mm;
    min-height: 0 !important;
    border: none !important;
    outline: none !important;
    box-shadow: none !important;
    border-radius: 0;
    break-inside: avoid-page !important;
    page-break-inside: avoid !important;
}
html[data-server-pdf="1"] .quote-a4-sheet:last-child {
    margin-bottom: 0 !important;
}
html[data-server-pdf="1"] .quote-sheet-main-flex {
    min-width: 0;
    min-height: 0;
    display: flex !important;
    flex-direction: column !important;
}
html[data-server-pdf="1"] .quote-sheet-footer-push {
    flex-shrink: 0;
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
html[data-server-pdf="1"] .quote-page-num-screen {
    margin-left: 50%;
    width: 50%;
    max-width: 50%;
    box-sizing: border-box;
    text-align: right;
    font-size: 11px;
    font-weight: 600;
    color: #64748b;
    padding-bottom: 6px;
}
html[data-server-pdf="1"] .clause-content tr {
    page-break-inside: auto !important;
    break-inside: auto !important;
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
        page-break-after: always !important;
        break-after: page !important;
        break-inside: avoid-page !important;
        page-break-inside: avoid !important;
        min-height: 0 !important;
        margin-bottom: 0 !important;
    }
    html[data-server-pdf="1"] .quote-a4-sheet:last-child {
        page-break-after: auto !important;
        break-after: auto !important;
    }
    html[data-server-pdf="1"] .quote-a4-clause-sheet {
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
    forServerPdf = false
) {
    const baseTag = serverOrigin
        ? `<base href="${String(serverOrigin).replace(/\/?$/, '/')}" />`
        : '';

    const fragmentForBody = forServerPdf ? stripEmbeddedStyleTags(fragmentHtml) : fragmentHtml;

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
                                [data-print-with-header="1"] .quote-print-page-indicator {
                                    display: block !important;
                                    visibility: visible !important;
                                    position: fixed !important;
                                    bottom: 34mm;
                                    right: 14mm;
                                    width: 50%;
                                    margin-left: 50%;
                                    text-align: right;
                                    font-size: 9pt;
                                    color: #64748b;
                                    z-index: 2147483645;
                                }
                                [data-print-with-header="1"] .quote-print-page-indicator::after {
                                    content: "Page " counter(page);
                                }
                                [data-print-with-header="1"] .quote-print-page-indicator::after {
                                    content: "Page " counter(page) " / " counter(pages);
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

    const headerCssInjected = forServerPdf ? getServerPdfHeaderModeCss(printWithHeader) : headerModeCss;

    const quotePreviewBlock = forServerPdf
        ? ''
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

    const quoteA4BreakBlock = forServerPdf
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

    const printMediaBlock = forServerPdf
        ? ''
        : `
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

    const serverPdfHeadAppend = forServerPdf ? SERVER_PDF_STYLES : '';

    return `<!DOCTYPE html>
<html lang="en"${forServerPdf ? ' data-server-pdf="1"' : ''}>
<head>
    <title>.</title>
    ${baseTag}
    <style>
        @page {
            size: A4 portrait;
            margin: 12mm 14mm 14mm 14mm;
        }

        html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: white;
            width: 100%;
            font-family: Arial, sans-serif;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }

        .print-wrapper {
            padding: 0;
            width: 100%;
            box-sizing: border-box;
        }

        ${tableStyles}
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
}

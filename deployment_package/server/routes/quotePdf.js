/**
 * Vector PDF from HTML using headless Chromium (selectable text, not canvas screenshots).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const express = require('express');
const { applyQuotePdfRestrictions, isQuotePdfRestrictEnabled } = require('../lib/restrictQuotePdf');
const { resolvePuppeteerChromeExecutable } = require('../lib/resolvePuppeteerChrome');

const router = express.Router();

function puppeteerLaunchTimeoutMs() {
    const n = Number(process.env.PUPPETEER_LAUNCH_TIMEOUT_MS);
    return Number.isFinite(n) && n > 0 ? n : 120000;
}

function quotePdfPageTimeoutMs() {
    const n = Number(process.env.QUOTE_PDF_PAGE_TIMEOUT_MS);
    return Number.isFinite(n) && n > 0 ? n : 120000;
}

function useSingleProcessChrome() {
    const raw = String(process.env.QUOTE_PDF_SINGLE_PROCESS ?? '1').trim().toLowerCase();
    return raw !== '0' && raw !== 'false' && raw !== 'no';
}

/**
 * Shared launch options for /health probe and /generate (IIS/PM2 service accounts).
 * Hardened for Windows Server session isolation — see PUPPETEER_* / QUOTE_PDF_* in server/.env.
 */
function buildChromeLaunchOptions(executablePath, userDataDir) {
    const args = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-extensions',
        '--no-zygote',
        /** file:// or sandboxed doc → private localhost; logos live on API :5002 */
        '--disable-features=BlockInsecurePrivateNetworkRequests',
    ];
    if (useSingleProcessChrome()) {
        args.push('--single-process');
    }
    return {
        headless: true,
        executablePath,
        timeout: puppeteerLaunchTimeoutMs(),
        userDataDir,
        args,
    };
}

/** Quick reachability check for Quote tab PDF download (Vite proxies /api → Express). */
router.get('/health', async (req, res) => {
    let puppeteerOk = false;
    let chromePath = null;
    let chromeReady = false;
    let chromeHint = '';
    let launchProbe;
    try {
        require.resolve('puppeteer');
        puppeteerOk = true;
        const puppeteer = require('puppeteer');
        const resolved = resolvePuppeteerChromeExecutable(puppeteer);
        chromePath = resolved.executablePath;
        chromeReady = !!chromePath;
        if (!chromeReady) chromeHint = resolved.reason || '';

        if (String(req.query.launch || '').trim() === '1' && chromePath) {
            const probeDir = path.join(os.tmpdir(), `ems-puppeteer-probe-${process.pid}-${Date.now()}`);
            const t0 = Date.now();
            let probeBrowser;
            try {
                probeBrowser = await puppeteer.launch(buildChromeLaunchOptions(chromePath, probeDir));
                const probePage = await probeBrowser.newPage();
                await probePage.goto('about:blank', {
                    waitUntil: 'domcontentloaded',
                    timeout: quotePdfPageTimeoutMs(),
                });
                launchProbe = { ok: true, ms: Date.now() - t0 };
            } catch (probeErr) {
                launchProbe = {
                    ok: false,
                    ms: Date.now() - t0,
                    error: probeErr && probeErr.message ? String(probeErr.message) : String(probeErr),
                };
            } finally {
                if (probeBrowser) await probeBrowser.close().catch(() => {});
                try {
                    fs.rmSync(probeDir, { recursive: true, force: true });
                } catch {
                    /* ignore */
                }
            }
        }
    } catch {
        puppeteerOk = false;
        chromeHint = 'Install: cd server && npm install puppeteer';
    }
    return res.json({
        ok: true,
        port: serverListenPort(),
        puppeteer: puppeteerOk,
        chromeReady,
        chromePath: chromePath || undefined,
        chromeHint: chromeHint || undefined,
        launchProbe,
        quotePdfAssetOrigin: (process.env.QUOTE_PDF_ASSET_ORIGIN || `http://127.0.0.1:${serverListenPort()}`).replace(
            /\/$/,
            ''
        ),
    });
});

/**
 * Beyond this, Page.setContent can hit CDP limits on some setups — load via file:// instead.
 * Keep high so normal quotes stay on setContent: file:// + http://localhost uploads often fails (no logo in PDF).
 */
const SETCONTENT_SAFE_MAX = 8_000_000;

const serverListenPort = () => String(process.env.PORT || 5002);

/** Same font as on-screen #quote-preview (QuoteForm.jsx) — do not switch to Inter in PDF. */
const QUOTE_PREVIEW_FONT_STACK =
    "'Segoe UI', 'Segoe UI Web (West European)', system-ui, -apple-system, sans-serif";

/** Injected last in <head> — strip compositing that rasterizes text; keep Segoe UI from hoisted CSS. */
function buildPdfSharpTextHeadCss() {
    return `<style id="ems-pdf-sharp-text">
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
    -webkit-font-smoothing: antialiased !important;
    -moz-osx-font-smoothing: grayscale !important;
    text-rendering: auto !important;
    transform: none !important;
    filter: none !important;
    backdrop-filter: none !important;
}
html[data-preview-pdf="1"] .quote-a4-sheet {
    position: relative !important;
}
html[data-preview-pdf="1"] .quote-digital-signature-stamp {
    position: absolute !important;
    /* left/top: inline calc(xPct/yPct) — never override for preview/PDF parity */
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
html[data-preview-pdf="1"] .clause-content th,
html[data-preview-pdf="1"] .quote-clause-heading-panel h3 {
    font-family: inherit !important;
}
</style>`;
}

function injectPdfSharpTextHead(html) {
    let out = String(html);
    out = out.replace(/<link[^>]*fonts\.googleapis\.com[^>]*>\s*/gi, '');
    out = out.replace(/<link[^>]*fonts\.gstatic\.com[^>]*>\s*/gi, '');
    const block = buildPdfSharpTextHeadCss();
    if (out.includes('</head>')) {
        return out.replace('</head>', `${block}</head>`);
    }
    return `${block}${out}`;
}

/**
 * HTML is built in the browser; `<base href>` and `/uploads` URLs often use the LAN host (e.g. 192.168.x.x).
 * Puppeteer runs on the API machine and must load logos from a host it can reach — default loopback + PORT.
 * Override with QUOTE_PDF_ASSET_ORIGIN (e.g. http://127.0.0.1:5002) if needed.
 */
function rewriteHtmlAssetHostsForPuppeteer(html) {
    const port = serverListenPort();
    const local = (process.env.QUOTE_PDF_ASSET_ORIGIN || `http://127.0.0.1:${port}`).replace(/\/$/, '');
    let out = String(html);
    out = out.replace(/<base\s+href\s*=\s*["'][^"']*["']/i, `<base href="${local}/">`);
    const reAbsUploads = new RegExp(`https?:\\/\\/[^\\s"'<>]+:${port}\\/uploads`, 'gi');
    out = out.replace(reAbsUploads, `${local}/uploads`);
    /**
     * Dev: logos often use the Vite origin (`:5174/uploads`, etc.). Puppeteer must hit Express `/uploads`
     * (same machine) — rewrite common dev-server ports so Chromium does not hang or fail loading assets.
     */
    out = out.replace(
        /https?:\/\/(?:localhost|127\.0\.0\.1|[\w.-]+):\s*(?:5173|5174|5175|5176|5177|5178|5179)\/uploads/gi,
        `${local}/uploads`
    );
    /** IIS proxy (:5173) or LAN API host — Puppeteer must use loopback, not the server’s public IP. */
    out = out.replace(
        new RegExp(`https?:\\/\\/(?:localhost|127\\.0\\.0\\.1|[\\w.-]+):\\s*${port}\\/uploads`, 'gi'),
        `${local}/uploads`
    );
    return out;
}

function extractBaseHrefFromHtml(html) {
    const m = String(html).match(/<base\s+href\s*=\s*["']([^"']+)["']/i);
    if (!m) return undefined;
    const u = m[1].trim().replace(/\/+$/, '');
    return u || undefined;
}

/** Wait for <img> network decode so PDF capture matches browser print. */
async function waitForImagesLoaded(page) {
    await page.evaluate(() => {
        const imgs = Array.from(document.images || []);
        const perImgMs = 8000;
        return Promise.race([
            Promise.all(
                imgs.map(
                    (img) =>
                        img.complete
                            ? Promise.resolve()
                            : new Promise((resolve) => {
                                  const done = () => resolve();
                                  img.addEventListener('load', done, { once: true });
                                  img.addEventListener('error', done, { once: true });
                                  setTimeout(done, perImgMs);
                              })
                )
            ),
            new Promise((resolve) => setTimeout(resolve, 20000)),
        ]);
    });
}

/** @returns {string|null} temp file path if written (caller must unlink after PDF), else null */
async function loadHtmlInPage(page, html) {
    const baseURL = extractBaseHrefFromHtml(html);
    const setOpts = {
        /** Use domcontentloaded to prevent hanging on offline servers/intranets with no internet access. */
        waitUntil: 'domcontentloaded',
        timeout: quotePdfPageTimeoutMs(),
        ...(baseURL ? { baseURL } : {}),
    };
    if (html.length <= SETCONTENT_SAFE_MAX) {
        await page.setContent(html, setOpts);
        return null;
    }
    const tmpPath = path.join(
        os.tmpdir(),
        `ems-quote-pdf-${Date.now()}-${process.pid}-${Math.random().toString(36).slice(2, 10)}.html`
    );
    fs.writeFileSync(tmpPath, html, 'utf8');
    await page.goto(pathToFileURL(tmpPath).href, {
        waitUntil: 'domcontentloaded',
        timeout: quotePdfPageTimeoutMs(),
    });
    return tmpPath;
}

async function renderPdfBuffer(page) {
    /** Prefer fixed A4 + zero margin: `preferCSSPageSize` + HTML `@page`/mm sheets often yields blank first/extra pages in Chromium. */
    const stableA4 = {
        printBackground: true,
        format: 'A4',
        margin: { top: '0', right: '0', bottom: '0', left: '0' },
        preferCSSPageSize: false,
    };
    try {
        /**
         * Use format: 'A4' and margin: 0 strictly.
         * The HTML sheets are already 210mm x 297mm. Any non-zero margin here
         * will push the sheets onto new pages, causing blank Page 1 / extra pages.
         */
        return await page.pdf(stableA4);
    } catch (e1) {
        console.warn('[quote-pdf] pdf stable A4 retry:', e1 && e1.message);
        return await page.pdf({
            printBackground: true,
            format: 'A4',
            margin: { top: '0', right: '0', bottom: '0', left: '0' },
            preferCSSPageSize: true,
        });
    }
}

router.post('/generate', express.json({ limit: '50mb' }), async (req, res) => {
    const { html, filename, emulateScreen } = req.body || {};
    /** When true (default), @media print is ignored — layout matches Quote tab on-screen CSS (grid/flex A4 sheets). */
    const useScreenMedia = emulateScreen !== false;
    if (!html || typeof html !== 'string') {
        return res.status(400).json({ error: 'html_required' });
    }

    let htmlForPdf = rewriteHtmlAssetHostsForPuppeteer(html);
    htmlForPdf = injectPdfSharpTextHead(htmlForPdf);

    if (process.env.DEBUG_QUOTE_PDF_HTML === '1') {
        try {
            fs.writeFileSync(path.join(__dirname, '../debug_pdf_structure.html'), htmlForPdf, 'utf8');
        } catch (e) {
            console.error('Debug save failed', e);
        }
    }

    let puppeteer;
    try {
        puppeteer = require('puppeteer');
    } catch (e) {
        return res.status(501).json({
            error: 'puppeteer_unavailable',
            message: 'Install server dependency: cd server && npm install puppeteer',
        });
    }

    let browser;
    let tmpHtmlPath = null;
    let puppeteerUserDataDir = null;
    try {
        const { executablePath: chromeExe, checked, reason } = resolvePuppeteerChromeExecutable(puppeteer);
        if (!chromeExe) {
            return res.status(503).json({
                error: 'chrome_not_configured',
                message: reason || 'Chrome/Chromium is not installed on this API server.',
                hint:
                    'On the server (not your PC): cd server && npx puppeteer browsers install chrome. ' +
                    'Or set PUPPETEER_EXECUTABLE_PATH in server/.env to chrome.exe (e.g. C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe).',
                checkedPaths: checked.slice(0, 8),
            });
        }
        puppeteerUserDataDir = path.join(
            os.tmpdir(),
            `ems-puppeteer-${process.pid}-${Math.random().toString(36).slice(2, 8)}`
        );
        browser = await puppeteer.launch(buildChromeLaunchOptions(chromeExe, puppeteerUserDataDir));
        const page = await browser.newPage();
        const pageTimeoutMs = quotePdfPageTimeoutMs();
        page.setDefaultTimeout(pageTimeoutMs);
        page.setDefaultNavigationTimeout(pageTimeoutMs);
        // screen = same cascade as Quote preview (embedded fragment styles target screen; @media print ignored).
        await page.emulateMediaType(useScreenMedia ? 'screen' : 'print');
        /** A4 @ 96dpi; 1× = true vector PDF (2× rasterizes and softens text when scaled into A4). */
        await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 });
        tmpHtmlPath = await loadHtmlInPage(page, htmlForPdf);
        try {
            await waitForImagesLoaded(page);
        } catch {
            /* ignore */
        }
        try {
            await page.evaluate(async () => {
                if (document.fonts && document.fonts.ready) {
                    await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 5000))]);
                }
                const root = document.getElementById('quote-print-root');
                if (!root) return;
                root.querySelectorAll('[style]').forEach((el) => {
                    if (!el.style) return;
                    const fam = el.style.fontFamily || '';
                    if (/inter|calibri|arial/i.test(fam)) {
                        el.style.removeProperty('font-family');
                    }
                    if (el.style.transform && el.style.transform !== 'none') {
                        el.style.removeProperty('transform');
                    }
                    if (el.style.filter && el.style.filter !== 'none') {
                        el.style.removeProperty('filter');
                    }
                    if (el.style.webkitFontSmoothing) {
                        el.style.removeProperty('-webkit-font-smoothing');
                    }
                });
            });
        } catch {
            /* ignore */
        }
        /* Removed manual element removal to avoid layout shifts; visibility is handled via CSS in quotePrintDocumentHtml.js */

        let buf = Buffer.from(await renderPdfBuffer(page));
        buf = await applyQuotePdfRestrictions(buf);
        const safeName = String(filename || 'quote.pdf').replace(/[^\w.\-]+/g, '_');
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
        if (isQuotePdfRestrictEnabled()) {
            res.setHeader('X-EMS-PDF-Restricted', '1');
        }
        return res.send(buf);
    } catch (err) {
        const raw = err && err.message ? String(err.message) : String(err);
        let msg = raw.trim() || 'pdf_generation_failed';
        let hint =
            'If logos fail to load, set QUOTE_PDF_ASSET_ORIGIN in server/.env (e.g. http://127.0.0.1:5002). ' +
            'Ensure Puppeteer can launch Chrome: cd server && npx puppeteer browsers install chrome (or set PUPPETEER_EXECUTABLE_PATH).';
        if (/Could not find Chrome|browser.*executable|Executable doesn't exist|Browser closed|spawn .* ENOENT/i.test(raw)) {
            hint =
                'Chrome for Puppeteer is missing or blocked. From the server folder run: npx puppeteer browsers install chrome. ' +
                'On locked-down PCs set PUPPETEER_EXECUTABLE_PATH to a Chrome/Chromium exe.';
        }
        if (/spawn EFTYPE|EFTYPE|exec format error/i.test(raw)) {
            hint =
                'The Chrome path on this server is invalid (wrong file or copied from another machine). ' +
                'On the API server run: cd server && npx puppeteer browsers install chrome. ' +
                'Or set PUPPETEER_EXECUTABLE_PATH in server/.env to a real chrome.exe on this server.';
        }
        if (/Timed out after waiting \d+ms/i.test(raw)) {
            hint =
                'Chrome did not start or load the quote in time (common on IIS/PM2). Run GET /api/quote-pdf/health?launch=1. ' +
                'Set PUPPETEER_EXECUTABLE_PATH, QUOTE_PDF_ASSET_ORIGIN=http://127.0.0.1:5002, grant the PM2 user write access to %TEMP%, ' +
                'or use Print → Save as PDF from the quote tab. To disable --single-process set QUOTE_PDF_SINGLE_PROCESS=0 and restart PM2.';
        }
        console.error('[quote-pdf]', err && err.stack ? err.stack : err);
        if (!res.headersSent) {
            return res.status(500).json({
                error: 'pdf_generation_failed',
                message: msg,
                hint,
            });
        }
        return;
    } finally {
        if (browser) {
            await browser.close().catch(() => {});
        }
        if (tmpHtmlPath) {
            try {
                fs.unlinkSync(tmpHtmlPath);
            } catch {
                /* ignore */
            }
        }
        if (puppeteerUserDataDir) {
            try {
                fs.rmSync(puppeteerUserDataDir, { recursive: true, force: true });
            } catch {
                /* ignore */
            }
        }
    }
});

module.exports = router;

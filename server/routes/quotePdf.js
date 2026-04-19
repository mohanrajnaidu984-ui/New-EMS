/**
 * Vector PDF from HTML using headless Chromium (selectable text, not canvas screenshots).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const express = require('express');

const router = express.Router();

/**
 * Beyond this, Page.setContent can hit CDP limits on some setups — load via file:// instead.
 * Keep high so normal quotes stay on setContent: file:// + http://localhost uploads often fails (no logo in PDF).
 */
const SETCONTENT_SAFE_MAX = 8_000_000;

const serverListenPort = () => String(process.env.PORT || 5001);

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
        return Promise.all(
            imgs.map(
                (img) =>
                    img.complete
                        ? Promise.resolve()
                        : new Promise((resolve) => {
                              const done = () => resolve();
                              img.addEventListener('load', done, { once: true });
                              img.addEventListener('error', done, { once: true });
                              setTimeout(done, 15000);
                          })
            )
        );
    });
}

/** @returns {string|null} temp file path if written (caller must unlink after PDF), else null */
async function loadHtmlInPage(page, html) {
    const baseURL = extractBaseHrefFromHtml(html);
    const setOpts = {
        /** `load` waits for stylesheets (e.g. Google Fonts); blocked/slow networks hang until timeout → 500 */
        waitUntil: 'domcontentloaded',
        timeout: 180000,
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
    await page.goto(pathToFileURL(tmpPath).href, { waitUntil: 'domcontentloaded', timeout: 180000 });
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
        return await page.pdf(stableA4);
    } catch (e1) {
        console.warn('[quote-pdf] pdf stable A4 retry preferCSSPageSize:', e1 && e1.message);
        try {
            return await page.pdf({
                printBackground: true,
                format: 'A4',
                margin: { top: '0', right: '0', bottom: '0', left: '0' },
                preferCSSPageSize: true,
            });
        } catch (e2) {
            console.warn('[quote-pdf] pdf fallback margins:', e2 && e2.message);
            return await page.pdf({
                printBackground: true,
                format: 'A4',
                margin: { top: '12mm', right: '14mm', bottom: '14mm', left: '14mm' },
                preferCSSPageSize: false,
            });
        }
    }
}

router.post('/generate', express.json({ limit: '50mb' }), async (req, res) => {
    const { html, filename, emulateScreen } = req.body || {};
    /** When true (default), @media print is ignored — layout matches Quote tab on-screen CSS (grid/flex A4 sheets). */
    const useScreenMedia = emulateScreen !== false;
    if (!html || typeof html !== 'string') {
        return res.status(400).json({ error: 'html_required' });
    }

    const htmlForPdf = rewriteHtmlAssetHostsForPuppeteer(html);

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
    try {
        const launchOpts = {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                /** file:// or sandboxed doc → private localhost; logos live on API :5002 */
                '--disable-features=BlockInsecurePrivateNetworkRequests',
            ],
        };
        if (process.env.PUPPETEER_EXECUTABLE_PATH) {
            launchOpts.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
        }
        browser = await puppeteer.launch(launchOpts);
        const page = await browser.newPage();
        page.setDefaultNavigationTimeout(180000);
        // screen = same cascade as Quote preview (embedded fragment styles target screen; @media print ignored).
        await page.emulateMediaType(useScreenMedia ? 'screen' : 'print');
        await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 });
        tmpHtmlPath = await loadHtmlInPage(page, htmlForPdf);
        try {
            await waitForImagesLoaded(page);
        } catch {
            /* ignore */
        }
        try {
            await page.evaluate(() =>
                Promise.race([
                    document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve(),
                    new Promise((r) => setTimeout(r, 3000)),
                ])
            );
        } catch {
            /* ignore */
        }
        try {
            await page.evaluate(() => {
                document
                    .querySelectorAll(
                        '.quote-clause-measure-host, .quote-print-repeat-strip, .quote-print-page-indicator, .quote-print-footer-rule'
                    )
                    .forEach((n) => n.remove());
            });
        } catch {
            /* ignore */
        }
        const buf = await renderPdfBuffer(page);
        const safeName = String(filename || 'quote.pdf').replace(/[^\w.\-]+/g, '_');
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
        return res.send(Buffer.from(buf));
    } catch (err) {
        const msg = String(err && err.message ? err.message : err);
        console.error('[quote-pdf]', err && err.stack ? err.stack : err);
        if (!res.headersSent) {
            return res.status(500).json({
                error: 'pdf_generation_failed',
                message: msg,
                hint:
                    'If logos fail to load, set QUOTE_PDF_ASSET_ORIGIN in server/.env (e.g. http://127.0.0.1:5002). ' +
                    'Ensure Puppeteer can launch Chrome (or set PUPPETEER_EXECUTABLE_PATH).',
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
    }
});

module.exports = router;

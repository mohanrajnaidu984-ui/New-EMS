/**
 * Vector PDF from HTML using headless Chromium (selectable text, not canvas screenshots).
 */
const express = require('express');

const router = express.Router();

router.post('/generate', express.json({ limit: '50mb' }), async (req, res) => {
    const { html, filename } = req.body || {};
    if (!html || typeof html !== 'string') {
        return res.status(400).json({ error: 'html_required' });
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
    try {
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        });
        const page = await browser.newPage();
        // Match browser “Print → Save as PDF”: print CSS + @page margins only (no extra PDF margin box).
        await page.emulateMediaType('print');
        await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 });
        await page.setContent(html, { waitUntil: 'load', timeout: 120000 });
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
        const buf = await page.pdf({
            printBackground: true,
            margin: { top: '0', right: '0', bottom: '0', left: '0' },
            preferCSSPageSize: true,
        });
        const safeName = String(filename || 'quote.pdf').replace(/[^\w.\-]+/g, '_');
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
        return res.send(Buffer.from(buf));
    } catch (err) {
        console.error('[quote-pdf]', err);
        return res.status(500).json({ error: 'pdf_generation_failed', message: String(err.message || err) });
    } finally {
        if (browser) {
            await browser.close().catch(() => {});
        }
    }
});

module.exports = router;

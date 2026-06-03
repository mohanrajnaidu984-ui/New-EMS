/**
 * Resolve a Chromium/Chrome executable for Puppeteer on Windows Server / IIS.
 * EFTYPE usually means the path exists but is not a valid .exe (wrong arch, script, or dev-machine cache).
 */
const fs = require('fs');
const path = require('path');

function isUsableWindowsExe(filePath) {
    if (process.platform !== 'win32') {
        return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
    }
    if (!/\.exe$/i.test(filePath)) return false;
    if (!fs.existsSync(filePath)) return false;
    const stat = fs.statSync(filePath);
    return stat.isFile() && stat.size > 1024;
}

function pushCandidate(list, seen, value) {
    const p = String(value || '').trim();
    if (!p || seen.has(p.toLowerCase())) return;
    seen.add(p.toLowerCase());
    list.push(p);
}

/**
 * @param {import('puppeteer')} puppeteer
 * @returns {{ executablePath: string|null, checked: string[], reason?: string }}
 */
function resolvePuppeteerChromeExecutable(puppeteer) {
    const checked = [];
    const seen = new Set();
    const candidates = [];

    pushCandidate(candidates, seen, process.env.PUPPETEER_EXECUTABLE_PATH);

    try {
        if (puppeteer && typeof puppeteer.executablePath === 'function') {
            pushCandidate(candidates, seen, puppeteer.executablePath());
        }
    } catch {
        /* ignore */
    }

    if (process.platform === 'win32') {
        const pf = process.env.ProgramFiles || 'C:\\Program Files';
        const pfx86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
        pushCandidate(candidates, seen, path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'));
        pushCandidate(candidates, seen, path.join(pfx86, 'Google', 'Chrome', 'Application', 'chrome.exe'));
        pushCandidate(candidates, seen, path.join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
        pushCandidate(candidates, seen, path.join(pfx86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
    }

    for (const candidate of candidates) {
        checked.push(candidate);
        const resolved = path.isAbsolute(candidate)
            ? candidate
            : path.resolve(process.cwd(), candidate);
        if (isUsableWindowsExe(resolved) || (process.platform !== 'win32' && fs.existsSync(resolved))) {
            return { executablePath: resolved, checked };
        }
    }

    const reason =
        process.platform === 'win32'
            ? 'No valid chrome.exe or msedge.exe found. On the API server run: cd server && npx puppeteer browsers install chrome — or set PUPPETEER_EXECUTABLE_PATH in .env to installed Chrome/Edge.'
            : 'Chrome/Chromium executable not found for Puppeteer.';

    return { executablePath: null, checked, reason };
}

module.exports = { resolvePuppeteerChromeExecutable, isUsableWindowsExe };

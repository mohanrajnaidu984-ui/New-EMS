/**
 * Quote email draft: opens Outlook popup when possible (local helper / server COM / .eml shell open).
 * From address = logged-in user; SMTP settings used to verify/build the message.
 */

const LOCAL_OUTLOOK_URLS = [
    'http://127.0.0.1:39281/outlook-draft',
    'http://localhost:39281/outlook-draft',
];
const LOCAL_EML_OPEN_URLS = [
    'http://127.0.0.1:39281/open-eml-draft',
    'http://localhost:39281/open-eml-draft',
];

export const QUOTE_EML_DRAFT_NAME = 'EMS_QuoteDraft.eml';

async function postJson(url, payload, timeoutMs = 120000) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'omit',
            body: JSON.stringify(payload),
            signal: controller.signal,
        });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            return { ok: false, error: data.error || data.details || res.statusText };
        }
        return { ok: true, data: await res.json().catch(() => ({})) };
    } catch (e) {
        return { ok: false, error: e?.message || String(e) };
    } finally {
        window.clearTimeout(timer);
    }
}

export async function fetchQuoteOutlookEmailFields(apiBase, params) {
    try {
        const qs = new URLSearchParams({
            userEmail: params.userEmail || '',
            toName: params.toName || '',
            toAttention: params.toAttention || '',
            requestNo: params.requestNo || '',
            isInternal: params.isInternal ? '1' : '0',
        });
        const res = await fetch(`${apiBase}/api/quotes/outlook-email-fields?${qs}`, {
            credentials: 'include',
        });
        if (!res.ok) return { to: '', cc: '', ccList: [] };
        return await res.json();
    } catch {
        return { to: '', cc: '', ccList: [] };
    }
}

function tryOpenEmlBlobInBrowser(bytes) {
    try {
        const blob = new Blob([bytes], { type: 'message/rfc822' });
        const url = URL.createObjectURL(blob);
        const opened = window.open(url, '_blank');
        window.setTimeout(() => {
            try {
                URL.revokeObjectURL(url);
            } catch {
                /* ignore */
            }
        }, 120000);
        return !!opened;
    } catch {
        return false;
    }
}

/**
 * Open quote email draft in Outlook (popup). Falls back to .eml download only if needed.
 */
export async function openQuoteSmtpDraft({
    apiBase,
    pdfBlob,
    displayFileName,
    userEmail,
    userDisplayName,
    emailFields,
    triggerBlobDownload,
    blobToBase64,
}) {
    const pdfBase64 = await blobToBase64(pdfBlob);
    const payload = {
        userEmail: userEmail || '',
        userDisplayName: userDisplayName || '',
        to: emailFields.to || '',
        cc: emailFields.cc || '',
        bcc: emailFields.bcc || '',
        subject: emailFields.subject || '',
        body: emailFields.body || '',
        attachmentName: displayFileName || 'EMS_QuoteDraft.pdf',
        pdfBase64,
        extraAttachments: emailFields.extraAttachments || [],
    };

    for (const url of LOCAL_OUTLOOK_URLS) {
        const local = await postJson(url, payload, 15000);
        if (local.ok) {
            return { ok: true, method: 'local-outlook', openedInOutlook: true };
        }
    }

    try {
        const res = await fetch(`${apiBase}/api/quotes/outlook-draft`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(payload),
        });
        if (res.ok) {
            return { ok: true, method: 'server-outlook', openedInOutlook: true };
        }
    } catch {
        /* try eml path */
    }

    const res = await fetch(`${apiBase}/api/quotes/smtp-draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...payload, openInOutlook: true }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        return {
            ok: false,
            error: data.error || data.details || res.statusText || String(res.status),
        };
    }

    if (data.openedInOutlook) {
        return {
            ok: true,
            method: data.method || 'shell-eml',
            openedInOutlook: true,
            fileName: data.fileName || QUOTE_EML_DRAFT_NAME,
        };
    }

    const b64 = data.emlBase64;
    if (!b64) {
        return { ok: false, error: 'Server did not return draft content' };
    }

    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

    for (const url of LOCAL_EML_OPEN_URLS) {
        const emlOpen = await postJson(url, { emlBase64: b64, fileName: QUOTE_EML_DRAFT_NAME }, 10000);
        if (emlOpen.ok) {
            return { ok: true, method: 'local-eml', openedInOutlook: true };
        }
    }

    if (tryOpenEmlBlobInBrowser(bytes)) {
        return { ok: true, method: 'browser-eml', openedInOutlook: true };
    }

    triggerBlobDownload(new Blob([bytes], { type: 'message/rfc822' }), QUOTE_EML_DRAFT_NAME);
    return {
        ok: true,
        method: 'eml-download',
        openedInOutlook: false,
        fileName: QUOTE_EML_DRAFT_NAME,
    };
}

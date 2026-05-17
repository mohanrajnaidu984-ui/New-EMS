/**
 * Enquiry emails via Outlook COM (Windows + VBScript).
 * 1) Internal notification — direct send to SEs + CC
 * 2) Customer acknowledgement — draft only when Send acknowledgement mail is checked
 */

const LOCAL_INTERNAL_URLS = [
    'http://127.0.0.1:39281/enquiry-outlook-draft',
    'http://localhost:39281/enquiry-outlook-draft',
];

const LOCAL_CUSTOMER_ACK_URLS = [
    'http://127.0.0.1:39281/enquiry-customer-ack-draft',
    'http://localhost:39281/enquiry-customer-ack-draft',
];

const DRAFT_VBS_NAME = 'EMS_OpenEnquiryDraft.vbs';

async function postJson(url, payload, timeoutMs = 120000) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'omit',
            body: JSON.stringify(payload),
            signal: controller?.signal,
        });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            return { ok: false, error: data.message || data.error || res.statusText };
        }
        return { ok: true, data: await res.json().catch(() => ({})) };
    } catch (e) {
        return { ok: false, error: e?.message || String(e) };
    } finally {
        if (timer) clearTimeout(timer);
    }
}

async function tryUrls(urls, payload, timeoutMs) {
    for (const url of urls) {
        const result = await postJson(url, payload, timeoutMs);
        if (result.ok) return { ok: true, via: 'local-helper', ...result.data };
    }
    return { ok: false };
}

/** Internal enquiry notification — direct send (no draft window). */
export async function sendEnquiryInternalNotification({ apiBase, requestNo, concernedSEs }) {
    const payload = {
        requestNo: String(requestNo || '').trim(),
        concernedSEs: Array.isArray(concernedSEs) ? concernedSEs.filter(Boolean) : [],
    };

    const localTry = await tryUrls(LOCAL_INTERNAL_URLS, payload, 15000);
    if (localTry.ok) return { ok: true, method: 'local-helper', ...localTry };

    const serverTry = await postJson(`${apiBase}/api/enquiries/outlook-draft`, payload, 120000);
    if (serverTry.ok) return { ok: true, method: 'server', ...serverTry.data };

    return { ok: false, error: serverTry.error || 'Could not send internal notification email' };
}

/** Customer acknowledgement — one Outlook draft per customer (Display). */
export async function openCustomerAcknowledgementDraft({
    apiBase,
    requestNo,
    acknowledgementSE,
    createdBy,
    createdByEmail,
    concernedSEs,
    customerAckTargets,
}) {
    const payload = {
        requestNo: String(requestNo || '').trim(),
        acknowledgementSE: String(acknowledgementSE || '').trim(),
        createdBy: String(createdBy || '').trim(),
        createdByEmail: String(createdByEmail || '').trim(),
        concernedSEs: Array.isArray(concernedSEs) ? concernedSEs.filter(Boolean) : [],
        customerAckTargets: Array.isArray(customerAckTargets) ? customerAckTargets : [],
    };

    const localTry = await tryUrls(LOCAL_CUSTOMER_ACK_URLS, payload, 15000);
    if (localTry.ok) return { ok: true, method: 'local-helper', ...localTry };

    const serverTry = await postJson(`${apiBase}/api/enquiries/outlook-customer-ack-draft`, payload, 120000);
    if (serverTry.ok) return { ok: true, method: 'server', ...serverTry.data };

    return { ok: false, error: serverTry.error || 'Could not open customer acknowledgement draft' };
}

/** @deprecated Use sendEnquiryInternalNotification */
export async function openEnquiryOutlookDraft(params) {
    return sendEnquiryInternalNotification(params);
}

export { DRAFT_VBS_NAME };

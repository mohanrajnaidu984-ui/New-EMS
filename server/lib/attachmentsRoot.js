const path = require('path');

/**
 * Shared root for enquiry + quote file storage.
 * ENQUIRY_ATTACHMENTS_ROOT (or EMS_ATTACHMENTS_ROOT) — UNC path when set.
 */
function normalizeEnvRoot() {
    const fromEnv = process.env.ENQUIRY_ATTACHMENTS_ROOT || process.env.EMS_ATTACHMENTS_ROOT;
    if (fromEnv && String(fromEnv).trim()) {
        return path.normalize(String(fromEnv).trim());
    }
    return null;
}

/** Base dir used before per-request subfolders (for mkdir + logs). */
function resolveEnquiryAttachmentsBase() {
    const envRoot = normalizeEnvRoot();
    if (envRoot) return envRoot;
    return path.join(__dirname, '..', 'uploads', 'enquiries');
}

function resolveEnquiryUploadDestination(requestNo) {
    const rawNo = requestNo != null ? String(requestNo) : 'unknown';
    const safeRequestNo = rawNo.replace(/[^a-zA-Z0-9-_]/g, '_') || 'unknown';
    const envRoot = normalizeEnvRoot();
    if (envRoot) return path.join(envRoot, safeRequestNo);
    return path.join(__dirname, '..', 'uploads', 'enquiries', safeRequestNo);
}

function sanitizeFolderName(raw, fallback = 'General') {
    const s = String(raw || '').trim();
    const safe = s.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
    return safe || fallback;
}

function resolveEnquiryAttachmentVisibilityBase(visibility) {
    const v = String(visibility || 'Public').toLowerCase();
    const explicitPublic = process.env.ENQUIRY_ATTACHMENTS_PUBLIC_ROOT;
    const explicitPrivate = process.env.ENQUIRY_ATTACHMENTS_PRIVATE_ROOT;
    if (v === 'private') {
        if (explicitPrivate && String(explicitPrivate).trim()) {
            return path.normalize(String(explicitPrivate).trim());
        }
        return path.normalize('\\\\151.50.20.129\\ems app\\Enquiries\\Private');
    }
    if (explicitPublic && String(explicitPublic).trim()) {
        return path.normalize(String(explicitPublic).trim());
    }
    return path.normalize('\\\\151.50.20.129\\ems app\\Enquiries\\Public');
}

function resolveEnquiryUploadDestinationByVisibility(requestNo, visibility, division) {
    const rawNo = requestNo != null ? String(requestNo) : 'unknown';
    const safeRequestNo = sanitizeFolderName(rawNo, 'unknown');
    const safeDivision = sanitizeFolderName(division, 'General');
    const base = resolveEnquiryAttachmentVisibilityBase(visibility);
    return path.join(base, safeRequestNo, safeDivision);
}

function resolveQuoteUploadDestination(quoteId) {
    const raw = quoteId != null ? String(quoteId) : 'unknown';
    const safeId = raw.replace(/[^a-zA-Z0-9-_]/g, '_') || 'unknown';
    const envRoot = normalizeEnvRoot();
    if (envRoot) {
        return path.join(envRoot, 'quotes', safeId);
    }
    return path.join(__dirname, '..', 'uploads', 'quotes', safeId);
}

module.exports = {
    normalizeEnvRoot,
    resolveEnquiryAttachmentsBase,
    resolveEnquiryUploadDestination,
    resolveEnquiryAttachmentVisibilityBase,
    resolveEnquiryUploadDestinationByVisibility,
    resolveQuoteUploadDestination,
};

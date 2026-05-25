/**
 * Apply PDF security so quote downloads cannot be edited or copied into Word easily.
 * Opens without a password; owner password is required to change restrictions.
 */
const muhammara = require('muhammara');

/** PDF user access: allow printing only (deny modify, copy, annotate, extract, etc.). */
function buildQuotePdfUserProtectionFlag() {
    return 1 << 2; // print
}

function isQuotePdfRestrictEnabled() {
    const raw = String(process.env.QUOTE_PDF_RESTRICT ?? '1').trim().toLowerCase();
    return raw !== '0' && raw !== 'false' && raw !== 'no';
}

/**
 * @param {Buffer} pdfBuffer
 * @returns {Buffer}
 */
function restrictQuotePdfBuffer(pdfBuffer) {
    if (!pdfBuffer || !Buffer.isBuffer(pdfBuffer) || pdfBuffer.length < 5) {
        throw new Error('Invalid PDF buffer');
    }

    const inStream = new muhammara.PDFRStreamForBuffer(pdfBuffer);
    const outStream = new muhammara.PDFWStreamForBuffer();

    const ownerPassword =
        String(process.env.QUOTE_PDF_OWNER_PASSWORD || '').trim() ||
        'EMS-Quote-Owner-Do-Not-Share';

    muhammara.recrypt(inStream, outStream, {
        userPassword: '',
        ownerPassword,
        userProtectionFlag: buildQuotePdfUserProtectionFlag(),
    });

    const restricted = outStream.buffer;
    if (!restricted || !Buffer.isBuffer(restricted) || restricted.length < 5) {
        throw new Error('PDF restriction produced empty output');
    }
    return restricted;
}

/**
 * @param {Buffer} pdfBuffer
 * @returns {Promise<Buffer>}
 */
async function applyQuotePdfRestrictions(pdfBuffer) {
    if (!isQuotePdfRestrictEnabled()) {
        return pdfBuffer;
    }
    try {
        return restrictQuotePdfBuffer(pdfBuffer);
    } catch (err) {
        console.error('[quote-pdf] restrict failed:', err && err.message ? err.message : err);
        throw new Error(
            'Could not apply PDF protection. Set QUOTE_PDF_RESTRICT=0 to allow unrestricted PDFs, or fix muhammara on the server.'
        );
    }
}

module.exports = {
    applyQuotePdfRestrictions,
    restrictQuotePdfBuffer,
    isQuotePdfRestrictEnabled,
    buildQuotePdfUserProtectionFlag,
};

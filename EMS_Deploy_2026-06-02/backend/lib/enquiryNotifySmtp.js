const { buildSmtpTransport, stripQuotes } = require('./smtpTransport');

function splitRecipients(value) {
    return String(value || '')
        .split(/[;,]/)
        .map((s) => s.trim())
        .filter(Boolean);
}

/**
 * Send internal enquiry notification via SMTP (Office 365).
 * Used when Outlook COM/VBScript is unavailable (e.g. IIS app pool).
 */
async function sendEnquiryNotificationViaSmtp({ to, cc, subject, html, replyTo, fromEmail, fromDisplayName }) {
    const toList = splitRecipients(to);
    const ccList = splitRecipients(cc);
    if (!toList.length) {
        throw new Error('No To recipients for enquiry notification');
    }

    const from = fromEmail
        ? fromEmail
        : (stripQuotes(process.env.SMTP_USER) || 'ems@almoayyedcg.com');
    const transporter = buildSmtpTransport();

    const replyToList = splitRecipients(replyTo);
    await transporter.sendMail({
        from,
        to: toList,
        cc: ccList.length ? ccList : undefined,
        replyTo: replyToList.length ? replyToList : undefined,
        subject: String(subject || 'Enquiry notification'),
        html: String(html || ''),
    });

    return { from, to: toList.join('; '), cc: ccList.join('; ') };
}

module.exports = { sendEnquiryNotificationViaSmtp, splitRecipients };

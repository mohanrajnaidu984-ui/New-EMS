/**
 * Parse Tesseract OCR text from business cards / signatures into contact fields.
 * Tuned for: personal vs company email/phone, Tel vs Fax vs Mobile, pipe-delimited footers.
 */

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;

const COMPANY_HINTS =
    /\b(ltd|limited|w\.?\s*l\.?\s*l\.?|llc|inc|plc|group|contracting|construction|development|trading|services|solutions|technologies|engineering|company|bank|authority|agency|commission)\b/i;

const ADDRESS_HINTS =
    /\b(p\.?\s*o\.?\s*box|p\.?\s*o\s*b|post\s*box|manama|bahrain|kingdom|kindg|kingd|block|road|r\.d|avenue|ave\.?|street|st\.?|building|tower|floor|flat|suite|plot|way|area|zone|diplomatic|seef|juffair|mahooz|diplomatic\s+area)\b/i;

/** Org unit lines (not job titles like "… - Procurement"). */
const DEPT_ORG_LINE = /\b(directorate|department|division|business\s+unit)\b/i;

const GENERIC_EMAIL_FIRST = /^(info|sales|contact|admin|office|hr|noreply|enquir|enquiry|enquiries|marketing|support|media|general|projects|help|service)\b/i;

function normalizeSpaces(s) {
    return String(s).replace(/\s+/g, ' ').trim();
}

/** Fix common OCR breaks in email-like fragments before extraction. */
function repairTextForEmailScan(text) {
    let t = String(text || '');
    // Whole local-part before @ (do not use (\S)+@ — it strips the last letter of the name).
    t = t.replace(/\b([a-z0-9._%+-]{2,})\s+@\s*/gi, '$1@');
    t = t.replace(/@\s+([a-z0-9._-])/gi, '@$1');
    // Glue "@domain .tld" only (do not merge "@domain.com" + "Al" from the next word).
    t = t.replace(/(@[a-z0-9._+-]+)\s+(\.\s*[a-z]{2,6})\b/gi, '$1$2');
    // Common gov / country TLD splits: "cbb gov bh", "domain com sa"
    t = t.replace(
        /(@[a-z0-9._+-]+)\s+(gov|com|org|net|edu)\s+([a-z]{2})\b/gi,
        (_, a, b, c) => `${a}.${b}.${c}`
    );
    t = t.replace(/\b([a-z0-9._%+-]{2,})\s+@\s*(\w+)\s+gov\s+([a-z]{2})\b/gi, '$1@$2.gov.$3');
    // "user @ cbb . gov . bh" → user@cbb.gov.bh
    t = t.replace(
        /\b([a-z0-9._%+-]{2,})\s+@\s*([a-z0-9-]+(?:\s*\.\s*[a-z0-9-]+)*)\s*\.\s*([a-z]{2})\b/gi,
        (_, u, dom, tld) => `${u}@${dom.replace(/\s*\.\s*/g, '.')}.${tld}`
    );
    // "user@cbb.gov . bh" → user@cbb.gov.bh (OCR gap before final ccTLD)
    t = t.replace(/(@[a-z0-9._+-]+(?:\.[a-z0-9-]+)+)\s+\.\s*([a-z]{2})\b/gi, '$1.$2');
    // "user@cbb. gov . bh" → user@cbb.gov.bh (repeat for chained splits)
    let prev;
    do {
        prev = t;
        t = t.replace(
            /\b([a-z0-9._%+-]+@[a-z0-9._+-]+)\.(\s+)([a-z0-9-]+)\s+\.\s*([a-z]{2})\b/gi,
            '$1.$3.$4'
        );
    } while (t !== prev);
    return t;
}

/** e.g. "user @ agency gov bh" from noisy OCR */
function recoverEmailsFromLoosePatterns(text) {
    const found = [];
    const seen = new Set();
    const blob = String(text || '');
    const gov = /\b([a-z0-9._%+-]{2,})\s*@\s*([a-z0-9-]+)\s+gov\s+([a-z]{2})\b/gi;
    let m;
    while ((m = gov.exec(blob)) !== null) {
        const e = `${m[1]}@${m[2]}.gov.${m[3]}`;
        const k = e.toLowerCase();
        if (!seen.has(k)) {
            seen.add(k);
            found.push(e);
        }
    }
    return found;
}

/** Last-resort: any +973 / 973 … block not on a fax line */
function extractBahrainPhoneFromText(text, faxDigits) {
    const blob = String(text || '').replace(/\s+/g, ' ');
    const re = /(?:\+|00\s*)?973[\s.\-]?\d(?:[\d\s().-]{6,}\d)/g;
    let best = '';
    let bestLen = 0;
    let m;
    while ((m = re.exec(blob)) !== null) {
        let s = normalizeSpaces(m[0].replace(/^00\s*/, '+'));
        const d = s.replace(/\D/g, '');
        if (d.length < 10 || d.length > 13) continue;
        if (faxDigits && d === faxDigits) continue;
        if (d.length >= bestLen) {
            bestLen = d.length;
            best = d.startsWith('973') ? `+${d}` : s.startsWith('+') ? s : `+${d}`;
        }
    }
    return normalizeSpaces(best);
}

function uniqueEmailsInOrder(text) {
    const seen = new Set();
    const out = [];
    let m;
    const re = new RegExp(EMAIL_RE.source, 'gi');
    while ((m = re.exec(text)) !== null) {
        const e = m[0];
        const key = e.toLowerCase();
        if (!seen.has(key)) {
            seen.add(key);
            out.push(e);
        }
    }
    return out;
}

function isGenericEmail(email) {
    const local = email.split('@')[0] || '';
    const firstToken = local.split('.')[0] || '';
    return GENERIC_EMAIL_FIRST.test(firstToken + 'x') || GENERIC_EMAIL_FIRST.test(local);
}

function pickContactEmail(emails, lines) {
    if (!emails.length) return '';

    for (const line of lines) {
        const lower = line.toLowerCase();
        if (lower.includes('www.') && !line.includes('@')) continue;
        const onLine = emails.filter((e) => line.toLowerCase().includes(e.toLowerCase()));
        const personalOnLine = onLine.filter((e) => !isGenericEmail(e));
        if (personalOnLine.length && /\d/.test(line)) {
            return personalOnLine[0];
        }
        if (personalOnLine.length && !COMPANY_HINTS.test(line)) {
            return personalOnLine[0];
        }
    }

    const nonGeneric = emails.filter((e) => !isGenericEmail(e));
    if (nonGeneric.length) return nonGeneric[0];

    return emails[0];
}

function digitsComparable(s) {
    return (s || '').replace(/\D/g, '');
}

/** Prefer +973 … display (Bahrain mobile/landline). */
function normalizeIntlPhone(s) {
    if (!s || !String(s).trim()) return '';
    const d = String(s).replace(/\D/g, '');
    if (d.length < 8 || d.length > 15) return normalizeSpaces(s);
    if (d.startsWith('00')) return normalizeIntlPhone(`+${d.slice(2)}`);
    if (d.startsWith('973') && d.length === 11) {
        return `+973 ${d.slice(3, 7)} ${d.slice(7)}`;
    }
    if (d.startsWith('973')) return normalizeSpaces(`+${d}`);
    if (String(s).trim().startsWith('+')) return normalizeSpaces(s);
    return normalizeSpaces(`+${d}`);
}

function firstEmailOnLine(line) {
    const m = line.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i);
    return m ? m[0] : '';
}

function extractLabeledPhones(lines) {
    let mobile = '';
    let phone = '';
    let fax = '';

    for (const line of lines) {
        const lower = line.toLowerCase();

        const faxM = line.match(/\bfax[.\s:]*([+]?\d[\d\s().-]{6,})/i);
        if (faxM && !fax) fax = normalizeSpaces(faxM[1]);

        const mobM = line.match(/\b(?:mobile|mob(?!ile)|cell|cellular|gsm|m\/s|whatsapp)[.\s:]*([+]?\d[\d\s().-]{6,})/i);
        if (mobM && !mobile) mobile = normalizeSpaces(mobM[1]);

        // "T +973 …", "T 973 …" (OCR drops '+'), "I/l/1/| +973" (T misread)
        const tStrict = line.match(/(?:^|[\s,;|/])T(?![a-z]{2})\s*(\+?\d[\d\s().-]{6,}\d)/i);
        if (tStrict && !phone) {
            const raw = normalizeSpaces(tStrict[1]);
            const d = raw.replace(/\D/g, '');
            if (d.length >= 9)
                phone = raw.startsWith('+') ? raw : `+${d}`;
        }
        if (!phone) {
            const tLoose = line.match(
                /(?:^|[\s,;|/])[TIl1|]\s*((?:\+|00\s*)?9(?:73|71|70)\s*[\d\s().-]{5,}\d)/i
            );
            if (tLoose) {
                const d = tLoose[1].replace(/\D/g, '');
                if (d.length >= 9 && d.length <= 13) phone = normalizeSpaces(`+${d}`);
            }
        }

        const telM = line.match(
            /\b(?:tel|telephone|phone|direct|t\.|p\.?t\.?|switch\s*board)[.\s:]*([+]?\d[\d\s().-]{6,})/i
        );
        if (telM && !lower.includes('mobile') && !phone) phone = normalizeSpaces(telM[1]);
    }

    return { mobile, phone, fax };
}

function numbersOnLine(line) {
    const stripped = line
        .replace(/(?:^|[\s,;|/])(?:T|I|l|\|)\s+(?=[+\d])/i, ' ')
        .replace(/(?:^|[\s,;|/])T\s+(?=[+\d])/i, ' ');
    const out = [];
    const matches = stripped.matchAll(/\+?\d[\d\s().-]{6,}\d/g);
    for (const m of matches) {
        const n = normalizeSpaces(m[0]);
        const digits = n.replace(/\D/g, '');
        if (digits.length >= 7 && digits.length <= 16) out.push(n);
    }
    return out;
}

function splitNameAndDesignation(line) {
    const plain = normalizeSpaces(line);
    const tail = plain.match(
        /\s+((?:Senior|Junior|Chief|Deputy|Assistant|Lead|Principal|Acting)\s+)*(?:(?:Mechanical|Electrical|Civil|Structural|Software|Project|Site|Sales|Marketing|Technical|IT|HR|General|Financial|Legal|Operations|Business)\s+)?(Engineer|Manager|Director|Consultant|Executive|Specialist|Coordinator|Supervisor|Technician|Partner|Associate|Architect|President|Officer|Head|Analyst|Developer|Designer|Representative)\s*$/i
    );
    if (tail && tail.index > 1) {
        return {
            name: plain.slice(0, tail.index).trim(),
            designation: plain.slice(tail.index).trim()
        };
    }
    return { name: plain, designation: '' };
}

function lineLooksLikeCompany(line) {
    const lower = line.toLowerCase();
    if (lower.includes('@')) return false;
    return COMPANY_HINTS.test(line) && line.length > 8;
}

function pickCompanyName(lines, usedLines) {
    let best = '';
    for (const line of lines) {
        if (usedLines.has(line)) continue;
        if (!lineLooksLikeCompany(line)) continue;
        if (ADDRESS_HINTS.test(line) && !COMPANY_HINTS.test(line)) continue;
        if (line.length > best.length) best = line;
    }
    return best;
}

function pickAddress(lines, usedLines) {
    let best = '';
    for (const line of lines) {
        if (usedLines.has(line)) continue;
        if (!ADDRESS_HINTS.test(line)) continue;
        if (lineLooksLikeCompany(line) && /w\.?\s*l\.?\s*l/i.test(line)) continue;
        if (line.length < 12) continue;
        if (line.length > best.length) best = line;
    }
    return best;
}

function parseContactCardFromOcrText(rawText) {
    const text = repairTextForEmailScan(rawText || '');
    const processed = text.replace(/\|/g, '\n');
    const lines = processed
        .split(/\n/)
        .map((l) => normalizeSpaces(l))
        .filter((l) => l.length > 0);

    let emails = uniqueEmailsInOrder(text);
    for (const e of recoverEmailsFromLoosePatterns(text)) {
        if (!emails.some((x) => x.toLowerCase() === e.toLowerCase())) emails.push(e);
    }
    let emailId = pickContactEmail(emails, lines);

    let { mobile, phone, fax } = extractLabeledPhones(lines);

    const usedLines = new Set();

    if (emailId) {
        for (const line of lines) {
            if (!line.toLowerCase().includes(emailId.toLowerCase())) continue;
            if (/\bfax\b/i.test(line) || /\b(?:tel|telephone)\b/i.test(line)) continue;
            // "T +973 … user@…" is usually desk phone; number is captured as Phone, not Mobile1.
            if (/(?:^|[\s,;|/])[TIl1|]\s*\+/i.test(line)) continue;
            const nums = numbersOnLine(line);
            const personal = nums.find((n) => {
                const d = n.replace(/\D/g, '');
                return d.length >= 8 && d.length <= 15;
            });
            if (personal && !mobile) {
                mobile = personal;
                usedLines.add(line);
                break;
            }
        }
    }

    if (!mobile) {
        for (const line of lines) {
            const lower = line.toLowerCase();
            const em = firstEmailOnLine(line);
            if (lower.includes('@') && em && !isGenericEmail(em)) {
                if (/(?:^|[\s,;|/])[TIl1|]\s*\+/i.test(line)) continue;
                const nums = numbersOnLine(line);
                const pick = nums.find((n) => !phone || digitsComparable(n) !== digitsComparable(phone));
                if (pick) {
                    mobile = pick;
                    break;
                }
            }
        }
    }

    if (!mobile) {
        for (const line of lines) {
            const lower = line.toLowerCase();
            if (lower.startsWith('+') || /^\+?\d[\d\s-]{8,}$/.test(line)) {
                if (/\bfax\b/i.test(lower) || /\b(?:tel|telephone)\b/i.test(lower)) continue;
                const m = line.match(/(\+?\d[\d\s().-]{8,})/);
                if (m) {
                    mobile = normalizeSpaces(m[1]);
                    break;
                }
            }
        }
    }

    let name = '';
    let designation = '';

    const skipNameLine = (lower) =>
        ['regards', 'best regards', 'sincerely', 'thanks', 'thank you'].some((sw) => lower.includes(sw));

    for (const line of lines) {
        const lower = line.toLowerCase();
        if (skipNameLine(lower)) continue;
        if (line.includes('@')) continue;
        if (/^https?:\/\//i.test(line) || lower.includes('www.')) continue;
        if (ADDRESS_HINTS.test(line) && line.split(/\s+/).length > 6) continue;
        if (lineLooksLikeCompany(line) && line.split(/\s+/).length > 4) continue;

        const alphaTokens = line.replace(/[^a-zA-Z\s]/g, ' ').trim().split(/\s+/).filter(Boolean);
        if (alphaTokens.length < 2) continue;

        const { name: n, designation: d } = splitNameAndDesignation(line);
        if (n.length >= 3 && /^[a-zA-Z\s.'-]+$/i.test(n.replace(/\s+/g, ' '))) {
            name = n;
            designation = d;
            usedLines.add(line);
            break;
        }
    }

    if (!designation) {
        const desigKeywords =
            /\b(manager|engineer|director|consultant|executive|officer|head|lead|specialist|technician|supervisor|coordinator|president|partner)\b/i;
        for (const line of lines) {
            if (line === name) continue;
            if (desigKeywords.test(line) && !line.includes('@') && line.length < 80) {
                designation = line;
                break;
            }
        }
    }

    const company = pickCompanyName(lines, usedLines);
    if (company) usedLines.add(company);

    let address1 = pickAddress(lines, usedLines);

    if (!address1) {
        for (const line of lines) {
            if (line.includes('@')) continue;
            if (line === name || line === company) continue;
            if (ADDRESS_HINTS.test(line)) {
                address1 = line;
                break;
            }
        }
    }

    let address2 = '';
    for (const line of lines) {
        if (usedLines.has(line)) continue;
        if (line.includes('@') || /https?:\/\//i.test(line) || /www\./i.test(line.toLowerCase())) continue;
        if (!DEPT_ORG_LINE.test(line) || line.length < 10 || line.length > 200) continue;
        if (lineLooksLikeCompany(line) && !DEPT_ORG_LINE.test(line)) continue;
        address2 = line;
        usedLines.add(line);
        if (!address1) {
            address1 = company ? `${line}, ${company}` : line;
        }
        break;
    }

    if (fax && mobile && digitsComparable(fax) === digitsComparable(mobile)) {
        fax = '';
    }

    if (!mobile && phone) {
        mobile = phone;
    }

    const faxDigits = fax ? digitsComparable(fax) : '';
    if (!phone && !mobile) {
        const bh = extractBahrainPhoneFromText(text, faxDigits);
        if (bh) {
            phone = bh;
            mobile = bh;
        }
    }

    if (!emailId) {
        const again = uniqueEmailsInOrder(repairTextForEmailScan(text.replace(/\r\n/g, '\n')));
        for (const e of again) {
            if (!emails.some((x) => x.toLowerCase() === e.toLowerCase())) emails.push(e);
        }
        for (const e of recoverEmailsFromLoosePatterns(text)) {
            if (!emails.some((x) => x.toLowerCase() === e.toLowerCase())) emails.push(e);
        }
        emailId = pickContactEmail(emails, lines);
    }

    mobile = normalizeIntlPhone(mobile);
    phone = normalizeIntlPhone(phone);
    fax = fax ? normalizeIntlPhone(fax) : '';

    return {
        ContactName: name,
        CompanyName: company,
        Mobile1: mobile,
        Phone: phone,
        FaxNo: fax,
        EmailId: emailId,
        Designation: designation,
        Address1: address1,
        Address2: address2
    };
}

module.exports = { parseContactCardFromOcrText };

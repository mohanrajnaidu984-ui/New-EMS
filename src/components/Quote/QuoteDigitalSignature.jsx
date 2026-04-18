import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PenLine, Upload, Trash2, X, GripHorizontal } from 'lucide-react';

/** Dispatched when placing from profile modal on Quote tab (QuoteForm listens). */
export const EMS_QUOTE_PLACE_STAMP_EVENT = 'ems-quote-place-digital-stamp';

export const SIG_LIB_STORAGE_PREFIX = 'ems_quote_sig_library_v1:';

const DEFAULT_SIG_ID_KEY = 'ems_quote_default_sig_id_v1:';

export function loadDefaultSignatureId(email) {
    if (!email) return null;
    try {
        return localStorage.getItem(DEFAULT_SIG_ID_KEY + String(email).toLowerCase()) || null;
    } catch {
        return null;
    }
}

export function saveDefaultSignatureId(email, signatureId) {
    if (!email) return;
    try {
        const k = DEFAULT_SIG_ID_KEY + String(email).toLowerCase();
        if (!signatureId) localStorage.removeItem(k);
        else localStorage.setItem(k, String(signatureId));
    } catch (e) {
        console.warn('[SignatureVault] save default id failed', e);
    }
}

export function resolveDefaultSignatureImage(email) {
    const id = loadDefaultSignatureId(email);
    if (!id) return null;
    const lib = loadSignatureLibrary(email);
    const hit = lib.find((x) => x.id === id);
    return hit?.imageDataUrl || null;
}

export function loadSignatureLibrary(email) {
    if (!email) return [];
    try {
        const raw = localStorage.getItem(SIG_LIB_STORAGE_PREFIX + String(email).toLowerCase());
        if (!raw) return [];
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr : [];
    } catch {
        return [];
    }
}

export function saveSignatureLibrary(email, items) {
    if (!email) return;
    try {
        localStorage.setItem(SIG_LIB_STORAGE_PREFIX + String(email).toLowerCase(), JSON.stringify(items.slice(0, 12)));
    } catch (e) {
        console.warn('[SignatureVault] save library failed', e);
    }
}

/** Safe segment for localStorage key (enquiry no + lead context + customer). */
function stampScopeSegment(s) {
    return String(s || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/[^a-z0-9._-]+/g, '_')
        .slice(0, 120) || '_';
}

/**
 * Scoped stamp blob: same enquiry but different lead job / customer → different key
 * so placed signatures do not leak across quote contexts.
 */
export function stampStorageKey(requestNo, leadJobKey = '', customerToName = '') {
    const r = stampScopeSegment(requestNo || 'draft');
    return `ems_quote_digistamps_v2:${r}:${stampScopeSegment(leadJobKey)}:${stampScopeSegment(customerToName)}`;
}

export function loadStampsForEnquiry(requestNo, leadJobKey = '', customerToName = '') {
    if (!requestNo) return [];
    try {
        const raw = localStorage.getItem(stampStorageKey(requestNo, leadJobKey, customerToName));
        if (!raw) return [];
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr : [];
    } catch {
        return [];
    }
}

export function saveStampsForEnquiry(requestNo, stamps, leadJobKey = '', customerToName = '') {
    if (!requestNo) return;
    try {
        localStorage.setItem(stampStorageKey(requestNo, leadJobKey, customerToName), JSON.stringify(stamps));
    } catch (e) {
        console.warn('[SignatureVault] save stamps failed', e);
    }
}

/** Short deterministic-looking token for display (not cryptographic proof). */
export function makeVerificationCode(userEmail, isoNow) {
    const s = `${userEmail || ''}|${isoNow}|${Math.random().toString(36).slice(2, 11)}`;
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = Math.imul(31, h) + s.charCodeAt(i) | 0;
    }
    const part = (h >>> 0).toString(16).toUpperCase().padStart(8, '0').slice(0, 8);
    const d = (isoNow || '').slice(0, 10).replace(/-/g, '');
    return `EMS-${part}-${d}`;
}

/** Physical canvas pixels (saved PNG resolution; scales to modal width on screen). */
const CANVAS_W = 1440;
const CANVAS_H = 480;

/**
 * Draw / upload / delete saved signatures.
 * When placementEnabled and onPlaceStamp are set (quote pen tool), library rows include Place on page.
 * Profile “Manage signatures” uses placementEnabled=false — place from the user menu dropdown instead.
 */
export function SignatureVaultModal({
    open,
    onClose,
    userEmail,
    totalSheets = 1,
    placementEnabled = true,
    onPlaceStamp,
    displayName,
    designation,
}) {
    const canvasRef = useRef(null);
    const drawing = useRef(false);
    const [library, setLibrary] = useState([]);
    const [newLabel, setNewLabel] = useState('');
    const [pageIndex, setPageIndex] = useState(0);
    const [defaultSigId, setDefaultSigId] = useState(null);
    const fileRef = useRef(null);

    useEffect(() => {
        if (!open || !userEmail) return;
        setLibrary(loadSignatureLibrary(userEmail));
        setDefaultSigId(loadDefaultSignatureId(userEmail));
        setPageIndex(0);
        setNewLabel('');
        const c = canvasRef.current;
        if (c) {
            const ctx = c.getContext('2d', { alpha: true });
            ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
            ctx.strokeStyle = '#0f172a';
            ctx.lineWidth = 3;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
        }
    }, [open, userEmail]);

    const persistLibrary = useCallback(
        (next) => {
            setLibrary(next);
            saveSignatureLibrary(userEmail, next);
        },
        [userEmail]
    );

    const getCtx = () => {
        const c = canvasRef.current;
        if (!c) return null;
        const ctx = c.getContext('2d', { alpha: true });
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        return ctx;
    };

    const pos = (e) => {
        const c = canvasRef.current;
        const r = c.getBoundingClientRect();
        const scaleX = c.width / r.width;
        const scaleY = c.height / r.height;
        return {
            x: (e.clientX - r.left) * scaleX,
            y: (e.clientY - r.top) * scaleY,
        };
    };

    const clearCanvas = () => {
        const c = canvasRef.current;
        if (!c) return;
        const ctx = c.getContext('2d', { alpha: true });
        ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    };

    const saveCanvasToLibrary = () => {
        const c = canvasRef.current;
        if (!c) return;
        const dataUrl = c.toDataURL('image/png');
        if (!dataUrl || dataUrl.length < 200) return;
        const id = globalThis.crypto?.randomUUID?.() || `sig-${Date.now()}`;
        const label = (newLabel || `Signature ${library.length + 1}`).trim();
        persistLibrary([...library, { id, label, imageDataUrl: dataUrl, createdAt: new Date().toISOString() }]);
        setNewLabel('');
        clearCanvas();
    };

    const onFile = (e) => {
        const f = e.target.files?.[0];
        if (!f || !f.type.startsWith('image/')) return;
        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.onload = () => {
                const c = document.createElement('canvas');
                c.width = CANVAS_W;
                c.height = CANVAS_H;
                const ctx = c.getContext('2d', { alpha: true });
                ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
                const scale = Math.min(CANVAS_W / img.width, CANVAS_H / img.height, 1);
                const w = img.width * scale;
                const h = img.height * scale;
                const x = (CANVAS_W - w) / 2;
                const y = (CANVAS_H - h) / 2;
                ctx.drawImage(img, x, y, w, h);
                const dataUrl = c.toDataURL('image/png');
                const id = globalThis.crypto?.randomUUID?.() || `sig-${Date.now()}`;
                const label = (newLabel || f.name.replace(/\.[^.]+$/, '') || 'Uploaded').trim();
                persistLibrary([...library, { id, label, imageDataUrl: dataUrl, createdAt: new Date().toISOString() }]);
                setNewLabel('');
            };
            img.src = reader.result;
        };
        reader.readAsDataURL(f);
        e.target.value = '';
    };

    const removeFromLibrary = (id) => {
        persistLibrary(library.filter((x) => x.id !== id));
        const cur = loadDefaultSignatureId(userEmail);
        if (cur === id) {
            saveDefaultSignatureId(userEmail, null);
            setDefaultSigId(null);
        }
    };

    if (!open) return null;

    const pages = Math.max(1, totalSheets | 0);

    /** Portal to body so `position:fixed` is viewport-centered (avoids transformed ancestors e.g. header profile scale). */
    const portalTarget = typeof document !== 'undefined' ? document.body : null;
    if (!portalTarget) return null;

    return createPortal(
        <div
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(15,23,42,0.45)',
                zIndex: 100500,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '24px',
                boxSizing: 'border-box',
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="sig-vault-title"
        >
            <div
                style={{
                    background: '#fff',
                    borderRadius: '12px',
                    maxWidth: 'min(96vw, 1520px)',
                    width: '100%',
                    maxHeight: '92vh',
                    overflow: 'auto',
                    boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
                    border: '1px solid #e2e8f0',
                    margin: 'auto',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid #e2e8f0' }}>
                    <h2 id="sig-vault-title" style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <PenLine size={20} /> Digital signatures
                    </h2>
                    <button type="button" onClick={onClose} style={{ border: 'none', background: '#f1f5f9', borderRadius: '8px', padding: '6px', cursor: 'pointer' }} aria-label="Close">
                        <X size={18} />
                    </button>
                </div>

                <div style={{ padding: '16px', fontSize: '13px', color: '#64748b', lineHeight: 1.5 }}>
                    {placementEnabled ? (
                        <>
                            Draw or upload, then <strong>Save to library</strong>. In <strong>Your library</strong> below: pick the <strong>Page</strong>, then{' '}
                            <strong>Place on page</strong> — the stamp appears on the quote preview. <strong>Drag anywhere on the stamp</strong> (not ×) to
                            move it. You can also <strong>Place on page</strong> from your profile menu (Quote tab) without opening this window.
                        </>
                    ) : (
                        <>
                            Draw or upload, then <strong>Save to library</strong>. Use <strong>Set as default</strong> on a row so it is pre-selected in your
                            profile menu. On the <strong>Quote</strong> tab, open your profile — pick signature, page, and <strong>Place on page</strong> there, or use the{' '}
                            <strong>pen</strong> icon next to Print on the quote screen.
                        </>
                    )}
                </div>

                <div style={{ padding: '0 16px 16px' }}>
                    <div style={{ marginBottom: '8px', fontWeight: '600', color: '#334155' }}>Draw</div>
                    <canvas
                        ref={canvasRef}
                        width={CANVAS_W}
                        height={CANVAS_H}
                        style={{
                            width: '100%',
                            maxWidth: '100%',
                            height: 'auto',
                            border: '1px solid #cbd5e1',
                            borderRadius: '8px',
                            touchAction: 'none',
                            cursor: 'crosshair',
                            display: 'block',
                            backgroundColor: '#f1f5f9',
                        }}
                        onPointerDown={(e) => {
                            e.currentTarget.setPointerCapture(e.pointerId);
                            drawing.current = true;
                            const ctx = getCtx();
                            if (!ctx) return;
                            const p = pos(e);
                            ctx.beginPath();
                            ctx.moveTo(p.x, p.y);
                        }}
                        onPointerMove={(e) => {
                            if (!drawing.current) return;
                            const ctx = getCtx();
                            if (!ctx) return;
                            const p = pos(e);
                            ctx.lineTo(p.x, p.y);
                            ctx.stroke();
                        }}
                        onPointerUp={(e) => {
                            drawing.current = false;
                            try {
                                e.currentTarget.releasePointerCapture(e.pointerId);
                            } catch {
                                /* ignore */
                            }
                        }}
                        onPointerLeave={() => {
                            drawing.current = false;
                        }}
                    />
                    <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <input
                            type="text"
                            value={newLabel}
                            onChange={(e) => setNewLabel(e.target.value)}
                            placeholder="Label (optional)"
                            style={{ flex: '1 1 140px', minWidth: '120px', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px' }}
                        />
                        <button type="button" onClick={clearCanvas} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontSize: '13px' }}>
                            Clear pad
                        </button>
                        <button type="button" onClick={saveCanvasToLibrary} style={{ padding: '8px 12px', borderRadius: '6px', border: 'none', background: '#1e293b', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
                            Save to library
                        </button>
                    </div>

                    <div style={{ marginTop: '20px', marginBottom: '8px', fontWeight: '600', color: '#334155', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Upload size={16} /> Upload image
                    </div>
                    <button type="button" onClick={() => fileRef.current?.click()} style={{ padding: '8px 14px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#f8fafc', cursor: 'pointer', fontSize: '13px' }}>
                        Choose file…
                    </button>
                    <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }} onChange={onFile} />

                    <div style={{ marginTop: '22px', marginBottom: '8px', fontWeight: '600', color: '#334155' }}>Your library</div>
                    {library.length === 0 ? (
                        <div style={{ color: '#94a3b8', fontSize: '13px', padding: '12px', background: '#f8fafc', borderRadius: '8px' }}>No signatures yet.</div>
                    ) : (
                        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {library.map((item) => (
                                <li
                                    key={item.id}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '12px',
                                        padding: '10px',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: '8px',
                                        background: '#fafafa',
                                    }}
                                >
                                    <img src={item.imageDataUrl} alt="" style={{ width: '96px', height: '40px', objectFit: 'contain', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '4px' }} />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: '600', color: '#0f172a', fontSize: '13px' }}>{item.label}</div>
                                        <div style={{ fontSize: '11px', color: '#94a3b8' }}>{item.createdAt?.slice(0, 10)}</div>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'stretch' }}>
                                        {placementEnabled && typeof onPlaceStamp === 'function' ? (
                                            <>
                                                <label style={{ fontSize: '11px', color: '#64748b' }}>
                                                    Page
                                                    <select
                                                        value={pageIndex}
                                                        onChange={(e) => setPageIndex(Number(e.target.value))}
                                                        style={{ marginLeft: '6px', padding: '4px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px' }}
                                                    >
                                                        {Array.from({ length: pages }, (_, i) => (
                                                            <option key={i} value={i}>
                                                                {i + 1}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </label>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        onPlaceStamp({
                                                            imageDataUrl: item.imageDataUrl,
                                                            sheetIndex: pageIndex,
                                                            displayName: displayName ?? '',
                                                            designation: designation ?? '',
                                                        });
                                                        onClose();
                                                    }}
                                                    style={{ padding: '6px 10px', fontSize: '12px', fontWeight: '600', border: 'none', borderRadius: '6px', background: '#0284c7', color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap' }}
                                                >
                                                    Place on page
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        saveDefaultSignatureId(userEmail, item.id);
                                                        setDefaultSigId(item.id);
                                                    }}
                                                    style={{
                                                        padding: '6px 10px',
                                                        fontSize: '12px',
                                                        fontWeight: '600',
                                                        border: defaultSigId === item.id ? '2px solid #0284c7' : '1px solid #cbd5e1',
                                                        borderRadius: '6px',
                                                        background: defaultSigId === item.id ? '#e0f2fe' : '#fff',
                                                        color: '#0f172a',
                                                        cursor: 'pointer',
                                                        whiteSpace: 'nowrap',
                                                    }}
                                                >
                                                    {defaultSigId === item.id ? 'Default ✓' : 'Set as default'}
                                                </button>
                                                {defaultSigId === item.id ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            saveDefaultSignatureId(userEmail, null);
                                                            setDefaultSigId(null);
                                                        }}
                                                        style={{ padding: '4px 8px', fontSize: '11px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#f8fafc', cursor: 'pointer' }}
                                                    >
                                                        Clear default
                                                    </button>
                                                ) : null}
                                            </>
                                        )}
                                        <button type="button" onClick={() => removeFromLibrary(item.id)} style={{ padding: '4px', border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Remove from library">
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </div>,
        portalTarget
    );
}

function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
}

/**
 * Draggable stamp: signature image left; name, designation, date/time, code on the right (compact).
 * No card border on screen/print. Remove (×) only when allowRemove is true (draft quote).
 */
export function QuoteSignatureStamp({ stamp, onRemove, onMove, allowRemove = true }) {
    const rootRef = useRef(null);
    const drag = useRef(null);

    const onPointerDown = (e) => {
        if (e.target.closest('button')) return;
        e.preventDefault();
        e.stopPropagation();
        const el = rootRef.current;
        const sheet = el?.closest('.quote-a4-sheet');
        if (!el || !sheet) return;
        const rect = sheet.getBoundingClientRect();
        drag.current = {
            startX: e.clientX,
            startY: e.clientY,
            startXPct: stamp.xPct,
            startYPct: stamp.yPct,
            rectW: rect.width || 1,
            rectH: rect.height || 1,
        };
    };

    useEffect(() => {
        const onPointerMove = (e) => {
            const d = drag.current;
            if (!d) return;
            const dxp = ((e.clientX - d.startX) / d.rectW) * 100;
            const dyp = ((e.clientY - d.startY) / d.rectH) * 100;
            const xPct = clamp(d.startXPct + dxp, 4, 96);
            const yPct = clamp(d.startYPct + dyp, 4, 96);
            onMove(stamp.id, xPct, yPct);
        };
        const onPointerUp = () => {
            drag.current = null;
        };
        document.addEventListener('pointermove', onPointerMove);
        document.addEventListener('pointerup', onPointerUp);
        return () => {
            document.removeEventListener('pointermove', onPointerMove);
            document.removeEventListener('pointerup', onPointerUp);
        };
    }, [stamp.id, onMove]);

    const placed = stamp.placedAtIso ? new Date(stamp.placedAtIso) : null;
    const placedStr = placed && !Number.isNaN(placed.getTime()) ? placed.toLocaleString() : stamp.placedAtIso || '';

    return (
        <div
            ref={rootRef}
            className="quote-digital-signature-stamp"
            onPointerDown={onPointerDown}
            style={{
                position: 'absolute',
                left: `${stamp.xPct}%`,
                top: `${stamp.yPct}%`,
                transform: 'translate(-50%, -50%)',
                zIndex: 25,
                maxWidth: 'min(430px, 60vw)',
                padding: 0,
                background: 'transparent',
                border: 'none',
                boxShadow: 'none',
                outline: 'none',
                boxSizing: 'border-box',
                cursor: 'grab',
                userSelect: 'none',
                touchAction: 'none',
            }}
            title="Drag to move on this page"
        >
            <div
                className="no-print"
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: allowRemove ? 'space-between' : 'flex-start',
                    marginBottom: '4px',
                    gap: '6px',
                }}
            >
                <span style={{ fontSize: '8px', color: '#94a3b8', fontWeight: '500' }}>
                    <GripHorizontal size={11} style={{ verticalAlign: 'middle', marginRight: '2px' }} />
                    Drag
                </span>
                {allowRemove ? (
                    <button
                        type="button"
                        className="no-print"
                        onClick={(e) => {
                            e.stopPropagation();
                            onRemove(stamp.id);
                        }}
                        style={{
                            border: 'none',
                            background: '#fee2e2',
                            color: '#b91c1c',
                            borderRadius: '4px',
                            padding: '1px 6px',
                            cursor: 'pointer',
                            fontSize: '10px',
                            fontWeight: '700',
                            lineHeight: 1.2,
                        }}
                    >
                        ×
                    </button>
                ) : null}
            </div>
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                    gap: 0,
                }}
            >
                <img
                    src={stamp.imageDataUrl}
                    alt=""
                    style={{
                        flex: '0 0 auto',
                        width: '172px',
                        maxHeight: '94px',
                        objectFit: 'contain',
                        objectPosition: 'left center',
                        display: 'block',
                        pointerEvents: 'none',
                        backgroundColor: 'transparent',
                        /* Opaque white in older saved PNGs blends into white paper; true alpha PNGs stay correct. */
                        mixBlendMode: 'multiply',
                    }}
                />
                <div style={{ flex: '1 1 auto', minWidth: 0, lineHeight: 1.25, marginLeft: 0, paddingLeft: 0 }}>
                    <div style={{ fontWeight: '700', color: '#0f172a', fontSize: '9px' }}>{stamp.displayName || '—'}</div>
                    {stamp.designation ? (
                        <div style={{ fontSize: '8px', color: '#64748b', marginTop: '2px' }}>{stamp.designation}</div>
                    ) : null}
                    {placedStr ? (
                        <div style={{ fontSize: '7px', color: '#94a3b8', marginTop: '3px' }}>{placedStr}</div>
                    ) : null}
                    {stamp.verificationCode ? (
                        <div
                            style={{
                                fontSize: '7px',
                                color: '#0369a1',
                                fontWeight: '600',
                                marginTop: '3px',
                                wordBreak: 'break-all',
                            }}
                        >
                            {stamp.verificationCode}
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
}

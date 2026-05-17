import React from 'react';

const CalendarBarChart = ({ data, monthlyTotals, onBarClick }) => {
    const sumDaily = (key) =>
        (Array.isArray(data) ? data : []).reduce((acc, item) => acc + (Number(item[key]) || 0), 0);

    // Monthly bar = sum of calendar day chips (monthlyTotals is reconciled the same way on the server).
    const totals = {
        enquiries: sumDaily('Enquiries'),
        due: sumDaily('Due'),
        quoted: sumDaily('Quoted'),
        lapsed: sumDaily('Lapsed'),
    };

    const maxValue = Math.max(totals.enquiries, totals.due, totals.quoted, totals.lapsed, 1);

    const bars = [
        { type: 'enquiry', label: 'Enquiry Received', value: totals.enquiries, color: '#3b82f6', bgColor: '#dbeafe' },
        { type: 'due', label: 'Due', value: totals.due, color: '#f59e0b', bgColor: '#fef3c7' },
        { type: 'lapsed', label: 'Lapsed', value: totals.lapsed, color: '#ef4444', bgColor: '#fee2e2' },
        { type: 'quote', label: 'Quoted', value: totals.quoted, color: '#10b981', bgColor: '#d1fae5' }
    ];

    return (
        <div
            className="dashboard-monthly-overview-inner flex-shrink-0 border-bottom bg-white"
            style={{
                borderColor: '#e5e7eb',
                padding: '6px 12px 8px',
                background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
            }}
        >
            <div className="mb-1">
                <h6 className="text-secondary mb-0" style={{ fontSize: '0.78rem', fontWeight: 600, lineHeight: 1.2, letterSpacing: '0.02em' }}>
                    Monthly Overview
                </h6>
            </div>
            <div className="d-flex monthly-overview-kpi-row" style={{ gap: '14px' }}>
                {bars.map((bar, index) => (
                    <div
                        key={index}
                        className="flex-fill monthly-overview-kpi-tile"
                        style={{ cursor: 'pointer', minWidth: 0, flex: '1 1 0' }}
                        onClick={() => onBarClick && onBarClick(bar.type)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                onBarClick && onBarClick(bar.type);
                            }
                        }}
                    >
                        <div
                            className="d-flex flex-column h-100 rounded-3 monthly-overview-kpi-tile-inner"
                            style={{
                                padding: '5px 10px 6px',
                                border: '1px solid rgba(15, 23, 42, 0.06)',
                                background: 'linear-gradient(165deg, #ffffff 0%, #f8fafc 55%, #f1f5f9 100%)',
                                boxShadow: '0 1px 2px rgba(15, 23, 42, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.85)',
                                transition: 'transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease',
                            }}
                        >
                            <div className="d-flex justify-content-between align-items-start gap-2 mb-1">
                                <span
                                    className="text-secondary text-truncate"
                                    style={{
                                        fontSize: '0.68rem',
                                        lineHeight: 1.2,
                                        minWidth: 0,
                                        fontWeight: 600,
                                    }}
                                >
                                    {bar.label}
                                </span>
                                <span
                                    className="fw-bold flex-shrink-0 tabular-nums"
                                    style={{
                                        fontSize: '1.17rem',
                                        lineHeight: 1,
                                        color: bar.color,
                                        textShadow: '0 1px 0 rgba(255, 255, 255, 0.6)',
                                    }}
                                >
                                    {bar.value}
                                </span>
                            </div>
                            <div className="mt-auto">
                                <div
                                    className="position-relative rounded-pill"
                                    style={{
                                        height: '4px',
                                        backgroundColor: bar.bgColor,
                                        overflow: 'hidden',
                                        boxShadow: 'inset 0 1px 1px rgba(15, 23, 42, 0.07)',
                                    }}
                                >
                                    <div
                                        className="position-absolute top-0 start-0 h-100 rounded-pill"
                                        style={{
                                            width: `${(bar.value / maxValue) * 100}%`,
                                            minWidth: bar.value > 0 ? '4px' : 0,
                                            background: `linear-gradient(90deg, ${bar.color} 0%, ${bar.color}dd 100%)`,
                                            boxShadow: `0 0 6px color-mix(in srgb, ${bar.color} 32%, transparent)`,
                                            transition: 'width 0.35s ease',
                                        }}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
            <style>{`
                .monthly-overview-kpi-tile:hover .monthly-overview-kpi-tile-inner,
                .monthly-overview-kpi-tile:focus-visible .monthly-overview-kpi-tile-inner {
                    transform: translateY(-1px);
                    box-shadow:
                        0 6px 16px rgba(15, 23, 42, 0.1),
                        0 2px 4px rgba(15, 23, 42, 0.06),
                        inset 0 1px 0 rgba(255, 255, 255, 0.9);
                    border-color: rgba(59, 130, 246, 0.22);
                }
                .monthly-overview-kpi-tile:focus-visible {
                    outline: none;
                }
                .monthly-overview-kpi-tile:focus-visible .monthly-overview-kpi-tile-inner {
                    outline: 2px solid #3b82f6;
                    outline-offset: 2px;
                }
            `}</style>
        </div>
    );
};

export default CalendarBarChart;

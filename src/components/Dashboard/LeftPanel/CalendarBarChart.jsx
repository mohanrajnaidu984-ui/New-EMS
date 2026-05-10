import React from 'react';

const CalendarBarChart = ({ data, monthlyTotals, onBarClick }) => {
    // Generate totals (Prefer monthlyTotals from backend, fallback to manual sum)
    const totals = monthlyTotals ? {
        enquiries: monthlyTotals.enquiries || 0,
        due: monthlyTotals.due || 0,
        quoted: monthlyTotals.quoted || 0,
        lapsed: monthlyTotals.lapsed || 0
    } : data.reduce((acc, item) => {
        acc.enquiries += item.Enquiries || 0;
        acc.due += item.Due || 0;
        acc.quoted += item.Quoted || 0;
        acc.lapsed += item.Lapsed || 0;
        return acc;
    }, { enquiries: 0, due: 0, quoted: 0, lapsed: 0 });

    const maxValue = Math.max(totals.enquiries, totals.due, totals.quoted, totals.lapsed, 1);

    const bars = [
        { type: 'enquiry', label: 'Enquiry Received', value: totals.enquiries, color: '#3b82f6', bgColor: '#dbeafe' },
        { type: 'due', label: 'Due', value: totals.due, color: '#f59e0b', bgColor: '#fef3c7' },
        { type: 'lapsed', label: 'Lapsed', value: totals.lapsed, color: '#ef4444', bgColor: '#fee2e2' },
        { type: 'quote', label: 'Quoted', value: totals.quoted, color: '#10b981', bgColor: '#d1fae5' }
    ];

    return (
        <div className="dashboard-monthly-overview-inner flex-shrink-0 py-2 px-2 border-bottom bg-white" style={{ borderColor: '#e5e7eb' }}>
                <div className="mb-1">
                    <h6 className="text-secondary mb-0" style={{ fontSize: '0.78rem', fontWeight: 600, lineHeight: 1.2 }}>
                        Monthly Overview
                    </h6>
                </div>
                <div className="d-flex gap-2">
                    {bars.map((bar, index) => (
                        <div
                            key={index}
                            className="flex-fill"
                            style={{ cursor: 'pointer', minWidth: 0 }}
                            onClick={() => onBarClick && onBarClick(bar.type)}
                        >
                            <div className="d-flex justify-content-between align-items-center mb-0" style={{ gap: '4px' }}>
                                <span className="small text-secondary text-truncate" style={{ fontSize: '0.68rem', lineHeight: 1.15, minWidth: 0 }}>
                                    {bar.label}
                                </span>
                                <span className="fw-bold flex-shrink-0" style={{ fontSize: '0.78rem', color: bar.color }}>
                                    {bar.value}
                                </span>
                            </div>
                            <div
                                className="position-relative rounded mt-1"
                                style={{
                                    height: '5px',
                                    backgroundColor: bar.bgColor,
                                    overflow: 'hidden'
                                }}
                            >
                                <div
                                    className="position-absolute top-0 start-0 h-100 rounded"
                                    style={{
                                        width: `${(bar.value / maxValue) * 100}%`,
                                        backgroundColor: bar.color,
                                        transition: 'width 0.3s ease'
                                    }}
                                />
                            </div>
                        </div>
                    ))}
                </div>
        </div>
    );
};

export default CalendarBarChart;

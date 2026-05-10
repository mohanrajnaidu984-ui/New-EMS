import React, { useMemo, useId } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const CalendarView = ({ month, year, onMonthChange, data, selectedDate, selectedType, onDateClick }) => {
    const domId = useId();
    const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

    // Always 6 rows × 7 columns (42 cells) so calendar height stays consistent across months.
    const generateCalendar = () => {
        const firstDay = new Date(year, month - 1, 1).getDay(); // 0Sun - 6Sat
        const daysInMonth = new Date(year, month, 0).getDate();

        const grid = [];
        for (let i = 0; i < firstDay; i++) grid.push(null);
        for (let i = 1; i <= daysInMonth; i++) grid.push(i);
        while (grid.length < 42) grid.push(null);
        return grid;
    };

    const grid = generateCalendar();

    // Handle Month Nav
    const prevMonth = () => {
        if (month === 1) onMonthChange(12, year - 1);
        else onMonthChange(month - 1, year);
    };

    const nextMonth = () => {
        if (month === 12) onMonthChange(1, year + 1);
        else onMonthChange(month + 1, year);
    };

    // Helper to get day data
    const getDayData = (day) => {
        if (!day) return null;
        if (!Array.isArray(data)) return null; // Defensive check for crash prevention

        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        return data.find(item => {
            if (!item.Date) return false;
            const itemDate = new Date(item.Date).toISOString().split('T')[0];
            return itemDate === dateStr;
        });
    };

    const isToday = (day) => {
        if (!day) return false;
        const d = new Date();
        return d.getDate() === day && (d.getMonth() + 1) === month && d.getFullYear() === year;
    }

    const isSelected = (day) => {
        if (!day || !selectedDate) return false;
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        return selectedDate === dateStr;
    }

    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    const yearOptions = useMemo(() => {
        const cy = new Date().getFullYear();
        const list = [];
        for (let y = cy - 8; y <= cy + 5; y++) list.push(y);
        return list;
    }, []);

    /** Compact chips; pill ~80% cell width; fonts −10% vs prior step */
    const chipCompactStyle = {
        width: '80%',
        maxWidth: '80%',
        alignSelf: 'center',
        flexShrink: 0,
        height: 'calc(13px * 1.3 * 0.9)',
        minHeight: 'calc(13px * 1.3 * 0.9)',
        fontSize: 'calc(9px * 1.3 * 0.9)',
        lineHeight: 1,
        cursor: 'pointer',
        paddingLeft: '4px',
        paddingRight: '4px',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        boxSizing: 'border-box',
    };

    return (
        <div
            className="calendar-view-root bg-white rounded shadow-sm border border-light overflow-hidden d-flex flex-column flex-grow-1"
            style={{ minHeight: 0, flex: '1 1 0' }}
        >
            {/* Header */}
            <div className="d-flex justify-content-between align-items-center py-2 px-2 border-bottom gap-1 flex-shrink-0" style={{ backgroundColor: '#dbeafe', minHeight: '48px' }}>
                <button type="button" className="calendar-nav-btn flex-shrink-0" onClick={prevMonth} aria-label="Previous month">
                    <ChevronLeft size={18} />
                </button>
                <div className="d-flex align-items-center justify-content-center gap-1 flex-wrap flex-grow-1" style={{ minWidth: 0 }}>
                    <label className="visually-hidden" htmlFor={`${domId}-month`}>Month</label>
                    <select
                        id={`${domId}-month`}
                        className="form-select form-select-sm calendar-month-year-select border-0 shadow-none"
                        style={{ width: 'fit-content', maxWidth: '76px', minWidth: 0, fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' }}
                        value={month}
                        onChange={(e) => onMonthChange(Number(e.target.value), year)}
                        aria-label="Select month"
                    >
                        {monthNames.map((name, i) => (
                            <option key={name} value={i + 1}>{name}</option>
                        ))}
                    </select>
                    <label className="visually-hidden" htmlFor={`${domId}-year`}>Year</label>
                    <select
                        id={`${domId}-year`}
                        className="form-select form-select-sm calendar-month-year-select border-0 shadow-none"
                        style={{ width: 'fit-content', maxWidth: '66px', minWidth: 0, fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' }}
                        value={year}
                        onChange={(e) => onMonthChange(month, Number(e.target.value))}
                        aria-label="Select year"
                    >
                        {yearOptions.map((y) => (
                            <option key={y} value={y}>{y}</option>
                        ))}
                    </select>
                </div>
                <button type="button" className="calendar-nav-btn flex-shrink-0" onClick={nextMonth} aria-label="Next month">
                    <ChevronRight size={18} />
                </button>
            </div>

            {/* Grid Header — same EMS gradient as app nav / pricing tables */}
            <div
                className="d-flex border-bottom flex-shrink-0"
                style={{
                    background: 'linear-gradient(180deg, #3b74c2 0%, #2f5fae 45%, #203f75 100%)',
                }}
            >
                {days.map((d, i) => (
                    <div
                        key={d}
                        className="flex-fill text-center py-1 small fw-bold"
                        style={{
                            width: '14.28%',
                            fontSize: '0.65rem',
                            color: '#f8fafc',
                            letterSpacing: '0.02em',
                            borderRight: i < days.length - 1 ? '1px solid rgba(255,255,255,0.28)' : undefined,
                        }}
                    >
                        {d}
                    </div>
                ))}
            </div>

            {/* Grid Body — fixed 6 rows; rows share remaining height */}
            <div
                className="calendar-grid-body bg-white flex-grow-1"
                style={{
                    flex: '1 1 0',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
                    gridTemplateRows: 'repeat(6, minmax(0, 1fr))',
                    minHeight: 0,
                }}
            >
                {grid.map((day, idx) => {
                    const info = getDayData(day);
                    const today = isToday(day);
                    const selected = isSelected(day);
                    const cellDateStr = day ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` : null;

                    return (
                        <div
                            key={idx}
                            className={`border-end border-bottom d-flex flex-column align-items-stretch justify-content-end position-relative ${today ? 'bg-primary bg-opacity-10' : ''}`}
                            style={{
                                minWidth: 0,
                                minHeight: 0,
                                overflow: 'visible',
                                cursor: 'default',
                                transition: 'background-color 0.2s',
                                padding: '4px 4px 10px 4px',
                            }}
                            onMouseEnter={(e) => day && (e.currentTarget.style.backgroundColor = today ? '' : '#f8fafc')}
                            onMouseLeave={(e) => day && (e.currentTarget.style.backgroundColor = today ? '' : 'transparent')}
                        >
                            {day && (
                                <>
                                    <div
                                        className={`
                                        calendar-day-number small fw-bold rounded-circle d-flex align-items-center justify-content-center position-absolute
                                        ${today ? 'bg-primary text-white shadow-sm' : (selected ? 'bg-dark text-white' : 'text-secondary')}
                                    `}
                                        style={{
                                            top: '2px',
                                            right: '3px',
                                            width: 'calc(22px * 1.3)',
                                            height: 'calc(22px * 1.3)',
                                            fontSize: 'calc(11px * 1.3)',
                                            transition: 'all 0.2s',
                                            zIndex: 2,
                                        }}
                                    >
                                        {day}
                                    </div>

                                    {/* Event Chips — anchored below; date in corner frees vertical space */}
                                    <div
                                        className="d-flex flex-column align-items-center w-100 flex-grow-1 calendar-chip-stack"
                                        style={{ minHeight: 0, overflow: 'visible', gap: '3px', justifyContent: 'flex-end' }}
                                    >
                                        {info?.Enquiries > 0 && (
                                            <div
                                                className={`calendar-chip badge rounded-pill bg-primary bg-opacity-10 text-primary border border-primary border-opacity-10 d-flex align-items-center justify-content-center ${selected && selectedType === 'enquiry' ? 'ring-2 ring-primary' : ''}`}
                                                style={chipCompactStyle}
                                                onClick={(e) => { e.stopPropagation(); onDateClick(cellDateStr, 'enquiry'); }}
                                                title="Show Enquiries Created"
                                            >
                                                {info.Enquiries} {info.Enquiries > 1 ? 'Enquiries' : 'Enquiry'}
                                            </div>
                                        )}
                                        {info?.Due > 0 && (
                                            <div
                                                className={`calendar-chip badge rounded-pill bg-warning bg-opacity-10 text-warning border border-warning border-opacity-10 d-flex align-items-center justify-content-center ${selected && selectedType === 'due' ? 'ring-2 ring-warning' : ''}`}
                                                style={{ ...chipCompactStyle, color: '#b45309', backgroundColor: '#fffbeb', borderColor: '#fcd34d' }}
                                                onClick={(e) => { e.stopPropagation(); onDateClick(cellDateStr, 'due'); }}
                                                title="Show Enquiries Due"
                                            >
                                                {info.Due} Due
                                            </div>
                                        )}
                                        {info?.Lapsed > 0 && (
                                            <div
                                                className={`calendar-chip badge rounded-pill bg-danger bg-opacity-10 text-danger border border-danger border-opacity-10 d-flex align-items-center justify-content-center ${selected && selectedType === 'lapsed' ? 'ring-2 ring-danger' : ''}`}
                                                style={chipCompactStyle}
                                                onClick={(e) => { e.stopPropagation(); onDateClick(cellDateStr, 'lapsed'); }}
                                                title="Show Lapsed Enquiries"
                                            >
                                                {info.Lapsed} Laps
                                            </div>
                                        )}
                                        {info?.Quoted > 0 && (
                                            <div
                                                className={`calendar-chip badge rounded-pill bg-success bg-opacity-10 text-success border border-success border-opacity-10 d-flex align-items-center justify-content-center ${selected && selectedType === 'quote' ? 'ring-2 ring-success' : ''}`}
                                                style={chipCompactStyle}
                                                onClick={(e) => { e.stopPropagation(); onDateClick(cellDateStr, 'quote'); }}
                                                title="Show Quoted Enquiries"
                                            >
                                                {info.Quoted} Quoted
                                            </div>
                                        )}
                                        {info?.SiteVisits > 0 && (
                                            <div
                                                className={`calendar-chip badge rounded-pill bg-secondary bg-opacity-10 text-secondary border border-secondary border-opacity-10 d-flex align-items-center justify-content-center ${selected && selectedType === 'visit' ? 'ring-2 ring-secondary' : ''}`}
                                                style={chipCompactStyle}
                                                onClick={(e) => { e.stopPropagation(); onDateClick(cellDateStr, 'visit'); }}
                                                title="Show Site Visits"
                                            >
                                                {info.SiteVisits} Visit
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    );
                })}
            </div>
            <style>{`
                .calendar-month-year-select {
                    border: none !important;
                    box-shadow: none !important;
                    background-color: transparent !important;
                    background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3e%3cpath fill='none' stroke='%23334155' stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M2 5l6 6 6-6'/%3e%3c/svg%3e") !important;
                    background-repeat: no-repeat !important;
                    background-position: right 0.35rem center !important;
                    background-size: 12px 10px !important;
                    padding-right: 1.25rem !important;
                    -webkit-appearance: none !important;
                    appearance: none !important;
                }
                .calendar-month-year-select:focus {
                    border: none !important;
                    box-shadow: none !important;
                    outline: none !important;
                }
                .calendar-month-year-select:focus-visible {
                    outline: 2px solid #3b82f6 !important;
                    outline-offset: 2px;
                    border-radius: 4px;
                }
                .bg-aliceblue { background-color: #f0f8ff; }
                .bg-selected-date { background-color: #fff3cdc9 !important; border: 2px solid #ffc107; }
                .ring-2 { box-shadow: 0 0 0 2px currentColor; }
                .calendar-chip {
                    position: relative;
                    z-index: 1;
                    transition: opacity 0.15s ease-in-out;
                    font-weight: 600;
                }
                .calendar-chip.ring-2 {
                    z-index: 5;
                }
                .calendar-chip:hover,
                .calendar-chip:focus-visible {
                    opacity: 0.92;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.12);
                    z-index: 6;
                }
                .calendar-nav-btn {
                    width: 32px;
                    height: 32px;
                    border-radius: 999px;
                    border: 1px solid #cbd5e1;
                    background: #ffffff;
                    color: #1e293b;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
                    transition: all 0.2s ease;
                }
                .calendar-nav-btn:hover {
                    background: #e2e8f0;
                    border-color: #94a3b8;
                }
            `}</style>
        </div>
    );
};

export default CalendarView;

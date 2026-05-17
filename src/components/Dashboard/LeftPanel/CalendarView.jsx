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
        return data.find((item) => {
            if (!item?.Date) return false;
            const itemDate = String(item.Date).trim().slice(0, 10);
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

    /** Compact chips; pill ~80% cell width; reserved top/right so day badge does not cover text */
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
        paddingLeft: '5px',
        paddingRight: '5px',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        boxSizing: 'border-box',
    };

    return (
        <div
            className="calendar-view-root bg-white rounded-3 shadow-sm border overflow-hidden d-flex flex-column flex-grow-1"
            style={{ minHeight: 0, flex: '1 1 0', borderColor: 'rgba(15, 23, 42, 0.08)' }}
        >
            {/* Header — soft gradient strip + glassy month/year */}
            <div
                className="d-flex justify-content-between align-items-center py-2 px-2 gap-1 flex-shrink-0 calendar-nav-strip"
                style={{
                    minHeight: '48px',
                    background: 'linear-gradient(165deg, #f0f7ff 0%, #dbeafe 42%, #c7e2fc 100%)',
                    borderBottom: '1px solid rgba(59, 130, 246, 0.22)',
                    boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.65), 0 2px 8px rgba(37, 99, 235, 0.08)',
                }}
            >
                <button type="button" className="calendar-nav-btn flex-shrink-0" onClick={prevMonth} aria-label="Previous month">
                    <ChevronLeft size={18} strokeWidth={2.25} />
                </button>
                <div className="d-flex align-items-center justify-content-center gap-2 flex-wrap flex-grow-1" style={{ minWidth: 0 }}>
                    <label className="visually-hidden" htmlFor={`${domId}-month`}>Month</label>
                    <select
                        id={`${domId}-month`}
                        className="form-select form-select-sm calendar-month-year-select border-0 shadow-none"
                        style={{ width: 'fit-content', maxWidth: '82px', minWidth: 0, fontSize: '0.84rem', fontWeight: 700, cursor: 'pointer', color: '#0f172a' }}
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
                        style={{ width: 'fit-content', maxWidth: '72px', minWidth: 0, fontSize: '0.84rem', fontWeight: 700, cursor: 'pointer', color: '#0f172a' }}
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
                    <ChevronRight size={18} strokeWidth={2.25} />
                </button>
            </div>

            {/* Weekday strip — depth + subtle gloss */}
            <div
                className="d-flex flex-shrink-0 calendar-weekday-strip"
                style={{
                    background: 'linear-gradient(180deg, #4d88d6 0%, #3b74c2 38%, #2f5fae 72%, #1e3a6f 100%)',
                    boxShadow:
                        'inset 0 1px 0 rgba(255, 255, 255, 0.22), inset 0 -1px 0 rgba(15, 23, 42, 0.15), 0 4px 14px rgba(15, 23, 42, 0.18)',
                }}
            >
                {days.map((d, i) => (
                    <div
                        key={d}
                        className="flex-fill text-center calendar-weekday-cell small fw-bold"
                        style={{
                            width: '14.28%',
                            fontSize: '0.68rem',
                            color: '#f8fafc',
                            letterSpacing: '0.06em',
                            textShadow: '0 1px 2px rgba(15, 23, 42, 0.35)',
                            borderRight: i < days.length - 1 ? '1px solid rgba(255,255,255,0.18)' : undefined,
                            paddingTop: '0.45rem',
                            paddingBottom: '0.45rem',
                        }}
                    >
                        {d}
                    </div>
                ))}
            </div>

            {/* Grid Body — fixed 6 rows; rows share remaining height */}
            <div
                className="calendar-grid-body flex-grow-1"
                style={{
                    flex: '1 1 0',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
                    gridTemplateRows: 'repeat(6, minmax(0, 1fr))',
                    minHeight: 0,
                    background: 'linear-gradient(180deg, #fafbfc 0%, #ffffff 55%)',
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
                            className={`
                                calendar-day-cell border-end border-bottom d-flex flex-column align-items-stretch justify-content-end position-relative
                                ${!day ? 'calendar-day-cell--empty' : ''}
                                ${today ? 'calendar-day-cell--today' : ''}
                                ${selected ? 'calendar-day-cell--selected' : ''}
                            `}
                            style={{
                                minWidth: 0,
                                minHeight: 0,
                                overflow: 'visible',
                                padding: '3px 4px 8px 4px',
                            }}
                        >
                            {day && (
                                <>
                                    <div
                                        className={`
                                        calendar-day-number small fw-bold rounded-circle d-flex align-items-center justify-content-center position-absolute
                                        ${today ? 'bg-primary text-white' : (selected ? 'bg-dark text-white' : 'text-secondary')}
                                    `}
                                        style={{
                                            top: '3px',
                                            right: '4px',
                                            width: 'calc(22px * 1.25)',
                                            height: 'calc(22px * 1.25)',
                                            fontSize: 'calc(11px * 1.2)',
                                            transition: 'transform 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease',
                                            zIndex: 1,
                                            boxShadow: today
                                                ? '0 2px 8px rgba(37, 99, 235, 0.35), inset 0 1px 0 rgba(255,255,255,0.25)'
                                                : selected
                                                    ? '0 1px 4px rgba(15, 23, 42, 0.2)'
                                                    : 'none',
                                        }}
                                    >
                                        {day}
                                    </div>

                                    {/* Event Chips — anchored below; date in corner frees vertical space */}
                                    <div
                                        className="d-flex flex-column align-items-center w-100 flex-grow-1 calendar-chip-stack"
                                        style={{
                                            minHeight: 0,
                                            overflow: 'visible',
                                            gap: '5px',
                                            justifyContent: 'flex-end',
                                            paddingTop: 'calc(3px + 22px * 1.25 + 4px)',
                                            paddingRight: '2px',
                                        }}
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
                .calendar-view-root {
                    box-shadow:
                        0 1px 2px rgba(15, 23, 42, 0.05),
                        0 12px 32px rgba(37, 99, 235, 0.07),
                        inset 0 1px 0 rgba(255, 255, 255, 0.9) !important;
                }
                .calendar-grid-body > .calendar-day-cell {
                    border-color: rgba(15, 23, 42, 0.07) !important;
                    transition: background-color 0.2s ease, box-shadow 0.2s ease;
                }
                .calendar-day-cell--empty {
                    background: rgba(248, 250, 252, 0.65);
                }
                .calendar-day-cell:not(.calendar-day-cell--empty):hover {
                    background-color: rgba(241, 245, 249, 0.95) !important;
                    box-shadow: inset 0 0 0 1px rgba(59, 130, 246, 0.12);
                    z-index: 2;
                }
                .calendar-day-cell--today:not(:hover) {
                    background: linear-gradient(165deg, rgba(219, 234, 254, 0.55) 0%, rgba(239, 246, 255, 0.35) 100%) !important;
                    box-shadow: inset 0 0 0 1px rgba(59, 130, 246, 0.22);
                }
                .calendar-day-cell--today:hover {
                    background: linear-gradient(165deg, rgba(191, 219, 254, 0.65) 0%, rgba(224, 231, 255, 0.45) 100%) !important;
                    box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.28);
                    z-index: 2;
                }
                .calendar-day-cell--selected.calendar-day-cell--today {
                    box-shadow: inset 0 0 0 2px rgba(59, 130, 246, 0.45);
                }
                .calendar-day-cell--selected:not(.calendar-day-cell--today) {
                    box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.14);
                }
                .calendar-month-year-select {
                    border: 1px solid rgba(255, 255, 255, 0.85) !important;
                    border-radius: 10px !important;
                    box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.9) !important;
                    background-color: rgba(255, 255, 255, 0.82) !important;
                    background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3e%3cpath fill='none' stroke='%231e3a5f' stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M2 5l6 6 6-6'/%3e%3c/svg%3e") !important;
                    background-repeat: no-repeat !important;
                    background-position: right 0.4rem center !important;
                    background-size: 11px 9px !important;
                    padding-right: 1.35rem !important;
                    padding-left: 0.55rem !important;
                    padding-top: 0.28rem !important;
                    padding-bottom: 0.28rem !important;
                    -webkit-appearance: none !important;
                    appearance: none !important;
                    transition: box-shadow 0.2s ease, background-color 0.2s ease, transform 0.15s ease;
                }
                .calendar-month-year-select:hover {
                    background-color: rgba(255, 255, 255, 0.96) !important;
                    box-shadow: 0 2px 8px rgba(37, 99, 235, 0.12), inset 0 1px 0 rgba(255, 255, 255, 1) !important;
                }
                .calendar-month-year-select:focus {
                    border-color: rgba(59, 130, 246, 0.45) !important;
                    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2), 0 2px 8px rgba(37, 99, 235, 0.1) !important;
                    outline: none !important;
                }
                .calendar-month-year-select:focus-visible {
                    outline: none !important;
                }
                .calendar-weekday-cell {
                    transition: background-color 0.15s ease, color 0.15s ease;
                }
                .calendar-weekday-strip:hover .calendar-weekday-cell {
                    color: #ffffff;
                }
                .calendar-weekday-cell:hover {
                    background-color: rgba(255, 255, 255, 0.12);
                }
                .bg-aliceblue { background-color: #f0f8ff; }
                .bg-selected-date { background-color: #fff3cdc9 !important; border: 2px solid #ffc107; }
                .ring-2 { box-shadow: 0 0 0 2px currentColor; }
                .calendar-chip {
                    position: relative;
                    z-index: 4;
                    transition: transform 0.18s ease, box-shadow 0.18s ease, filter 0.18s ease;
                    font-weight: 600;
                    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
                }
                .calendar-chip.ring-2 {
                    z-index: 8;
                }
                .calendar-chip:hover,
                .calendar-chip:focus-visible {
                    transform: translateY(-1px);
                    filter: brightness(1.02);
                    box-shadow: 0 4px 12px rgba(15, 23, 42, 0.1), 0 1px 2px rgba(15, 23, 42, 0.06);
                    z-index: 9;
                }
                .calendar-nav-btn {
                    width: 34px;
                    height: 34px;
                    border-radius: 999px;
                    border: 1px solid rgba(255, 255, 255, 0.95);
                    background: linear-gradient(180deg, #ffffff 0%, #f1f5f9 100%);
                    color: #1e3a5f;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06), 0 2px 8px rgba(37, 99, 235, 0.1);
                    transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.18s ease, border-color 0.18s ease;
                }
                .calendar-nav-btn:hover {
                    background: linear-gradient(180deg, #ffffff 0%, #e2e8f0 100%);
                    border-color: #cbd5e1;
                    box-shadow: 0 2px 10px rgba(37, 99, 235, 0.15);
                    transform: translateY(-1px);
                }
                .calendar-nav-btn:active {
                    transform: translateY(0);
                    box-shadow: 0 1px 3px rgba(15, 23, 42, 0.1);
                }
                .calendar-nav-btn:focus-visible {
                    outline: 2px solid #3b82f6;
                    outline-offset: 2px;
                }
            `}</style>
        </div>
    );
};

export default CalendarView;

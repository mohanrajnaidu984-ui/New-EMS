import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const CalendarView = ({ month, year, onMonthChange, data, selectedDate, selectedType, onDateClick }) => {
    const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

    // Helper to generate grid
    const generateCalendar = () => {
        const firstDay = new Date(year, month - 1, 1).getDay(); // 0Sun - 6Sat
        const daysInMonth = new Date(year, month, 0).getDate();

        const grid = [];
        // Empty slots
        for (let i = 0; i < firstDay; i++) grid.push(null);
        // Days
        for (let i = 1; i <= daysInMonth; i++) grid.push(i);

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

    return (
        <div className="bg-white rounded shadow-sm border border-light overflow-hidden">
            {/* Header */}
            <div className="d-flex justify-content-between align-items-center p-3 border-bottom" style={{ backgroundColor: '#eff6ff', minHeight: '86px' }}>
                <button className="btn btn-sm btn-link text-dark" onClick={prevMonth}><ChevronLeft size={16} /></button>
                <div className="fw-bold">{monthNames[month - 1]} {year}</div>
                <button className="btn btn-sm btn-link text-dark" onClick={nextMonth}><ChevronRight size={16} /></button>
            </div>

            {/* Grid Header */}
            <div className="d-flex bg-light border-bottom">
                {days.map(d => (
                    <div key={d} className="flex-fill text-center py-2 border-end small fw-bold text-muted" style={{ width: '14.28%' }}>
                        {d}
                    </div>
                ))}
            </div>

            {/* Grid Body */}
            <div className="d-flex flex-wrap bg-white">
                {grid.map((day, idx) => {
                    const info = getDayData(day);
                    const today = isToday(day);
                    const selected = isSelected(day);
                    const cellDateStr = day ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` : null;

                    return (
                        <div
                            key={idx}
                            className={`border-end border-bottom p-1 d-flex flex-column align-items-center justify-content-start position-relative ${today ? 'bg-primary bg-opacity-10' : ''}`}
                            style={{ width: '14.28%', minHeight: '75px', cursor: 'default', transition: 'all 0.2s' }}
                            onMouseEnter={(e) => day && (e.currentTarget.style.backgroundColor = today ? '' : '#f8fafc')}
                            onMouseLeave={(e) => day && (e.currentTarget.style.backgroundColor = today ? '' : 'transparent')}
                        >
                            {day && (
                                <>
                                    <div className={`
                                        small fw-bold mb-1 rounded-circle d-flex align-items-center justify-content-center
                                        ${today ? 'bg-primary text-white shadow-sm' : (selected ? 'bg-dark text-white' : 'text-secondary')}
                                    `} style={{ width: '28px', height: '28px', transition: 'all 0.2s' }}>
                                        {day}
                                    </div>

                                    {/* Event Chips */}
                                    <div className="d-flex flex-column gap-1 w-100 px-1">
                                        {info?.Enquiries > 0 && (
                                            <div
                                                className={`calendar-chip badge rounded-pill bg-primary bg-opacity-10 text-primary border border-primary border-opacity-10 d-flex align-items-center justify-content-center px-1 ${selected && selectedType === 'enquiry' ? 'ring-2 ring-primary' : ''}`}
                                                style={{ height: '18px', fontSize: '0.65rem', cursor: 'pointer' }}
                                                onClick={(e) => { e.stopPropagation(); onDateClick(cellDateStr, 'enquiry'); }}
                                                title="Show Enquiries Created"
                                            >
                                                {info.Enquiries} {info.Enquiries > 1 ? 'Enquiries' : 'Enquiry'}
                                            </div>
                                        )}
                                        {info?.Due > 0 && (
                                            <div
                                                className={`calendar-chip badge rounded-pill bg-warning bg-opacity-10 text-warning border border-warning border-opacity-10 d-flex align-items-center justify-content-center px-1 ${selected && selectedType === 'due' ? 'ring-2 ring-warning' : ''}`}
                                                style={{ height: '18px', fontSize: '0.65rem', cursor: 'pointer', color: '#b45309', backgroundColor: '#fffbeb', borderColor: '#fcd34d' }}
                                                onClick={(e) => { e.stopPropagation(); onDateClick(cellDateStr, 'due'); }}
                                                title="Show Enquiries Due"
                                            >
                                                {info.Due} Due
                                            </div>
                                        )}
                                        {info?.Lapsed > 0 && (
                                            <div
                                                className={`calendar-chip badge rounded-pill bg-danger bg-opacity-10 text-danger border border-danger border-opacity-10 d-flex align-items-center justify-content-center px-1 ${selected && selectedType === 'lapsed' ? 'ring-2 ring-danger' : ''}`}
                                                style={{ height: '18px', fontSize: '0.65rem', cursor: 'pointer' }}
                                                onClick={(e) => { e.stopPropagation(); onDateClick(cellDateStr, 'lapsed'); }}
                                                title="Show Lapsed Enquiries"
                                            >
                                                {info.Lapsed} Laps
                                            </div>
                                        )}
                                        {info?.Quoted > 0 && (
                                            <div
                                                className={`calendar-chip badge rounded-pill bg-success bg-opacity-10 text-success border border-success border-opacity-10 d-flex align-items-center justify-content-center px-1 ${selected && selectedType === 'quote' ? 'ring-2 ring-success' : ''}`}
                                                style={{ height: '18px', fontSize: '0.65rem', cursor: 'pointer' }}
                                                onClick={(e) => { e.stopPropagation(); onDateClick(cellDateStr, 'quote'); }}
                                                title="Show Quoted Enquiries"
                                            >
                                                {info.Quoted} Quoted
                                            </div>
                                        )}
                                        {info?.SiteVisits > 0 && (
                                            <div
                                                className={`calendar-chip badge rounded-pill bg-secondary bg-opacity-10 text-secondary border border-secondary border-opacity-10 d-flex align-items-center justify-content-center px-1 ${selected && selectedType === 'visit' ? 'ring-2 ring-secondary' : ''}`}
                                                style={{ height: '18px', fontSize: '0.65rem', cursor: 'pointer' }}
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
                .bg-aliceblue { background-color: #f0f8ff; }
                .bg-selected-date { background-color: #fff3cdc9 !important; border: 2px solid #ffc107; }
                .ring-2 { box-shadow: 0 0 0 2px currentColor; }
                .calendar-chip { transition: transform 0.15s ease-in-out; }
                .calendar-chip:hover { transform: scale(1.05); opacity: 0.95; box-shadow: 0 2px 4px rgba(0,0,0,0.1); z-index: 5; }
            `}</style>
        </div>
    );
};

export default CalendarView;

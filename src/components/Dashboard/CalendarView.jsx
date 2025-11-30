import React from 'react';

const CalendarView = ({ month, year, data }) => {
    const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

    // Mock logic to generate calendar days
    // In a real app, use date-fns to generate actual days for the month
    const generateCalendarDays = () => {
        const calendarDays = [];
        // Start with some empty slots if month doesn't start on Sunday
        // For Demo: September 2025 starts on Monday (based on image)
        calendarDays.push({ type: 'empty', key: 'empty-1' });

        for (let i = 1; i <= 30; i++) {
            calendarDays.push({
                type: 'day',
                date: i,
                key: `day-${i}`,
                mainValue: data[i]?.main || 'New: 0',
                subValue: data[i]?.sub || 'Due: 0'
            });
        }
        return calendarDays;
    };

    const calendarDays = generateCalendarDays();

    return (
        <div className="calendar-container">
            <div className="calendar-header">
                {month}/{year}
            </div>
            <div className="calendar-grid">
                {days.map(day => (
                    <div key={day} className="calendar-day-header">{day}</div>
                ))}

                {calendarDays.map(item => (
                    <div key={item.key} className="calendar-cell">
                        {item.type === 'day' && (
                            <>
                                <div className="calendar-date">{item.date}</div>
                                <div className="calendar-val-main" style={{ fontSize: '0.8rem' }}>{item.mainValue}</div>
                                <div className="calendar-val-sub" style={{ fontSize: '0.7rem' }}>{item.subValue}</div>
                            </>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default CalendarView;

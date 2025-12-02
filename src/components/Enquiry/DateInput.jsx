import React, { useRef } from 'react';

const DateInput = ({ value, onChange, placeholder = "DD-MMM-YYYY", ...props }) => {
    const datePickerRef = useRef(null);

    // Convert YYYY-MM-DD to DD-MMM-YYYY for display
    const formatDateForDisplay = (dateStr) => {
        if (!dateStr) return '';
        try {
            const date = new Date(dateStr);
            const day = String(date.getDate()).padStart(2, '0');
            const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const month = monthNames[date.getMonth()];
            const year = date.getFullYear();
            return `${day}-${month}-${year}`;
        } catch (e) {
            return '';
        }
    };

    // Convert DD-MMM-YYYY to YYYY-MM-DD for storage
    const parseDateFromDisplay = (displayStr) => {
        if (!displayStr) return '';
        try {
            const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const parts = displayStr.split('-');
            if (parts.length !== 3) return '';

            const day = parts[0];
            const monthIndex = monthNames.indexOf(parts[1]);
            const year = parts[2];

            if (monthIndex === -1) return '';

            const month = String(monthIndex + 1).padStart(2, '0');
            return `${year}-${month}-${day}`;
        } catch (e) {
            return '';
        }
    };

    const handleInputChange = (e) => {
        const inputValue = e.target.value;
        onChange({ target: { value: inputValue } });
    };

    const handleBlur = (e) => {
        const inputValue = e.target.value;
        const parsedDate = parseDateFromDisplay(inputValue);

        if (parsedDate) {
            onChange({ target: { value: parsedDate } });
        } else if (inputValue === '') {
            onChange({ target: { value: '' } });
        }
    };

    const handleDatePickerChange = (e) => {
        onChange(e);
    };

    const handleCalendarIconClick = () => {
        if (datePickerRef.current) {
            datePickerRef.current.showPicker();
        }
    };

    const handleInputClick = () => {
        if (datePickerRef.current) {
            datePickerRef.current.showPicker();
        }
    };

    return (
        <div style={{ position: 'relative' }}>
            <input
                type="text"
                className="form-control"
                value={formatDateForDisplay(value)}
                onChange={handleInputChange}
                onBlur={handleBlur}
                onClick={handleInputClick}
                placeholder={placeholder}
                style={{ fontSize: '13px', paddingRight: '40px', cursor: 'pointer' }}
                readOnly
                {...props}
            />
            <i
                className="bi bi-calendar3"
                onClick={handleCalendarIconClick}
                style={{
                    position: 'absolute',
                    right: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    cursor: 'pointer',
                    fontSize: '16px',
                    color: '#667eea',
                    pointerEvents: 'auto',
                    zIndex: 2
                }}
            />
            <input
                ref={datePickerRef}
                type="date"
                value={value}
                onChange={handleDatePickerChange}
                style={{
                    position: 'absolute',
                    left: '0',
                    top: '0',
                    width: '100%',
                    height: '100%',
                    opacity: '0',
                    cursor: 'pointer',
                    pointerEvents: 'none'
                }}
                tabIndex={-1}
            />
        </div>
    );
};

export default DateInput;

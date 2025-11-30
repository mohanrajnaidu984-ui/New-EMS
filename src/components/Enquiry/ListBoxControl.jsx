import React from 'react';
import SearchableSelectControl from './SearchableSelectControl';

const ListBoxControl = ({
    label,
    options,
    selectedOption,
    onOptionChange,
    listBoxItems,
    onListBoxChange,
    onAdd,
    onRemove,
    onNew,
    onEdit,
    renderOption = (opt) => opt,
    renderListBoxItem = (item) => item,
    disabled = false,
    error = null,
    showNew = false,
    showEdit = false,
    canEdit = false,
    selectedItemDetails = null
}) => {
    return (
        <div className="mb-2">
            <SearchableSelectControl
                label={label}
                options={options}
                selectedOption={selectedOption}
                onOptionChange={onOptionChange}
                onNew={onNew}
                onEdit={onEdit}
                showNew={showNew}
                showEdit={showEdit}
                canEdit={canEdit}
                disabled={disabled}
                error={error}
                renderOption={renderOption}
                selectedItemDetails={selectedItemDetails}
            />

            {/* ListBox + Add/Remove Buttons Row */}
            <div className="d-flex align-items-center mt-1">
                <select
                    className="form-select"
                    multiple
                    style={{ height: '75px', fontSize: '13px' }}
                    onChange={onListBoxChange}
                >
                    {listBoxItems.map((item, idx) => (
                        <option key={idx} value={item}>
                            {renderListBoxItem(item, idx)}
                        </option>
                    ))}
                </select>
                {(onAdd || onRemove) && (
                    <div className="d-flex flex-column ms-2 gap-2">
                        {onAdd && (
                            <button
                                type="button"
                                className="btn p-0 d-flex align-items-center justify-content-center"
                                style={{
                                    width: '32px',
                                    height: '32px',
                                    border: '2px solid #198754',
                                    color: '#198754',
                                    borderRadius: '6px',
                                    backgroundColor: 'white'
                                }}
                                onClick={onAdd}
                                disabled={!selectedOption}
                            >
                                <i className="bi bi-plus" style={{ fontSize: '1.5rem', lineHeight: 1 }}></i>
                            </button>
                        )}
                        {onRemove && (
                            <button
                                type="button"
                                className="btn p-0 d-flex align-items-center justify-content-center"
                                style={{
                                    width: '32px',
                                    height: '32px',
                                    border: '2px solid #dc3545',
                                    color: '#dc3545',
                                    borderRadius: '6px',
                                    backgroundColor: 'white'
                                }}
                                onClick={onRemove}
                            >
                                <i className="bi bi-dash" style={{ fontSize: '1.5rem', lineHeight: 1 }}></i>
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div >
    );
};

export default ListBoxControl;

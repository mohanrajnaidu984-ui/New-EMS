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
    selectedItemDetails = null,
    canRemove = true,
    minSearchLength = 3
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
                minSearchLength={minSearchLength}
            />

            {/* ListBox + Add/Remove Buttons Row */}
            <div className="d-flex align-items-center mt-1">
                <select
                    className="form-select"
                    multiple
                    style={{ height: listBoxItems.length > 3 ? `${listBoxItems.length * 24 + 10}px` : '75px', fontSize: '13px' }}
                    onChange={onListBoxChange}
                >
                    {listBoxItems.map((item, idx) => (
                        <option key={idx} value={item}>
                            {renderListBoxItem(item, idx)}
                        </option>
                    ))}
                </select>
                {(onAdd || onRemove) && (
                    <div className="d-flex flex-column ms-1">
                        {onAdd && (
                            <button
                                type="button"
                                className="btn btn-outline-success mb-1"
                                style={{ width: '36px', padding: '0.25rem 0.5rem' }}
                                onClick={onAdd}
                                disabled={!selectedOption}
                            >
                                +
                            </button>
                        )}
                        {onRemove && canRemove && (
                            <button
                                type="button"
                                className="btn btn-outline-danger"
                                style={{ width: '36px', padding: '0.25rem 0.5rem' }}
                                onClick={onRemove}
                            >
                                -
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div >
    );
};

export default ListBoxControl;

import React, { useMemo } from 'react';
import Select from 'react-select';
import ValidationTooltip from '../Common/ValidationTooltip';

const SearchableSelectControl = ({
    label,
    options,
    selectedOption,
    onOptionChange,
    onNew,
    onEdit,
    showNew = false,
    showEdit = false,
    canEdit = false,
    disabled = false,
    error = null,
    renderOption = (opt) => opt,
    selectedItemDetails = null,
    minSearchLength = 3
}) => {
    const [inputValue, setInputValue] = React.useState('');

    // Convert options to react-select format { value, label }
    // Handle both simple strings and objects if renderOption is used
    const selectOptions = useMemo(() => options.map(opt => ({
        value: opt,
        label: renderOption(opt)
    })), [options, renderOption]);

    // Find selected object
    const selectedValue = selectOptions.find(opt => opt.value === selectedOption) || null;

    const customStyles = {
        control: (provided) => ({
            ...provided,
            minHeight: '38px',
            fontSize: '13px',
            // Match Bootstrap form-control border color
            borderColor: '#dee2e6',
            boxShadow: 'none',
            '&:hover': {
                borderColor: '#86b7fe'
            }
        }),
        menu: (provided) => ({
            ...provided,
            fontSize: '13px',
            zIndex: 9999
        }),
        container: (provided) => ({
            ...provided,
            flexGrow: 1
        })
    };

    return (
        <div className="mb-2" style={{ position: 'relative' }}>
            {label && <label className="form-label">{label}</label>}
            <div className="d-flex">
                <Select
                    value={selectedValue}
                    onChange={(opt) => onOptionChange(opt ? opt.value : '')}
                    onInputChange={(val) => setInputValue(val)}
                    options={inputValue.length >= minSearchLength ? selectOptions : []}
                    noOptionsMessage={() => inputValue.length < minSearchLength ? `Type ${minSearchLength}+ characters to search...` : "No results found"}
                    styles={customStyles}
                    isDisabled={disabled}
                    isClearable={true}
                    placeholder="-- Select --"
                    className="flex-grow-1"
                />
                {(showNew || showEdit) && (
                    <div className="btn-group ms-2" role="group">
                        {showNew && (
                            <button
                                type="button"
                                className="btn btn-light"
                                style={{
                                    fontSize: '13px',
                                    padding: '0.375rem 0.75rem',
                                    height: '38px',
                                    border: '1px solid #dee2e6',
                                    backgroundColor: '#fff'
                                }}
                                onClick={onNew}
                                title="Add New"
                            >
                                New
                            </button>
                        )}
                        {showEdit && (
                            <button
                                type="button"
                                className="btn btn-light"
                                style={{
                                    fontSize: '13px',
                                    padding: '0.375rem 0.75rem',
                                    height: '38px',
                                    border: '1px solid #dee2e6',
                                    backgroundColor: '#fff',
                                    borderLeft: 'none'
                                }}
                                onClick={onEdit}
                                disabled={!canEdit}
                                title="Edit Selected"
                            >
                                Edit
                            </button>
                        )}
                    </div>
                )}
            </div>
            {error && <ValidationTooltip message={error} />}

            {/* Card View for Selected Item */}
            {selectedItemDetails && (
                <div className="card mt-1 bg-light border-0">
                    <div className="card-body p-2">
                        {selectedItemDetails}
                    </div>
                </div>
            )}
        </div>
    );
};

export default React.memo(SearchableSelectControl);

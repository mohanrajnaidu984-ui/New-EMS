import React, { useState, useEffect } from 'react';
import { X, Pencil, Plus } from 'lucide-react';

const HierarchyBuilder = ({
    options,
    value = [],
    onChange,
    label,
    error,
    showNew = false,
    onNew,
    showEdit = false,
    onEditItem,
    canRemove = true,
    canRemoveItem = null // Callback: (item) => boolean, determines if specific item can be removed
}) => {
    // Value expected to be array of { id, itemName, parentId, parentName }
    // Legacy support: array of strings OR array of objects with parentName only.

    const [localItems, setLocalItems] = useState([]);

    useEffect(() => {
        if (Array.isArray(value)) {
            // 1. First pass: Ensure all items have IDs
            let items = value.map(v => {
                let item = typeof v === 'string' ? { itemName: v, parentName: null } : { ...v };

                // Extract legacy string format if leadJobCode is missing
                if (!item.leadJobCode && item.itemName) {
                    const match = item.itemName.match(/^(L\d+)\s+-\s+(.*)$/);
                    if (match) {
                        item.leadJobCode = match[1];
                        item.itemName = match[2];
                    }
                }

                // Use backend ID if available, else generate temp id
                if (!item.id) item.id = Math.random().toString(36).substr(2, 9);
                // Ensure parentId field exists (might be null)
                if (item.parentId === undefined) item.parentId = null;
                return item;
            });

            // 2. Resolve legacy parentName linkage if parentId is missing
            const nameToIdMap = new Map();
            // Assuming legacy data doesn't have duplicate names in a way that matters, or we take first match
            items.forEach(i => {
                if (!nameToIdMap.has(i.itemName)) {
                    nameToIdMap.set(i.itemName, i.id);
                }
            });

            items = items.map(item => {
                // If it has a parentName but NO parentId, try to link it
                if (!item.parentId && item.parentName) {
                    const linkedId = nameToIdMap.get(item.parentName);
                    if (linkedId) {
                        return { ...item, parentId: linkedId };
                    }
                }
                return item;
            });

            setLocalItems(items);
        }
    }, [value]);

    const updateItems = (newItems) => {
        setLocalItems(newItems);
        onChange(newItems);
    };

    const handleAddRoot = (name) => {
        if (!name) return;

        // Calculate Next Prefix (L1, L2...) for Lead Jobs
        const rootItems = localItems.filter(i => !i.parentId);
        const usedCodes = rootItems
            .map(i => {
                if (i.leadJobCode) {
                    const match = i.leadJobCode.match(/^L(\d+)$/);
                    return match ? parseInt(match[1]) : 0;
                }
                const match = i.itemName.match(/^L(\d+)\s-\s/);
                return match ? parseInt(match[1]) : 0;
            });

        const nextCode = usedCodes.length > 0 ? Math.max(...usedCodes) + 1 : 1;
        const leadCode = `L${nextCode}`;

        // Check duplicate name
        if (localItems.some(i => !i.parentId && i.itemName === name)) {
            alert('This Job is already added.');
            return;
        }

        const newItem = {
            itemName: name,
            leadJobCode: leadCode,
            parentId: null,
            parentName: null,
            id: Math.random().toString(36).substr(2, 9)
        };
        updateItems([...localItems, newItem]);
    };

    const handleAddSubJob = (parentItem, childName) => {
        if (!childName) return;

        // Prevent duplicate siblings (Same Name under Same Parent ID)
        if (localItems.some(i => i.parentId === parentItem.id && i.itemName === childName)) {
            alert('This Job is already included under this item.');
            return;
        }

        const newItem = {
            itemName: childName,
            parentId: parentItem.id,
            parentName: parentItem.itemName, // Maintain legacy field
            id: Math.random().toString(36).substr(2, 9)
        };
        updateItems([...localItems, newItem]);
    };

    const handleRemoveItem = (itemToRemove) => {
        // 1. Remove the specific item by ID
        let currentItems = localItems.filter(i => i.id !== itemToRemove.id);

        // 2. Recursively remove orphans (items whose parentId no longer exists in the list)
        let changed = true;
        while (changed) {
            changed = false;
            const existingIds = new Set(currentItems.map(i => i.id));

            // Allow roots (parentId is null)
            const remaining = currentItems.filter(i => {
                if (!i.parentId) return true; // Keep roots
                if (existingIds.has(i.parentId)) return true; // Keep if parent ID exists

                // If parent ID does NOT exist, remove this item
                changed = true;
                return false;
            });
            currentItems = remaining;
        }

        updateItems(currentItems);
    };

    // Helper to get available options
    // Filter out items that are already children of this parentID
    const getAvailableOptions = (parentId) => {
        const siblings = localItems.filter(i => i.parentId === (parentId || null));
        const siblingNames = siblings.map(i => i.itemName);
        // Filter out siblings and ensure uniqueness of available options
        const available = options.filter(opt => opt && !siblingNames.includes(opt));
        return [...new Set(available)];
    };

    // Render Tree Node
    const renderNode = (item, level = 0) => {
        // Find children: Items whose parentId matches this item's id
        const children = localItems.filter(i => i.parentId === item.id);

        return (
            <div key={item.id} style={{ marginLeft: `${level * 20}px`, marginTop: '8px' }}>
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '6px 10px',
                    background: level === 0 ? '#f0fdf4' : '#fff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    width: 'fit-content'
                }}>
                    <span style={{ fontWeight: level === 0 ? '700' : '500', color: level === 0 ? '#166534' : '#334155' }}>
                        {item.leadJobCode ? `${item.leadJobCode} - ` : ''}{item.itemName}
                        {level === 0 && <span style={{ fontSize: '10px', marginLeft: '6px', background: '#166534', color: 'white', padding: '1px 4px', borderRadius: '4px' }}>LEAD</span>}
                    </span>

                    <div style={{ marginLeft: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {showEdit && onEditItem && (
                            <button
                                onClick={() => onEditItem(item)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3b82f6', display: 'flex', padding: 0 }}
                                title="Edit Item"
                            >
                                <Pencil size={14} />
                            </button>
                        )}
                        {(canRemove && (!canRemoveItem || canRemoveItem(item))) && (
                            <button
                                onClick={() => handleRemoveItem(item)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', display: 'flex', padding: 0 }}
                                title="Remove"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>

                    {/* Add Child Button */}
                    <div style={{ position: 'relative', marginLeft: '8px' }}>
                        <select
                            style={{
                                padding: '2px 4px', fontSize: '11px', border: '1px solid #cbd5e1', borderRadius: '4px',
                                width: '100px', background: '#f8fafc'
                            }}
                            value=""
                            onChange={(e) => handleAddSubJob(item, e.target.value)}
                        >
                            <option value="">+ Add Sub</option>
                            {/* Pass *this* item's ID as parent context */}
                            {getAvailableOptions(item.id).map((opt, idx) => (
                                <option key={`${opt}-${idx}`} value={opt}>{opt}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Recursively render children */}
                <div style={{ borderLeft: '1px dashed #cbd5e1', marginLeft: '14px', paddingLeft: '4px' }}>
                    {children.map(child => renderNode(child, level + 1))}
                </div>
            </div>
        );
    };

    const rootItems = localItems.filter(i => !i.parentId);

    return (
        <div style={{ marginBottom: '16px' }}>
            {label && <label className="form-label" style={{ display: 'block', marginBottom: '4px' }}>{label}</label>}

            <div style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '12px', background: '#fff' }}>

                {/* Existing Roots */}
                {rootItems.length > 0 && (
                    <div style={{ marginBottom: '16px' }}>
                        {rootItems.map(root => renderNode(root))}
                    </div>
                )}

                {/* Add Lead Job Selector */}
                <div style={rootItems.length > 0 ? { borderTop: '1px solid #eee', paddingTop: '12px' } : {}}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <select
                            className="form-select form-select-sm"
                            value=""
                            style={{ maxWidth: '300px' }}
                            onChange={(e) => handleAddRoot(e.target.value)}
                        >
                            <option value="">{rootItems.length > 0 ? "+ Add Another Lead Job" : "-- Select Lead Job --"}</option>
                            {/* Pass null for root options */}
                            {getAvailableOptions(null).map((opt, idx) => (
                                <option key={`${opt}-${idx}`} value={opt}>{opt}</option>
                            ))}
                        </select>
                        {showNew && onNew && (
                            <button
                                onClick={onNew}
                                className="btn btn-sm btn-outline-success"
                                style={{ padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '4px' }}
                                title="Add New Scope"
                            >
                                <Plus size={16} /> New
                            </button>
                        )}
                    </div>
                    {localItems.length === 0 && (
                        <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '8px', fontStyle: 'italic' }}>
                            Select a Lead Job to start building the hierarchy.
                        </div>
                    )}
                </div>
            </div>
            {error && <div className="text-danger" style={{ fontSize: '12px', marginTop: '2px' }}>{error}</div>}
        </div>
    );
};

export default HierarchyBuilder;

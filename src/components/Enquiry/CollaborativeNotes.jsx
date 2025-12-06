import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';

const CollaborativeNotes = ({ enquiryId, enquiryData }) => {
    const { currentUser } = useAuth();
    const { masters } = useData();
    const [notes, setNotes] = useState([]);
    const [newNote, setNewNote] = useState('');
    const [loading, setLoading] = useState(false);
    const [hasAccess, setHasAccess] = useState(false);

    // Fallback if enquiryId prop is missing but exists in data
    const effectiveID = enquiryId || enquiryData?.RequestNo || enquiryData?.ID;

    useEffect(() => {
        if (currentUser && enquiryData) {
            checkAccess();
        }
    }, [effectiveID, enquiryData, currentUser, masters]);

    useEffect(() => {
        if (effectiveID && hasAccess) {
            fetchNotes();
            const interval = setInterval(fetchNotes, 30000); // Poll every 30s
            return () => clearInterval(interval);
        }
    }, [effectiveID, hasAccess]);

    const checkAccess = () => {
        if (!currentUser) return;

        let access = false;
        const roleString = currentUser.role || currentUser.Roles || '';
        const roles = typeof roleString === 'string'
            ? roleString.split(',').map(r => r.trim())
            : (Array.isArray(roleString) ? roleString : []);

        // 1. Admin
        if (roles.includes('Admin')) {
            access = true;
        }
        // 2. Created By
        else if (enquiryData && enquiryData.CreatedBy && currentUser.name &&
            enquiryData.CreatedBy.trim().toLowerCase() === currentUser.name.trim().toLowerCase()) {
            access = true;
        }
        // 3. Concerned SE
        else if (enquiryData && enquiryData.ConcernedSE && currentUser.name &&
            (enquiryData.ConcernedSE.trim().toLowerCase() === currentUser.name.trim().toLowerCase() ||
                enquiryData.ConcernedSE == currentUser.id)) {
            access = true;
        }
        // 4. Enquiry For (Email match)
        else if (enquiryData && enquiryData.EnquiryFor && masters.enqItems) {
            const selectedItems = Array.isArray(enquiryData.EnquiryFor)
                ? enquiryData.EnquiryFor
                : (typeof enquiryData.EnquiryFor === 'string' ? enquiryData.EnquiryFor.split(',') : []);

            const cleanedItems = selectedItems.map(i => i.trim());

            for (const item of cleanedItems) {
                const masterItem = masters.enqItems.find(m => m.ItemName === item);
                if (masterItem) {
                    const emails = [
                        ...(masterItem.CommonMailIds ? masterItem.CommonMailIds.split(',') : []),
                        ...(masterItem.CCMailIds ? masterItem.CCMailIds.split(',') : [])
                    ].map(e => e.trim().toLowerCase());

                    if (currentUser.email && emails.includes(currentUser.email.toLowerCase())) {
                        access = true;
                        break;
                    }
                }
            }
        }

        setHasAccess(access);
    };

    const fetchNotes = async () => {
        try {
            const res = await fetch(`http://localhost:5000/api/enquiries/${encodeURIComponent(effectiveID)}/notes`);
            if (res.ok) {
                const data = await res.json();
                setNotes(data);
            }
        } catch (err) {
            console.error('Error fetching notes:', err);
        }
    };

    const handlePost = async () => {
        if (!newNote.trim()) return;
        setLoading(true);
        try {
            const res = await fetch(`http://localhost:5000/api/enquiries/${encodeURIComponent(effectiveID)}/notes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: currentUser.id,
                    userName: currentUser.name,
                    userProfileImage: currentUser.ProfileImage,
                    content: newNote
                })
            });

            if (res.ok) {
                setNewNote('');
                fetchNotes();
            } else {
                alert('Failed to post note');
            }
        } catch (err) {
            console.error(err);
            alert('Failed to post note');
        } finally {
            setLoading(false);
        }
    };

    const formatTime = (dateStr) => {
        const date = new Date(dateStr);
        // Desired format: DD/MM/YYYY hh:mm AM/PM
        // e.g., 06/12/2025 07:14 PM
        return date.toLocaleDateString('en-GB') + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    // If new enquiry (no ID), show placeholder
    if (!effectiveID) {
        return (
            <div className="card mb-4 shadow-sm border-0 bg-light card-overline">
                <div className="card-body p-4 text-center">
                    <h5 className="card-title fw-bold mb-3">Collaborative Notes</h5>
                    <p className="text-muted fst-italic">
                        <i className="bi bi-info-circle me-2"></i>
                        Please save the enquiry to access collaborative notes.
                    </p>
                </div>
            </div>
        );
    }

    if (!hasAccess) {
        // Only show placeholder/denied message if we actually have an enquiryId but access is denied.
        // If no enquiryId (New mode), usually handled above.
        // But what if enquiryId exists but access denied?
        // User might be confused if they see nothing.
        // Let's return null (invisible) as per current logic, or show "Access Restricted".
        // Current logic: returns null.
        return (
            <div className="card mb-4 shadow-sm border-0 bg-light card-overline">
                <div className="card-body p-4 text-center">
                    <h5 className="card-title fw-bold mb-3">Collaborative Notes</h5>
                    <div className="alert alert-warning d-inline-block">
                        <i className="bi bi-lock-fill me-2"></i>
                        Access Restricted. You do not have permission to view notes for this enquiry.
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="card mb-4 shadow-sm border-0 bg-light card-overline">
            <div className="card-body p-4">
                <h5 className="card-title fw-bold mb-4">Collaborative Notes</h5>

                {/* Notes List */}
                <div className="bg-light p-3 rounded border mb-3" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                    {notes.length === 0 ? (
                        <p className="text-muted text-center small my-3">No notes yet. Start the conversation!</p>
                    ) : (
                        notes.map(note => (
                            <div key={note.ID} className="d-flex mb-3">
                                <div className="me-2">
                                    {note.UserProfileImage ? (
                                        <img src={note.UserProfileImage} alt={note.UserName} className="rounded-circle" style={{ width: 32, height: 32, objectFit: 'cover' }} />
                                    ) : (
                                        <div className="bg-secondary text-white rounded-circle d-flex align-items-center justify-content-center" style={{ width: 32, height: 32 }}>
                                            {note.UserName ? note.UserName.charAt(0).toUpperCase() : 'U'}
                                        </div>
                                    )}
                                </div>
                                <div className="flex-grow-1">
                                    <div className="bg-white p-2 rounded shadow-sm">
                                        <div className="d-flex justify-content-between align-items-center mb-1">
                                            <small className="fw-bold text-dark">{note.UserName}</small>
                                            <small className="text-muted" style={{ fontSize: '0.75rem' }}>{formatTime(note.CreatedAt)}</small>
                                        </div>
                                        <p className="mb-0 text-secondary" style={{ fontSize: '0.9rem' }}>{note.NoteContent}</p>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Input */}
                <div className="d-flex gap-2 align-items-center">
                    <div className="me-0">
                        {currentUser.ProfileImage ? (
                            <img src={currentUser.ProfileImage} alt={currentUser.name} className="rounded-circle" style={{ width: 32, height: 32, objectFit: 'cover' }} />
                        ) : (
                            <div className="bg-warning text-white rounded-circle d-flex align-items-center justify-content-center" style={{ width: 32, height: 32 }}>
                                {currentUser.name ? currentUser.name.charAt(0).toUpperCase() : 'U'}
                            </div>
                        )}
                    </div>
                    <input
                        type="text"
                        className="form-control"
                        placeholder="Add a new note..."
                        value={newNote}
                        onChange={(e) => setNewNote(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handlePost()}
                    />
                    <button className="btn btn-primary" onClick={handlePost} disabled={loading || !newNote.trim()}>
                        {loading ? 'Posting...' : 'Post'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CollaborativeNotes;

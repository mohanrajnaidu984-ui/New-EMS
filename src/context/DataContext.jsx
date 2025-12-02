import React, { createContext, useState, useEffect, useContext } from 'react';
import {
    sourceOfInfos, enquiryType, consultantTypeOptions, allStatuses,
    availableRoles, projectNames, existingCustomers, clientNames,
    consultantNames, concernedSEs, enquiryFor, storedUsers,
    storedContacts, storedCustomers, storedEnqItems, initialEnquiries
} from '../data/mockData';

const DataContext = createContext();

export const useData = () => useContext(DataContext);

export const DataProvider = ({ children }) => {
    // --- API Integration ---
    const API_URL = 'http://localhost:5000/api';

    // Master Data State
    const [masters, setMasters] = useState({
        sourceOfInfos,
        enquiryType,
        consultantTypeOptions,
        allStatuses,
        availableRoles,
        projectNames,
        existingCustomers: [], // Will fetch from DB
        clientNames,
        consultantNames,
        concernedSEs,
        enquiryFor,
        users: storedUsers,
        contacts: storedContacts,
        customers: [], // Will fetch from DB
        enqItems: storedEnqItems
    });

    const [enquiries, setEnquiries] = useState([]);

    // Fetch Data on Load
    useEffect(() => {
        const fetchData = async () => {
            try {
                const [enqRes, custRes, contRes, userRes, itemRes] = await Promise.all([
                    fetch(`${API_URL}/enquiries`),
                    fetch(`${API_URL}/customers`),
                    fetch(`${API_URL}/contacts`),
                    fetch(`${API_URL}/users`),
                    fetch(`${API_URL}/enquiry-items`)
                ]);

                const enqData = await enqRes.json();
                const custData = await custRes.json();
                const contData = await contRes.json();
                const userData = await userRes.json();
                const itemData = await itemRes.json();

                const enqMap = {};
                enqData.forEach(e => { enqMap[e.RequestNo] = e; });
                setEnquiries(enqMap);

                setMasters(prev => ({
                    ...prev,
                    existingCustomers: custData.filter(c => c.Category === 'Contractor').map(c => c.CompanyName),
                    clientNames: custData.filter(c => c.Category === 'Client').map(c => c.CompanyName),
                    consultantNames: custData.filter(c => c.Category === 'Consultant').map(c => c.CompanyName),
                    customers: custData,
                    contacts: contData,
                    users: userData,
                    concernedSEs: userData.map(u => u.FullName),
                    enqItems: itemData,
                    enquiryFor: itemData.map(i => i.ItemName)
                }));
            } catch (err) {
                console.error("API Fetch Error:", err);
            }
        };
        fetchData();
    }, []);

    const addMaster = async (type, data) => {
        let endpoint = '';
        switch (type) {
            case 'customer': endpoint = '/customers'; break;
            case 'contact': endpoint = '/contacts'; break;
            case 'user': endpoint = '/users'; break;
            case 'enquiryItem': endpoint = '/enquiry-items'; break;
            default: return;
        }

        try {
            const res = await fetch(`${API_URL}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (res.ok) {
                // Re-fetch or manually update state? Manual update is faster for UI.
                // But for simplicity and consistency, let's just append to local state.
                // However, we need to know the exact structure.
                // For now, I'll let the component handle the local state update via updateMasters
                // and this function just handles the DB save.
                return true;
            }
        } catch (err) {
            console.error(err);
            return false;
        }
    };

    const updateMaster = async (type, id, data) => {
        let endpoint = '';
        switch (type) {
            case 'enquiryItem': endpoint = `/enquiry-items/${id}`; break;
            case 'customer': endpoint = `/customers/${id}`; break;
            case 'contact': endpoint = `/contacts/${id}`; break;
            case 'user': endpoint = `/users/${id}`; break;
            default: return;
        }

        try {
            const res = await fetch(`${API_URL}${endpoint}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            return res.ok;
        } catch (err) {
            console.error(err);
            return false;
        }
    };

    // Actions
    const addEnquiry = async (newEnquiry) => {
        try {
            const res = await fetch(`${API_URL}/enquiries`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newEnquiry)
            });
            if (res.ok) {
                // Update Local State
                setEnquiries(prev => ({
                    ...prev,
                    [newEnquiry.RequestNo]: newEnquiry
                }));
            } else {
                const errorText = await res.text();
                console.error('Save failed:', errorText);
                alert(`Failed to save to DB: ${errorText}`);
            }
        } catch (err) {
            console.error(err);
            alert('Server Error');
        }
    };

    const updateEnquiry = async (requestNo, updatedEnquiry) => {
        try {
            const res = await fetch(`${API_URL}/enquiries/${encodeURIComponent(requestNo)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedEnquiry)
            });
            if (res.ok) {
                setEnquiries(prev => ({
                    ...prev,
                    [requestNo]: updatedEnquiry
                }));
            } else {
                const errorText = await res.text();
                console.error('Update failed:', errorText);
                alert(`Failed to update enquiry: ${errorText}`);
            }
        } catch (err) {
            console.error(err);
            alert('Server Error');
        }
    };

    const getEnquiry = (requestNo) => {
        return enquiries[requestNo] || null;
    };

    const searchEnquiries = (criteria) => {
        // Implement search logic here later
        return Object.values(enquiries);
    };

    const value = {
        masters,
        enquiries,
        addEnquiry,
        updateEnquiry,
        getEnquiry,
        searchEnquiries,
        updateMasters: setMasters,
        addMaster,
        updateMaster
    };

    return (
        <DataContext.Provider value={value}>
            {children}
        </DataContext.Provider>
    );
};

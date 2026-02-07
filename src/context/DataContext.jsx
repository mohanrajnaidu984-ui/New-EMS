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
    const API_URL = '/api';

    // Master Data State
    const [masters, setMasters] = useState({
        sourceOfInfos,
        enquiryType,
        consultantTypeOptions,
        allStatuses,
        availableRoles,
        projectNames,
        existingCustomers: [], // Will fetch from DB
        clientNames: [], // Will fetch from DB
        consultantNames: [], // Will fetch from DB
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
                console.log('[DataContext] Starting data fetch...');

                const [enqRes, custRes, contRes, userRes, itemRes] = await Promise.all([
                    fetch(`${API_URL}/enquiries`).catch(err => {
                        console.error('[DataContext] Enquiries fetch failed:', err);
                        return { ok: false, json: () => [] };
                    }),
                    fetch(`${API_URL}/customers`).catch(err => {
                        console.error('[DataContext] Customers fetch failed:', err);
                        return { ok: false, json: () => [] };
                    }),
                    fetch(`${API_URL}/contacts`).catch(err => {
                        console.error('[DataContext] Contacts fetch failed:', err);
                        return { ok: false, json: () => [] };
                    }),
                    fetch(`${API_URL}/users`).catch(err => {
                        console.error('[DataContext] Users fetch failed:', err);
                        return { ok: false, json: () => [] };
                    }),
                    fetch(`${API_URL}/enquiry-items`).catch(err => {
                        console.error('[DataContext] Enquiry items fetch failed:', err);
                        return { ok: false, json: () => [] };
                    })
                ]);

                console.log('[DataContext] Fetch responses:', {
                    enquiries: enqRes.ok,
                    customers: custRes.ok,
                    contacts: contRes.ok,
                    users: userRes.ok,
                    items: itemRes.ok
                });

                const enqData = await enqRes.json();
                const custData = await custRes.json();
                const contData = await contRes.json();
                const userData = await userRes.json();
                const itemData = await itemRes.json();

                const enqMap = {};
                enqData.forEach(e => { enqMap[e.RequestNo] = e; });
                setEnquiries(enqMap);

                console.log('[DataContext] Customer data received:', custData.length, 'records');
                console.log('[DataContext] Sample customer:', custData[0]);

                // Check unique Category values
                const uniqueCategories = [...new Set(custData.map(c => c.Category))];
                console.log('[DataContext] Unique Category values:', uniqueCategories);

                // Show samples of each category
                const sampleContractor = custData.find(c => c.Category === 'Contractor');
                const sampleClient = custData.find(c => c.Category === 'Client');
                const sampleConsultant = custData.find(c => c.Category === 'Consultant');

                console.log('[DataContext] Sample Contractor:', sampleContractor);
                console.log('[DataContext] Sample Client:', sampleClient);
                console.log('[DataContext] Sample Consultant:', sampleConsultant);

                const contractors = custData.filter(c => c.Category === 'Contractor').map(c => c.CompanyName);
                const clients = custData.filter(c => c.Category === 'Client').map(c => c.CompanyName);
                const consultants = custData.filter(c => c.Category === 'Consultant').map(c => c.CompanyName);

                console.log('[DataContext] Contractors:', contractors.length);
                console.log('[DataContext] Clients:', clients.length, clients);
                console.log('[DataContext] Consultants:', consultants.length, consultants);

                setMasters(prev => ({
                    ...prev,
                    existingCustomers: contractors,
                    clientNames: clients,
                    consultantNames: consultants,
                    customers: custData,
                    contacts: contData,
                    users: userData,
                    concernedSEs: userData.map(u => u.FullName),
                    enqItems: itemData,
                    enquiryFor: itemData.map(i => i.ItemName)
                }));

                console.log('[DataContext] Masters updated successfully');
            } catch (err) {
                console.error("[DataContext] API Fetch Error:", err);
                console.error("[DataContext] Error stack:", err.stack);
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
                const responseData = await res.json();
                return responseData;
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

    const deleteMaster = async (type, id) => {
        let endpoint = '';
        switch (type) {
            case 'user': endpoint = `/users/${id}`; break;
            // Add other cases if needed later
            default: return;
        }

        try {
            const res = await fetch(`${API_URL}${endpoint}`, {
                method: 'DELETE'
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
                return { success: true };
            } else {
                let errorMessage = 'Failed to save to DB';
                try {
                    const text = await res.text();
                    try {
                        const errorData = JSON.parse(text);
                        errorMessage = errorData.error || errorData.message || errorMessage;
                    } catch {
                        errorMessage = text;
                    }
                } catch (e) {
                    console.error('Error reading response:', e);
                }
                console.error('Save failed:', errorMessage);
                alert(`Failed to save to DB: ${errorMessage}`);
                return { success: false, error: errorMessage };
            }
        } catch (err) {
            console.error(err);
            alert('Server Error');
            return { success: false, error: err.message };
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
        updateMaster,
        deleteMaster
    };

    return (
        <DataContext.Provider value={value}>
            {children}
        </DataContext.Provider>
    );
};

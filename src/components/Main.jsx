import React, { useState } from 'react';
import EnquiryForm from './Enquiry/EnquiryForm';
import SearchEnquiry from './Enquiry/SearchEnquiry';
import Dashboard from './Dashboard/Dashboard';
import PricingForm from './Pricing/PricingForm';

const Main = ({ activeTab, onTabChange }) => {
    const [enquiryToOpen, setEnquiryToOpen] = useState(null);

    const handleOpenEnquiry = (requestNo) => {
        setEnquiryToOpen(requestNo);
        onTabChange('New'); // Switch to Enquiry Form
    };

    // Reset enquiryToOpen when switching away from Enquiry/New
    React.useEffect(() => {
        if (activeTab !== 'New' && activeTab !== 'Search') {
            setEnquiryToOpen(null);
        }
    }, [activeTab]);

    return (
        <div>
            {/* Tab Content */}
            <div className="tab-content mt-3">
                {activeTab === 'Dashboard' && (
                    <Dashboard onNavigate={onTabChange} />
                )}
                {activeTab === 'New' && (
                    <EnquiryForm requestNoToOpen={enquiryToOpen} />
                )}
                {activeTab === 'Search' && (
                    <SearchEnquiry onOpen={handleOpenEnquiry} />
                )}
                {activeTab === 'Pricing' && (
                    <PricingForm />
                )}
                {activeTab === 'Quote' && (
                    <div className="alert alert-info">
                        <i className="bi bi-info-circle me-2"></i>
                        Quote module coming soon...
                    </div>
                )}
                {activeTab === 'Probability' && (
                    <div className="alert alert-info">
                        <i className="bi bi-info-circle me-2"></i>
                        Probability module coming soon...
                    </div>
                )}
                {activeTab === 'Reports' && (
                    <div className="alert alert-info">
                        <i className="bi bi-info-circle me-2"></i>
                        Reports module coming soon...
                    </div>
                )}
            </div>
        </div>
    );
};

export default Main;

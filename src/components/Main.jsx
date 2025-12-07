import React from 'react';
import EnquiryForm from './Enquiry/EnquiryForm';
import SearchEnquiry from './Enquiry/SearchEnquiry';
import Dashboard from './Dashboard/Dashboard';
import PricingForm from './Pricing/PricingForm';

const Main = ({ activeTab, onNavigate, enquiryToOpen }) => {
    return (
        <div className="pt-2">
            {/* Tab Content */}
            <div className="tab-content">
                {activeTab === 'Dashboard' && (
                    <div className="alert alert-info">
                        <i className="bi bi-info-circle me-2"></i>
                        Dashboard module coming soon...
                    </div>
                )}
                {activeTab === 'Enquiry' && (
                    <EnquiryForm requestNoToOpen={enquiryToOpen} />
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

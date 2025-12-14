import React from 'react';
import EnquiryForm from './Enquiry/EnquiryForm';
import SearchEnquiry from './Enquiry/SearchEnquiry';
import Dashboard from './Dashboard/Dashboard';
import PricingForm from './Pricing/PricingForm';

const Main = ({ activeTab, onNavigate, enquiryToOpen, onOpenEnquiry }) => {
    return (
        <div className="pt-2">
            {/* Tab Content */}
            <div className="tab-content">
                {activeTab === 'Dashboard' && (
                    <Dashboard onNavigate={onNavigate} onOpenEnquiry={onOpenEnquiry} />
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

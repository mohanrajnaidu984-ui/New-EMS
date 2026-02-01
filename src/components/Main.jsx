import React from 'react';
import EnquiryForm from './Enquiry/EnquiryForm';
import SearchEnquiry from './Enquiry/SearchEnquiry';
import Dashboard from './Dashboard/Dashboard';
import PricingForm from './Pricing/PricingForm';
import QuoteForm from './Quote/QuoteForm';
import ProbabilityForm from './Probability/ProbabilityForm';

import SalesReport from './SalesReport/SalesReport';

const Main = ({ activeTab, onNavigate, enquiryToOpen, onOpenEnquiry }) => {
    return (
        <div>
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
                    <QuoteForm />
                )}
                {activeTab === 'Probability' && (
                    <ProbabilityForm />
                )}
                {activeTab === 'Sales Report' && (
                    <SalesReport />
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

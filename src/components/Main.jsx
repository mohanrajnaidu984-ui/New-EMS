import React from 'react';
import EnquiryForm from './Enquiry/EnquiryForm';
import SearchEnquiry from './Enquiry/SearchEnquiry';
import Dashboard from './Dashboard/Dashboard';
import PricingForm from './Pricing/PricingForm';
import QuoteForm from './Quote/QuoteForm';
import ProbabilityForm from './Probability/ProbabilityForm';

import SalesReport from './SalesReport/SalesReport';
import SalesTarget from './SalesTarget/SalesTarget';

const Main = ({ activeTab, onNavigate, enquiryToOpen, openContext, onOpenEnquiry }) => {
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
                    <PricingForm openContext={openContext} />
                )}
                {activeTab === 'Quote' && (
                    <QuoteForm openContext={openContext} />
                )}
                {activeTab === 'Probability' && (
                    <ProbabilityForm />
                )}
                {activeTab === 'Sales Report' && (
                    <SalesReport />
                )}
                {activeTab === 'Reports' && (
                    <SalesTarget />
                )}
            </div>
        </div>
    );
};

export default Main;

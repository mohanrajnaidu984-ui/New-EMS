import React, { Suspense, lazy } from 'react';
import EnquiryForm from './Enquiry/EnquiryForm';
import SearchEnquiry from './Enquiry/SearchEnquiry';
import Dashboard from './Dashboard/Dashboard';
import PricingForm from './Pricing/PricingForm';
import QuoteForm from './Quote/QuoteForm';
import ProbabilityForm from './Probability/ProbabilityForm';

const SalesReport = lazy(() => import('./SalesReport/SalesReport'));
import SalesTarget from './SalesTarget/SalesTarget';
import About from './About/About';
import Help from './Help/Help';

const Main = ({ activeTab, onNavigate, enquiryToOpen, openContext, onOpenEnquiry }) => {
    return (
        <div>
            {/* Tab Content */}
            <div className="tab-content">
                {activeTab === 'Dashboard' && (
                    <Dashboard onNavigate={onNavigate} onOpenEnquiry={onOpenEnquiry} />
                )}
                {activeTab === 'About' && (
                    <About />
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
                    <Suspense
                        fallback={
                            <div className="d-flex justify-content-center align-items-center py-5">
                                <div className="spinner-border text-primary" role="status">
                                    <span className="visually-hidden">Loading report…</span>
                                </div>
                            </div>
                        }
                    >
                        <SalesReport />
                    </Suspense>
                )}
                {activeTab === 'Help' && (
                    <Help />
                )}
                {activeTab === 'Reports' && (
                    <SalesTarget />
                )}
            </div>
        </div>
    );
};

export default Main;

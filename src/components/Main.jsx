import React, { useState } from 'react';
import EnquiryForm from './Enquiry/EnquiryForm';
import SearchEnquiry from './Enquiry/SearchEnquiry';
import Dashboard from './Dashboard/Dashboard';
import PricingForm from './Pricing/PricingForm';

const Main = () => {
    const [activeTab, setActiveTab] = useState('Dashboard');
    const [enquiryToOpen, setEnquiryToOpen] = useState(null);

    const handleOpenEnquiry = (requestNo) => {
        setEnquiryToOpen(requestNo);
        setActiveTab('Enquiry');
    };

    const handleTabChange = (tab) => {
        setActiveTab(tab);
        if (tab !== 'Enquiry') {
            setEnquiryToOpen(null);
        }
    };

    return (
        <div>
            {/* Tab Navigation */}
            <ul className="nav nav-tabs mb-3">
                <li className="nav-item">
                    <button
                        className={`nav-link ${activeTab === 'Dashboard' ? 'active' : ''}`}
                        onClick={() => handleTabChange('Dashboard')}
                    >
                        <i className="bi bi-speedometer2 me-2"></i>
                        Dashboard
                    </button>
                </li>
                <li className="nav-item">
                    <button
                        className={`nav-link ${activeTab === 'Enquiry' ? 'active' : ''}`}
                        onClick={() => handleTabChange('Enquiry')}
                    >
                        <i className="bi bi-clipboard-data me-2"></i>
                        Enquiry
                    </button>
                </li>
                <li className="nav-item">
                    <button
                        className={`nav-link ${activeTab === 'Pricing' ? 'active' : ''}`}
                        onClick={() => handleTabChange('Pricing')}
                    >
                        <i className="bi bi-calculator me-2"></i>
                        Pricing
                    </button>
                </li>
                <li className="nav-item">
                    <button
                        className={`nav-link ${activeTab === 'Quote' ? 'active' : ''}`}
                        onClick={() => handleTabChange('Quote')}
                    >
                        <i className="bi bi-file-earmark-text me-2"></i>
                        Quote
                    </button>
                </li>
                <li className="nav-item">
                    <button
                        className={`nav-link ${activeTab === 'Probability' ? 'active' : ''}`}
                        onClick={() => handleTabChange('Probability')}
                    >
                        <i className="bi bi-graph-up me-2"></i>
                        Probability
                    </button>
                </li>
                <li className="nav-item">
                    <button
                        className={`nav-link ${activeTab === 'Reports' ? 'active' : ''}`}
                        onClick={() => handleTabChange('Reports')}
                    >
                        <i className="bi bi-file-earmark-bar-graph me-2"></i>
                        Reports
                    </button>
                </li>
            </ul>

            {/* Tab Content */}
            <div className="tab-content">
                {activeTab === 'Dashboard' && (
                    <Dashboard onNavigate={handleTabChange} />
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

import React from 'react';
import Header from './Header';
const MainLayout = ({ children, activeTab, onNavigate, onOpenEnquiry }) => {
    return (
        <div>
            {/* Header Self-Managed */}
            <Header activeTab={activeTab} onNavigate={onNavigate} onOpenEnquiry={onOpenEnquiry} />

            {/* Content Wrapper: Centered with 83% width */}
            <div className="container-fluid px-3" style={{ width: '83%', margin: '0 auto', paddingTop: '100px' }}>
                {children}
            </div>
        </div>
    );
};

export default MainLayout;

import React from 'react';
import Header from './Header';
const MainLayout = ({ children, activeTab, onNavigate, onOpenEnquiry }) => {
    return (
        <div>
            {/* Header Self-Managed */}
            <Header activeTab={activeTab} onNavigate={onNavigate} onOpenEnquiry={onOpenEnquiry} />

            {/* Content Wrapper: 100% for Dashboard, 83% for others */}
            <div
                className={`container-fluid ${activeTab === 'Dashboard' ? 'px-0' : 'px-4'}`}
                style={{
                    maxWidth: activeTab === 'Dashboard' ? '100%' : '100%',
                    width: '100%',
                    margin: '0 auto',
                    paddingTop: '100px' // Perfect flush fit
                }}
            >
                {children}
            </div>
        </div>
    );
};

export default MainLayout;

import React from 'react';
import Header from './Header';
const MainLayout = ({ children, activeTab, onNavigate, onOpenEnquiry }) => {
    return (
        <div style={{ height: '100vh', overflow: 'hidden' }}>
            {/* Header Self-Managed */}
            <Header activeTab={activeTab} onNavigate={onNavigate} onOpenEnquiry={onOpenEnquiry} />

            {/* Content Wrapper: 100% for Dashboard, 83% for others */}
            <div
                className={`container-fluid ${activeTab === 'Dashboard' || activeTab === 'Quote' ? 'px-0' : 'px-4'}`}
                style={{
                    maxWidth: activeTab === 'Dashboard' ? '100%' : '100%',
                    width: '100%',
                    margin: '0 auto',
                    marginTop: '72px', // Exact header height for flush fit
                    height: 'calc(100vh - 72px)',
                    overflowY: activeTab === 'Quote' ? 'hidden' : 'auto',
                    overflowX: 'hidden',
                }}
            >
                {activeTab === 'Quote' ? (
                    <div
                        style={{
                            paddingLeft: '4px',
                            paddingRight: '4px',
                            boxSizing: 'border-box',
                            width: '100%',
                            minHeight: 0,
                            height: '100%',
                        }}
                    >
                        {children}
                    </div>
                ) : (
                    children
                )}
            </div>
        </div>
    );
};

export default MainLayout;

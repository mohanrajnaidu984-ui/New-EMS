import React from 'react';
import Header from './Header';
const MainLayout = ({ children, activeTab, onTabChange }) => {
    return (
        <div>
            <Header activeTab={activeTab} onTabChange={onTabChange} />
            <div className="container-fluid px-3">
                {children}
            </div>
        </div>
    );
};

export default MainLayout;

import React from 'react';
import Header from './Header';
const MainLayout = ({ children }) => {
    return (
        <div>
            <Header />
            <div className="container-fluid px-3">
                {children}
            </div>
        </div>
    );
};

export default MainLayout;

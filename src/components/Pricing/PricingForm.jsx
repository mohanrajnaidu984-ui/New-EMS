import React from 'react';
import { Calculator } from 'lucide-react';

const PricingForm = () => {
    return (
        <div className="container-fluid p-4" style={{ backgroundColor: '#f4f6f9', minHeight: 'calc(100vh - 80px)' }}>
            <div className="d-flex flex-column align-items-center justify-content-center h-100" style={{ minHeight: '600px' }}>
                <div className="text-center p-5 bg-white shadow-sm rounded-4" style={{ maxWidth: '600px', width: '100%' }}>
                    <div className="mb-4 d-flex justify-content-center">
                        <div className="d-flex align-items-center justify-content-center rounded-circle bg-light" style={{ width: '100px', height: '100px' }}>
                            <Calculator size={48} className="text-primary" />
                        </div>
                    </div>
                    <h2 className="display-6 fw-bold text-dark mb-3">Pricing Module</h2>
                    <h3 className="text-primary mb-4">Coming Soon</h3>
                    <p className="text-muted lead mb-4">
                        We are currently working on this feature to bring you a comprehensive pricing estimation and management tool.
                        Please check back later!
                    </p>
                    <div className="progress" style={{ height: '8px', maxWidth: '300px', margin: '0 auto' }}>
                        <div
                            className="progress-bar progress-bar-striped progress-bar-animated bg-primary"
                            role="progressbar"
                            style={{ width: '65%' }}
                            aria-valuenow="65"
                            aria-valuemin="0"
                            aria-valuemax="100"
                        ></div>
                    </div>
                    <p className="text-muted small mt-2">Development in progress...</p>
                </div>
            </div>
        </div>
    );
};

export default PricingForm;

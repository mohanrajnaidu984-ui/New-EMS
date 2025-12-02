import React, { useState } from 'react';

const PricingForm = () => {
    const [formData, setFormData] = useState({
        client: '',
        mainContractor: '',
        consultant: '',
        revisionNo: '',
        startDate: '',
        endDate: '',
        contSumOriginal: '',
        variations: '',
        contSumFinal: '0.000',
        items: {
            preliminaries: { amount1: '', amount2: '' },
            totalMaterial: { amount1: '', amount2: '' },
            totalLabour: { amount1: '', amount2: '' },
            subContract: { amount1: '', amount2: '' },
            engineering: { amount1: '', amount2: '' },
            plantMachinery: { amount1: '', amount2: '' },
            consultancy: { amount1: '', amount2: '' },
            freeMaintenance: { amount1: '', amount2: '' },
        }
    });

    return (
        <div className="container" style={{ maxWidth: '1400px' }}>
            <div className="card shadow-sm">
                <div className="card-header bg-light">
                    <h5 className="mb-0 text-primary"><i className="bi bi-calculator me-2"></i>Pricing Summary</h5>
                </div>
                <div className="card-body p-4">
                    {/* Header Section */}
                    <div className="row g-3 mb-4 border p-3 rounded bg-white">
                        {/* Left Column */}
                        <div className="col-md-6">
                            <div className="row mb-2 align-items-center">
                                <label className="col-sm-3 col-form-label fw-bold">CLIENT:</label>
                                <div className="col-sm-9">
                                    <input type="text" className="form-control form-control-sm" />
                                </div>
                            </div>
                            <div className="row mb-2 align-items-center">
                                <label className="col-sm-3 col-form-label fw-bold">MAIN CONTRACTOR:</label>
                                <div className="col-sm-9">
                                    <input type="text" className="form-control form-control-sm" />
                                </div>
                            </div>
                            <div className="row mb-2 align-items-center">
                                <label className="col-sm-3 col-form-label fw-bold">CONSULTANT:</label>
                                <div className="col-sm-9">
                                    <input type="text" className="form-control form-control-sm" />
                                </div>
                            </div>
                        </div>

                        {/* Right Column */}
                        <div className="col-md-2">
                            <div className="row mb-2 align-items-center">
                                <label className="col-sm-4 col-form-label fw-bold text-danger">REVISION NO.:</label>
                                <div className="col-sm-8">
                                    <select className="form-select form-select-sm">
                                        <option value="">Select</option>
                                        <option value="0">0</option>
                                        <option value="1">1</option>
                                    </select>
                                </div>
                            </div>
                            <div className="row mb-2 align-items-center">
                                <label className="col-sm-4 col-form-label fw-bold">START DATE:</label>
                                <div className="col-sm-8">
                                    <input type="date" className="form-control form-control-sm" />
                                </div>
                            </div>
                            <div className="row mb-2 align-items-center">
                                <label className="col-sm-4 col-form-label fw-bold">END DATE:</label>
                                <div className="col-sm-8">
                                    <input type="date" className="form-control form-control-sm" />
                                </div>
                            </div>
                        </div>

                        {/* Bottom Row of Header */}
                        <div className="col-4 mt-2">
                            <div className="row align-items-center">
                                <label className="col-md-1 col-form-label fw-bold">CONT. SUM ORIGINAL:</label>
                                <div className="col-md-2">
                                    <input type="number" className="form-control form-control-sm" />
                                </div>
                                <label className="col-md-1 col-form-label fw-bold text-end">VARIATIONS:</label>
                                <div className="col-md-2">
                                    <input type="number" className="form-control form-control-sm" />
                                </div>
                                <label className="col-md-1 col-form-label fw-bold text-end">CONT. SUM FINAL:</label>
                                <div className="col-md-2">
                                    <input type="text" className="form-control form-control-sm bg-warning fw-bold text-end" value="BD 0.000" readOnly />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Main Table */}
                    <div className="table-responsive">
                        <table className="table table-bordered table-sm table-hover align-middle">
                            <thead className="table-light text-center">
                                <tr>
                                    <th style={{ width: '5%' }}>Sl.No.</th>
                                    <th style={{ width: '10%' }}>PARTICULARS</th>
                                    <th style={{ width: '5%' }}>
                                        <div>REVISION NO.:</div>
                                        <div className="small text-muted">AMOUNT (BD)</div>
                                    </th>
                                    <th style={{ width: '10%' }}>
                                        <div>REVISION NO.:</div>
                                        <div className="small text-muted">AMOUNT (BD)</div>
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {/* 1.0 Items */}
                                {[
                                    { id: '1.01', label: 'Preliminaries (Details attached) Annex.1' },
                                    { id: '1.02', label: 'Total Material (Details Attached) - Annex.2' },
                                    { id: '1.03', label: 'Total Labour (Details Attached)- Annex.3' },
                                    { id: '1.04', label: 'Sub-Contract (Details Attached) - Annex.4' },
                                    { id: '1.05', label: 'Engineering & Supervision' },
                                    { id: '1.06', label: 'Plant & Machinery (Purchase/Hire)' },
                                    { id: '1.07', label: 'Consultancy' },
                                    { id: '1.08', label: 'Free Maintenance Provision' },
                                    { id: '1.09', label: '' },
                                ].map((item, idx) => (
                                    <tr key={idx}>
                                        <td className="text-center">{item.id}</td>
                                        <td>{item.label}</td>
                                        <td><input type="number" className="form-control form-control-sm text-end" placeholder="0.000" /></td>
                                        <td><input type="number" className="form-control form-control-sm text-end" placeholder="0.000" /></td>
                                    </tr>
                                ))}

                                {/* Sub Total A */}
                                <tr className="fw-bold bg-light">
                                    <td></td>
                                    <td className="text-end">SUB TOTAL (A)</td>
                                    <td className="text-end">0.000</td>
                                    <td className="text-end">0.000</td>
                                </tr>

                                {/* Overheads B */}
                                <tr>
                                    <td className="text-center">2.0</td>
                                    <td className="text-end">OVER HEADS (B)</td>
                                    <td><input type="number" className="form-control form-control-sm text-end" placeholder="0.000" /></td>
                                    <td><input type="number" className="form-control form-control-sm text-end" placeholder="0.000" /></td>
                                </tr>

                                {/* Sub Total C */}
                                <tr className="fw-bold bg-light">
                                    <td></td>
                                    <td className="text-end">SUB TOTAL (C=A+B)</td>
                                    <td className="text-end">0.000</td>
                                    <td className="text-end">0.000</td>
                                </tr>

                                {/* 3.0 Items */}
                                {[
                                    { id: '3.1', label: 'Provisional Sum' },
                                    { id: '3.2', label: 'Contigencies' },
                                    { id: '3.3', label: 'Day Works' },
                                    { id: '3.4', label: '' },
                                    { id: '3.5', label: '' },
                                ].map((item, idx) => (
                                    <tr key={`3-${idx}`}>
                                        <td className="text-center">{item.id}</td>
                                        <td>{item.label}</td>
                                        <td><input type="number" className="form-control form-control-sm text-end" placeholder="0.000" /></td>
                                        <td><input type="number" className="form-control form-control-sm text-end" placeholder="0.000" /></td>
                                    </tr>
                                ))}

                                {/* Sub Total D */}
                                <tr className="fw-bold bg-light">
                                    <td></td>
                                    <td className="text-end">SUB TOTAL (D)</td>
                                    <td className="text-end">0.000</td>
                                    <td className="text-end">0.000</td>
                                </tr>

                                {/* Primary Job Margin */}
                                <tr>
                                    <td className="text-center">4.0</td>
                                    <td className="text-end">PRIMARY JOB MARGIN</td>
                                    <td><input type="number" className="form-control form-control-sm text-end" placeholder="0.000" /></td>
                                    <td><input type="number" className="form-control form-control-sm text-end" placeholder="0.000" /></td>
                                </tr>

                                {/* Total Primary Job Value */}
                                <tr className="fw-bold table-info">
                                    <td className="text-center">5.0</td>
                                    <td className="text-end">TOTAL PRIMARY JOB VALUE (BD)</td>
                                    <td className="text-end">0.000</td>
                                    <td className="text-end">0.000</td>
                                </tr>

                                {/* Sub Jobs Details Header */}
                                <tr>
                                    <td className="text-center">6.0</td>
                                    <td colSpan="3" className="fw-bold">SUB JOBS DETAILS</td>
                                </tr>
                                <tr className="bg-light">
                                    <td></td>
                                    <td className="d-flex">
                                        <div className="w-50 text-center fw-bold border-end">DIVISION</div>
                                        <div className="w-50 text-center fw-bold">JOB NO.</div>
                                    </td>
                                    <td></td>
                                    <td></td>
                                </tr>

                                {/* Sub Jobs Rows */}
                                {['6.1', '6.2', '6.3', '6.4', '6.5', '6.6'].map((id) => (
                                    <tr key={id}>
                                        <td className="text-center">{id}</td>
                                        <td className="d-flex p-0">
                                            <input type="text" className="form-control form-control-sm border-0 rounded-0 w-50 border-end" />
                                            <input type="text" className="form-control form-control-sm border-0 rounded-0 w-50" />
                                        </td>
                                        <td><input type="number" className="form-control form-control-sm text-end" placeholder="0.000" /></td>
                                        <td><input type="number" className="form-control form-control-sm text-end" placeholder="0.000" /></td>
                                    </tr>
                                ))}

                                {/* Total Sub Jobs Value E */}
                                <tr className="fw-bold bg-light">
                                    <td></td>
                                    <td className="text-end">TOTAL SUB JOBS VALUE (E)</td>
                                    <td className="text-end">0.000</td>
                                    <td className="text-end">0.000</td>
                                </tr>

                                {/* Subtotal F */}
                                <tr className="fw-bold bg-light">
                                    <td></td>
                                    <td className="text-end">SUBTOTAL (F=D+E)</td>
                                    <td className="text-end">0.000</td>
                                    <td className="text-end">0.000</td>
                                </tr>

                                {/* Total Project Margin */}
                                <tr>
                                    <td className="text-center">7.0</td>
                                    <td className="text-end">TOTAL PROJECT MARGIN</td>
                                    <td><input type="number" className="form-control form-control-sm text-end" placeholder="0.000" /></td>
                                    <td><input type="number" className="form-control form-control-sm text-end" placeholder="0.000" /></td>
                                </tr>

                                {/* Total Project Value */}
                                <tr className="fw-bold table-primary">
                                    <td></td>
                                    <td className="text-end">TOTAL PROJECT VALUE (BD)</td>
                                    <td className="text-end">0.000</td>
                                    <td className="text-end">0.000</td>
                                </tr>

                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PricingForm;

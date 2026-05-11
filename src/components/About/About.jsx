import React from 'react';

const About = () => {
  return (
    <div className="py-3 d-flex justify-content-center">
      <div className="card border-0 shadow-sm" style={{ width: '50%', minWidth: '320px', maxWidth: '100%' }}>
        <div className="card-body p-4">
          <h4 className="mb-3" style={{ color: '#20396D', fontWeight: 700 }}>
            About EMS
          </h4>
          <p className="mb-3 text-secondary">
            EMS (Enquiry Management System) is a unified platform to manage the complete business flow
            from enquiry to reporting with consistent data, faster updates, and better visibility.
          </p>

          <div className="mb-3 text-secondary">
            <p className="mb-1">
              <strong>Latest update highlights:</strong>
            </p>
            <ul className="mb-0" style={{ paddingLeft: '1.1rem' }}>
              <li>Refined login journey with step-based email verification and sign-in flow.</li>
              <li>First-time users now complete password setup directly in the login process.</li>
              <li>Forgot password sends temporary credentials to registered email for recovery.</li>
              <li>Password policy is enforced with minimum 10 characters, uppercase, lowercase, number, and special character.</li>
              <li>Header and login branding updated to the latest EMS visual style.</li>
            </ul>
          </div>

          <div className="mb-2">
            <h6 className="mb-1" style={{ color: '#20396D', fontWeight: 700 }}>Application Sections</h6>
            <div className="text-secondary">
              <p className="mb-2">
                <strong>Dashboard:</strong> The Dashboard provides a consolidated snapshot of business activity. It helps users quickly identify
                pending actions, recent updates, and overall movement across major modules. This section is designed for daily review so teams can
                prioritize work without opening each module one by one.
              </p>
              <p className="mb-2">
                <strong>Enquiry:</strong> The Enquiry module is the starting point for opportunity capture. Users can register new requests, store
                customer and project details, assign ownership, and maintain enquiry history for traceability. It acts as the master source for
                downstream pricing, quoting, and follow-up processes.
              </p>
              <p className="mb-2">
                <strong>Pricing:</strong> The Pricing module supports commercial evaluation and cost-to-value preparation. Teams can analyze scope,
                prepare estimate values, and align commercial assumptions before quote submission. This section ensures internal validation and
                improves consistency in quote preparation.
              </p>
              <p className="mb-2">
                <strong>Quote:</strong> The Quote module manages formal customer submissions. It supports quote reference selection, revision handling,
                lead job mapping, and structured quote output. Users can maintain quote continuity from first issue to later revisions while preserving
                audit visibility on what was submitted and when.
              </p>
              <p className="mb-2">
                <strong>Probability:</strong> The Probability module is used to monitor opportunity progression and decision status. Teams can update
                outcomes such as Won, Lost, Follow Up, On Hold, Cancelled, and Retendered, along with remarks, dates, expected booking details,
                and ownership context. This module provides the operational layer for pipeline health and sales follow-up discipline.
              </p>
              <p className="mb-2">
                <strong>Sales Report:</strong> The Sales Report module transforms transaction-level data into performance insights. It includes
                top-jobs views, dynamic status-based summaries, chart visualizations, and filter-driven analysis by Division and SE. It helps leadership
                and sales teams understand current performance, high-value opportunities, and trend direction.
              </p>
              <p className="mb-0">
                <strong>Sales Target:</strong> The Sales Target module tracks planned goals against actual achievement over defined periods. It supports
                performance review by highlighting progress levels, shortfalls, and coverage against assigned targets. This enables focused follow-up,
                better forecasting discussions, and accountability across teams.
              </p>
            </div>
          </div>

          <hr className="my-3" />
          <p className="mb-1 text-secondary">
            This product is the property of Almoayyed Contracting Group.
          </p>
          <p className="mb-0" style={{ color: '#20396D', fontWeight: 600 }}>
            Developed by Mohan Naidu
          </p>
        </div>
      </div>
    </div>
  );
};

export default About;

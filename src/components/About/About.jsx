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
              <li>Refined login journey with step-based email verification, first-time password setup, and forgot-password recovery.</li>
              <li>Password policy enforced: minimum 10 characters with uppercase, lowercase, number, and special character.</li>
              <li>Dashboard calendar aligned for Due and Lapsed: monthly totals match day-by-day chips; list popups use the same rules.</li>
              <li>
                Due shows enquiries with no quote and due date today or later; Lapsed shows past-due enquiries with no quote.
                Any quote on an enquiry removes it from Due/Lapsed.
              </li>
              <li>
                Enquiry module: internal notification email to concerned SEs (via Outlook on Windows) and optional customer
                acknowledgement drafts—one draft per customer contact when enabled.
              </li>
              <li>
                Quote module: A4 preview, vector PDF download with document protection, and Outlook draft/email for quote PDFs.
              </li>
              <li>Quote pricing summary table styling improved in preview and PDF output.</li>
            </ul>
          </div>

          <div className="mb-2">
            <h6 className="mb-1" style={{ color: '#20396D', fontWeight: 700 }}>Application Sections</h6>
            <div className="text-secondary">
              <p className="mb-2">
                <strong>Dashboard:</strong> Dual calendar views with monthly overview (Enquiry Received, Due, Lapsed, Quoted).
                Filter by division and sales engineer. Click day chips or monthly bars to open matching enquiry lists.
                Due and Lapsed counts reflect open enquiries without quotes, using the same logic in the calendar and popups.
              </p>
              <p className="mb-2">
                <strong>Enquiry:</strong> Register and modify enquiries with customers, received-from contacts, enquiry-for
                hierarchy, concerned SEs, attachments, and status. On add enquiry, an internal Outlook notification can be sent
                to all concerned SEs. Optional customer acknowledgement opens Outlook drafts (one per customer) when
                &quot;Send acknowledgement mail&quot; is selected with a point-of-contact SE.
              </p>
              <p className="mb-2">
                <strong>Pricing:</strong> Commercial evaluation with job hierarchy, base price and options, and summary views
                linked to enquiry scope. Supports validation before quote preparation.
              </p>
              <p className="mb-2">
                <strong>Quote:</strong> Formal customer quotes with clause editor, A4 preview, lead job mapping, revisions,
                and pricing summary tables. Download protected PDF or open Outlook draft with quote PDF attached. Preview
                matches PDF layout for cover letter, headers, and clause content.
              </p>
              <p className="mb-2">
                <strong>Probability:</strong> Pipeline status (Won, Lost, Follow Up, On Hold, Cancelled, Retendered) with
                status-specific fields, remarks, and ownership context for sales discipline.
              </p>
              <p className="mb-2">
                <strong>Sales Report:</strong> Performance insights with division/SE filters, charts, top-jobs tables, and
                status-based analysis across quoted, won, lost, and follow-up opportunities.
              </p>
              <p className="mb-0">
                <strong>Sales Target:</strong> Planned goals versus actual achievement by period, with progress and gap
                visibility for forecasting and accountability.
              </p>
            </div>
          </div>

          <hr className="my-3" />
          <p className="mb-1 text-secondary">
            This application is the property of Almoayyed Contracting Group.
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

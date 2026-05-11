import React from 'react';

const sectionTitleStyle = { color: '#20396D', fontWeight: 700 };

const Help = () => {
  return (
    <div className="py-3 d-flex justify-content-center">
      <div className="card border-0 shadow-sm" style={{ width: '50%', minWidth: '320px', maxWidth: '100%' }}>
        <div className="card-body p-4">
          <h4 className="mb-2" style={sectionTitleStyle}>Help - User Manual</h4>
          <p className="text-secondary mb-4">
            This guide reflects the latest EMS application flow. It covers how to access the app, complete
            authentication steps, and use each module with practical process guidance.
          </p>

          <h6 className="mb-2" style={sectionTitleStyle}>Access, Login and Password Setup (Detailed)</h6>
          <div className="text-secondary mb-4">
            <p className="mb-1"><strong>1. Open the application</strong></p>
            <ol className="mb-2" style={{ paddingLeft: '1.1rem' }}>
              <li>Open a supported browser (Chrome or Edge recommended).</li>
              <li>Enter the EMS URL provided by your IT/admin team.</li>
              <li>Wait for the EMS sign-in screen to load fully before entering details.</li>
            </ol>

            <p className="mb-1"><strong>2. First-time login flow (create password)</strong></p>
            <ol className="mb-2" style={{ paddingLeft: '1.1rem' }}>
              <li>Enter your registered official email address and click <strong>Next</strong>.</li>
              <li>If your account is marked first-time, EMS opens the password setup step automatically.</li>
              <li>Enter a new password and confirm it.</li>
              <li>Password policy: minimum 10 characters with at least 1 uppercase, 1 lowercase, 1 number, and 1 special character.</li>
              <li>Click <strong>Set Password & Login</strong> to continue into the application.</li>
            </ol>

            <p className="mb-1"><strong>3. Regular sign-in flow</strong></p>
            <ol className="mb-2" style={{ paddingLeft: '1.1rem' }}>
              <li>Enter your registered email and click <strong>Next</strong>.</li>
              <li>Enter your password on the sign-in step.</li>
              <li>Optionally enable <strong>Remember me</strong> if allowed on your machine.</li>
              <li>Click <strong>Sign In</strong>.</li>
            </ol>

            <p className="mb-1"><strong>4. Forgot password flow</strong></p>
            <ol className="mb-2" style={{ paddingLeft: '1.1rem' }}>
              <li>On the password step, click <strong>Forgot Password?</strong>.</li>
              <li>Submit the request for your registered email.</li>
              <li>EMS sends a temporary password to your email address.</li>
              <li>Sign in using the temporary password, then immediately update your password from profile options.</li>
            </ol>

            <p className="mb-1"><strong>5. Change password after login</strong></p>
            <ol className="mb-0" style={{ paddingLeft: '1.1rem' }}>
              <li>Open user/profile controls in the top-right area.</li>
              <li>Select <strong>Change Password</strong>.</li>
              <li>Enter current password, new password, and confirm password.</li>
              <li>New password must follow the same 10-character complexity policy.</li>
            </ol>
          </div>

          <h6 className="mb-2" style={sectionTitleStyle}>Login Troubleshooting</h6>
          <div className="text-secondary mb-4">
            <ul className="mb-0" style={{ paddingLeft: '1.1rem' }}>
              <li>If email is not recognized, verify spelling and contact admin to confirm your account is active.</li>
              <li>If password is rejected, verify uppercase/lowercase and special characters exactly.</li>
              <li>If page looks stale after updates, do a hard refresh once (Ctrl+F5).</li>
              <li>If sign-in still fails after reset, contact IT/admin with your email and timestamp of attempt.</li>
            </ul>
          </div>

          <h6 className="mb-2" style={sectionTitleStyle}>How To Use EMS (End-to-End)</h6>
          <ol className="text-secondary mb-4" style={{ paddingLeft: '1.1rem' }}>
            <li>Create or open an enquiry in the Enquiry module.</li>
            <li>Prepare pricing details in Pricing.</li>
            <li>Create quote and revisions in Quote.</li>
            <li>Track status progression in Probability.</li>
            <li>Analyze outcomes in Sales Report.</li>
            <li>Set targets in Sales Target.</li>
          </ol>

          <div className="text-secondary mb-4">
            <p className="mb-1"><strong>Operational Process (Detailed):</strong></p>
            <ol className="mb-0" style={{ paddingLeft: '1.1rem' }}>
              <li><strong>Capture:</strong> Register enquiry with customer, project scope, and source details.</li>
              <li><strong>Qualify:</strong> Division ownership and SE responsibility are assigned for action tracking.</li>
              <li><strong>Estimate:</strong> Prepare commercial values and validate assumptions.</li>
              <li><strong>Submit:</strong> Issue customer quote reference and create revisions if required.</li>
              <li><strong>Follow-up:</strong> Probability status is updated based on market/customer response.</li>
              <li><strong>Close/Carry:</strong> Enquiry is marked Won/Lost or carried as Follow Up/On Hold.</li>
              <li><strong>Review:</strong> Use Sales Report and Sales Target for period review and planning.</li>
            </ol>
          </div>

          <h6 className="mb-2" style={sectionTitleStyle}>Module-Wise User Manual</h6>

          <div className="text-secondary mb-3">
            <p className="mb-1"><strong>1. Dashboard</strong></p>
            <p className="mb-1">
              <strong>Purpose:</strong> Quick business snapshot and navigation center.
            </p>
            <p className="mb-1">
              <strong>What to review:</strong> latest activities, pending items, summary visuals, and movement trends.
            </p>
            <p className="mb-1">
              <strong>Typical user action:</strong> Start the day on Dashboard, identify priority items, then open Enquiry/Pricing/Probability directly.
            </p>
            <p className="mb-0">
              <strong>Example:</strong> If pending follow-ups increased today, navigate to Probability and update due records first.
            </p>
            <p className="mb-0 mt-1">
              <strong>Process view:</strong> Dashboard -> identify priority -> open specific module -> complete update -> return for next priority.
            </p>
            <p className="mb-0 mt-1">
              <strong>Expected output:</strong> Clear daily action queue and faster navigation to pending records.
            </p>
          </div>

          <div className="text-secondary mb-3">
            <p className="mb-1"><strong>2. Enquiry</strong></p>
            <p className="mb-1">
              <strong>Purpose:</strong> Create and maintain enquiry master data.
            </p>
            <p className="mb-1">
              <strong>Key fields:</strong> enquiry number, customer, project name, source, division, assigned SE, scope details.
            </p>
            <p className="mb-1">
              <strong>How to use:</strong> Create new enquiry, validate mandatory fields, save, then use modify/search flows for updates.
            </p>
            <p className="mb-0">
              <strong>Example:</strong> Customer submits a new MEP request. Register enquiry with project location, assign division, then pass to Pricing.
            </p>
            <p className="mb-0 mt-1">
              <strong>Step process:</strong> New Enquiry -> fill mandatory fields -> save -> verify generated enquiry reference -> move to Pricing.
            </p>
            <p className="mb-0 mt-1">
              <strong>Validation notes:</strong> Ensure customer name, project name, division, and contact context are complete before save.
            </p>
            <p className="mb-0 mt-1">
              <strong>Expected output:</strong> One reliable enquiry record that all downstream modules can reference.
            </p>
          </div>

          <div className="text-secondary mb-3">
            <p className="mb-1"><strong>3. Pricing</strong></p>
            <p className="mb-1">
              <strong>Purpose:</strong> Convert enquiry scope into commercial estimate values.
            </p>
            <p className="mb-1">
              <strong>Key activities:</strong> item-level pricing, totals, net value checks, margin assumptions, internal review.
            </p>
            <p className="mb-1">
              <strong>How to use:</strong> Open the enquiry context, enter/update values, cross-check consistency, then finalize for quote stage.
            </p>
            <p className="mb-0">
              <strong>Example:</strong> If material cost changed, revise pricing lines and confirm updated totals before issuing a revised quote.
            </p>
            <p className="mb-0 mt-1">
              <strong>Step process:</strong> Load enquiry -> update commercial lines -> validate totals/net value -> confirm for quote preparation.
            </p>
            <p className="mb-0 mt-1">
              <strong>Validation notes:</strong> Recheck arithmetic consistency between item totals, quoted value, and net value before forwarding.
            </p>
            <p className="mb-0 mt-1">
              <strong>Expected output:</strong> Finalized commercial basis ready for quote release.
            </p>
          </div>

          <div className="text-secondary mb-3">
            <p className="mb-1"><strong>4. Quote</strong></p>
            <p className="mb-1">
              <strong>Purpose:</strong> Manage customer-facing quotes and revisions.
            </p>
            <p className="mb-1">
              <strong>Key activities:</strong> select enquiry, create quote reference, track quote date, update revision, map lead job and customer.
            </p>
            <p className="mb-1">
              <strong>How to use:</strong> Create initial quote, then issue revisions when required. Ensure latest revision reflects final commercial terms.
            </p>
            <p className="mb-0">
              <strong>Example:</strong> Quote Ref R0 issued on first submission; after negotiation, create R1 with changed value and keep both in history.
            </p>
            <p className="mb-0 mt-1">
              <strong>Step process:</strong> Select enquiry -> create quote reference -> publish/send -> if revised, create next revision with reason.
            </p>
            <p className="mb-0 mt-1">
              <strong>Validation notes:</strong> Always confirm latest revision selection before status updates in Probability.
            </p>
            <p className="mb-0 mt-1">
              <strong>Expected output:</strong> Complete quote trail with clear revision history and dates.
            </p>
          </div>

          <div className="text-secondary mb-3">
            <p className="mb-1"><strong>5. Probability</strong></p>
            <p className="mb-1">
              <strong>Purpose:</strong> Control pipeline status and follow-up outcomes.
            </p>
            <p className="mb-1">
              <strong>Status usage:</strong> Won, Lost, Follow Up, On Hold, Cancelled, Retendered.
            </p>
            <p className="mb-1">
              <strong>How to use:</strong> Select status, fill status-specific details (reason, remarks, expected/booked date, job value, GP), and save.
            </p>
            <p className="mb-0">
              <strong>Example:</strong> For Lost, capture lost-to contractor and reason. For Won, enter ERP job no., booked date, job value, and GP%.
            </p>
            <p className="mb-0 mt-1">
              <strong>Step process:</strong> Select status -> enter status-specific fields -> save update -> verify row reflects latest status.
            </p>
            <p className="mb-0 mt-1">
              <strong>Status field guide:</strong> Lost requires lost-to/reason; Follow Up requires probability and remarks; Won requires job value, GP, and booked date.
            </p>
            <p className="mb-0 mt-1">
              <strong>Expected output:</strong> Accurate latest-status pipeline record usable by reports and target tracking.
            </p>
          </div>

          <div className="text-secondary mb-3">
            <p className="mb-1"><strong>6. Sales Report</strong></p>
            <p className="mb-1">
              <strong>Purpose:</strong> View analytical insights across enquiries, quotes, and probability outcomes.
            </p>
            <p className="mb-1">
              <strong>How to use:</strong> Apply filters for Division and SE, then review charts and top-job tables by status.
            </p>
            <p className="mb-1">
              <strong>What to monitor:</strong> quoted value, won value, loss trends, follow-up pipeline, gross profit movement.
            </p>
            <p className="mb-0">
              <strong>Example:</strong> Select Division A + SE All and compare Won vs Lost distribution to identify conversion gaps.
            </p>
            <p className="mb-0 mt-1">
              <strong>Step process:</strong> Apply filters -> review charts/table -> compare status buckets -> prepare action list for pending opportunities.
            </p>
            <p className="mb-0 mt-1">
              <strong>Expected output:</strong> Insight-driven follow-up priorities and conversion analysis.
            </p>
            <p className="mb-0 mt-1">
              <strong>Section-wise explanation:</strong>
            </p>
            <ul className="mb-0" style={{ paddingLeft: '1.1rem' }}>
              <li><strong>Top Filter Section:</strong> Division and SE filters define report scope. All charts and tables refresh based on this selection.</li>
              <li><strong>Summary/KPI Section:</strong> Shows consolidated high-level values for quick health check before deep analysis.</li>
              <li><strong>Top Jobs Section:</strong> Status-driven detailed table (Quoted/Won/Lost/Follow Up/Pending) with job-wise value context.</li>
              <li><strong>Pipeline/Status Section:</strong> Visual distribution of opportunities by stage/status to identify movement and backlog.</li>
            </ul>
            <p className="mb-0 mt-2">
              <strong>Chart-wise explanation:</strong>
            </p>
            <ul className="mb-0" style={{ paddingLeft: '1.1rem' }}>
              <li><strong>Actual Bars:</strong> Represent achieved values in the selected scope. Compare periods to detect growth/decline.</li>
              <li><strong>Pipeline Chart:</strong> Represents in-progress opportunity value by probability/status. Higher pending concentration indicates follow-up load.</li>
              <li><strong>Status Comparison View:</strong> Won vs Lost vs Follow Up mix helps understand conversion quality.</li>
              <li><strong>Trend Interpretation:</strong> Rising quoted with flat won indicates conversion delay; rising lost indicates pricing/competition pressure.</li>
            </ul>
            <p className="mb-0 mt-2">
              <strong>Detailed analysis process:</strong> Select Division/SE -> review Actual bars period-wise -> inspect Pipeline concentration -> open Top Jobs by status ->
              identify high-value actionable records -> update Probability/Quote records -> recheck chart movement.
            </p>
            <p className="mb-0 mt-2">
              <strong>How to read the report correctly (expanded):</strong>
            </p>
            <ul className="mb-0" style={{ paddingLeft: '1.1rem' }}>
              <li>
                <strong>Step 1 - Define scope first:</strong> Always start with Division and SE filter confirmation. If scope is incorrect, every metric and chart interpretation becomes invalid.
              </li>
              <li>
                <strong>Step 2 - Read achieved value trend:</strong> Use Actual bars to identify whether performance is stable, rising, or declining across periods. Compare with the previous period before drawing conclusions.
              </li>
              <li>
                <strong>Step 3 - Validate pipeline support:</strong> Check pipeline chart to confirm if upcoming potential is sufficient to support expected achievement. Large pipeline with low conversion indicates execution gap.
              </li>
              <li>
                <strong>Step 4 - Drill into Top Jobs table:</strong> Switch status dropdown (Quoted, Won, Lost, Follow Up, Pending) and inspect high-value rows first, then medium-value rows with near-term impact.
              </li>
              <li>
                <strong>Step 5 - Diagnose conversion issues:</strong> If Quoted value is high but Won is low, inspect Lost reasons and Follow Up probability bands. This helps identify whether delay is commercial, competitive, or tracking related.
              </li>
              <li>
                <strong>Step 6 - Convert analysis into action:</strong> Use identified rows to update Probability status, remarks, and dates. Reports become useful only when insights are converted into record-level updates.
              </li>
            </ul>
            <p className="mb-0 mt-2">
              <strong>Status-wise interpretation guide:</strong>
            </p>
            <ul className="mb-0" style={{ paddingLeft: '1.1rem' }}>
              <li><strong>Quoted high + Pending high:</strong> Opportunity exists, but progress actions may be pending.</li>
              <li><strong>Follow Up high with old dates:</strong> Review for stale opportunities and refresh expected timelines.</li>
              <li><strong>Lost rising period-over-period:</strong> Validate pricing competitiveness and reason patterns.</li>
              <li><strong>Won rising with healthy GP:</strong> Indicates better conversion quality and commercial discipline.</li>
              <li><strong>Won rising but GP falling:</strong> Revenue is improving, but margin protection requires review.</li>
            </ul>
            <p className="mb-0 mt-2">
              <strong>Recommended review frequency:</strong> Use the report for daily operational checks and weekly trend reviews.
              Daily focus should be on Follow Up/Pending movement; weekly focus should be on Won-Lost ratio and value trend direction.
            </p>
            <p className="mb-0 mt-2">
              <strong>Example walkthrough:</strong> If Division A shows strong quoted value but weak won value, switch Top Jobs to Lost and Follow Up,
              identify top 10 values, check remarks/expected dates, update Probability for latest market position, then return to Sales Report and verify
              whether the next cycle shows improved won conversion.
            </p>
          </div>

          <div className="text-secondary mb-3">
            <p className="mb-1"><strong>7. Sales Target</strong></p>
            <p className="mb-1">
              <strong>Purpose:</strong> Measure target achievement and forecast completion risk.
            </p>
            <p className="mb-1">
              <strong>How to use:</strong> Set period-wise targets first, then review actual achieved amount and pending gap.
            </p>
            <p className="mb-1">
              <strong>Usage focus:</strong> identify underperforming periods/divisions and plan corrective actions.
            </p>
            <p className="mb-0">
              <strong>Example:</strong> If Q2 target achievement is below plan, use Probability + Sales Report to prioritize high-probability follow-ups.
            </p>
            <p className="mb-0 mt-1">
              <strong>Step process:</strong> Check target gap -> identify pipeline support value -> assign actions -> review progress in next cycle.
            </p>
            <p className="mb-0 mt-1">
              <strong>Expected output:</strong> Measurable target plan with periodic progress checkpoints.
            </p>
            <p className="mb-0 mt-1">
              <strong>Detailed setup process:</strong> Select year/period -> enter target value by required scope -> save -> verify reflected baseline -> compare against live achieved value.
            </p>
            <p className="mb-0 mt-1">
              <strong>Detailed review process:</strong> Review target vs achieved weekly -> note shortfall trend -> cross-check open Follow Up/Won-ready opportunities -> update action priorities -> recheck closure in next review cycle.
            </p>
          </div>

          <div className="text-secondary mb-3">
            <p className="mb-1"><strong>Common Process Controls</strong></p>
            <ul className="mb-0" style={{ paddingLeft: '1.1rem' }}>
              <li>Use the same enquiry reference across Pricing, Quote, and Probability to avoid data mismatch.</li>
              <li>Update Probability immediately after any commercial or customer response change.</li>
              <li>Use the latest quote revision when entering Won/Lost/Follow Up decisions.</li>
              <li>Review Sales Report after status updates to confirm values are reflected correctly.</li>
              <li>Check Sales Target at regular intervals to track gap closure actions.</li>
            </ul>
          </div>

          <div className="text-secondary mb-3">
            <p className="mb-1"><strong>Master Entry Guide - Customer / Client / Consultant / Received From</strong></p>
            <p className="mb-1">
              <strong>Where to create:</strong> During enquiry creation or edit, use the relevant dropdown/lookup field.
              If the required name is not available, use the add-new option in that module popup/form.
            </p>
            <p className="mb-1">
              <strong>Recommended order:</strong> Create master record first, verify saved values, then continue enquiry save.
            </p>
            <p className="mb-1">
              <strong>Step-by-step flow:</strong>
            </p>
            <ol className="mb-1" style={{ paddingLeft: '1.1rem' }}>
              <li>Open the relevant module/form where the master is required (typically Enquiry flow).</li>
              <li>In the field (Customer/Client/Consultant/Received From), search existing values first.</li>
              <li>If not found, click add-new/create option.</li>
              <li>Enter mandatory details such as name, contact person, mobile/email, and remarks as applicable.</li>
              <li>Save the master entry and wait for confirmation.</li>
              <li>Re-select/refresh the same field and choose the newly created value.</li>
              <li>Complete remaining enquiry details and save.</li>
            </ol>
            <p className="mb-0 mt-1">
              <strong>Validation checks:</strong> avoid duplicate spellings, confirm correct customer group/type,
              and ensure email/phone formats are valid before final save.
            </p>
          </div>

          <div className="text-secondary mb-3">
            <p className="mb-1"><strong>Scanning Function - How to Use</strong></p>
            <p className="mb-1">
              EMS supports scan/OCR-assisted data capture in modules where contact card or image-based details
              are collected (for customer/contact related entry points).
            </p>
            <p className="mb-1">
              <strong>Step-by-step scanning process:</strong>
            </p>
            <ol className="mb-1" style={{ paddingLeft: '1.1rem' }}>
              <li>Open the form where contact details are being captured.</li>
              <li>Click the scan/upload option.</li>
              <li>Upload a clear image of the business card/document (good lighting, no blur).</li>
              <li>Wait for OCR processing to complete.</li>
              <li>Review extracted values (name, company, phone, email, designation, etc.).</li>
              <li>Correct any OCR mismatch manually before saving.</li>
              <li>Save the entry and verify it appears correctly in lookup/search.</li>
            </ol>
            <p className="mb-0 mt-1">
              <strong>Best practices:</strong> use high-resolution images, crop unnecessary background,
              and always manually validate email/mobile values after scan.
            </p>
          </div>

          <div className="text-secondary mb-3">
            <p className="mb-1"><strong>Troubleshooting Checklist</strong></p>
            <ul className="mb-0" style={{ paddingLeft: '1.1rem' }}>
              <li>If data does not appear in report, confirm Division and SE filter selection.</li>
              <li>If quote details are missing in status row, reselect Quote Reference and save once.</li>
              <li>If alignment or field rendering appears incorrect, refresh page and reopen the record.</li>
              <li>If status-based fields are not visible, ensure selected status is saved before editing details.</li>
              <li>If target impact is not visible, verify that the opportunity is marked Won with final values.</li>
            </ul>
          </div>

          <hr className="my-3" />

          <h6 className="mb-2" style={sectionTitleStyle}>System Architecture</h6>
          <p className="mb-2 text-secondary">
            EMS is built on a three-layer architecture: Frontend (React), Backend (Node.js/Express), and Database (MSSQL).
            Each user action in UI travels through secured API routes to database operations and returns a structured response.
          </p>

          <div className="text-secondary mb-3">
            <strong>Architecture Components:</strong>
            <ol className="mb-0 mt-1" style={{ paddingLeft: '1.1rem' }}>
              <li><strong>Presentation Layer:</strong> React components, forms, tables, charts, filters, and role-based menu visibility.</li>
              <li><strong>Application Layer:</strong> Express routes, validation, business logic, workflow/status rules, API response shaping.</li>
              <li><strong>Data Layer:</strong> SQL Server tables/procedures for enquiries, quotes, probability updates, and reporting datasets.</li>
            </ol>
          </div>

          <div className="text-secondary mb-3">
            <strong>Request Lifecycle Example (Won Update):</strong>
            <ol className="mb-0 mt-1" style={{ paddingLeft: '1.1rem' }}>
              <li>User sets status to Won in Probability and enters job value + GP% + booked date.</li>
              <li>Frontend sends payload to backend route for probability update.</li>
              <li>Backend validates required fields and status-specific constraints.</li>
              <li>Backend stores update in Probability table and keeps latest update ordering.</li>
              <li>Sales Report APIs read latest scoped records and reflect updated metrics/charts.</li>
            </ol>
          </div>

          <div className="text-secondary mb-3">
            <strong>Business Process Integration Example:</strong>
            <ol className="mb-0 mt-1" style={{ paddingLeft: '1.1rem' }}>
              <li>Enquiry `ENQ-1024` is created for a new project.</li>
              <li>Pricing prepares estimate and confirms commercial baseline.</li>
              <li>Quote issues `Q-1024-R0`; customer requests changes.</li>
              <li>Quote issues `Q-1024-R1` with revised value.</li>
              <li>Probability is updated to Follow Up with expected date.</li>
              <li>After confirmation, status changes to Won with booked date and GP%.</li>
              <li>Sales Report reflects the win; Sales Target shows achievement impact.</li>
            </ol>
          </div>

          <p className="mb-1 text-secondary">
            <strong>Security and Access:</strong> Authentication controls session access, while role permissions control module visibility and actions.
          </p>
          <p className="mb-0 text-secondary">
            <strong>Technical Stack Summary:</strong> React + Bootstrap UI, Node.js/Express APIs, MSSQL database, REST-based module communication.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Help;

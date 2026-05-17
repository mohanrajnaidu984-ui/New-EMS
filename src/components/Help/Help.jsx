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
              <strong>Purpose:</strong> Calendar-based snapshot of enquiry activity with drill-down lists for daily and monthly review.
            </p>
            <p className="mb-1">
              <strong>Calendar views:</strong> Two calendars—Enquiry Received and Due Date—with monthly bar charts for Enquiry Received, Due, Lapsed, and Quoted. Filter by division and sales engineer (SE).
            </p>
            <p className="mb-1">
              <strong>Due and Lapsed rules:</strong> Due counts enquiries with no quote and due date today or later. Lapsed counts enquiries with no quote and due date before today. Once any quote exists on an enquiry, it is excluded from Due and Lapsed on both calendars and in list popups. Monthly bar totals match the sum of day-by-day chips.
            </p>
            <p className="mb-1">
              <strong>Typical user action:</strong> Start on Dashboard, click a day chip or monthly bar segment to open the matching enquiry list, then open records in Enquiry or Pricing as needed.
            </p>
            <p className="mb-0">
              <strong>Example:</strong> On the Due Date calendar, click today&apos;s Due chip to see open enquiries due today with no quote yet; follow up before they move to Lapsed.
            </p>
            <p className="mb-0 mt-1">
              <strong>Process view:</strong> Dashboard &rarr; filter division/SE &rarr; review chips or bars &rarr; open list popup &rarr; complete action in Enquiry/Pricing/Quote.
            </p>
            <p className="mb-0 mt-1">
              <strong>Expected output:</strong> Consistent due/lapsed visibility aligned between calendar chips, monthly bars, and enquiry list popups.
            </p>
          </div>

          <div className="text-secondary mb-3">
            <p className="mb-1"><strong>2. Enquiry</strong></p>
            <p className="mb-1">
              <strong>Purpose:</strong> Create and maintain enquiry master data.
            </p>
            <p className="mb-1">
              <strong>Key fields:</strong> enquiry number, customers, received-from contacts, enquiry-for hierarchy, concerned SEs, due date, attachments, division, and status.
            </p>
            <p className="mb-1">
              <strong>How to use:</strong> Create or modify enquiry, validate mandatory fields, save. Use search and modify flows for updates. On Windows with classic Outlook installed, email actions run from the EMS server or optional local helper.
            </p>
            <p className="mb-1">
              <strong>Internal notification (on Add Enquiry):</strong> After a successful add, EMS can send an internal notification email via Outlook to all concerned SEs (To), with division CC addresses from master data. This is sent automatically when Outlook integration is available.
            </p>
            <p className="mb-1">
              <strong>Customer acknowledgement (optional):</strong> Before saving a new active enquiry, check <strong>Send acknowledgement mail</strong>, select the point-of-contact SE, and ensure customer/received-from email pairs are complete. EMS opens one Outlook draft per customer (not auto-sent). Each draft is addressed to the received-from contact, with concerned SEs and division CCs. The selected SE appears as contact in the body; your default Outlook signature is used.
            </p>
            <p className="mb-0">
              <strong>Example:</strong> Register a new enquiry with two customers, enable acknowledgement, choose the lead SE, save—review and send each Outlook draft to the respective customer contact.
            </p>
            <p className="mb-0 mt-1">
              <strong>Step process:</strong> New Enquiry &rarr; fill mandatory fields &rarr; set concerned SEs and emails &rarr; optionally enable acknowledgement &rarr; save &rarr; review Outlook mail &rarr; move to Pricing.
            </p>
            <p className="mb-0 mt-1">
              <strong>Validation notes:</strong> Customer name, project name, division, due date, and contact emails must be complete. Acknowledgement requires a selected SE and valid received-from email per customer row.
            </p>
            <p className="mb-0 mt-1">
              <strong>Expected output:</strong> One reliable enquiry record, internal team notified, and optional customer acknowledgement drafts ready to send.
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
              <strong>Step process:</strong> Load enquiry &rarr; update commercial lines &rarr; validate totals/net value &rarr; confirm for quote preparation.
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
              <strong>Key activities:</strong> select enquiry, create quote reference and revisions, edit clauses, map lead job and customer, preview A4 layout, download PDF, send via Outlook.
            </p>
            <p className="mb-1">
              <strong>Preview and PDF:</strong> Use A4 preview to verify cover letter, headers, clause content, and pricing summary tables before download. PDF download produces a protected document (editing/copying restricted; printing allowed). Preview styling matches the generated PDF.
            </p>
            <p className="mb-1">
              <strong>Outlook email:</strong> On Windows with classic Outlook, open a draft or send the quote PDF as an attachment from the quote screen. Ensure Outlook is running and the EMS server (or local helper on port 39281) can reach Outlook.
            </p>
            <p className="mb-0">
              <strong>Example:</strong> Finalize R0 in preview, download protected PDF for records, then open Outlook draft to attach PDF and send to the customer contact.
            </p>
            <p className="mb-0 mt-1">
              <strong>Step process:</strong> Select enquiry &rarr; create quote &rarr; edit clauses and pricing summary &rarr; preview &rarr; download PDF or Outlook draft &rarr; create revisions when terms change.
            </p>
            <p className="mb-0 mt-1">
              <strong>Validation notes:</strong> Confirm latest revision before Probability updates. Creating any quote removes the enquiry from Dashboard Due/Lapsed counts.
            </p>
            <p className="mb-0 mt-1">
              <strong>Expected output:</strong> Complete quote trail with aligned preview/PDF and optional customer delivery via Outlook.
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
              <strong>Step process:</strong> Select status &rarr; enter status-specific fields &rarr; save update &rarr; verify row reflects latest status.
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
              <strong>Step process:</strong> Apply filters &rarr; review charts/table &rarr; compare status buckets &rarr; prepare action list for pending opportunities.
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
              <strong>Detailed analysis process:</strong> Select Division/SE &rarr; review Actual bars period-wise &rarr; inspect Pipeline concentration &rarr; open Top Jobs by status &rarr;
              identify high-value actionable records &rarr; update Probability/Quote records &rarr; recheck chart movement.
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
              <strong>Step process:</strong> Check target gap &rarr; identify pipeline support value &rarr; assign actions &rarr; review progress in next cycle.
            </p>
            <p className="mb-0 mt-1">
              <strong>Expected output:</strong> Measurable target plan with periodic progress checkpoints.
            </p>
            <p className="mb-0 mt-1">
              <strong>Detailed setup process:</strong> Select year/period &rarr; enter target value by required scope &rarr; save &rarr; verify reflected baseline &rarr; compare against live achieved value.
            </p>
            <p className="mb-0 mt-1">
              <strong>Detailed review process:</strong> Review target vs achieved weekly &rarr; note shortfall trend &rarr; cross-check open Follow Up/Won-ready opportunities &rarr; update action priorities &rarr; recheck closure in next review cycle.
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

          <h6 className="mb-2 mt-2" style={sectionTitleStyle}>Outlook Integration (Windows)</h6>
          <div className="text-secondary mb-4">
            <ul className="mb-0" style={{ paddingLeft: '1.1rem' }}>
              <li>Enquiry internal notifications and customer acknowledgement drafts require <strong>classic Outlook on Windows</strong>.</li>
              <li>Internal enquiry mail is sent automatically after add; customer acknowledgement opens drafts for you to review and send.</li>
              <li>Quote PDF mail uses the same Outlook integration for draft or send with attachment.</li>
              <li>Keep the EMS server running after backend updates. Optional: run <code>node scripts/quote-outlook-local-helper.js</code> if your environment uses the local helper on port 39281.</li>
              <li>Ensure contact emails exist in master data for SEs and received-from contacts used in To/CC fields.</li>
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

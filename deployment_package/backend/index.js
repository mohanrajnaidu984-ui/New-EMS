const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const { connectDB, sql } = require('./dbConfig');
const multer = require('multer');
const nodemailer = require('nodemailer');

// Configure Nodemailer Transporter
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: false, // true for 465, false for other ports
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

const sendEnquiryEmail = async (enquiryData, recipients) => {
    const { to, cc } = recipients;
    if ((!to || to.length === 0) && (!cc || cc.length === 0)) {
        console.log('No recipients for email.');
        return;
    }

    const mailOptions = {
        from: process.env.SMTP_USER,
        to: to.join(','),
        cc: cc ? cc.join(',') : '',
        subject: `New Enquiry Received - ${enquiryData.RequestNo}`,
        html: `
            <p>Dear Sir/Madam,</p>
            <p>Greetings !!!</p>
            <p>Please find given below, details pertaining to a customer Enquiry no. ${enquiryData.RequestNo} on ${new Date(enquiryData.EnquiryDate).toLocaleDateString('en-GB')}. Please report closure in Enquiry Management System.</p>
            <table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse; width: 100%;">
                <tr><td style="background-color: #d4edda; font-weight: bold;">Enquiry Ref No. :</td><td>${enquiryData.RequestNo}</td></tr>
                <tr><td style="background-color: #d4edda; font-weight: bold;">Enquiry Date:</td><td>${new Date(enquiryData.EnquiryDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</td></tr>
                <tr><td style="background-color: #d4edda; font-weight: bold;">Received From:</td><td>${enquiryData.ReceivedFrom}</td></tr>
                <tr><td style="background-color: #d4edda; font-weight: bold;">Category :</td><td>${enquiryData.EnquiryType}</td></tr>
                <tr><td style="background-color: #d4edda; font-weight: bold;">Project Name:</td><td>${enquiryData.ProjectName}</td></tr>
                <tr><td style="background-color: #d4edda; font-weight: bold;">Client Name:</td><td>${enquiryData.ClientName}</td></tr>
                <tr><td style="background-color: #d4edda; font-weight: bold;">Consultant Name:</td><td>${enquiryData.ConsultantName}</td></tr>
                <tr><td style="background-color: #d4edda; font-weight: bold;">Enquiry Details :</td><td>${enquiryData.DetailsOfEnquiry}</td></tr>
                <tr><td style="background-color: #d4edda; font-weight: bold;">Due Date:</td><td>${new Date(enquiryData.DueOn).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</td></tr>
                <tr><td style="background-color: #d4edda; font-weight: bold;">Supplementary received with:</td><td>${enquiryData.DocumentsReceived || ''}</td></tr>
                <tr><td style="background-color: #d4edda; font-weight: bold;">Remarks:</td><td>${enquiryData.Remark || ''}</td></tr>
            </table>
            <br/>
            <p>Thanx in advance,</p>
            <p>Best regards,</p>
            <p>* This is an Auto Generated E-mail by Enquiry Management System *</p>
        `
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('Email sent: ' + info.response);
    } catch (error) {
        console.error('Error sending email:', error);
    }
};

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// Configure Multer Storage (Memory Storage for DB)
// Configure Multer Storage (Disk Storage)
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

const { sendAcknowledgementEmail } = require('./emailService');
const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads')); // Serve uploaded files

// Connect to Database
connectDB();

// --- Authentication Routes ---

// User Signup
app.post('/api/auth/signup', async (req, res) => {
    const { username, email, password } = req.body;

    try {
        // Validate input
        if (!username || !email || !password) {
            return res.status(400).json({ message: 'All fields are required' });
        }

        if (password.length < 8) {
            return res.status(400).json({ message: 'Password must be at least 8 characters' });
        }

        // Check if user already exists
        const existingUser = await sql.query`SELECT * FROM Master_ConcernedSE WHERE EmailId = ${email}`;
        if (existingUser.recordset.length > 0) {
            return res.status(400).json({ message: 'Email already registered' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insert new user
        // Using FullName for username, EmailId for email, LoginPassword for password, Roles for role
        await sql.query`INSERT INTO Master_ConcernedSE (FullName, EmailId, LoginPassword, Roles, Status) 
                        VALUES (${username}, ${email}, ${hashedPassword}, 'User', 'Active')`;

        res.status(201).json({ message: 'User registered successfully' });
    } catch (err) {
        console.error('Signup error:', err);
        res.status(500).json({ message: 'Server error during signup', error: err.message });
    }
});

// User Login
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        // Validate input
        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required' });
        }

        // Find user
        const result = await sql.query`SELECT * FROM Master_ConcernedSE WHERE EmailId = ${email}`;
        const user = result.recordset[0];

        if (!user) {
            return res.status(400).json({ message: 'Invalid email or password' });
        }

        // Check password
        const isMatch = await bcrypt.compare(password, user.LoginPassword);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid email or password' });
        }

        // Return user info (excluding password)
        const { LoginPassword, ...userWithoutPassword } = user;
        res.json({ user: userWithoutPassword });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ message: 'Server error during login' });
    }
});

// --- API Routes ---

// Get All Enquiries
app.get('/api/enquiries', async (req, res) => {
    try {
        const result = await sql.query`SELECT * FROM EnquiryMaster ORDER BY CreatedAt DESC`;

        // Fetch related data
        const customersResult = await sql.query`SELECT * FROM EnquiryCustomer`;
        const contactsResult = await sql.query`SELECT * FROM ReceivedFrom`;
        const typesResult = await sql.query`SELECT * FROM EnquiryType`;
        const itemsResult = await sql.query`SELECT * FROM EnquiryFor`;
        const seResult = await sql.query`SELECT * FROM ConcernedSE`;

        const enquiries = result.recordset.map(enq => {
            const reqNo = enq.RequestNo;

            const relatedCustomers = customersResult.recordset.filter(c => c.RequestNo === reqNo).map(c => c.CustomerName);
            const relatedContacts = contactsResult.recordset.filter(c => c.RequestNo === reqNo).map(c => `${c.ContactName}|${c.CompanyName || ''}`);
            const relatedTypes = typesResult.recordset.filter(t => t.RequestNo === reqNo).map(t => t.TypeName);
            const relatedItems = itemsResult.recordset.filter(i => i.RequestNo === reqNo).map(i => i.ItemName);
            const relatedSEs = seResult.recordset.filter(s => s.RequestNo === reqNo).map(s => s.SEName);

            return {
                ...enq,
                SelectedEnquiryTypes: relatedTypes,
                SelectedEnquiryFor: relatedItems,
                SelectedCustomers: relatedCustomers,
                SelectedReceivedFroms: relatedContacts,
                SelectedConcernedSEs: relatedSEs,
                // Legacy fields for backward compatibility & List View
                EnquiryType: relatedTypes.join(', '),
                EnquiryFor: relatedItems.join(', '),
                CustomerName: enq.CustomerName || relatedCustomers.join(', '), // Prefer Master, fallback to transaction
                ClientName: enq.ClientName,
                ConsultantName: enq.ConsultantName,
                ReceivedFrom: relatedContacts.map(c => c.split('|')[0]).join(', '),
                ConcernedSE: relatedSEs.join(', ')
            };
        });
        res.json(enquiries);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// Add Enquiry
app.post('/api/enquiries', async (req, res) => {
    const logFile = path.join(__dirname, 'debug.log');
    const log = (msg) => fs.appendFileSync(logFile, `${new Date().toISOString()} - ${msg}\n`);

    log(`POST /api/enquiries Body: ${JSON.stringify(req.body, null, 2)}`);

    const {
        RequestNo, SourceOfInfo, EnquiryDate, DueOn, SiteVisitDate,
        SelectedEnquiryTypes, SelectedEnquiryFor,
        SelectedCustomers, SelectedReceivedFroms, SelectedConcernedSEs,
        ProjectName, ClientName, ConsultantName, DetailsOfEnquiry,
        DocumentsReceived, hardcopy, drawing, dvd, spec, eqpschedule, Remark,
        AutoAck, ceosign, Status, AcknowledgementSE
    } = req.body;

    log(`AutoAck Value: ${AutoAck}, Type: ${typeof AutoAck}`);
    log(`SelectedCustomers: ${JSON.stringify(SelectedCustomers)}`);

    try {
        const request = new sql.Request();
        request.input('RequestNo', sql.NVarChar, RequestNo);
        request.input('SourceOfEnquiry', sql.NVarChar, SourceOfInfo); // Mapped to SourceOfEnquiry
        request.input('EnquiryDate', sql.DateTime, EnquiryDate);
        request.input('DueDate', sql.DateTime, DueOn); // Mapped to DueDate
        request.input('SiteVisitDate', sql.DateTime, SiteVisitDate || null);

        request.input('CustomerName', sql.NVarChar, SelectedCustomers ? SelectedCustomers.join(',') : null);
        request.input('ReceivedFrom', sql.NVarChar, SelectedReceivedFroms ? SelectedReceivedFroms.map(i => i.split('|')[0]).join(',') : null);
        request.input('ProjectName', sql.NVarChar, ProjectName);
        request.input('ClientName', sql.NVarChar, ClientName);
        request.input('ConsultantName', sql.NVarChar, ConsultantName);
        request.input('EnquiryDetails', sql.NVarChar, DetailsOfEnquiry); // Mapped to EnquiryDetails
        // DocumentsReceived is not in new schema as a single field, it's checkboxes
        request.input('Doc_HardCopies', sql.Bit, hardcopy);
        request.input('Doc_Drawing', sql.Bit, drawing);
        request.input('Doc_CD_DVD', sql.Bit, dvd);
        request.input('Doc_Spec', sql.Bit, spec);
        request.input('Doc_EquipmentSchedule', sql.Bit, eqpschedule);
        request.input('Remarks', sql.NVarChar, Remark); // Mapped to Remarks
        request.input('SendAcknowledgementMail', sql.Bit, AutoAck); // Mapped
        request.input('ED_CEOSignatureRequired', sql.Bit, ceosign); // Mapped
        request.input('Status', sql.NVarChar, Status);
        request.input('OthersSpecify', sql.NVarChar, DocumentsReceived); // Using OthersSpecify for DocumentsReceived text if needed, or ignore
        request.input('CreatedBy', sql.NVarChar, req.body.CreatedBy);

        await request.query(`
            INSERT INTO EnquiryMaster (
                RequestNo, SourceOfEnquiry, EnquiryDate, DueDate, SiteVisitDate,
                CustomerName, ReceivedFrom, ProjectName, ClientName, ConsultantName,
                EnquiryDetails, Doc_HardCopies, Doc_Drawing, Doc_CD_DVD,
                Doc_Spec, Doc_EquipmentSchedule, Remarks, SendAcknowledgementMail, ED_CEOSignatureRequired, Status, OthersSpecify, CreatedBy
            ) VALUES (
                @RequestNo, @SourceOfEnquiry, @EnquiryDate, @DueDate, @SiteVisitDate,
                @CustomerName, @ReceivedFrom, @ProjectName, @ClientName, @ConsultantName,
                @EnquiryDetails, @Doc_HardCopies, @Doc_Drawing, @Doc_CD_DVD,
                @Doc_Spec, @Doc_EquipmentSchedule, @Remarks, @SendAcknowledgementMail, @ED_CEOSignatureRequired, @Status, @OthersSpecify, @CreatedBy
            )
        `);

        // Helper to insert related items
        const insertRelated = async (table, col, items) => {
            if (items && items.length > 0) {
                for (const item of items) {
                    await sql.query(`INSERT INTO ${table} (RequestNo, ${col}) VALUES ('${RequestNo}', '${item}')`);
                }
            }
        };

        await insertRelated('EnquiryCustomer', 'CustomerName', SelectedCustomers);
        await insertRelated('EnquiryType', 'TypeName', SelectedEnquiryTypes);
        await insertRelated('EnquiryFor', 'ItemName', SelectedEnquiryFor);
        await insertRelated('ConcernedSE', 'SEName', SelectedConcernedSEs);

        if (SelectedReceivedFroms && SelectedReceivedFroms.length > 0) {
            for (const item of SelectedReceivedFroms) {
                const [contact, company] = item.split('|');
                await sql.query`INSERT INTO ReceivedFrom (RequestNo, ContactName, CompanyName) VALUES (${RequestNo}, ${contact}, ${company})`;
            }
        }



        // --- Update Master Tables with RequestNo ---
        try {
            // 1. Source Of Enquiry
            if (SourceOfInfo) {
                await sql.query`UPDATE Master_SourceOfEnquiry SET RequestNo = ${RequestNo} WHERE SourceName = ${SourceOfInfo}`;
            }

            // 2. Enquiry Type
            if (SelectedEnquiryTypes && SelectedEnquiryTypes.length > 0) {
                for (const type of SelectedEnquiryTypes) {
                    await sql.query`UPDATE Master_EnquiryType SET RequestNo = ${RequestNo} WHERE TypeName = ${type}`;
                }
            }

            // 3. Enquiry For
            if (SelectedEnquiryFor && SelectedEnquiryFor.length > 0) {
                for (const item of SelectedEnquiryFor) {
                    await sql.query`UPDATE Master_EnquiryFor SET RequestNo = ${RequestNo} WHERE ItemName = ${item}`;
                }
            }

            // 4. Received From
            if (SelectedReceivedFroms && SelectedReceivedFroms.length > 0) {
                for (const item of SelectedReceivedFroms) {
                    const [contact, company] = item.split('|');
                    await sql.query`UPDATE Master_ReceivedFrom SET RequestNo = ${RequestNo} WHERE ContactName = ${contact} AND CompanyName = ${company}`;
                }
            }

            // 5. Concerned SE
            if (SelectedConcernedSEs && SelectedConcernedSEs.length > 0) {
                for (const se of SelectedConcernedSEs) {
                    await sql.query`UPDATE Master_ConcernedSE SET RequestNo = ${RequestNo} WHERE FullName = ${se}`;
                }
            }

            // 6. Customer Name
            if (SelectedCustomers && SelectedCustomers.length > 0) {
                console.log('Updating Master_CustomerName for:', SelectedCustomers);
                for (const cust of SelectedCustomers) {
                    const result = await sql.query`UPDATE Master_CustomerName SET RequestNo = ${RequestNo} WHERE CompanyName = ${cust}`;
                    console.log(`Updated Master_CustomerName for ${cust}. Rows affected: ${result.rowsAffected}`);
                }
            } else {
                console.log('No SelectedCustomers to update in Master_CustomerName');
            }

            // 7. Client Name
            if (ClientName) {
                console.log('Updating Master_ClientName for:', ClientName);
                await sql.query`UPDATE Master_ClientName SET RequestNo = ${RequestNo} WHERE CompanyName = ${ClientName}`;
            }

            // 8. Consultant Name
            if (ConsultantName) {
                console.log('Updating Master_ConsultantName for:', ConsultantName);
                await sql.query`UPDATE Master_ConsultantName SET RequestNo = ${RequestNo} WHERE CompanyName = ${ConsultantName}`;
            }

        } catch (updateErr) {
            console.error('Error updating Master tables with RequestNo:', updateErr);
        }

        // --- Email Notification Logic ---
        try {
            console.log('Starting Email Logic...');
            console.log('SelectedEnquiryFor:', SelectedEnquiryFor);
            console.log('SelectedConcernedSEs:', SelectedConcernedSEs);

            // 1. Fetch Emails for Enquiry Items (To: CommonMailIds, CC: CCMailIds)
            let itemTo = [];
            let itemCC = [];
            if (SelectedEnquiryFor && SelectedEnquiryFor.length > 0) {
                const itemsStr = SelectedEnquiryFor.map(i => `'${i}'`).join(',');
                const itemsRes = await sql.query(`SELECT CommonMailIds, CCMailIds FROM Master_EnquiryFor WHERE ItemName IN (${itemsStr})`);
                itemsRes.recordset.forEach(row => {
                    if (row.CommonMailIds) itemTo.push(...row.CommonMailIds.split(',').map(e => e.trim()));
                    if (row.CCMailIds) itemCC.push(...row.CCMailIds.split(',').map(e => e.trim()));
                });
            }

            // 2. Fetch Emails for Concerned SEs (To)
            if (SelectedConcernedSEs && SelectedConcernedSEs.length > 0) {
                const sesStr = SelectedConcernedSEs.map(s => `'${s}'`).join(',');
                const seRes = await sql.query(`SELECT EmailId FROM Master_ConcernedSE WHERE FullName IN (${sesStr})`);
                seRes.recordset.forEach(row => {
                    if (row.EmailId) itemTo.push(row.EmailId.trim());
                });
            }

            // Deduplicate
            const uniqueTo = [...new Set(itemTo)].filter(Boolean);
            const uniqueCC = [...new Set(itemCC)].filter(Boolean);

            console.log('Recipients To:', uniqueTo);
            console.log('Recipients CC:', uniqueCC);

            // Prepare Data for Email
            const emailData = {
                RequestNo,
                EnquiryDate,
                ReceivedFrom: SelectedReceivedFroms ? SelectedReceivedFroms.map(i => i.split('|')[0]).join(', ') : '',
                EnquiryType: SelectedEnquiryTypes ? SelectedEnquiryTypes.join(', ') : '',
                ProjectName,
                ClientName,
                ConsultantName,
                DetailsOfEnquiry,
                DueOn,
                DocumentsReceived,
                Remark
            };

            // Send Email
            await sendEnquiryEmail(emailData, { to: uniqueTo, cc: uniqueCC });

            // New Email Logic
            // New Email Logic
            if (AutoAck) {
                log('AutoAck is true, preparing to send acknowledgement emails...');

                // 1. Fetch CC Emails (All Selected Concerned SEs)
                let ccEmails = [];
                if (SelectedConcernedSEs && SelectedConcernedSEs.length > 0) {
                    const sesStr = SelectedConcernedSEs.map(s => `'${s}'`).join(',');
                    const seRes = await sql.query(`SELECT EmailId FROM Master_ConcernedSE WHERE FullName IN (${sesStr})`);
                    seRes.recordset.forEach(row => {
                        if (row.EmailId) ccEmails.push(row.EmailId.trim());
                    });
                }
                const ccString = ccEmails.join(',');
                log(`CC Emails (Concerned SEs): ${ccString}`);

                // 2. Fetch To Emails (Selected Received From Contacts)
                // The requirement is: Individual mail for each Received From with concern SE's in CC
                if (SelectedReceivedFroms && SelectedReceivedFroms.length > 0) {
                    const processedEmails = new Set();

                    for (const item of SelectedReceivedFroms) {
                        const [contact, company] = item.split('|');
                        // Fetch email for this specific contact
                        const rfRes = await sql.query`SELECT EmailId FROM Master_ReceivedFrom WHERE ContactName = ${contact} AND CompanyName = ${company}`;

                        if (rfRes.recordset.length > 0 && rfRes.recordset[0].EmailId) {
                            const recipientEmail = rfRes.recordset[0].EmailId.trim();

                            // Avoid sending duplicate emails to the same address for the same request
                            if (!processedEmails.has(recipientEmail)) {
                                log(`Sending acknowledgement to Received From: ${contact} (${recipientEmail}) CC: ${ccString}`);
                                try {
                                    await sendAcknowledgementEmail(emailData, recipientEmail, ccString, ceosign);
                                    log(`Email sent successfully to ${recipientEmail}`);
                                    processedEmails.add(recipientEmail);
                                } catch (e) {
                                    log(`Error sending email to ${recipientEmail}: ${e.message}`);
                                }
                            }
                        } else {
                            log(`No email found for Received From contact: ${contact} (${company})`);
                        }
                    }
                } else {
                    log('No Received From contacts selected. Skipping acknowledgement email.');
                }
            } else {
                log('AutoAck is false, skipping email');
            }

        } catch (emailErr) {
            console.error('Failed to send email notification:', emailErr);
            // Don't fail the request if email fails, just log it
        }

        res.status(201).json({ message: 'Enquiry created' });
    } catch (err) {
        const logFile = path.join(__dirname, 'debug.log');
        fs.appendFileSync(logFile, `${new Date().toISOString()} - ERROR: ${err.message}\n${err.stack}\n`);
        console.error(err);
        res.status(500).send(err.message);
    }
});

// Update Enquiry
// Update Enquiry
app.put('/api/enquiries/:id', async (req, res) => {
    const { id } = req.params;
    const {
        SourceOfInfo, EnquiryDate, DueOn, SiteVisitDate,
        SelectedEnquiryTypes, SelectedEnquiryFor,
        SelectedCustomers, SelectedReceivedFroms, SelectedConcernedSEs,
        ProjectName, ClientName, ConsultantName, DetailsOfEnquiry,
        DocumentsReceived, hardcopy, drawing, dvd, spec, eqpschedule, Remark,
        AutoAck, ceosign, Status
    } = req.body;

    try {
        const request = new sql.Request();
        request.input('RequestNo', sql.NVarChar, id);
        request.input('SourceOfEnquiry', sql.NVarChar, SourceOfInfo);
        request.input('EnquiryDate', sql.DateTime, EnquiryDate);
        request.input('DueDate', sql.DateTime, DueOn);
        request.input('SiteVisitDate', sql.DateTime, SiteVisitDate || null);
        request.input('ReceivedFrom', sql.NVarChar, SelectedReceivedFroms ? SelectedReceivedFroms.map(i => i.split('|')[0]).join(',') : null);

        request.input('ProjectName', sql.NVarChar, ProjectName);
        request.input('ClientName', sql.NVarChar, ClientName);
        request.input('ConsultantName', sql.NVarChar, ConsultantName);
        request.input('EnquiryDetails', sql.NVarChar, DetailsOfEnquiry);
        // DocumentsReceived is not in new schema as a single field, it's checkboxes
        request.input('Doc_HardCopies', sql.Bit, hardcopy);
        request.input('Doc_Drawing', sql.Bit, drawing);
        request.input('Doc_CD_DVD', sql.Bit, dvd);
        request.input('Doc_Spec', sql.Bit, spec);
        request.input('Doc_EquipmentSchedule', sql.Bit, eqpschedule);
        request.input('Remarks', sql.NVarChar, Remark);
        request.input('SendAcknowledgementMail', sql.Bit, AutoAck);
        request.input('ED_CEOSignatureRequired', sql.Bit, ceosign);
        request.input('Status', sql.NVarChar, Status);
        request.input('OthersSpecify', sql.NVarChar, DocumentsReceived);

        await request.query(`
            UPDATE EnquiryMaster SET
                SourceOfEnquiry=@SourceOfEnquiry, EnquiryDate=@EnquiryDate, DueDate=@DueDate, SiteVisitDate=@SiteVisitDate,
                ReceivedFrom=@ReceivedFrom, ProjectName=@ProjectName, ClientName=@ClientName, ConsultantName=@ConsultantName,
                EnquiryDetails=@EnquiryDetails, Doc_HardCopies=@Doc_HardCopies, Doc_Drawing=@Doc_Drawing, Doc_CD_DVD=@Doc_CD_DVD,
                Doc_Spec=@Doc_Spec, Doc_EquipmentSchedule=@Doc_EquipmentSchedule, Remarks=@Remarks, SendAcknowledgementMail=@SendAcknowledgementMail, ED_CEOSignatureRequired=@ED_CEOSignatureRequired, Status=@Status, OthersSpecify=@OthersSpecify
            WHERE RequestNo=@RequestNo
        `);

        // Helper to update related items (Delete + Insert)
        const updateRelated = async (table, col, items) => {
            await sql.query(`DELETE FROM ${table} WHERE RequestNo = '${id}'`);
            if (items && items.length > 0) {
                for (const item of items) {
                    const req = new sql.Request();
                    req.input('RequestNo', sql.NVarChar, id);
                    req.input('ItemValue', sql.NVarChar, item);
                    await req.query(`INSERT INTO ${table} (RequestNo, ${col}) VALUES (@RequestNo, @ItemValue)`);
                }
            }
        };

        await updateRelated('EnquiryCustomer', 'CustomerName', SelectedCustomers);
        await updateRelated('EnquiryType', 'TypeName', SelectedEnquiryTypes);
        await updateRelated('EnquiryFor', 'ItemName', SelectedEnquiryFor);
        await updateRelated('ConcernedSE', 'SEName', SelectedConcernedSEs);

        // ReceivedFrom has multiple columns, handle separately if needed, or just ContactName/CompanyName
        // For now assuming simple string or split logic similar to POST
        await sql.query(`DELETE FROM ReceivedFrom WHERE RequestNo = '${id}'`);
        if (SelectedReceivedFroms && SelectedReceivedFroms.length > 0) {
            for (const item of SelectedReceivedFroms) {
                const [contact, company] = item.split('|');
                const req = new sql.Request();
                req.input('RequestNo', sql.NVarChar, id);
                req.input('ContactName', sql.NVarChar, contact);
                req.input('CompanyName', sql.NVarChar, company);
                await req.query(`INSERT INTO ReceivedFrom (RequestNo, ContactName, CompanyName) VALUES (@RequestNo, @ContactName, @CompanyName)`);
            }
        }


        // Send Acknowledgement Email on Update if checked
        if (AutoAck) {
            console.log('AutoAck is true (Update), preparing to send acknowledgement emails...');
            const ackSEName = req.body.AcknowledgementSE;
            let seEmail = '';
            if (ackSEName) {
                const seRes = await sql.query`SELECT EmailId FROM Master_ConcernedSE WHERE FullName = ${ackSEName}`;
                if (seRes.recordset.length > 0) seEmail = seRes.recordset[0].EmailId;
            }

            // Re-construct email data for update
            const emailData = {
                RequestNo: id,
                EnquiryDate,
                ReceivedFrom: SelectedReceivedFroms ? SelectedReceivedFroms.map(i => i.split('|')[0]).join(', ') : '',
                EnquiryType: SelectedEnquiryTypes ? SelectedEnquiryTypes.join(', ') : '',
                ProjectName,
                ClientName,
                ConsultantName,
                DetailsOfEnquiry,
                DueOn,
                DocumentsReceived,
                Remark
            };

            if (SelectedCustomers && SelectedCustomers.length > 0) {
                for (const custName of SelectedCustomers) {
                    const custRes = await sql.query`
                        SELECT EmailId FROM Master_CustomerName WHERE CompanyName = ${custName}
                        UNION
                        SELECT EmailId FROM Master_ClientName WHERE CompanyName = ${custName}
                        UNION
                        SELECT EmailId FROM Master_ConsultantName WHERE CompanyName = ${custName}
                    `;
                    if (custRes.recordset.length > 0) {
                        const custEmail = custRes.recordset[0].EmailId;
                        if (custEmail) {
                            console.log(`Sending email to ${custName} (${custEmail}) CC: ${seEmail}`);
                            await sendAcknowledgementEmail(emailData, custEmail, seEmail, ceosign);
                        } else {
                            console.log(`No email found for customer ${custName}`);
                        }
                    }
                }
            }
        }

        res.json({ message: 'Enquiry updated' });
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }
});

// --- Master Data API Routes ---

// 1. Customers (Contractors, Clients, Consultants)
app.get('/api/customers', async (req, res) => {
    try {
        const customers = await sql.query`SELECT * FROM Master_CustomerName ORDER BY ID DESC`;
        const clients = await sql.query`SELECT * FROM Master_ClientName ORDER BY ID DESC`;
        const consultants = await sql.query`SELECT * FROM Master_ConsultantName ORDER BY ID DESC`;

        // Combine all
        const all = [...customers.recordset, ...clients.recordset, ...consultants.recordset];
        res.json(all);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

app.post('/api/customers', async (req, res) => {
    const { CompanyName, Address1, Address2, Rating, Type, FaxNo, Phone1, Phone2, EmailId, Website, Status, Category } = req.body;
    try {
        if (Category === 'Client') {
            await sql.query`INSERT INTO Master_ClientName (Category, CompanyName, Address1, Address2, Rating, Type, FaxNo, Phone1, Phone2, EmailId, Website, Status, RequestNo)
                            VALUES (${Category}, ${CompanyName}, ${Address1}, ${Address2}, ${Rating}, ${Type}, ${FaxNo}, ${Phone1}, ${Phone2}, ${EmailId}, ${Website}, ${Status}, ${req.body.RequestNo})`;
        } else if (Category === 'Consultant') {
            await sql.query`INSERT INTO Master_ConsultantName (Category, CompanyName, Address1, Address2, Rating, Type, FaxNo, Phone1, Phone2, EmailId, Website, Status, RequestNo)
                            VALUES (${Category}, ${CompanyName}, ${Address1}, ${Address2}, ${Rating}, ${Type}, ${FaxNo}, ${Phone1}, ${Phone2}, ${EmailId}, ${Website}, ${Status}, ${req.body.RequestNo})`;
        } else {
            // Default to Contractor/Customer
            await sql.query`INSERT INTO Master_CustomerName (Category, CompanyName, Address1, Address2, Rating, Type, FaxNo, Phone1, Phone2, EmailId, Website, Status, RequestNo)
                            VALUES (${Category || 'Contractor'}, ${CompanyName}, ${Address1}, ${Address2}, ${Rating}, ${Type}, ${FaxNo}, ${Phone1}, ${Phone2}, ${EmailId}, ${Website}, ${Status}, ${req.body.RequestNo})`;
        }
        res.status(201).json({ message: 'Customer added' });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

app.put('/api/customers/:id', async (req, res) => {
    const { id } = req.params;
    const { CompanyName, Address1, Address2, Rating, Type, FaxNo, Phone1, Phone2, EmailId, Website, Status, Category } = req.body;
    try {
        if (Category === 'Client') {
            await sql.query`UPDATE Master_ClientName SET CompanyName=${CompanyName}, Address1=${Address1}, Address2=${Address2}, Rating=${Rating}, Type=${Type}, FaxNo=${FaxNo}, Phone1=${Phone1}, Phone2=${Phone2}, EmailId=${EmailId}, Website=${Website}, Status=${Status} WHERE ID=${id}`;
        } else if (Category === 'Consultant') {
            await sql.query`UPDATE Master_ConsultantName SET CompanyName=${CompanyName}, Address1=${Address1}, Address2=${Address2}, Rating=${Rating}, Type=${Type}, FaxNo=${FaxNo}, Phone1=${Phone1}, Phone2=${Phone2}, EmailId=${EmailId}, Website=${Website}, Status=${Status} WHERE ID=${id}`;
        } else {
            await sql.query`UPDATE Master_CustomerName SET CompanyName=${CompanyName}, Address1=${Address1}, Address2=${Address2}, Rating=${Rating}, Type=${Type}, FaxNo=${FaxNo}, Phone1=${Phone1}, Phone2=${Phone2}, EmailId=${EmailId}, Website=${Website}, Status=${Status} WHERE ID=${id}`;
        }
        res.json({ message: 'Customer updated' });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// 2. Contacts (Received From)
app.get('/api/contacts', async (req, res) => {
    try {
        const result = await sql.query`SELECT * FROM Master_ReceivedFrom ORDER BY ID DESC`;
        res.json(result.recordset);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

app.post('/api/contacts', async (req, res) => {
    const { Category, CompanyName, ContactName, Designation, CategoryOfDesignation, Address1, Address2, FaxNo, Phone, Mobile1, Mobile2, EmailId, RequestNo } = req.body;
    try {
        await sql.query`INSERT INTO Master_ReceivedFrom (Category, CompanyName, ContactName, Designation, CategoryOfDesignation, Address1, Address2, FaxNo, Phone, Mobile1, Mobile2, EmailId, RequestNo)
                        VALUES (${Category}, ${CompanyName}, ${ContactName}, ${Designation}, ${CategoryOfDesignation}, ${Address1}, ${Address2}, ${FaxNo}, ${Phone}, ${Mobile1}, ${Mobile2}, ${EmailId}, ${RequestNo})`;
        res.status(201).json({ message: 'Contact added' });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

app.put('/api/contacts/:id', async (req, res) => {
    const { id } = req.params;
    const { Category, CompanyName, ContactName, Designation, CategoryOfDesignation, Address1, Address2, FaxNo, Phone, Mobile1, Mobile2, EmailId } = req.body;
    try {
        await sql.query`UPDATE Master_ReceivedFrom SET Category=${Category}, CompanyName=${CompanyName}, ContactName=${ContactName}, Designation=${Designation}, CategoryOfDesignation=${CategoryOfDesignation}, Address1=${Address1}, Address2=${Address2}, FaxNo=${FaxNo}, Phone=${Phone}, Mobile1=${Mobile1}, Mobile2=${Mobile2}, EmailId=${EmailId} WHERE ID=${id}`;
        res.json({ message: 'Contact updated' });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// 3. Users (Concerned SE)
app.get('/api/users', async (req, res) => {
    try {
        const result = await sql.query`SELECT * FROM Master_ConcernedSE ORDER BY ID DESC`;
        res.json(result.recordset);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

app.post('/api/users', async (req, res) => {
    const { FullName, Designation, EmailId, LoginPassword, Status, Department, Roles, RequestNo } = req.body;
    try {
        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(LoginPassword, salt);

        await sql.query`INSERT INTO Master_ConcernedSE (FullName, Designation, EmailId, LoginPassword, Status, Department, Roles, RequestNo)
                        VALUES (${FullName}, ${Designation}, ${EmailId}, ${hashedPassword}, ${Status}, ${Department}, ${Roles}, ${RequestNo})`;
        res.status(201).json({ message: 'User added' });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

app.put('/api/users/:id', async (req, res) => {
    const { id } = req.params;
    const { FullName, Designation, EmailId, Status, Department, Roles } = req.body;
    try {
        // Note: Password update logic should be separate or handled carefully. Skipping password update here for simplicity unless provided.
        await sql.query`UPDATE Master_ConcernedSE SET FullName=${FullName}, Designation=${Designation}, EmailId=${EmailId}, Status=${Status}, Department=${Department}, Roles=${Roles} WHERE ID=${id}`;
        res.json({ message: 'User updated' });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// 4. Enquiry Items (Enquiry For)
app.get('/api/enquiry-items', async (req, res) => {
    try {
        const result = await sql.query`SELECT * FROM Master_EnquiryFor ORDER BY ID DESC`;
        res.json(result.recordset);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

app.post('/api/enquiry-items', async (req, res) => {
    const { ItemName, CompanyName, DepartmentName, Status, CommonMailIds, CCMailIds, RequestNo } = req.body;
    try {
        await sql.query`INSERT INTO Master_EnquiryFor (ItemName, CompanyName, DepartmentName, Status, CommonMailIds, CCMailIds, RequestNo)
                        VALUES (${ItemName}, ${CompanyName}, ${DepartmentName}, ${Status}, ${CommonMailIds}, ${CCMailIds}, ${RequestNo})`;
        res.status(201).json({ message: 'Item added' });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

app.put('/api/enquiry-items/:id', async (req, res) => {
    const { id } = req.params;
    const { ItemName, CompanyName, DepartmentName, Status, CommonMailIds, CCMailIds } = req.body;
    try {
        await sql.query`UPDATE Master_EnquiryFor SET ItemName=${ItemName}, CompanyName=${CompanyName}, DepartmentName=${DepartmentName}, Status=${Status}, CommonMailIds=${CommonMailIds}, CCMailIds=${CCMailIds} WHERE ID=${id}`;
        res.json({ message: 'Item updated' });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});
// --- Attachments API ---

// Upload Attachment - Store in DB
// Upload Attachment - Store in Disk and DB
// Upload Attachment - Store in Disk and DB
app.post('/api/attachments/upload', (req, res, next) => {
    // Ensure uploads directory exists
    const uploadDir = 'uploads';
    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir);
    }
    next();
}, upload.array('files'), async (req, res) => {
    const requestNo = req.query.requestNo;
    console.log('Upload request for RequestNo:', requestNo);

    if (!requestNo) {
        return res.status(400).send('Request No is required');
    }

    const files = req.files;

    if (!files || files.length === 0) {
        return res.status(400).send('No files uploaded.');
    }

    try {
        const uploadedFiles = [];
        for (const file of files) {
            const fileName = file.originalname;
            const filePath = file.path;

            // Check if RequestNo exists in EnquiryMaster to avoid FK violation
            const checkEnq = await sql.query`SELECT RequestNo FROM EnquiryMaster WHERE RequestNo = ${requestNo}`;
            if (checkEnq.recordset.length === 0) {
                // If not found, we can't link attachment. 
                // But we already saved the file. Should we delete it?
                // For now, just error out.
                throw new Error(`RequestNo ${requestNo} not found in EnquiryMaster`);
            }

            // Insert into DB with FilePath
            await sql.query`INSERT INTO Attachments (RequestNo, FileName, FilePath) 
                            VALUES (${requestNo}, ${fileName}, ${filePath})`;

            uploadedFiles.push({ fileName });
        }

        res.status(201).json({ message: 'Files uploaded successfully', files: uploadedFiles });
    } catch (err) {
        const logFile = path.join(__dirname, 'debug.log');
        fs.appendFileSync(logFile, `${new Date().toISOString()} - ATTACHMENT ERROR: ${err.message}\n${err.stack}\n`);
        console.error(err);
        res.status(500).send('Server Error: ' + err.message);
    }
});

// Get Attachments List
app.get('/api/attachments', async (req, res) => {
    const requestNo = req.query.requestNo;
    console.log('Get attachments for RequestNo:', requestNo);

    if (!requestNo) {
        return res.status(400).send('Request No is required');
    }

    try {
        const result = await sql.query`SELECT ID, RequestNo, FileName, UploadedAt FROM Attachments WHERE RequestNo = ${requestNo}`;
        res.json(result.recordset);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// Download Attachment
app.get('/api/attachments/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await sql.query`SELECT FileName, FilePath FROM Attachments WHERE ID = ${id}`;
        const attachment = result.recordset[0];

        if (!attachment) {
            return res.status(404).send('Attachment not found');
        }

        const filePath = attachment.FilePath;
        if (fs.existsSync(filePath)) {
            const disposition = req.query.download === 'true' ? 'attachment' : 'inline';
            res.setHeader('Content-Disposition', `${disposition}; filename="${attachment.FileName}"`);
            res.sendFile(filePath);
        } else {
            res.status(404).send('File not found on server');
        }
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// Delete Attachment
app.delete('/api/attachments/:id', async (req, res) => {
    const { id } = req.params;
    try {
        // Get file path first
        const result = await sql.query`SELECT FilePath FROM Attachments WHERE ID = ${id}`;
        if (result.recordset.length > 0) {
            const filePath = result.recordset[0].FilePath;
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }

        await sql.query`DELETE FROM Attachments WHERE ID = ${id}`;

        res.json({ message: 'Attachment deleted' });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// Global Error Handler
app.use((err, req, res, next) => {
    console.error('Global Error Handler:', err);
    const logFile = path.join(__dirname, 'debug.log');
    fs.appendFileSync(logFile, `${new Date().toISOString()} - GLOBAL ERROR: ${err.message}\n${err.stack}\n`);
    res.status(500).send('Server Error: ' + err.message);
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

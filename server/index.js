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

// Updated createNotifications helper to fix syntax and logic
const createNotifications = async (requestNo, type, message, triggerUserEmail, triggerUserName) => {
    try {
        console.log('--- START NOTIFICATION GENERATION ---');
        console.log(`Request: ${requestNo}, Type: ${type}, Trigger: ${triggerUserName} (${triggerUserEmail})`);

        let recipientEmails = new Set();

        // 1. Get Enquiry Details (CreatedBy)
        const enqRes = await sql.query`SELECT CreatedBy FROM EnquiryMaster WHERE RequestNo = ${requestNo}`;
        let createdBy = '';
        if (enqRes.recordset.length > 0) {
            createdBy = enqRes.recordset[0].CreatedBy;
            console.log(`Enquiry Created By: ${createdBy}`);
        }

        // A. Add Creator
        if (createdBy) {
            const u = await sql.query`SELECT EmailId FROM Master_ConcernedSE WHERE FullName = ${createdBy}`;
            if (u.recordset.length > 0 && u.recordset[0].EmailId) {
                const email = u.recordset[0].EmailId.trim().toLowerCase();
                recipientEmails.add(email);
                console.log(`Added Creator Email: ${email}`);
            }
        }

        // B. Add Concerned SEs
        const seRes = await sql.query`SELECT SEName FROM ConcernedSE WHERE RequestNo = ${requestNo}`;
        console.log(`Found ${seRes.recordset.length} Concerned SEs linked.`);
        for (const row of seRes.recordset) {
            const u = await sql.query`SELECT EmailId FROM Master_ConcernedSE WHERE FullName = ${row.SEName}`;
            if (u.recordset.length > 0 && u.recordset[0].EmailId) {
                const email = u.recordset[0].EmailId.trim().toLowerCase();
                recipientEmails.add(email);
                console.log(`Added Concerned SE Email: ${email} (Name: ${row.SEName})`);
            }
        }

        // C. Add Enquiry For Items -> Emails (Division Members)
        const itemRes = await sql.query`SELECT ItemName FROM EnquiryFor WHERE RequestNo = ${requestNo}`;
        console.log(`Found ${itemRes.recordset.length} Enquiry Items linked.`);
        if (itemRes.recordset.length > 0) {
            for (const itemRow of itemRes.recordset) {
                const mItem = await sql.query`SELECT CommonMailIds, CCMailIds FROM Master_EnquiryFor WHERE ItemName = ${itemRow.ItemName}`;
                if (mItem.recordset.length > 0) {
                    const { CommonMailIds, CCMailIds } = mItem.recordset[0];
                    if (CommonMailIds) {
                        CommonMailIds.split(',').forEach(e => {
                            const email = e.trim().toLowerCase();
                            if (email) {
                                recipientEmails.add(email);
                                console.log(`Added CommonMailId: ${email} (Item: ${itemRow.ItemName})`);
                            }
                        });
                    }
                    if (CCMailIds) {
                        CCMailIds.split(',').forEach(e => {
                            const email = e.trim().toLowerCase();
                            if (email) {
                                recipientEmails.add(email);
                                console.log(`Added CCMailId: ${email} (Item: ${itemRow.ItemName})`);
                            }
                        });
                    }
                }
            }
        }

        // Remove Trigger User
        if (triggerUserEmail) {
            const triggerEmailLower = triggerUserEmail.trim().toLowerCase();
            if (recipientEmails.has(triggerEmailLower)) {
                recipientEmails.delete(triggerEmailLower);
                console.log(`Removed Trigger User Email: ${triggerEmailLower}`);
            }
        }

        console.log('Final Recipient List:', Array.from(recipientEmails));

        // Insert
        for (const email of recipientEmails) {
            const u = await sql.query`SELECT ID FROM Master_ConcernedSE WHERE EmailId = ${email}`;
            if (u.recordset.length > 0) {
                const userId = u.recordset[0].ID;
                await sql.query`
                    INSERT INTO Notifications (UserID, Type, Message, LinkID, CreatedBy)
                    VALUES (${userId}, ${type}, ${message}, ${requestNo}, ${triggerUserName})
                 `;
                console.log(`Notification inserted for UserID: ${userId} (${email})`);
            } else {
                console.log(`WARNING: No UserID found for email: ${email} - Notification skipped.`);
            }
        }
        console.log('--- END NOTIFICATION GENERATION ---');
    } catch (e) {
        console.error('CRITICAL ERROR creating notifications:', e);
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
app.use(express.json({ limit: '50mb' }));
app.use('/uploads', express.static('uploads')); // Serve uploaded files

// Request Logger
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    console.log('Body:', JSON.stringify(req.body, null, 2));
    next();
});

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
            console.log('Login failed: User not found for', email);
            return res.status(400).json({ message: 'Invalid email or password' });
        }

        // Check password
        // Check password
        const isMatch = await bcrypt.compare(password, user.LoginPassword);
        if (!isMatch) {
            console.log('Login failed: Password mismatch for', email);
            return res.status(400).json({ message: 'Invalid email or password' });
        }

        // Return user info (excluding password)
        const { LoginPassword, ...userWithoutPassword } = user;
        // Ensure ProfileImage is included (it allows NULL)
        res.json({ user: userWithoutPassword });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ message: 'Server error during login' });
    }
});

// Check if user exists and flow requirement
app.post('/api/auth/check-user', async (req, res) => {
    const { email } = req.body;
    try {
        const result = await sql.query`SELECT * FROM Master_ConcernedSE WHERE EmailId = ${email}`;
        const user = result.recordset[0];

        if (!user) {
            return res.json({ exists: false });
        }

        // Check if first time login (no password set)
        const isFirstLogin = !user.LoginPassword || user.LoginPassword === '';
        res.json({ exists: true, isFirstLogin });
    } catch (err) {
        console.error('Check user error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Set Password
app.post('/api/auth/set-password', async (req, res) => {
    const { email, newPassword } = req.body;
    try {
        const result = await sql.query`SELECT * FROM Master_ConcernedSE WHERE EmailId = ${email}`;
        const user = result.recordset[0];

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        await sql.query`UPDATE Master_ConcernedSE SET LoginPassword = ${hashedPassword} WHERE EmailId = ${email}`;

        // Return user info for auto-login
        const { LoginPassword, ...userWithoutPassword } = user;
        // Update userWithoutPassword with new info? Actually just returning basic info is enough or trigger login on frontend
        // Assuming frontend will auto-login or ask to login. Let's return success.
        res.json({ message: 'Password set successfully' });
    } catch (err) {
        console.error('Set password error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Forgot Password
app.post('/api/auth/forgot-password', async (req, res) => {
    const { email } = req.body;
    try {
        const result = await sql.query`SELECT * FROM Master_ConcernedSE WHERE EmailId = ${email}`;
        const user = result.recordset[0];

        if (!user) {
            // Don't reveal user existence? Or for this internal tool it's fine.
            return res.status(404).json({ message: 'User not found' });
        }

        // In a real app, generate token + send email.
        // Here we will simulate by sending a temp password or just a link.
        // Since we don't have a reset page route yet, let's just send a generic email saying "Contact Admin" or similar, 
        // OR truly implement it. 
        // User requirement: "ability to reset password by forgot password option".
        // Let's generate a temporary password and email it.

        const tempPassword = Math.random().toString(36).slice(-8);
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(tempPassword, salt);

        await sql.query`UPDATE Master_ConcernedSE SET LoginPassword = ${hashedPassword} WHERE EmailId = ${email}`;

        const mailOptions = {
            from: process.env.SMTP_USER,
            to: email,
            subject: 'EMS Portal - Password Reset',
            html: `<p>Your password has been temporarily reset to: <strong>${tempPassword}</strong></p><p>Please login and change it if needed (feature pending) or use this to login.</p>`
        };

        try {
            await transporter.sendMail(mailOptions);
            res.json({ message: 'Temporary password sent to email.' });
        } catch (mailErr) {
            console.error('Mail error:', mailErr);
            res.status(500).json({ message: 'Failed to send reset email.' });
        }

    } catch (err) {
        console.error('Forgot password error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Change Password (Authenticated)
app.post('/api/auth/change-password', async (req, res) => {
    const { userId, currentPassword, newPassword } = req.body;

    try {
        const result = await sql.query`SELECT * FROM Master_ConcernedSE WHERE ID = ${userId}`;
        const user = result.recordset[0];

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Verify current password
        const isMatch = await bcrypt.compare(currentPassword, user.LoginPassword);
        if (!isMatch) {
            return res.status(400).json({ message: 'Incorrect current password' });
        }

        // Hash new password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        await sql.query`UPDATE Master_ConcernedSE SET LoginPassword = ${hashedPassword} WHERE ID = ${userId}`;

        // Send Notification Email
        if (user.EmailId) {
            const mailOptions = {
                from: process.env.SMTP_USER,
                to: user.EmailId,
                subject: 'Security Alert: Password Changed',
                html: `
                    <p>Dear ${user.FullName},</p>
                    <p>Your password for the EMS Portal has been successfully changed.</p>
                    <p>If you did not perform this action, please contact the administrator immediately.</p>
                `
            };
            transporter.sendMail(mailOptions).catch(err => console.error('Failed to send password change notification:', err));
        }

        res.json({ message: 'Password changed successfully' });

    } catch (err) {
        console.error('Change password error:', err);
        res.status(500).json({ message: 'Server error' });
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

            // Send Email (Async - Do not await to speed up UI)
            sendEnquiryEmail(emailData, { to: uniqueTo, cc: uniqueCC })
                .then(() => log('Internal Enquiry Email sent successfully'))
                .catch(err => log(`Error sending Internal Enquiry Email: ${err.message}`));

            // New Email Logic
            // New Email Logic
            if (AutoAck) {
                // Async Execution
                (async () => {
                    try {
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
                    } catch (err) {
                        log(`Async Email Error: ${err.message}`);
                    }
                })();
            } else {
                log('AutoAck is false, skipping email');
            }

        } catch (emailErr) {
            console.error('Failed to send email notification:', emailErr);
            // Don't fail the request if email fails, just log it
        }

        // Notification
        const currentUserEmailRes = await sql.query`SELECT EmailId FROM Master_ConcernedSE WHERE FullName = ${req.body.CreatedBy}`;
        const currentUserEmail = currentUserEmailRes.recordset.length > 0 ? currentUserEmailRes.recordset[0].EmailId : null;
        await createNotifications(RequestNo, 'New Enquiry', `New Enquiry ${RequestNo} created by ${req.body.CreatedBy}`, currentUserEmail, req.body.CreatedBy);

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


        // Send Acknowledgement Email on Update if checked - REMOVED per user request
        // if (AutoAck) { ... }

        // Notification
        const modBy = req.body.ModifiedBy || 'System';
        const modUserEmailRes = await sql.query`SELECT EmailId FROM Master_ConcernedSE WHERE FullName = ${modBy}`;
        const modUserEmail = modUserEmailRes.recordset.length > 0 ? modUserEmailRes.recordset[0].EmailId : null;
        await createNotifications(id, 'Enquiry Update', `Enquiry ${id} updated by ${modBy}`, modUserEmail, modBy);

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
    const { FullName, Designation, EmailId, LoginPassword, Status, Department, Roles, RequestNo, ModifiedBy } = req.body;

    try {
        let hashedPassword = null;
        if (LoginPassword && LoginPassword.trim().length > 0) {
            const salt = await bcrypt.genSalt(10);
            hashedPassword = await bcrypt.hash(LoginPassword, salt);
        }

        // Insert and get ID
        const result = await sql.query`
            INSERT INTO Master_ConcernedSE (FullName, Designation, EmailId, LoginPassword, Status, Department, Roles, RequestNo)
            VALUES (${FullName}, ${Designation}, ${EmailId}, ${hashedPassword}, ${Status}, ${Department}, ${Roles}, ${RequestNo});
            SELECT SCOPE_IDENTITY() AS ID;
        `;

        const newUserId = result.recordset[0].ID;

        // Notification
        const displayRoles = Array.isArray(Roles) ? Roles.join(', ') : Roles;
        const msg = `Welcome to EMS! Your account has been created with roles: ${displayRoles}.`;
        const adminName = ModifiedBy || 'Admin';

        await sql.query`
            INSERT INTO Notifications (UserID, Type, Message, LinkID, CreatedBy)
            VALUES (${newUserId}, 'System', ${msg}, 'Profile', ${adminName})
        `;

        res.status(201).json({ message: 'User added', id: newUserId });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

app.put('/api/users/:id', async (req, res) => {
    const { id } = req.params;
    const { FullName, Designation, EmailId, Status, Department, Roles, ModifiedBy } = req.body; // Expect ModifiedBy (Admin Name)
    try {
        // Note: Password update logic should be separate or handled carefully. Skipping password update here for simplicity unless provided.
        await sql.query`UPDATE Master_ConcernedSE SET FullName=${FullName}, Designation=${Designation}, EmailId=${EmailId}, Status=${Status}, Department=${Department}, Roles=${Roles} WHERE ID=${id}`;

        // Notify the user
        const displayRoles = Array.isArray(Roles) ? Roles.join(', ') : Roles;
        const msg = `Your roles have been updated to: ${displayRoles}. Please refresh your page.`;
        const adminName = ModifiedBy || 'Admin';

        // Insert Notification directly for this user
        // Using 'System' as LinkID to indicate system message or no link
        await sql.query`
            INSERT INTO Notifications (UserID, Type, Message, LinkID, CreatedBy)
            VALUES (${id}, 'System', ${msg}, 'Profile', ${adminName})
        `;

        res.json({ message: 'User updated and notified' });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

app.delete('/api/users/:id', async (req, res) => {
    const { id } = req.params;
    try {
        console.log(`Deleting user with ID: ${id}`);
        // 1. Delete notifications related to this user (Clean up)
        await sql.query`DELETE FROM Notifications WHERE UserID = ${id}`;

        // 2. Delete the user
        // Note: If there are other foreign keys (e.g. EnquiryMaster.CreatedBy), this might still fail if UserID is used there.
        // However, standard master tables usually don't cascade delete.
        // If "Remove" is requested, we assume hard delete.
        await sql.query`DELETE FROM Master_ConcernedSE WHERE ID = ${id}`;

        res.json({ message: 'User deleted' });
    } catch (err) {
        console.error('Delete User Error:', err);
        res.status(500).send('Server Error: ' + err.message);
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
            VALUES(${requestNo}, ${fileName}, ${filePath})`;

            uploadedFiles.push({ fileName });
        }

        res.status(201).json({ message: 'Files uploaded successfully', files: uploadedFiles });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// --- System Routes ---

// Get Next Request No
app.get('/api/system/next-request-no', async (req, res) => {
    try {
        const result = await sql.query`
            SELECT MAX(TRY_CAST(RequestNo AS BIGINT)) as MaxID 
            FROM EnquiryMaster 
            WHERE RequestNo NOT LIKE '%/%' AND TRY_CAST(RequestNo AS BIGINT) IS NOT NULL
        `;

        let nextId = 9;
        const maxVal = result.recordset[0].MaxID;
        if (maxVal != null) {
            nextId = parseInt(maxVal, 10) + 1;
        }

        res.json({ nextId: nextId.toString() });
    } catch (err) {
        console.error('Error generating next ID:', err);
        res.status(500).send('Error generating ID');
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
        const result = await sql.query`SELECT ID, RequestNo, FileName, UploadedAt FROM Attachments WHERE RequestNo = ${requestNo} `;
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
        const result = await sql.query`SELECT FileName, FilePath FROM Attachments WHERE ID = ${id} `;
        const attachment = result.recordset[0];

        if (!attachment) {
            return res.status(404).send('Attachment not found');
        }

        const filePath = attachment.FilePath;
        if (fs.existsSync(filePath)) {
            const disposition = req.query.download === 'true' ? 'attachment' : 'inline';
            res.setHeader('Content-Disposition', `${disposition}; filename = "${attachment.FileName}"`);
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
        const result = await sql.query`SELECT FilePath FROM Attachments WHERE ID = ${id} `;
        if (result.recordset.length > 0) {
            const filePath = result.recordset[0].FilePath;
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }

        await sql.query`DELETE FROM Attachments WHERE ID = ${id} `;

        res.json({ message: 'Attachment deleted' });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// Update Profile Image
app.post('/api/auth/update-profile-image', async (req, res) => {
    const { userId, imageBase64 } = req.body;
    try {
        await sql.query`UPDATE Master_ConcernedSE SET ProfileImage = ${imageBase64} WHERE ID = ${userId} `;
        res.json({ message: 'Profile image updated' });
    } catch (err) {
        console.error('Error updating profile image:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// --- Notifications API ---
app.get('/api/notifications/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const result = await sql.query`SELECT * FROM Notifications WHERE UserID = ${userId} ORDER BY CreatedAt DESC`;
        res.json(result.recordset);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

app.put('/api/notifications/:id/read', async (req, res) => {
    try {
        const { id } = req.params;
        await sql.query`UPDATE Notifications SET IsRead = 1 WHERE ID = ${id}`;
        res.json({ message: 'Marked as read' });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// Clear All Notifications
app.delete('/api/notifications/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        await sql.query`DELETE FROM Notifications WHERE UserID = ${userId}`;
        res.json({ message: 'All notifications cleared' });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// Get Notes
app.get('/api/enquiries/:id/notes', async (req, res) => {
    try {
        const enquiryId = decodeURIComponent(req.params.id);
        const result = await sql.query`SELECT * FROM EnquiryNotes WHERE EnquiryID = ${enquiryId} ORDER BY CreatedAt ASC`;
        res.json(result.recordset);
    } catch (err) {
        console.error('Error fetching notes:', err);
        res.status(500).send(err.message);
    }
});

// Add Note
app.post('/api/enquiries/:id/notes', async (req, res) => {
    const { userId, userName, userProfileImage, content } = req.body;
    const enquiryId = decodeURIComponent(req.params.id);
    try {
        const request = new sql.Request();
        request.input('EnquiryID', sql.NVarChar, enquiryId); // Assuming RequestNo is string
        request.input('UserID', sql.Int, userId);
        request.input('UserName', sql.NVarChar, userName);
        request.input('UserProfileImage', sql.NVarChar, userProfileImage);
        request.input('NoteContent', sql.NVarChar, content);

        await request.query`
            INSERT INTO EnquiryNotes(EnquiryID, UserID, UserName, UserProfileImage, NoteContent)
            VALUES(@EnquiryID, @UserID, @UserName, @UserProfileImage, @NoteContent)
        `;

        // Notify Group
        const uRes = await sql.query`SELECT EmailId FROM Master_ConcernedSE WHERE ID = ${userId} `;
        const uEmail = uRes.recordset.length > 0 ? uRes.recordset[0].EmailId : null;
        await createNotifications(enquiryId, 'Note', `New note from ${userName} `, uEmail, userName);

        // Mention Logic
        try {
            const allUsers = await sql.query`SELECT FullName, ID FROM Master_ConcernedSE`;
            for (const u of allUsers.recordset) {
                // Create regex for case-insensitive match of @FullName
                const mentionRegex = new RegExp(`@${u.FullName} `, 'i');
                if (mentionRegex.test(content)) {
                    if (u.ID !== userId) {
                        await sql.query`INSERT INTO Notifications(UserID, Type, Message, LinkID, CreatedBy) VALUES(${u.ID}, 'Mention', ${userName + ' mentioned you in a note'}, ${enquiryId}, ${userName})`;
                    }
                }
            }
        } catch (mentionErr) {
            console.error('Mention error:', mentionErr);
        }

        res.sendStatus(201);
    } catch (err) {
        console.error('Error adding note:', err);
        res.status(500).send(err.message);
    }
});



const initApp = async () => {
    try {
        await connectDB();
        console.log('Database connected successfully.');

        // Check if ProfileImage column exists in Master_ConcernedSE
        try {
            const checkColumn = await sql.query`
                SELECT COLUMN_NAME 
                FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_NAME = 'Master_ConcernedSE' AND COLUMN_NAME = 'ProfileImage'
    `;

            if (checkColumn.recordset.length === 0) {
                console.log('Adding ProfileImage column to Master_ConcernedSE...');
                await sql.query`ALTER TABLE Master_ConcernedSE ADD ProfileImage NVARCHAR(MAX)`;
                console.log('ProfileImage column added.');
            }

            // Check if EnquiryNotes table exists
            const checkNotesTable = await sql.query`
SELECT * FROM sysobjects WHERE name = 'EnquiryNotes' AND xtype = 'U'
    `;
            if (checkNotesTable.recordset.length === 0) {
                console.log('Creating EnquiryNotes table...');
                await sql.query`
                    CREATE TABLE EnquiryNotes(
        ID INT IDENTITY(1, 1) PRIMARY KEY,
        EnquiryID INT NOT NULL,
        UserID INT NOT NULL,
        UserName NVARCHAR(255),
        UserProfileImage NVARCHAR(MAX),
        NoteContent NVARCHAR(MAX),
        CreatedAt DATETIME DEFAULT GETDATE()
    )
                 `;
                console.log('EnquiryNotes table created.');
            }
        } catch (schemaErr) {
            console.error('Schema check error:', schemaErr);
        }

    } catch (err) {
        console.error('Database Initialization Failed:', err);
    }
};

initApp();

console.log('Starting server initialization...');
console.log('PORT:', PORT);
const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT} `);
});
server.on('error', (e) => console.error('Server Error:', e));









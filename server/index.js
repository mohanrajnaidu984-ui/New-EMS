const fs = require('fs');
const path = require('path');
console.log('SERVER STARTING - ACK V3 - Registering Sales Target Routes');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const { connectDB, sql, dbConfig } = require('./dbConfig');
const { resolvePricingAccessContext, getPricingAnchorJobs } = require('./lib/quotePricingAccess');
const multer = require('multer');
const nodemailer = require('nodemailer');
const Tesseract = require('tesseract.js');
const multerMemory = multer({ storage: multer.memoryStorage() });
const { parseContactCardFromOcrText } = require('./parseContactOcr');

// Configure Nodemailer Transporter
console.log('--- Email Config ---');
console.log('SMTP_HOST:', process.env.SMTP_HOST);
console.log('SMTP_USER:', process.env.SMTP_USER);
console.log('SMTP_PORT:', process.env.SMTP_PORT);

// Strip quotes if present
let user = process.env.SMTP_USER;
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: process.env.SMTP_PORT == 465, // true for 465, false for other ports
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS ? process.env.SMTP_PASS.replace(/^"|"$/g, '') : process.env.SMTP_PASS
    },
    tls: {
        rejectUnauthorized: false
    },
    logger: true,
    debug: true
});

async function normalizeEnquiryForLeadMeta(requestNo, txn = null) {
    const reqNoInt = parseInt(String(requestNo), 10);
    if (!Number.isFinite(reqNoInt) || reqNoInt <= 0) return;
    const runner = txn ? new sql.Request(txn) : new sql.Request();
    runner.input('reqNo', sql.Int, reqNoInt);
    await runner.query(`
        ;WITH RootList AS (
            SELECT
                ef.ID AS RootID,
                ef.ItemName AS RootName,
                CONCAT('L', ROW_NUMBER() OVER (ORDER BY ef.ID)) AS RootCode
            FROM EnquiryFor ef
            WHERE ef.RequestNo = @reqNo
              AND (ef.ParentID IS NULL OR ef.ParentID = 0)
        ),
        WalkUp AS (
            SELECT
                ef.ID AS NodeID,
                ef.ID AS CurrentID,
                ef.ParentID,
                0 AS Depth
            FROM EnquiryFor ef
            WHERE ef.RequestNo = @reqNo
            UNION ALL
            SELECT
                w.NodeID,
                p.ID AS CurrentID,
                p.ParentID,
                w.Depth + 1
            FROM WalkUp w
            INNER JOIN EnquiryFor p ON p.RequestNo = @reqNo AND p.ID = w.ParentID
            WHERE w.ParentID IS NOT NULL AND w.ParentID <> 0 AND w.Depth < 100
        ),
        NodeRoot AS (
            SELECT
                w.NodeID,
                r.RootID,
                r.RootName,
                r.RootCode,
                ROW_NUMBER() OVER (PARTITION BY w.NodeID ORDER BY w.Depth DESC, r.RootID) AS rn
            FROM WalkUp w
            INNER JOIN RootList r ON r.RootID = w.CurrentID
        )
        UPDATE ef
        SET
            LeadJobCode = nr.RootCode,
            LeadJobName = nr.RootName
        FROM EnquiryFor ef
        INNER JOIN NodeRoot nr ON nr.NodeID = ef.ID AND nr.rn = 1
        WHERE ef.RequestNo = @reqNo
        OPTION (MAXRECURSION 32767);
    `);
}

async function normalizeAllEnquiryForLeadMeta() {
    const reqs = await new sql.Request().query(`
        SELECT DISTINCT RequestNo
        FROM EnquiryFor
        WHERE RequestNo IS NOT NULL
    `);
    for (const r of (reqs.recordset || [])) {
        const reqNo = r.RequestNo;
        if (reqNo == null || String(reqNo).trim() === '') continue;
        await normalizeEnquiryForLeadMeta(String(reqNo));
    }
}

const sendEnquiryEmail = async (enquiryData, recipients, attachments = []) => {
    const { to, cc } = recipients;
    if ((!to || to.length === 0) && (!cc || cc.length === 0)) {
        console.log('No recipients for email.');
        return;
    }

    // Generate Attachment Links List
    let attachmentHtml = '';
    if (attachments && attachments.length > 0) {
        attachmentHtml = `
            <tr><td style="background-color: #d4edda; font-weight: bold;">Attachments:</td>
            <td>
                <ul style="margin: 0; padding-left: 20px;">
                    ${attachments.map(att => `
                        <li><a href="http://localhost:5000/api/attachments/${att.ID}" target="_blank">${att.FileName}</a></li>
                    `).join('')}
                </ul>
            </td></tr>
        `;
    }

    const formatDate = (date) => {
        if (!date) return '';
        return new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }).replace(/ /g, '-');
    };

    const mailOptions = {
        from: 'ems@almoayyedcg.com', // Hardcoded to ensure visibility
        to: to.join(','),
        cc: cc ? cc.join(',') : '',
        subject: `New Enquiry No.${enquiryData.RequestNo} dated: ${formatDate(enquiryData.EnquiryDate)}`,
        html: `
            <p>Dear Sir/Madam,</p>
            <p>Greetings !!!</p>
            <p>Please find given below, details pertaining to a customer Enquiry no. ${enquiryData.RequestNo} on ${formatDate(enquiryData.EnquiryDate)}. Please report closure in Enquiry Management System.</p>
            <table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse; width: 100%;">
                <tr><td style="background-color: #d4edda; font-weight: bold;">Enquiry Ref No. :</td><td>${enquiryData.RequestNo}</td></tr>
                <tr><td style="background-color: #d4edda; font-weight: bold;">Enquiry Date:</td><td>${formatDate(enquiryData.EnquiryDate)}</td></tr>
                <tr><td style="background-color: #d4edda; font-weight: bold;">Received From:</td><td>${enquiryData.ReceivedFrom}</td></tr>
                <tr><td style="background-color: #d4edda; font-weight: bold;">Category :</td><td>${enquiryData.EnquiryType}</td></tr>
                <tr><td style="background-color: #d4edda; font-weight: bold;">Project Name:</td><td>${enquiryData.ProjectName}</td></tr>
                <tr><td style="background-color: #d4edda; font-weight: bold;">Client Name:</td><td>${enquiryData.ClientName}</td></tr>
                <tr><td style="background-color: #d4edda; font-weight: bold;">Consultant Name:</td><td>${enquiryData.ConsultantName}</td></tr>
                <tr><td style="background-color: #d4edda; font-weight: bold;">Enquiry Details :</td><td>${enquiryData.DetailsOfEnquiry}</td></tr>
                <tr><td style="background-color: #d4edda; font-weight: bold;">Due Date:</td><td>${formatDate(enquiryData.DueOn)}</td></tr>
                <tr><td style="background-color: #d4edda; font-weight: bold;">Supplementary received with:</td><td>${enquiryData.DocumentsReceived || ''}</td></tr>
                <tr><td style="background-color: #d4edda; font-weight: bold;">Remarks:</td><td>${enquiryData.Remark || ''}</td></tr>
                ${attachmentHtml}
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

// ... (keep existing code) ...

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
                const now = new Date();
                await sql.query`
                    INSERT INTO Notifications (UserID, Type, Message, LinkID, CreatedBy, CreatedAt)
                    VALUES (${userId}, ${type}, ${message}, ${requestNo}, ${triggerUserName}, ${now})
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
const PORT = process.env.PORT || 5001;

// DEBUG ROUTE
app.get('/api/debug/check-user-status', async (req, res) => {
    const email = 'bmselveng1@almoayyedcg.com';
    try {
        // Ensure we are connected
        if (!sql.connected) {
            await connectDB();
        }

        const pool = await sql.connect(dbConfig); // dbConfig is exported from dbConfig.js
        const result = await pool.request()
            .input('email', sql.NVarChar, email)
            .query('SELECT * FROM Master_ConcernedSE WHERE EmailId = @email');

        const similar = await pool.request()
            .input('part', sql.NVarChar, '%' + email.split('@')[0] + '%')
            .query('SELECT FullName, EmailId FROM Master_ConcernedSE WHERE EmailId LIKE @part');

        res.json({
            target: email,
            found: result.recordset.length > 0,
            directMatch: result.recordset[0] || null,
            similar: similar.recordset,
            count: result.recordset.length
        });
    } catch (err) {
        res.status(500).json({ error: err.message, stack: err.stack });
    }
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads'))); // Serve uploaded files from server/uploads

// Request Logger
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    // console.log('Body:', JSON.stringify(req.body, null, 2)); // Reduce noise
    next();
});

// NEW ROUTE HERE - Moved to top to ensure availability
app.get('/api/master/divisions', async (req, res) => {
    try {
        console.log('[API] /api/master/divisions HIT (Top Level)');
        // Fetch unique DepartmentName from Master_EnquiryFor
        const result = await sql.query`
            SELECT DISTINCT DepartmentName 
            FROM Master_EnquiryFor 
            WHERE DepartmentName IS NOT NULL AND DepartmentName <> '' 
            ORDER BY DepartmentName ASC
        `;

        const divisions = result.recordset.map(row => row.DepartmentName);
        console.log(`[API] Found ${divisions.length} divisions:`, divisions);
        res.json(divisions);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// Connect to Database
// Connect to Database
connectDB();

// Upload Logo (Defined early to avoid Router conflicts)
app.post('/api/upload/logo', (req, res, next) => {
    console.log('Hitting /api/upload/logo');
    const uploadDir = path.join(__dirname, 'uploads', 'logos');
    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
    }
    next();
}, upload.single('logo'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }
        // Move file from uploads/ to uploads/logos/ because multer uploads to base dir
        const oldPath = req.file.path;
        const newPath = path.join(__dirname, 'uploads', 'logos', req.file.filename);
        fs.renameSync(oldPath, newPath);

        const relativePath = `uploads/logos/${req.file.filename}`;
        res.json({ message: 'Logo uploaded', filePath: relativePath });
    } catch (err) {
        console.error('Error uploading logo:', err);
        res.status(500).json({ message: 'Server error during upload' });
    }
});

// New RAG & Chat API Routes
const apiRoutes = require('./routes/api');
const dashboardRoutes = require('./routes/dashboard'); // New Dashboard Routes
const pricingRoutes = require('./routes/pricing'); // Pricing Module Routes
const quotesRoutes = require('./routes/quotes'); // Quote Module Routes
const quotePdfRoutes = require('./routes/quotePdf');
app.use('/api', apiRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/pricing', pricingRoutes);
app.use('/api/quotes', quotesRoutes);
app.use('/api/quote-pdf', quotePdfRoutes);
const probabilityRoutes = require('./routes/probabilityRoutes');
app.use('/api/probability', probabilityRoutes);
const salesReportRoutes = require('./routes/salesReportRoutes');
app.use('/api/sales-report', salesReportRoutes);
const salesTargetRoutes = require('./routes/salesTargetRoutes');
app.use('/api/sales-targets', salesTargetRoutes);


// --- OCR Extraction Route ---
app.post('/api/extract-contact-ocr', multerMemory.single('image'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No image uploaded' });
    }

    try {
        console.log('Processing OCR for image size:', req.file.size);
        const { data: { text } } = await Tesseract.recognize(req.file.buffer, 'eng');
        console.log('OCR Output:', text);

        const parsed = parseContactCardFromOcrText(text);
        res.json({
            ...parsed,
            RawText: text
        });

    } catch (err) {
        console.error('OCR Error:', err);
        res.status(500).json({ error: 'Failed to process image' });
    }
});

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
            console.log(`Debug: Input PW Len: ${password.length}, Hash: ${user.LoginPassword}`);
            return res.status(400).json({ message: 'Invalid email or password' });
        }

        // Return user info (excluding password)
        const { LoginPassword, ...userWithoutPassword } = user;

        // Department must come from Master_ConcernedSE (user row), not from an unrelated enquiry's EnquiryFor.

        // Force Admin for ranigovardhan@gmail.com
        if (email.toLowerCase() === 'ranigovardhan@gmail.com') {
            userWithoutPassword.Roles = 'Admin';
            userWithoutPassword.role = 'Admin';
        }
        // Ensure ProfileImage is included (it allows NULL)
        res.json({ user: userWithoutPassword });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ message: 'Server error during login' });
    }
});

// Profile by login email — authoritative Department / roles from Master_ConcernedSE
app.get('/api/auth/profile', async (req, res) => {
    const email = (req.query.email || '').trim();
    if (!email) {
        return res.status(400).json({ message: 'email query required' });
    }
    try {
        const result = await sql.query`SELECT ID, FullName, EmailId, Department, Designation, Roles, Status, RequestNo, ProfileImage, MobileNumber FROM Master_ConcernedSE WHERE EmailId = ${email}`;
        const row = result.recordset[0];
        if (!row) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.json(row);
    } catch (err) {
        console.error('Profile error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Check if user exists and flow requirement
app.post('/api/auth/check-user', async (req, res) => {
    const { email } = req.body;
    console.log('=== CHECK USER REQUEST ===');
    console.log('Email received:', email);
    console.log('Email type:', typeof email);
    console.log('Email length:', email ? email.length : 0);

    try {
        const result = await sql.query`SELECT * FROM Master_ConcernedSE WHERE EmailId = ${email}`;
        console.log('Query result count:', result.recordset.length);

        if (result.recordset.length > 0) {
            console.log('User found:', result.recordset[0].FullName, result.recordset[0].EmailId);
        } else {
            console.log('No user found with email:', email);
            // Try to find similar emails
            const similarResult = await sql.query`SELECT EmailId FROM Master_ConcernedSE WHERE EmailId LIKE ${'%' + email.split('@')[0] + '%'}`;
            const similarEmails = similarResult.recordset.map(r => r.EmailId);
            console.log('Similar emails found:', similarEmails);
            fs.appendFileSync('debug_auth.log', `[${new Date().toISOString()}] Email: ${email}, Similar: ${JSON.stringify(similarEmails)}\n`);
        }

        const user = result.recordset[0];

        if (!user) {
            return res.json({ exists: false });
        }

        // Check if first time login (no password set)
        const isFirstLogin = !user.LoginPassword || user.LoginPassword === '';
        console.log('Is first login:', isFirstLogin);
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

function normalizeEmail(e) {
    return String(e || '').trim().toLowerCase().replace(/@almcg\.com/g, '@almoayyedcg.com');
}

function roleIsAdmin(roleString) {
    const rs = roleString || '';
    const roles = typeof rs === 'string'
        ? rs.split(',').map(r => r.trim().toLowerCase())
        : (Array.isArray(rs) ? rs.map(r => String(r).trim().toLowerCase()) : []);
    return roles.includes('admin') || roles.includes('system');
}

function splitMailList(s) {
    return String(s || '')
        .toLowerCase()
        .replace(/\s+/g, '')
        .replace(/;/g, ',')
        .split(',')
        .map(x => x.trim())
        .filter(Boolean);
}

function stripJobPrefix(s) {
    return String(s || '').replace(/^(L\d+\s*-\s*|Sub Job\s*-\s*)/i, '').trim();
}

async function resolveEnquiryVisibilityContext({ userEmail, userName, userRole }) {
    const email = normalizeEmail(userEmail);
    const isAdmin = roleIsAdmin(userRole) || email === 'ranigovardhan@gmail.com';
    if (isAdmin) return { isAdmin: true, accessMode: 'all', fullName: (userName || '').toString().trim(), email };
    if (!email) return { isAdmin: false, accessMode: 'assigned', fullName: (userName || '').toString().trim(), email: '' };

    const [userRes, ccRes] = await Promise.all([
        sql.query`
            SELECT TOP 1 FullName
            FROM Master_ConcernedSE
            WHERE LOWER(REPLACE(REPLACE(LTRIM(RTRIM(ISNULL(EmailId, N''))), N'@almcg.com', N'@almoayyedcg.com'), N'@ALMCG.COM', N'@almoayyedcg.com')) = ${email}
        `,
        sql.query`
            SELECT TOP 1 1 AS ok
            FROM Master_EnquiryFor
            WHERE ',' + REPLACE(REPLACE(ISNULL(CCMailIds, ''), ' ', ''), ';', ',') + ',' LIKE ${`%,${email},%`}
        `
    ]);
    const fullName = (userRes.recordset?.[0]?.FullName || userName || '').toString().trim();
    const isCcUser = (ccRes.recordset?.length || 0) > 0;
    return { isAdmin: false, accessMode: isCcUser ? 'department' : 'assigned', fullName, email };
}

// Get All Enquiries
app.get('/api/enquiries', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
        const userEmail = req.query.userEmail || '';
        const userName = req.query.userName || '';
        const userRole = req.query.userRole || '';
        const vis = await resolveEnquiryVisibilityContext({ userEmail, userName, userRole });

        const result = await sql.query`SELECT * FROM EnquiryMaster ORDER BY CreatedAt DESC`;

        // Fetch related data
        const customersResult = await sql.query`SELECT * FROM EnquiryCustomer`;
        const contactsResult = await sql.query`SELECT * FROM ReceivedFrom`;
        const typesResult = await sql.query`SELECT * FROM EnquiryType`;
        const itemsResult = await sql.query`SELECT * FROM EnquiryFor`;
        const seResult = await sql.query`SELECT * FROM ConcernedSE`;
        const consultantsResult = await sql.query`SELECT * FROM EnquiryConsultant`;
        const masterEnqForRes = (!vis.isAdmin && vis.email)
            ? await sql.query`SELECT ItemName, CCMailIds FROM Master_EnquiryFor`
            : { recordset: [] };

        // Precompute visibility by RequestNo (ConcernedSE ↔ Master email — not display-name string compare)
        let allowedReqNos = null;
        if (!vis.isAdmin && vis.email) {
            const normEmail = normalizeEmail(vis.email);
            const assignedRes = await sql.query`
                SELECT DISTINCT LTRIM(RTRIM(ISNULL(cs.RequestNo, N''))) AS RequestNo
                FROM ConcernedSE cs
                INNER JOIN Master_ConcernedSE m ON UPPER(LTRIM(RTRIM(ISNULL(m.FullName, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(cs.SEName, N''))))
                WHERE LOWER(REPLACE(REPLACE(LTRIM(RTRIM(ISNULL(m.EmailId, N''))), N'@almcg.com', N'@almoayyedcg.com'), N'@ALMCG.COM', N'@almoayyedcg.com')) = ${normEmail}
                  AND LTRIM(RTRIM(ISNULL(cs.RequestNo, N''))) <> N''
            `;
            let assignedSet = new Set(
                (assignedRes.recordset || [])
                    .map(r => String(r.RequestNo || '').trim())
                    .filter(Boolean)
            );

            if (vis.accessMode === 'department') {
                const emailLower = vis.email;
                const masterRows = (masterEnqForRes.recordset || []).map(r => ({
                    itemName: String(r.ItemName || '').trim(),
                    itemKey: stripJobPrefix(r.ItemName).toLowerCase(),
                    ccMails: splitMailList(r.CCMailIds).map(m => normalizeEmail(m))
                }));
                const masterByKey = new Map();
                masterRows.forEach(r => {
                    if (!r.itemKey) return;
                    const list = masterByKey.get(r.itemKey) || [];
                    list.push(r);
                    masterByKey.set(r.itemKey, list);
                });

                const deptSet = new Set();
                (itemsResult.recordset || []).forEach(ef => {
                    const reqNo = String(ef.RequestNo || '').trim();
                    if (!reqNo) return;
                    const efKey = stripJobPrefix(ef.ItemName).toLowerCase();
                    const candidates = masterByKey.get(efKey) || [];
                    if (candidates.some(c => c.ccMails.includes(emailLower))) {
                        deptSet.add(reqNo);
                    }
                });

                allowedReqNos = new Set([...assignedSet, ...deptSet]);
            } else {
                let assignedOnly = assignedSet;
                const ctx = await resolvePricingAccessContext(vis.email);
                if (ctx.user && !ctx.isCcUser) {
                    const narrowed = new Set();
                    for (const reqNo of assignedSet) {
                        const jobs = (itemsResult.recordset || []).filter(i => String(i.RequestNo || '').trim() === reqNo);
                        const jobRows = jobs.map(j => ({
                            ID: j.ID,
                            ParentID: j.ParentID,
                            ItemName: j.ItemName,
                            CCMailIds: undefined,
                        }));
                        if (getPricingAnchorJobs(jobRows, ctx, vis.email).length > 0) {
                            narrowed.add(reqNo);
                        }
                    }
                    assignedOnly = narrowed;
                }
                allowedReqNos = assignedOnly;
            }
        }

        const enquiries = result.recordset.map(enq => {
            const reqNo = enq.RequestNo;

            const relatedCustomers = customersResult.recordset.filter(c => c.RequestNo === reqNo).map(c => c.CustomerName);
            const relatedContacts = contactsResult.recordset.filter(c => c.RequestNo === reqNo).map(c => `${c.ContactName}|${c.CompanyName || ''}`);
            const relatedTypes = typesResult.recordset.filter(t => t.RequestNo === reqNo).map(t => t.TypeName);
            const relatedConsultants = consultantsResult.recordset.filter(c => c.RequestNo === reqNo).map(c => c.ConsultantName);
            // Use full object for hierarchy
            const relatedItemsRaw = itemsResult.recordset.filter(i => i.RequestNo === reqNo);
            const relatedItemsStructured = relatedItemsRaw.map(i => ({
                id: i.ID,
                parentId: i.ParentID,
                itemName: i.ItemName,
                leadJobCode: i.LeadJobCode,
                parentName: i.ParentItemName
            }));
            const relatedItemsDisplay = relatedItemsRaw.map(i => i.ItemName);

            const relatedSEs = seResult.recordset.filter(s => s.RequestNo === reqNo).map(s => s.SEName);

            return {
                ...enq,
                SelectedEnquiryTypes: relatedTypes,
                SelectedEnquiryFor: relatedItemsStructured, // Pass structure
                SelectedCustomers: relatedCustomers,
                SelectedReceivedFroms: relatedContacts,
                SelectedConcernedSEs: relatedSEs,
                SelectedConsultants: relatedConsultants,
                // Legacy fields for backward compatibility & List View
                EnquiryType: relatedTypes.join(', '),
                EnquiryFor: relatedItemsDisplay.join(', '),
                CustomerName: enq.CustomerName || relatedCustomers.join(', '), // Prefer Master, fallback to transaction
                ClientName: enq.ClientName,
                ConsultantName: enq.ConsultantName || relatedConsultants.join(', '),
                ReceivedFrom: relatedContacts.map(c => c.split('|')[0]).join(', '),
                ConcernedSE: relatedSEs.join(', '),
                SourceOfInfo: enq.SourceOfEnquiry,
                DueOn: enq.DueDate
            };
        });

        // Apply visibility filter (non-admin only)
        const visibleEnquiries = (allowedReqNos && allowedReqNos.size >= 0)
            ? enquiries.filter(e => allowedReqNos.has(String(e.RequestNo || '').trim()))
            : enquiries;

        // Search Filter
        const search = req.query.search ? req.query.search.toLowerCase() : null;
        console.log(`[GET /api/enquiries] Search term: '${search}'`);

        const filteredEnquiries = search
            ? visibleEnquiries.filter(e => {
                const reqNo = e.RequestNo ? String(e.RequestNo).toLowerCase() : '';
                const projName = e.ProjectName ? e.ProjectName.toLowerCase() : '';
                const custName = e.CustomerName ? e.CustomerName.toLowerCase() : '';
                return reqNo.includes(search) || projName.includes(search) || custName.includes(search);
            })
            : visibleEnquiries;

        console.log(`[GET /api/enquiries] Total filtered items: ${filteredEnquiries.length}`);
        if (search && filteredEnquiries.length === 0) {
            console.log('[GET /api/enquiries] No matches found. Sample IDs:', enquiries.slice(0, 3).map(e => e.RequestNo));
        }

        res.json(filteredEnquiries);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// Add Enquiry
app.post('/api/enquiries', async (req, res) => {
    const logFile = path.join(__dirname, 'debug.log');
    const log = (msg) => fs.appendFileSync(logFile, `${new Date().toISOString()} - ${msg}\n`);

    try {
        log(`POST /api/enquiries Body: ${JSON.stringify(req.body, null, 2)}`);

        let transaction;
        const {
            SourceOfInfo, EnquiryDate, DueOn, SiteVisitDate,
            SelectedEnquiryTypes, SelectedEnquiryFor,
            SelectedCustomers, SelectedReceivedFroms, SelectedConcernedSEs,
            ProjectName, ClientName, ConsultantName, SelectedConsultants, DetailsOfEnquiry,
            DocumentsReceived, hardcopy, drawing, dvd, spec, eqpschedule, Remark,
            AutoAck, ceosign, Status, AcknowledgementSE, AdditionalNotificationEmails, CustomerRefNo
        } = req.body;

        const RequestNo = req.body.RequestNo ? req.body.RequestNo.trim() : '';

        log(`AutoAck Value: ${AutoAck}, Type: ${typeof AutoAck}`);
        log(`SelectedCustomers: ${JSON.stringify(SelectedCustomers)}`);

        // Check if RequestNo already exists
        const checkResult = await sql.query`SELECT RequestNo FROM EnquiryMaster WHERE RequestNo = ${RequestNo}`;
        if (checkResult.recordset.length > 0) {
            log(`Duplicate RequestNo detected: ${RequestNo}`);
            return res.status(400).json({
                message: 'Duplicate Enquiry Number',
                error: `Enquiry number ${RequestNo} already exists. Please refresh the page to generate a new unique number.`
            });
        }

        transaction = new sql.Transaction();
        await transaction.begin();

        const request = new sql.Request(transaction);
        request.input('RequestNo', sql.NVarChar, RequestNo);
        request.input('SourceOfEnquiry', sql.NVarChar, SourceOfInfo || null);
        request.input('EnquiryDate', sql.VarChar(10), EnquiryDate ? EnquiryDate.split('T')[0] : null);
        request.input('DueDate', sql.VarChar(10), DueOn ? DueOn.split('T')[0] : null);
        request.input('SiteVisitDate', sql.VarChar(10), SiteVisitDate ? SiteVisitDate.split('T')[0] : null);

        request.input('CustomerName', sql.NVarChar, SelectedCustomers ? SelectedCustomers.join(',') : null);
        request.input('ReceivedFrom', sql.NVarChar, SelectedReceivedFroms ? SelectedReceivedFroms.map(i => i.split('|')[0]).join(',') : null);
        request.input('ProjectName', sql.NVarChar, ProjectName || null);
        request.input('ClientName', sql.NVarChar, ClientName || null);
        request.input('ConsultantName', sql.NVarChar, SelectedConsultants ? SelectedConsultants.join(',') : (ConsultantName || null));
        request.input('EnquiryDetails', sql.NVarChar, DetailsOfEnquiry || null);

        request.input('Doc_HardCopies', sql.Bit, hardcopy ?? false);
        request.input('Doc_Drawing', sql.Bit, drawing ?? false);
        request.input('Doc_CD_DVD', sql.Bit, dvd ?? false);
        request.input('Doc_Spec', sql.Bit, spec ?? false);
        request.input('Doc_EquipmentSchedule', sql.Bit, eqpschedule ?? false);
        request.input('Remarks', sql.NVarChar, Remark || null);
        request.input('SendAcknowledgementMail', sql.Bit, AutoAck ?? false);
        request.input('CustomerRefNo', sql.NVarChar, req.body.CustomerRefNo || null);
        request.input('ED_CEOSignatureRequired', sql.Bit, ceosign ?? false);
        request.input('Status', sql.NVarChar, Status || 'Open');
        request.input('AcknowledgementSE', sql.NVarChar, AcknowledgementSE || null);
        request.input('AdditionalNotificationEmails', sql.NVarChar, AdditionalNotificationEmails || null);
        request.input('OthersSpecify', sql.NVarChar, DocumentsReceived || null);
        request.input('CreatedBy', sql.NVarChar, req.body.CreatedBy || 'System');

        log(`DEBUG - AcknowledgementSE value: '${AcknowledgementSE}', Type: ${typeof AcknowledgementSE}`);
        log(`DEBUG - AdditionalNotificationEmails value: '${AdditionalNotificationEmails}', Type: ${typeof AdditionalNotificationEmails}`);

        const now = new Date();
        request.input('now', sql.DateTime, now);
        await request.query(`
            INSERT INTO EnquiryMaster (
                RequestNo, SourceOfEnquiry, EnquiryDate, DueDate, SiteVisitDate,
                CustomerName, ReceivedFrom, ProjectName, ClientName, ConsultantName,
                EnquiryDetails, Doc_HardCopies, Doc_Drawing, Doc_CD_DVD,
                Doc_Spec, Doc_EquipmentSchedule, Remarks, CustomerRefNo, SendAcknowledgementMail, ED_CEOSignatureRequired, Status, AcknowledgementSE, AdditionalNotificationEmails, OthersSpecify, CreatedBy, CreatedAt
            ) VALUES (
                @RequestNo, @SourceOfEnquiry, @EnquiryDate, @DueDate, @SiteVisitDate,
                @CustomerName, @ReceivedFrom, @ProjectName, @ClientName, @ConsultantName,
                @EnquiryDetails, @Doc_HardCopies, @Doc_Drawing, @Doc_CD_DVD,
                @Doc_Spec, @Doc_EquipmentSchedule, @Remarks, @CustomerRefNo, @SendAcknowledgementMail, @ED_CEOSignatureRequired, @Status, @AcknowledgementSE, @AdditionalNotificationEmails, @OthersSpecify, @CreatedBy, @now
            )
        `);

        // Helper to insert related items
        const insertRelated = async (table, col, items, txn) => {
            if (items && items.length > 0) {
                if (table === 'EnquiryFor') {
                    const normalized = items.map(i => {
                        if (typeof i === 'string') return { tempId: i, itemName: i, parentId: null };
                        return {
                            tempId: i.id || Math.random().toString(36),
                            itemName: i.itemName,
                            leadJobCode: i.leadJobCode,
                            leadJobName: i.leadJobName,
                            parentId: i.parentId,
                            parentName: i.parentName
                        };
                    });

                    const idMap = {};
                    let remaining = [...normalized];
                    let pass = 0;

                    while (remaining.length > 0 && pass < 10) {
                        const nextBatch = [];
                        for (const item of remaining) {
                            const ready = !item.parentId || idMap[item.parentId];
                            if (ready) {
                                const r = new sql.Request(txn);
                                r.input('reqNo', sql.NVarChar, RequestNo);

                                let code = item.leadJobCode || null;
                                let name = item.itemName;

                                if (!code) {
                                    const match = name.match(/^(L\d+)\s+-\s+(.*)$/);
                                    if (match) {
                                        code = match[1];
                                        name = match[2];
                                    }
                                }
                                if (!code || !String(code).trim().toUpperCase().match(/^L\d+$/)) {
                                    code = null;
                                } else {
                                    code = String(code).trim().toUpperCase();
                                }

                                const leadName = item.leadJobName || null;
                                r.input('code', sql.NVarChar, code);
                                r.input('lname', sql.NVarChar, leadName);
                                r.input('val', sql.NVarChar, name);
                                r.input('pId', sql.Int, item.parentId ? idMap[item.parentId] : null);

                                const res = await r.query(`INSERT INTO EnquiryFor (RequestNo, LeadJobCode, LeadJobName, ItemName, ParentID) VALUES (@reqNo, @code, @lname, @val, @pId); SELECT SCOPE_IDENTITY() AS id;`);
                                idMap[item.tempId] = res.recordset[0].id;
                            } else {
                                nextBatch.push(item);
                            }
                        }
                        if (nextBatch.length === remaining.length) {
                            for (const item of nextBatch) {
                                const r = new sql.Request(txn);
                                r.input('reqNo', sql.NVarChar, RequestNo);

                                let code = item.leadJobCode || null;
                                let name = item.itemName;

                                if (!code) {
                                    const match = name.match(/^(L\d+)\s+-\s+(.*)$/);
                                    if (match) {
                                        code = match[1];
                                        name = match[2];
                                    }
                                }
                                if (!code || !String(code).trim().toUpperCase().match(/^L\d+$/)) {
                                    code = null;
                                } else {
                                    code = String(code).trim().toUpperCase();
                                }

                                const leadName = item.leadJobName || null;
                                r.input('code', sql.NVarChar, code);
                                r.input('lname', sql.NVarChar, leadName);
                                r.input('val', sql.NVarChar, name);
                                r.input('pId', sql.Int, null);
                                const res = await r.query(`INSERT INTO EnquiryFor (RequestNo, LeadJobCode, LeadJobName, ItemName, ParentID) VALUES (@reqNo, @code, @lname, @val, @pId); SELECT SCOPE_IDENTITY() AS id;`);
                                idMap[item.tempId] = res.recordset[0].id;
                            }
                            break;
                        }
                        remaining = nextBatch;
                        pass++;
                    }
                } else {
                    if (table === 'ConcernedSE' && col === 'SEName') {
                        let hasEmailColumn = false;
                        try {
                            const chk = await new sql.Request(txn).query(`
                                SELECT 1 AS ok
                                FROM INFORMATION_SCHEMA.COLUMNS
                                WHERE TABLE_NAME = 'ConcernedSE' AND COLUMN_NAME = 'EmailId'
                            `);
                            hasEmailColumn = (chk.recordset || []).length > 0;
                        } catch (_) { }

                        for (const item of items) {
                            const seName = String(item || '').trim();
                            const r = new sql.Request(txn);
                            r.input('reqNo', sql.NVarChar, RequestNo);
                            r.input('seName', sql.NVarChar, seName);

                            let seEmail = null;
                            try {
                                const eRes = await new sql.Request(txn).query`
                                    SELECT TOP 1 EmailId
                                    FROM Master_ConcernedSE
                                    WHERE LTRIM(RTRIM(FullName)) = LTRIM(RTRIM(${seName}))
                                `;
                                seEmail = (eRes.recordset?.[0]?.EmailId || null);
                            } catch (_) { }

                            if (hasEmailColumn) {
                                r.input('seEmail', sql.NVarChar, seEmail);
                                await r.query(`INSERT INTO ConcernedSE (RequestNo, SEName, EmailId) VALUES (@reqNo, @seName, @seEmail)`);
                            } else {
                                await r.query(`INSERT INTO ConcernedSE (RequestNo, SEName) VALUES (@reqNo, @seName)`);
                            }
                        }
                        return;
                    }
                    for (const item of items) {
                        const r = new sql.Request(txn);
                        r.input('reqNo', sql.NVarChar, RequestNo);
                        r.input('val', sql.NVarChar, item);
                        await r.query(`INSERT INTO ${table} (RequestNo, ${col}) VALUES (@reqNo, @val)`);
                    }
                }
            }
        };

        await insertRelated('EnquiryCustomer', 'CustomerName', SelectedCustomers, transaction);
        await insertRelated('EnquiryType', 'TypeName', SelectedEnquiryTypes, transaction);
        await insertRelated('EnquiryFor', 'ItemName', SelectedEnquiryFor, transaction);
        await normalizeEnquiryForLeadMeta(RequestNo, transaction);
        await insertRelated('ConcernedSE', 'SEName', SelectedConcernedSEs, transaction);
        await insertRelated('EnquiryConsultant', 'ConsultantName', SelectedConsultants, transaction);

        if (SelectedReceivedFroms && SelectedReceivedFroms.length > 0) {
            for (const item of SelectedReceivedFroms) {
                const [contact, company] = item.split('|');
                const r = new sql.Request(transaction);
                r.input('reqNo', sql.NVarChar, RequestNo);
                r.input('contact', sql.NVarChar, contact);
                r.input('company', sql.NVarChar, company);
                await r.query(`INSERT INTO ReceivedFrom (RequestNo, ContactName, CompanyName) VALUES (@reqNo, @contact, @company)`);
            }
        }



        // --- Update Master Tables with RequestNo ---
        try {
            // 1. Source Of Enquiry
            if (SourceOfInfo) {
                await new sql.Request(transaction).query`UPDATE Master_SourceOfEnquiry SET RequestNo = ${RequestNo} WHERE SourceName = ${SourceOfInfo}`;
            }

            // 2. Enquiry Type
            if (SelectedEnquiryTypes && SelectedEnquiryTypes.length > 0) {
                for (const type of SelectedEnquiryTypes) {
                    await new sql.Request(transaction).query`UPDATE Master_EnquiryType SET RequestNo = ${RequestNo} WHERE TypeName = ${type}`;
                }
            }

            // 3. Enquiry For
            if (SelectedEnquiryFor && SelectedEnquiryFor.length > 0) {
                for (const item of SelectedEnquiryFor) {
                    const name = typeof item === 'object' ? item.itemName : item;
                    await new sql.Request(transaction).query`UPDATE Master_EnquiryFor SET RequestNo = ${RequestNo} WHERE ItemName = ${name}`;
                }
            }

            // 4. Received From
            if (SelectedReceivedFroms && SelectedReceivedFroms.length > 0) {
                for (const item of SelectedReceivedFroms) {
                    const [contact, company] = item.split('|');
                    await new sql.Request(transaction).query`UPDATE Master_ReceivedFrom SET RequestNo = ${RequestNo} WHERE ContactName = ${contact} AND CompanyName = ${company}`;
                }
            }

            // 5. Concerned SE
            if (SelectedConcernedSEs && SelectedConcernedSEs.length > 0) {
                for (const se of SelectedConcernedSEs) {
                    await new sql.Request(transaction).query`UPDATE Master_ConcernedSE SET RequestNo = ${RequestNo} WHERE FullName = ${se}`;
                }
            }

            // 6. Customer Name
            if (SelectedCustomers && SelectedCustomers.length > 0) {
                console.log('Updating Master_CustomerName for:', SelectedCustomers);
                for (const cust of SelectedCustomers) {
                    const result = await new sql.Request(transaction).query`UPDATE Master_CustomerName SET RequestNo = ${RequestNo} WHERE CompanyName = ${cust}`;
                    console.log(`Updated Master_CustomerName for ${cust}. Rows affected: ${result.rowsAffected}`);
                }
            } else {
                console.log('No SelectedCustomers to update in Master_CustomerName');
            }

            // 7. Client Name
            if (ClientName) {
                console.log('Updating Master_ClientName for:', ClientName);
                await new sql.Request(transaction).query`UPDATE Master_ClientName SET RequestNo = ${RequestNo} WHERE CompanyName = ${ClientName}`;
            }

            // 8. Consultant Name
            if (ConsultantName) {
                console.log('Updating Master_ConsultantName for:', ConsultantName);
                await new sql.Request(transaction).query`UPDATE Master_ConsultantName SET RequestNo = ${RequestNo} WHERE CompanyName = ${ConsultantName}`;
            }

        } catch (updateErr) {
            console.error('Error updating Master tables with RequestNo:', updateErr);
            throw updateErr; // Re-throw to trigger rollback
        }

        await transaction.commit();

        // --- Email Notification Logic ---
        try {
            console.log('Starting Email Logic...');
            console.log('SelectedEnquiryFor:', SelectedEnquiryFor);
            console.log('SelectedConcernedSEs:', SelectedConcernedSEs);

            // 1. Fetch Emails for Enquiry Items (To: CommonMailIds, CC: CCMailIds)
            let itemTo = [];
            let itemCC = [];
            if (SelectedEnquiryFor && SelectedEnquiryFor.length > 0) {
                const itemsStr = SelectedEnquiryFor.map(i => {
                    const name = (typeof i === 'string') ? i : (i.itemName || '');
                    return `'${name.replace(/'/g, "''")}'`;
                }).join(',');
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
                ConsultantName: SelectedConsultants ? SelectedConsultants.join(', ') : ConsultantName,
                DetailsOfEnquiry,
                DueOn,
                DocumentsReceived,
                Remark
            };

            // Send Email (Async - Do not await to speed up UI)
            // COMMENTED OUT: Logic moved to /api/enquiries/notify to handle attachments
            // sendEnquiryEmail(emailData, { to: uniqueTo, cc: uniqueCC })
            //    .then(() => log('Internal Enquiry Email sent successfully'))
            //    .catch(err => log(`Error sending Internal Enquiry Email: ${err.message}`));

            // New Email Logic
            console.log(`[Email Debug] Checking AutoAck: '${AutoAck}' (Type: ${typeof AutoAck})`);
            if (AutoAck === true || AutoAck === 'true') {
                console.log('--- AUTOACK STARTING ---');
                log('Processing AutoAck...');
                // Trigger sending email asynchronously
                (async () => {
                    try {
                        log('AutoAck is true, preparing to send acknowledgement emails...');

                        const emailData = {
                            RequestNo: RequestNo,
                            EnquiryDate: EnquiryDate,
                            CustomerName: SelectedCustomers ? SelectedCustomers.join(', ') : '',
                            ProjectName: ProjectName,
                            ClientName: ClientName,
                            ConsultantName: SelectedConsultants ? SelectedConsultants.join(', ') : ConsultantName,
                            DetailsOfEnquiry: DetailsOfEnquiry
                        };

                        // 1. Fetch CC Email
                        let ccString = '';
                        if (AcknowledgementSE) {
                            const ccRes = await sql.query`SELECT EmailId FROM Master_ConcernedSE WHERE FullName = ${AcknowledgementSE}`;
                            if (ccRes.recordset.length > 0 && ccRes.recordset[0].EmailId) {
                                ccString = ccRes.recordset[0].EmailId;
                                log(`CC found: ${ccString}`);
                            } else {
                                log(`CC NOT found for AcknowledgementSE: ${AcknowledgementSE}`);
                            }
                        }

                        // 2. Fetch To Emails (Selected Received From Contacts)
                        if (SelectedReceivedFroms && SelectedReceivedFroms.length > 0) {
                            log(`Proccessing ${SelectedReceivedFroms.length} contacts for AutoAck`);
                            const processedEmails = new Set();

                            for (const item of SelectedReceivedFroms) {
                                const [contact, company] = item.split('|');
                                log(`Looking up email for Contact: ${contact}, Company: ${company}`);
                                // Fetch email for this specific contact
                                const rfRes = await sql.query`SELECT EmailId FROM Master_ReceivedFrom WHERE ContactName = ${contact} AND CompanyName = ${company}`;

                                if (rfRes.recordset.length > 0 && rfRes.recordset[0].EmailId) {
                                    const recipientEmail = rfRes.recordset[0].EmailId.trim();
                                    log(`Found email: ${recipientEmail}`);

                                    // Avoid sending duplicate emails to the same address for the same request
                                    if (!processedEmails.has(recipientEmail)) {
                                        // 3. Fetch CC Emails from Enquiry Items (Master_EnquiryFor)
                                        let itemCCs = [];
                                        if (SelectedEnquiryFor && SelectedEnquiryFor.length > 0) {
                                            const itemsStr = SelectedEnquiryFor.map(i => `'${i}'`).join(',');
                                            try {
                                                const itemsRes = await sql.query(`SELECT CCMailIds FROM Master_EnquiryFor WHERE ItemName IN (${itemsStr})`);
                                                itemsRes.recordset.forEach(row => {
                                                    if (row.CCMailIds) {
                                                        const emails = row.CCMailIds.split(',').map(e => e.trim().toLowerCase());
                                                        itemCCs.push(...emails);
                                                    }
                                                });
                                            } catch (ccErr) {
                                                log(`Error fetching Item CCs: ${ccErr.message}`);
                                            }
                                        }

                                        // Combine relevant CCs (AcknowledgementSE + Item CCs)
                                        let allCCs = [];
                                        if (ccString) allCCs.push(ccString);
                                        if (itemCCs.length > 0) allCCs.push(...itemCCs);

                                        // Deduplicate CCs
                                        const uniqueCCs = [...new Set(allCCs)].filter(Boolean);
                                        const finalCCString = uniqueCCs.join(',');

                                        log(`Sending acknowledgement to Received From: ${contact} (${recipientEmail}) CC: ${finalCCString}`);
                                        log(`Item CCs found: ${itemCCs.join(', ')}`);

                                        try {
                                            const sent = await sendAcknowledgementEmail(emailData, recipientEmail, finalCCString, ceosign);
                                            if (sent) {
                                                log(`Email sent successfully to ${recipientEmail}`);
                                                processedEmails.add(recipientEmail);
                                            } else {
                                                log(`Failed to send email to ${recipientEmail}`);
                                            }
                                        } catch (e) {
                                            log(`Error sending email to ${recipientEmail}: ${e.stack || e}`);
                                        }
                                    } else {
                                        log(`Email ${recipientEmail} already processed in this batch.`);
                                    }
                                } else {
                                    log(`No email found for Received From contact: ${contact} (${company})`);
                                    // Try fallback query just by ContactName if Company might be mismatched? No, stay strict.
                                }
                            }
                        } else {
                            log('No Received From contacts selected. Skipping acknowledgement email.');
                        }
                    } catch (err) {
                        log(`Async Email Error: ${err.message}\n${err.stack}`);
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
        if (transaction) {
            try { await transaction.rollback(); } catch (rbErr) { console.error('Rollback error:', rbErr); }
        }

        const logFile = path.join(__dirname, 'debug.log');
        fs.appendFileSync(logFile, `${new Date().toISOString()} - ERROR: ${err.message}\n${err.stack}\n`);
        console.error(err);

        if (err.number === 2627) { // PK Violation
            return res.status(400).json({
                message: 'Duplicate Enquiry Number',
                error: `Enquiry number ${req.body.RequestNo} already exists. Please refresh to try again.`
            });
        }
        res.status(500).send(err.message);
    }
});

// Update Enquiry
// Update Enquiry
// Get Single Enquiry
app.get('/api/enquiries/:id', async (req, res) => {
    try {
        const reqNo = req.params.id;
        console.log(`[GET /api/enquiries/${reqNo}] Fetching single enquiry...`);

        // Enquiry visibility (same policy as list/dashboard):
        // - Admin/System: allow
        // - Default: assigned enquiries only (ConcernedSE)
        // - CC users: department enquiries (CC mail) + assigned
        const userEmail = req.query.userEmail || '';
        const userName = req.query.userName || '';
        const userRole = req.query.userRole || '';
        const vis = await resolveEnquiryVisibilityContext({ userEmail, userName, userRole });

        const result = await sql.query`SELECT * FROM EnquiryMaster WHERE RequestNo = ${reqNo}`;
        if (result.recordset.length === 0) {
            return res.status(404).json({ message: 'Enquiry not found' });
        }
        const enq = result.recordset[0];

        // Fetch related data
        const customersResult = await sql.query`SELECT * FROM EnquiryCustomer WHERE RequestNo = ${reqNo}`;
        const contactsResult = await sql.query`SELECT * FROM ReceivedFrom WHERE RequestNo = ${reqNo}`;
        const typesResult = await sql.query`SELECT * FROM EnquiryType WHERE RequestNo = ${reqNo}`;
        const itemsResult = await sql.query`SELECT * FROM EnquiryFor WHERE RequestNo = ${reqNo}`;
        const seResult = await sql.query`SELECT * FROM ConcernedSE WHERE RequestNo = ${reqNo}`;
        const consultantsResult = await sql.query`SELECT * FROM EnquiryConsultant WHERE RequestNo = ${reqNo}`;
        const masterEnqForRes = (!vis.isAdmin && vis.email && vis.accessMode === 'department')
            ? await sql.query`SELECT ItemName, CCMailIds FROM Master_EnquiryFor`
            : { recordset: [] };

        if (!vis.isAdmin && vis.email) {
            const normEmail = normalizeEmail(vis.email);
            const assignedRes = await sql.query`
                SELECT TOP 1 1 AS ok
                FROM ConcernedSE cs
                INNER JOIN Master_ConcernedSE m ON UPPER(LTRIM(RTRIM(ISNULL(m.FullName, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(cs.SEName, N''))))
                WHERE LOWER(REPLACE(REPLACE(LTRIM(RTRIM(ISNULL(m.EmailId, N''))), N'@almcg.com', N'@almoayyedcg.com'), N'@ALMCG.COM', N'@almoayyedcg.com')) = ${normEmail}
                  AND LTRIM(RTRIM(ISNULL(cs.RequestNo, N''))) = LTRIM(RTRIM(${reqNo}))
            `;
            const assigned = (assignedRes.recordset?.length || 0) > 0;

            let deptAllowed = false;
            if (vis.accessMode === 'department') {
                const emailLower = normEmail;
                const masterRows = (masterEnqForRes.recordset || []).map(r => ({
                    itemKey: stripJobPrefix(r.ItemName).toLowerCase(),
                    ccMails: splitMailList(r.CCMailIds).map(m => normalizeEmail(m))
                }));
                const masterByKey = new Map();
                masterRows.forEach(r => {
                    if (!r.itemKey) return;
                    const list = masterByKey.get(r.itemKey) || [];
                    list.push(r);
                    masterByKey.set(r.itemKey, list);
                });
                deptAllowed = (itemsResult.recordset || []).some(ef => {
                    const efKey = stripJobPrefix(ef.ItemName).toLowerCase();
                    const candidates = masterByKey.get(efKey) || [];
                    return candidates.some(c => c.ccMails.includes(emailLower));
                });
            }

            let allow = assigned || deptAllowed;
            if (allow && vis.accessMode === 'assigned' && assigned) {
                const ctx = await resolvePricingAccessContext(normEmail);
                if (ctx.user && !ctx.isCcUser) {
                    const jobRows = (itemsResult.recordset || []).map(i => ({
                        ID: i.ID,
                        ParentID: i.ParentID,
                        ItemName: i.ItemName,
                    }));
                    allow = getPricingAnchorJobs(jobRows, ctx, normEmail).length > 0;
                }
            }

            if (!allow) {
                return res.status(403).json({ message: 'Forbidden' });
            }
        }

        const relatedCustomers = customersResult.recordset.map(c => c.CustomerName);
        const relatedContacts = contactsResult.recordset.map(c => `${c.ContactName}|${c.CompanyName || ''}`);
        const relatedTypes = typesResult.recordset.map(t => t.TypeName);

        const relatedItemsRaw = itemsResult.recordset;
        const relatedItemsStructured = relatedItemsRaw.map(i => ({
            id: i.ID,
            parentId: i.ParentID,
            itemName: i.ItemName,
            leadJobCode: i.LeadJobCode,
            parentName: i.ParentItemName
        }));
        const relatedItemsDisplay = relatedItemsRaw.map(i => i.ItemName);

        const relatedSEs = seResult.recordset.map(s => s.SEName);

        const fullEnquiry = {
            ...enq,
            SelectedEnquiryTypes: relatedTypes,
            SelectedEnquiryFor: relatedItemsStructured,
            SelectedCustomers: relatedCustomers,
            SelectedReceivedFroms: relatedContacts,
            SelectedConcernedSEs: relatedSEs,
            SelectedConsultants: consultantsResult.recordset.map(c => c.ConsultantName),
            EnquiryType: relatedTypes.join(', '),
            EnquiryFor: relatedItemsDisplay.join(', '),
            CustomerName: enq.CustomerName || relatedCustomers.join(', '),
            ClientName: enq.ClientName,
            ConsultantName: enq.ConsultantName,
            ReceivedFrom: relatedContacts.map(c => c.split('|')[0]).join(', '),
            ConcernedSE: relatedSEs.join(', '),
            SourceOfInfo: enq.SourceOfEnquiry,
            DueOn: enq.DueDate
        };

        res.json(fullEnquiry);
    } catch (err) {
        console.error('Error fetching single enquiry:', err);
        res.status(500).send('Server Error');
    }
});

// Update Enquiry
app.put('/api/enquiries/:id', async (req, res) => {
    const id = req.params.id.trim();
    const {
        SourceOfInfo, EnquiryDate, DueOn, SiteVisitDate,
        SelectedEnquiryTypes, SelectedEnquiryFor,
        SelectedCustomers, SelectedReceivedFroms, SelectedConcernedSEs,
        ProjectName, ClientName, ConsultantName, SelectedConsultants, DetailsOfEnquiry,
        DocumentsReceived, hardcopy, drawing, dvd, spec, eqpschedule, Remark,
        AutoAck, ceosign, Status, AcknowledgementSE, AdditionalNotificationEmails, CustomerRefNo
    } = req.body;

    try {
        const request = new sql.Request();
        request.input('RequestNo', sql.NVarChar, id);
        request.input('SourceOfEnquiry', sql.NVarChar, SourceOfInfo);
        request.input('EnquiryDate', sql.VarChar(10), EnquiryDate ? EnquiryDate.split('T')[0] : null);
        request.input('DueDate', sql.VarChar(10), DueOn ? DueOn.split('T')[0] : null);
        request.input('SiteVisitDate', sql.VarChar(10), SiteVisitDate ? SiteVisitDate.split('T')[0] : null);
        request.input('CustomerName', sql.NVarChar, SelectedCustomers ? SelectedCustomers.join(',') : null);
        request.input('ReceivedFrom', sql.NVarChar, SelectedReceivedFroms ? SelectedReceivedFroms.map(i => i.split('|')[0]).join(',') : null);

        request.input('ProjectName', sql.NVarChar, ProjectName);
        request.input('ClientName', sql.NVarChar, ClientName);
        request.input('ConsultantName', sql.NVarChar, SelectedConsultants ? SelectedConsultants.join(',') : (ConsultantName || null));
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
        request.input('AcknowledgementSE', sql.NVarChar, AcknowledgementSE);
        request.input('AdditionalNotificationEmails', sql.NVarChar, AdditionalNotificationEmails);
        request.input('CustomerRefNo', sql.NVarChar, CustomerRefNo || null);
        request.input('OthersSpecify', sql.NVarChar, DocumentsReceived);

        const updateResult = await request.query(`
            UPDATE EnquiryMaster SET
                SourceOfEnquiry=@SourceOfEnquiry, EnquiryDate=@EnquiryDate, DueDate=@DueDate, SiteVisitDate=@SiteVisitDate,
                CustomerName=@CustomerName, ReceivedFrom=@ReceivedFrom, ProjectName=@ProjectName, ClientName=@ClientName, ConsultantName=@ConsultantName,
                EnquiryDetails=@EnquiryDetails, Doc_HardCopies=@Doc_HardCopies, Doc_Drawing=@Doc_Drawing, Doc_CD_DVD=@Doc_CD_DVD,
                Doc_Spec=@Doc_Spec, Doc_EquipmentSchedule=@Doc_EquipmentSchedule, Remarks=@Remarks, CustomerRefNo=@CustomerRefNo, SendAcknowledgementMail=@SendAcknowledgementMail, ED_CEOSignatureRequired=@ED_CEOSignatureRequired, Status=@Status, AcknowledgementSE=@AcknowledgementSE, AdditionalNotificationEmails=@AdditionalNotificationEmails, OthersSpecify=@OthersSpecify
            WHERE RequestNo=@RequestNo
        `);

        if (updateResult.rowsAffected[0] === 0) {
            return res.status(404).json({ message: 'Enquiry not found', error: `Enquiry with Number ${id} does not exist.` });
        }

        // Helper to update related items (Delete + Insert)
        const updateRelated = async (table, col, items) => {
            const delReq = new sql.Request();
            delReq.input('reqNo', sql.NVarChar, id);
            await delReq.query(`DELETE FROM ${table} WHERE RequestNo = @reqNo`);

            if (items && items.length > 0) {
                if (table === 'EnquiryFor') {
                    const normalized = items.map(i => {
                        if (typeof i === 'string') return { tempId: i, itemName: i, parentId: null };
                        return {
                            tempId: i.id || Math.random().toString(36),
                            itemName: i.itemName,
                            leadJobCode: i.leadJobCode,
                            leadJobName: i.leadJobName,
                            parentId: i.parentId,
                            parentName: i.parentName
                        };
                    });

                    const idMap = {};
                    let remaining = [...normalized];
                    let pass = 0;

                    while (remaining.length > 0 && pass < 10) {
                        const nextBatch = [];
                        for (const item of remaining) {
                            const ready = !item.parentId || idMap[item.parentId];
                            if (ready) {
                                const r = new sql.Request();
                                r.input('reqNo', sql.NVarChar, id);

                                let code = item.leadJobCode || null;
                                let name = item.itemName;

                                if (!code) {
                                    const match = name.match(/^(L\d+)\s+-\s+(.*)$/);
                                    if (match) {
                                        code = match[1];
                                        name = match[2];
                                    }
                                }
                                if (!code || !String(code).trim().toUpperCase().match(/^L\d+$/)) {
                                    code = null;
                                } else {
                                    code = String(code).trim().toUpperCase();
                                }

                                const leadName = item.leadJobName || null;
                                r.input('code', sql.NVarChar, code);
                                r.input('lname', sql.NVarChar, leadName);
                                r.input('val', sql.NVarChar, name);
                                r.input('pName', sql.NVarChar, item.parentName || null);
                                r.input('pId', sql.Int, item.parentId ? idMap[item.parentId] : null);

                                const res = await r.query(`INSERT INTO EnquiryFor (RequestNo, LeadJobCode, LeadJobName, ItemName, ParentID) VALUES (@reqNo, @code, @lname, @val, @pId); SELECT SCOPE_IDENTITY() AS id;`);
                                idMap[item.tempId] = res.recordset[0].id;
                            } else {
                                nextBatch.push(item);
                            }
                        }
                        if (nextBatch.length === remaining.length) {
                            for (const item of nextBatch) {
                                const r = new sql.Request();
                                r.input('reqNo', sql.NVarChar, id);

                                let code = item.leadJobCode || null;
                                let name = item.itemName;

                                if (!code) {
                                    const match = name.match(/^(L\d+)\s+-\s+(.*)$/);
                                    if (match) {
                                        code = match[1];
                                        name = match[2];
                                    }
                                }
                                if (!code || !String(code).trim().toUpperCase().match(/^L\d+$/)) {
                                    code = null;
                                } else {
                                    code = String(code).trim().toUpperCase();
                                }

                                const leadName = item.leadJobName || null;
                                r.input('code', sql.NVarChar, code);
                                r.input('lname', sql.NVarChar, leadName);
                                r.input('val', sql.NVarChar, name);
                                r.input('pName', sql.NVarChar, item.parentName || null);
                                r.input('pId', sql.Int, null);
                                const res = await r.query(`INSERT INTO EnquiryFor (RequestNo, LeadJobCode, LeadJobName, ItemName, ParentID) VALUES (@reqNo, @code, @lname, @val, @pId); SELECT SCOPE_IDENTITY() AS id;`);
                                idMap[item.tempId] = res.recordset[0].id;
                            }
                            break;
                        }
                        remaining = nextBatch;
                        pass++;
                    }
                } else {
                    if (table === 'ConcernedSE' && col === 'SEName') {
                        let hasEmailColumn = false;
                        try {
                            const chk = await new sql.Request().query(`
                                SELECT 1 AS ok
                                FROM INFORMATION_SCHEMA.COLUMNS
                                WHERE TABLE_NAME = 'ConcernedSE' AND COLUMN_NAME = 'EmailId'
                            `);
                            hasEmailColumn = (chk.recordset || []).length > 0;
                        } catch (_) { }

                        for (const item of items) {
                            const seName = String(item || '').trim();
                            const req = new sql.Request();
                            req.input('RequestNo', sql.NVarChar, id);
                            req.input('SEName', sql.NVarChar, seName);

                            let seEmail = null;
                            try {
                                const eRes = await new sql.Request().query`
                                    SELECT TOP 1 EmailId
                                    FROM Master_ConcernedSE
                                    WHERE LTRIM(RTRIM(FullName)) = LTRIM(RTRIM(${seName}))
                                `;
                                seEmail = (eRes.recordset?.[0]?.EmailId || null);
                            } catch (_) { }

                            if (hasEmailColumn) {
                                req.input('SEEmail', sql.NVarChar, seEmail);
                                await req.query(`INSERT INTO ConcernedSE (RequestNo, SEName, EmailId) VALUES (@RequestNo, @SEName, @SEEmail)`);
                            } else {
                                await req.query(`INSERT INTO ConcernedSE (RequestNo, SEName) VALUES (@RequestNo, @SEName)`);
                            }
                        }
                        return;
                    }
                    for (const item of items) {
                        const req = new sql.Request();
                        req.input('RequestNo', sql.NVarChar, id);
                        req.input('ItemValue', sql.NVarChar, item);
                        await req.query(`INSERT INTO ${table} (RequestNo, ${col}) VALUES (@RequestNo, @ItemValue)`);
                    }
                }
            }
        };

        await updateRelated('EnquiryCustomer', 'CustomerName', SelectedCustomers);
        await updateRelated('EnquiryType', 'TypeName', SelectedEnquiryTypes);
        await updateRelated('EnquiryFor', 'ItemName', SelectedEnquiryFor);
        await normalizeEnquiryForLeadMeta(id);
        await updateRelated('ConcernedSE', 'SEName', SelectedConcernedSEs);
        await updateRelated('EnquiryConsultant', 'ConsultantName', SelectedConsultants);

        // ReceivedFrom has multiple columns, handle separately if needed, or just ContactName/CompanyName
        // For now assuming simple string or split logic similar to POST
        const delRF = new sql.Request();
        delRF.input('reqNo', sql.NVarChar, id);
        await delRF.query(`DELETE FROM ReceivedFrom WHERE RequestNo = @reqNo`);
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
        // Use plain SQL strings to avoid template literal issues
        const customersQuery = `
            SELECT ID, CompanyName, Address1, Address2, Rating, Type, FaxNo, Phone1, Phone2, EmailId, Website, Status, RequestNo,
                   'Contractor' as Category
            FROM Master_CustomerName 
            ORDER BY ID DESC
        `;
        const clientsQuery = `
            SELECT ID, CompanyName, Address1, Address2, Rating, Type, FaxNo, Phone1, Phone2, EmailId, Website, Status, RequestNo,
                   'Client' as Category
            FROM Master_ClientName 
            ORDER BY ID DESC
        `;
        const consultantsQuery = `
            SELECT ID, CompanyName, Address1, Address2, Rating, Type, FaxNo, Phone1, Phone2, EmailId, Website, Status, RequestNo,
                   'Consultant' as Category
            FROM Master_ConsultantName 
            ORDER BY ID DESC
        `;

        const customers = await new sql.Request().query(customersQuery);
        const clients = await new sql.Request().query(clientsQuery);
        const consultants = await new sql.Request().query(consultantsQuery);

        console.log('[/api/customers] Contractors:', customers.recordset.length);
        console.log('[/api/customers] Clients:', clients.recordset.length);
        console.log('[/api/customers] Consultants:', consultants.recordset.length);
        if (clients.recordset.length > 0) {
            console.log('[/api/customers] Sample client:', clients.recordset[0]);
        }

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
        let result;
        if (Category === 'Client') {
            result = await sql.query`INSERT INTO Master_ClientName (Category, CompanyName, Address1, Address2, Rating, Type, FaxNo, Phone1, Phone2, EmailId, Website, Status, RequestNo)
                            VALUES (${Category}, ${CompanyName}, ${Address1}, ${Address2}, ${Rating}, ${Type}, ${FaxNo}, ${Phone1}, ${Phone2}, ${EmailId}, ${Website}, ${Status}, ${req.body.RequestNo});
                            SELECT SCOPE_IDENTITY() AS ID;`;
        } else if (Category === 'Consultant') {
            result = await sql.query`INSERT INTO Master_ConsultantName (Category, CompanyName, Address1, Address2, Rating, Type, FaxNo, Phone1, Phone2, EmailId, Website, Status, RequestNo)
                            VALUES (${Category}, ${CompanyName}, ${Address1}, ${Address2}, ${Rating}, ${Type}, ${FaxNo}, ${Phone1}, ${Phone2}, ${EmailId}, ${Website}, ${Status}, ${req.body.RequestNo});
                            SELECT SCOPE_IDENTITY() AS ID;`;
        } else {
            // Default to Contractor/Customer
            result = await sql.query`INSERT INTO Master_CustomerName (Category, CompanyName, Address1, Address2, Rating, Type, FaxNo, Phone1, Phone2, EmailId, Website, Status, RequestNo)
                            VALUES (${Category || 'Contractor'}, ${CompanyName}, ${Address1}, ${Address2}, ${Rating}, ${Type}, ${FaxNo}, ${Phone1}, ${Phone2}, ${EmailId}, ${Website}, ${Status}, ${req.body.RequestNo});
                            SELECT SCOPE_IDENTITY() AS ID;`;
        }
        res.status(201).json({ message: 'Customer added', id: result.recordset[0].ID });
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
    console.log('POST /api/contacts - Payload:', req.body);
    const { Category, CompanyName, Prefix, ContactName, Designation, CategoryOfDesignation, Address1, Address2, FaxNo, Phone, Mobile1, Mobile2, EmailId, RequestNo } = req.body;
    try {
        const result = await sql.query`INSERT INTO Master_ReceivedFrom (Category, CompanyName, Prefix, ContactName, Designation, CategoryOfDesignation, Address1, Address2, FaxNo, Phone, Mobile1, Mobile2, EmailId, RequestNo)
                        VALUES (${Category}, ${CompanyName}, ${Prefix}, ${ContactName}, ${Designation}, ${CategoryOfDesignation}, ${Address1}, ${Address2}, ${FaxNo}, ${Phone}, ${Mobile1}, ${Mobile2}, ${EmailId}, ${RequestNo});
                        SELECT SCOPE_IDENTITY() AS ID;`;
        res.status(201).json({ message: 'Contact added', id: result.recordset[0].ID });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

app.put('/api/contacts/:id', async (req, res) => {
    const fs = require('fs');
    fs.appendFileSync('debug_payload.log', `PUT /api/contacts/${req.params.id} Payload: ${JSON.stringify(req.body)}\n`);
    console.log('PUT /api/contacts/:id - Payload:', req.body);
    const { id } = req.params;
    const { Category, CompanyName, Prefix, ContactName, Designation, CategoryOfDesignation, Address1, Address2, FaxNo, Phone, Mobile1, Mobile2, EmailId } = req.body;
    try {
        await sql.query`UPDATE Master_ReceivedFrom SET Category=${Category}, CompanyName=${CompanyName}, Prefix=${Prefix}, ContactName=${ContactName}, Designation=${Designation}, CategoryOfDesignation=${CategoryOfDesignation}, Address1=${Address1}, Address2=${Address2}, FaxNo=${FaxNo}, Phone=${Phone}, Mobile1=${Mobile1}, Mobile2=${Mobile2}, EmailId=${EmailId} WHERE ID=${id}`;
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

// DEBUG ENDPOINT TO VERIFY CODE VERSION
app.get('/api/version', (req, res) => {
    res.json({ version: 'v2-fixed', timestamp: new Date() });
});

app.post('/api/users', async (req, res) => {
    const { FullName, Designation, EmailId, MobileNumber, LoginPassword, Status, Department, Roles, RequestNo, ModifiedBy } = req.body;

    try {
        let hashedPassword = null;
        if (LoginPassword && LoginPassword.trim().length > 0) {
            const salt = await bcrypt.genSalt(10);
            hashedPassword = await bcrypt.hash(LoginPassword, salt);
        }

        // Insert and get ID
        const result = await sql.query`
            INSERT INTO Master_ConcernedSE (FullName, Designation, EmailId, MobileNumber, LoginPassword, Status, Department, Roles, RequestNo)
            VALUES (${FullName}, ${Designation}, ${EmailId}, ${MobileNumber}, ${hashedPassword}, ${Status}, ${Department}, ${Roles}, ${RequestNo});
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
    const { FullName, Designation, EmailId, MobileNumber, Status, Department, Roles, ModifiedBy } = req.body; // Expect ModifiedBy (Admin Name)
    try {
        // Note: Password update logic should be separate or handled carefully. Skipping password update here for simplicity unless provided.
        await sql.query`UPDATE Master_ConcernedSE SET FullName=${FullName}, Designation=${Designation}, EmailId=${EmailId}, MobileNumber=${MobileNumber}, Status=${Status}, Department=${Department}, Roles=${Roles} WHERE ID=${id}`;

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
    const { ItemName, CompanyName, DepartmentName, Status, CommonMailIds, CCMailIds, RequestNo, DivisionCode, DepartmentCode, Phone, Address, FaxNo, CompanyLogo } = req.body;
    try {
        const result = await sql.query`INSERT INTO Master_EnquiryFor (ItemName, CompanyName, DepartmentName, Status, CommonMailIds, CCMailIds, RequestNo, DivisionCode, DepartmentCode, Phone, Address, FaxNo, CompanyLogo)
                        VALUES (${ItemName}, ${CompanyName}, ${DepartmentName}, ${Status}, ${CommonMailIds}, ${CCMailIds}, ${RequestNo}, ${DivisionCode}, ${DepartmentCode}, ${Phone}, ${Address}, ${FaxNo}, ${CompanyLogo});
                        SELECT SCOPE_IDENTITY() AS ID;`;
        res.status(201).json({ message: 'Item added', id: result.recordset[0].ID });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

app.put('/api/enquiry-items/:id', async (req, res) => {
    const { id } = req.params;
    const { ItemName, CompanyName, DepartmentName, Status, CommonMailIds, CCMailIds, DivisionCode, DepartmentCode, Phone, Address, FaxNo, CompanyLogo } = req.body;
    try {
        await sql.query`UPDATE Master_EnquiryFor SET ItemName=${ItemName}, CompanyName=${CompanyName}, DepartmentName=${DepartmentName}, Status=${Status}, CommonMailIds=${CommonMailIds}, CCMailIds=${CCMailIds}, DivisionCode=${DivisionCode}, DepartmentCode=${DepartmentCode}, Phone=${Phone}, Address=${Address}, FaxNo=${FaxNo}, CompanyLogo=${CompanyLogo} WHERE ID=${id}`;
        res.json({ message: 'Item updated' });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});
// --- Attachments API ---

// Upload Attachment - Store in DB
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
    const visibility = req.query.visibility || 'Public';
    const type = req.query.type || 'File';
    const linkUrl = req.query.linkUrl || null;
    const uploadedBy = req.query.userName || 'System';
    const division = req.query.division || null;

    console.log('Upload request:', { requestNo, visibility, type, uploadedBy, division });

    if (!requestNo) {
        return res.status(400).send('Request No is required');
    }

    const files = req.files;

    try {
        const uploadedFiles = [];

        // Handle Hyperlink case
        if (type === 'Link' && linkUrl) {
            const fileName = req.query.fileName || linkUrl;
            await sql.query`INSERT INTO Attachments (RequestNo, FileName, FilePath, UploadedAt, Visibility, AttachmentType, LinkURL, UploadedBy, Division) 
            VALUES(${requestNo}, ${fileName}, NULL, ${new Date()}, ${visibility}, 'Link', ${linkUrl}, ${uploadedBy}, ${division})`;
            uploadedFiles.push({ fileName });
        }

        // Handle Files
        if (files && files.length > 0) {
            for (const file of files) {
                const fileName = file.originalname;
                const filePath = file.path;

                // Check if RequestNo exists in EnquiryMaster to avoid FK violation
                const checkEnq = await sql.query`SELECT RequestNo FROM EnquiryMaster WHERE RequestNo = ${requestNo}`;
                if (checkEnq.recordset.length === 0) {
                    throw new Error(`RequestNo ${requestNo} not found in EnquiryMaster`);
                }

                await sql.query`INSERT INTO Attachments (RequestNo, FileName, FilePath, UploadedAt, Visibility, AttachmentType, LinkURL, UploadedBy, Division) 
                VALUES(${requestNo}, ${fileName}, ${filePath}, ${new Date()}, ${visibility}, 'File', NULL, ${uploadedBy}, ${division})`;

                uploadedFiles.push({ fileName });
            }
        }

        res.status(201).json({ message: 'Success', files: uploadedFiles });
    } catch (err) {
        console.error('Upload error:', err);
        res.status(500).send(err.message || 'Server Error');
    }
});

// --- System Routes ---

// Get Next Request No
app.get('/api/system/next-request-no', async (req, res) => {
    try {
        // Use a robust query to get the maximum numeric RequestNo, ignoring text/legacy values
        // filtering for only digits ensures TRY_CAST works reliably or CAST is safe
        const result = await sql.query`
            SELECT MAX(CAST(RequestNo AS BIGINT)) as MaxID 
            FROM EnquiryMaster 
            WHERE RequestNo NOT LIKE '%[^0-9]%'
        `;

        let nextId = 9;
        const maxVal = result.recordset[0].MaxID;

        console.log(`[NextID] MaxID found in DB: ${maxVal}`);

        if (maxVal != null) {
            nextId = parseInt(maxVal, 10) + 1;
        }

        console.log(`[NextID] Returning: ${nextId}`);
        res.json({ nextId: nextId.toString() });
    } catch (err) {
        console.error('Error generating next ID:', err);
        res.status(500).send('Error generating ID');
    }
});

// Get Attachments List
app.get('/api/attachments', async (req, res) => {
    const requestNo = req.query.requestNo;
    if (!requestNo) {
        return res.status(400).send('Request No is required');
    }

    try {
        const result = await sql.query`SELECT ID, RequestNo, FileName, UploadedAt, Visibility, AttachmentType, LinkURL, UploadedBy, Division FROM Attachments WHERE RequestNo = ${requestNo} `;
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

        const now = new Date();
        await request.query`
            INSERT INTO EnquiryNotes(EnquiryID, UserID, UserName, UserProfileImage, NoteContent, CreatedAt)
            VALUES(@EnquiryID, @UserID, @UserName, @UserProfileImage, @NoteContent, ${now})
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
                        const now = new Date();
                        await sql.query`INSERT INTO Notifications(UserID, Type, Message, LinkID, CreatedBy, CreatedAt) VALUES(${u.ID}, 'Mention', ${userName + ' mentioned you in a note'}, ${enquiryId}, ${userName}, ${now})`;
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

            // Check ParentID in EnquiryFor
            const checkParentID = await sql.query`
                SELECT COLUMN_NAME 
                FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_NAME = 'EnquiryFor' AND COLUMN_NAME = 'ParentID'
            `;
            if (checkParentID.recordset.length === 0) {
                console.log('Adding ParentID column to EnquiryFor...');
                await sql.query`ALTER TABLE EnquiryFor ADD ParentID INT NULL`;
                console.log('ParentID column added.');
            }

            const checkLeadJobName = await sql.query`
                SELECT COLUMN_NAME
                FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_NAME = 'EnquiryFor' AND COLUMN_NAME = 'LeadJobName'
            `;
            if (checkLeadJobName.recordset.length === 0) {
                console.log('Adding LeadJobName column to EnquiryFor...');
                await sql.query`ALTER TABLE EnquiryFor ADD LeadJobName NVARCHAR(200) NULL`;
                console.log('LeadJobName column added.');
            }

            // Ensure DB trigger never writes project name into LeadJobCode.
            await sql.query(`
                IF OBJECT_ID('dbo.trg_EnquiryFor_LeadJobCode', 'TR') IS NOT NULL
                    DROP TRIGGER dbo.trg_EnquiryFor_LeadJobCode;
            `);
            await sql.query(`
                CREATE TRIGGER dbo.trg_EnquiryFor_LeadJobCode
                ON dbo.EnquiryFor
                AFTER INSERT, UPDATE
                AS
                BEGIN
                    SET NOCOUNT ON;

                    ;WITH AffectedReq AS (
                        SELECT DISTINCT CAST(i.RequestNo AS NVARCHAR(50)) AS RequestNo
                        FROM inserted i
                        WHERE i.RequestNo IS NOT NULL
                    ),
                    RootList AS (
                        SELECT
                            ef.RequestNo,
                            ef.ID AS RootID,
                            ef.ItemName AS RootName,
                            CONCAT('L', ROW_NUMBER() OVER (PARTITION BY ef.RequestNo ORDER BY ef.ID)) AS RootCode
                        FROM dbo.EnquiryFor ef
                        INNER JOIN AffectedReq ar
                            ON CAST(ef.RequestNo AS NVARCHAR(50)) = ar.RequestNo
                        WHERE ef.ParentID IS NULL OR ef.ParentID = 0
                    ),
                    Hier AS (
                        SELECT
                            r.RequestNo,
                            r.RootID,
                            r.RootName,
                            r.RootCode,
                            ef.ID,
                            ef.ParentID
                        FROM dbo.EnquiryFor ef
                        INNER JOIN RootList r ON ef.ID = r.RootID
                        UNION ALL
                        SELECT
                            h.RequestNo,
                            h.RootID,
                            h.RootName,
                            h.RootCode,
                            c.ID,
                            c.ParentID
                        FROM dbo.EnquiryFor c
                        INNER JOIN Hier h ON c.ParentID = h.ID
                    )
                    UPDATE ef
                    SET
                        LeadJobCode = h.RootCode,
                        LeadJobName = h.RootName
                    FROM dbo.EnquiryFor ef
                    INNER JOIN Hier h ON ef.ID = h.ID
                    OPTION (MAXRECURSION 32767);
                END;
            `);
            console.log('Ensured trigger trg_EnquiryFor_LeadJobCode uses L# normalization.');

            console.log('Normalizing EnquiryFor LeadJobCode/LeadJobName for all requests...');
            await normalizeAllEnquiryForLeadMeta();
            console.log('Lead metadata normalization completed.');

            // Check LostDate in EnquiryMaster
            const checkLostDate = await sql.query`
                SELECT COLUMN_NAME 
                FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_NAME = 'EnquiryMaster' AND COLUMN_NAME = 'LostDate'
            `;
            if (checkLostDate.recordset.length === 0) {
                console.log('Adding LostDate column to EnquiryMaster...');
                await sql.query`ALTER TABLE EnquiryMaster ADD LostDate DATETIME NULL`;
                console.log('LostDate column added.');
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

// NEW ENDPOINT for Triggering Email manually (usually after file upload)
app.post('/api/enquiries/notify', async (req, res) => {
    try {
        const { requestNo } = req.body;
        console.log('Received notification request for:', requestNo);
        if (!requestNo) return res.status(400).json({ success: false, message: 'RequestNo required' });

        // 1. Fetch Enquiry Data
        const enqResult = await sql.query`SELECT * FROM EnquiryMaster WHERE RequestNo = ${requestNo}`;
        if (enqResult.recordset.length === 0) return res.status(404).json({ success: false, message: 'Enquiry not found' });
        const enquiryData = enqResult.recordset[0];

        // 2. Fetch Attachments
        const attResult = await sql.query`SELECT * FROM Attachments WHERE RequestNo = ${requestNo}`;
        const attachments = attResult.recordset;
        console.log(`Found ${attachments.length} attachments for RequestNo ${requestNo}`);

        // 3. Determine Recipients (Same logic as createNotifications)
        let recipientEmails = new Set();

        // REMOVED Creator from recipient list as per user request

        // Add Concerned SEs
        const seRes = await sql.query`SELECT SEName FROM ConcernedSE WHERE RequestNo = ${requestNo}`;
        console.log(`[Notify Debug] Found ${seRes.recordset.length} Concerned SEs for RequestNo ${requestNo}`);
        for (const row of seRes.recordset) {
            console.log(`[Notify Debug] Processing Concerned SE: ${row.SEName}`);
            const u = await sql.query`SELECT EmailId FROM Master_ConcernedSE WHERE FullName = ${row.SEName}`;
            if (u.recordset.length > 0 && u.recordset[0].EmailId) {
                recipientEmails.add(u.recordset[0].EmailId.toLowerCase());
                console.log(`[Notify Debug] Added email: ${u.recordset[0].EmailId}`);
            } else {
                console.log(`[Notify Debug] No email found for SE: ${row.SEName}`);
            }
        }

        // Add Acknowledgement SE
        if (enquiryData.AcknowledgementSE) {
            console.log(`[Notify Debug] Processing Acknowledgement SE: ${enquiryData.AcknowledgementSE}`);
            const u = await sql.query`SELECT EmailId FROM Master_ConcernedSE WHERE FullName = ${enquiryData.AcknowledgementSE}`;
            if (u.recordset.length > 0 && u.recordset[0].EmailId) {
                recipientEmails.add(u.recordset[0].EmailId.toLowerCase());
                console.log(`[Notify Debug] Added email: ${u.recordset[0].EmailId}`);
            } else {
                console.log(`[Notify Debug] No email found for Ack SE: ${enquiryData.AcknowledgementSE}`);
            }
        }

        // 4. Fetch CCs from EnquiryItems
        let ccEmails = new Set();
        if (enquiryData.SelectedEnquiryFor) {
            let items = [];
            try {
                // Try parsing as JSON first
                items = JSON.parse(enquiryData.SelectedEnquiryFor);
            } catch (e) {
                // If it's just a regular string or comma-separated
                items = typeof enquiryData.SelectedEnquiryFor === 'string'
                    ? enquiryData.SelectedEnquiryFor.split(',').map(s => s.trim())
                    : [];
            }

            if (Array.isArray(items) && items.length > 0) {
                const itemsStr = items.map(i => `'${i}'`).join(',');
                try {
                    const itemsRes = await sql.query(`SELECT CCMailIds FROM Master_EnquiryFor WHERE ItemName IN (${itemsStr})`);
                    itemsRes.recordset.forEach(row => {
                        if (row.CCMailIds) {
                            const emails = row.CCMailIds.split(',').map(e => e.trim().toLowerCase());
                            emails.forEach(e => ccEmails.add(e));
                        }
                    });
                } catch (ccErr) {
                    console.error(`Error fetching Item CCs for notification: ${ccErr.message}`);
                }
            }
        }

        const toList = Array.from(recipientEmails);
        const ccList = Array.from(ccEmails);

        console.log(`Notification To: ${toList.join(', ')}`);
        console.log(`Notification CC: ${ccList.join(', ')}`);

        // Send Email
        await sendEnquiryEmail(enquiryData, { to: toList, cc: ccList }, attachments);

        res.json({ success: true, message: 'Notification sent successfully' });
    } catch (error) {
        console.error('Error in /notify:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

initApp();

console.log('Starting server initialization...');
console.log('PORT:', PORT);
const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
server.on('error', (e) => console.error('Server Error:', e));









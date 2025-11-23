const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const { connectDB, sql } = require('./dbConfig');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

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
        const existingUser = await sql.query`SELECT * FROM Users WHERE Email = ${email}`;
        if (existingUser.recordset.length > 0) {
            return res.status(400).json({ message: 'Email already registered' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insert new user
        // Using FullName for username, MailId for email, LoginPassword for password, Roles for role
        await sql.query`INSERT INTO Users (FullName, Email, LoginPassword, Roles, Status) 
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
        const result = await sql.query`SELECT * FROM Users WHERE Email = ${email}`;
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
        const result = await sql.query`SELECT * FROM Enquiries`;

        // Fetch related data
        const customersResult = await sql.query`SELECT * FROM EnquiryCustomers`;
        const contactsResult = await sql.query`SELECT * FROM EnquiryContacts`;
        const typesResult = await sql.query`SELECT * FROM EnquiryTypes`;
        const itemsResult = await sql.query`SELECT * FROM EnquirySelectedItems`;
        const seResult = await sql.query`SELECT * FROM EnquiryConcernedSEs`;

        const enquiries = result.recordset.map(enq => {
            const reqNo = enq.RequestNo;

            const relatedCustomers = customersResult.recordset.filter(c => c.EnquiryID === reqNo).map(c => c.CustomerName);
            const relatedContacts = contactsResult.recordset.filter(c => c.EnquiryID === reqNo).map(c => `${c.ContactName}|${c.CompanyName || ''}`);
            const relatedTypes = typesResult.recordset.filter(t => t.EnquiryID === reqNo).map(t => t.TypeName);
            const relatedItems = itemsResult.recordset.filter(i => i.EnquiryID === reqNo).map(i => i.ItemName);
            const relatedSEs = seResult.recordset.filter(s => s.EnquiryID === reqNo).map(s => s.SEName);

            return {
                ...enq,
                SelectedEnquiryTypes: relatedTypes,
                SelectedEnquiryFor: relatedItems,
                SelectedCustomers: relatedCustomers,
                SelectedReceivedFroms: relatedContacts,
                SelectedConcernedSEs: relatedSEs,
                // Legacy fields for backward compatibility if frontend needs them (though we should use Selected... fields)
                EnquiryType: relatedTypes.join(','),
                EnquiryFor: relatedItems.join(','),
                CustomerName: relatedCustomers.join(','),
                ReceivedFrom: relatedContacts.join(','),
                ConcernedSE: relatedSEs.join(',')
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
    const {
        RequestNo, SourceOfInfo, EnquiryDate, DueOn, SiteVisitDate,
        SelectedEnquiryTypes, SelectedEnquiryFor,
        SelectedCustomers, SelectedReceivedFroms, SelectedConcernedSEs,
        ProjectName, ClientName, ConsultantName, DetailsOfEnquiry,
        DocumentsReceived, hardcopy, drawing, dvd, spec, eqpschedule, Remark,
        AutoAck, ceosign, Status
    } = req.body;

    try {
        const request = new sql.Request();
        request.input('RequestNo', sql.NVarChar, RequestNo);
        request.input('SourceOfInfo', sql.NVarChar, SourceOfInfo);
        request.input('EnquiryDate', sql.DateTime, EnquiryDate);
        request.input('DueOn', sql.DateTime, DueOn);
        request.input('SiteVisitDate', sql.DateTime, SiteVisitDate || null);

        request.input('ProjectName', sql.NVarChar, ProjectName);
        request.input('ClientName', sql.NVarChar, ClientName);
        request.input('ConsultantName', sql.NVarChar, ConsultantName);
        request.input('DetailsOfEnquiry', sql.NVarChar, DetailsOfEnquiry);
        request.input('DocumentsReceived', sql.NVarChar, DocumentsReceived);
        request.input('HardCopy', sql.Bit, hardcopy);
        request.input('Drawing', sql.Bit, drawing);
        request.input('DVD', sql.Bit, dvd);
        request.input('Spec', sql.Bit, spec);
        request.input('EqpSchedule', sql.Bit, eqpschedule);
        request.input('Remark', sql.NVarChar, Remark);
        request.input('AutoAck', sql.Bit, AutoAck);
        request.input('CeoSign', sql.Bit, ceosign);
        request.input('Status', sql.NVarChar, Status);

        await request.query(`
            INSERT INTO Enquiries (
                RequestNo, SourceOfInfo, EnquiryDate, DueOn, SiteVisitDate,
                ProjectName, ClientName, ConsultantName,
                DetailsOfEnquiry, DocumentsReceived, HardCopy, Drawing, DVD,
                Spec, EqpSchedule, Remark, AutoAck, CeoSign, Status
            ) VALUES (
                @RequestNo, @SourceOfInfo, @EnquiryDate, @DueOn, @SiteVisitDate,
                @ProjectName, @ClientName, @ConsultantName,
                @DetailsOfEnquiry, @DocumentsReceived, @HardCopy, @Drawing, @DVD,
                @Spec, @EqpSchedule, @Remark, @AutoAck, @CeoSign, @Status
            )
        `);

        // Helper to insert related items
        const insertRelated = async (table, col, items) => {
            if (items && items.length > 0) {
                for (const item of items) {
                    await sql.query(`INSERT INTO ${table} (EnquiryID, ${col}) VALUES ('${RequestNo}', '${item}')`);
                }
            }
        };

        await insertRelated('EnquiryCustomers', 'CustomerName', SelectedCustomers);
        await insertRelated('EnquiryTypes', 'TypeName', SelectedEnquiryTypes);
        await insertRelated('EnquirySelectedItems', 'ItemName', SelectedEnquiryFor);
        await insertRelated('EnquiryConcernedSEs', 'SEName', SelectedConcernedSEs);

        if (SelectedReceivedFroms && SelectedReceivedFroms.length > 0) {
            for (const item of SelectedReceivedFroms) {
                const [contact, company] = item.split('|');
                await sql.query`INSERT INTO EnquiryContacts (EnquiryID, ContactName, CompanyName) VALUES (${RequestNo}, ${contact}, ${company})`;
            }
        }

        res.status(201).json({ message: 'Enquiry created' });
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }
});

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
        request.input('SourceOfInfo', sql.NVarChar, SourceOfInfo);
        request.input('EnquiryDate', sql.DateTime, EnquiryDate);
        request.input('DueOn', sql.DateTime, DueOn);
        request.input('SiteVisitDate', sql.DateTime, SiteVisitDate || null);

        request.input('ProjectName', sql.NVarChar, ProjectName);
        request.input('ClientName', sql.NVarChar, ClientName);
        request.input('ConsultantName', sql.NVarChar, ConsultantName);
        request.input('DetailsOfEnquiry', sql.NVarChar, DetailsOfEnquiry);
        request.input('DocumentsReceived', sql.NVarChar, DocumentsReceived);
        request.input('HardCopy', sql.Bit, hardcopy);
        request.input('Drawing', sql.Bit, drawing);
        request.input('DVD', sql.Bit, dvd);
        request.input('Spec', sql.Bit, spec);
        request.input('EqpSchedule', sql.Bit, eqpschedule);
        request.input('Remark', sql.NVarChar, Remark);
        request.input('AutoAck', sql.Bit, AutoAck);
        request.input('CeoSign', sql.Bit, ceosign);
        request.input('Status', sql.NVarChar, Status);

        await request.query(`
            UPDATE Enquiries SET
                SourceOfInfo=@SourceOfInfo, EnquiryDate=@EnquiryDate, DueOn=@DueOn, SiteVisitDate=@SiteVisitDate,
                ProjectName=@ProjectName, ClientName=@ClientName, ConsultantName=@ConsultantName,
                DetailsOfEnquiry=@DetailsOfEnquiry, DocumentsReceived=@DocumentsReceived, HardCopy=@HardCopy, Drawing=@Drawing, DVD=@DVD,
                Spec=@Spec, EqpSchedule=@EqpSchedule, Remark=@Remark, AutoAck=@AutoAck, CeoSign=@CeoSign, Status=@Status
            WHERE RequestNo=@RequestNo
        `);

        // Helper to update related items (Delete + Insert)
        const updateRelated = async (table, col, items) => {
            await sql.query(`DELETE FROM ${table} WHERE EnquiryID = '${id}'`);
            if (items && items.length > 0) {
                for (const item of items) {
                    await sql.query(`INSERT INTO ${table} (EnquiryID, ${col}) VALUES ('${id}', '${item}')`);
                }
            }
        };

        await updateRelated('EnquiryCustomers', 'CustomerName', SelectedCustomers);
        await updateRelated('EnquiryTypes', 'TypeName', SelectedEnquiryTypes);
        await updateRelated('EnquirySelectedItems', 'ItemName', SelectedEnquiryFor);
        await updateRelated('EnquiryConcernedSEs', 'SEName', SelectedConcernedSEs);

        // Update EnquiryContacts
        await sql.query`DELETE FROM EnquiryContacts WHERE EnquiryID = ${id}`;
        if (SelectedReceivedFroms && SelectedReceivedFroms.length > 0) {
            for (const item of SelectedReceivedFroms) {
                const [contact, company] = item.split('|');
                await sql.query`INSERT INTO EnquiryContacts (EnquiryID, ContactName, CompanyName) VALUES (${id}, ${contact}, ${company})`;
            }
        }

        res.json({ message: 'Enquiry updated' });
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }
});

// Get Masters (Simplified for demo: fetching Customers)
app.get('/api/customers', async (req, res) => {
    try {
        const result = await sql.query`SELECT * FROM Customers`;
        res.json(result.recordset);
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

app.post('/api/customers', async (req, res) => {
    const { CompanyName, Address1, Phone1, Category } = req.body;
    try {
        await sql.query`INSERT INTO Customers (CompanyName, Address1, Phone1, Category) VALUES (${CompanyName}, ${Address1}, ${Phone1}, ${Category})`;
        res.status(201).json({ message: 'Customer added' });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

app.put('/api/customers/:id', async (req, res) => {
    const { id } = req.params;
    const { CompanyName, Address1, Address2, Rating, Type, FaxNo, Phone1, Phone2, MailId, Website, Status, Category } = req.body;
    try {
        await sql.query`UPDATE Customers 
                        SET CompanyName=${CompanyName}, Address1=${Address1}, Address2=${Address2}, Rating=${Rating}, 
                            CustomerType=${Type}, FaxNo=${FaxNo}, Phone1=${Phone1}, Phone2=${Phone2}, Email=${MailId}, 
                            Website=${Website}, Status=${Status}, Category=${Category} 
                        WHERE CustomerID=${id}`;
        res.json({ message: 'Customer updated' });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// --- Contacts API ---
app.get('/api/contacts', async (req, res) => {
    try {
        const result = await sql.query`SELECT * FROM Contacts`;
        res.json(result.recordset);
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

app.post('/api/contacts', async (req, res) => {
    const { ContactName, CompanyName, Designation, CategoryOfDesignation, Address1, Address2, FaxNo, Phone, Mobile1, Mobile2, EmailId, Category } = req.body;
    try {
        await sql.query`INSERT INTO Contacts (ContactName, CompanyName, Designation, CategoryOfDesignation, Address1, Address2, FaxNo, Phone, Mobile1, Mobile2, EmailId, Category) 
                        VALUES (${ContactName}, ${CompanyName}, ${Designation}, ${CategoryOfDesignation}, ${Address1}, ${Address2}, ${FaxNo}, ${Phone}, ${Mobile1}, ${Mobile2}, ${EmailId}, ${Category})`;
        res.status(201).json({ message: 'Contact added' });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

app.put('/api/contacts/:id', async (req, res) => {
    const { id } = req.params;
    const { ContactName, CompanyName, Designation, CategoryOfDesignation, Address1, Address2, FaxNo, Phone, Mobile1, Mobile2, EmailId, Category } = req.body;
    try {
        await sql.query`UPDATE Contacts 
                        SET ContactName=${ContactName}, CompanyName=${CompanyName}, Designation=${Designation}, 
                            CategoryOfDesignation=${CategoryOfDesignation}, Address1=${Address1}, Address2=${Address2}, 
                            FaxNo=${FaxNo}, Phone=${Phone}, Mobile1=${Mobile1}, Mobile2=${Mobile2}, EmailId=${EmailId}, Category=${Category}
                        WHERE ContactID=${id}`;
        res.json({ message: 'Contact updated' });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// --- Users API ---
app.get('/api/users', async (req, res) => {
    try {
        const result = await sql.query`SELECT * FROM Users`;
        res.json(result.recordset);
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

app.post('/api/users', async (req, res) => {
    const { FullName, Designation, Email, LoginPassword, Status, Department, Roles } = req.body;
    try {
        const rolesStr = Array.isArray(Roles) ? Roles.join(',') : Roles;
        await sql.query`INSERT INTO Users (FullName, Designation, Email, LoginPassword, Status, Department, Roles) 
                        VALUES (${FullName}, ${Designation}, ${Email}, ${LoginPassword}, ${Status}, ${Department}, ${rolesStr})`;
        res.status(201).json({ message: 'User added' });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

app.put('/api/users/:id', async (req, res) => {
    const { id } = req.params;
    const { FullName, Designation, Email, LoginPassword, Status, Department, Roles } = req.body;
    try {
        const rolesStr = Array.isArray(Roles) ? Roles.join(',') : Roles;
        await sql.query`UPDATE Users 
                        SET FullName=${FullName}, Designation=${Designation}, Email=${Email}, LoginPassword=${LoginPassword}, 
                            Status=${Status}, Department=${Department}, Roles=${rolesStr}
                        WHERE UserID=${id}`;
        res.json({ message: 'User updated' });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// --- Enquiry Items API ---
app.get('/api/enquiry-items', async (req, res) => {
    try {
        const result = await sql.query`SELECT * FROM MasterEnquiryItems`;
        res.json(result.recordset);
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

app.post('/api/enquiry-items', async (req, res) => {
    const { ItemName, CompanyName, DepartmentName, Status, CommonMailIds, CCMailIds } = req.body;
    try {
        const commonMails = Array.isArray(CommonMailIds) ? CommonMailIds.join(',') : CommonMailIds;
        const ccMails = Array.isArray(CCMailIds) ? CCMailIds.join(',') : CCMailIds;

        await sql.query`INSERT INTO MasterEnquiryItems (ItemName, CompanyName, DepartmentName, Status, CommonMailIds, CCMailIds) 
                        VALUES (${ItemName}, ${CompanyName}, ${DepartmentName}, ${Status}, ${commonMails}, ${ccMails})`;
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
        const commonMails = Array.isArray(CommonMailIds) ? CommonMailIds.join(',') : CommonMailIds;
        const ccMails = Array.isArray(CCMailIds) ? CCMailIds.join(',') : CCMailIds;

        await sql.query`UPDATE MasterEnquiryItems 
                        SET ItemName=${ItemName}, CompanyName=${CompanyName}, DepartmentName=${DepartmentName}, 
                            Status=${Status}, CommonMailIds=${commonMails}, CCMailIds=${ccMails}
                        WHERE ItemID=${id}`;
        res.json({ message: 'Item updated' });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

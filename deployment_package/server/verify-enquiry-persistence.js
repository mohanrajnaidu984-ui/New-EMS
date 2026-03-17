const axios = require('axios');
const { sql, connectDB } = require('./dbConfig');

const verifyEnquiryPersistence = async () => {
    try {
        const reqNo = 'TEST-ENQ-' + Date.now();
        const testEnquiry = {
            RequestNo: reqNo,
            SourceOfInfo: 'Email',
            EnquiryDate: new Date(),
            DueOn: new Date(),
            SelectedEnquiryTypes: ['New Tender', 'Service'],
            SelectedEnquiryFor: ['Electrical', 'Mechanical'],
            SelectedCustomers: ['Customer A', 'Customer B'],
            SelectedReceivedFroms: ['Contact A|Customer A', 'Contact B|Customer B'],
            SelectedConcernedSEs: ['SE1', 'SE2'],
            ProjectName: 'Test Project',
            ClientName: 'Test Client',
            ConsultantName: 'Test Consultant',
            Status: 'Enquiry'
        };

        console.log('Creating Enquiry:', reqNo);
        await axios.post('http://localhost:5000/api/enquiries', testEnquiry);

        await connectDB();

        console.log('--- Verification Results ---');

        const customers = await sql.query`SELECT CustomerName FROM EnquiryCustomers WHERE EnquiryID = ${reqNo}`;
        console.log('Customers:', customers.recordset.map(c => c.CustomerName).sort().join(',') === 'Customer A,Customer B' ? 'OK' : 'FAIL');

        const contacts = await sql.query`SELECT ContactName FROM EnquiryContacts WHERE EnquiryID = ${reqNo}`;
        console.log('Contacts:', contacts.recordset.map(c => c.ContactName).sort().join(',') === 'Contact A,Contact B' ? 'OK' : 'FAIL');

        const types = await sql.query`SELECT TypeName FROM EnquiryTypes WHERE EnquiryID = ${reqNo}`;
        console.log('Types:', types.recordset.map(t => t.TypeName).sort().join(',') === 'New Tender,Service' ? 'OK' : 'FAIL');

        const items = await sql.query`SELECT ItemName FROM EnquirySelectedItems WHERE EnquiryID = ${reqNo}`;
        console.log('Items:', items.recordset.map(i => i.ItemName).sort().join(',') === 'Electrical,Mechanical' ? 'OK' : 'FAIL');

        const ses = await sql.query`SELECT SEName FROM EnquiryConcernedSEs WHERE EnquiryID = ${reqNo}`;
        console.log('SEs:', ses.recordset.map(s => s.SEName).sort().join(',') === 'SE1,SE2' ? 'OK' : 'FAIL');

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

verifyEnquiryPersistence();

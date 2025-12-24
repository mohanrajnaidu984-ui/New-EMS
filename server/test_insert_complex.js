const fetch = require('node-fetch');

const API_URL = 'http://localhost:5000/api/enquiries';

const run = async () => {
    try {
        const payload = {
            RequestNo: `COMPLEX-${Date.now()}`,
            SourceOfInfo: 'Direct',
            EnquiryDate: new Date().toISOString(),
            DueOn: new Date().toISOString(),
            // Mimic EnquiryForm arrays
            SelectedEnquiryTypes: ['Supply Only'],
            SelectedEnquiryFor: ['Chiller'],
            SelectedCustomers: ['Test Customer'],
            // Correct format confirmed in Frontend: ContactName|CompanyName
            SelectedReceivedFroms: ['John Doe|Test Customer'],
            SelectedConcernedSEs: ['Vignesh'], // existing user name?
            ProjectName: 'Complex Project',
            ClientName: 'Complex Client',
            ConsultantName: 'Complex Consultant',
            DetailsOfEnquiry: 'Testing complex insert',
            Status: 'Open',
            CreatedBy: 'System', // Test if 'System' causing notification crash
            AutoAck: true, // Trigger email logic
            Remark: 'Auto test',
            DocumentsReceived: 'None',
            // Mimic EnquiryStatus presence (even though backend should ignore)
            EnquiryStatus: 'Active'
        };

        console.log('Sending COMPLEX POST with payload:', JSON.stringify(payload, null, 2));

        const res = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const text = await res.text();
            console.error('Error Response:', res.status, text);
        } else {
            const json = await res.json();
            console.log('Success:', json);
        }

    } catch (e) {
        console.error('Fetch Error:', e);
    }
};

run();

const axios = require('axios');

const verifyGetEnquiry = async () => {
    try {
        console.log('Fetching enquiries...');
        const response = await axios.get('http://localhost:5000/api/enquiries');
        const enquiries = response.data;

        if (enquiries.length === 0) {
            console.log('No enquiries found.');
            return;
        }

        // Find the test enquiry created earlier (starts with TEST-ENQ)
        const testEnquiry = enquiries.find(e => e.RequestNo.startsWith('TEST-ENQ'));

        if (!testEnquiry) {
            console.log('Test enquiry not found in list.');
            return;
        }

        console.log('--- Verification Results ---');
        console.log('RequestNo:', testEnquiry.RequestNo);
        console.log('SelectedCustomers:', Array.isArray(testEnquiry.SelectedCustomers) && testEnquiry.SelectedCustomers.length > 0 ? 'OK' : 'FAIL', testEnquiry.SelectedCustomers);
        console.log('SelectedReceivedFroms:', Array.isArray(testEnquiry.SelectedReceivedFroms) && testEnquiry.SelectedReceivedFroms.length > 0 ? 'OK' : 'FAIL', testEnquiry.SelectedReceivedFroms);
        console.log('SelectedEnquiryTypes:', Array.isArray(testEnquiry.SelectedEnquiryTypes) && testEnquiry.SelectedEnquiryTypes.length > 0 ? 'OK' : 'FAIL', testEnquiry.SelectedEnquiryTypes);
        console.log('SelectedEnquiryFor:', Array.isArray(testEnquiry.SelectedEnquiryFor) && testEnquiry.SelectedEnquiryFor.length > 0 ? 'OK' : 'FAIL', testEnquiry.SelectedEnquiryFor);
        console.log('SelectedConcernedSEs:', Array.isArray(testEnquiry.SelectedConcernedSEs) && testEnquiry.SelectedConcernedSEs.length > 0 ? 'OK' : 'FAIL', testEnquiry.SelectedConcernedSEs);

    } catch (err) {
        console.error('Error fetching enquiries:', err.message);
    }
};

verifyGetEnquiry();

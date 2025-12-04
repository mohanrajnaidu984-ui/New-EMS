const axios = require('axios');

const verifyStructure = async () => {
    try {
        const res = await axios.get('http://localhost:5000/api/enquiries');
        const enquiries = res.data;

        if (enquiries.length === 0) {
            console.log('No enquiries found.');
            return;
        }

        const enq = enquiries[0];
        console.log('Sample Enquiry Keys:', Object.keys(enq));
        console.log('EnquiryDate:', enq.EnquiryDate, typeof enq.EnquiryDate);
        console.log('DueOn:', enq.DueOn, typeof enq.DueOn);
        console.log('SelectedCustomers:', enq.SelectedCustomers, Array.isArray(enq.SelectedCustomers));
        console.log('SelectedReceivedFroms:', enq.SelectedReceivedFroms, Array.isArray(enq.SelectedReceivedFroms));

        // Check for fields used in EnquiryForm
        const requiredFields = ['SourceOfInfo', 'EnquiryDate', 'DueOn', 'Status'];
        const missing = requiredFields.filter(f => enq[f] === undefined);
        if (missing.length > 0) {
            console.error('Missing fields:', missing);
        } else {
            console.log('All required fields present.');
        }

    } catch (err) {
        console.error(err.message);
    }
};

verifyStructure();

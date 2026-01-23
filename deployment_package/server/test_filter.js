const fetch = require('node-fetch');

const API_URL = 'http://localhost:5000/api/dashboard/enquiries';

const run = async () => {
    try {
        const today = new Date().toISOString().split('T')[0];
        console.log('Today:', today);

        // Test 1: This Week + Enquiry Date
        // Calculating week range manually to emulate frontend
        // Assuming today is 2025-12-22 (Monday)
        // If I run this script now, it uses ACTUAL system time.
        // User metadata says current time is 2025-12-22.
        // So I'll hardcode the range to match "This Week" for Dec 22.
        const fromDate = '2025-12-22';
        const toDate = '2025-12-28';

        const params = new URLSearchParams({
            division: 'All',
            salesEngineer: 'All',
            fromDate: fromDate,
            toDate: toDate,
            dateType: 'Enquiry Date'
        });

        console.log('Fetching with params:', params.toString());
        const res = await fetch(`${API_URL}?${params}`);
        const data = await res.json();

        console.log(`Count: ${data.length}`);
        if (data.length > 0) {
            console.log('First 5 rows:');
            data.slice(0, 5).forEach(d => {
                console.log(`Ref: ${d.RequestNo}, EnqDate: ${d.EnquiryDate}, Due: ${d.DueDate}, Visit: ${d.SiteVisitDate}`);
            });
        }

    } catch (e) {
        console.error(e);
    }
};

run();

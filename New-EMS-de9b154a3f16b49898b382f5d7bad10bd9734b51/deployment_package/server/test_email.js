const { sendAcknowledgementEmail } = require('./emailService');

async function testEmail() {
    console.log('Testing acknowledgement email...');

    const testEnquiryData = {
        RequestNo: 'TEST-001',
        EnquiryDate: '2025-12-08',
        ReceivedFrom: 'Test Contact',
        EnquiryType: 'Test Type',
        ProjectName: 'Test Project',
        ClientName: 'Test Client',
        ConsultantName: 'Test Consultant',
        DetailsOfEnquiry: 'This is a test enquiry for debugging email notifications.',
        DueOn: '2025-12-15',
        DocumentsReceived: 'Test Documents',
        Remark: 'Test Remark'
    };

    const customerEmail = 'mohanraj.naidu984@gmail.com'; // Replace with actual test email
    const ccEmail = 'bmselveng1@almoayyedcg.com'; // CC email
    const ceoSign = false;

    try {
        await sendAcknowledgementEmail(testEnquiryData, customerEmail, ccEmail, ceoSign);
        console.log('✅ Test email sent successfully!');
        console.log(`To: ${customerEmail}`);
        console.log(`CC: ${ccEmail}`);
    } catch (error) {
        console.error('❌ Error sending test email:', error.message);
        console.error('Full error:', error);
    }

    process.exit(0);
}

testEmail();

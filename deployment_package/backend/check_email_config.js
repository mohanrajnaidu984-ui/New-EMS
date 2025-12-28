require('dotenv').config();

console.log('=== Email Configuration Check ===');
console.log('SMTP_HOST:', process.env.SMTP_HOST || 'NOT SET');
console.log('SMTP_PORT:', process.env.SMTP_PORT || 'NOT SET');
console.log('SMTP_USER:', process.env.SMTP_USER ? '***' + process.env.SMTP_USER.slice(-10) : 'NOT SET');
console.log('SMTP_PASS:', process.env.SMTP_PASS ? '*** (set, length: ' + process.env.SMTP_PASS.length + ')' : 'NOT SET');
console.log('');
console.log('Secure mode:', process.env.SMTP_PORT == 465 ? 'true (port 465)' : 'false');
console.log('');

if (!process.env.SMTP_HOST || !process.env.SMTP_PORT || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log('❌ ERROR: Some SMTP settings are missing!');
} else {
    console.log('✅ All SMTP settings are configured');
}

process.exit(0);

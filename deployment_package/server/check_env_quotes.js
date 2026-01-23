require('dotenv').config();

const pass = process.env.SMTP_PASS;
console.log('--- Password Check ---');
console.log(`Raw value from .env: [${pass}]`);
console.log(`Length: ${pass.length}`);
if (pass.startsWith('"') && pass.endsWith('"')) {
    console.log('⚠️  WARNING: Password starts and ends with quotes!');
    console.log('The quotes are being read as PART of the password.');
    console.log(`Actual password used: ${pass}`);
    console.log(`Did you mean: ${pass.slice(1, -1)}`);
} else {
    console.log('✅ Password does not appear to have wrapped quotes.');
}
console.log('----------------------');

const fs = require('fs');
const path = require('path');

const filename = 'Almoayyed Contracting.png'; // derived from debug output
const filePath = path.join(__dirname, 'uploads', 'logos', filename);

console.log('Checking file:', filePath);
if (fs.existsSync(filePath)) {
    console.log('File EXISTS.');
} else {
    console.log('File DOES NOT EXIST.');
    // Check directory contents
    console.log('Dir contents:', fs.readdirSync(path.join(__dirname, 'uploads', 'logos')));
}

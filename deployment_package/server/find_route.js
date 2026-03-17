const fs = require('fs');

const content = fs.readFileSync('index.js', 'utf8');
const lines = content.split('\n');
lines.forEach((line, index) => {
    if (line.includes('/api/enquiry-items')) {
        console.log(`Found at line ${index + 1}: ${line.trim()}`);
    }
});

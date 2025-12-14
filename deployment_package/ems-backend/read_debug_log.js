const fs = require('fs');
const path = require('path');

const logFile = path.join(__dirname, 'debug.log');

try {
    const data = fs.readFileSync(logFile, 'utf8');
    const lines = data.trim().split('\n');
    const lastLines = lines.slice(-50);
    console.log(lastLines.join('\n'));
} catch (err) {
    console.error('Error reading log:', err);
}

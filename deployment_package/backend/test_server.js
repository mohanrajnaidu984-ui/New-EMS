const express = require('express');
const app = express();
app.get('/', (req, res) => res.send('Hello'));
const PORT = 5000;
app.listen(PORT, () => console.log(`Test Server running on port ${PORT}`));
setInterval(() => console.log('Heartbeat'), 5000); // Keep alive explicitly

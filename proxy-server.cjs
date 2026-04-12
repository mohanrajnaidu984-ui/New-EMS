const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');

const app = express();
const PORT = 5173;

const proxyMiddleware = createProxyMiddleware({ target: 'http://127.0.0.1:5001', changeOrigin: true });
app.use((req, res, next) => {
  if (req.url.startsWith('/api') || req.url.startsWith('/auth') || req.url.startsWith('/uploads')) {
    return proxyMiddleware(req, res, next);
  }
  next();
});

// Serve static files from the build directory
app.use(express.static(path.join(__dirname, 'dist')));

// Fallback to index.html for React Router
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(` FRONTEND SERVED ON http://localhost:${PORT}`);
  console.log(` Proxying API to http://127.0.0.1:5001`);
  console.log(`========================================\n`);
});

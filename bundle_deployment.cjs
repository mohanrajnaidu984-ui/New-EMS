const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROJECT_ROOT = __dirname;
const DEPLOY_DIR = path.join(PROJECT_ROOT, 'deployment_package'); // matching user's folder name preference
const FRONTEND_DIR = path.join(DEPLOY_DIR, 'ems-frontend');
const BACKEND_DIR = path.join(DEPLOY_DIR, 'ems-backend');

console.log('Starting Deployment Bundle Process...');

// 1. Clean previous deployment package
if (fs.existsSync(DEPLOY_DIR)) {
    console.log('Cleaning exisiting deployment_package...');
    fs.rmSync(DEPLOY_DIR, { recursive: true, force: true });
}
fs.mkdirSync(DEPLOY_DIR);
fs.mkdirSync(FRONTEND_DIR);
fs.mkdirSync(BACKEND_DIR);

// 2. Build Frontend
console.log('Building Frontend...');
try {
    execSync('npm run build', { cwd: PROJECT_ROOT, stdio: 'inherit' });
} catch (err) {
    console.error('Frontend build failed:', err);
    process.exit(1);
}

// 3. Copy Frontend Files
console.log('Copying Frontend...');
const distDir = path.join(PROJECT_ROOT, 'dist');
if (fs.existsSync(distDir)) {
    fs.cpSync(distDir, FRONTEND_DIR, { recursive: true });
} else {
    console.error('Dist directory not found!');
    process.exit(1);
}

// 4. Copy Backend Files
console.log('Copying Backend...');
const serverDir = path.join(PROJECT_ROOT, 'server');
fs.cpSync(serverDir, BACKEND_DIR, {
    recursive: true,
    filter: (src) => !src.includes('node_modules') && !src.includes('.env') // Exclude node_modules and .env for safety
});

// 5. Create Instructions
const readMeContent = `
========================================
EMS DEPLOYMENT PACKAGE
========================================

1. Database:
   - Ensure MSSQL is running.
   - Run the SQL scripts provided in the root folder if setting up a fresh DB.

2. Backend (ems-backend):
   - Copy the 'ems-backend' folder to your server (e.g., C:\\ems-backend).
   - Create a .env file in the folder with your secrets (DB credentials, SMTP, etc.).
   - Open PowerShell/CMD in that folder.
   - Run: npm install --production
   - Run: npm install -g pm2
   - Run: pm2 start index.js --name "ems-api"
   - Run: pm2 save

3. Frontend (ems-frontend):
   - Ensure IIS is installed with URL Rewrite module.
   - Copy the contents of 'ems-frontend' to C:\\inetpub\\wwwroot\\ems-frontend (or your site path).
   - In IIS Manager, point your Website to this folder.
   - Go to URL Rewrite module in IIS to verify rules (ReverseProxyAPI, ReverseProxyUploads, React Routes) are present.
   - Ensure the backend is running on port 5000.

4. Troubleshooting:
   - If API fails, check http://localhost:5000/api in browser on server.
   - Check PM2 logs: pm2 logs ems-api
`;

fs.writeFileSync(path.join(DEPLOY_DIR, 'READ_THIS_FIRST.txt'), readMeContent);

console.log('✅ Deployment Package Created Successfully at:', DEPLOY_DIR);

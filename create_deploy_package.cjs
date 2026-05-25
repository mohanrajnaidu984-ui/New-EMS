const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROJECT_ROOT = __dirname;
const dateStamp = new Date().toISOString().slice(0, 10);
const DEPLOY_DIR = path.join(PROJECT_ROOT, `EMS_Deploy_${dateStamp}`);
const FRONTEND_DIR = path.join(DEPLOY_DIR, 'frontend');
const FRONTEND_DIST_DIR = path.join(FRONTEND_DIR, 'dist');
const BACKEND_DIR = path.join(DEPLOY_DIR, 'backend'); // Renamed to backend to match user reference exactly

console.log('Starting Deployment Bundle Process...');
console.log(`Target Directory: ${DEPLOY_DIR}`);

// 1. Ensure deployment directories exist
if (!fs.existsSync(DEPLOY_DIR)) {
    fs.mkdirSync(DEPLOY_DIR, { recursive: true });
}
if (!fs.existsSync(FRONTEND_DIR)) {
    fs.mkdirSync(FRONTEND_DIR, { recursive: true });
}

// 2. Build Frontend
console.log('Building Frontend...');
try {
    execSync('npm run build', { cwd: PROJECT_ROOT, stdio: 'inherit' });
} catch (err) {
    console.error('Frontend build failed:', err);
    process.exit(1);
}

// 3. Clear existing frontend files and copy built Frontend Files directly to both the root and the nested dist folder
console.log('Copying Frontend...');
if (fs.existsSync(FRONTEND_DIR)) {
    fs.rmSync(FRONTEND_DIR, { recursive: true, force: true });
}
fs.mkdirSync(FRONTEND_DIR, { recursive: true });
fs.mkdirSync(FRONTEND_DIST_DIR, { recursive: true });

const distDir = path.join(PROJECT_ROOT, 'dist');
if (fs.existsSync(distDir)) {
    // Copy to the flat root folder
    fs.cpSync(distDir, FRONTEND_DIR, { recursive: true });
    // Copy to the nested dist/ folder (for backward compatibility with existing IIS configurations)
    fs.cpSync(distDir, FRONTEND_DIST_DIR, { recursive: true });
} else {
    console.error('Dist directory not found!');
    process.exit(1);
}

// Copy proxy-server.cjs to both locations
fs.copyFileSync(path.join(PROJECT_ROOT, 'proxy-server.cjs'), path.join(FRONTEND_DIR, 'proxy-server.cjs'));
fs.copyFileSync(path.join(PROJECT_ROOT, 'proxy-server.cjs'), path.join(FRONTEND_DIST_DIR, 'proxy-server.cjs'));



// 4. Clear existing backend and Copy new Backend Files
console.log('Copying Backend...');
if (fs.existsSync(BACKEND_DIR)) {
    fs.rmSync(BACKEND_DIR, { recursive: true, force: true });
}
fs.mkdirSync(BACKEND_DIR);

const serverDir = path.join(PROJECT_ROOT, 'server');
fs.cpSync(serverDir, BACKEND_DIR, {
    recursive: true,
    filter: (src) => {
        const basename = path.basename(src);
        // exclude node_modules and debug files (keep .env if it exists, or we will generate one)
        if (basename === 'node_modules') return false;
        if (src.includes('node_modules')) return false;
        
        // optionally filter out massive log files
        if (basename.endsWith('.log') || basename.endsWith('.txt')) return false;
        
        return true;
    }
});

console.log('✅ Deployment Package Updated Successfully at:', DEPLOY_DIR);

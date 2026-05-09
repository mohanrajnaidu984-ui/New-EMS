# EMS Deployment Package — 2026-05-08

## Contents

```
EMS_Deploy_2026-05-08/
├── frontend/
│   ├── dist/            ← Compiled React app
│   └── proxy-server.cjs ← Express static + API proxy (port 5173 → 5002)
├── server/              ← Node.js backend (no node_modules)
│   ├── index.js
│   ├── .env             ← Production environment config
│   └── routes/
├── START_EMS.bat        ← Launches both services
├── start_server.bat     ← Backend only
└── start_frontend.bat   ← Frontend proxy only
```

## Deployment Steps

### 1. Install backend dependencies
```
cd server
npm install --legacy-peer-deps
```

### 2. Start services
Double-click **START_EMS.bat** or run each `.bat` manually.

- **Backend**:  http://localhost:5002
- **Frontend**: http://localhost:5173

### 3. Network Storage
Uploads are written to: `\\151.50.20.129\ems app`
Ensure the service account has read/write access.

### 4. Database
Server: `151.50.1.116`  Database: `EMS_DB`  User: `bmsuser`

## Notes
- The `server/.env` contains all production secrets — keep it secured.
- To change the port, edit `server/.env` (PORT=) and `frontend/proxy-server.cjs`.

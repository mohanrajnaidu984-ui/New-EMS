# Deployment Guide: EMS Application on IIS

This guide assumes you have completed the **PREREQUISITES.md** steps.

## Overview of the Package
This folder contains:
1.  `client`: The build output of the React Frontend.
2.  `server`: The Node.js Backend API.
3.  `helpers`: Useful scripts for starting the server.

---

## Step 1: Copy Files to Server

1.  Copy the entire `EMS_Deployment` folder (or just the contents) to `C:\inetpub\wwwroot\EMS`.
    *   Your structure should look like:
        ```
        C:\inetpub\wwwroot\EMS\
            ├── client\
            ├── server\
            └── start_server.bat
        ```
2.  **Permissions**:
    *   Right-click `C:\inetpub\wwwroot\EMS` > **Properties** > **Security**.
    *   Click **Edit** > **Add**.
    *   Type `IIS_IUSRS` and click **Check Names**, then **OK**.
    *   Grant **Read & Execute**, **List folder contents**, **Read**.
    *   Also add `IUSR` with Read permissions.
    *   **Important**: Grant **Full Control** (or Modify) on `server\uploads` (if it exists) and `server\logs` to `IIS_IUSRS` so the app can save files.

---

## Step 2: Database Setup

1.  **Locate Scripts**: You will find SQL scripts in `C:\inetpub\wwwroot\EMS\database`.
2.  **Run Script**:
    *   Open **SQL Server Management Studio (SSMS)**.
    *   Connect to your database server.
    *   Open `EMS_DB.sql` (or `EMS_DB_FULL_STRUCTURE.sql`).
    *   Execute the script to create the database and tables.

---

## Step 3: Configure Database Connectivity

1.  Open `C:\inetpub\wwwroot\EMS\server\.env` in Notepad.
2.  Update the Database Connection Strings:
    ```env
    DB_SERVER=YourSQLServerName_or_IP
    DB_DATABASE=EMS_DB
    DB_USER=sa
    DB_PASSWORD=your_password
    ```
3.  Update Email configurations if necessary.

---

## Step 3: Set Up the Backend (Node.js)

We need the Node.js server to be running to handle API requests.

### Option A: Install PM2 (Recommended for Production)
PM2 ensures the app restarts if it crashes or the server reboots.
1.  Open **Header Powershell** as Administrator.
2.  Run: `npm install -g pm2`
3.  Navigate to the server folder: `cd C:\inetpub\wwwroot\EMS\server`
4.  Start the app: `pm2 start index.js --name "EMS-API"`
5.  Save the list so it survives reboots: `pm2 save`
6.  (Optional) Install startup hook: `pm2-startup install` (follow on-screen instructions).

### Option B: Quick Test (Manual Start)
1.  Double-click `C:\inetpub\wwwroot\EMS\start_server.bat`.
2.  A window will open running the server. Do not close it.

---

## Step 4: Configure IIS Website

1.  Open **IIS Manager**.
2.  Right-click **Sites** > **Add Website**.
    *   **Site name**: `EMS`
    *   **Physical path**: `C:\inetpub\wwwroot\EMS\client`
    *   **Port**: `80` (or `8080` if 80 is taken).
    *   **Host name**: Leave blank (or set a domain like `ems.local`).
3.  Click **OK**.

---

## Step 5: Configure Reverse Proxy (URL Rewrite)

We need to tell IIS: "If a request starts with /api, send it to the Node app running on port 5000."

1.  **Check URL Rewrite & ARR**:
    *   Open IIS Manager -> Click Server Name -> **Application Request Routing Cache**.
    *   Click **Server Proxy Settings** (on the right).
    *   Check **Enable proxy**. Click Apply.
    
2.  **Add Rewrite Rule**:
    *   Go to your `EMS` site in IIS.
    *   Double-click **URL Rewrite**.
    *   Click **Add Rule(s)...** > **Blank Rule**.
    *   **Name**: `ReverseProxyToNode`
    *   **Match URL**:
        *   **Pattern**: `api/(.*)`
    *   **Conditions**: None needed.
    *   **Action**:
        *   **Action type**: Rewrite
        *   **Rewrite URL**: `http://localhost:5000/api/{R:1}`
        *   Check **Append query string**.
        *   Click **Apply**.

---

## Step 6: Verify Deployment

1.  Open a browser and go to `http://localhost` (or `http://localhost:8080`).
2.  You should see the EMS User Interface.
3.  Load the **Enquiries** page. If data loads, the API connection (Reverse Proxy) and Database connection are working.

## Troubleshooting

*   **500 Error on API calls**: Check the Node console (or PM2 logs `pm2 logs`) for errors. Likely database connection failed.
*   **404 on Refresh**: If you refresh the page and get 404, you need a Client Rewrite Rule.
    *   (Good news: We checked the `web.config` in the `client` folder, it should handle this automatically).


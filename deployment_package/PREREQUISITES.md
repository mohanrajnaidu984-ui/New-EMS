# Server Prerequisites & Setup Guide

Before deploying the application, you must prepare the Windows Server by installing the necessary software and enabling specific IIS features.

## 1. Install Required Software

Download and install the following on your Windows Server:

### **Runtime & Hosting Bundles**
1.  **Node.js (LTS Version)**
    *   **What it is:** The runtime required to run the backend API.
    *   **Download:** [https://nodejs.org/en/download/](https://nodejs.org/en/download/) (Choose Windows Installer .msi, 64-bit)
    *   *Note:* After installation, open PowerShell and type `node -v` to confirm.

2.  **IIS URL Rewrite Module 2.1**
    *   **What it is:** Allows IIS to redirect API requests to the Node.js backend and handle React routing.
    *   **Download:** [https://www.iis.net/downloads/microsoft/url-rewrite](https://www.iis.net/downloads/microsoft/url-rewrite)

3.  **Application Request Routing (ARR) 3.0**
    *   **What it is:** Required if we use the Reverse Proxy method (recommended) to forward requests to the Node app.
    *   **Download:** [https://www.iis.net/downloads/microsoft/application-request-routing](https://www.iis.net/downloads/microsoft/application-request-routing)

4.  **SQL Server Command Line Utilities (optional but recommended)**
    *   Useful for testing database connectivity from the server.

### **Database Drivers**
*   Since your application uses the `mssql` package with default settings, it uses the pure JavaScript `tedious` driver. **No special SQL Native Client installation is strictly required** for the Node app itself, but ensure the server can reach your SQL Server instance via TCP/IP.

---

## 2. Enable IIS Roles and Features

1.  Open **Server Manager**.
2.  Click **Manage** > **Add Roles and Features**.
3.  Click **Next** until you reach **Server Roles**.
4.  Expand **Web Server (IIS)** > **Web Server**.
5.  Ensure the following are checked:
    *   **Common HTTP Features**:
        *   Default Document
        *   Directory Browsing
        *   HTTP Errors
        *   Static Content
    *   **Health and Diagnostics**:
        *   HTTP Logging
    *   **Performance**:
        *   Static Content Compression
    *   **Security**:
        *   Request Filtering
    *   **Application Development**:
        *   .NET Extensibility 4.8 (or highest available)
        *   ASP.NET 4.8 (or highest available)
        *   ISAPI Extensions
        *   ISAPI Filters
        *   WebSocket Protocol (Important for real-time features if any)
6.  Click **Next** and **Install**.

---

## 3. Verify IIS Installation

1.  Open a web browser on the server.
2.  Go to `http://localhost`.
3.  You should see the default indigo IIS "Welcome" page.

## 4. Prepare Folders

1.  Navigate to `C:\inetpub\wwwroot`.
2.  Create a new folder named `EMS` (or your preferred app name).
3.  Inside `C:\inetpub\wwwroot\EMS`, you will eventually place your deployment files.
    *   `client` folder (for the React website)
    *   `server` folder (for the Node API)

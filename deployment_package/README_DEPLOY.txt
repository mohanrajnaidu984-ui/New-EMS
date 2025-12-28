
# Deployment Instructions

1. **Frontend**: Copy contents of 'frontend' to C:\inetpub\wwwroot\EMS_Frontend
2. **Backend**: Copy contents of 'backend' to C:\inetpub\wwwroot\EMS_Backend
3. **Database**: Run 'EMS_DB.sql' (found in root) on your SQL Server.
4. **Env**: Create a .env file in EMS_Backend with your production DB credentials.
5. **IIS**: Point a Site to EMS_Frontend.
6. **Node**: Install Node.js, run 'npm install' in EMS_Backend, and start with 'pm2 start index.js'.

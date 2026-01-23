const sql = require('mssql');
require('dotenv').config();

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    options: {
        encrypt: true,
        trustServerCertificate: true
    }
};

async function migrateEnquiries() {
    try {
        await sql.connect(config);

        console.log('Renaming existing Enquiries table to Enquiries_Backup...');
        try {
            // Check if backup exists and drop it
            await sql.query`IF OBJECT_ID('Enquiries_Backup', 'U') IS NOT NULL DROP TABLE Enquiries_Backup`;

            await sql.query`EXEC sp_rename 'Enquiries', 'Enquiries_Backup'`;
            console.log('Table renamed.');
        } catch (err) {
            console.log('Rename failed (maybe table does not exist or backup already exists):', err.message);
            // If backup exists, we might want to drop the current Enquiries to recreate it
            try {
                await sql.query`DROP TABLE Enquiries`;
                console.log('Dropped existing Enquiries table.');
            } catch (e) {
                console.log('Drop failed (maybe table does not exist):', e.message);
            }
        }

        console.log('Creating new Enquiries table...');
        await sql.query`
            CREATE TABLE Enquiries (
                RequestNo NVARCHAR(50) PRIMARY KEY,
                SourceOfInfo NVARCHAR(50),
                EnquiryDate DATE,
                DueOn DATE,
                SiteVisitDate DATE,
                EnquiryType NVARCHAR(MAX), -- Comma Separated
                EnquiryFor NVARCHAR(MAX), -- Comma Separated
                CustomerName NVARCHAR(MAX), -- Comma Separated
                ReceivedFrom NVARCHAR(MAX), -- Comma Separated
                ProjectName NVARCHAR(255),
                ClientName NVARCHAR(255),
                ConsultantName NVARCHAR(255),
                ConcernedSE NVARCHAR(MAX), -- Comma Separated
                DetailsOfEnquiry NVARCHAR(MAX),
                DocumentsReceived NVARCHAR(MAX),
                HardCopy BIT,
                Drawing BIT,
                DVD BIT,
                Spec BIT,
                EqpSchedule BIT,
                Remark NVARCHAR(MAX),
                AutoAck BIT,
                CeoSign BIT,
                Status NVARCHAR(50) DEFAULT 'Enquiry',
                CreatedAt DATETIME DEFAULT GETDATE()
            )
        `;
        console.log('New Enquiries table created successfully.');

        await sql.close();
    } catch (err) {
        console.error('Migration Error:', err);
    }
}

migrateEnquiries();

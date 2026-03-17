const { sql, connectDB } = require('./dbConfig');

const fixEnquiryNotesTable = async () => {
    try {
        await connectDB();
        console.log('Connected to DB. Checking EnquiryNotes table schema...');

        // Check columns
        const cols = await sql.query`
            SELECT COLUMN_NAME, DATA_TYPE 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'EnquiryNotes'
        `;

        // Force Drop and Recreate to ensure schema is correct (missing columns fixed)
        console.log('Force dropping and recreating table EnquiryNotes...');
        try {
            await sql.query`DROP TABLE EnquiryNotes`;
        } catch (e) {
            console.log('Table might not exist, proceeding...');
        }

        await sql.query`
            CREATE TABLE EnquiryNotes (
                ID INT IDENTITY(1,1) PRIMARY KEY,
                EnquiryID NVARCHAR(50) NOT NULL,
                UserID INT NOT NULL,
                UserName NVARCHAR(255),
                UserProfileImage NVARCHAR(MAX),
                NoteContent NVARCHAR(MAX),
                CreatedAt DATETIME DEFAULT GETDATE()
            )
        `;
        console.log('Table EnquiryNotes recreated successfully.');

    } catch (err) {
        console.error('Error fixing table:', err);
    } finally {
        process.exit();
    }
};

fixEnquiryNotesTable();

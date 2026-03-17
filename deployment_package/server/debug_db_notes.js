const { sql, connectDB } = require('./dbConfig');

const debugNotes = async () => {
    try {
        await connectDB();
        console.log('Connected to DB.');

        // 1. Check Table Schema
        console.log('Checking EnquiryNotes schema...');
        const schema = await sql.query`
            SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'EnquiryNotes'
        `;
        console.table(schema.recordset);

        // 2. Try the failing SELECT query
        const testId = 'EYS/2025/12/7209656006';
        console.log(`Attempting SELECT with EnquiryID = '${testId}'...`);
        try {
            const result = await sql.query`SELECT * FROM EnquiryNotes WHERE EnquiryID = ${testId} ORDER BY CreatedAt ASC`;
            console.log('SELECT Success. Rows:', result.recordset.length);
        } catch (err) {
            console.error('SELECT Failed:', err.message);
        }

        // 3. Try the failing INSERT query
        console.log('Attempting INSERT...');
        const userId = 8;
        const userName = 'DebugUser';
        const userImage = 'test_image';
        const content = 'Debug Note';

        try {
            const request = new sql.Request();
            request.input('EnquiryID', sql.NVarChar, testId);
            request.input('UserID', sql.Int, userId);
            request.input('UserName', sql.NVarChar, userName);
            request.input('UserProfileImage', sql.NVarChar, userImage);
            request.input('NoteContent', sql.NVarChar, content);

            await request.query`
                INSERT INTO EnquiryNotes (EnquiryID, UserID, UserName, UserProfileImage, NoteContent)
                VALUES (@EnquiryID, @UserID, @UserName, @UserProfileImage, @NoteContent)
            `;
            console.log('INSERT Success.');
        } catch (err) {
            console.error('INSERT Failed:', err.message);
        }

    } catch (err) {
        console.error('Global Error:', err);
    } finally {
        process.exit();
    }
};

debugNotes();

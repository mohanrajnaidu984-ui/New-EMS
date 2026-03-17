const { connectDB, sql } = require('./dbConfig');
const bcrypt = require('bcryptjs');

const fixUser = async () => {
    try {
        await connectDB();
        console.log('Connected to DB');

        const email = 'vigneshgowardhan6163@gmail.com';
        const password = '2flak5md';

        const userResult = await sql.query`SELECT * FROM Master_ConcernedSE WHERE EmailId = ${email}`;
        let user = userResult.recordset[0];

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        if (!user) {
            console.log('User not found. Creating user...');
            await sql.query`INSERT INTO Master_ConcernedSE (FullName, EmailId, LoginPassword, Roles, Status, Designation, Department) 
                            VALUES ('Vignesh G', ${email}, ${hashedPassword}, 'Admin', 'Active', 'SE', 'IT')`;
            console.log('User created.');
        } else {
            console.log('User found. Updating password...');
            await sql.query`UPDATE Master_ConcernedSE SET LoginPassword = ${hashedPassword}, Roles = 'Admin' WHERE EmailId = ${email}`;
            console.log('Password updated.');
        }

        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
};

fixUser();

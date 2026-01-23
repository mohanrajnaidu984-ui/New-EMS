const { connectDB, sql } = require('./dbConfig');

// Copy of the function from index.js to test in isolation
const createNotifications = async (requestNo, type, message, triggerUserEmail, triggerUserName) => {
    try {
        console.log('--- START NOTIFICATION GENERATION (TEST) ---');
        console.log(`Request: ${requestNo}, Type: ${type}, Trigger: ${triggerUserName} (${triggerUserEmail})`);

        let recipientEmails = new Set();

        // 1. Get Enquiry Details (CreatedBy)
        const enqRes = await sql.query`SELECT CreatedBy FROM EnquiryMaster WHERE RequestNo = ${requestNo}`;
        let createdBy = '';
        if (enqRes.recordset.length > 0) {
            createdBy = enqRes.recordset[0].CreatedBy;
            console.log(`Enquiry Created By: ${createdBy}`);
        }

        // A. Add Creator
        if (createdBy) {
            const u = await sql.query`SELECT EmailId FROM Master_ConcernedSE WHERE FullName = ${createdBy}`;
            if (u.recordset.length > 0 && u.recordset[0].EmailId) {
                const email = u.recordset[0].EmailId.trim().toLowerCase();
                recipientEmails.add(email);
                console.log(`Added Creator Email: ${email}`);
            }
        }

        // B. Add Concerned SEs
        const seRes = await sql.query`SELECT SEName FROM ConcernedSE WHERE RequestNo = ${requestNo}`;
        console.log(`Found ${seRes.recordset.length} Concerned SEs linked.`);
        for (const row of seRes.recordset) {
            const u = await sql.query`SELECT EmailId FROM Master_ConcernedSE WHERE FullName = ${row.SEName}`;
            if (u.recordset.length > 0 && u.recordset[0].EmailId) {
                const email = u.recordset[0].EmailId.trim().toLowerCase();
                recipientEmails.add(email);
                console.log(`Added Concerned SE Email: ${email} (Name: ${row.SEName})`);
            }
        }

        // C. Add Enquiry For Items -> Emails (Division Members)
        const itemRes = await sql.query`SELECT ItemName FROM EnquiryFor WHERE RequestNo = ${requestNo}`;
        console.log(`Found ${itemRes.recordset.length} Enquiry Items linked.`);
        if (itemRes.recordset.length > 0) {
            for (const itemRow of itemRes.recordset) {
                const mItem = await sql.query`SELECT CommonMailIds, CCMailIds FROM Master_EnquiryFor WHERE ItemName = ${itemRow.ItemName}`;
                if (mItem.recordset.length > 0) {
                    const { CommonMailIds, CCMailIds } = mItem.recordset[0];
                    if (CommonMailIds) {
                        CommonMailIds.split(',').forEach(e => {
                            const email = e.trim().toLowerCase();
                            if (email) {
                                recipientEmails.add(email);
                                console.log(`Added CommonMailId: ${email} (Item: ${itemRow.ItemName})`);
                            }
                        });
                    }
                    if (CCMailIds) {
                        CCMailIds.split(',').forEach(e => {
                            const email = e.trim().toLowerCase();
                            if (email) {
                                recipientEmails.add(email);
                                console.log(`Added CCMailId: ${email} (Item: ${itemRow.ItemName})`);
                            }
                        });
                    }
                }
            }
        }

        // Remove Trigger User
        if (triggerUserEmail) {
            const triggerEmailLower = triggerUserEmail.trim().toLowerCase();
            if (recipientEmails.has(triggerEmailLower)) {
                recipientEmails.delete(triggerEmailLower);
                console.log(`Removed Trigger User Email: ${triggerEmailLower}`);
            }
        }

        console.log('Final Recipient List:', Array.from(recipientEmails));

        // Insert
        for (const email of recipientEmails) {
            const u = await sql.query`SELECT ID FROM Master_ConcernedSE WHERE EmailId = ${email}`;
            if (u.recordset.length > 0) {
                const userId = u.recordset[0].ID;
                await sql.query`
                    INSERT INTO Notifications (UserID, Type, Message, LinkID, CreatedBy)
                    VALUES (${userId}, ${type}, ${message}, ${requestNo}, ${triggerUserName})
                 `;
                console.log(`Notification inserted for UserID: ${userId} (${email})`);
            } else {
                console.log(`WARNING: No UserID found for email: ${email} - Notification skipped.`);
            }
        }
        console.log('--- END NOTIFICATION GENERATION ---');
    } catch (e) {
        console.error('CRITICAL ERROR creating notifications:', e);
    }
};

const runTest = async () => {
    try {
        await connectDB();
        console.log('Connected to DB');

        // 1. Find a recent Enquiry
        const enq = await sql.query`SELECT TOP 1 RequestNo, CreatedBy FROM EnquiryMaster ORDER BY CreatedAt DESC`;
        if (enq.recordset.length === 0) {
            console.log('No enquiries found to test.');
            process.exit(0);
        }
        const requestNo = enq.recordset[0].RequestNo;
        console.log(`Testing with RequestNo: ${requestNo}`);

        // 2. Find a user to act as Trigger
        const triggerUser = await sql.query`SELECT TOP 1 FullName, EmailId FROM Master_ConcernedSE`;
        const tUser = triggerUser.recordset[0];
        console.log(`Trigger User: ${tUser.FullName} (${tUser.EmailId})`);

        // 3. Run Logic
        await createNotifications(requestNo, 'Test Notification', 'This is a test message', tUser.EmailId, tUser.FullName);

        // 4. Verify Insertion
        const notifs = await sql.query`SELECT TOP 5 * FROM Notifications ORDER BY CreatedAt DESC`;
        console.table(notifs.recordset);

    } catch (err) {
        console.error('Test Error:', err);
    } finally {
        process.exit(0);
    }
};

runTest();

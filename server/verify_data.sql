-- Check counts in all tables
SELECT 'Customers' as TableName, COUNT(*) as Count FROM Customers
UNION ALL
SELECT 'Contacts', COUNT(*) FROM Contacts
UNION ALL
SELECT 'Users', COUNT(*) FROM Users
UNION ALL
SELECT 'Enquiries', COUNT(*) FROM Enquiries
UNION ALL
SELECT 'EnquiryAttachments', COUNT(*) FROM EnquiryAttachments;

-- View top 5 recent Customers
SELECT TOP 5 * FROM Customers ORDER BY CustomerID DESC;

-- View top 5 recent Contacts
SELECT TOP 5 * FROM Contacts ORDER BY ContactID DESC;

-- View top 5 recent Enquiries
SELECT TOP 5 * FROM Enquiries ORDER BY CreatedAt DESC;

-- Check specific Customer and their Contacts
-- Replace 'TATA' with the company name you are looking for
SELECT * FROM Customers WHERE CompanyName LIKE '%TATA%';
SELECT * FROM Contacts WHERE CompanyName LIKE '%TATA%';

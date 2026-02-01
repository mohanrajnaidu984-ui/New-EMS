
const express = require('express');
const router = express.Router();
const { sql } = require('../dbConfig');

router.get('/filters', async (req, res) => {
    try {
        const { company, division } = req.query;
        const request = new sql.Request();

        // 1. Years (Always distinct from EnquiryMaster)
        const yearQuery = `
            SELECT DISTINCT YEAR(EnquiryDate) as Year 
            FROM EnquiryMaster 
            WHERE EnquiryDate IS NOT NULL 
            ORDER BY Year DESC
        `;

        // 2. Companies (Always distinct from Master_EnquiryFor)
        const companyQuery = `
            SELECT DISTINCT CompanyName 
            FROM Master_EnquiryFor 
            WHERE CompanyName IS NOT NULL AND CompanyName <> ''
            ORDER BY CompanyName ASC
        `;

        // 3. Divisions (Filtered by Company if provided)
        let divisionSQL = `
            SELECT DISTINCT DepartmentName 
            FROM Master_EnquiryFor 
            WHERE DepartmentName IS NOT NULL AND DepartmentName <> ''
        `;
        if (company && company !== 'All') {
            divisionSQL += ` AND CompanyName = @company `;
            request.input('company', sql.NVarChar, company);
        }
        divisionSQL += ` ORDER BY DepartmentName ASC`;

        // 4. Roles (Filtered by Division if provided)
        // Master_ConcernedSE has 'Department' column.
        let roleSQL = `
            SELECT DISTINCT FullName 
            FROM Master_ConcernedSE 
            WHERE FullName IS NOT NULL AND FullName <> ''
        `;
        if (division && division !== 'All') {
            roleSQL += ` AND Department = @division `;
            request.input('division', sql.NVarChar, division);
        }
        roleSQL += ` ORDER BY FullName ASC`;

        const [years, companies, divisions, roles] = await Promise.all([
            new sql.Request().query(yearQuery),
            new sql.Request().query(companyQuery),
            request.query(divisionSQL),
            request.query(roleSQL)
        ]);

        res.json({
            years: years.recordset.map(r => r.Year),
            companies: companies.recordset.map(r => r.CompanyName),
            divisions: divisions.recordset.map(r => r.DepartmentName),
            roles: roles.recordset.map(r => r.FullName)
        });

    } catch (err) {
        console.error('Error fetching Sales Report filters:', err);
        res.status(500).json({ error: 'Failed to fetch filters' });
    }
});

module.exports = router;

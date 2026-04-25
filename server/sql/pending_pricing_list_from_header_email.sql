/*
  SQL equivalent of the FIRST step of GET /api/pricing/list/pending (enquiry rows sent to the server).

  Set @UserEmail to the exact address shown in the app header (Pricing module now uses session
  currentUser.EmailId / email — same as top-right), NOT localStorage currentUserEmail.

  The UI "Pending Pricing" table shows only enquiries where Node (getEnquiryPricingList in
  server/routes/pricing.js) still has at least one visible base price line = "Not Updated".
  This query does NOT apply that second filter; use it to verify access + enquiry scope.
*/

DECLARE @UserEmail NVARCHAR(320) = N'bmseng4@almoayyedcg.com';

DECLARE @NormEmail NVARCHAR(320) =
    LOWER(
        REPLACE(
            REPLACE(LTRIM(RTRIM(@UserEmail)), N'@almcg.com', N'@almoayyedcg.com'),
            N'@ALMCG.COM',
            N'@almoayyedcg.com'
        )
    );

DECLARE @Roles NVARCHAR(500) =
(
    SELECT LOWER(LTRIM(RTRIM(ISNULL(m.Roles, N''))))
    FROM dbo.Master_ConcernedSE m
    WHERE LOWER(
              REPLACE(
                  REPLACE(LTRIM(RTRIM(ISNULL(m.EmailId, N''))), N'@almcg.com', N'@almoayyedcg.com'),
                  N'@ALMCG.COM',
                  N'@almoayyedcg.com'
              )
          ) = @NormEmail
);

DECLARE @IsAdmin BIT =
    CASE
        WHEN @Roles LIKE N'%admin%' OR @Roles LIKE N'%system%' THEN 1
        ELSE 0
    END;

DECLARE @IsCcUser BIT =
    CASE
        WHEN EXISTS (
            SELECT 1
            FROM dbo.Master_EnquiryFor mef
            WHERE N',' + REPLACE(REPLACE(ISNULL(mef.CCMailIds, N''), N' ', N''), N';', N',') + N','
                  LIKE N'%,' + @NormEmail + N',%'
        ) THEN 1
        ELSE 0
    END;

/* Optional: see which branch runs */
SELECT @NormEmail AS NormEmail, @IsAdmin AS IsAdmin, @IsCcUser AS IsCcUser, @Roles AS RolesLower;

IF @IsAdmin = 1
BEGIN
    SELECT
        E.RequestNo,
        E.ProjectName,
        E.CustomerName,
        E.Status,
        E.DueDate,
        E.EnquiryDate,
        E.CreatedBy
    FROM dbo.EnquiryMaster E
    WHERE (
        E.Status IN (N'Open', N'Enquiry', N'Priced', N'Estimated', N'Quote', N'Pricing', N'Pending', N'Quoted', N'Submitted')
        OR E.Status IS NULL
        OR LTRIM(RTRIM(ISNULL(E.Status, N''))) = N''
    )
    ORDER BY E.DueDate DESC, E.RequestNo DESC;
END
ELSE IF @IsCcUser = 1
BEGIN
    SELECT
        E.RequestNo,
        E.ProjectName,
        E.CustomerName,
        E.Status,
        E.DueDate,
        E.EnquiryDate,
        E.CreatedBy
    FROM dbo.EnquiryMaster E
    WHERE (
        E.Status IN (N'Open', N'Enquiry', N'Priced', N'Estimated', N'Quote', N'Pricing', N'Pending', N'Quoted', N'Submitted')
        OR E.Status IS NULL
        OR LTRIM(RTRIM(ISNULL(E.Status, N''))) = N''
    )
      AND EXISTS (
            SELECT 1
            FROM dbo.EnquiryFor ef
            INNER JOIN dbo.Master_EnquiryFor mef
                ON (ef.ItemName = mef.ItemName OR ef.ItemName LIKE N'% - ' + mef.ItemName)
            WHERE ef.RequestNo = E.RequestNo
              AND N',' + REPLACE(REPLACE(ISNULL(mef.CCMailIds, N''), N' ', N''), N';', N',') + N','
                    LIKE N'%,' + @NormEmail + N',%'
        )
    ORDER BY E.DueDate DESC, E.RequestNo DESC;
END
ELSE
BEGIN
    SELECT
        E.RequestNo,
        E.ProjectName,
        E.CustomerName,
        E.Status,
        E.DueDate,
        E.EnquiryDate,
        E.CreatedBy
    FROM dbo.EnquiryMaster E
    WHERE (
        E.Status IN (N'Open', N'Enquiry', N'Priced', N'Estimated', N'Quote', N'Pricing', N'Pending', N'Quoted', N'Submitted')
        OR E.Status IS NULL
        OR LTRIM(RTRIM(ISNULL(E.Status, N''))) = N''
    )
      AND EXISTS (
            SELECT 1
            FROM dbo.ConcernedSE c
            INNER JOIN dbo.Master_ConcernedSE m
                ON UPPER(LTRIM(RTRIM(ISNULL(m.FullName, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(c.SEName, N''))))
            WHERE c.RequestNo = E.RequestNo
              AND LOWER(LTRIM(RTRIM(m.EmailId))) = LOWER(LTRIM(@NormEmail))
        )
    ORDER BY E.DueDate DESC, E.RequestNo DESC;
END;

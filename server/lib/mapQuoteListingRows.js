'use strict';

const { getPricingAnchorJobs, expandVisibleJobIdsFromAnchors } = require('./quotePricingAccess');

/**
 * Maps raw enquiry rows from list/pending / list/search SQL into the shape the Quote UI expects.
 */
async function mapQuoteListingRows(sql, enquiries, userEmail, accessCtx) {
    if (!enquiries || enquiries.length === 0) return [];
    // One UI row per pending pricing value: prefer EnquiryPricingValues.ID (same PV row can join multiple EF rows).
    // Quoted list rows have no ListPendingPvId — fall back to tuple text; then only RequestNo for legacy rows.
    const pendingTupleKey = (e) => {
        const req = String(e.RequestNo ?? '').trim();
        const pvRaw = e.ListPendingPvId ?? e.listpendingpvid;
        const pvNum = pvRaw != null && pvRaw !== '' ? Number(pvRaw) : 0;
        if (!Number.isNaN(pvNum) && pvNum > 0) {
            return `${req}\tpv:${pvNum}`;
        }
        return [
            req,
            String(e.ListPendingOwnJobItem ?? e.listpendingownjobitem ?? '').trim().toLowerCase(),
            String(e.ListPendingLeadJobName ?? e.listpendingleadjobname ?? '').trim().toLowerCase(),
            String(e.ListPendingCustomerName ?? e.listpendingcustomername ?? '').trim().toLowerCase(),
        ].join('\t');
    };
    const seenTuple = new Set();
    const enquiriesToMap = [];
    for (const row of enquiries) {
        const k = pendingTupleKey(row);
        if (seenTuple.has(k)) continue;
        seenTuple.add(k);
        enquiriesToMap.push(row);
    }

    const userDepartment = accessCtx ? accessCtx.userDepartment : '';
    const requestNos = enquiriesToMap.map(e => `'${e.RequestNo}'`).join(',');

    // Fetch Jobs (CCMailIds required for anchor scope — same as pricing)
        const jobsRes = await sql.query(`
            SELECT EF.RequestNo, EF.ID, EF.ParentID, EF.ItemName, EF.LeadJobCode, MEF.CCMailIds AS CCMailIds
            FROM EnquiryFor EF
            LEFT JOIN Master_EnquiryFor MEF ON (EF.ItemName = MEF.ItemName OR EF.ItemName LIKE '% - ' + MEF.ItemName)
            WHERE EF.RequestNo IN (${requestNos})
        `);
        const allJobsRaw = jobsRes.recordset || [];
        const seenJobKeys = new Set();
        const allJobs = [];
        for (const j of allJobsRaw) {
            const jid = j.ID ?? j.id;
            if (jid == null) continue;
            const k = `${j.RequestNo}:${jid}`;
            if (seenJobKeys.has(k)) continue;
            seenJobKeys.add(k);
            allJobs.push(j);
        }

        // Fetch Prices using the same matching rule as the validated SSMS query:
        // match current EnquiryFor row by (EnquiryForID) OR (trimmed EnquiryForItem = trimmed ItemName).
        const pricesRes = await sql.query(`
            SELECT
                v.RequestNo,
                v.OptionID,
                v.EnquiryForID,
                v.EnquiryForItem,
                v.Price,
                v.UpdatedAt,
                v.CustomerName,
                v.LeadJobName,
                v.PriceOption,
                m.MatchedEnquiryForId,
                m.MatchedItemName,
                m.MatchedParentId
            FROM EnquiryPricingValues v
            OUTER APPLY (
                SELECT TOP 1
                    ef.ID AS MatchedEnquiryForId,
                    ef.ItemName AS MatchedItemName,
                    ef.ParentID AS MatchedParentId
                FROM EnquiryFor ef
                WHERE ef.RequestNo = v.RequestNo
                  AND (
                        (v.EnquiryForID IS NOT NULL AND v.EnquiryForID <> 0 AND v.EnquiryForID = ef.ID)
                     OR (
                            LTRIM(RTRIM(ISNULL(v.EnquiryForItem, N''))) <> N''
                        AND LTRIM(RTRIM(v.EnquiryForItem)) = LTRIM(RTRIM(ef.ItemName))
                        )
                    )
                ORDER BY
                    CASE WHEN v.EnquiryForID IS NOT NULL AND v.EnquiryForID <> 0 AND v.EnquiryForID = ef.ID THEN 0 ELSE 1 END,
                    ef.ID
            ) m
            WHERE v.RequestNo IN (${requestNos})
        `);
        const allPrices = pricesRes.recordset;

        // Fetch external customers from transactional table (authoritative source)
        const enquiryCustomersRes = await sql.query(`
            SELECT RequestNo, CustomerName
            FROM EnquiryCustomer
            WHERE RequestNo IN (${requestNos})
        `);
        const allEnquiryCustomers = enquiryCustomersRes.recordset;

        console.log(`[API] Found ${allJobs.length} jobs and ${allPrices.length} prices for ${enquiriesToMap.length} enquiries.`);

        // Map subjob prices for each enquiry
        const mappedEnquiries = enquiriesToMap.map(enq => {
            const enqRequestNo = enq.RequestNo?.toString().trim();
            if (!enqRequestNo) return null;

            const enqJobs = allJobs.filter(j => j.RequestNo?.toString().trim() == enqRequestNo);
            const enqPrices = allPrices.filter(p => p.RequestNo?.toString().trim() == enqRequestNo);

            // Build hierarchy
            const childrenMap = {};
            enqJobs.forEach(j => {
                if (j.ParentID && j.ParentID != '0') {
                    if (!childrenMap[j.ParentID]) childrenMap[j.ParentID] = [];
                    childrenMap[j.ParentID].push(j);
                }
            });

            const roots = enqJobs.filter(j => !j.ParentID || j.ParentID == '0' || j.ParentID == 0);
            roots.sort((a, b) => a.ID - b.ID);
            
            // Map each root to an L-code (L1, L2...)
            const rootLabelMap = {};
            roots.forEach((r, idx) => {
                const existing = (r.LeadJobCode || '').trim().toUpperCase();
                if (existing && existing.match(/^L\d+$/)) {
                    rootLabelMap[r.ID] = existing;
                } else {
                    rootLabelMap[r.ID] = `L${idx + 1}`;
                }
            });

            const flatList = [];
            const traverse = (job, level) => {
                flatList.push({ ...job, level });
                const children = childrenMap[job.ID] || [];
                children.sort((a, b) => a.ID - b.ID);
                children.forEach(child => traverse(child, level + 1));
            };
            roots.forEach(root => traverse(root, 0));

            // Filter flatList by ScopedJobIDs â€” prefer JS anchors (aligned with pricing) when user is non-admin
            let scopedJobIDsStr = (enq.ScopedJobIDs || '').toString().split(',').map(id => id.trim()).filter(Boolean);
            if (userEmail && accessCtx && accessCtx.user && !accessCtx.isAdmin) {
                const anchors = getPricingAnchorJobs(enqJobs, accessCtx, userEmail);
                if (anchors.length > 0) {
                    const visibleIds = expandVisibleJobIdsFromAnchors(anchors, enqJobs);
                    scopedJobIDsStr = Array.from(visibleIds);
                }
                // If no JS anchors, keep SQL ScopedJobIDs â€” pending query already enforced ConcernedSE + division access
            }
            if (scopedJobIDsStr.length === 0 && roots.length > 0) {
                scopedJobIDsStr = roots.map((r) => String(r.ID));
            }
            const scopedJobIDsSet = new Set(scopedJobIDsStr);
            const scopedJobs = flatList.filter(j => scopedJobIDsSet.has(j.ID.toString()));

            // Fix childrenMap keys to be strings for consistent lookup
            const stringChildrenMap = {};
            Object.entries(childrenMap).forEach(([k, v]) => {
                stringChildrenMap[k.toString()] = v;
            });

            // Identify all IDs that are descendants of scoped IDs
            const validIDs = new Set();
            const collectDescendants = (id) => {
                const idStr = id.toString();
                if (validIDs.has(idStr)) return;
                validIDs.add(idStr);
                const children = stringChildrenMap[idStr] || [];
                children.forEach(c => collectDescendants(c.ID));
            };
            scopedJobIDsStr.forEach(id => collectDescendants(id));

            const filteredFlatList = flatList.filter(job => validIDs.has(job.ID.toString()));

            // Indentation adjustment: use the minimum level among visible jobs (to make first job L1)
            let minLevel = 0;
            if (filteredFlatList.length > 0) {
                minLevel = Math.min(...filteredFlatList.map(j => j.level || 0));
            }

            const normalize = str => str.toLowerCase().replace(/[^a-z0-9]/g, '');

            // Identify Root and Job Names for Aggregation
            const rootJob = enqJobs.find(j => !j.ParentID || j.ParentID == '0' || j.ParentID == 0);
            const internalCustomer = rootJob ? rootJob.ItemName.trim() : 'Internal';
            const internalCustomerNorm = normalize(internalCustomer);
            const jobNameSetNorm = new Set(enqJobs.map(j => normalize(j.ItemName)));

            // External customers from EnquiryCustomer table (authoritative)
            let externalCustomers = allEnquiryCustomers
                .filter(c => c.RequestNo?.toString().trim() == enqRequestNo)
                .map(c => (c.CustomerName || '').trim())
                .filter(Boolean);
            externalCustomers = [...new Set(externalCustomers.map(c => c.replace(/,\s*$/, '').trim()))];

            // Pre-calculate Individual (Self) Prices (Latest Only) - STRICTLY Internal
            const selfPrices = {};
            const updateDates = {};
            flatList.forEach(job => {
                const normOpt = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
                const isBasePrice = (p) => {
                    const po = p.PriceOption ?? p.priceOption ?? p.priceoption;
                    return normOpt(po) === 'base price';
                };

                const idMatches = enqPrices.filter(p => {
                    if (!isBasePrice(p)) return false;
                    const matchedId = p.MatchedEnquiryForId ?? p.matchedEnquiryForId ?? p.matchedenquiryforid;
                    if (matchedId != null && matchedId !== '' && String(matchedId) !== '0') {
                        return String(matchedId) === String(job.ID);
                    }
                    return p.EnquiryForID && p.EnquiryForID != 0 && p.EnquiryForID != '0' && String(p.EnquiryForID) === String(job.ID);
                });

                // Fallback to ItemName only for legacy rows that have no usable IDs.
                // If a row has MatchedEnquiryForId/EnquiryForID, keep strict ID matching
                // to avoid same-name collisions across branches.
                let finalMatches = idMatches;
                if (finalMatches.length === 0) {
                    finalMatches = enqPrices.filter(p =>
                        isBasePrice(p) &&
                        !(p.MatchedEnquiryForId ?? p.matchedEnquiryForId ?? p.matchedenquiryforid) &&
                        !(p.EnquiryForID && p.EnquiryForID != 0 && p.EnquiryForID != '0') &&
                        p.EnquiryForItem &&
                        p.EnquiryForItem.toString().trim().toLowerCase() === job.ItemName.toString().trim().toLowerCase()
                    );
                }

                const sortedMatches = [...finalMatches].sort((a, b) => new Date(b.UpdatedAt || 0) - new Date(a.UpdatedAt || 0));

                // For Subjob Prices tree, strictly use the internal customer view or divisions
                let priceRow = sortedMatches.find(p => p.Price > 0 && p.CustomerName && (
                    normalize(p.CustomerName) === internalCustomerNorm ||
                    jobNameSetNorm.has(normalize(p.CustomerName))
                ));

                if (!priceRow) priceRow = sortedMatches.find(p => p.Price > 0);
                if (!priceRow && sortedMatches.length > 0) priceRow = sortedMatches[0];

                selfPrices[job.ID] = priceRow ? parseFloat(priceRow.Price || 0) : 0;
                updateDates[job.ID] = priceRow ? priceRow.UpdatedAt : null;
            });

            const subJobPrices = filteredFlatList.map(job => {
                const displayLevel = Math.max(0, (job.level || 0) - minLevel);

                const displayName = (() => {
                    // Inherit LeadJobCode from root ancestor
                    let root = job;
                    let visited = new Set();
                    while (root.ParentID && root.ParentID != 0 && root.ParentID != '0' && !visited.has(root.ID)) {
                        const p = enqJobs.find(j => j.ID == root.ParentID);
                        if (!p) break;
                        visited.add(root.ID);
                        root = p;
                    }

                    const displayCode = rootLabelMap[root.ID] || 'L1';

                    // STRICT label rule for pending summary:
                    // always display the current job itself (never parent/lead alias).
                    // This ensures subjob users see only ownjob + its descendants,
                    // without parent/lead job labels appearing in the list.
                    const labelBaseName = job.ItemName;
                    return `${labelBaseName} (${displayCode})`;
                })();

                // Each row shows this department's own Base Price only (net), never a roll-up of descendants.
                const totalVal = selfPrices[job.ID] || 0;

                const updatedAtTs =
                    (updateDates[job.ID] ? new Date(updateDates[job.ID]).getTime() : 0) || 0;

                return `${displayName}|${totalVal > 0 ? totalVal.toFixed(2) : 'Not Updated'}|${updatedAtTs ? new Date(updatedAtTs).toISOString() : ''}|${displayLevel}`;
            }).join(';;');

            // Aggregate PricingCustomerDetails (Hide Subjobs, Aggregate to Root)
            let aggregatedPricing = {};
            if (enq.PricingCustomerDetails) {
                enq.PricingCustomerDetails.split(';;').forEach(p => {
                    const parts = p.split('|');
                    const name = parts[0]?.trim();
                    const val = parseFloat(parts[1]) || 0;
                    if (!name) return;

                    const nameNorm = normalize(name);
                    if (jobNameSetNorm.has(nameNorm)) {
                        // It's a job name (Internal) -> keep as original name (Parent Job)
                        aggregatedPricing[name] = (aggregatedPricing[name] || 0) + val;
                    } else {
                        // It's an external customer
                        aggregatedPricing[name] = (aggregatedPricing[name] || 0) + val;
                    }
                });
            }

            const finalPricingStr = Object.entries(aggregatedPricing)
                .map(([name, val]) => `${name}|${val.toFixed(2)}`)
                .join(';;');

            // Customer column:
            // - If ownjob is subjob in a lead branch => include that branch parent job name.
            // - If ownjob is lead/root in a lead branch => include external customers.
            // - If both exist across branches => include both sets (deduped).
            const stripLeadPrefix = (s) => String(s || '').replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim();
            const finalCustomerSet = new Set();
            const userDivisionKey = userEmail ? userEmail.split('@')[0].toLowerCase() : '';
            const withLeadCode = (name, code) => {
                const base = (name || '').replace(/,\s*$/, '').trim();
                const c = String(code || '').trim().toUpperCase();
                if (!base) return '';
                if (!c || !/^L\d+$/.test(c)) return base;
                return `${base} (${c})`;
            };
            const anchorJobs = userEmail && accessCtx && accessCtx.user
                ? getPricingAnchorJobs(enqJobs, accessCtx, userEmail)
                : enqJobs.filter(j => !j.ParentID || j.ParentID == '0' || j.ParentID == 0);
            const ownDeptClean = stripLeadPrefix(userDepartment || '');
            const ownDeptNorm = normalize(ownDeptClean);
            let hasOwnAsLeadInAnyBranch = false;
            let hasOwnAsSubjobInAnyBranch = false;
            const ownLeadCodes = new Set();     // lead codes where ownjob is root
            const ownSubjobLeadCodes = new Set(); // lead codes where ownjob is subjob

            const childrenByParent = {};
            enqJobs.forEach((j) => {
                const pid = j.ParentID;
                if (pid == null || pid === '' || pid === '0' || pid === 0) return;
                const key = String(pid);
                if (!childrenByParent[key]) childrenByParent[key] = [];
                childrenByParent[key].push(j);
            });

            const rootsForBranchCheck = enqJobs.filter(j => !j.ParentID || j.ParentID == '0' || j.ParentID == 0);
            const collectBranchJobs = (root) => {
                const out = [];
                const stack = [root];
                const seen = new Set();
                while (stack.length > 0) {
                    const cur = stack.pop();
                    const cid = String(cur.ID);
                    if (seen.has(cid)) continue;
                    seen.add(cid);
                    out.push(cur);
                    const kids = childrenByParent[cid] || [];
                    kids.forEach(k => stack.push(k));
                }
                return out;
            };

            rootsForBranchCheck.forEach((root) => {
                const branchJobs = collectBranchJobs(root);
                const ownNodes = branchJobs.filter((j) => normalize(stripLeadPrefix(j.ItemName || '')) === ownDeptNorm);
                if (ownNodes.length === 0) return;
                ownNodes.forEach((ownNode) => {
                    const pid = ownNode.ParentID;
                    const rootLeadCode = String(root.LeadJobCode || '').trim().toUpperCase();
                    const isLead = (pid == null || pid === '' || pid === '0' || pid === 0);
                    if (isLead) {
                        hasOwnAsLeadInAnyBranch = true;
                        if (/^L\d+$/.test(rootLeadCode)) ownLeadCodes.add(rootLeadCode);
                        return;
                    }
                    hasOwnAsSubjobInAnyBranch = true;
                    if (/^L\d+$/.test(rootLeadCode)) ownSubjobLeadCodes.add(rootLeadCode);
                    const parent = enqJobs.find(pj => String(pj.ID) === String(pid));
                    if (!parent || !parent.ItemName) return;
                    const label = stripLeadPrefix(parent.ItemName) || String(parent.ItemName).trim();
                    const leadCode = (() => {
                        const raw = (root.LeadJobCode || ownNode.LeadJobCode || parent.LeadJobCode || '').toString().trim().toUpperCase();
                        return /^L\d+$/.test(raw) ? raw : '';
                    })();
                    const displayLabel = withLeadCode(label, leadCode);
                    if (displayLabel && (!userDivisionKey || !normalize(displayLabel).includes(userDivisionKey))) {
                        finalCustomerSet.add(displayLabel);
                    }
                });
            });

            if (hasOwnAsLeadInAnyBranch || (!hasOwnAsSubjobInAnyBranch && finalCustomerSet.size === 0)) {
                const leadCodes = Array.from(ownLeadCodes);
                externalCustomers.forEach((c) => {
                    if (!c) return;
                    if (leadCodes.length === 0) {
                        if (!userDivisionKey || !normalize(c).includes(userDivisionKey)) finalCustomerSet.add(c);
                        return;
                    }
                    leadCodes.forEach((lc) => {
                        const disp = withLeadCode(c, lc);
                        if (disp && (!userDivisionKey || !normalize(disp).includes(userDivisionKey))) {
                            finalCustomerSet.add(disp);
                        }
                    });
                });
            }

            // Fail-safe: always include parent names of visible subjob anchors (same rule as quote customer dropdown).
            // This avoids missing parent customers when department text does not exactly match EnquiryFor item labels.
            anchorJobs.forEach((job) => {
                if (!job.ParentID || job.ParentID == '0' || job.ParentID == 0) return;
                const parent = enqJobs.find((pj) => String(pj.ID) === String(job.ParentID));
                if (!parent || !parent.ItemName) return;
                const label = stripLeadPrefix(parent.ItemName) || String(parent.ItemName).trim();
                const leadCode = (() => {
                    const code = String(job.LeadJobCode || parent.LeadJobCode || '').trim().toUpperCase();
                    if (ownSubjobLeadCodes.size === 0) return code;
                    return ownSubjobLeadCodes.has(code) ? code : '';
                })();
                const displayLabel = withLeadCode(label, leadCode);
                if (displayLabel && (!userDivisionKey || !normalize(displayLabel).includes(userDivisionKey))) {
                    finalCustomerSet.add(displayLabel);
                }
            });

            const finalCustomersRaw = Array.from(finalCustomerSet);
            const finalCustomers = [];
            const seenBase = new Set();
            finalCustomersRaw.forEach((name) => {
                const base = String(name || '').replace(/\s*\(L\d+\)\s*$/i, '').trim().toLowerCase();
                if (!base || seenBase.has(base)) return;
                seenBase.add(base);
                finalCustomers.push(name);
            });

            const fullCustomerName = finalCustomers.join(', ');

            if (enq.RequestNo == '51') {
                console.log(`[DEBUG 51] Root: ${internalCustomer}, External:`, externalCustomers);
                console.log(`[DEBUG 51] JobSet:`, Array.from(jobNameSetNorm));
                console.log(`[DEBUG 51] Final Customer Set:`, Array.from(finalCustomerSet));
                console.log(`[DEBUG 51] Final Customers Array:`, finalCustomers);
                console.log(`[DEBUG 51] Final Pricing Str:`, finalPricingStr);
            }

            // Latest-quote own job: sum base prices for that EnquiryFor node + all descendants (same selfPrices rules as Subjob Prices column).
            // Prefer the pending-list tuple (PV) so ref/date/summary align with the row, not another branch on the enquiry.
            const pendingOwnItem = (enq.ListPendingOwnJobItem ?? enq.listpendingownjobitem ?? '').toString().trim();
            const ownJobFromQuote = pendingOwnItem || (enq.ListQuoteOwnJob ?? enq.listquoteownjob ?? '').toString().trim();
            const savedTotalRaw = enq.ListQuoteTotalAmount ?? enq.listquotetotalamount;
            const savedQuoteTotal = savedTotalRaw != null && !Number.isNaN(parseFloat(savedTotalRaw))
                ? parseFloat(savedTotalRaw)
                : null;
            const ownJobNormFromQuote = normalize(stripLeadPrefix(ownJobFromQuote));
            let quoteOwnJobNode = null;
            if (ownJobNormFromQuote) {
                quoteOwnJobNode = enqJobs.find((j) => normalize(stripLeadPrefix(j.ItemName || '')) === ownJobNormFromQuote);
            }
            if (!quoteOwnJobNode && ownJobFromQuote) {
                const low = ownJobFromQuote.toLowerCase();
                quoteOwnJobNode = enqJobs.find((j) => String(j.ItemName || '').trim().toLowerCase() === low);
            }
            if (!quoteOwnJobNode && ownJobNormFromQuote && ownJobNormFromQuote.length >= 2) {
                quoteOwnJobNode = enqJobs.find((j) => {
                    const jn = normalize(String(j.ItemName || ''));
                    return jn.includes(ownJobNormFromQuote) || ownJobNormFromQuote.includes(jn);
                });
            }
            const quoteBranchJobIds = new Set();
            const collectQuoteBranch = (jid) => {
                const s = String(jid);
                if (quoteBranchJobIds.has(s)) return;
                quoteBranchJobIds.add(s);
                const kids = stringChildrenMap[s] || [];
                kids.forEach((c) => collectQuoteBranch(c.ID));
            };
            if (quoteOwnJobNode) collectQuoteBranch(quoteOwnJobNode.ID);
            let quoteBranchBaseSum = 0;
            quoteBranchJobIds.forEach((idStr) => {
                const nid = Number(idStr);
                const v = selfPrices[nid] !== undefined ? selfPrices[nid] : selfPrices[idStr];
                quoteBranchBaseSum += parseFloat(v || 0) || 0;
            });

            const listRefRaw = enq.ListQuoteRef ?? enq.listquoteref;
            const listRef = listRefRaw != null && String(listRefRaw).trim() !== '' ? String(listRefRaw).trim() : '';

            let listQuoteUnderRefTotal = null;
            if (quoteOwnJobNode) {
                // Always use pricing roll-up for this job + subjobs when the node is known (avoids wrong single-line SQL totals).
                listQuoteUnderRefTotal = quoteBranchBaseSum > 0 ? quoteBranchBaseSum : null;
            } else if (savedQuoteTotal != null && savedQuoteTotal > 0) {
                listQuoteUnderRefTotal = savedQuoteTotal;
            }
            // Do not show a roll-up amount in the "Quote ref." column when there is no quote number yet (pending / no draft row match).
            if (!listRef) {
                listQuoteUnderRefTotal = null;
            }

            const listDtRaw = enq.ListQuoteDate ?? enq.listquotedate;
            const listPbRaw = enq.ListPreparedBy ?? enq.listpreparedby;
            const listPreparedBy = listPbRaw != null && String(listPbRaw).trim() !== '' ? String(listPbRaw).trim() : '';

            return {
                RequestNo: enq.RequestNo,
                ListPendingPvId: enq.ListPendingPvId ?? enq.listpendingpvid ?? null,
                ProjectName: enq.ProjectName,
                ListQuoteRef: listRef,
                ListQuoteDate: listDtRaw != null && listDtRaw !== '' ? listDtRaw : null,
                ListQuoteUnderRefTotal: listQuoteUnderRefTotal,
                ListPreparedBy: listPreparedBy,
                CustomerName: fullCustomerName,
                PricingCustomerDetails: finalPricingStr,
                ClientName: enq.ClientName || enq.clientname || '-',
                ConsultantName: enq.ConsultantName || enq.consultantname || '-',
                EnquiryDate: enq.EnquiryDate,
                DueDate: enq.DueDate,
                Status: enq.Status,
                Divisions: enq.Divisions,
                QuotedCustomers: enq.QuotedCustomers,
                SubJobPrices: subJobPrices
            };
        }).filter(Boolean);

        // Second pass: collapse rows that present identically (join fan-out, subtle string drift on tuple fields).
        const normKey = (s) =>
            String(s ?? '')
                .replace(/\s+/g, ' ')
                .trim()
                .toLowerCase();
        const dueIso = (d) => {
            if (d == null || d === '') return '';
            const t = new Date(d).getTime();
            return Number.isNaN(t) ? normKey(String(d)) : new Date(t).toISOString().slice(0, 10);
        };
        const presentationKey = (row) =>
            [
                normKey(row.RequestNo),
                dueIso(row.DueDate),
                normKey(row.ProjectName),
                normKey(row.ListQuoteRef),
                normKey(row.CustomerName),
                String(row.SubJobPrices ?? ''),
            ].join('\u0001');
        const seenPres = new Set();
        const mappedDeduped = [];
        for (const row of mappedEnquiries) {
            const pk = presentationKey(row);
            if (seenPres.has(pk)) continue;
            seenPres.add(pk);
            mappedDeduped.push(row);
        }

        let finalMapped = mappedDeduped;
        if (userEmail && accessCtx && !accessCtx.isAdmin) {
            finalMapped = mappedDeduped.map(enq => {
                const accessRule = accessCtx.isCcUser ? 'cc_coordinator' : 'concerned_se';
                return { ...enq, AccessRule: accessRule };
            });
        }
    if (finalMapped.length > 0) {
        console.log(`[API] mapQuoteListingRows sample:`, {
        ReqNo: finalMapped[0].RequestNo,
        SubJobPricesLen: finalMapped[0].SubJobPrices?.length,
        });
    }
    return finalMapped;
}

module.exports = mapQuoteListingRows;

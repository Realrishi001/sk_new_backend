import { Op } from "sequelize";
import { tickets } from "../models/ticket.model.js";
import { winningNumbers } from "../models/winningNumbers.model.js";
import { winningPercentage } from "../models/winningPercentage.model.js";
import Admin from "../models/admins.model.js";

const POINTS_PER_QUANTITY = 180;

// ------------------ FORMAT DRAW TIME --------------------
const formatDrawTime = (time) => {
  if (!time) return "";
  let clean = String(time).trim().toUpperCase();
  clean = clean.replace(/(AM|PM)/, " $1").trim();

  const match = clean.match(/^(\d{1,2})[:.]?(\d{0,2})?\s*(AM|PM)$/);
  if (!match) return clean;

  let [, h, m, p] = match;
  h = String(h).padStart(2, "0");
  m = m ? String(m).padStart(2, "0") : "00";

  return `${h}:${m} ${p}`;
};

const getSeriesFromNumber = (num) => {
  const n = String(num);
  const prefix = Number(n.substring(0, 2));

  if (prefix >= 10 && prefix <= 19) return "10";
  if (prefix >= 30 && prefix <= 39) return "30";
  if (prefix >= 50 && prefix <= 59) return "50";

  return null;
};

const reorderAvoidSameSeries = (arr) => {
  // Group by series
  let series10 = arr.filter(x => getSeriesFromNumber(x.number) === "10");
  let series30 = arr.filter(x => getSeriesFromNumber(x.number) === "30");
  let series50 = arr.filter(x => getSeriesFromNumber(x.number) === "50");

  let output = [];
  let lastSeries = null;

  while (output.length < arr.length) {

    // choose next series different from last used
    let choices = [];
    if (lastSeries !== "10" && series10.length) choices.push("10");
    if (lastSeries !== "30" && series30.length) choices.push("30");
    if (lastSeries !== "50" && series50.length) choices.push("50");

    // if only same series left, allow it (fallback)
    if (choices.length === 0) {
      if (series10.length) choices.push("10");
      if (series30.length) choices.push("30");
      if (series50.length) choices.push("50");
    }

    // pick one randomly from choices
    const pick = choices[Math.floor(Math.random() * choices.length)];
    let item = null;

    if (pick === "10") item = series10.shift();
    if (pick === "30") item = series30.shift();
    if (pick === "50") item = series50.shift();

    output.push(item);
    lastSeries = pick;
  }

  return output;
};


// ------------------ PARSE TICKETS -----------------------
// returns a map { number: qty } (aggregated)
const parseTicketNumberToMap = (ticketStr) => {
  const map = {};
  if (!ticketStr) return map;

  try {
    if (typeof ticketStr === "string" && ticketStr.startsWith("[") && ticketStr.endsWith("]")) {
      const arr = JSON.parse(ticketStr);
      arr.forEach(({ ticketNumber, quantity }) => {
        if (ticketNumber || ticketNumber === 0) {
          const key = String(ticketNumber).replace(/-/g, "");
          map[key] = (map[key] || 0) + Number(quantity || 0);
        }
      });
    } else if (Array.isArray(ticketStr)) {
      ticketStr.forEach(({ ticketNumber, quantity }) => {
        if (ticketNumber || ticketNumber === 0) {
          const key = String(ticketNumber).replace(/-/g, "");
          map[key] = (map[key] || 0) + Number(quantity || 0);
        }
      });
    } else {
      const parts = String(ticketStr).split(",").map((x) => x.trim()).filter(Boolean);
      for (let p of parts) {
        const [num, qty] = p.split(":").map((s) => s.trim());
        if (!num) continue;
        const number = String(num).replace(/-/g, "");
        const quantity = Number(qty || 0);
        map[number] = (map[number] || 0) + quantity;
      }
    }
  } catch (err) {
    console.log("Parse error:", err);
  }
  return map;
};

// returns an array preserving order: [{ ticketNumber, quantity }, ...]
const parseTicketNumberToArray = (ticketStr) => {
  const arrOut = [];
  if (!ticketStr) return arrOut;

  try {
    if (typeof ticketStr === "string" && ticketStr.startsWith("[") && ticketStr.endsWith("]")) {
      const arr = JSON.parse(ticketStr);
      arr.forEach((it) => {
        if (it && (it.ticketNumber || it.ticketNumber === 0)) {
          const tn = String(it.ticketNumber).replace(/-/g, "");
          const qty = Number(it.quantity || 0);
          arrOut.push({ ticketNumber: tn, quantity: qty });
        }
      });
    } else if (Array.isArray(ticketStr)) {
      ticketStr.forEach((it) => {
        if (it && (it.ticketNumber || it.ticketNumber === 0)) {
          const tn = String(it.ticketNumber).replace(/-/g, "");
          const qty = Number(it.quantity || 0);
          arrOut.push({ ticketNumber: tn, quantity: qty });
        }
      });
    } else {
      // string like "3010:2,3110:3"
      const parts = String(ticketStr).split(",").map((x) => x.trim()).filter(Boolean);
      for (let p of parts) {
        const [num, qty] = p.split(":").map((s) => s.trim());
        if (!num) continue;
        const number = String(num).replace(/-/g, "");
        const quantity = Number(qty || 0);
        arrOut.push({ ticketNumber: number, quantity });
      }
    }
  } catch (err) {
    console.log("Parse order error:", err);
  }

  return arrOut;
};

// ------------------ DETERMINE SERIES --------------------
const getSeriesKeyFromNumber = (numStr) => {
  if (!numStr || numStr.length < 2) return null;
  const firstTwo = Number(numStr.substring(0, 2));
  if (firstTwo >= 10 && firstTwo <= 19) return "10";
  if (firstTwo >= 30 && firstTwo <= 39) return "30";
  if (firstTwo >= 50 && firstTwo <= 59) return "50";
  return null;
};

// ------------------ RANDOM SERIES NUMBER -----------------
const genRandomInSeries = (seriesKey) => {
  let allowed = [];
  if (seriesKey === "10") {
    for (let i = 10; i <= 19; i++) allowed.push(i);
  } else if (seriesKey === "30") {
    for (let i = 30; i <= 39; i++) allowed.push(i);
  } else if (seriesKey === "50") {
    for (let i = 50; i <= 59; i++) allowed.push(i);
  }

  const prefix = allowed[Math.floor(Math.random() * allowed.length)];
  const suffix = Math.floor(Math.random() * 100)
    .toString()
    .padStart(2, "0");

  return prefix.toString() + suffix;
};

// ------------------ COUNT PURCHASED IN SERIES ------------
const countPurchasedInSeries = (seriesKey, purchasedSet) => {
  let c = 0;
  for (let n of purchasedSet) {
    if (getSeriesKeyFromNumber(n) === seriesKey) c++;
  }
  return c;
};


const fillSeriesWithRules = (seriesKey, initialArr, purchasedSet, usedWinners) => {
  const result = [...initialArr];
  const present = new Set(result.map((r) => String(r.number)));
  const purchasedCount = countPurchasedInSeries(seriesKey, purchasedSet);
  const allowRepeats = purchasedCount >= 1000;
  
  const seriesStart = seriesKey === "10" ? 10 : seriesKey === "30" ? 30 : 50;
  
  // First, ensure all initial winners are from the correct series
  const validatedInitial = initialArr.filter(item => {
    const series = getSeriesKeyFromNumber(item.number);
    return series === seriesKey;
  });
  
  result.length = 0; // Clear array
  validatedInitial.forEach(item => {
    result.push(item);
    present.add(String(item.number));
  });

  // Get used prefixes in this series
  const usedPrefixes = new Set();
  result.forEach(item => {
    const prefix = Math.floor(Number(item.number) / 100);
    usedPrefixes.add(prefix);
  });

  // Generate missing numbers ensuring one from each prefix
  const allPrefixes = [];
  for (let i = 0; i < 10; i++) {
    allPrefixes.push(seriesStart + i);
  }

  // Shuffle prefixes for randomness
  for (let i = allPrefixes.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allPrefixes[i], allPrefixes[j]] = [allPrefixes[j], allPrefixes[i]];
  }

  // Fill missing prefixes first
  for (let prefix of allPrefixes) {
    if (result.length >= 10) break;
    if (usedPrefixes.has(prefix)) continue;

    let candidate;
    let tries = 0;
    const MAX_TRIES = 100;

    do {
      const suffix = Math.floor(Math.random() * 100).toString().padStart(2, "0");
      candidate = String(prefix).padStart(2, "0") + suffix;
      tries++;
    } while (
      (present.has(candidate) || 
       (!allowRepeats && purchasedSet.has(candidate)) ||
       usedWinners.has(candidate)) && 
      tries < MAX_TRIES
    );

    if (tries < MAX_TRIES) {
      result.push({ number: candidate, quantity: 0, value: 0 });
      present.add(candidate);
      usedWinners.add(candidate);
      usedPrefixes.add(prefix);
    }
  }

  // If still not full, fill with any available numbers in the series
  let tries = 0;
  const MAX_TRIES = 30000;

  while (result.length < 10 && tries < MAX_TRIES) {
    tries++;
    const candidate = genRandomInSeries(seriesKey);
    
    if (present.has(candidate)) continue;

    if (!purchasedSet.has(candidate) && !usedWinners.has(candidate)) {
      result.push({ number: candidate, quantity: 0, value: 0 });
      present.add(candidate);
      usedWinners.add(candidate);
      continue;
    }

    if (allowRepeats && !present.has(candidate)) {
      result.push({ number: candidate, quantity: 0, value: 0 });
      present.add(candidate);
    }
  }

  // Final deterministic fallback
  if (result.length < 10) {
    for (let ft = seriesStart; ft <= seriesStart + 9 && result.length < 10; ft++) {
      for (let lt = 0; lt <= 99 && result.length < 10; lt++) {
        const cand = String(ft).padStart(2, "0") + String(lt).padStart(2, "0");
        
        if (!present.has(cand)) {
          if (!purchasedSet.has(cand) || allowRepeats) {
            result.push({ number: cand, quantity: 0, value: 0 });
            present.add(cand);
          }
        }
      }
    }
  }

  return result;
};




// ------------------ VALIDATE FINAL RESULT ------------------
const validateFinalResult = (finalResult) => {
  const errors = [];
  
  // Check total count
  if (finalResult.length !== 30) {
    errors.push(`Expected 30 numbers, got ${finalResult.length}`);
  }

  // Check series distribution
  const seriesCount = { "10": 0, "30": 0, "50": 0 };
  const prefixesUsed = {
    "10": new Set(), // Will track 10,11,12...19
    "30": new Set(), // Will track 30,31,32...39  
    "50": new Set()  // Will track 50,51,52...59
  };
  
  finalResult.forEach(item => {
    const series = getSeriesKeyFromNumber(item.number);
    if (series && seriesCount[series] !== undefined) {
      seriesCount[series]++;
      // Track the specific prefix used
      const prefix = Math.floor(Number(item.number) / 100);
      prefixesUsed[series].add(prefix);
    } else {
      errors.push(`Invalid series for number: ${item.number}`);
    }
  });

  // Check each series has exactly 10 numbers
  Object.entries(seriesCount).forEach(([series, count]) => {
    if (count !== 10) {
      errors.push(`Series ${series} has ${count} numbers, expected 10`);
    }
  });

  // Check that each series uses all 10 required prefixes
  Object.entries(prefixesUsed).forEach(([series, prefixSet]) => {
    const expectedPrefixes = series === "10" ? 10 : series === "30" ? 10 : 10;
    if (prefixSet.size !== expectedPrefixes) {
      errors.push(`Series ${series} has ${prefixSet.size} unique prefixes, expected ${expectedPrefixes}`);
    }
  });

  // Validate number ranges
  finalResult.forEach(item => {
    const num = parseInt(item.number);
    const firstTwo = Math.floor(num / 100);
    
    if (!(
      (firstTwo >= 10 && firstTwo <= 19) ||
      (firstTwo >= 30 && firstTwo <= 39) || 
      (firstTwo >= 50 && firstTwo <= 59)
    )) {
      errors.push(`Number ${item.number} is outside valid series ranges`);
    }
  });

  if (errors.length > 0) {
    console.error("VALIDATION ERRORS:", errors);
    throw new Error(`Result validation failed: ${errors.join(", ")}`);
  }

  console.log("✅ Final result validation passed");
  return true;
};

// ------------------ RANDOM FULL RESULT (no tickets) -----------
// ------------------ RANDOM FULL RESULT (no tickets) -----------
const generateRandomFullResult = async (normalized, drawDate) => {
  const generateSeriesNumbers = (seriesStart) => {
    const numbers = [];
    const prefixes = [];
    
    // Generate all required prefixes for this series
    for (let i = 0; i < 10; i++) {
      prefixes.push(seriesStart + i);
    }
    
    // Shuffle prefixes to randomize order
    for (let i = prefixes.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [prefixes[i], prefixes[j]] = [prefixes[j], prefixes[i]];
    }
    
    // Generate one number for each prefix
    for (let prefix of prefixes) {
      let candidate;
      let tries = 0;
      const MAX_TRIES = 100;
      
      do {
        const suffix = Math.floor(Math.random() * 100).toString().padStart(2, "0");
        candidate = String(prefix).padStart(2, "0") + suffix;
        tries++;
      } while (numbers.some(n => n.number === candidate) && tries < MAX_TRIES);
      
      numbers.push({ 
        number: candidate, 
        quantity: 0, 
        value: 0 
      });
    }
    
    return numbers;
  };

  const finalResult = [
    ...generateSeriesNumbers(10), // 10-19
    ...generateSeriesNumbers(30), // 30-39
    ...generateSeriesNumbers(50)  // 50-59
  ];

  // ✅ ADD VALIDATION HERE
  console.log("🔍 Validating random full result...");
  validateFinalResult(finalResult);

  await winningNumbers.create({
    loginId: 0,
    winningNumbers: finalResult,
    totalPoints: 0,
    DrawTime: normalized,
    drawDate,
  });

  console.log("🎲 RANDOM RESULT SAVED (no tickets found)");
  return finalResult;
};
// ------------------ CASE 5: LOGIN-ID PRIORITY --------------
async function runCase5_LoginIdPriority({ priorityLoginIds, normalized, drawDate }) {
  console.log(`➡ CASE 5: PRIORITIZING loginIds = ${priorityLoginIds.join(", ")}`);

  // fetch today's tickets (with required fields)
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date();   end.setHours(23, 59, 59, 999);

  const allTickets = await tickets.findAll({
    where: { createdAt: { [Op.between]: [start, end] } },
    attributes: ["id", "ticketNumber", "totalPoints", "totalQuatity", "loginId", "drawTime"],
  });

  // filter by drawTime
  const filtered = allTickets.filter((t) => {
    try {
      const times = Array.isArray(t.drawTime) ? t.drawTime : JSON.parse(t.drawTime);
      return times.map((x) => formatDrawTime(x)).includes(normalized);
    } catch {
      return false;
    }
  });

  if (!filtered.length) {
    console.log("⚠ CASE 5: No tickets found for this drawTime → saving random result");
    const rr = await generateRandomFullResult(normalized, drawDate);
    return { finalResult: rr, caseUsed: 5, totalPoints: 0 };
  }

  // totals + pool
  const totalPoints = filtered.reduce((sum, t) => sum + Number(t.totalPoints || 0), 0);
  const latest = await winningPercentage.findOne({ order: [["createdAt", "DESC"]] });
  const winningPercent = latest ? Number(latest.percentage) : 0;
  const winningPool = Math.floor((totalPoints * winningPercent) / 100);
  let qtyCapacity = Math.floor(winningPool / POINTS_PER_QUANTITY);

  console.log(`CASE5 Winning Pool: ${winningPool}, qtyCapacity: ${qtyCapacity}`);

  // Build totals map (for purchasedSet later)
  const totals = {};
  for (let t of filtered) {
    const parsed = parseTicketNumberToMap(t.ticketNumber);
    for (let [num, qty] of Object.entries(parsed)) {
      totals[num] = (totals[num] || 0) + qty;
    }
  }
  const purchasedSet = new Set(Object.keys(totals));

  // We'll collect winners here
  const winners = [];

  // Step A: iterate priorityLoginIds in the order returned by the DB (we will pass them in desired order)
  for (let pid of priorityLoginIds) {
    // get tickets for this loginId in DB order (preserve their ticket rows order)
    const priorityTickets = filtered.filter((t) => String(t.loginId) === String(pid));
    console.log(`CASE5: processing priority loginId ${pid} with ${priorityTickets.length} tickets`);

    for (let t of priorityTickets) {
      console.log(`Checking PRIORITY Ticket ID ${t.id}, totalQuatity: ${t.totalQuatity}`);
      const arr = parseTicketNumberToArray(t.ticketNumber);

      for (let ent of arr) {
        const num = String(ent.ticketNumber);
        const qty = Number(ent.quantity || 0);

        console.log(`Checking number ${num} (qty: ${qty}) from Ticket ${t.id}`);

        if (qty > 0 && qty <= qtyCapacity && !winners.some((w) => w.number === num)) {
          winners.push({
            number: num,
            quantity: qty,
            value: qty * POINTS_PER_QUANTITY,
            fromTicketId: t.id,
            fromLoginId: t.loginId,
          });
          qtyCapacity -= qty;
          console.log(`Winner added (PRIORITY ${pid}): ${num} from Ticket ${t.id} → remaining capacity ${qtyCapacity}`);
        }

        if (qtyCapacity <= 0) break;
      }
      if (qtyCapacity <= 0) break;
    }
    if (qtyCapacity <= 0) break;
  }

  // Step B: if capacity > 0, fallback to non-priority tickets (same as before)
  if (qtyCapacity > 0) {
    console.log("CASE5 fallback → checking other tickets");
    const otherTickets = filtered.filter((t) => !priorityLoginIds.includes(String(t.loginId)));

    for (let t of otherTickets) {
      console.log(`Checking OTHER Ticket ID ${t.id}, totalQuatity: ${t.totalQuatity}`);
      const arr = parseTicketNumberToArray(t.ticketNumber);

      for (let ent of arr) {
        const num = String(ent.ticketNumber);
        const qty = Number(ent.quantity || 0);

        console.log(`Checking number ${num} (qty: ${qty}) from Ticket ${t.id}`);

        if (qty > 0 && qty <= qtyCapacity && !winners.some((w) => w.number === num)) {
          winners.push({
            number: num,
            quantity: qty,
            value: qty * POINTS_PER_QUANTITY,
            fromTicketId: t.id,
            fromLoginId: t.loginId,
          });
          qtyCapacity -= qty;
          console.log(`Winner added (FALLBACK): ${num} from Ticket ${t.id} → remaining capacity ${qtyCapacity}`);
        }

        if (qtyCapacity <= 0) break;
      }

      if (qtyCapacity <= 0) break;
    }
  }

  // Now use series-fill with present winners (same as before)
  const usedWinners = new Set(winners.map((w) => String(w.number)));
  const seriesBuckets = { "10": [], "30": [], "50": [] };
  winners.forEach((w) => {
    const k = getSeriesKeyFromNumber(w.number);
    if (k) seriesBuckets[k].push({ number: String(w.number), quantity: Number(w.quantity || 0), value: Number(w.value || 0) });
  });

  const final10 = fillSeriesWithRules("10", seriesBuckets["10"], purchasedSet, usedWinners);
  const final30 = fillSeriesWithRules("30", seriesBuckets["30"], purchasedSet, usedWinners);
  const final50 = fillSeriesWithRules("50", seriesBuckets["50"], purchasedSet, usedWinners);

const finalResult = [...final10, ...final30, ...final50].sort((a, b) => Number(a.number) - Number(b.number));

// ✅ STEP 5: ADD VALIDATION HERE
console.log("🔍 Validating final result (Case 5)...");
validateFinalResult(finalResult);
// ✅ END OF VALIDATION

// Save result
await winningNumbers.create({
  loginId: 0,
  winningNumbers: finalResult,
  totalPoints,
  DrawTime: normalized,
  drawDate,
});

  console.log("🎉 CASE 5 RESULT SAVED (multi-priority)");

  return { finalResult, caseUsed: 5, totalPoints };
}


const selectLowestWinners = (sortedByQtyAsc, qtyCapacityTarget) => {
  let winners = [];
  let used = new Set();

  for (let item of sortedByQtyAsc) {
    const num = item.number;
    const qty = item.qty;

    if (qty <= qtyCapacityTarget && !used.has(num)) {
      winners.push({
        number: num,
        quantity: qty,
        value: qty * POINTS_PER_QUANTITY
      });

      qtyCapacityTarget -= qty;
      used.add(num);
    }

    if (qtyCapacityTarget <= 0) break;
  }

  return winners;
};


// ------------------ MAIN CONTROLLER ----------------------
export const manualGenerateWinningNumbers = async (req, res) => {
  try {
    const { drawTime, drawDate, loginId } = req.body;

    if (!drawTime || !drawDate)
      return res.status(400).json({ message: "Both drawTime and drawDate are required." });

    const normalized = formatDrawTime(drawTime);
    console.log(`Formatted Draw Time: ${normalized}`);

    // ---------- DUPLICATE CHECK (do this BEFORE any case-run / DB priority logic) ----------
    const already = await winningNumbers.findOne({ where: { DrawTime: normalized, drawDate } });
    if (already) {
      console.log(`Result already exists for ${normalized}`);
      return res.status(400).json({ message: `Result already exists for ${normalized}` });
    }

    // If loginId provided → run case 5 (manual override)
    if (loginId) {
      const out = await runCase5_LoginIdPriority({ priorityLoginIds: [String(loginId)], normalized, drawDate });
      return res.status(200).json({
        message: "Winning numbers saved (Login-ID Priority manual)",
        winning: out.finalResult,
        caseUsed: out.caseUsed,
      });
    }

    // AUTO / SCHEDULED: check DB Admin.priorWinning for priority users
    // Ordering chosen by you: Option B -> Admin.id DESC (highest ID first)
    const priorityAdmins = await Admin.findAll({
      where: { priorWinning: true },
      attributes: ["id"],
      order: [["id", "DESC"]], // Option B
    });

    const priorityLoginIds = priorityAdmins.map((a) => String(a.id));

    // if any priority admins present, run Case-5 using all of them (in DB order chosen)
    if (priorityLoginIds.length > 0) {
      console.log(`Auto CASE 5 triggered by DB priority admins: ${priorityLoginIds.join(", ")}`);
      const out = await runCase5_LoginIdPriority({ priorityLoginIds, normalized, drawDate });
      return res.status(200).json({
        message: "Winning numbers saved (Login-ID Priority from DB)",
        winning: out.finalResult,
        caseUsed: out.caseUsed,
      });
    }

    // Otherwise choose random case 1..4
    const totalCases = 4;
    const win_case = Math.floor(Math.random() * totalCases) + 1;
    console.log(`🎲 Using CASE ${win_case} for winner selection`);

    // Fetch today's tickets (include id and totalQuatity)
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const allTickets = await tickets.findAll({
      where: { createdAt: { [Op.between]: [start, end] } },
      attributes: ["id", "ticketNumber", "totalPoints", "totalQuatity", "drawTime"],
    });

    console.log(`Total tickets fetched: ${allTickets.length}`);

    // Filter by draw time
    const filtered = allTickets.filter((t) => {
      try {
        const times = Array.isArray(t.drawTime) ? t.drawTime : JSON.parse(t.drawTime);
        console.log("Ticket drawTime:", times);
        return times.map((x) => formatDrawTime(x)).includes(normalized);
      } catch (err) {
        console.log("Error filtering ticket:", err);
        return false;
      }
    });

    console.log(`Filtered tickets for ${normalized}: ${filtered.length}`);

    if (!filtered.length) {
      // If no tickets, save random full series (preserve old behavior)
      const rr = await generateRandomFullResult(normalized, drawDate);
      return res.status(200).json({
        message: "Random result saved (no tickets found)",
        winning: rr,
        caseUsed: "random",
      });
    }

    // Total Points
    const totalPoints = filtered.reduce((sum, t) => sum + Number(t.totalPoints || 0), 0);
    console.log(`Total points calculated: ${totalPoints}`);

    // Winning pool and capacity
    const latest = await winningPercentage.findOne({ order: [["createdAt", "DESC"]] });
    const winningPercent = latest ? Number(latest.percentage) : 0;
    const winningPool = Math.floor((totalPoints * winningPercent) / 100);
    let qtyCapacity = Math.floor(winningPool / POINTS_PER_QUANTITY);

    console.log(`Winning Pool: ${winningPool}, Quantity Capacity: ${qtyCapacity}`);

    // Build aggregated totals from all tickets (map number->totalQty)
    const totals = {};
    for (let t of filtered) {
      const parsed = parseTicketNumberToMap(t.ticketNumber);
      for (let [num, qty] of Object.entries(parsed)) {
        totals[num] = (totals[num] || 0) + qty;
      }
    }

    console.log("Ticket totals:", totals);

    // Sort aggregated numbers by quantity desc (Case 1 base)
    const sortedByQty = Object.entries(totals)
      .map(([number, qty]) => ({ number, qty }))
      .sort((a, b) => b.qty - a.qty);

    console.log("Sorted by quantity:", sortedByQty);

    // Prepare purchase-power sorted tickets (desc)
    const sortedByPurchasePower = [...filtered].sort((a, b) => Number(b.totalQuatity) - Number(a.totalQuatity));

    // ---------------------------------------------------------
    // ---------------- WINNER SELECTION (cases 1..4) ----------
    // ---------------------------------------------------------
    let winners = [];

    // CASE 1: quantity-based aggregated
    if (win_case === 1) {
      console.log("➡ CASE 1: Standard quantity-based selection");

      if (qtyCapacity > 0) {
        for (let item of sortedByQty) {
          console.log(`Checking ticket: ${item.number}, Quantity: ${item.qty}`);

          if (item.qty <= qtyCapacity) {
            if (!winners.some((w) => w.number === item.number)) {
              winners.push({
                number: item.number,
                quantity: item.qty,
                value: item.qty * POINTS_PER_QUANTITY,
              });
              qtyCapacity -= item.qty;
              console.log(`Winner added: ${item.number}, Remaining capacity: ${qtyCapacity}`);
            }
          }

          if (qtyCapacity <= 0) break;
        }
      }
    }

    // CASE 2: Highest purchaser (ticket-by-ticket desc)
    if (win_case === 2) {
      console.log("➡ CASE 2: Highest purchaser (totalQuatity) priority");

      for (let ticketRow of sortedByPurchasePower) {
        const ticketArray = parseTicketNumberToArray(ticketRow.ticketNumber);
        console.log(`Checking Ticket ID ${ticketRow.id}, totalQuatity: ${ticketRow.totalQuatity}`);

        for (let entry of ticketArray) {
          const num = String(entry.ticketNumber);
          const qty = Number(entry.quantity || 0);

          console.log(`Checking number ${num} (qty: ${qty}) from Ticket ID ${ticketRow.id}`);

          if (winners.some((w) => w.number === num)) {
            console.log(`Skipping ${num}: already selected as winner`);
            continue;
          }

          if (qty > 0 && qty <= qtyCapacity) {
            winners.push({
              number: num,
              quantity: qty,
              value: qty * POINTS_PER_QUANTITY,
              fromTicketId: ticketRow.id,
            });
            qtyCapacity -= qty;
            console.log(`Winner added (CASE2) from Ticket ${ticketRow.id}: ${num}, Remaining capacity: ${qtyCapacity}`);
          }

          if (qtyCapacity <= 0) break;
        }

        if (qtyCapacity <= 0) break;
      }
    }

    // CASE 3: Lowest purchaser (ticket-by-ticket asc)
    if (win_case === 3) {
      console.log("➡ CASE 3: Lowest purchaser (totalQuatity) priority");

      const sortedByPurchaseAsc = [...sortedByPurchasePower].slice().reverse();

      for (let ticketRow of sortedByPurchaseAsc) {
        const ticketArray = parseTicketNumberToArray(ticketRow.ticketNumber);
        console.log(`Checking Ticket ID ${ticketRow.id}, totalQuatity: ${ticketRow.totalQuatity}`);

        for (let entry of ticketArray) {
          const num = String(entry.ticketNumber);
          const qty = Number(entry.quantity || 0);

          console.log(`Checking number ${num} (qty: ${qty}) from Ticket ID ${ticketRow.id}`);

          if (winners.some((w) => w.number === num)) {
            console.log(`Skipping ${num}: already selected as winner`);
            continue;
          }

          if (qty > 0 && qty <= qtyCapacity) {
            winners.push({
              number: num,
              quantity: qty,
              value: qty * POINTS_PER_QUANTITY,
              fromTicketId: ticketRow.id,
            });
            qtyCapacity -= qty;
            console.log(`Winner added (CASE3) from Ticket ${ticketRow.id}: ${num}, Remaining capacity: ${qtyCapacity}`);
          }

          if (qtyCapacity <= 0) break;
        }

        if (qtyCapacity <= 0) break;
      }
    }

    // CASE 4: Lowest winning (30–40%)
    if (win_case === 4) {
      console.log("➡ CASE 4: Lowest Winning (30–40%) mode");

      // 1) Sort by quantity ascending (lowest qty first)
      const sortedByQtyAsc = [...sortedByQty].sort((a, b) => a.qty - b.qty);

      // 2) Calculate min 30% and max 40%
      const minTargetQty = Math.floor((winningPool * 0.30) / POINTS_PER_QUANTITY);
      const maxTargetQty = Math.floor((winningPool * 0.40) / POINTS_PER_QUANTITY);

      console.log("Min qty target (30%):", minTargetQty);
      console.log("Max qty target (40%):", maxTargetQty);

      // 3) Try to meet 30% first
      winners = selectLowestWinners(sortedByQtyAsc, minTargetQty);

      let usedQty = winners.reduce((s, w) => s + w.quantity, 0);

      console.log("Selected winners qty total after 30% attempt:", usedQty);

      // 4) If 30% impossible → increase to 40%
      if (usedQty < minTargetQty) {
        console.log("30% not possible → trying 40%");

        winners = selectLowestWinners(sortedByQtyAsc, maxTargetQty);
      }

      console.log("Final lowest winners:", winners);
    }

    // keep log but do not forcibly add a smallest winner
    if (winners.length === 0) {
      const smallest = sortedByQty[sortedByQty.length - 1];
      if (smallest) {
        console.log(`No winners found, picking smallest: ${smallest.number}`);
      } else {
        console.log("No winners found and no ticket numbers present");
      }
    }

    const usedWinners = new Set(winners.map((w) => String(w.number)));
    console.log("Used winners:", [...usedWinners]);

    // ------------------ SERIES RANDOM GENERATION ------------------
    const purchasedSet = new Set(Object.keys(totals));
    const seriesBuckets = { "10": [], "30": [], "50": [] };

    winners.forEach((w) => {
      const key = getSeriesKeyFromNumber(String(w.number));
      if (key) seriesBuckets[key].push({
        number: String(w.number),
        quantity: Number(w.quantity || 0),
        value: Number(w.value || 0),
      });
    });

    const final10 = fillSeriesWithRules("10", seriesBuckets["10"], purchasedSet, usedWinners);
    const final30 = fillSeriesWithRules("30", seriesBuckets["30"], purchasedSet, usedWinners);
    const final50 = fillSeriesWithRules("50", seriesBuckets["50"], purchasedSet, usedWinners);

let finalResult = [...final10, ...final30, ...final50];

console.log("Final result to be saved:", finalResult);

finalResult = reorderAvoidSameSeries(finalResult);

// ✅ STEP 5: ADD VALIDATION HERE
console.log("🔍 Validating final result...");
validateFinalResult(finalResult);

    // Save sorted final result
    await winningNumbers.create({
      loginId: 0,
      winningNumbers: finalResult,
      totalPoints,
      DrawTime: normalized,
      drawDate,
    });

    return res.status(200).json({
      message: "Winning numbers successfully saved.",
      winning: finalResult,
      caseUsed: win_case,
    });
  } catch (err) {
    console.error("❌ Auto Draw Error:", err);
    return res.status(500).json({ message: "Server error occurred while triggering the draw." });
  }
};

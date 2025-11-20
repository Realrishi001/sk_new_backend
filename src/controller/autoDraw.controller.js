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

// ------------------ FILL SERIES (shared) -----------------
// ------------------ FILL SERIES (shared) -----------------
const fillSeriesWithRules = (seriesKey, initialArr, purchasedSet, usedWinners) => {
  // Make a defensive independent array, ensure all numbers are strings
  const initial = Array.isArray(initialArr) ? initialArr.map(it => ({ ...it, number: String(it.number) })) : [];

  // Deduplicate initial by number preserving order
  const seen = new Set();
  const dedupedInitial = [];
  for (const it of initial) {
    if (!it || !it.number) continue;
    if (!seen.has(it.number)) {
      seen.add(it.number);
      dedupedInitial.push({ number: String(it.number), quantity: Number(it.quantity || 0), value: Number(it.value || 0) });
    }
  }

  // Ensure items are from correct series only
  const validatedInitial = dedupedInitial.filter(item => getSeriesKeyFromNumber(item.number) === seriesKey);

  // If validatedInitial already has more than 10 numbers -> trim to 10.
  // Keep one number per prefix where possible to maximize prefix coverage.
  const seriesStart = seriesKey === "10" ? 10 : seriesKey === "30" ? 30 : 50;

  // Group by prefix to prefer unique prefixes
  const byPrefix = new Map();
  validatedInitial.forEach(item => {
    const prefix = Math.floor(Number(item.number) / 100);
    if (!byPrefix.has(prefix)) byPrefix.set(prefix, []);
    byPrefix.get(prefix).push(item);
  });

  const finalInitial = [];
  // First pick at most one from each prefix, in the order prefixes appear in validatedInitial
  for (const item of validatedInitial) {
    const prefix = Math.floor(Number(item.number) / 100);
    if (finalInitial.length >= 10) break;
    if (!finalInitial.some(x => Math.floor(Number(x.number) / 100) === prefix)) {
      finalInitial.push(item);
    }
  }
  // If we still have slots and some prefixes had multiple entries, fill from them (preserve order)
  if (finalInitial.length < 10) {
    for (const item of validatedInitial) {
      if (finalInitial.length >= 10) break;
      if (!finalInitial.some(x => x.number === item.number)) {
        finalInitial.push(item);
      }
    }
  }
  // If after that validatedInitial still >10 (shouldn't happen) slice to 10
  if (finalInitial.length > 10) finalInitial.length = 10;

  // Start result with finalInitial
  const result = [...finalInitial];
  const present = new Set(result.map((r) => String(r.number)));
  const purchasedCount = countPurchasedInSeries(seriesKey, purchasedSet);
  const allowRepeats = purchasedCount >= 1000;

  // compute used prefixes in result
  const usedPrefixes = new Set(result.map(it => Math.floor(Number(it.number) / 100)));

  // produce shuffled list of required prefixes for the series (e.g. 10..19)
  const allPrefixes = [];
  for (let i = 0; i < 10; i++) allPrefixes.push(seriesStart + i);
  for (let i = allPrefixes.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allPrefixes[i], allPrefixes[j]] = [allPrefixes[j], allPrefixes[i]];
  }

  // Fill missing prefixes first (one per prefix)
  for (let prefix of allPrefixes) {
    if (result.length >= 10) break;
    if (usedPrefixes.has(prefix)) continue;

    let candidate;
    let tries = 0;
    const MAX_TRIES = 200;

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

    if (tries < MAX_TRIES && !present.has(candidate)) {
      result.push({ number: candidate, quantity: 0, value: 0 });
      present.add(candidate);
      usedWinners.add(candidate);
      usedPrefixes.add(prefix);
    }
  }

  // If still missing, fill with random numbers from series respecting restrictions
  let tries = 0;
  const MAX_TRIES_BIG = 30000;
  while (result.length < 10 && tries < MAX_TRIES_BIG) {
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

  // Final deterministic fallback: iterate all prefixes and suffixes
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

  // Ensure final length is exactly 10 (trim if needed)
  if (result.length > 10) result.length = 10;

  return result;
};

// ------------------ REORDER TO AVOID SAME-SERIES TOGETHER ------------------
const reorderAvoidSameSeries = (arr) => {
  if (!Array.isArray(arr) || arr.length === 0) return arr;

  // bucket per series
  const bucket10 = arr.filter(it => getSeriesKeyFromNumber(it.number) === "10");
  const bucket30 = arr.filter(it => getSeriesKeyFromNumber(it.number) === "30");
  const bucket50 = arr.filter(it => getSeriesKeyFromNumber(it.number) === "50");

  // round-robin merge (10 → 30 → 50 → repeat)
  const output = [];
  const maxLen = Math.max(bucket10.length, bucket30.length, bucket50.length);

  for (let i = 0; i < maxLen; i++) {
    if (bucket10[i]) output.push(bucket10[i]);
    if (bucket30[i]) output.push(bucket30[i]);
    if (bucket50[i]) output.push(bucket50[i]);
  }

  // Ensure EXACT order rule: no same first-two-digits consecutively
  const fixed = [];
  for (let item of output) {
    const prefix = item.number.substring(0, 2);

    if (fixed.length === 0) {
      fixed.push(item);
      continue;
    }

    const lastPrefix = fixed[fixed.length - 1].number.substring(0, 2);

    if (prefix !== lastPrefix) {
      fixed.push(item);
    } else {
      // find suitable swap
      let swapped = false;
      for (let j = 0; j < fixed.length - 1; j++) {
        const p2 = fixed[j].number.substring(0, 2);
        if (p2 !== prefix) {
          const temp = fixed[j];
          fixed[j] = item;
          fixed.push(temp);
          swapped = true;
          break;
        }
      }
      if (!swapped) fixed.push(item); // last fallback
    }
  }

  return fixed.slice(0, 30);
};



// ------------------ VALIDATE FINAL RESULT ------------------
const validateFinalResult = (finalResult) => {
  const errors = [];

  if (finalResult.length !== 30) {
    errors.push(`Expected 30 numbers, got ${finalResult.length}`);
  }

  const seriesCount = { "10": 0, "30": 0, "50": 0 };
  const prefixesUsed = { "10": new Set(), "30": new Set(), "50": new Set() };

  finalResult.forEach(item => {
    const series = getSeriesKeyFromNumber(item.number);
    if (series) {
      seriesCount[series]++;
      const prefix = Math.floor(Number(item.number) / 100);
      prefixesUsed[series].add(prefix);
    } else {
      errors.push(`Invalid series number: ${item.number}`);
    }
  });

  Object.entries(seriesCount).forEach(([series, count]) => {
    if (count !== 10) {
      errors.push(`Series ${series} has ${count}, expected 10`);
    }
  });

  Object.entries(prefixesUsed).forEach(([series, prefixSet]) => {
    if (prefixSet.size !== 10) {
      errors.push(`Series ${series} has ${prefixSet.size} prefixes, expected 10`);
    }
  });

  finalResult.forEach(item => {
    const firstTwo = Math.floor(Number(item.number) / 100);
    if (!(
      (firstTwo >= 10 && firstTwo <= 19) ||
      (firstTwo >= 30 && firstTwo <= 39) ||
      (firstTwo >= 50 && firstTwo <= 59)
    )) {
      errors.push(`Invalid range: ${item.number}`);
    }
  });

  if (errors.length > 0) {
    console.error("VALIDATION ERRORS:", errors);
    throw new Error(errors.join(", "));
  }

  return true;
};


// ------------------ RANDOM FULL RESULT (no tickets) -----------
const generateRandomFullResult = async (normalized, drawDate) => {
  const generateSeriesNumbers = (seriesStart) => {
    const numbers = [];
    const prefixes = [];

    for (let i = 0; i < 10; i++) prefixes.push(seriesStart + i);

    for (let i = prefixes.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [prefixes[i], prefixes[j]] = [prefixes[j], prefixes[i]];
    }

    for (let prefix of prefixes) {
      let candidate;
      let tries = 0;
      const MAX_TRIES = 100;
      do {
        const suffix = Math.floor(Math.random() * 100).toString().padStart(2, "0");
        candidate = String(prefix).padStart(2, "0") + suffix;
        tries++;
      } while (numbers.some(n => n.number === candidate) && tries < MAX_TRIES);

      numbers.push({ number: candidate, quantity: 0, value: 0 });
    }
    return numbers;
  };

  const finalResult = [
    ...generateSeriesNumbers(10),
    ...generateSeriesNumbers(30),
    ...generateSeriesNumbers(50)
  ];

  validateFinalResult(finalResult);

  await winningNumbers.create({ loginId: 0, winningNumbers: finalResult, totalPoints: 0, DrawTime: normalized, drawDate });

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

  let final10 = fillSeriesWithRules("10", seriesBuckets["10"], purchasedSet, usedWinners);
  let final30 = fillSeriesWithRules("30", seriesBuckets["30"], purchasedSet, usedWinners);
  let final50 = fillSeriesWithRules("50", seriesBuckets["50"], purchasedSet, usedWinners);

// SAFETY TRIM
final10 = final10.slice(0, 10);
final30 = final30.slice(0, 10);
final50 = final50.slice(0, 10);

let finalResult = [...final10, ...final30, ...final50];
finalResult = finalResult.slice(0, 30);

// APPLY anti-same-series rule
finalResult = reorderAvoidSameSeries(finalResult);

// VALIDATE
validateFinalResult(finalResult);

// SAVE
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


export const autoGenerateWinningNumbers = async (drawTime) => {
  try {
    if (!drawTime) {
      console.log("⛔ autoGenerateWinningNumbers called without drawTime");
      return false;
    }

    const normalized = formatDrawTime(drawTime);
    const drawDate = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

    console.log("⏳ Auto Draw Triggered →", normalized, " DrawDate:", drawDate);

    // 0) Duplicate check — do this early to avoid double work
    const exists = await winningNumbers.findOne({
      where: { DrawTime: normalized, drawDate },
    });

    if (exists) {
      console.log("⛔ AUTO: Result already exists for", normalized, drawDate);
      return false;
    }

    // 1) Check DB for priority admins (same logic as manual)
    const priorityAdmins = await Admin.findAll({
      where: { priorWinning: true },
      attributes: ["id"],
      order: [["id", "DESC"]],
    });
    const priorityLoginIds = priorityAdmins.map((a) => String(a.id));

    // 2) Get all today's tickets (restrict createdAt to today's window)
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = new Date();   end.setHours(23, 59, 59, 999);

    const allTickets = await tickets.findAll({
      where: { createdAt: { [Op.between]: [start, end] } },
      attributes: ["id", "ticketNumber", "totalPoints", "totalQuatity", "loginId", "drawTime"],
    });

    // 3) Filter tickets for this draw time (normalize stored drawTime)
    const filtered = allTickets.filter((t) => {
      try {
        const times = Array.isArray(t.drawTime) ? t.drawTime : JSON.parse(t.drawTime);
        return times.map((x) => formatDrawTime(x)).includes(normalized);
      } catch (err) {
        return false;
      }
    });

    console.log(`AUTO: Tickets matching ${normalized}: ${filtered.length}`);

    // 4) If no tickets → save a random full result (same as manual)
    if (!filtered.length) {
      console.log("AUTO: No tickets found for this slot → saving random full result");
      await generateRandomFullResult(normalized, drawDate);
      return true;
    }

    // 5) If there are priority admins, run CASE 5 (same logic as manual)
    if (priorityLoginIds.length > 0) {
      console.log("AUTO: Priority admins detected → running CASE 5:", priorityLoginIds.join(", "));
      await runCase5_LoginIdPriority({ priorityLoginIds, normalized, drawDate });
      return true;
    }

    // 6) Otherwise run a "random" CASE 1..4 — but implement selection the same as manual
    const totalCases = 4;
    const win_case = Math.floor(Math.random() * totalCases) + 1;
    console.log(`AUTO: Using CASE ${win_case}`);

    // 7) Compute totals, totalPoints, and winning capacity
    const totalPoints = filtered.reduce((sum, t) => sum + Number(t.totalPoints || 0), 0);
    const latest = await winningPercentage.findOne({ order: [["createdAt", "DESC"]] });
    const winningPercent = latest ? Number(latest.percentage) : 0;
    const winningPool = Math.floor((totalPoints * winningPercent) / 100);
    let qtyCapacity = Math.floor(winningPool / POINTS_PER_QUANTITY);

    console.log(`AUTO: totalPoints=${totalPoints}, winningPercent=${winningPercent}, winningPool=${winningPool}, qtyCapacity=${qtyCapacity}`);

    // Aggregate purchases map: number -> total qty purchased
    const totals = {};
    for (let t of filtered) {
      const parsed = parseTicketNumberToMap(t.ticketNumber);
      for (let [num, qty] of Object.entries(parsed)) {
        totals[num] = (totals[num] || 0) + qty;
      }
    }

    // Build helpers for selection
    const sortedByQty = Object.entries(totals)
      .map(([number, qty]) => ({ number, qty }))
      .sort((a, b) => b.qty - a.qty); // descending qty

    const sortedByPurchasePower = [...filtered].sort((a, b) => Number(b.totalQuatity) - Number(a.totalQuatity));

    let winners = [];

    // CASE 1: aggregated top quantities
    if (win_case === 1) {
      console.log("AUTO CASE1: quantity-based aggregated selection");
      if (qtyCapacity > 0) {
        for (let item of sortedByQty) {
          if (item.qty <= qtyCapacity && !winners.some(w => w.number === item.number)) {
            winners.push({ number: item.number, quantity: item.qty, value: item.qty * POINTS_PER_QUANTITY });
            qtyCapacity -= item.qty;
          }
          if (qtyCapacity <= 0) break;
        }
      }
    }

    // CASE 2: highest purchaser (by totalQuatity desc)
    if (win_case === 2) {
      console.log("AUTO CASE2: highest purchaser priority");
      for (let ticketRow of sortedByPurchasePower) {
        const ticketArray = parseTicketNumberToArray(ticketRow.ticketNumber);
        for (let entry of ticketArray) {
          const num = String(entry.ticketNumber);
          const qty = Number(entry.quantity || 0);
          if (winners.some(w => w.number === num)) continue;
          if (qty > 0 && qty <= qtyCapacity) {
            winners.push({ number: num, quantity: qty, value: qty * POINTS_PER_QUANTITY, fromTicketId: ticketRow.id });
            qtyCapacity -= qty;
          }
          if (qtyCapacity <= 0) break;
        }
        if (qtyCapacity <= 0) break;
      }
    }

    // CASE 3: lowest purchaser (by totalQuatity asc)
    if (win_case === 3) {
      console.log("AUTO CASE3: lowest purchaser priority");
      const sortedByPurchaseAsc = [...sortedByPurchasePower].slice().reverse();
      for (let ticketRow of sortedByPurchaseAsc) {
        const ticketArray = parseTicketNumberToArray(ticketRow.ticketNumber);
        for (let entry of ticketArray) {
          const num = String(entry.ticketNumber);
          const qty = Number(entry.quantity || 0);
          if (winners.some(w => w.number === num)) continue;
          if (qty > 0 && qty <= qtyCapacity) {
            winners.push({ number: num, quantity: qty, value: qty * POINTS_PER_QUANTITY, fromTicketId: ticketRow.id });
            qtyCapacity -= qty;
          }
          if (qtyCapacity <= 0) break;
        }
        if (qtyCapacity <= 0) break;
      }
    }

    // CASE 4: lowest winning 30%-40% mode (pick many low-qty numbers)
if (win_case === 4) {
  console.log("AUTO CASE4: lowest winning (30%-40%) mode");

  const sortedByQtyAsc = [...sortedByQty].sort((a, b) => a.qty - b.qty);
  const minTargetQty = Math.floor((winningPool * 0.30) / POINTS_PER_QUANTITY);
  const maxTargetQty = Math.floor((winningPool * 0.40) / POINTS_PER_QUANTITY);

  // helper same as in manual (selectLowestWinners)
  const selectLowestWinnersLocal = (sortedAsc, targetQty) => {
    const picked = [];
    let remaining = targetQty;
    const usedSet = new Set();

    for (let it of sortedAsc) {
      if (it.qty <= remaining && !usedSet.has(it.number)) {
        picked.push({
          number: it.number,
          quantity: it.qty,
          value: it.qty * POINTS_PER_QUANTITY,
        });
        usedSet.add(it.number);
        remaining -= it.qty;
      }
      if (remaining <= 0) break;
    }

    return picked;
  };

  // 🔥 FIX: winners is being reassigned, so use let
  let lowestWinners = selectLowestWinnersLocal(sortedByQtyAsc, minTargetQty);

  let usedQty = lowestWinners.reduce((s, w) => s + w.quantity, 0);

  if (usedQty < minTargetQty) {
    // expand to 40%
    lowestWinners = selectLowestWinnersLocal(sortedByQtyAsc, maxTargetQty);
  }

  // assign back to global winners array
  winners = lowestWinners;
}


    // If still no winners (edge cases), pick the top smallest available single number as a fallback
    if (winners.length === 0) {
      const fallback = sortedByQty[sortedByQty.length - 1];
      if (fallback) {
        winners.push({ number: fallback.number, quantity: fallback.qty, value: fallback.qty * POINTS_PER_QUANTITY });
      }
    }

    // Series fill (use the exact same fillSeriesWithRules logic as manual)
    const usedWinners = new Set(winners.map(w => String(w.number)));
    const purchasedSet = new Set(Object.keys(totals));
    const seriesBuckets = { "10": [], "30": [], "50": [] };

    winners.forEach(w => {
      const k = getSeriesKeyFromNumber(String(w.number));
      if (k) seriesBuckets[k].push({ number: String(w.number), quantity: Number(w.quantity || 0), value: Number(w.value || 0) });
    });
    
let final10 = fillSeriesWithRules("10", seriesBuckets["10"], purchasedSet, usedWinners);
let final30 = fillSeriesWithRules("30", seriesBuckets["30"], purchasedSet, usedWinners);
let final50 = fillSeriesWithRules("50", seriesBuckets["50"], purchasedSet, usedWinners);

final10 = final10.slice(0, 10);
final30 = final30.slice(0, 10);
final50 = final50.slice(0, 10);

let finalResult = [...final10, ...final30, ...final50];
finalResult = finalResult.slice(0, 30);


// APPLY anti-same-series rule
finalResult = reorderAvoidSameSeries(finalResult);
validateFinalResult(finalResult);


if (finalResult.length !== 30) {
  console.warn("SAFETY TRIM applied — finalResult length:", finalResult.length);
}


console.log("AUTO: Validating final result...");
validateFinalResult(finalResult);

// Save
await winningNumbers.create({
  loginId: 0,
  winningNumbers: finalResult,
  totalPoints,
  DrawTime: normalized,
  drawDate,
});


    console.log(`🎉 AUTO saved result for ${normalized} (case ${win_case})`);
    return true;
  } catch (err) {
    console.error("❌ AUTO DRAW ERROR:", err);
    return false;
  }
};


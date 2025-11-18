import { Op } from "sequelize";
import { tickets } from "../models/ticket.model.js";
import { winningNumbers } from "../models/winningNumbers.model.js";
import { winningPercentage } from "../models/winningPercentage.model.js";
import Admin from "../models/admins.model.js";

const POINTS_PER_QUANTITY = 180;

/* ----------------------------------------------------------
   FORMAT DRAW TIME
---------------------------------------------------------- */
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

/* ----------------------------------------------------------
   PARSE TICKET NUMBER (MAP)
---------------------------------------------------------- */
const parseTicketNumberToMap = (ticketStr) => {
  const map = {};
  if (!ticketStr) return map;

  try {
    if (typeof ticketStr === "string" && ticketStr.startsWith("[") && ticketStr.endsWith("]")) {
      const arr = JSON.parse(ticketStr);
      arr.forEach(({ ticketNumber, quantity }) => {
        if (ticketNumber && quantity >= 0) {
          map[String(ticketNumber)] = (map[String(ticketNumber)] || 0) + Number(quantity || 0);
        }
      });
    } else if (Array.isArray(ticketStr)) {
      ticketStr.forEach(({ ticketNumber, quantity }) => {
        if (ticketNumber && quantity >= 0) {
          map[String(ticketNumber)] = (map[String(ticketNumber)] || 0) + Number(quantity || 0);
        }
      });
    } else {
      const pairs = String(ticketStr).split(",").map((x) => x.trim()).filter(Boolean);
      for (let p of pairs) {
        const [num, qty] = p.split(":").map((s) => s.trim());
        const number = String(num).replace(/-/g, "");
        const quantity = Number(qty || 0);
        if (number) map[number] = (map[number] || 0) + quantity;
      }
    }
  } catch (err) {
    console.log("Parse error:", err);
  }

  return map;
};

/* ----------------------------------------------------------
   PARSE TICKET NUMBER (ORDERED ARRAY)
---------------------------------------------------------- */
const parseTicketNumberToArray = (ticketStr) => {
  const out = [];
  if (!ticketStr) return out;

  try {
    if (typeof ticketStr === "string" && ticketStr.startsWith("[") && ticketStr.endsWith("]")) {
      const arr = JSON.parse(ticketStr);
      arr.forEach((it) => {
        out.push({
          ticketNumber: String(it.ticketNumber),
          quantity: Number(it.quantity || 0),
        });
      });
    } else if (Array.isArray(ticketStr)) {
      ticketStr.forEach((it) => {
        out.push({
          ticketNumber: String(it.ticketNumber),
          quantity: Number(it.quantity || 0),
        });
      });
    } else {
      const pairs = String(ticketStr).split(",").map((x) => x.trim()).filter(Boolean);
      for (let p of pairs) {
        const [num, qty] = p.split(":").map((s) => s.trim());
        out.push({
          ticketNumber: String(num).replace(/-/g, ""),
          quantity: Number(qty || 0),
        });
      }
    }
  } catch (err) {
    console.log("Parse order error:", err);
  }

  return out;
};

/* ----------------------------------------------------------
   SERIES HELPERS
---------------------------------------------------------- */
const getSeriesKeyFromNumber = (numStr) => {
  const n = Number(numStr.substring(0, 2));
  if (n >= 10 && n <= 19) return "10";
  if (n >= 30 && n <= 39) return "30";
  if (n >= 50 && n <= 59) return "50";
  return null;
};

const genRandomInSeries = (seriesKey) => {
  let allowed = [];
  if (seriesKey === "10") for (let i = 10; i <= 19; i++) allowed.push(i);
  if (seriesKey === "30") for (let i = 30; i <= 39; i++) allowed.push(i);
  if (seriesKey === "50") for (let i = 50; i <= 59; i++) allowed.push(i);

  const prefix = allowed[Math.floor(Math.random() * allowed.length)];
  const suffix = Math.floor(Math.random() * 100).toString().padStart(2, "0");
  return prefix + suffix;
};

const countPurchasedInSeries = (seriesKey, purchasedSet) => {
  let c = 0;
  for (let n of purchasedSet) {
    if (getSeriesKeyFromNumber(n) === seriesKey) c++;
  }
  return c;
};

const fillSeriesWithRules = (seriesKey, initialArr, purchasedSet, usedWinners) => {
  const result = [...initialArr];
  const present = new Set(result.map((x) => x.number));
  const purchasedCount = countPurchasedInSeries(seriesKey, purchasedSet);
  const allowRepeats = purchasedCount >= 1000;

  let tries = 0;
  const MAX_TRIES = 30000;

  while (result.length < 10 && tries < MAX_TRIES) {
    tries++;
    const cand = genRandomInSeries(seriesKey);
    if (present.has(cand)) continue;

    if (!purchasedSet.has(cand) && !usedWinners.has(cand)) {
      result.push({ number: cand, quantity: 0, value: 0 });
      present.add(cand);
      usedWinners.add(cand);
      continue;
    }

    if (allowRepeats) {
      result.push({ number: cand, quantity: 0, value: 0 });
      present.add(cand);
    }
  }

  return result;
};

/* ----------------------------------------------------------
   CASE 5 — PRIORITY LOGIN IDS
---------------------------------------------------------- */
const runCase5 = async ({ priorityLoginIds, filtered, normalized, drawDate }) => {
  console.log("➡ Running Case-5 for:", priorityLoginIds);

  const totals = {};
  for (let t of filtered) {
    const parsed = parseTicketNumberToMap(t.ticketNumber);
    for (let [n, q] of Object.entries(parsed)) {
      totals[n] = (totals[n] || 0) + q;
    }
  }

  const totalPoints = filtered.reduce((s, t) => s + Number(t.totalPoints || 0), 0);
  const latest = await winningPercentage.findOne({ order: [["createdAt", "DESC"]] });
  const winningPercent = latest ? Number(latest.percentage || 0) : 0;
  const winningPool = Math.floor((totalPoints * winningPercent) / 100);
  let qtyCapacity = Math.floor(winningPool / POINTS_PER_QUANTITY);

  let winners = [];
  const purchasedSet = new Set(Object.keys(totals));

  for (let pid of priorityLoginIds) {
    const ticketGroup = filtered.filter((t) => String(t.loginId) === String(pid));

    for (let t of ticketGroup) {
      const arr = parseTicketNumberToArray(t.ticketNumber);
      for (let ent of arr) {
        const { ticketNumber, quantity } = ent;

        if (
          quantity > 0 &&
          quantity <= qtyCapacity &&
          !winners.some((w) => w.number === ticketNumber)
        ) {
          winners.push({
            number: ticketNumber,
            quantity,
            value: quantity * POINTS_PER_QUANTITY,
            fromLoginId: pid,
            fromTicketId: t.id,
          });
          qtyCapacity -= quantity;
        }

        if (qtyCapacity <= 0) break;
      }
    }

    if (qtyCapacity <= 0) break;
  }

  // fallback to others
  const otherTickets = filtered.filter(
    (t) => !priorityLoginIds.includes(String(t.loginId))
  );

  for (let t of otherTickets) {
    const arr = parseTicketNumberToArray(t.ticketNumber);
    for (let ent of arr) {
      const { ticketNumber, quantity } = ent;

      if (
        quantity > 0 &&
        quantity <= qtyCapacity &&
        !winners.some((w) => w.number === ticketNumber)
      ) {
        winners.push({
          number: ticketNumber,
          quantity,
          value: quantity * POINTS_PER_QUANTITY,
          fromLoginId: t.loginId,
          fromTicketId: t.id,
        });
        qtyCapacity -= quantity;
      }

      if (qtyCapacity <= 0) break;
    }

    if (qtyCapacity <= 0) break;
  }

  // fill series
  const usedWinners = new Set(winners.map((w) => w.number));
  const seriesBuckets = { "10": [], "30": [], "50": [] };

  winners.forEach((w) => {
    const k = getSeriesKeyFromNumber(w.number);
    if (k) seriesBuckets[k].push(w);
  });

  const final10 = fillSeriesWithRules("10", seriesBuckets["10"], purchasedSet, usedWinners);
  const final30 = fillSeriesWithRules("30", seriesBuckets["30"], purchasedSet, usedWinners);
  const final50 = fillSeriesWithRules("50", seriesBuckets["50"], purchasedSet, usedWinners);

  const finalResult = [...final10, ...final30, ...final50]
    .sort((a, b) => Number(a.number) - Number(b.number));

  await winningNumbers.create({
    loginId: 0,
    winningNumbers: finalResult,
    totalPoints,
    DrawTime: normalized,
    drawDate,
  });

  console.log("🎉 CASE-5 AUTO RESULT SAVED");
  return true;
};

/* ----------------------------------------------------------
   AUTO CONTROLLER MAIN
---------------------------------------------------------- */
export const autoGenerateWinningNumbers = async (drawTime) => {
  try {
    const normalized = formatDrawTime(drawTime);
    const drawDate = new Date().toISOString().split("T")[0];

    console.log("⏳ Auto Draw Triggered →", normalized);

    const exists = await winningNumbers.findOne({
      where: { DrawTime: normalized, drawDate },
    });

    if (exists) {
      console.log("⛔ Result already exists");
      return false;
    }

    // fetch priority admins
    const priorityAdmins = await Admin.findAll({
      where: { priorWinning: true },
      attributes: ["id"],
    });

    const priorityLoginIds = priorityAdmins.map((a) => String(a.id));

    // fetch tickets
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = new Date(); end.setHours(23, 59, 59, 999);

    const all = await tickets.findAll({
      where: {
        createdAt: { [Op.between]: [start, end] },
      },
      attributes: ["id", "ticketNumber", "totalPoints", "totalQuatity", "drawTime", "loginId"],
    });

    const filtered = all.filter((t) => {
      try {
        const times = Array.isArray(t.drawTime) ? t.drawTime : JSON.parse(t.drawTime);
        return times.map((x) => formatDrawTime(x)).includes(normalized);
      } catch {
        return false;
      }
    });

    if (!filtered.length) {
      console.log("⚠ No tickets → random result");

      const final =
        [...randomSeriesFill("10"), ...randomSeriesFill("30"), ...randomSeriesFill("50")];

      await winningNumbers.create({
        loginId: 0,
        winningNumbers: final,
        totalPoints: 0,
        DrawTime: normalized,
        drawDate,
      });

      console.log("🎉 RANDOM AUTO RESULT SAVED");
      return true;
    }

    // if priority admins exist → run case-5
    if (priorityLoginIds.length > 0) {
      console.log("🔥 AUTO CASE-5 triggered for admins:", priorityLoginIds.join(", "));
      return await runCase5({ priorityLoginIds, filtered, normalized, drawDate });
    }

    /* ----------------------------------------------------------
      NORMAL CASE 1-4 AUTO LOGIC BELOW
    ---------------------------------------------------------- */

    const totals = {};
    for (let t of filtered) {
      const parsed = parseTicketNumberToMap(t.ticketNumber);
      for (let [num, qty] of Object.entries(parsed)) {
        totals[num] = (totals[num] || 0) + qty;
      }
    }

    const sortedByQty = Object.entries(totals)
      .map(([number, qty]) => ({ number, qty }))
      .sort((a, b) => b.qty - a.qty);

    const sortedByPurchaseDesc = [...filtered].sort(
      (a, b) => Number(b.totalQuatity) - Number(a.totalQuatity)
    );
    const sortedByPurchaseAsc = [...sortedByPurchaseDesc].reverse();

    const totalPoints = filtered.reduce((s, t) => s + Number(t.totalPoints || 0), 0);
    const latest = await winningPercentage.findOne({
      order: [["createdAt", "DESC"]],
    });
    const winningPercent = latest ? Number(latest.percentage) : 0;

    const winningPool = Math.floor((totalPoints * winningPercent) / 100);
    let qtyCapacity = Math.floor(winningPool / POINTS_PER_QUANTITY);

    const win_case = Math.floor(Math.random() * 4) + 1;
    console.log("🎲 AUTO CASE:", win_case);

    let winners = [];

    // CASE 1
    if (win_case === 1) {
      for (let item of sortedByQty) {
        if (item.qty <= qtyCapacity) {
          winners.push({
            number: item.number,
            quantity: item.qty,
            value: item.qty * POINTS_PER_QUANTITY,
          });
          qtyCapacity -= item.qty;
        }
        if (qtyCapacity <= 0) break;
      }
    }

    // CASE 2
    if (win_case === 2) {
      for (let t of sortedByPurchaseDesc) {
        const arr = parseTicketNumberToArray(t.ticketNumber);
        for (let ent of arr) {
          const { ticketNumber, quantity } = ent;
          if (
            quantity > 0 &&
            quantity <= qtyCapacity &&
            !winners.some((w) => w.number === ticketNumber)
          ) {
            winners.push({
              number: ticketNumber,
              quantity,
              value: quantity * POINTS_PER_QUANTITY,
            });
            qtyCapacity -= quantity;
          }
          if (qtyCapacity <= 0) break;
        }
      }
    }

    // CASE 3
    if (win_case === 3) {
      for (let t of sortedByPurchaseAsc) {
        const arr = parseTicketNumberToArray(t.ticketNumber);
        for (let ent of arr) {
          const { ticketNumber, quantity } = ent;
          if (
            quantity > 0 &&
            quantity <= qtyCapacity &&
            !winners.some((w) => w.number === ticketNumber)
          ) {
            winners.push({
              number: ticketNumber,
              quantity,
              value: quantity * POINTS_PER_QUANTITY,
            });
            qtyCapacity -= quantity;
          }
          if (qtyCapacity <= 0) break;
        }
      }
    }

    // CASE 4
    if (win_case === 4) {
      winners = [];
    }

    // fill final series
    const usedWinners = new Set(winners.map((w) => w.number));
    const purchasedSet = new Set(Object.keys(totals));

    const seriesBuckets = { "10": [], "30": [], "50": [] };

    winners.forEach((w) => {
      const k = getSeriesKeyFromNumber(w.number);
      if (k) seriesBuckets[k].push(w);
    });

    const final10 = fillSeriesWithRules("10", seriesBuckets["10"], purchasedSet, usedWinners);
    const final30 = fillSeriesWithRules("30", seriesBuckets["30"], purchasedSet, usedWinners);
    const final50 = fillSeriesWithRules("50", seriesBuckets["50"], purchasedSet, usedWinners);

    const finalResult = [...final10, ...final30, ...final50]
      .sort((a, b) => Number(a.number) - Number(b.number));

    await winningNumbers.create({
      loginId: 0,
      winningNumbers: finalResult,
      totalPoints,
      DrawTime: normalized,
      drawDate,
    });

    console.log("🎉 AUTO RESULT SAVED (Case " + win_case + ")");
    return true;

  } catch (err) {
    console.error("❌ AUTO DRAW ERROR:", err);
    return false;
  }
};

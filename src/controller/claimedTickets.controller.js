import { tickets } from "../models/ticket.model.js";
import { winningNumbers } from "../models/winningNumbers.model.js";
import { claimedTickets } from "../models/claimedTickets.model.js";
import { Op } from "sequelize";

/* ------------------------- HELPER FUNCTIONS ------------------------- */

// Extract date from datetime (e.g. "27-07-2025 11:34:24" → "27-07-2025")
function extractDate(datetimeStr) {
  return typeof datetimeStr === "string" ? datetimeStr.split(" ")[0] : "";
}

// "30-00 : 3" → { ticketNumber: "3000", quantity: 3 }
function extractTicketNumberAndQuantity(str) {
  if (!str) return {};
  const [numPart, qtyPart] = str.split(":").map((s) => s.trim());
  return {
    ticketNumber: numPart ? numPart.replace("-", "") : "",
    quantity: qtyPart ? parseInt(qtyPart, 10) : 0,
  };
}

// "30-00 : 3, 30-11 : 4" → [{ ticketNumber: "3000", quantity: 3 }, ...]
function parseTicketNumberString(ticketNumberStr) {
  if (!ticketNumberStr) return [];
  if (typeof ticketNumberStr !== "string") ticketNumberStr = String(ticketNumberStr);
  return ticketNumberStr.split(",").map(extractTicketNumberAndQuantity);
}

// Normalize draw time (e.g., "08:45 PM" → "8:45 PM")
function normalizeDrawTime(str) {
  if (!str) return "";
  return str.replace(/^0(\d:)/, "$1");
}

// Parse ticket numbers robustly
function extractTicketNumbers(ticketNumbersArr) {
  if (!ticketNumbersArr) return [];

  if (typeof ticketNumbersArr === "string") {
    try {
      const arr = JSON.parse(ticketNumbersArr);
      if (Array.isArray(arr)) ticketNumbersArr = arr;
      else return [ticketNumbersArr];
    } catch {
      // fallback: comma-separated list
      return ticketNumbersArr.split(",").map((str) => str.trim());
    }
  }

  if (!Array.isArray(ticketNumbersArr)) return [];

  return ticketNumbersArr
    .map(
      (obj) =>
        obj.ticketNumber ||
        obj.number ||
        (typeof obj === "string" ? obj : "")
    )
    .filter(Boolean);
}

/* ------------------------- MAIN CONTROLLER ------------------------- */

export const checkTicketWinningStatus = async (req, res) => {
  try {
    const { ticketId } = req.body;

    if (!ticketId) {
      return res.status(400).json({ error: "ticketId is required" });
    }

    console.log("🎯 Checking winning status for Ticket ID:", ticketId);

    /* 1️⃣ — Check if ticket already claimed */
    const alreadyClaimed = await claimedTickets.findOne({
      where: { TicketId: ticketId },
      attributes: ["id", "TicketId", "drawDate", "claimedDate", "claimedTime"],
    });

    if (alreadyClaimed) {
      console.log("⚠️ Ticket already claimed:", alreadyClaimed.toJSON());
      return res.status(200).json({
        status: "already_claimed",
        message: "This ticket has already been claimed.",
        claimedDetails: alreadyClaimed,
      });
    }

    /* 2️⃣ — Fetch ticket details */
    const ticket = await tickets.findOne({
      where: { id: ticketId },
      attributes: ["gameTime", "loginId", "ticketNumber", "drawTime"],
    });

    if (!ticket) {
      console.log("❌ Ticket not found.");
      return res.status(404).json({ status: "error", message: "Ticket not found" });
    }

    const drawDate = extractDate(ticket.gameTime);
    const loginId = ticket.loginId;

    console.log("📅 Draw Date:", drawDate);
    console.log("🧩 Ticket Info:", ticket.toJSON());

    /* 3️⃣ — Parse drawTime */
    let drawTimes = ticket.drawTime;
    if (typeof drawTimes === "string") {
      try {
        drawTimes = JSON.parse(drawTimes);
      } catch {
        drawTimes = [drawTimes];
      }
    }
    if (!Array.isArray(drawTimes)) drawTimes = [drawTimes];

    drawTimes = drawTimes
      .filter(Boolean)
      .map((dt) => (typeof dt === "string" ? normalizeDrawTime(dt) : dt))
      .filter(Boolean);

    console.log("🕒 Draw Times:", drawTimes);

    /* 4️⃣ — Parse ticket numbers */
    const ticketNumberRaw = String(ticket.ticketNumber || "");
    const ticketNumbersArr = extractTicketNumbers(ticketNumberRaw);

    console.log("🎟️ Ticket Numbers:", ticketNumbersArr);

    const PAYOUT_RATE = 180;
    let results = [];
    let allWinningNumbersSet = new Set();
    let anyDeclaration = false;
    let anyWinning = false;

    /* 5️⃣ — Check each draw time for winning numbers */
    for (let dt of drawTimes) {
      console.log(`🔍 Checking DrawTime: "${dt}" | Date: ${drawDate}`);

      const winningRow = await winningNumbers.findOne({
        where: {
          DrawTime: dt,
          drawDate: drawDate,
        },
        attributes: ["winningNumbers"],
      });

      if (!winningRow) {
        console.log("⚠️ No winning numbers declared for this draw time.");
        continue;
      }

      anyDeclaration = true;
      let winningNums = winningRow.winningNumbers;

      if (typeof winningNums === "string") {
        try {
          winningNums = JSON.parse(winningNums);
        } catch {
          winningNums = [];
        }
      }

      // Collect all winning numbers
      if (Array.isArray(winningNums)) {
        winningNums.forEach((obj) => allWinningNumbersSet.add(obj.number));
      }

      // Quick map for quantities
      const qtyMap = new Map();
      ticketNumbersArr.forEach((t) => {
        if (typeof t === "object" && t.ticketNumber) {
          qtyMap.set(t.ticketNumber, t.quantity || 0);
        } else if (typeof t === "string") {
          const cleaned = t.replace(/[^0-9]/g, "");
          qtyMap.set(cleaned, 1);
        }
      });

      // Compare and find matches
      const matches = ticketNumbersArr
        .map((num) => {
          const ticketNum =
            typeof num === "object" ? num.ticketNumber : num;
          const match = Array.isArray(winningNums)
            ? winningNums.find((obj) => obj.number === ticketNum)
            : null;

          if (match) {
            const quantity = qtyMap.get(ticketNum) || 0;
            const perTicketValue = Number(match.value) || PAYOUT_RATE;
            const totalWinningValue = perTicketValue * quantity;

            return {
              number: ticketNum,
              quantity,
              winningValue: perTicketValue,
              totalWinningValue,
              drawTime: dt,
            };
          }
          return null;
        })
        .filter(Boolean);

      if (matches.length > 0) {
        console.log("🏆 Matches found:", matches);
        anyWinning = true;
        results.push(...matches);
      } else {
        console.log("❌ No matches found for this draw time.");
      }
    }

    /* 6️⃣ — Response Section */
    if (!anyDeclaration) {
      console.log("🚫 No winning declared yet.");
      return res.status(200).json({
        status: "no_declaration",
        message: "No winning declared yet for this ticket",
        drawDate,
        drawTimes,
        ticketNumbers: ticketNumbersArr,
      });
    }

    if (anyWinning) {
      console.log("🎉 WINNING ticket found!");
      return res.status(200).json({
        status: "winner",
        message: "Winning ticket found!",
        drawDate,
        drawTimes,
        winningTickets: results,
        allWinningNumbers: Array.from(allWinningNumbersSet),
      });
    }

    console.log("❌ Ticket is not a winner.");
    return res.status(200).json({
      status: "no_winning",
      message: "No winning ticket found.",
      drawDate,
      drawTimes,
      ticketNumbers: ticketNumbersArr,
      allWinningNumbers: Array.from(allWinningNumbersSet),
    });
  } catch (error) {
    console.error("💥 Error in checkTicketWinningStatus:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

function toYYYYMMDD(input) {
  const s = String(input || "");
  if (/^\d{2}-\d{2}-\d{4}$/.test(s)) { // "DD-MM-YYYY" -> "YYYY-MM-DD"
    const [D, M, Y] = s.split("-");
    return `${Y}-${M}-${D}`;
  }
  return s;
}
function toTimeArray(val) {
  if (Array.isArray(val)) return val.filter(Boolean).map(String);
  if (typeof val === "string") {
    const s = val.trim();
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) return parsed.filter(Boolean).map(String);
      if (typeof parsed === "string" && parsed.trim()) return [parsed.trim()];
    } catch {
      if (s.length) return [s];
    }
  }
  return [];
}
function csvToObject(csv) {
  const acc = {};
  if (!csv) return acc;
  csv.split(",").forEach((entry) => {
    const [k, v] = entry.split(":").map((s) => s && s.trim());
    if (k && v && !Number.isNaN(Number(v))) acc[k] = Number(v);
  });
  return acc;
}
function parseTicketNumberAny(raw) {
  let obj = {};
  if (!raw) return [];
  if (typeof raw === "object" && !Array.isArray(raw)) {
    obj = raw;
  } else if (typeof raw === "string") {
    const str = raw.trim();
    try {
      const parsed = JSON.parse(str);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) obj = parsed;
      else obj = csvToObject(str);
    } catch {
      obj = csvToObject(str);
    }
  } else {
    try {
      const parsed = JSON.parse(String(raw));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) obj = parsed;
    } catch {
      obj = {};
    }
  }
  const out = [];
  for (const [ticketKey, qtyRaw] of Object.entries(obj)) {
    const quantity = Number(qtyRaw) || 0;
    const ticketNumber = String(ticketKey).replace(/[^0-9]/g, ""); // digits only
    out.push({ ticketNumber, quantity });
  }
  return out;
}

export const claimTicket = async (req, res) => {
  try {
    const { ticketId } = req.body;
    const PAYOUT_RATE = 180;

    console.log("\n🎯 CLAIM PROCESS STARTED");
    console.log("➡️ Received Ticket ID:", ticketId);

    if (!ticketId) {
      return res.status(400).json({ status: "error", message: "ticketId is required" });
    }

    // Step 1️⃣: Check if ticket already claimed
    const existingClaim = await claimedTickets.findOne({
      where: { TicketId: ticketId },
      attributes: ["id", "TicketId"],
    });

    if (existingClaim) {
      console.warn(`⚠️ Ticket ${ticketId} already claimed.`);
      return res.status(409).json({
        status: "already_claimed",
        message: `Ticket ${ticketId} has already been claimed.`,
      });
    }

    // Step 2️⃣: Fetch the ticket
    const ticket = await tickets.findOne({
      where: { id: ticketId },
      attributes: ["id", "loginId", "ticketNumber", "drawTime", "gameTime"],
    });

    if (!ticket) {
      console.warn(`❌ No ticket found for ID: ${ticketId}`);
      return res.status(404).json({ status: "error", message: "Ticket not found" });
    }

    console.log("\n🎟️ Ticket Found:");
    console.log(JSON.stringify(ticket.toJSON(), null, 2));

    const { loginId, ticketNumber, drawTime, gameTime } = ticket;

    // Step 3️⃣: Convert date format DD-MM-YYYY → YYYY-MM-DD
    let drawDate = "";
    if (typeof gameTime === "string") {
      const datePart = gameTime.split(" ")[0]; // "09-11-2025"
      const parts = datePart.split("-");
      if (parts.length === 3) drawDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
    } else {
      drawDate = new Date(gameTime).toISOString().split("T")[0];
    }

    console.log("\n🗓️ Normalized Draw Date:", drawDate);

    // Step 4️⃣: Parse drawTime
    let parsedDrawTimes = [];
    try {
      parsedDrawTimes = Array.isArray(drawTime) ? drawTime : JSON.parse(drawTime);
    } catch (err) {
      console.error("⚠️ Error parsing drawTime:", err);
    }
    console.log("🕓 Parsed Draw Times:", parsedDrawTimes);

    // Step 5️⃣: Fetch all winning numbers for same date
    const allWinningRows = await winningNumbers.findAll({
      where: { drawDate },
      attributes: ["winningNumbers", "DrawTime", "drawDate"],
    });

    if (!allWinningRows.length) {
      console.warn("⚠️ No winning numbers found for this date.");
      return res.status(200).json({
        status: "no_winning_data",
        message: "No winning numbers found for this draw date.",
      });
    }

    console.log("\n🏆 Winning Records for Date:", drawDate);
    allWinningRows.forEach((row, i) => {
      console.log(`\n#${i + 1} ➤ DrawTime: ${row.DrawTime}`);
      console.log("Winning Numbers:", row.winningNumbers);
    });

    // Step 6️⃣: Filter by matching draw time
    const matchedRows = [];
    for (const row of allWinningRows) {
      let winTimes = [];
      try {
        winTimes = Array.isArray(row.DrawTime) ? row.DrawTime : JSON.parse(row.DrawTime);
      } catch {
        winTimes = [];
      }
      if (parsedDrawTimes.some((t) => winTimes.includes(t))) matchedRows.push(row);
    }

    if (!matchedRows.length) {
      console.warn("❌ No matching draw time found between ticket and winners.");
      return res.status(200).json({
        status: "no_match",
        message: "No matching draw time found.",
      });
    }

    console.log("\n✅ Matched Winning Records Found:");

    // Step 7️⃣: Parse ticket numbers
    let parsedTickets = [];
    try {
      const cleaned = ticketNumber.replace(/"/g, "");
      const parts = cleaned.split(",").map((x) => x.trim());
      parsedTickets = parts.map((p) => {
        const [num, qty] = p.split(":").map((x) => x.trim());
        return {
          number: num.replace("-", ""), // "10-10" → "1010"
          qty: parseInt(qty) || 0,
        };
      });
    } catch (err) {
      console.error("⚠️ Error parsing ticket numbers:", err);
    }

    console.log("\n🎫 Parsed Ticket Numbers:");
    console.table(parsedTickets);

    // Step 8️⃣: Gather all winning numbers
    const winningNumbersSet = new Set();
    for (const row of matchedRows) {
      let winners = [];
      try {
        winners = Array.isArray(row.winningNumbers)
          ? row.winningNumbers
          : JSON.parse(row.winningNumbers);
      } catch {
        winners = [];
      }

      for (const w of winners) {
        if (w.number) winningNumbersSet.add(w.number);
      }
    }

    console.log("\n🏁 Combined Winning Numbers:");
    console.log(Array.from(winningNumbersSet));

    // Step 9️⃣: Compare and find matches
    const matches = [];
    for (const t of parsedTickets) {
      if (winningNumbersSet.has(t.number)) {
        const payout = t.qty * PAYOUT_RATE;
        console.log(`✅ WIN → ${t.number} | Qty: ${t.qty} | Payout: ${payout}`);
        matches.push({
          number: t.number,
          quantity: t.qty,
          payout,
        });
      } else {
        console.log(`❌ LOSS → ${t.number} not in winning list`);
      }
    }

    if (!matches.length) {
      console.warn("\n😞 No winning numbers in this ticket.");
      return res.status(200).json({
        status: "no_win",
        message: "Ticket has no winning numbers.",
      });
    }

    console.log("\n🎉 Winning Summary:");
    console.table(matches);

    // Step 🔟: Save claim in claimedTickets
    const now = new Date();
    const claimedDate = now.toISOString().split("T")[0];
    const claimedTime = now.toTimeString().split(" ")[0];

    await claimedTickets.create({
      TicketId: ticketId,
      loginId,
      ticketNumbers: matches,
      drawTime: parsedDrawTimes.join(", "),
      drawDate,
      claimedDate,
      claimedTime,
    });

    console.log(`\n💾 Ticket ${ticketId} successfully saved to claimedTickets.`);

    // ✅ Final Response
    return res.status(201).json({
      status: "ticket_claimed",
      message: "Ticket successfully claimed!",
      ticketId,
      drawDate,
      drawTime: parsedDrawTimes,
      matches,
    });
  } catch (error) {
    console.error("\n🔥 Error in claimTicket:", error);
    return res.status(500).json({
      status: "error",
      message: "Internal server error",
      error: error.message,
    });
  }
};

// 3. Get claimed tickets by loginId, date range
export const getClaimedTickets = async (req, res) => {
  try {
    const { loginId, fromDate, toDate } = req.body;
    if (!loginId || !fromDate || !toDate) {
      return res.status(400).json({ error: "loginId, fromDate, and toDate are required." });
    }

    // Query: claimedDate between fromDate and toDate (inclusive)
    const where = {
      loginId: loginId,
      claimedDate: {
        [Op.gte]: fromDate,
        [Op.lte]: toDate,
      },
    };

    // Fetch all claimed tickets for this loginId in date range
    const claimed = await claimedTickets.findAll({
      where,
      order: [["claimedDate", "DESC"], ["claimedTime", "DESC"]],
    });

    // Format result
    const result = claimed.map(row => {
      let ticketNumbersArr = row.ticketNumbers;
      if (typeof ticketNumbersArr === "string") {
        try { ticketNumbersArr = JSON.parse(ticketNumbersArr); } catch { ticketNumbersArr = []; }
      }
      return {
        ticketId: row.TicketId,
        totalQuantity: getTotalQuantity(ticketNumbersArr),
        ticketNumbers: extractTicketNumbers(ticketNumbersArr),
        drawDate: row.drawDate,
        drawTime: row.drawTime,
        claimedDate: row.claimedDate,
        claimedTime: row.claimedTime,
      };
    });

    return res.status(200).json(result);

  } catch (error) {
    console.error("Error in getClaimedTickets:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

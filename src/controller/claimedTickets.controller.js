import { tickets } from "../models/ticket.model.js";
import { winningNumbers } from "../models/winningNumbers.model.js";
import { claimedTickets } from "../models/claimedTickets.model.js";
import { Op } from "sequelize";

// Helper: Extract date from datetime string (e.g., "27-07-2025 11:34:24" => "27-07-2025")
function extractDate(datetimeStr) {
  return typeof datetimeStr === "string" ? datetimeStr.split(" ")[0] : "";
}

// Helper: "30-00 : 3" => {ticketNumber: "3000", quantity: 3}
function extractTicketNumberAndQuantity(str) {
  if (!str) return {};
  const [numPart, qtyPart] = str.split(":").map(s => s.trim());
  return {
    ticketNumber: numPart ? numPart.replace("-", "") : "",
    quantity: qtyPart ? parseInt(qtyPart, 10) : 0
  };
}

// Helper: "30-00 : 3, 30-11 : 4" => [{ticketNumber: "3000", quantity: 3}, ...]
function parseTicketNumberString(ticketNumberStr) {
  if (!ticketNumberStr) return [];
  if (typeof ticketNumberStr !== "string") ticketNumberStr = String(ticketNumberStr);
  return ticketNumberStr.split(",").map(extractTicketNumberAndQuantity);
}

// Helper: Remove leading zero from hour: "08:45 PM" => "8:45 PM"
function normalizeDrawTime(str) {
  if (!str) return "";
  return str.replace(/^0(\d:)/, "$1");
}

// Helper: Robust extraction of ticket numbers array
function extractTicketNumbers(ticketNumbersArr) {
  if (!ticketNumbersArr) return [];
  if (typeof ticketNumbersArr === "string") {
    try {
      const arr = JSON.parse(ticketNumbersArr);
      if (Array.isArray(arr)) ticketNumbersArr = arr;
      else return [ticketNumbersArr];
    } catch {
      // fallback: comma separated string
      return ticketNumbersArr.split(",").map(str => str.trim());
    }
  }
  if (!Array.isArray(ticketNumbersArr)) return [];
  // Array of objects: get ticketNumber or number
  return ticketNumbersArr.map(obj =>
    obj.ticketNumber || obj.number || (typeof obj === "string" ? obj : "")
  ).filter(Boolean);
}

// Helper: Sum quantity (quantity > winningValue > fallback 1)
function getTotalQuantity(ticketNumbersArr) {
  if (!Array.isArray(ticketNumbersArr)) return 0;
  return ticketNumbersArr.reduce((sum, t) => {
    if (t.quantity !== undefined) return sum + Number(t.quantity || 0);
    if (t.winningValue !== undefined) return sum + Number(t.winningValue || 0);
    return sum + 1;
  }, 0);
}

// -------- CONTROLLERS --------

// 1. Check if ticket is a winner
export const checkTicketWinningStatus = async (req, res) => {
  try {
    const { ticketId } = req.body;
    if (!ticketId) {
      return res.status(400).json({ error: "ticketId is required" });
    }

    // 1. Get ticket details
    const ticket = await tickets.findOne({
      where: { id: ticketId },
      attributes: ["gameTime", "loginId", "ticketNumber", "drawTime"],
    });

    if (!ticket) {
      return res.status(404).json({ status: "error", message: "Ticket not found" });
    }

    const drawDate = extractDate(ticket.gameTime);
    const loginId = ticket.loginId;

    // 2. Parse drawTime (could be string, JSON string, or array)
    let drawTimes = ticket.drawTime;
    if (typeof drawTimes === "string") {
      try { drawTimes = JSON.parse(drawTimes); } catch { drawTimes = [drawTimes]; }
    }
    if (!Array.isArray(drawTimes)) drawTimes = [drawTimes];

    // Normalize all draw times
    drawTimes = drawTimes
      .filter(Boolean)
      .map(dt => typeof dt === "string" ? normalizeDrawTime(dt) : dt)
      .filter(Boolean);

    // 3. Parse ticket numbers
    let ticketNumberRaw = ticket.ticketNumber;
    if (typeof ticketNumberRaw !== "string") ticketNumberRaw = String(ticketNumberRaw);
    const ticketNumbersArr = extractTicketNumbers(ticketNumberRaw);

    let results = [];
    let allWinningNumbersSet = new Set();
    let anyDeclaration = false;
    let anyWinning = false;

    // 4. Check each draw time
    for (let dt of drawTimes) {
      const winningRow = await winningNumbers.findOne({
        where: {
          loginId: loginId,
          DrawTime: dt,
          drawDate: drawDate,
        },
        attributes: ["winningNumbers"],
      });

      if (!winningRow) continue;
      anyDeclaration = true;

      // Parse winning numbers
      let winningNums = winningRow.winningNumbers;
      if (typeof winningNums === "string") {
        try { winningNums = JSON.parse(winningNums); } catch { }
      }

      // Add all winning numbers for this draw to the set
      if (Array.isArray(winningNums)) {
        winningNums.forEach(obj => allWinningNumbersSet.add(obj.number));
      }

      // Check each ticket number
      const matches = ticketNumbersArr
        .map(num => {
          const match = Array.isArray(winningNums) ? winningNums.find(obj => obj.number === num) : null;
          if (match) {
            return { number: num, winningValue: match.value, drawTime: dt };
          }
          return null;
        })
        .filter(Boolean);

      if (matches.length > 0) {
        anyWinning = true;
        results.push(...matches);
      }
    }

    // 5. Response
    if (!anyDeclaration) {
      return res.status(200).json({
        status: "no_declaration",
        message: "No winning was declared for this ticket",
        drawDate,
        drawTimes,
        ticketNumbers: ticketNumbersArr
      });
    } else if (anyWinning) {
      return res.status(200).json({
        status: "winner",
        message: "Winning found",
        drawDate,
        drawTimes,
        winningTickets: results,
        allWinningNumbers: Array.from(allWinningNumbersSet)
      });
    } else {
      return res.status(200).json({
        status: "no_winning",
        message: "No winning ticket found",
        drawDate,
        drawTimes,
        ticketNumbers: ticketNumbersArr,
        allWinningNumbers: Array.from(allWinningNumbersSet)
      });
    }

  } catch (error) {
    console.error("Error in checkTicketWinningStatus:", error);
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

/* ======================= Controller ======================= */

export const claimTicket = async (req, res) => {
  try {
    const { ticketId } = req.body;
    const PAYOUT_RATE = 180;

    if (!ticketId) {
      return res.status(400).json({ status: "error", message: "ticketId is required" });
    }

    // Block if already claimed
    const alreadyClaimed = await claimedTickets.findOne({
      where: { TicketId: ticketId },
      attributes: ["id", "TicketId"],
    });
    if (alreadyClaimed) {
      return res.status(409).json({
        status: "already_claimed",
        message: "Ticket already claimed",
      });
    }

    // Load ticket
    const ticket = await tickets.findOne({
      where: { id: ticketId },
      attributes: ["id", "loginId", "ticketNumber", "drawTime", "gameTime"],
    });
    if (!ticket) {
      return res.status(404).json({ status: "error", message: "Ticket not found" });
    }

    // Normalize fields
    const drawDateDDMMYYYY = extractDate(ticket.gameTime);    // "DD-MM-YYYY"
    const drawDateISO = toYYYYMMDD(drawDateDDMMYYYY);         // "YYYY-MM-DD"
    const ticketDrawTimes = toTimeArray(ticket.drawTime);     // ["10:45 PM", ...]
    const ticketNumbers = parseTicketNumberAny(ticket.ticketNumber); // [{ticketNumber, quantity}]

    // Fast lookup for quantity by ticket number
    const qtyByTicket = new Map(ticketNumbers.map(t => [t.ticketNumber, t.quantity]));

    // Fetch winners for same login + date
    const winningRows = await winningNumbers.findAll({
      where: { loginId: ticket.loginId, drawDate: drawDateISO },
      attributes: ["winningNumbers", "DrawTime"],
    });

    // Build winners per time
    const winnersByTime = {};
    for (const row of winningRows) {
      const times = toTimeArray(row.DrawTime);
      let nums = row.winningNumbers;
      if (typeof nums === "string") {
        try { nums = JSON.parse(nums); } catch { nums = []; }
      }
      const numberList = Array.isArray(nums)
        ? nums.map(o => String(o?.number ?? "").replace(/[^0-9]/g, "")).filter(Boolean)
        : [];
      times.forEach((t) => {
        const key = String(t || "").trim();
        if (!key) return;
        if (!winnersByTime[key]) winnersByTime[key] = new Set();
        numberList.forEach(n => winnersByTime[key].add(n));
      });
    }

    // Compare for each ticket time and accumulate ONLY matches
    const matches = [];
    for (const time of new Set(ticketDrawTimes.map(t => String(t).trim()))) {
      const winnersAtTime = winnersByTime[time] || new Set();
      if (winnersAtTime.size === 0) continue;

      for (const { ticketNumber } of ticketNumbers) {
        if (winnersAtTime.has(ticketNumber)) {
          const qty = Number(qtyByTicket.get(ticketNumber) || 0);
          if (qty > 0) {
            matches.push({
              ticketNumber,
              quantity: qty,
              calculatedValue: qty * PAYOUT_RATE,
            });
          }
        }
      }
    }

    // If no matches
    if (matches.length === 0) {
      return res.status(200).json({
        status: "no_win",
        matches: [],
      });
    }

    // Persist claim with only matched tickets
    const now = new Date();
    const claimedTime = now.toTimeString().split(" ")[0]; // "HH:MM:SS"
    const claimedDate = now.toISOString().split("T")[0];  // "YYYY-MM-DD"

    await claimedTickets.create({
      TicketId: ticket.id,
      loginId: ticket.loginId,
      ticketNumbers: matches,                 // store only matches
      drawTime: ticketDrawTimes.join(","),    // save times (optional: only times that hit)
      drawDate: drawDateDDMMYYYY,             // keep tickets' format
      claimedTime,
      claimedDate,
    });

    return res.status(201).json({
      status: "ticket_claimed",
      matches, // [{ ticketNumber, quantity, calculatedValue }]
    });

  } catch (error) {
    console.error("Error in claimTicket (minimal response):", error);
    return res.status(500).json({ status: "error", message: "Internal server error" });
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

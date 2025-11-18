import { tickets } from "../models/ticket.model.js";
import { winningNumbers } from "../models/winningNumbers.model.js";
import { claimedTickets } from "../models/claimedTickets.model.js";
import dayjs from "dayjs";
import Admin from "../models/admins.model.js";
import { sequelizeCon } from "../init/dbConnection.js";

/* ------------------------- HELPER FUNCTIONS ------------------------- */

// Normalize draw time to "HH:MM AM/PM"
function normalizeDrawTime(str) {
  if (!str) return "";
  let clean = String(str).trim().toUpperCase();
  clean = clean.replace(/(AM|PM)/, " $1").trim();
  const match = clean.match(/^(\d{1,2})[:.]?(\d{0,2})?\s*(AM|PM)$/);
  if (!match) return clean;
  let [, h, m, period] = match;
  h = String(h).padStart(2, "0");
  m = m ? String(m).padStart(2, "0") : "00";
  return `${h}:${m} ${period}`;
}

function parseDrawTimeToArray(raw) {
  if (!raw) return [];

  // Already array
  if (Array.isArray(raw)) return raw.filter(Boolean).map(String);

  // Try JSON parse
  if (typeof raw === "string") {
    const s = raw.trim();
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) return parsed.filter(Boolean).map(String);
      if (typeof parsed === "string" && parsed.trim()) return [parsed.trim()];
    } catch {
      return [s];
    }
  }

  return [String(raw)];
}


export const checkTicketWinningStatus = async (req, res) => {
  try {
    const { ticketId } = req.body;
    const PAYOUT_RATE = 180;

    // Step 1: Validate input
    if (!ticketId) {
      return res.status(400).json({
        status: "error",
        message: "ticketId is required.",
      });
    }

    console.log("🎯 Checking Ticket ID:", ticketId);

    // Step 2: Check if already claimed
    const alreadyClaimed = await claimedTickets.findOne({
      where: { TicketId: ticketId },
    });

    if (alreadyClaimed) {
      return res.status(200).json({
        status: "already_claimed",
        message: "This ticket has already been claimed.",
      });
    }

    // Step 3: Fetch ticket details
    const ticket = await tickets.findOne({
      where: { id: ticketId },
      attributes: ["id", "loginId", "ticketNumber", "drawTime", "gameTime"],
    });

    if (!ticket) {
      return res.status(404).json({
        status: "error",
        message: "Ticket not found.",
      });
    }

    const { ticketNumber, drawTime, gameTime } = ticket;

    // Step 4: Get draw date from gameTime (format: "16-11-2025 16:22:09" → "2025-11-16")
    let drawDate = "";
    if (typeof gameTime === "string") {
      const datePart = gameTime.split(" ")[0]; // "16-11-2025"
      const parts = datePart.split("-"); // ["16", "11", "2025"]
      if (parts.length === 3) {
        drawDate = `${parts[2]}-${parts[1]}-${parts[0]}`; // "2025-11-16"
      }
    }

    console.log("📅 Draw Date:", drawDate);

    // Step 5: Parse draw times
    let parsedDrawTimes = [];
    try {
      parsedDrawTimes = Array.isArray(drawTime) ? drawTime : JSON.parse(drawTime);
    } catch {
      parsedDrawTimes = [drawTime];
    }
    
    parsedDrawTimes = parsedDrawTimes
      .map((t) => normalizeDrawTime(t))
      .filter(Boolean);

    console.log("🕒 Draw Times:", parsedDrawTimes);

    // Step 6: Parse ticket numbers
    let parsedTickets = [];
    try {
      parsedTickets = Array.isArray(ticketNumber) ? ticketNumber : JSON.parse(ticketNumber);
    } catch (error) {
      return res.status(400).json({
        status: "error",
        message: "Invalid ticket number format.",
      });
    }

    console.log("🎫 Ticket Numbers:", parsedTickets);

    // Step 7: Fetch winning numbers for the date
    const winningRows = await winningNumbers.findAll({
      where: { drawDate },
      attributes: ["winningNumbers", "DrawTime"],
    });

    if (!winningRows.length) {
      return res.status(200).json({
        status: "no_winning_data",
        message: "No winning numbers found for this draw date.",
        drawDate,
      });
    }

    // Step 8: Find matching draw times and get winning numbers
    const allWinningNumbers = new Set();

    for (const row of winningRows) {
      let winTimes = [];
      
      // Parse draw times from winning numbers row
      try {
        if (Array.isArray(row.DrawTime)) {
          winTimes = row.DrawTime;
        } else if (typeof row.DrawTime === "string") {
          try {
            const parsed = JSON.parse(row.DrawTime);
            winTimes = Array.isArray(parsed) ? parsed : [parsed];
          } catch {
            winTimes = [row.DrawTime];
          }
        }
      } catch {
        winTimes = [];
      }

      // Normalize winning draw times
      winTimes = winTimes.map((t) => normalizeDrawTime(t)).filter(Boolean);

      // Check if any draw time matches
      const hasMatchingDrawTime = parsedDrawTimes.some((ticketTime) => 
        winTimes.includes(ticketTime)
      );

      if (hasMatchingDrawTime) {
        // Parse winning numbers
        let winners = [];
        try {
          winners = Array.isArray(row.winningNumbers) 
            ? row.winningNumbers 
            : JSON.parse(row.winningNumbers);
        } catch {
          winners = [];
        }

        // Add winning numbers to set
        winners.forEach(win => {
          if (win && win.number) {
            allWinningNumbers.add(win.number);
          }
        });
      }
    }

    console.log("🏆 Winning Numbers:", Array.from(allWinningNumbers));

    // Step 9: Check for matches between ticket numbers and winning numbers
    const matches = [];
    
    for (const ticket of parsedTickets) {
      if (allWinningNumbers.has(ticket.ticketNumber)) {
        const payout = ticket.quantity * PAYOUT_RATE;
        matches.push({
          number: ticket.ticketNumber,
          quantity: ticket.quantity,
          payout,
        });
      }
    }

    console.log("✅ Matches Found:", matches);

    // Step 10: Calculate total winning amount
    const totalWinningAmount = matches.reduce((sum, match) => sum + match.payout, 0);

    // Step 11: Send response
    if (matches.length === 0) {
      return res.status(200).json({
        status: "no_win",
        message: "Ticket has no winning numbers.",
        drawDate,
        drawTimes: parsedDrawTimes,
        totalWinningAmount: 0,
        claimable: false,
      });
    }

    return res.status(200).json({
      status: "winner",
      message: "This is a winning ticket!",
      ticketId,
      drawDate,
      drawTimes: parsedDrawTimes,
      matches,
      totalWinningAmount,
      winningNumbers: Array.from(allWinningNumbers),
      claimable: true,
    });

  } catch (error) {
    console.error("🔥 Error checking ticket status:", error);
    return res.status(500).json({
      status: "error",
      message: "An unexpected error occurred while checking the ticket status.",
    });
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
  const t = await sequelizeCon.transaction();

  try {
    const { ticketId } = req.body;
    const PAYOUT_RATE = 180;

    if (!ticketId) {
      await t.rollback();
      return res.status(400).json({
        status: "error",
        message: "ticketId is required",
      });
    }

    /* 1️⃣ Check if already claimed */
    const alreadyClaimed = await claimedTickets.findOne({
      where: { TicketId: ticketId },
      transaction: t,
    });

    if (alreadyClaimed) {
      await t.rollback();
      return res.status(409).json({
        status: "already_claimed",
        message: "Ticket already claimed",
      });
    }

    /* 2️⃣ Fetch Ticket */
    const ticket = await tickets.findOne({
      where: { id: ticketId },
      attributes: ["id", "loginId", "ticketNumber", "drawTime", "gameTime"],
      transaction: t,
    });

    if (!ticket) {
      await t.rollback();
      return res.status(404).json({
        status: "error",
        message: "Ticket not found",
      });
    }

    const { loginId, ticketNumber, drawTime, gameTime } = ticket;

    /* 3️⃣ Extract drawDate from gameTime → "16-11-2025 16:22:09" → "2025-11-16" */
    let drawDate = "";
    if (typeof gameTime === "string") {
      const datePart = gameTime.split(" ")[0]; // 16-11-2025
      const parts = datePart.split("-");
      if (parts.length === 3) {
        drawDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
      }
    }

    /* 4️⃣ Parse drawTimes safely */
    let parsedDrawTimes = [];
    try {
      parsedDrawTimes = Array.isArray(drawTime) ? drawTime : JSON.parse(drawTime);
    } catch {
      parsedDrawTimes = [drawTime];
    }

    parsedDrawTimes = parsedDrawTimes
      .map((t) => normalizeDrawTime(t))
      .filter(Boolean);

    /* 5️⃣ Parse ticket numbers safely */
    let parsedTickets = [];
    try {
      parsedTickets = Array.isArray(ticketNumber)
        ? ticketNumber
        : JSON.parse(ticketNumber);
    } catch {
      await t.rollback();
      return res.status(400).json({
        status: "error",
        message: "Invalid ticket number format",
      });
    }

    /* 6️⃣ Fetch all winning rows for that date */
    const winningRows = await winningNumbers.findAll({
      where: { drawDate },
      attributes: ["winningNumbers", "DrawTime"],
      transaction: t,
    });

    if (!winningRows.length) {
      await t.rollback();
      return res.status(200).json({
        status: "no_winning_data",
        message: "Winning numbers not published for this date",
      });
    }

    /* 7️⃣ Build set of winning numbers matching draw times */
    const winSet = new Set();

    for (const row of winningRows) {
      let winTimes = [];

      // Parse DrawTime formats
      try {
        if (Array.isArray(row.DrawTime)) {
          winTimes = row.DrawTime;
        } else if (typeof row.DrawTime === "string") {
          try {
            const parsed = JSON.parse(row.DrawTime);
            winTimes = Array.isArray(parsed) ? parsed : [parsed];
          } catch {
            winTimes = [row.DrawTime];
          }
        }
      } catch {
        winTimes = [];
      }

      winTimes = winTimes.map((t) => normalizeDrawTime(t)).filter(Boolean);

      // Match draw times
      const match = parsedDrawTimes.some((t) => winTimes.includes(t));
      if (!match) continue;

      // Parse winning numbers safely
      let winners = [];
      try {
        winners = Array.isArray(row.winningNumbers)
          ? row.winningNumbers
          : JSON.parse(row.winningNumbers);
      } catch {
        winners = [];
      }

      winners.forEach((w) => {
        if (w && w.number) winSet.add(w.number);
      });
    }

    /* 8️⃣ Compare ticket numbers */
    const matches = [];

    for (const tk of parsedTickets) {
      if (winSet.has(tk.ticketNumber)) {
        matches.push({
          number: tk.ticketNumber,
          quantity: tk.quantity,
          payout: tk.quantity * PAYOUT_RATE,
        });
      }
    }

    if (!matches.length) {
      await t.rollback();
      return res.status(200).json({
        status: "no_win",
        message: "Ticket has no winning numbers",
      });
    }

    /* 9️⃣ Total winning amount */
    const totalWinningAmount = matches.reduce((s, m) => s + m.payout, 0);

    /* 🔟 Insert into claimedTickets table */
    const now = new Date();
    const claimedDate = now.toISOString().split("T")[0];
    const claimedTime = now.toTimeString().split(" ")[0];

    await claimedTickets.create(
      {
        TicketId: ticketId,
        loginId,
        ticketNumbers: matches,
        drawTime: parsedDrawTimes.join(", "),
        drawDate,
        claimedDate,
        claimedTime,
      },
      { transaction: t }
    );

    /* 1️⃣1️⃣ Update admin balance */
    const admin = await Admin.findOne({
      where: { id: loginId },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (admin) {
      admin.balance = Number(admin.balance || 0) + totalWinningAmount;
      await admin.save({ transaction: t });
    }

    /* 1️⃣2️⃣ Commit transaction */
    await t.commit();

    return res.status(201).json({
      status: "ticket_claimed",
      message: `Ticket claimed. ₹${totalWinningAmount} added to balance.`,
      ticketId,
      drawDate,
      drawTimes: parsedDrawTimes,
      matches,
      totalWinningAmount,
    });

  } catch (err) {
    await t.rollback();
    console.error("🔥 CLAIM ERROR:", err);
    return res.status(500).json({
      status: "error",
      message: "Server error during ticket claim",
      error: err.message,
    });
  }
};




const getTotalQuantity = (ticketNumbers) => {
  if (!Array.isArray(ticketNumbers)) return 0;
  return ticketNumbers.reduce((sum, item) => sum + (item?.quantity || 0), 0);
};

const extractTicketNumbers = (ticketNumbers) => {
  if (!Array.isArray(ticketNumbers)) return [];
  return ticketNumbers.map((item) => item?.ticketNumber);  // Make sure it's ticketNumber, not 'number'
};

export const getClaimedTickets = async (req, res) => {
  try {
    let { fromDate, toDate } = req.body;

    if (!fromDate || !toDate) {
      const today = dayjs().format("YYYY-MM-DD");
      fromDate = today;
      toDate = today;
    }

    const claimed = await claimedTickets.findAll({
      where: {
        claimedDate: {
          [Op.gte]: fromDate,
          [Op.lte]: toDate,
        },
      },
      order: [["drawDate", "DESC"], ["drawTime", "DESC"]],
    });

    if (!claimed.length) {
      return res.status(200).json({
        message: `No claimed tickets found between ${fromDate} and ${toDate}`,
        totalRecords: 0,
        distributedData: {},
      });
    }

    const uniqueLoginIds = [...new Set(claimed.map((row) => row.loginId))];
    const admins = await Admin.findAll({
      where: { id: uniqueLoginIds },
      attributes: ["id", "shopName", "contactPersonName", "userName"],
    });

    const adminMap = {};
    admins.forEach((a) => {
      adminMap[a.id] = {
        shopName: a.shopName,
        contactPersonName: a.contactPersonName,
        userName: a.userName,
      };
    });

    const formattedData = claimed.map((row) => {
      let ticketNumbersArr = row.ticketNumbers;

      if (typeof ticketNumbersArr === "string") {
        try {
          ticketNumbersArr = JSON.parse(ticketNumbersArr);  // Ensure ticketNumbers is parsed correctly
        } catch {
          ticketNumbersArr = [];
        }
      }

      // Clean the ticketNumbers array (parse and clean them if needed)
      const cleanedTicketNumbers = ticketNumbersArr.map((ticket) => {
        // Ensure each ticket number and quantity is correctly parsed and formatted
        const { ticketNumber, quantity } = ticket;
        return {
          ticketNumber: ticketNumber.replace(/[^0-9]/g, ""), // Keep only numeric values in ticket number
          quantity: quantity || 0,  // Default to 0 if quantity is missing
        };
      });

      const admin = adminMap[row.loginId] || {
        shopName: "Unknown",
        contactPersonName: "N/A",
        userName: "N/A",
      };

      return {
        ticketId: row.TicketId,
        adminId: row.loginId,
        shopName: admin.shopName,
        contactPersonName: admin.contactPersonName,
        userName: admin.userName,
        drawDate: row.drawDate,
        drawTime: row.drawTime,
        claimedDate: row.claimedDate,
        claimedTime: row.claimedTime,
        totalQuantity: getTotalQuantity(cleanedTicketNumbers),
        ticketNumbers: extractTicketNumbers(cleanedTicketNumbers),
      };
    });

    return res.status(200).json({
      message: `Claimed tickets between ${fromDate} and ${toDate}`,
      totalRecords: formattedData.length,
      data: formattedData,
    });
  } catch (error) {
    console.error("Error in getClaimedTickets:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

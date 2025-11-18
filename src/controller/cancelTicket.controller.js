import { tickets } from "../models/ticket.model.js";
import { cancelledTickets } from "../models/cancelledTicket.model.js";
import { sequelizeCon } from "../init/dbConnection.js";
import { Op } from "sequelize";
import Admin from "../models/admins.model.js";

/* ---------- Helpers ---------- */

// Get today's date (YYYY-MM-DD)
function todayDateStr() {
  return new Date().toISOString().split("T")[0];
}

// Safely flatten nested or stringified drawTime fields
function flattenDrawTimes(drawTimeField) {
  const result = [];
  if (!drawTimeField) return result;

  try {
    let field = drawTimeField;

    // Remove extra quotes if double encoded
    if (typeof field === "string") {
      field = field.replace(/^"+|"+$/g, "").trim();
      if (field.startsWith("[") || field.startsWith('"[')) {
        const parsed = JSON.parse(field);
        return flattenDrawTimes(parsed);
      }
    }

    if (Array.isArray(field)) {
      field.forEach((item) => result.push(...flattenDrawTimes(item)));
    } else {
      result.push(String(field).trim());
    }
  } catch (err) {
    console.warn("⚠️ Error parsing drawTime:", drawTimeField, err.message);
  }

  return result;
}

/* 🔹 Get next 15-min draw slot in HH:MM AM/PM format */
function getNextDrawSlot() {
  const now = new Date();
  const minutes = now.getMinutes();
  const remainder = minutes % 15;

  if (remainder !== 0) {
    now.setMinutes(minutes + (15 - remainder)); // round up to next 15-min
  }

  now.setSeconds(0);
  now.setMilliseconds(0);

  let hours = now.getHours();
  const mins = now.getMinutes();
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;

  const hourStr = hours < 10 ? "0" + hours : hours;
  const minuteStr = mins < 10 ? "0" + mins : mins;
  return `${hourStr}:${minuteStr} ${ampm}`;
}

/* 🔹 Get next 15-min slot as Date object */
function getNextDrawSlotDate() {
  const now = new Date();
  const minutes = now.getMinutes();
  const remainder = minutes % 15;
  if (remainder !== 0) now.setMinutes(minutes + (15 - remainder));
  now.setSeconds(0);
  now.setMilliseconds(0);
  return now;
}

export const getTicketsByDrawTimeForToday = async (req, res) => {
  try {
    const { loginId } = req.body;
    if (!loginId)
      return res.status(400).json({ message: "loginId is required" });

    const today = todayDateStr();
    const tomorrow = new Date();
    tomorrow.setDate(new Date().getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];

    console.log(`\n🧾 [TICKET CHECK] Admin ID: ${loginId}`);
    console.log(`📅 Today: ${today}`);

    /* -------------------------------------------------------------
       FETCH TODAY'S TICKETS
    ------------------------------------------------------------- */
    const todaysTickets = await tickets.findAll({
      where: {
        loginId,
        createdAt: {
          [Op.gte]: `${today} 00:00:00`,
          [Op.lt]: `${tomorrowStr} 00:00:00`,
        },
      },
      order: [["createdAt", "ASC"]],
    });

    if (!todaysTickets.length) {
      console.warn("⚠️ No tickets found for today.");
      return res.json([]);
    }

    /* -------------------------------------------------------------
       PARSE DRAW TIMES (ALWAYS CLEAN JSON)
    ------------------------------------------------------------- */
    const parseDrawTime = (dt) => {
      if (!dt) return [];

      try {
        if (Array.isArray(dt)) return dt;
        if (typeof dt === "string" && dt.trim().startsWith("[")) {
          return JSON.parse(dt);
        }
        return [dt];
      } catch {
        return [dt];
      }
    };

    /* -------------------------------------------------------------
       PARSE TICKET NUMBER (ALWAYS CLEAN JSON)
    ------------------------------------------------------------- */
    const parseTicketNumber = (tn) => {
      try {
        if (!tn) return [];

        if (typeof tn === "string" && tn.trim().startsWith("[")) {
          return JSON.parse(tn); // [{ticketNumber:"5000", quantity:2}, ...]
        }

        if (Array.isArray(tn)) return tn;

        return [];
      } catch {
        return [];
      }
    };

    /* -------------------------------------------------------------
       GET TARGET SLOT (MATCHES 02:00 PM & 2:00 PM)
    ------------------------------------------------------------- */
    const targetSlot = getNextDrawSlot(); // "02:00 PM"
    const altSlot = targetSlot.replace(/^0/, ""); // "2:00 PM"

    console.log(`🎯 Target Draw Time: ${targetSlot} / ${altSlot}`);

    /* -------------------------------------------------------------
       FILTER TICKETS MATCHING DRAW TIME
    ------------------------------------------------------------- */
    const filteredTickets = todaysTickets.filter((t) => {
      const times = parseDrawTime(t.drawTime);
      return times.includes(targetSlot) || times.includes(altSlot);
    });

    if (!filteredTickets.length) {
      console.log(`⚠️ No tickets found for drawTime: ${targetSlot}`);
      return res.json([]);
    }

    console.log(`✅ ${filteredTickets.length} tickets matched draw time.`);

    /* -------------------------------------------------------------
       CLEAN FINAL RESPONSE FOR FRONTEND
    ------------------------------------------------------------- */
    const finalResponse = [
      {
        drawTime: targetSlot,
        drawDate: today,
        tickets: filteredTickets.map((t) => ({
          id: t.id,
          loginId: t.loginId,
          drawTime: parseDrawTime(t.drawTime), // array
          ticketNumber: parseTicketNumber(t.ticketNumber), // proper array of objects
          totalPoints: parseFloat(t.totalPoints),
          totalQuatity: t.totalQuatity,
          createdAt: t.createdAt,
        })),
      },
    ];

    return res.json(finalResponse);
  } catch (error) {
    console.error("🔥 Error in getTicketsByDrawTimeForToday:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};


/* ---------- Controller 2: Cancel Ticket by Ticket Number ---------- */
export const deleteTicketByNumber = async (req, res) => {
  const { ticketNo } = req.body;
  if (!ticketNo)
    return res.status(400).json({ error: "ticketNo is required" });

  const t = await sequelizeCon.transaction();
  try {
    console.log(`🗑️ Request to delete ticket: ${ticketNo}`);

    // --- Normalize ticket number ---
    const normalizedTicketNo = ticketNo
      .replace(/[{}"]/g, "")
      .replace(/\s+/g, " ")
      .trim();

    // --- Find ticket directly ---
    const allTickets = await tickets.findAll({ transaction: t });
    const matchedTicket = allTickets.find((tk) => {
      const stored =
        typeof tk.ticketNumber === "object"
          ? JSON.stringify(tk.ticketNumber)
          : tk.ticketNumber;
      const normalizedStored = stored
        .replace(/[{}"]/g, "")
        .replace(/\s+/g, " ")
        .trim();
      return normalizedStored === normalizedTicketNo;
    });

    if (!matchedTicket) {
      await t.rollback();
      console.warn(`⚠️ Ticket "${ticketNo}" not found.`);
      return res.status(404).json({ error: "Ticket not found" });
    }

    console.log(`🎟️ Matched ticket ID: ${matchedTicket.id}`);

    // --- Find Admin by loginId from ticket ---
    const admin = await Admin.findOne({
      where: { id: matchedTicket.loginId },
      transaction: t,
      lock: t.LOCK.UPDATE, // prevent concurrent writes
    });

    if (!admin) {
      await t.rollback();
      console.warn(`⚠️ Admin not found for loginId: ${matchedTicket.loginId}`);
      return res.status(404).json({ error: "Admin not found" });
    }

    // --- Perform numeric addition safely ---
    const previousBalance = Number(admin.balance) || 0;
    const ticketPoints = Number(matchedTicket.totalPoints) || 0;
    const newBalance = previousBalance + ticketPoints;

    admin.balance = newBalance;
    await admin.save({ transaction: t });

    console.log(
      `💰 Admin #${admin.id} balance updated: ${previousBalance} + ${ticketPoints} = ${newBalance}`
    );

    // --- Move ticket to cancelledTickets table ---
    await cancelledTickets.create(
      {
        gameTime: matchedTicket.gameTime,
        loginId: matchedTicket.loginId,
        ticketNumber: matchedTicket.ticketNumber,
        totalQuatity: matchedTicket.totalQuatity,
        totalPoints: matchedTicket.totalPoints,
        drawTime: matchedTicket.drawTime,
      },
      { transaction: t }
    );

    console.log(`📦 Ticket moved to cancelledTickets successfully.`);

    // --- Delete the ticket from main table ---
    await tickets.destroy({
      where: { id: matchedTicket.id },
      transaction: t,
    });

    await t.commit();
    console.log(`✅ Ticket ID ${matchedTicket.id} deleted successfully.`);

    return res.json({
      message:
        "Ticket cancelled, points refunded to admin, and record moved to cancelledTickets successfully.",
      deletedTicket: {
        id: matchedTicket.id,
        loginId: matchedTicket.loginId,
        drawTime: matchedTicket.drawTime,
        totalPoints: matchedTicket.totalPoints,
        totalQuatity: matchedTicket.totalQuatity,
      },
      refundDetails: {
        refundedTo: admin.userName || admin.contactPersonName || "Admin",
        refundedPoints: ticketPoints,
        previousBalance,
        newBalance,
      },
    });
  } catch (error) {
    await t.rollback();
    console.error("🔥 Error deleting ticket:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};



/* ---------- Controller 3: Show Today's Cancelled Tickets (using createdAt) ---------- */
export const getCancelledTicketsForToday = async (req, res) => {
  try {
    const { loginId } = req.body;
    if (!loginId)
      return res.status(400).json({ message: "loginId is required" });

    const today = todayDateStr();
    const tomorrow = new Date();
    tomorrow.setDate(new Date().getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];

    console.log(`\n🧾 [CANCELLED TICKET CHECK] Admin ID: ${loginId}`);
    console.log(`📅 Today: ${today}`);

    // Fetch all cancelled tickets for today
    const todaysTickets = await cancelledTickets.findAll({
      where: {
        loginId,
        createdAt: {
          [Op.gte]: `${today} 00:00:00`,
          [Op.lt]: `${tomorrowStr} 00:00:00`,
        },
      },
      order: [["createdAt", "ASC"]],
    });

    if (!todaysTickets.length) {
      console.warn("⚠️ No cancelled tickets found for today.");
      return res.json([]);
    }

    // Get next 15-minute slot
    const nextSlot = getNextDrawSlotDate();
    const windowStart = new Date(nextSlot.getTime() - 15 * 60 * 1000);
    const windowEnd = new Date(nextSlot);

    console.log(`🎯 Target slot window: ${windowStart.toISOString()} → ${windowEnd.toISOString()}`);

    // Filter tickets where createdAt is between (slot-15min, slot)
    const filteredTickets = todaysTickets.filter((t) => {
      const created = new Date(t.createdAt);
      return created >= windowStart && created < windowEnd;
    });

    if (!filteredTickets.length) {
      console.log(`⚠️ No cancelled tickets found in this time window.`);
      return res.json([]);
    }

    console.log(`✅ ${filteredTickets.length} cancelled tickets found for current slot.`);

    return res.json([
      {
        drawTime: getNextDrawSlot(),
        drawDate: today,
        tickets: filteredTickets.map((t) => ({
          id: t.id,
          loginId: t.loginId,
          drawTime: t.drawTime,
          ticketNumber: t.ticketNumber,
          totalPoints: t.totalPoints,
          totalQuatity: t.totalQuatity,
          createdAt: t.createdAt,
        })),
      },
    ]);
  } catch (error) {
    console.error("🔥 Error fetching cancelled tickets:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

import { tickets } from "../models/ticket.model.js";
import { cancelledTickets } from "../models/cancelledTicket.model.js";
import { sequelizeCon } from "../init/dbConnection.js";
import { Op } from "sequelize";
import Admin from "../models/admins.model.js";


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

    if (!loginId) {
      return res.status(400).json({ message: "loginId is required" });
    }

    /* ---------------------------------------------------
       STEP 1: TODAY RANGE (UTC — PRODUCTION SAFE)
       DB stores timestamps in UTC → query in UTC
    --------------------------------------------------- */
    const startUTC = new Date();
    startUTC.setUTCHours(0, 0, 0, 0);

    const endUTC = new Date();
    endUTC.setUTCHours(23, 59, 59, 999);

    console.log("🕒 UTC RANGE:", startUTC, "→", endUTC);

    /* ---------------------------------------------------
       STEP 2: FETCH TODAY'S TICKETS
    --------------------------------------------------- */
    const todaysTickets = await tickets.findAll({
      where: {
        loginId,
        createdAt: {
          [Op.gte]: startUTC,
          [Op.lte]: endUTC,
        },
      },
      order: [["createdAt", "ASC"]],
    });

    console.log("🎟️ Tickets found:", todaysTickets.length);

    if (!todaysTickets.length) {
      return res.json([]);
    }

    /* ---------------------------------------------------
       STEP 3: SAFE PARSERS
    --------------------------------------------------- */
    const parseDrawTime = (dt) => {
      if (!dt) return [];

      try {
        if (Array.isArray(dt)) return dt;

        if (typeof dt === "string") {
          if (dt.trim().startsWith("[")) {
            return JSON.parse(dt);
          }
          return [dt];
        }
      } catch (err) {
        console.error("❌ drawTime parse error:", dt);
      }

      return [];
    };

    const parseTicketNumber = (tn) => {
      if (!tn) return [];

      try {
        if (Array.isArray(tn)) return tn;

        if (typeof tn === "string") {
          if (tn.trim().startsWith("[")) {
            return JSON.parse(tn);
          }

          return tn.split(",").map((pair) => {
            const [n, q] = pair.split(":");
            return {
              ticketNumber: n?.trim(),
              quantity: Number(q?.trim()) || 1,
            };
          });
        }
      } catch (err) {
        console.error("❌ ticketNumber parse error:", tn);
      }

      return [];
    };

    /* ---------------------------------------------------
       STEP 4: CURRENT DRAW SLOT (IST — SAFE)
       DO NOT do manual +5.5 math
    --------------------------------------------------- */
    const nowIST = new Date(
      new Date().toLocaleString("en-US", {
        timeZone: "Asia/Kolkata",
      })
    );

    const normalizeTime = (t) => t.replace(/^0/, "").trim();

    const targetSlot = normalizeTime(
      getNextDrawSlot(nowIST).trim()
    );

    console.log("🎯 TARGET SLOT (IST):", targetSlot);

    /* ---------------------------------------------------
       STEP 5: FILTER BY DRAW TIME
    --------------------------------------------------- */
    const filteredTickets = todaysTickets.filter((t) => {
      const drawTimes = parseDrawTime(t.drawTime).map(normalizeTime);
      return drawTimes.includes(targetSlot);
    });

    console.log("✅ Matching tickets:", filteredTickets.length);

    if (!filteredTickets.length) {
      return res.json([]);
    }

    /* ---------------------------------------------------
       STEP 6: FINAL RESPONSE (FRONTEND SAFE)
    --------------------------------------------------- */
    const todayISTStr = nowIST.toISOString().split("T")[0];

    const finalResponse = [
      {
        drawTime: targetSlot,
        drawDate: todayISTStr,
        tickets: filteredTickets.map((t) => ({
          id: t.id,
          loginId: t.loginId,
          drawTime: parseDrawTime(t.drawTime),
          ticketNumber: parseTicketNumber(t.ticketNumber),
          totalPoints: Number(t.totalPoints || 0),
          totalQuatity: Number(t.totalQuatity || 0),
          createdAt: t.createdAt,
        })),
      },
    ];

    return res.json(finalResponse);
  } catch (err) {
    console.error("🔥 Controller Error:", err);
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

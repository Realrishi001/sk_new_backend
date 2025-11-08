import { tickets } from "../models/ticket.model.js";
import { sequelizeCon } from "../init/dbConnection.js";
import { cancelledTickets } from "../models/cancelledTicket.model.js";
import { Op } from "sequelize";

// Helper: format date as YYYY-MM-DD
function getTodayDateString() {
  const today = new Date();
  return today.toISOString().split("T")[0];
}

// Helper: convert drawTime ("03:15 PM") → Date object for today
function parseDrawTimeToToday(timeStr) {
  const [time, modifier] = timeStr.split(" ");
  let [hours, minutes] = time.split(":").map(Number);
  if (modifier === "PM" && hours !== 12) hours += 12;
  if (modifier === "AM" && hours === 12) hours = 0;
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes);
}

export const getTicketsByDrawTimeForToday = async (req, res) => {
  try {
    const { loginId } = req.body;
    if (!loginId) {
      return res.status(400).json({ error: "loginId is required" });
    }

    const todayDate = getTodayDateString();
    const tomorrow = new Date();
    tomorrow.setDate(new Date().getDate() + 1);
    const tomorrowDate = tomorrow.toISOString().split("T")[0];

    // 1️⃣ Fetch today's tickets for this user
    const todaysTickets = await tickets.findAll({
      where: {
        loginId,
        createdAt: {
          [Op.gte]: `${todayDate} 00:00:00`,
          [Op.lt]: `${tomorrowDate} 00:00:00`,
        },
      },
      order: [["createdAt", "ASC"]],
    });

    if (!todaysTickets || todaysTickets.length === 0) {
      return res.json([]);
    }

    // 2️⃣ Get all draw times from these tickets
    const allDrawTimes = new Set();
    todaysTickets.forEach((ticket) => {
      const times = Array.isArray(ticket.drawTime)
        ? ticket.drawTime
        : [ticket.drawTime];
      times.forEach((t) => allDrawTimes.add(t));
    });

    const drawTimesArray = Array.from(allDrawTimes);
    if (drawTimesArray.length === 0) return res.json([]);

    // 3️⃣ Find the next draw time (e.g. if now is 1:12 → pick 1:15)
    const now = new Date();
    let nextDraw = null;
    let smallestDiff = Infinity;

    for (const t of drawTimesArray) {
      const drawDate = parseDrawTimeToToday(t);
      const diff = drawDate - now;
      if (diff >= 0 && diff < smallestDiff) {
        smallestDiff = diff;
        nextDraw = t;
      }
    }

    if (!nextDraw) {
      return res.json([]); // no upcoming draw for today
    }

    // 4️⃣ Filter tickets that belong to this draw time
    const filteredTickets = [];
    todaysTickets.forEach((ticket) => {
      const times = Array.isArray(ticket.drawTime)
        ? ticket.drawTime
        : [ticket.drawTime];
      if (times.includes(nextDraw)) {
        filteredTickets.push({
          drawTime: nextDraw,
          drawDate: todayDate,
          ticketNumber: ticket.id,
          totalPoints: ticket.totalPoints,
        });
      }
    });

    // 5️⃣ Return clean response
    res.json([
      {
        drawTime: nextDraw,
        drawDate: todayDate,
        tickets: filteredTickets,
      },
    ]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Something went wrong" });
  }
};


export const deleteTicketByNumber = async (req, res) => {
  const { ticketNo } = req.body; // ticketNo should be the ticket's id

  if (!ticketNo) {
    return res.status(400).json({ error: "ticketNo (id) is required" });
  }

  // Use a transaction for safety
  const t = await sequelizeCon.transaction();
  try {
    // 1. Find the ticket by id
    const ticket = await tickets.findOne({
      where: { id: ticketNo },
      transaction: t,
    });

    if (!ticket) {
      await t.rollback();
      return res.status(404).json({ error: "Ticket not found" });
    }

    // 2. Move to cancelledTickets (use "totalQuatity" here)
    await cancelledTickets.create({
      gameTime: ticket.gameTime,
      loginId: ticket.loginId,
      ticketNumber: ticket.ticketNumber,
      totalQuatity: ticket.totalQuatity, // <-- spelling kept as you want!
      totalPoints: ticket.totalPoints,
      drawTime: ticket.drawTime,
    }, { transaction: t });

    // 3. Delete from tickets by id
    await tickets.destroy({
      where: { id: ticketNo },
      transaction: t,
    });

    // 4. Commit
    await t.commit();

    res.json({ message: "Ticket cancelled and moved to cancelledTickets" });
  } catch (error) {
    await t.rollback();
    console.error(error);
    res.status(500).json({ error: "Something went wrong" });
  }
};

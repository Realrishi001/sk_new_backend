import { Op } from "sequelize";
import { threed } from "../models/threed.model.js";
import ThreeDCancelledTicket from "../models/3dcancelledTicket.model.js";

export const getActive3DTickets = async (req, res) => {
  try {
    const { loginId } = req.body;

    if (!loginId) {
      return res.status(400).json({ message: "loginId is required" });
    }

    /* ---------------------------------------------------
       STEP 1: GET CURRENT IST TIME (SAFE)
    --------------------------------------------------- */
    const nowIST = new Date(
      new Date().toLocaleString("en-US", {
        timeZone: "Asia/Kolkata",
      })
    );

    /* ---------------------------------------------------
       STEP 2: IST DAY START & END
    --------------------------------------------------- */
    const istStart = new Date(
      nowIST.getFullYear(),
      nowIST.getMonth(),
      nowIST.getDate(),
      0, 0, 0, 0
    );

    const istEnd = new Date(
      nowIST.getFullYear(),
      nowIST.getMonth(),
      nowIST.getDate(),
      23, 59, 59, 999
    );

    /* ---------------------------------------------------
       STEP 3: CONVERT IST → UTC (FOR DB QUERY)
    --------------------------------------------------- */
    const startUTC = new Date(istStart.getTime() - 5.5 * 60 * 60 * 1000);
    const endUTC   = new Date(istEnd.getTime()   - 5.5 * 60 * 60 * 1000);

    console.log("🕒 3D UTC DAY RANGE:", startUTC, "→", endUTC);
    console.log("🕒 IST TODAY:", istStart.toDateString());

    /* ---------------------------------------------------
       STEP 4: FETCH TODAY'S 3D TICKETS
    --------------------------------------------------- */
    const activeTickets = await threed.findAll({
      where: {
        loginId,
        createdAt: {
          [Op.gte]: startUTC,
          [Op.lte]: endUTC,
        },
      },
      order: [["id", "DESC"]],
    });

    console.log("🎟️ Today 3D tickets:", activeTickets.length);

    /* ---------------------------------------------------
       STEP 5: RESPONSE
    --------------------------------------------------- */
    return res.json([
      {
        date: nowIST.toISOString().split("T")[0],
        tickets: activeTickets,
      },
    ]);
  } catch (err) {
    console.error("🔥 Get Active 3D Tickets Error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};


export const cancel3DTicket = async (req, res) => {
  try {
    const { ticketId } = req.body;

    if (!ticketId) {
      return res.status(400).json({ message: "ticketId is required" });
    }

    const ticket = await threed.findOne({
      where: { id: ticketId },
    });

    if (!ticket) {
      return res.status(404).json({ message: "3D Ticket not found" });
    }

    // 🔹 Save into cancelled table
    await ThreeDCancelledTicket.create({
      originalTicketId: ticket.id,
      loginId: ticket.loginId,
      drawTime: ticket.gameTime,
      ticketNumber: ticket.ticketNumbers,
      totalPoints: ticket.totalPoints,
      totalQuatity: ticket.totalQuantity,
    });

    // 🔹 Delete from active 3D tickets
    await threed.destroy({
      where: { id: ticketId },
    });

    return res.json({ message: "3D Ticket cancelled successfully" });
  } catch (err) {
    console.error("Cancel 3D Ticket Error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const restore3DTicket = async (req, res) => {
  try {
    const { cancelledId } = req.body;

    if (!cancelledId) {
      return res.status(400).json({ message: "cancelledId is required" });
    }

    const cancelled = await ThreeDCancelledTicket.findOne({
      where: { id: cancelledId },
    });

    if (!cancelled) {
      return res.status(404).json({ message: "Cancelled 3D ticket not found" });
    }

    // 🔹 Restore to active 3D tickets
    await threed.create({
      loginId: cancelled.loginId,
      gameTime: cancelled.drawTime,
      ticketNumbers: cancelled.ticketNumber,
      totalPoints: cancelled.totalPoints,
      totalQuantity: cancelled.totalQuatity,
    });

    // 🔹 Remove from cancelled table
    await ThreeDCancelledTicket.destroy({
      where: { id: cancelledId },
    });

    return res.json({ message: "3D Ticket restored successfully" });
  } catch (err) {
    console.error("Restore 3D Ticket Error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const getCancelled3DTickets = async (req, res) => {
  try {
    const { loginId } = req.body;

    if (!loginId) {
      return res.status(400).json({
        message: "loginId is required",
      });
    }

    /* ---------------------------------------------------
       STEP 1: CURRENT IST TIME (SAFE)
    --------------------------------------------------- */
    const nowIST = new Date(
      new Date().toLocaleString("en-US", {
        timeZone: "Asia/Kolkata",
      })
    );

    /* ---------------------------------------------------
       STEP 2: IST DAY START & END
    --------------------------------------------------- */
    const istStart = new Date(
      nowIST.getFullYear(),
      nowIST.getMonth(),
      nowIST.getDate(),
      0, 0, 0, 0
    );

    const istEnd = new Date(
      nowIST.getFullYear(),
      nowIST.getMonth(),
      nowIST.getDate(),
      23, 59, 59, 999
    );

    /* ---------------------------------------------------
       STEP 3: CONVERT IST → UTC (DB SAFE)
    --------------------------------------------------- */
    const startUTC = new Date(istStart.getTime() - 5.5 * 60 * 60 * 1000);
    const endUTC   = new Date(istEnd.getTime()   - 5.5 * 60 * 60 * 1000);

    console.log("🕒 3D CANCELLED UTC RANGE:", startUTC, "→", endUTC);

    /* ---------------------------------------------------
       STEP 4: FETCH TODAY'S CANCELLED 3D TICKETS
    --------------------------------------------------- */
    const cancelledTickets = await ThreeDCancelledTicket.findAll({
      where: {
        loginId,
        cancelledAt: {
          [Op.gte]: startUTC,
          [Op.lte]: endUTC,
        },
      },
      order: [["cancelledAt", "DESC"]],
    });

    console.log("❌ Cancelled 3D tickets today:", cancelledTickets.length);

    /* ---------------------------------------------------
       STEP 5: RESPONSE (FRONTEND SAFE)
    --------------------------------------------------- */
    return res.status(200).json([
      {
        date: nowIST.toISOString().split("T")[0],
        tickets: cancelledTickets,
      },
    ]);
  } catch (err) {
    console.error("❌ Get Cancelled 3D Tickets Error:", err);
    return res.status(500).json({
      message: "Internal server error",
    });
  }
};









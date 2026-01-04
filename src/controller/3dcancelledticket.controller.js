import { Op } from "sequelize";
import { threed } from "../models/threed.model.js";
import ThreeDCancelledTicket from "../models/3dcancelledTicket.model.js";

export const getActive3DTickets = async (req, res) => {
  try {
    const { loginId } = req.body;

    if (!loginId) {
      return res.status(400).json({ message: "loginId is required" });
    }

    const tickets = await threed.findAll({
      where: { loginId },
      order: [["id", "DESC"]],
    });

    return res.json([
      {
        tickets,
      },
    ]);
  } catch (err) {
    console.error("Get Active 3D Tickets Error:", err);
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

    const cancelledTickets = await ThreeDCancelledTicket.findAll({
      where: { loginId },
      order: [["cancelledAt", "DESC"]],
    });

    // 🔹 Match frontend expectation: [{ tickets: [...] }]
    return res.status(200).json([
      {
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









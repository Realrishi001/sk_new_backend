import { Op } from "sequelize";
import dayjs from "dayjs";
import { claimedTickets } from "../models/claimedTickets.model.js";
import Admin from "../models/admins.model.js";

// Helpers
const getTotalQuantity = (ticketNumbersArr) => {
  return ticketNumbersArr.reduce((sum, t) => sum + (t.quantity || 0), 0);
};

const extractTicketNumbers = (ticketNumbersArr) => {
  return ticketNumbersArr.map((t) => t.ticketNumber);
};


export const getClaimedTicketsByAdmin = async (req, res) => {
  try {
    let { adminId, fromDate, toDate } = req.body;

    if (!adminId) {
      return res.status(400).json({
        error: "adminId is required",
      });
    }

    // Default dates → today
    if (!fromDate || !toDate) {
      const today = dayjs().format("YYYY-MM-DD");
      fromDate = today;
      toDate = today;
    }

    // Fetch claimed tickets for only this admin
    const claimed = await claimedTickets.findAll({
      where: {
        loginId: adminId,
        claimedDate: {
          [Op.gte]: fromDate,
          [Op.lte]: toDate,
        },
      },
      order: [["drawDate", "DESC"], ["drawTime", "DESC"]],
    });

    if (!claimed.length) {
      return res.status(200).json({
        message: `No claimed tickets found for Admin ID ${adminId} between ${fromDate} and ${toDate}`,
        totalRecords: 0,
        data: [],
      });
    }

    // Fetch admin details
    const admin = await Admin.findOne({
      where: { id: adminId },
      attributes: ["shopName", "contactPersonName", "userName"],
    });

    const adminInfo = admin
      ? {
          shopName: admin.shopName,
          contactPersonName: admin.contactPersonName,
          userName: admin.userName,
        }
      : {
          shopName: "Unknown",
          contactPersonName: "N/A",
          userName: "N/A",
        };

    // Format each row
    const formattedData = claimed.map((row) => {
      let ticketNumbersArr = row.ticketNumbers;

      if (typeof ticketNumbersArr === "string") {
        try {
          ticketNumbersArr = JSON.parse(ticketNumbersArr);
        } catch {
          ticketNumbersArr = [];
        }
      }

      return {
        ticketId: row.TicketId,
        adminId: row.loginId,
        ...adminInfo,
        drawDate: row.drawDate,
        drawTime: row.drawTime,
        claimedDate: row.claimedDate,
        claimedTime: row.claimedTime,
        totalQuantity: getTotalQuantity(ticketNumbersArr),
        ticketNumbers: extractTicketNumbers(ticketNumbersArr),
      };
    });

    return res.status(200).json({
      message: `Claimed tickets for Admin ID ${adminId} between ${fromDate} and ${toDate}`,
      totalRecords: formattedData.length,
      data: formattedData,
    });
  } catch (error) {
    console.error("Error in getClaimedTicketsByAdmin:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

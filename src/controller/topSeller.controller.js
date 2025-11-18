import { Op } from "sequelize";
import dayjs from "dayjs";
import { tickets } from "../models/ticket.model.js";
import Admin from "../models/admins.model.js";
import { getNextSlot } from "../utils/getNextSlot.js";
import { sequelizeCon } from "../init/dbConnection.js";

export const getTopSellersForNextDraw = async (req, res) => {
  try {
    const drawTime = getNextSlot();
    const drawDate = dayjs().format("YYYY-MM-DD");

    const todayTickets = await tickets.findAll({
      where: {
        [Op.and]: [
          sequelizeCon.where(
            sequelizeCon.fn(
              "JSON_CONTAINS",
              sequelizeCon.col("drawTime"),
              sequelizeCon.fn("JSON_QUOTE", drawTime)
            ),
            1
          ),
          {
            createdAt: {
              [Op.gte]: dayjs().startOf("day").toDate(),
              [Op.lte]: dayjs().endOf("day").toDate(),
            },
          },
        ],
      },
      attributes: ["loginId", "totalQuatity"],
    });

    if (!todayTickets.length) {
      return res.status(200).json({
        drawTime,
        drawDate,
        topSellers: [],
        message: "No tickets for this draw time",
      });
    }

    const summary = {};

    for (const row of todayTickets) {
      const adminId = row.loginId;

      if (!summary[adminId]) {
        summary[adminId] = {
          adminId,
          totalQuantity: 0,
        };
      }

      summary[adminId].totalQuantity += Number(row.totalQuatity || 0);
    }

    let result = Object.values(summary);

    result.sort((a, b) => b.totalQuantity - a.totalQuantity);

    // ⭐ Add shopName + priorWinning here
    for (let entry of result) {
      const admin = await Admin.findOne({
        where: { id: entry.adminId },
        attributes: ["shopName", "priorWinning"],  // <--- added this
      });

      entry.shopName = admin?.shopName || "Unknown";
      entry.priorWinning = admin?.priorWinning ?? false;   // <--- true or false
    }

    return res.status(200).json({
      drawTime,
      drawDate,
      topSellers: result,
    });

  } catch (error) {
    console.error("Error in getTopSellersForNextDraw:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

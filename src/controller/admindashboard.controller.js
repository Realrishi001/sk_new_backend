import { Op } from "sequelize";
import { tickets } from "../models/ticket.model.js";
import Admin from "../models/admins.model.js";
import { winningPercentage } from "../models/winningPercentage.model.js";

// Get admin count
export const getAdminCount = async (req, res) => {
  try {
    // Count total admins (shops)
    const adminCount = await Admin.count();

    // Count total tickets (no date filter)
    const totalTickets = await tickets.count();

    res.status(200).json({
      success: true,
      totalAdmins: adminCount,
      totalTickets: totalTickets
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch total counts.",
      error: error.message
    });
  }
};


export const getTodayTotalPoints = async (req, res) => {
  try {
    // Start & End of the day
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    // Fetch today's tickets
    const todaysTickets = await tickets.findAll({
      where: {
        createdAt: {
          [Op.between]: [startOfDay, endOfDay],
        },
      },
      attributes: ["totalPoints"],
    });

    // Sum totalPoints
    const totalPointsToday = todaysTickets.reduce((sum, ticket) => {
      return sum + (parseFloat(ticket.totalPoints) || 0);
    }, 0);

    // Fetch all admins' commissions
    const admins = await Admin.findAll({ attributes: ["commission"] });

    if (!admins.length) {
      return res.status(200).json({
        success: true,
        totalPointsToday: Number(totalPointsToday.toFixed(2)),
        commissionAmount: 0,
        netAmount: Number(totalPointsToday.toFixed(2)),
        winningAmount: 0,
        adminAmount: Number(totalPointsToday.toFixed(2)), // Admin keeps all if no commissions/winnings
      });
    }

    // Calculate average commission percentage
    const totalCommission = admins.reduce((sum, admin) => sum + (parseFloat(admin.commission) || 0), 0);
    const avgCommissionPercent = totalCommission / admins.length;

    // Calculate commission & net amount
    const commissionAmount = (totalPointsToday * avgCommissionPercent) / 100;
    const netAmount = totalPointsToday - commissionAmount;

    // Fetch winning percentage (assuming latest record)
    const latestWinning = await winningPercentage.findOne({
      order: [["createdAt", "DESC"]],
      attributes: ["percentage"],
    });

    const winningPercent = latestWinning ? parseFloat(latestWinning.percentage) : 0;
    const winningAmount = (netAmount * winningPercent) / 100;

    // Calculate admin amount (remaining after winnings)
    const adminAmount = netAmount - winningAmount;

    res.status(200).json({
      success: true,
      totalPointsToday: Number(totalPointsToday.toFixed(2)),
      avgCommissionPercent: Number(avgCommissionPercent.toFixed(2)),
      commissionAmount: Number(commissionAmount.toFixed(2)),
      netAmount: Number(netAmount.toFixed(2)),
      winningPercent: Number(winningPercent.toFixed(2)),
      winningAmount: Number(winningAmount.toFixed(2)),
      adminAmount: Number(adminAmount.toFixed(2)),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Could not fetch total points for today.",
      error: error.message,
    });
  }
};

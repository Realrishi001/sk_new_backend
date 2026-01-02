import { Op } from "sequelize";
import { tickets } from "../models/ticket.model.js";
import Admin from "../models/admins.model.js";
import { winningPercentage } from "../models/winningPercentage.model.js";
import { cancelledTickets } from "../models/cancelledTicket.model.js";
import { claimedTickets } from "../models/claimedTickets.model.js";

// Get admin/ticket/cancelled counts
export const getAdminCount = async (req, res) => {
  try {
    // Count total admins (shops)
    const adminCount = await Admin.count();

    // Count total tickets (no date filter)
    const totalTickets = await tickets.count();

    // Count total cancelled tickets (no date filter)
    const totalCancelledTickets = await cancelledTickets.count();

    res.status(200).json({
      success: true,
      totalAdmins: adminCount,
      totalTickets: totalTickets,
      totalCancelledTickets: totalCancelledTickets,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch total counts.",
      error: error.message,
    });
  }
};


export const getTodayTotalPoints = async (req, res) => {
  try {
    // -----------------------------
    // 1️⃣ Start & End of today
    // -----------------------------
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    // -----------------------------
    // 2️⃣ Fetch today's tickets
    // -----------------------------
    const todaysTickets = await tickets.findAll({
      where: {
        createdAt: {
          [Op.between]: [startOfDay, endOfDay],
        },
      },
      attributes: ["totalQuatity", "totalPoints"],
    });

    // -----------------------------
    // 3️⃣ TOTAL & NET points
    // -----------------------------
    let totalPointsToday = 0; // totalQuatity × 2
    let netPoints = 0;        // sum of tickets.totalPoints

    todaysTickets.forEach(ticket => {
      const qty = parseInt(ticket.totalQuatity) || 0;
      const net = parseFloat(ticket.totalPoints) || 0;

      totalPointsToday += qty * 2;
      netPoints += net;
    });

    // -----------------------------
    // 4️⃣ Winning points (CLAIMED)
    // ticketNumbers[].payout
    // -----------------------------
    const todaysClaims = await claimedTickets.findAll({
      where: {
        createdAt: {
          [Op.between]: [startOfDay, endOfDay],
        },
      },
      attributes: ["ticketNumbers"],
    });

    let winningPoints = 0;

    todaysClaims.forEach(claim => {
      const ticketNumbers = Array.isArray(claim.ticketNumbers)
        ? claim.ticketNumbers
        : [];

      ticketNumbers.forEach(item => {
        winningPoints += parseFloat(item.payout) || 0;
      });
    });

    // -----------------------------
    // 5️⃣ Admin commission
    // -----------------------------
    const admins = await Admin.findAll({
      attributes: ["commission"],
    });

    let avgCommissionPercent = 0;
    let commissionAmount = 0;

    if (admins.length > 0) {
      const totalCommission = admins.reduce((sum, admin) => {
        return sum + (parseFloat(admin.commission) || 0);
      }, 0);

      avgCommissionPercent = totalCommission / admins.length;
      commissionAmount = (netPoints * avgCommissionPercent) / 100;
    }

    // -----------------------------
    // 6️⃣ Net & Admin amount
    // -----------------------------
    const netAmount = netPoints - commissionAmount;
    const adminAmount = netAmount - winningPoints;

    // -----------------------------
    // 7️⃣ Response
    // -----------------------------
    res.status(200).json({
      success: true,

      totalPointsToday: Number(totalPointsToday.toFixed(2)), // qty × 2
      netPoints: Number(netPoints.toFixed(2)),               // tickets.totalPoints

      winningPoints: Number(winningPoints.toFixed(2)),       // ticketNumbers[].payout

      avgCommissionPercent: Number(avgCommissionPercent.toFixed(2)),
      commissionAmount: Number(commissionAmount.toFixed(2)),

      netAmount: Number(netAmount.toFixed(2)),
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

import { Op } from "sequelize";
import { tickets } from "../models/ticket.model.js";
import Admin from "../models/admins.model.js";
import { winningPercentage } from "../models/winningPercentage.model.js";
import { cancelledTickets } from "../models/cancelledTicket.model.js";
import { claimedTickets } from "../models/claimedTickets.model.js";
import { winningNumbers } from "../models/winningNumbers.model.js";

export const getAdminCount = async (req, res) => {
  try {
    /* ---------- BASIC COUNTS ---------- */
    const totalAdmins = await Admin.count();
    const totalTickets = await tickets.count();
    const totalCancelledTickets = await cancelledTickets.count();

    /* ---------- FETCH ACTIVE ADMINS ---------- */
    const admins = await Admin.findAll({
      attributes: ["id"],
      where: { blockStatus: false },
    });

    if (!admins.length) {
      return res.status(200).json({
        success: true,
        totalAdmins,
        totalTickets,
        totalCancelledTickets,
        pendingClaimTickets: 0,
      });
    }

    let pendingClaimTickets = 0;

    /* ---------- LOOP ADMINS ---------- */
    for (const admin of admins) {
      const loginId = admin.id;

      /* Already claimed tickets */
      const claimed = await claimedTickets.findAll({
        where: { loginId },
        attributes: ["TicketId"],
      });
      const claimedIds = new Set(claimed.map(c => c.TicketId));

      /* All unclaimed tickets (NO DATE FILTER) */
      const userTickets = await tickets.findAll({
        where: {
          loginId,
          ...(claimedIds.size
            ? { id: { [Op.notIn]: Array.from(claimedIds) } }
            : {}),
        },
        attributes: ["id", "ticketNumber", "drawTime", "createdAt"],
      });

      for (const ticket of userTickets) {
        /* Parse draw times */
        let parsedDrawTimes = [];
        try {
          parsedDrawTimes = Array.isArray(ticket.drawTime)
            ? ticket.drawTime
            : JSON.parse(ticket.drawTime);
        } catch {
          parsedDrawTimes = [ticket.drawTime];
        }

        /* Parse ticket numbers */
        let parsedTickets = [];
        try {
          parsedTickets = Array.isArray(ticket.ticketNumber)
            ? ticket.ticketNumber
            : JSON.parse(ticket.ticketNumber);
        } catch {
          continue;
        }

        /* Determine ticket draw date */
        const ticketDate = ticket.createdAt
          .toISOString()
          .split("T")[0];

        /* Fetch winning numbers for that date */
        const winningRows = await winningNumbers.findAll({
          where: { drawDate: ticketDate },
          attributes: ["winningNumbers", "DrawTime"],
        });

        if (!winningRows.length) continue;

        const winSet = new Set();

        for (const row of winningRows) {
          let rowTimes = [];
          try {
            rowTimes = Array.isArray(row.DrawTime)
              ? row.DrawTime
              : JSON.parse(row.DrawTime);
          } catch {
            rowTimes = [row.DrawTime];
          }

          const participated = parsedDrawTimes.some(t =>
            rowTimes.includes(t)
          );
          if (!participated) continue;

          let winners = [];
          try {
            winners = Array.isArray(row.winningNumbers)
              ? row.winningNumbers
              : JSON.parse(row.winningNumbers);
          } catch {
            winners = [];
          }

          winners.forEach(w => winSet.add(w.number));
        }

        const hasWinningMatch = parsedTickets.some(t =>
          winSet.has(t.ticketNumber)
        );

        if (hasWinningMatch) pendingClaimTickets++;
      }
    }

    /* ---------- RESPONSE ---------- */
    return res.status(200).json({
      success: true,
      totalAdmins,
      totalTickets,
      totalCancelledTickets,
      pendingClaimTickets,
    });

  } catch (error) {
    console.error("🔥 Admin Count Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch admin counts.",
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

import { Op } from "sequelize";
import Admin from "../models/admins.model.js";
import { tickets } from "../models/ticket.model.js";
import { claimedTickets } from "../models/claimedTickets.model.js";

export const getSummaryReport = async (req, res) => {
  try {
    const { from, to, loginId } = req.body;

    if (!from || !to || !loginId) {
      return res.status(400).json({
        status: false,
        message: "from, to, loginId are required",
      });
    }

    /* ---------- DATE RANGE ---------- */
    const startDate = new Date(from);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(to);
    endDate.setHours(23, 59, 59, 999);

    /* ---------- ADMIN ---------- */
    const adminData = await Admin.findOne({
      where: { id: loginId },
      attributes: ["shopName", "userName", "commission"],
    });

    if (!adminData) {
      return res.status(404).json({
        status: false,
        message: "Admin not found",
      });
    }

    /* ---------- TICKETS (FOR PLAY AMOUNT) ---------- */
    const ticketList = await tickets.findAll({
      where: {
        loginId,
        createdAt: {
          [Op.between]: [startDate, endDate],
        },
      },
      attributes: ["totalQuatity"],
    });

    let totalQuantity = 0;
    for (const t of ticketList) {
      totalQuantity += Number(t.totalQuatity) || 0;
    }

    /* ---------- PLAY AMOUNT ---------- */
    const playAmount = totalQuantity * 2;

    /* ---------- CLAIMED TICKETS (FOR WINNING AMOUNT) ---------- */
    const claimedList = await claimedTickets.findAll({
      where: {
        loginId,
        claimedDate: {
          [Op.between]: [from, to],
        },
      },
      attributes: ["ticketNumbers"],
    });

    let winningAmount = 0;

    for (const ct of claimedList) {
      let numbers = [];
      try {
        numbers = Array.isArray(ct.ticketNumbers)
          ? ct.ticketNumbers
          : JSON.parse(ct.ticketNumbers);
      } catch {
        numbers = [];
      }

      for (const n of numbers) {
        const qty = Number(n.quantity) || 0;
        winningAmount += qty * 180; // ✅ FIXED RULE
      }
    }

    /* ---------- COMMISSION ---------- */
    const commissionPercent = Number(adminData.commission) || 0;
    const commissionAmount = Math.round(
      (playAmount * commissionPercent) / 100
    );

    /* ---------- NET AMOUNT ---------- */
    const netAmount = playAmount - commissionAmount - winningAmount;

    /* ---------- RESPONSE ---------- */
    return res.json({
      status: true,
      summary: {
        shopName: adminData.shopName,
        userName: adminData.userName,
        playAmount,
        winningAmount,
        commission: commissionAmount,
        netAmount,
        totalTickets: ticketList.length,
      },
    });

  } catch (err) {
    console.error("Summary Error:", err);
    return res.status(500).json({
      status: false,
      message: "Internal Server Error",
      error: err.message,
    });
  }
};



export const netToPaySummary = async (req, res) => {
  try {
    const { from, to, loginId } = req.body;

    if (!from || !to || !loginId) {
      return res.status(400).json({
        status: false,
        message: "from, to, loginId are required",
      });
    }

    /* ---------- DATE RANGE ---------- */
    const startDate = new Date(from);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(to);
    endDate.setHours(23, 59, 59, 999);

    /* ---------- ADMIN ---------- */
    const adminData = await Admin.findOne({
      where: { id: loginId },
      attributes: ["shopName", "userName", "commission"],
    });

    if (!adminData) {
      return res.status(404).json({
        status: false,
        message: "Admin not found",
      });
    }

    /* ---------- TICKETS (FOR PLAY POINTS) ---------- */
    const ticketList = await tickets.findAll({
      where: {
        loginId,
        createdAt: {
          [Op.between]: [startDate, endDate],
        },
      },
      attributes: ["totalQuatity"],
    });

    let totalQuantity = 0;
    for (const t of ticketList) {
      totalQuantity += Number(t.totalQuatity) || 0;
    }

    /* ---------- PLAY POINTS ---------- */
    const playPoints = totalQuantity * 2;

    /* ---------- COMMISSION ---------- */
    const commissionPercent = Number(adminData.commission) || 0;
    const commission = Math.round(
      (playPoints * commissionPercent) / 100
    );

    /* ---------- PURCHASE POINTS ---------- */
    const purchasePoints = playPoints - commission;

    /* ---------- CLAIMED TICKETS (FOR WINNING POINTS) ---------- */
    const claimedList = await claimedTickets.findAll({
      where: {
        loginId,
        claimedDate: {
          [Op.between]: [from, to],
        },
      },
      attributes: ["ticketNumbers"],
    });

    let winningPoints = 0;

    for (const ct of claimedList) {
      let numbers = [];
      try {
        numbers = Array.isArray(ct.ticketNumbers)
          ? ct.ticketNumbers
          : JSON.parse(ct.ticketNumbers);
      } catch {
        numbers = [];
      }

      for (const n of numbers) {
        const qty = Number(n.quantity) || 0;
        winningPoints += qty * 180; // ✅ FINAL RULE
      }
    }

    /* ---------- NET TO PAY ---------- */
    const netToPay = purchasePoints - winningPoints;

    /* ---------- RESPONSE ---------- */
    return res.json({
      status: true,
      summary: {
        shopName: adminData.shopName,
        userName: adminData.userName,
        playPoints,
        purchasePoints,
        winningPoints,
        commission,
        netToPay,
        totalTickets: ticketList.length,
      },
    });

  } catch (err) {
    console.error("NetToPay Error:", err);
    return res.status(500).json({
      status: false,
      message: "Internal Server Error",
      error: err.message,
    });
  }
};


export const pointsAllocatedByDate = async (req, res) => {
  try {
    const { from, to, loginId } = req.body;

    if (!from || !to || !loginId) {
      return res.status(400).json({
        status: false,
        message: "from, to, loginId are required",
      });
    }
    // Build full-day date range so "from" == "to" covers whole day
      const startDate = new Date(from);
      startDate.setHours(0, 0, 0, 0);

      const endDate = new Date(to);
      endDate.setHours(23, 59, 59, 999);



    const ticketList = await tickets.findAll({
      where: {
        loginId: loginId,
createdAt: {
  [Op.between]: [startDate, endDate],
},

      },
      attributes: ["totalPoints", "createdAt"]
    });

    const formatDate = (d) => {
      const date = new Date(d);
      const yyyy = date.getFullYear();
      const mm = String(date.getMonth() + 1).padStart(2, "0");
      const dd = String(date.getDate()).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    };

    // Sum points per date
    const dateTotals = {};

    for (const t of ticketList) {
      const date = formatDate(t.createdAt);
      const points = parseInt(t.totalPoints) || 0;

      if (!dateTotals[date]) {
        dateTotals[date] = 0;
      }

      dateTotals[date] += points;
    }

    let result = [];

let start = new Date(startDate);
const end = new Date(endDate);


    while (start <= end) {
      const dateStr = formatDate(start);
      const points = parseInt(dateTotals[dateStr] || 0);

      // 👉 Only add if points > 0
      if (points > 0) {
        result.push({
          date: dateStr,
          points: points
        });
      }

      start.setDate(start.getDate() + 1);
    }

    return res.json({
      status: true,
      pointsAllocated: result
    });

  } catch (err) {
    console.error("Points By Date Error:", err);
    return res.status(500).json({
      status: false,
      message: "Internal Server Error",
      error: err.message
    });
  }
};


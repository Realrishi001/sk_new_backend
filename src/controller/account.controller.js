import { Op } from "sequelize";
import Admin from "../models/admins.model.js";
import { tickets } from "../models/ticket.model.js";

export const getSummaryReport = async (req, res) => {
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



    const adminData = await Admin.findOne({
      where: { id: loginId },
      attributes: ["shopName", "userName"],
    });

    if (!adminData) {
      return res.status(404).json({
        status: false,
        message: "Admin not found",
      });
    }

    const ticketList = await tickets.findAll({
      where: {
        loginId: loginId,
createdAt: {
  [Op.between]: [startDate, endDate],
},

      },
    });

    let playPoints = 0;
    let winningPoints = 0;
    let commission = 0;

    for (const t of ticketList) {
      const qty = parseInt(t.totalQuatity) || 0;
      const tp = parseInt(t.totalPoints) || 0;

      const rowPlay = qty * 2;
      const rowCommission = rowPlay - tp;

      playPoints += rowPlay;
      winningPoints += tp;
      commission += rowCommission;
    }

    const netPoints = winningPoints - commission;

    return res.json({
      status: true,
      summary: {
        shopName: adminData.shopName,
        userName: adminData.userName,
        playPoints: parseInt(playPoints),
        winningPoints: parseInt(winningPoints),
        commission: parseInt(commission),
        netPoints: parseInt(netPoints),
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
    // Build full-day date range so "from" == "to" covers whole day
    const startDate = new Date(from);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(to);
    endDate.setHours(23, 59, 59, 999);


    const adminData = await Admin.findOne({
      where: { id: loginId },
      attributes: ["shopName", "userName"],
    });

    if (!adminData) {
      return res.status(404).json({
        status: false,
        message: "Admin not found",
      });
    }

    const ticketList = await tickets.findAll({
      where: {
        loginId: loginId,
        createdAt: {
            [Op.between]: [startDate, endDate],
          },
      },
    });

    let playPoints = 0;
    let purchasePoints = 0;
    let winningPoints = 0;
    let commission = 0;

    for (const t of ticketList) {
      const qty = parseInt(t.totalQuatity) || 0;
      const tp = parseInt(t.totalPoints) || 0;

      const rowPlay = qty * 2;
      const rowCommission = rowPlay - tp;

      playPoints += rowPlay;
      purchasePoints += tp;
      winningPoints += tp; // same column
      commission += rowCommission;
    }

    const netToPay = purchasePoints - winningPoints; // your requested logic

    return res.json({
      status: true,
      summary: {
        shopName: adminData.shopName,
        userName: adminData.userName,
        playPoints: parseInt(playPoints),
        purchasePoints: parseInt(purchasePoints),
        winningPoints: parseInt(winningPoints),
        commission: parseInt(commission),
        netToPay: parseInt(netToPay),
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


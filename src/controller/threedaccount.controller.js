import { Op } from "sequelize";
import Admin from "../models/admins.model.js";
import { threed } from "../models/threed.model.js";

export const get3DSummaryReport = async (req, res) => {
  try {
    const { from, to, loginId } = req.body;

    if (!from || !to || !loginId) {
      return res.status(400).json({
        status: false,
        message: "from, to, loginId are required",
      });
    }

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

    const list = await threed.findAll({
      where: {
        loginId,
        gameTime: {
          [Op.between]: [startDate, endDate],
        },
      },
    });

    let playPoints = 0;
    let purchasePoints = 0;

    for (const t of list) {
      const qty = parseInt(t.totalQuantity) || 0;
      const tp = parseInt(t.totalPoints) || 0;

      playPoints += qty * 2;
      purchasePoints += tp;
    }

    let commission = playPoints - purchasePoints;
    if (commission < 0) commission = 0;

    const netPoints = purchasePoints - commission;

    return res.json({
      status: true,
      summary: {
        shopName: adminData.shopName,
        userName: adminData.userName,
        playPoints,
        winningPoints: purchasePoints,
        commission,
        netPoints,
        total3DTickets: list.length,
      },
    });

  } catch (err) {
    console.error("3D Summary Error:", err);
    return res.status(500).json({
      status: false,
      message: "Internal Server Error",
      error: err.message,
    });
  }
};

export const netToPay3DSummary = async (req, res) => {
  try {
    const { from, to, loginId } = req.body;

    if (!from || !to || !loginId) {
      return res.status(400).json({
        status: false,
        message: "from, to, loginId are required",
      });
    }

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

    const list = await threed.findAll({
      where: {
        loginId,
        gameTime: {
          [Op.between]: [startDate, endDate],
        },
      },
    });

    let playPoints = 0;
    let purchasePoints = 0;

    for (const t of list) {
      const qty = parseInt(t.totalQuantity) || 0;
      const tp = parseInt(t.totalPoints) || 0;

      playPoints += qty * 2;
      purchasePoints += tp;
    }

    let commission = playPoints - purchasePoints;
    if (commission < 0) commission = 0;

    const netToPay = purchasePoints - purchasePoints; // always 0

    return res.json({
      status: true,
      summary: {
        shopName: adminData.shopName,
        userName: adminData.userName,
        playPoints,
        purchasePoints,
        winningPoints: purchasePoints,
        commission,
        netToPay,
        total3DTickets: list.length,
      },
    });

  } catch (err) {
    console.error("3D NetToPay Error:", err);
    return res.status(500).json({
      status: false,
      message: "Internal Server Error",
      error: err.message,
    });
  }
};


export const pointsAllocatedByDate3D = async (req, res) => {
  try {
    const { from, to, loginId } = req.body;

    if (!from || !to || !loginId) {
      return res.status(400).json({
        status: false,
        message: "from, to, loginId are required",
      });
    }

    const startDate = new Date(from);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(to);
    endDate.setHours(23, 59, 59, 999);

    const list = await threed.findAll({
      where: {
        loginId,
        gameTime: {
          [Op.between]: [startDate, endDate],
        },
      },
      attributes: ["totalPoints", "gameTime"],
    });

    const formatDate = (d) => {
      const date = new Date(d);
      return date.toISOString().split("T")[0];
    };

    const dateTotals = {};

    for (const t of list) {
      const date = formatDate(t.gameTime);
      const points = parseInt(t.totalPoints) || 0;

      dateTotals[date] = (dateTotals[date] || 0) + points;
    }

    const result = [];
    let current = new Date(startDate);

    while (current <= endDate) {
      const dateStr = formatDate(current);
      if (dateTotals[dateStr] > 0) {
        result.push({
          date: dateStr,
          points: dateTotals[dateStr],
        });
      }
      current.setDate(current.getDate() + 1);
    }

    return res.json({
      status: true,
      pointsAllocated: result,
    });
  } catch (err) {
    console.error("3D Points By Date Error:", err);
    return res.status(500).json({
      status: false,
      message: "Internal Server Error",
      error: err.message,
    });
  }
};

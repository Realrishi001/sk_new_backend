import { tickets } from "../models/ticket.model.js";
import Admin from "../models/admins.model.js";
import { Op } from "sequelize";

export const getTicketSummary = async (req, res) => {
  try {
    const { date } = req.body;

    if (!date) {
      return res.status(400).json({
        success: false,
        message: "date required"
      });
    }

    // 🔹 Convert YYYY-MM-DD → full day timestamp range
    const start = new Date(`${date}T00:00:00.000Z`);
    const end   = new Date(`${date}T23:59:59.999Z`);

    // 🔹 Fetch all tickets created on that day
    const allTickets = await tickets.findAll({
      where: {
        createdAt: {
          [Op.between]: [start, end]
        }
      },
      order: [["createdAt", "DESC"]],
    });

    // 🔹 Counters
    let qty10 = 0, qty30 = 0, qty50 = 0;
    let points10 = 0, points30 = 0, points50 = 0;

    // 🔹 Loop through tickets
    for (const t of allTickets) {
      let ticketData = t.ticketNumber;

      // Normalize ticketNumber → array
      if (typeof ticketData === "string") {
        try {
          ticketData = JSON.parse(ticketData);
        } catch {
          ticketData = [];
        }
      }

      if (!Array.isArray(ticketData)) continue;

      for (const item of ticketData) {
        const num = String(item.ticketNumber || "").replace("-", "");
        const qty = Number(item.quantity || 0);
        const base = parseInt(num.substring(0, 2), 10);

        // ✅ Quantity + Amount (qty × 2)
        if (base >= 10 && base <= 19) {
          qty10 += qty;
          points10 += qty * 2;
        }
        else if (base >= 30 && base <= 39) {
          qty30 += qty;
          points30 += qty * 2;
        }
        else if (base >= 50 && base <= 59) {
          qty50 += qty;
          points50 += qty * 2;
        }
      }
    }

    const totalQty = qty10 + qty30 + qty50;
    const totalPoints = points10 + points30 + points50;

    return res.status(200).json({
      success: true,
      tickets: [
        {
          total10SeriesCount: qty10,
          total30SeriesCount: qty30,
          total50SeriesCount: qty50,

          total10SeriesPoints: points10,
          total30SeriesPoints: points30,
          total50SeriesPoints: points50,

          totalPoints,
          shopAmount: 0,
          netAmount: totalPoints
        }
      ]
    });

  } catch (err) {
    console.error("Draw summary error:", err);
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
};

export const getTicketsBySeries = async (req, res) => {
  try {
    const { drawDate, drawTime } = req.body || {};

    if (!drawDate) {
      return res.status(400).json({
        success: false,
        message: "drawDate is required"
      });
    }

    const [Y, M, D] = drawDate.split("-");
    const ddmmyyyy = `${D}-${M}-${Y}`;

    const rows = await tickets.findAll({
      where: {
        gameTime: { [Op.like]: `${ddmmyyyy}%` }
      },
      attributes: ["ticketNumber", "loginId", "createdAt", "gameTime", "drawTime"],
      order: [["createdAt", "DESC"]],
    });

    const parseTicketNumber = (raw) => {
      if (!raw) return {};
      if (typeof raw === "string") {
        try { raw = JSON.parse(raw); } catch { return {}; }
      }
      if (!Array.isArray(raw)) return {};
      const out = {};
      raw.forEach(i => {
        out[i.ticketNumber] = Number(i.quantity || 0);
      });
      return out;
    };

    const parseDrawTime = (raw) => {
      if (!raw) return [];
      if (Array.isArray(raw)) return raw.map(String);
      if (typeof raw === "string") {
        try {
          const parsed = JSON.parse(raw);
          return Array.isArray(parsed) ? parsed.map(String) : [];
        } catch {
          return [];
        }
      }
      return [];
    };

    const result = [];

    for (const t of rows) {
      const storedTimes = parseDrawTime(t.drawTime);

      // ✅ REAL FILTER
      if (drawTime && !storedTimes.includes(drawTime)) {
        continue;
      }

      const tnObj = parseTicketNumber(t.ticketNumber);
      const series10 = [];
      const series30 = [];
      const series50 = [];

      for (const [num, qty] of Object.entries(tnObj)) {
        const clean = String(num).replace("-", "");
        const base = parseInt(clean.substring(0, 2), 10);
        const item = { ticketNumber: clean, quantity: Number(qty) || 0 };

        if (base >= 10 && base <= 19) series10.push(item);
        else if (base >= 30 && base <= 39) series30.push(item);
        else if (base >= 50 && base <= 59) series50.push(item);
      }

      result.push({
        shopId: t.loginId,
        dateFromGameTime: ddmmyyyy,
        drawTime: storedTimes,
        createdAt: t.createdAt,
        series10,
        series30,
        series50,
      });
    }

    return res.json({
      success: true,
      count: result.length,
      tickets: result,
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch tickets by series",
      error: err.message,
    });
  }
};



export const getTicketsBySeriesWithShop = async (req, res) => {
  try {
    const { date, drawTime } = req.body;

    if (!date) {
      return res.status(400).json({
        success: false,
        message: "date required"
      });
    }

    // YYYY-MM-DD → DD-MM-YYYY
    const [Y, M, D] = date.split("-");
    const ddmmyyyy = `${D}-${M}-${Y}`;

    // 🔹 Fetch tickets for date
    const rows = await tickets.findAll({
      where: {
        gameTime: { [Op.like]: `${ddmmyyyy}%` }
      },
      order: [["createdAt", "DESC"]],
    });

    // 🔹 Fetch admins and build lookup map
    const admins = await Admin.findAll({
      attributes: ["id", "shopName"]
    });

    const adminMap = {};
    admins.forEach(a => {
      adminMap[String(a.id)] = a.shopName || `Shop-${a.id}`;
    });

    // 🔹 Group data
    const shopMap = {};

    for (const row of rows) {
      const shopId = String(row.loginId);
      const shopName = adminMap[shopId] || `Shop-${shopId}`;

      if (!shopMap[shopName]) {
        shopMap[shopName] = {
          shopName,
          draws: []
        };
      }

      // Normalize drawTime
      let drawTimes = row.drawTime;
      if (typeof drawTimes === "string") {
        try {
          drawTimes = JSON.parse(drawTimes);
        } catch {
          drawTimes = [drawTimes];
        }
      }
      if (!Array.isArray(drawTimes)) drawTimes = [];

      // Normalize ticketNumber
      let ticketData = row.ticketNumber;
      if (typeof ticketData === "string") {
        try {
          ticketData = JSON.parse(ticketData);
        } catch {
          ticketData = [];
        }
      }
      if (!Array.isArray(ticketData)) ticketData = [];

      for (const dt of drawTimes) {
        if (drawTime && dt !== drawTime) continue;

        let drawObj = shopMap[shopName].draws.find(d => d.drawTime === dt);
        if (!drawObj) {
          drawObj = {
            drawTime: dt,
            series10: [],
            series30: [],
            series50: []
          };
          shopMap[shopName].draws.push(drawObj);
        }

        for (const item of ticketData) {
          const num = String(item.ticketNumber || "").replace("-", "");
          const qty = Number(item.quantity || 0);
          const base = parseInt(num.substring(0, 2), 10);

          const payload = { ticketNumber: num, quantity: qty };

          if (base >= 10 && base <= 19) drawObj.series10.push(payload);
          else if (base >= 30 && base <= 39) drawObj.series30.push(payload);
          else if (base >= 50 && base <= 59) drawObj.series50.push(payload);
        }
      }
    }

    const result = Object.values(shopMap);

    return res.status(200).json({
      success: true,
      dateUsed: ddmmyyyy,
      drawTime: drawTime || "All",
      tickets: result
    });

  } catch (error) {
    console.error("tickets-by-admin error:", error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};



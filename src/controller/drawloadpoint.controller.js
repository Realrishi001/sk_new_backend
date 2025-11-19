import { tickets } from "../models/ticket.model.js";
import Admin from "../models/admins.model.js";
import { Op } from "sequelize";

export const getTicketSummary = async (req, res) => {
  try {
    // Fetch commission percentage (assuming one admin or use logic for multiple admins)
    const admin = await Admin.findOne({ attributes: ["commission"] });
    const commissionPercent = admin ? parseFloat(admin.commission) : 0;

    // Fetch tickets with loginId
    const allTickets = await tickets.findAll({
      attributes: [
        "id",
        "loginId",
        "ticketNumber",
        "totalQuatity",
        "totalPoints",
        "createdAt",
      ],
      order: [["createdAt", "DESC"]],
    });

    const result = allTickets.map((ticket) => {
      let total10SeriesCount = 0;
      let total30SeriesCount = 0;
      let total50SeriesCount = 0;

      let total10SeriesPoints = 0;
      let total30SeriesPoints = 0;
      let total50SeriesPoints = 0;

let ticketArray = [];

if (Array.isArray(ticket.ticketNumber)) {
  ticketArray = ticket.ticketNumber;
} else if (typeof ticket.ticketNumber === "string") {
  try {
    ticketArray = JSON.parse(ticket.ticketNumber);
  } catch {
    ticketArray = [];
  }
}

ticketArray.forEach(item => {
  const ticketNum = item.ticketNumber;
  const qty = Number(item.quantity || 0);

  const baseNumber = parseInt(ticketNum.substring(0, 2), 10);

if (baseNumber >= 10 && baseNumber <= 19) {
  total10SeriesCount += qty;
  total10SeriesPoints += qty * 10;
} else if (baseNumber >= 30 && baseNumber <= 39) {
  total30SeriesCount += qty;
  total30SeriesPoints += qty * 30;
} else if (baseNumber >= 50 && baseNumber <= 59) {
  total50SeriesCount += qty;
  total50SeriesPoints += qty * 50;
}
});


      const totalPoints = parseFloat(ticket.totalPoints || 0);

      // Shop and Net Amount
      const shopAmount = (totalPoints * commissionPercent) / 100;
      const netAmount = totalPoints - shopAmount;

      // Series-level shop and net
      const series10ShopAmount = (total10SeriesPoints * commissionPercent) / 100;
      const series10NetAmount = total10SeriesPoints - series10ShopAmount;

      const series30ShopAmount = (total30SeriesPoints * commissionPercent) / 100;
      const series30NetAmount = total30SeriesPoints - series30ShopAmount;

      const series50ShopAmount = (total50SeriesPoints * commissionPercent) / 100;
      const series50NetAmount = total50SeriesPoints - series50ShopAmount;

      return {
        id: ticket.id,
        loginId: ticket.loginId,
        totalQuantity: ticket.totalQuatity,
        total10SeriesCount,
        total10SeriesPoints: parseFloat(total10SeriesPoints.toFixed(2)),
        series10ShopAmount: parseFloat(series10ShopAmount.toFixed(2)),
        series10NetAmount: parseFloat(series10NetAmount.toFixed(2)),
        total30SeriesCount,
        total30SeriesPoints: parseFloat(total30SeriesPoints.toFixed(2)),
        series30ShopAmount: parseFloat(series30ShopAmount.toFixed(2)),
        series30NetAmount: parseFloat(series30NetAmount.toFixed(2)),
        total50SeriesCount,
        total50SeriesPoints: parseFloat(total50SeriesPoints.toFixed(2)),
        series50ShopAmount: parseFloat(series50ShopAmount.toFixed(2)),
        series50NetAmount: parseFloat(series50NetAmount.toFixed(2)),
        totalPoints: parseFloat(totalPoints.toFixed(2)),
        shopAmount: parseFloat(shopAmount.toFixed(2)),
        netAmount: parseFloat(netAmount.toFixed(2)),
        createdAt: ticket.createdAt,
      };
    });

    res.status(200).json({
      success: true,
      commissionPercent: parseFloat(commissionPercent.toFixed(2)),
      tickets: result,
    }); 
  } catch (error) {
    console.error("Error fetching ticket summary:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch ticket summary",
      error: error.message,
    });
  }
};


export const getTicketsBySeries = async (req, res) => {
  try {
    let { drawDate } = req.body || {};

    if (!drawDate) {
      return res.status(400).json({ success: false, message: "drawDate is required" });
    }

    // Normalize date to DD-MM-YYYY
    const toDDMMYYYY = (d) => {
      const s = String(d);
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        const [Y, M, D] = s.split("-");
        return `${D}-${M}-${Y}`;
      }
      return s;
    };
    const ddmmyyyy = toDDMMYYYY(drawDate);

    // Fetch all tickets for the date
    const rows = await tickets.findAll({
      where: { gameTime: { [Op.like]: `${ddmmyyyy}%` } },
      attributes: ["ticketNumber", "loginId", "createdAt", "gameTime", "drawTime"],
      order: [["createdAt", "DESC"]],
    });

    const toTimeArray = (val) => {
      if (Array.isArray(val)) return val;
      if (typeof val === "string") {
        try {
          const parsed = JSON.parse(val);
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      }
      return [];
    };

const parseTicketNumber = (raw) => {
  if (!raw) return {};

  // If already array → convert into object
  if (Array.isArray(raw)) {
    const out = {};
    raw.forEach(item => {
      out[item.ticketNumber] = Number(item.quantity || 0);
    });
    return out;
  }

  // If JSON string containing array → parse it
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const out = {};
        parsed.forEach(item => {
          out[item.ticketNumber] = Number(item.quantity || 0);
        });
        return out;
      }
    } catch {}
  }

  return {};
};


    const result = rows.map((t) => {
      const tnObj = parseTicketNumber(t.ticketNumber);

      const series10 = [];
      const series30 = [];
      const series50 = [];

      for (const [ticketNum, qtyRaw] of Object.entries(tnObj)) {
        const qty = Number(qtyRaw) || 0;
        const cleanNum = String(ticketNum).replace("-", "");
        const base = parseInt(cleanNum.substring(0, 2), 10);

        const item = { ticketNumber: cleanNum, quantity: qty };


        if (base >= 10 && base <= 19) series10.push(item);
        else if (base >= 30 && base <= 39) series30.push(item);
        else if (base >= 50 && base <= 59) series50.push(item);
      }

      return {
        shopId: t.loginId,
        dateFromGameTime: String(t.gameTime).split(" ")[0],
        drawTime: toTimeArray(t.drawTime), // ✅ Always send stored drawTime
        createdAt: t.createdAt,
        series10,
        series30,
        series50,
      };
    });

    return res.status(200).json({
      success: true,
      count: result.length,
      tickets: result,
    });

  } catch (error) {
    console.error("Error fetching tickets by series (date filter only):", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch tickets by series",
      error: error.message,
    });
  }
};


export const getTicketsBySeriesWithShop = async (req, res) => {
  try {
    const { drawTime } = req.query; // optional query param (e.g. "06:30 PM")

    // 🗓️ Use current date (today)
    const today = new Date();
    const D = String(today.getDate()).padStart(2, "0");
    const M = String(today.getMonth() + 1).padStart(2, "0");
    const Y = today.getFullYear();
    const ddmmyyyy = `${D}-${M}-${Y}`;

    // 🎫 Fetch all tickets of today
    const rows = await tickets.findAll({
      where: { gameTime: { [Op.like]: `${ddmmyyyy}%` } },
      attributes: ["ticketNumber", "loginId", "drawTime", "gameTime"],
      order: [["createdAt", "DESC"]],
    });

    // 🧩 Parse ticketNumber safely
const parseTicketNumber = (raw) => {
  if (!raw) return {};

  // If already array → convert into object
  if (Array.isArray(raw)) {
    const out = {};
    raw.forEach(item => {
      out[item.ticketNumber] = Number(item.quantity || 0);
    });
    return out;
  }

  // If JSON string containing array → parse it
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const out = {};
        parsed.forEach(item => {
          out[item.ticketNumber] = Number(item.quantity || 0);
        });
        return out;
      }
    } catch {}
  }

  return {};
};

    // 🧩 Ensure drawTime is always an array
    const toTimeArray = (val) => {
      if (Array.isArray(val)) return val.map(String);
      if (typeof val === "string") {
        try {
          const parsed = JSON.parse(val);
          return Array.isArray(parsed) ? parsed.map(String) : [val];
        } catch {
          return [val];
        }
      }
      return [];
    };

    // 🧮 Group by Admin → DrawTime → Series
    const adminGroups = {};

    for (const t of rows) {
      const adminId = t.loginId;
      const drawTimes = toTimeArray(t.drawTime);

      // 🕕 Filter by specific draw time if provided
      if (drawTime && !drawTimes.includes(drawTime)) continue;

      if (!adminGroups[adminId]) {
        adminGroups[adminId] = {
          shopId: adminId,
          date: String(t.gameTime).split(" ")[0],
          draws: {},
        };
      }

      const parsedTickets = parseTicketNumber(t.ticketNumber);

      drawTimes.forEach((timeSlot) => {
        if (drawTime && timeSlot !== drawTime) return; // strict match

        if (!adminGroups[adminId].draws[timeSlot]) {
          adminGroups[adminId].draws[timeSlot] = {
            drawTime: timeSlot,
            series10: {},
            series30: {},
            series50: {},
          };
        }

        // 🔢 Sort ticket numbers into correct series buckets
        for (const [ticketNum, qtyRaw] of Object.entries(parsedTickets)) {
          const qty = Number(qtyRaw) || 0;
          const cleanNum = String(ticketNum).replace("-", "");
          const base = parseInt(cleanNum.substring(0, 2), 10);
          const draw = adminGroups[adminId].draws[timeSlot];

          if (base >= 10 && base <= 19)
            draw.series10[cleanNum] = (draw.series10[cleanNum] || 0) + qty;
          else if (base >= 30 && base <= 39)
            draw.series30[cleanNum] = (draw.series30[cleanNum] || 0) + qty;
          else if (base >= 50 && base <= 59)
            draw.series50[cleanNum] = (draw.series50[cleanNum] || 0) + qty;
        }
      });
    }

    // 🏪 Fetch shop names for all adminIds
    const adminIds = Object.keys(adminGroups);
    const adminRecords = await Admin.findAll({
      where: { id: { [Op.in]: adminIds } },
      attributes: ["id", "shopName"],
    });

    const adminMap = {};
    for (const a of adminRecords) {
      adminMap[a.id] = a.shopName || "Unknown Shop";
    }

    // 🧾 Build final structured result
    const result = Object.values(adminGroups).map((admin) => ({
      shopId: admin.shopId,
      shopName: adminMap[admin.shopId] || "Unknown Shop",
      date: admin.date,
      draws: Object.values(admin.draws).map((draw) => ({
        drawTime: draw.drawTime,
        series10: Object.entries(draw.series10).map(([num, qty]) => ({
          ticketNumber: num,
          quantity: qty,
        })),
        series30: Object.entries(draw.series30).map(([num, qty]) => ({
          ticketNumber: num,
          quantity: qty,
        })),
        series50: Object.entries(draw.series50).map(([num, qty]) => ({
          ticketNumber: num,
          quantity: qty,
        })),
      })),
    }));

    // ✅ Final Response
    return res.status(200).json({
      success: true,
      dateUsed: ddmmyyyy,
      drawTime: drawTime || "All",
      count: result.length,
      tickets: result,
    });
  } catch (error) {
    console.error("❌ Error in getTicketsBySeriesWithShop:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch tickets",
      error: error.message,
    });
  }
};

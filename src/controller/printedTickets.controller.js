import { Op } from "sequelize";
import { sequelizeCon } from "../init/dbConnection.js";
import Admin from "../models/admins.model.js";
import { tickets } from "../models/ticket.model.js";
import { threed } from "../models/threed.model.js";

// Function to parse the ticket number string into a clean JSON format
const parseTicketNumberString = (ticketNumberStr) => {
  const parsedData = [];

  if (!ticketNumberStr) return parsedData;

  try {
    // Split the string by commas (each ticket number and quantity pair)
    const pairs = ticketNumberStr
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);

    // For each pair, split by colon to separate ticket number and quantity
    parsedData.push(
      ...pairs.map((p) => {
        const [num, qty] = p.split(":").map((s) => s.trim());
        return {
          ticketNumber: num.replace("-", ""),  // Clean up the ticket number
          quantity: parseInt(qty) || 0,         // Ensure quantity is a number
        };
      })
    );
  } catch (err) {
    console.log("Parse error:", err);
  }

  return parsedData;
};

export const savePrintedTickets = async (req, res) => {
  const t = await sequelizeCon.transaction();
  try {
    let {
      gameTime,
      ticketNumber, // Example format: "10-00 : 1, 11-00 : 1, ..."
      totalQuatity,
      totalPoints,
      loginId,
      drawTime,
    } = req.body;

    console.log("🧾 Incoming Ticket Data:", req.body);

    // --- Validation ---
    if (!Array.isArray(drawTime) || drawTime.length === 0) {
      await t.rollback();
      return res
        .status(400)
        .json({ message: "drawTime must be a non-empty array." });
    }

    console.log("🎯 Raw drawTime received:", JSON.stringify(drawTime, null, 2));

    // Normalize nested drawTime arrays
    let normalizedDrawTimes = [];

    drawTime.forEach((item) => {
      if (Array.isArray(item)) {
        normalizedDrawTimes.push(...item);
      } else {
        normalizedDrawTimes.push(item);
      }
    });

    console.log("🧩 Normalized Draw Times:", normalizedDrawTimes);
    drawTime = normalizedDrawTimes;

    const basePoints = Number(totalPoints);
    if (!Number.isFinite(basePoints) || basePoints < 0) {
      await t.rollback();
      return res
        .status(400)
        .json({ message: "totalPoints must be a non-negative number." });
    }

    if (!loginId) {
      await t.rollback();
      return res.status(400).json({ message: "loginId is required." });
    }

    // Lock admin record
    const admin = await Admin.findOne({
      where: { id: loginId },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!admin) {
      await t.rollback();
      return res.status(404).json({ message: "Admin not found." });
    }

    const currentBalance = Number(admin.balance || 0);
    const commissionPercent = Number(admin.commission || 0);

    console.log("💳 Previous Balance:", currentBalance.toFixed(2));

    // Commission calculation
    const commissionAmount = (basePoints * commissionPercent) / 100;
    const finalDeductPoints = basePoints - commissionAmount;

    console.log("💰 Base Points:", basePoints);
    console.log("🏪 Commission (%):", commissionPercent);
    console.log("💵 Commission Earned:", commissionAmount.toFixed(2));
    console.log("📉 Net Deduction from Balance:", finalDeductPoints.toFixed(2));

    // Check sufficient balance
    if (currentBalance < finalDeductPoints) {
      await t.rollback();
      return res.status(400).json({
        message: "Insufficient balance.",
        currentBalance,
        required: finalDeductPoints,
      });
    }

    // Deduct balance
    admin.balance = currentBalance - finalDeductPoints;
    await admin.save({ transaction: t });

    console.log("✅ Balance after deduction:", admin.balance.toFixed(2));

    // --- Process and Store Ticket Number as JSON ---
    // Parse the ticket number string into a JSON object (key-value pairs)
    const parsedTicketNumbers = parseTicketNumberString(ticketNumber);

    // Directly use the parsedTicketNumbers (no need to stringify it if you're storing it as JSON)
    console.log("🧾 Parsed Ticket Numbers (JSON):", parsedTicketNumbers);

    // --- Create Ticket Record ---
    const newTicket = await tickets.create(
      {
        gameTime,
        loginId,
        ticketNumber: parsedTicketNumbers, // Store as an actual JSON object, no stringification
        totalQuatity,
        // ✅ SAVE ONLY THE NET POINTS AFTER COMMISSION
        totalPoints: Number(finalDeductPoints),
        drawTime,
        commissionApplied: commissionPercent,
        commissionEarned: commissionAmount,
        deductedPoints: finalDeductPoints,
      },
      { transaction: t }
    );

    // Commit transaction
    await t.commit();

    console.log("🎟️ Ticket saved successfully:", newTicket.id);

    return res.status(201).json({
      message: "Ticket saved and commission applied successfully.",
      ticket: newTicket,
      commissionApplied: commissionPercent,
      commissionEarned: Number(commissionAmount.toFixed(2)),
      deductedPoints: Number(finalDeductPoints.toFixed(2)),
      previousBalance: Number(currentBalance.toFixed(2)),
      newBalance: Number(admin.balance.toFixed(2)),
    });

  } catch (error) {
    console.error("🔥 Error saving ticket:", error);
    try {
      await t.rollback();
    } catch {
      console.error("⚠️ Transaction rollback failed.");
    }
    return res.status(500).json({ message: "Internal Server Error" });
  }
};


function todayDateStrIST() {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000; // +5:30 hrs in ms
  const istNow = new Date(now.getTime() + istOffset);
  return istNow.toISOString().split("T")[0];
}

/* ---------- Controller ---------- */
export const getPrintedTickets = async (req, res) => {
  try {
    const { loginId } = req.body;

    if (!loginId) {
      return res.status(400).json({ message: "loginId (adminId) is required" });
    }

    const today = todayDateStrIST();
    const tomorrow = new Date(new Date().getTime() + 24 * 60 * 60 * 1000);
    const tomorrowStr = new Date(tomorrow.getTime() + 5.5 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    console.log(`\n🧾 [REPRINT TICKET CHECK] Admin ID: ${loginId}`);
    console.log(`📅 Today (IST): ${today}`);

    const todaysTickets = await tickets.findAll({
      where: {
        loginId,
        createdAt: {
          [Op.gte]: `${today} 00:00:00`,
          [Op.lt]: `${tomorrowStr} 00:00:00`,
        },
      },
      attributes: [
        "id",
        "gameTime",
        "drawTime",
        "ticketNumber",
        "totalPoints",
        "totalQuatity",
        "createdAt",
      ],
      order: [["id", "DESC"]],
    });

    if (!todaysTickets.length) {
      return res.status(200).json({ message: "No tickets found for today", data: [] });
    }

    

const result = todaysTickets.map((t) => {
  let gameDate = "";
  let gameTime = "";

  if (typeof t.gameTime === "string") {
    const [date, ...timeParts] = t.gameTime.split(" ");
    gameDate = date || "";
    gameTime = timeParts.join(" ") || "";
  }

  // ⭐ FIX: Ensure ticketNumber is always JSON array
  let parsedTicketNumbers = [];

  if (Array.isArray(t.ticketNumber)) {
    parsedTicketNumbers = t.ticketNumber;
  } else if (typeof t.ticketNumber === "string") {
    try {
      parsedTicketNumbers = JSON.parse(t.ticketNumber);
    } catch {
      parsedTicketNumbers = [];
    }
  }

  return {
    ticketNo: t.id,
    gameDate,
    gameTime,
    drawTime: t.drawTime,
    ticketNumber: parsedTicketNumbers,
    totalPoints: t.totalPoints,
    totalQuatity: t.totalQuatity,
  };
});


    console.log(`✅ Found ${result.length} tickets for admin ${loginId} (IST Date: ${today}).`);

    return res.status(200).json({
      message: "success",
      date: today,
      data: result,
    });
  } catch (err) {
    console.error("🔥 Error fetching today's tickets:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const subtractAdminBalance = async (req, res) => {
  try {
    const { id, amount } = req.body;

    // Validate input
    if (!id || typeof amount !== "number" || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ success: false, message: "Invalid id or amount." });
    }

    // Find the admin by id
    const admin = await Admin.findOne({ where: { id } });

    if (!admin) {
      return res.status(404).json({ success: false, message: "Admin not found." });
    }

    // Commission logic
    const commissionRate = admin.commission || 0; // percentage, e.g., 5
    const commissionAmount = (commissionRate / 100) * amount;
    const netSubtract = amount - commissionAmount;

    // Optional: round to 2 decimal places for paisa handling
    const netSubtractRounded = Math.round(netSubtract * 100) / 100;

    // Check if the net amount is bigger than the balance
    if (admin.balance < netSubtractRounded) {
      return res.status(400).json({ 
        success: false, 
        message: `Insufficient balance. Your current balance is ${admin.balance}, which is less than the required deduction (${netSubtractRounded}).`
      });
    }

    // Subtract the net amount from the current balance
    admin.balance = admin.balance - netSubtractRounded;
    await admin.save();

    res.status(200).json({
      success: true,
      message: `Balance subtracted successfully for admin ID ${id}. Commission deducted: ${commissionAmount}. Net deducted: ${netSubtractRounded}.`,
      updatedBalance: admin.balance,
      commission: commissionAmount,
      netSubtracted: netSubtractRounded,
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Server error while subtracting balance.",
      error: error.message,
    });
  }
};


export const getPrinted3DTickets = async (req, res) => {
  try {
    const { loginId } = req.body;

    if (!loginId) {
      return res.status(400).json({
        message: "loginId (adminId) is required",
      });
    }

    const today = todayDateStrIST();

    const tomorrow = new Date(new Date().getTime() + 24 * 60 * 60 * 1000);
    const tomorrowStr = new Date(
      tomorrow.getTime() + 5.5 * 60 * 60 * 1000
    )
      .toISOString()
      .split("T")[0];

    const todays3DTickets = await threed.findAll({
      where: {
        loginId,
        createdAt: {
          [Op.gte]: `${today} 00:00:00`,
          [Op.lt]: `${tomorrowStr} 00:00:00`,
        },
      },
      attributes: [
        "id",
        "gameTime",
        "ticketNumbers",
        "totalPoints",
        "totalQuantity",
        "range",
        "createdAt",
      ],
      order: [["id", "DESC"]],
    });

    if (!todays3DTickets.length) {
      return res.status(200).json({
        message: "No 3D tickets found for today",
        data: [],
      });
    }

    const result = todays3DTickets.map((t) => {
      let gameDate = "";
      let gameTime = "";

      if (t.gameTime) {
        const dateObj = new Date(t.gameTime);
        gameDate = dateObj.toISOString().split("T")[0];
        gameTime = dateObj.toTimeString().split(" ")[0];
      }

      let parsedTicketNumbers = [];

      if (Array.isArray(t.ticketNumbers)) {
        parsedTicketNumbers = t.ticketNumbers;
      } else if (typeof t.ticketNumbers === "string") {
        try {
          parsedTicketNumbers = JSON.parse(t.ticketNumbers);
        } catch {
          parsedTicketNumbers = [];
        }
      }

      return {
        ticketNo: t.id,
        gameDate,
        gameTime,
        ticketNumbers: parsedTicketNumbers,
        range: t.range,                 // ✅ NOW INCLUDED
        totalQuantity: t.totalQuantity, // ✅ NOW CONFIRMED
        totalPoints: t.totalPoints,
      };
    });

    return res.status(200).json({
      message: "success",
      date: today,
      data: result,
    });
  } catch (err) {
    console.error("🔥 Error fetching today's 3D tickets:", err);
    return res.status(500).json({
      message: "Internal server error",
    });
  }
};


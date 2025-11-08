import { tickets } from "../models/ticket.model.js";
import Admin from "../models/admins.model.js";
import { winningPercentage } from "../models/winningPercentage.model.js";
import { winningNumbers } from "../models/winningNumbers.model.js";

/* ------------------------------------------------------------------
   🧩 Helper Functions
------------------------------------------------------------------ */

// 🔹 Return ["10", "11", ..., "19"] for prefix = "10"
function getPrefixList(seriesPrefix) {
  const start = parseInt(seriesPrefix);
  return Array.from({ length: 10 }, (_, i) => String(start + i));
}

// 🔹 Return random two-digit string (e.g., "07", "42")
function getRandomTwoDigits() {
  return String(Math.floor(Math.random() * 100)).padStart(2, "0");
}

// 🔹 Extract the series prefix (first 2 digits) from a ticket number
function getSeries(numStr) {
  if (numStr.length < 4) return null;
  return numStr.slice(0, 2);
}

// 🔹 Build 10 numbers for each prefix series (10, 30, 50)
function makeSeriesWinners(prefix, allTicketEntries) {
  const prefixList = getPrefixList(prefix);
  const result = [];

  for (const pfx of prefixList) {
    const candidates = allTicketEntries.filter((entry) =>
      entry.number.startsWith(pfx)
    );

    if (candidates.length > 0) {
      // pick the first matching ticket
      result.push(candidates[0]);
    } else {
      // no match — fill with random number
      result.push({
        number: pfx + getRandomTwoDigits(),
        value: 0,
      });
    }
  }

  return result;
}

/* ------------------------------------------------------------------
   🎯 Controller: Get Tickets By Draw Time
------------------------------------------------------------------ */
export const getTicketsByDrawTime = async (req, res) => {
  try {
    const { drawTime, adminId } = req.body;

    if (!drawTime || !adminId) {
      return res
        .status(400)
        .json({ message: "drawTime and adminId are required" });
    }

    const currentDate = new Date().toISOString().split("T")[0];

    // 🔹 Check if already declared
    const existingResult = await winningNumbers.findOne({
      where: { DrawTime: drawTime, drawDate: currentDate, loginId: adminId },
    });

    if (existingResult) {
      const storedNumbers =
        typeof existingResult.winningNumbers === "string"
          ? JSON.parse(existingResult.winningNumbers)
          : existingResult.winningNumbers;

      const series10 = makeSeriesWinners("10", storedNumbers);
      const series30 = makeSeriesWinners("30", storedNumbers);
      const series50 = makeSeriesWinners("50", storedNumbers);

      return res.status(200).json({
        drawTime,
        numbersBySeries: { "10": series10, "30": series30, "50": series50 },
        selectedTickets: storedNumbers,
      });
    }

    // 🔹 If no result exists, return blank random fallback
    const genSeries = (prefix) =>
      getPrefixList(prefix).map((pfx) => ({
        number: pfx + getRandomTwoDigits(),
        value: 0,
      }));

    const fill10 = genSeries("10");
    const fill30 = genSeries("30");
    const fill50 = genSeries("50");

    return res.status(200).json({
      drawTime,
      numbersBySeries: { "10": fill10, "30": fill30, "50": fill50 },
      selectedTickets: [...fill10, ...fill30, ...fill50],
    });
  } catch (error) {
    console.error("Error fetching winning numbers:", error);
    return res
      .status(500)
      .json({ message: "Server error", error: error.message });
  }
};

/* ------------------------------------------------------------------
   📊 Controller: Get Navbar Details (balance, last ticket)
------------------------------------------------------------------ */
export const getNavbarDetails = async (req, res) => {
  try {
    const { loginId } = req.body;
    if (!loginId) {
      return res.status(400).json({ message: "loginId required" });
    }

    const admin = await Admin.findByPk(loginId, {
      attributes: ["balance", "commission"],
    });

    const lastTicket = await tickets.findOne({
      where: { loginId },
      order: [["createdAt", "DESC"]],
      attributes: ["id", "totalPoints"],
    });

    return res.status(200).json({
      lastTicketNumber: lastTicket?.id || "-",
      lastTotalPoint: lastTicket?.totalPoints || 0,
      balance: admin?.balance || 0,
      commission: admin?.commission || 0,
    });
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ message: "Server error", error: err.message });
  }
};


export const getWinningNumbersByLoginId = async (req, res) => {
  try {
    const { loginId } = req.body;
    if (!loginId) {
      return res.status(400).json({ message: "loginId is required" });
    }

    // Get today's date string (YYYY-MM-DD)
    const today = new Date();
    const todayDate = today.toISOString().split("T")[0];

    // Fetch only today's winning numbers
    const records = await winningNumbers.findAll({
      where: {
        loginId,
        drawDate: todayDate, // ✅ Only today's date
      },
      attributes: ["winningNumbers", "DrawTime", "drawDate"],
      order: [
        ["drawDate", "DESC"],
        ["createdAt", "DESC"],
      ],
    });

    return res.status(200).json({
      count: records.length,
      results: records,
    });
  } catch (err) {
    console.error("Error fetching today's winning numbers:", err);
    return res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  }
};

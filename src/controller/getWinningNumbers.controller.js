import { tickets } from "../models/ticket.model.js";
import Admin from "../models/admins.model.js";
import { winningPercentage } from "../models/winningPercentage.model.js";
import { winningNumbers } from "../models/winningNumbers.model.js"; // Import winningNumbers model

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function getRange(min, max) {
  const arr = [];
  for (let i = min; i <= max; i++) arr.push(i.toString());
  return arr;
}
function getRandomFromRange(rangeArr, count, excludeList = []) {
  const available = rangeArr.filter(x => !excludeList.includes(x));
  for (let i = available.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [available[i], available[j]] = [available[j], available[i]];
  }
  return available.slice(0, count);
}
function getSeries(numStr) {
  if (numStr.length < 4) return null;
  return numStr.slice(0, 2);
}

export const getTicketsByDrawTime = async (req, res) => {
  try {
    const { drawTime, adminId } = req.body;
    console.log(drawTime);
    if (!drawTime || !adminId) {
      return res.status(400).json({ message: "drawTime and adminId are required" });
    }

    const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const queryTime = drawTime.trim().toLowerCase();

    // --- CHECK IF RESULT ALREADY DECLARED ---
    const existingResult = await winningNumbers.findOne({
      where: {
        DrawTime: drawTime,
        drawDate: currentDate
      }
    });

    if (existingResult) {
      // Parse winning numbers JSON if stored as string
      const storedNumbers =
        typeof existingResult.winningNumbers === "string"
          ? JSON.parse(existingResult.winningNumbers)
          : existingResult.winningNumbers;

      // Split stored numbers into series
      const seriesSelected = { "10": [], "30": [], "50": [] };
      storedNumbers.forEach(entry => {
        const prefix = getSeries(entry.number);
        if (seriesSelected[prefix]) seriesSelected[prefix].push(entry);
      });

      return res.status(200).json({
        message: `Result already declared for draw time "${drawTime}" on ${currentDate}.`,
        drawTime,
        totalPoints: existingResult.totalPoints,
        commission: null, // Not applicable from stored data
        winningPercentage: null, // Not applicable from stored data
        updatedTotalPoint: null, // Not applicable from stored data
        selectedTickets: storedNumbers,
        sumOfSelected: storedNumbers.reduce((sum, t) => sum + Number(t.value), 0),
        numbersBySeries: seriesSelected
      });
    }

    // --- NEW RESULT CALCULATION ---
    const allTickets = await tickets.findAll({
      attributes: ["ticketNumber", "totalPoints", "drawTime"]
    });

    const filtered = allTickets.filter(ticket => {
      if (!ticket.drawTime) return false;
      let times;
      try {
        times = Array.isArray(ticket.drawTime)
          ? ticket.drawTime
          : JSON.parse(ticket.drawTime);
      } catch (e) {
        return false;
      }
      if (!Array.isArray(times)) return false;
      return times.map(t => String(t).trim().toLowerCase()).includes(queryTime);
    });

    const admin = await Admin.findByPk(adminId, { attributes: ["commission"] });
    if (!admin) {
      return res.status(404).json({ message: "Admin not found." });
    }

    if (!filtered.length) {
      const fill10 = getRandomFromRange(getRange(1000, 1999), 10).map(n => ({ number: n, value: 0 }));
      const fill30 = getRandomFromRange(getRange(3000, 3999), 10).map(n => ({ number: n, value: 0 }));
      const fill50 = getRandomFromRange(getRange(5000, 5999), 10).map(n => ({ number: n, value: 0 }));

      // Save empty winning numbers
      await winningNumbers.create({
        loginId: adminId,
        winningNumbers: [...fill10, ...fill30, ...fill50],
        totalPoints: 0,
        DrawTime: drawTime,
        drawDate: currentDate
      });

      return res.status(200).json({
        drawTime,
        totalPoints: 0,
        commission: Number(admin.commission),
        winningPercentage: 0,
        updatedTotalPoint: 0,
        selectedTickets: [...fill10, ...fill30, ...fill50],
        sumOfSelected: 0,
        numbersBySeries: {
          "10": fill10,
          "30": fill30,
          "50": fill50,
        }
      });
    }

    const ticketMap = {};
    filtered.forEach(ticket => {
      let ticketStr = ticket.ticketNumber;
      if (typeof ticketStr === "string" && ticketStr.startsWith('"') && ticketStr.endsWith('"')) {
        ticketStr = ticketStr.slice(1, -1);
      }
      const parts = ticketStr.split(",").map(p => p.trim()).filter(Boolean);
      parts.forEach(part => {
        const [num, val] = part.split(":").map(s => s.trim());
        if (num && val && !isNaN(val)) {
          const numericNum = num.replace(/-/g, "");
          ticketMap[numericNum] = (ticketMap[numericNum] || 0) + Number(val);
        }
      });
    });

    const allTicketEntries = Object.entries(ticketMap).map(([number, value]) => ({
      number,
      value,
    }));

    const seriesMap = { "10": [], "30": [], "50": [] };
    allTicketEntries.forEach(entry => {
      const prefix = getSeries(entry.number);
      if (seriesMap[prefix]) {
        seriesMap[prefix].push(entry);
      }
    });

    Object.keys(seriesMap).forEach(series => shuffleArray(seriesMap[series]));

    const totalPoints = filtered.reduce(
      (sum, ticket) => sum + Number(ticket.totalPoints),
      0
    );
    const commissionPercent = Number(admin.commission) || 0;
    const afterCommission = totalPoints - (totalPoints * commissionPercent / 100);

    const latestWinning = await winningPercentage.findOne({
      order: [['createdAt', 'DESC']]
    });
    const winningPercent = latestWinning ? Number(latestWinning.percentage) : 0;
    const updatedTotalPoint = Math.round(afterCommission * (winningPercent / 100));

    let runningSum = 0;
    const perSeriesLimit = 10;
    let seriesSelected = { "10": [], "30": [], "50": [] };

    for (const series of ["10", "30", "50"]) {
      for (const entry of seriesMap[series]) {
        if (seriesSelected[series].length >= perSeriesLimit) break;
        if (runningSum + entry.value > updatedTotalPoint) break;
        seriesSelected[series].push(entry);
        runningSum += entry.value;
      }
    }

    const fillSeries = (prefix, range) => {
      if (seriesSelected[prefix].length < 10) {
        const already = seriesSelected[prefix].map(e => e.number);
        const fill = getRandomFromRange(getRange(...range), 10 - already.length, already)
          .map(n => ({ number: n, value: 0 }));
        seriesSelected[prefix] = [...seriesSelected[prefix], ...fill];
      }
    };
    fillSeries("10", [1000, 1999]);
    fillSeries("30", [3000, 3999]);
    fillSeries("50", [5000, 5999]);

    const selectedTickets = [...seriesSelected["10"], ...seriesSelected["30"], ...seriesSelected["50"]];

    // --- SAVE WINNING NUMBERS ---
    await winningNumbers.create({
      loginId: adminId,
      winningNumbers: selectedTickets,
      totalPoints,
      DrawTime: drawTime,
      drawDate: currentDate
    });

    return res.status(200).json({
      drawTime,
      totalPoints,
      commission: commissionPercent,
      winningPercentage: winningPercent,
      updatedTotalPoint,
      selectedTickets,
      sumOfSelected: runningSum,
      numbersBySeries: {
        "10": seriesSelected["10"],
        "30": seriesSelected["30"],
        "50": seriesSelected["50"],
      }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

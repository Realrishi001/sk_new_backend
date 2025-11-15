import { Op } from "sequelize";
import { tickets } from "../models/ticket.model.js";
import { winningNumbers } from "../models/winningNumbers.model.js";
import { winningPercentage } from "../models/winningPercentage.model.js";

const POINTS_PER_QUANTITY = 180;

const formatDrawTime = (time) => {
  if (!time) return "";
  let clean = String(time).trim().toUpperCase();
  clean = clean.replace(/(AM|PM)/, " $1").trim();

  const match = clean.match(/^(\d{1,2})[:.]?(\d{0,2})?\s*(AM|PM)$/);
  if (!match) return clean;

  let [, h, m, p] = match;
  h = String(h).padStart(2, "0");
  m = m ? String(m).padStart(2, "0") : "00";

  return `${h}:${m} ${p}`;
};

// Parse ticket numbers into a map { ticketNumber: quantity }
const parseTicketNumberToMap = (ticketStr) => {
  const map = {};

  if (!ticketStr) return map;

  try {
    const pairs = String(ticketStr)
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);

    for (let p of pairs) {
      const [num, qty] = p.split(":").map((s) => s.trim());
      const number = num.replace(/-/g, "");
      const quantity = Number(qty || 0);
      map[number] = (map[number] || 0) + quantity;
    }
  } catch (err) {
    console.log("Parse error:", err);
  }

  return map;
};

// Helper random generator for non-ticket numbers
const randomFillExcluding = (prefix, used, existingArr) => {
  const result = [...existingArr];

  while (result.length < 10) {
    const randomTwo = Math.floor(Math.random() * 100)
      .toString()
      .padStart(2, "0");

    const num = `${prefix}${randomTwo}`;

    if (!used.has(num)) {
      used.add(num);
      result.push({
        number: num,
        quantity: 0,
        value: 0,
      });
    }
  }

  return result;
};

// Randomly choose the case logic (1, 2, 3, or 4)
const randomCase = () => {
  return Math.floor(Math.random() * 4) + 1; // Randomly returns 1, 2, 3, or 4
};

// Logic for different cases
const handleWinningCases = (filteredTickets, qtyCapacity, totals, usedWinners) => {
  const caseNum = randomCase();
  let winners = [];

  switch (caseNum) {
    case 1:
      // **Case 1:** Ticket with highest quantity
      const sortedMax = Object.entries(totals)
        .map(([num, qty]) => ({ number: num, qty }))
        .sort((a, b) => b.qty - a.qty);

      for (let item of sortedMax) {
        if (item.qty <= qtyCapacity) {
          winners.push({
            number: item.number,
            quantity: item.qty,
            value: item.qty * POINTS_PER_QUANTITY,
          });
          qtyCapacity -= item.qty;
        }
        if (qtyCapacity <= 0) break;
      }
      break;

    case 2:
      // **Case 2:** Tickets with the minimum quantity
      const sortedMin = Object.entries(totals)
        .map(([num, qty]) => ({ number: num, qty }))
        .sort((a, b) => a.qty - b.qty);

      for (let item of sortedMin) {
        if (item.qty <= qtyCapacity) {
          winners.push({
            number: item.number,
            quantity: item.qty,
            value: item.qty * POINTS_PER_QUANTITY,
          });
          qtyCapacity -= item.qty;
        }
        if (qtyCapacity <= 0) break;
      }
      break;

    case 3:
      // **Case 3:** No tickets taken → Random fill, excluding taken ticket numbers
      if (!filteredTickets.length) {
        console.log("⚠ No tickets found → Generating RANDOM full series excluding taken numbers");

        // Collect all the numbers already taken in tickets for this draw
        const takenNumbers = new Set();
        filteredTickets.forEach((ticket) => {
          const parsed = parseTicketNumberToMap(ticket.ticketNumber);
          Object.keys(parsed).forEach((num) => takenNumbers.add(num));
        });

        // Generate random numbers, excluding taken numbers
        winners = randomFillExcluding("10", takenNumbers, []);
        winners = winners.concat(randomFillExcluding("30", takenNumbers, []));
        winners = winners.concat(randomFillExcluding("50", takenNumbers, []));
      }
      break;

    case 4:
      // **Case 4:** One large quantity of ticket numbers
      const sortedByQty = Object.entries(totals)
        .map(([num, qty]) => ({ number: num, qty }))
        .sort((a, b) => b.qty - a.qty);

      if (sortedByQty.length > 0) {
        const largest = sortedByQty[0]; // pick the highest quantity ticket
        winners.push({
          number: largest.number,
          quantity: largest.qty,
          value: largest.qty * POINTS_PER_QUANTITY,
        });
      }
      break;
  }

  return winners;
};

// Main function to generate winning numbers based on cases
export const autoGenerateWinningNumbers = async (drawTime) => {
  try {
    const normalized = formatDrawTime(drawTime);
    const drawDate = new Date().toISOString().split("T")[0];

    console.log(`⏳ Auto Draw Triggered → ${normalized}`);

    // Check if result already exists for this draw time
    const exists = await winningNumbers.findOne({
      where: { DrawTime: normalized, drawDate },
    });

    if (exists) {
      console.log(`⛔ Result already exists for ${normalized}`);
      return false;
    }

    // Fetch all tickets for today
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const allTickets = await tickets.findAll({
      where: { createdAt: { [Op.between]: [start, end] } },
      attributes: ["ticketNumber", "totalPoints", "drawTime"],
    });

    // Filter tickets by draw time
    const filteredTickets = allTickets.filter((ticket) => {
      try {
        const times = Array.isArray(ticket.drawTime)
          ? ticket.drawTime
          : JSON.parse(ticket.drawTime);
        return times.map((x) => formatDrawTime(x)).includes(normalized);
      } catch {
        return false;
      }
    });

    // If no tickets found, generate random winning numbers
    if (!filteredTickets.length) {
      console.log("⚠ No tickets found → Saving RANDOM full series");

      const series10 = randomFillExcluding("10", new Set(), []);
      const series30 = randomFillExcluding("30", new Set(), []);
      const series50 = randomFillExcluding("50", new Set(), []);

      await winningNumbers.create({
        loginId: 0,
        winningNumbers: [...series10, ...series30, ...series50],
        totalPoints: 0,
        DrawTime: normalized,
        drawDate,
      });

      return true;
    }

    // Calculate total points from the filtered tickets
    const totalPoints = filteredTickets.reduce(
      (sum, ticket) => sum + Number(ticket.totalPoints || 0),
      0
    );

    // Winning percentage logic
    const latest = await winningPercentage.findOne({
      order: [["createdAt", "DESC"]],
    });

    const winningPercent = latest ? Number(latest.percentage || 0) : 0;
    const winningPool = Math.floor((totalPoints * winningPercent) / 100);
    let qtyCapacity = Math.floor(winningPool / POINTS_PER_QUANTITY);

    // Build the ticket numbers map
    const totals = {};

    for (let ticket of filteredTickets) {
      const parsed = parseTicketNumberToMap(ticket.ticketNumber);
      for (let [num, qty] of Object.entries(parsed)) {
        totals[num] = (totals[num] || 0) + qty;
      }
    }

    // Handle winning cases logic
    const winners = handleWinningCases(filteredTickets, qtyCapacity, totals);

    // Save the final winning numbers
    await winningNumbers.create({
      loginId: 0,
      winningNumbers: winners,
      totalPoints,
      DrawTime: normalized,
      drawDate,
    });

    console.log(`🎉 WINNING NUMBERS SAVED FOR ${normalized}`);
    return true;

  } catch (err) {
    console.error("❌ Auto Draw Error:", err);
    return false;
  }
};

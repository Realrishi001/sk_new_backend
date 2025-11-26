import { Op } from "sequelize";
import { tickets } from "../models/ticket.model.js";
import { winningPercentage } from "../models/winningPercentage.model.js";
import { winningNumbers } from "../models/winningNumbers.model.js";
import Admin from "../models/admins.model.js";

export const manualGenerateWinningNumbers = async (req, res) => {
  try {
    // Detect AUTO mode (scheduler)
    const isAuto = !res;
    const body = isAuto ? req : req.body;

    const { drawTime, drawDate } = body;
    const PRICE = 180;

    if (!drawTime || !drawDate) {
      if (isAuto) return { success: false, message: "drawTime and drawDate required" };
      return res.status(400).json({ message: "drawTime and drawDate required" });
    }

    const normalizeTime = (t) => String(t).trim().toUpperCase();
    const normalizedTime = normalizeTime(drawTime);

    // ------------------------------------
    // CHECK IF RESULT ALREADY EXISTS
    // ------------------------------------
    const already = await winningNumbers.findOne({
      where: {
        drawDate,
        DrawTime: { [Op.like]: `%${normalizedTime}%` }
      },
    });

    if (already) {
      if (isAuto) return { success: false, message: "Result already declared" };
      return res.status(400).json({ message: "Result already declared" });
    }

    // ------------------------------------
    // DATE RANGE
    // ------------------------------------
    const start = new Date(drawDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(drawDate);
    end.setHours(23, 59, 59, 999);

    const allTickets = await tickets.findAll({
      where: { createdAt: { [Op.between]: [start, end] } },
    });

    // ------------------------------------
    // FILTER BY DRAW TIME
    // ------------------------------------
    const filtered = allTickets.filter((t) => {
      try {
        const dt = Array.isArray(t.drawTime)
          ? t.drawTime
          : JSON.parse(t.drawTime);
        return dt.map(normalizeTime).includes(normalizedTime);
      } catch {
        return normalizeTime(t.drawTime) === normalizedTime;
      }
    });

    // ------------------------------------------------------------
    // IF NO TICKETS → GENERATE PURE RANDOM 30 NUMBERS & SAVE
    // ------------------------------------------------------------
    if (filtered.length === 0) {
      const generateSeries = (prefixStart) => {
        const arr = [];
        const used = new Set();

        for (let p = prefixStart; p < prefixStart + 10; p++) {
          let num;
          do {
            const last2 = String(Math.floor(Math.random() * 100)).padStart(2, "0");
            num = String(p) + last2;
          } while (used.has(num));
          used.add(num);

          arr.push({
            number: num,
            quantity: 0,
            payout: 0,
          });
        }
        return arr;
      };

      const final30 = [
        ...generateSeries(10),
        ...generateSeries(30),
        ...generateSeries(50),
      ];

      await winningNumbers.create({
        loginId: 0,
        winningNumbers: final30,
        totalPoints: 0,
        DrawTime: normalizedTime,
        drawDate,
      });

      const responseData = {
        message: "Winners selected successfully",
        caseUsed: "random",
        winners: final30.map((x) => ({
          number: x.number,
          quantity: 0,
          payout: 0,
          fromTicket: null,
          ticketIds: [],
          ticketCount: 0,
        })),
      };

      if (isAuto) return { success: true, ...responseData };
      return res.status(200).json(responseData);
    }

    // ------------------------------------------------------------
    // ORIGINAL LOGIC (UNTOUCHED)
    // ------------------------------------------------------------

    const priorityAdmins = await Admin.findAll({
      where: { priorWinning: true },
      attributes: ["id"],
    });

    const priorityLoginIds = priorityAdmins.map((x) => String(x.id));
    const hasPriority = priorityLoginIds.length > 0;

    const totalPoints = filtered.reduce(
      (s, t) => s + Number(t.totalPoints || 0),
      0
    );

    const wp = await winningPercentage.findOne({
      order: [["createdAt", "DESC"]],
    });

    const percent = wp ? Number(wp.percentage) : 0;
    const winningPoolOriginal = Math.floor((totalPoints * percent) / 100);

    let qtyCapacity = Math.floor(winningPoolOriginal / PRICE);

    const parsedTickets = filtered.map((t) => {
      let items = [];
      try {
        items = Array.isArray(t.ticketNumber)
          ? t.ticketNumber
          : JSON.parse(t.ticketNumber);
      } catch {
        items = [];
      }

      return {
        id: t.id,
        loginId: String(t.loginId),
        totalQuatity: Number(t.totalQuatity || 0),
        items: items.map((i) => ({
          ticketNumber: String(i.ticketNumber),
          quantity: Number(i.quantity),
        })),
      };
    });

    const merged = {};
    const numberToTicketMap = {};

    for (const t of parsedTickets) {
      for (const it of t.items) {
        const n = it.ticketNumber;
        merged[n] = (merged[n] || 0) + it.quantity;

        if (!numberToTicketMap[n]) numberToTicketMap[n] = new Set();
        numberToTicketMap[n].add(t.id);
      }
    }

    const trash = new Set();
    const preLimit = winningPoolOriginal * 0.8;

    for (const [num, qty] of Object.entries(merged)) {
      if (qty * PRICE > preLimit) {
        trash.add(num);
        delete merged[num];
      }
    }

    let selectionTickets;

    if (hasPriority) {
      const priorityTickets = parsedTickets.filter((t) =>
        priorityLoginIds.includes(t.loginId)
      );
      const normalTickets = parsedTickets.filter(
        (t) => !priorityLoginIds.includes(t.loginId)
      );
      selectionTickets = [...priorityTickets, ...normalTickets];
      var caseUsed = 5;
    } else {
      // const randomCase = Math.floor(Math.random() * 4) + 1;
      // caseUsed = randomCase;
      const randomCase =3;
      caseUsed = 3;

      if (randomCase === 1) selectionTickets = [...parsedTickets];

      if (randomCase === 2)
        selectionTickets = [...parsedTickets].sort(
          (a, b) => b.totalQuatity - a.totalQuatity
        );

      if (randomCase === 3)
        selectionTickets = [...parsedTickets].sort(
          (a, b) => a.totalQuatity - b.totalQuatity
        );

      if (randomCase === 4) {
        const cut = Math.random() < 0.5 ? 0.3 : 0.4;
        qtyCapacity = Math.floor((winningPoolOriginal * cut) / PRICE);
        selectionTickets = [...parsedTickets];
      }
    }

    const blocked = new Set();
    const selected = [];

    const blockPrefix = (prefix) => {
      if (blocked.has(prefix)) return;
      blocked.add(prefix);
      for (let i = 0; i < 100; i++) {
        const num = prefix + String(i).padStart(2, "0");
        trash.add(num);
        delete merged[num];
      }
    };

const isCase3 = caseUsed === 3; // ensure this exists once before the outer loop

for (const tk of selectionTickets) {
  if (qtyCapacity <= 0) break;

  // Track this ticket's remaining investable points (do not change tk)
  let remainingInvestment = Number(tk.totalQuatity || 0);

  // Keep existing userMax logic (with prior suggested strictness if you added it)
  let userMax = Math.floor((tk.totalQuatity * 2) / PRICE);
  if (isCase3) {
    const strictMax = Math.floor((Number(tk.totalQuatity || 0)) / PRICE);
    userMax = Math.min(userMax, Math.max(strictMax, 0));
  }

  for (const it of tk.items) {
    if (qtyCapacity <= 0) break; // re-check inside loop

    const num = it.ticketNumber;
    const mergedQty = merged[num] || 0;
    const prefix = num.substring(0, 2);

    if (!mergedQty || trash.has(num) || blocked.has(prefix)) continue;

    // Existing pool guard
    if (mergedQty * PRICE > winningPoolOriginal) {
      trash.add(num);
      delete merged[num];
      continue;
    }

    // Existing user quantity guard
    if (it.quantity > userMax) {
      trash.add(num);
      continue;
    }

    // NEW: compute how many units we can award for this ticket based on its remaining investment
    const maxQtyByInvestment = Math.floor(remainingInvestment / PRICE); // how many qty this ticket can still receive
    // Determine allowedQty by combining all caps
    const allowedQty = Math.min(
      mergedQty,
      userMax,
      qtyCapacity,
      Math.max(maxQtyByInvestment, 0) // ensure non-negative
    );

    if (allowedQty <= 0) {
      // This ticket cannot accept any payout for this number — trash and continue
      trash.add(num);
      delete merged[num];
      continue;
    }

    // If allowedQty is less than mergedQty, we still take allowedQty and consume that much investment
    const payout = allowedQty * PRICE;

    // Final safety: if somehow payout > winningPoolOriginal, trash (keeps original behaviour)
    if (payout > winningPoolOriginal) {
      trash.add(num);
      delete merged[num];
      continue;
    }

    // push selection using allowedQty instead of mergedQty
    selected.push({
      number: num,
      quantity: allowedQty,
      payout: payout,
      fromTicket: tk.id,
      ticketIds: Array.from(numberToTicketMap[num] || []),
      ticketCount: (numberToTicketMap[num] || new Set()).size,
    });

    // reduce capacities and this ticket's remaining investment
    qtyCapacity -= allowedQty;
    remainingInvestment -= payout;

    // remove from merged set so it's not reconsidered
    delete merged[num];

    // block other numbers with same prefix
    blockPrefix(prefix);

    // Optional small optimization: if this ticket has no remainingInvestment, break to next ticket
    if (remainingInvestment <= 0) break;
  }
}


    const finalWinners = [];
    const limit = { "1": 0, "3": 0, "5": 0 };

    for (const w of selected) {
      const g = w.number[0];
      if (!["1", "3", "5"].includes(g)) continue;
      if (limit[g] >= 10) continue;
      finalWinners.push(w);
      limit[g]++;
    }

    const purchased = new Set(Object.keys(numberToTicketMap));
    const used = new Set(finalWinners.map((w) => w.number));

const lastTwoCount = {};
const blockedPairs = new Set(); // NEW: block prefix pairs like 52, 53, etc.

const fillRandom = (prefix) => {
  while (limit[prefix] < 10) {

    let attempts = 0;
    let candidate = null;

    while (attempts < 500) {

      // Generate correct 4-digit number (prefix = "1" or "3" or "5")
      const lastThree = String(Math.floor(Math.random() * 1000)).padStart(3, "0");
      const num = prefix + lastThree;       // ex: 5123
      const pair = num.substring(0, 2);     // ex: "51"
      const last2 = num.slice(-2);          // ex: "23"

      // RULE A: prefix-pair cannot be reused
      if (blockedPairs.has(pair)) { attempts++; continue; }

      // RULE B: cannot be a purchased ticket
      if (purchased.has(num)) { attempts++; continue; }

      // RULE C: cannot already be used as a winning number
      if (used.has(num)) { attempts++; continue; }

      // RULE D: last-two digits must not repeat more than 3 times
      if ((lastTwoCount[last2] || 0) >= 3) { attempts++; continue; }

      // Accept the number
      candidate = num;
      blockedPairs.add(pair);
      lastTwoCount[last2] = (lastTwoCount[last2] || 0) + 1;
      break;
    }

    if (!candidate) continue; // try next

    finalWinners.push({
      number: candidate,
      quantity: 0,
      payout: 0,
      fromTicket: null,
      ticketIds: [],
      ticketCount: 0,
    });

    used.add(candidate);
    limit[prefix]++;
  }
};



    fillRandom("1");
    fillRandom("3");
    fillRandom("5");

    // SAVE TO DB
    await winningNumbers.create({
      loginId: 0,
      winningNumbers: finalWinners.map((x) => ({
        number: x.number,
        quantity: x.quantity,
        payout: x.payout,
      })),
      totalPoints,
      DrawTime: normalizedTime,
      drawDate,
    });

    const finalResponse = {
      message: "Winners selected successfully",
      caseUsed,
      winners: finalWinners,
    };

    if (isAuto) return { success: true, ...finalResponse };
    return res.status(200).json(finalResponse);

  } catch (err) {
    console.log(err);

    if (isAuto) return { success: false, message: "Server error", error: err };

    return res.status(500).json({ message: "Server error" });
  }
};

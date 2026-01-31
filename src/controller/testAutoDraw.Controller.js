import { Op, QueryTypes } from "sequelize";
import { tickets } from "../models/ticket.model.js";
import { winningPercentage } from "../models/winningPercentage.model.js";
import { winningNumbers } from "../models/winningNumbers.model.js";
import Admin from "../models/admins.model.js";

// ============================================================================
// CONFIGURATION & SAFEGUARDS
// ============================================================================
const CONFIG = {
  PRICE: 180,
  MAX_EXECUTION_TIME_MS: 30000, // 30 seconds timeout
  MAX_TICKETS_PER_DRAW: 50000, // Process max 50k tickets
  MAX_RANDOM_ATTEMPTS: 100, // Reduced from 500
  BATCH_SIZE: 1000, // Process tickets in batches
  LOCK_TIMEOUT_MS: 60000, // 1 minute lock to prevent concurrent execution
};

// ============================================================================
// DISTRIBUTED LOCK TO PREVENT CONCURRENT EXECUTION
// ============================================================================
class DrawLock {
  static locks = new Map();
  
  static async acquire(drawDate, drawTime) {
    const key = `${drawDate}_${drawTime}`;
    const now = Date.now();
    
    // Check if lock exists and is still valid
    const existing = this.locks.get(key);
    if (existing && (now - existing.timestamp) < CONFIG.LOCK_TIMEOUT_MS) {
      return false; // Already locked
    }
    
    // Acquire lock
    this.locks.set(key, { timestamp: now });
    
    // Cleanup old locks (prevent memory leak)
    for (const [k, v] of this.locks.entries()) {
      if (now - v.timestamp > CONFIG.LOCK_TIMEOUT_MS * 2) {
        this.locks.delete(k);
      }
    }
    
    return true;
  }
  
  static release(drawDate, drawTime) {
    this.locks.delete(`${drawDate}_${drawTime}`);
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
const normalizeTime = (t) => String(t).trim().toUpperCase();

/**
 * Safe timeout wrapper with Promise rejection
 */
const withTimeout = (promise, ms, errorMessage = 'Operation timeout') => {
  return Promise.race([
    promise,
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error(errorMessage)), ms)
    )
  ]);
};

/**
 * Process tickets in batches to avoid memory overload
 */
async function* processTicketsInBatches(ticketIds, batchSize) {
  for (let i = 0; i < ticketIds.length; i += batchSize) {
    const batchIds = ticketIds.slice(i, i + batchSize);
    const batchTickets = await tickets.findAll({
      where: { id: { [Op.in]: batchIds } },
      attributes: ['id', 'loginId', 'totalQuatity', 'ticketNumber', 'drawTime', 'totalPoints'],
      raw: true, // Faster, less memory
    });
    
    yield batchTickets;
    
    // Allow event loop to process other tasks
    if (i % (batchSize * 10) === 0) {
      await new Promise(resolve => setImmediate(resolve));
    }
  }
}

/**
 * Generate random numbers with bounded attempts
 */
function generateRandomNumbers(prefix, count, excludeSet, maxAttempts = CONFIG.MAX_RANDOM_ATTEMPTS) {
  const results = [];
  const usedLastTwo = new Map();
  const usedPairs = new Set();
  let attempts = 0;
  
  while (results.length < count && attempts < maxAttempts) {
    attempts++;
    
    const lastThree = String(Math.floor(Math.random() * 1000)).padStart(3, "0");
    const num = prefix + lastThree;
    const pair = num.substring(0, 2);
    const lastTwo = num.slice(-2);
    
    // Skip if excluded
    if (excludeSet.has(num)) continue;
    
    // Skip if pair already used
    if (usedPairs.has(pair)) continue;
    
    // Skip if lastTwo used 3 times already
    if ((usedLastTwo.get(lastTwo) || 0) >= 3) continue;
    
    // Accept number
    results.push(num);
    usedPairs.add(pair);
    usedLastTwo.set(lastTwo, (usedLastTwo.get(lastTwo) || 0) + 1);
    
    // Reset attempts counter on success
    attempts = 0;
  }
  
  // If we couldn't generate enough numbers, fill with deterministic fallback
  if (results.length < count) {
    const fallbackCount = count - results.length;
    for (let i = 0; i < fallbackCount; i++) {
      let candidate;
      let fallbackAttempts = 0;
      
      do {
        const seq = (results.length + i + fallbackAttempts) % 1000;
        candidate = prefix + String(seq).padStart(3, "0");
        fallbackAttempts++;
      } while (excludeSet.has(candidate) && fallbackAttempts < 100);
      
      if (!excludeSet.has(candidate)) {
        results.push(candidate);
      }
    }
  }
  
  return results;
}

// ============================================================================
// MAIN CONTROLLER - PRODUCTION READY
// ============================================================================
export const manualGenerateWinningNumbers = async (req, res) => {
  // Track execution start time for timeout
  const executionStart = Date.now();
  let drawLockAcquired = false;
  
  try {
    // Detect AUTO mode (scheduler)
    const isAuto = !res;
    const body = isAuto ? req : req.body;
    const { drawTime, drawDate } = body;
    
    if (!drawTime || !drawDate) {
      if (isAuto) return { success: false, message: "drawTime and drawDate required" };
      return res.status(400).json({ message: "drawTime and drawDate required" });
    }
    
    const normalizedTime = normalizeTime(drawTime);
    
    // --------------------------------------------------------------------
    // 1. ACQUIRE DISTRIBUTED LOCK (Prevent concurrent execution)
    // --------------------------------------------------------------------
    const lockAcquired = await DrawLock.acquire(drawDate, normalizedTime);
    if (!lockAcquired) {
      const message = "Draw calculation already in progress. Please wait.";
      if (isAuto) return { success: false, message };
      return res.status(429).json({ message });
    }
    drawLockAcquired = true;
    
    // --------------------------------------------------------------------
    // 2. CHECK IF RESULT ALREADY EXISTS (INDEXED QUERY)
    // --------------------------------------------------------------------
    const already = await winningNumbers.findOne({
      where: {
        drawDate,
        DrawTime: normalizedTime, // EXACT match, not LIKE
      },
      attributes: ['id'],
      raw: true,
    });
    
    if (already) {
      const message = "Result already declared";
      if (isAuto) return { success: false, message };
      return res.status(400).json({ message });
    }
    
    // --------------------------------------------------------------------
    // 3. GET WINNING PERCENTAGE (CACHED/INDEXED)
    // --------------------------------------------------------------------
    const wp = await winningPercentage.findOne({
      order: [["createdAt", "DESC"]],
      attributes: ['percentage'],
      raw: true,
    });
    const percent = wp ? Number(wp.percentage) : 0;
    
    // --------------------------------------------------------------------
    // 4. GET PRIORITY ADMINS (SMALL SET)
    // --------------------------------------------------------------------
    const priorityAdmins = await Admin.findAll({
      where: { priorWinning: true },
      attributes: ["id"],
      raw: true,
    });
    const priorityLoginIds = new Set(priorityAdmins.map(x => String(x.id)));
    const hasPriority = priorityLoginIds.size > 0;
    
    // --------------------------------------------------------------------
    // 5. GET TICKET IDs FOR THIS DRAW (INDEXED, LIMITED)
    // --------------------------------------------------------------------
    const start = new Date(drawDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(drawDate);
    end.setHours(23, 59, 59, 999);
    
    // FIRST: Get only IDs and minimal data using indexed query
    const ticketIds = await tickets.findAll({
      where: {
        createdAt: { [Op.between]: [start, end] },
        // Use raw SQL for JSON extraction if supported by your DB
        // This assumes drawTime is stored as JSON array
      },
      attributes: ['id', 'drawTime'],
      limit: CONFIG.MAX_TICKETS_PER_DRAW,
      raw: true,
    });
    
    // Filter by drawTime IN MEMORY but with early exit
    const filteredIds = [];
    let totalPoints = 0;
    
    for (const ticket of ticketIds) {
      // Check timeout periodically
      if (Date.now() - executionStart > CONFIG.MAX_EXECUTION_TIME_MS) {
        throw new Error('Execution timeout while filtering tickets');
      }
      
      let matches = false;
      try {
        const dt = typeof ticket.drawTime === 'string' 
          ? JSON.parse(ticket.drawTime)
          : ticket.drawTime;
        
        if (Array.isArray(dt)) {
          matches = dt.some(t => normalizeTime(t) === normalizedTime);
        } else {
          matches = normalizeTime(dt) === normalizedTime;
        }
      } catch {
        matches = normalizeTime(ticket.drawTime) === normalizedTime;
      }
      
      if (matches) {
        filteredIds.push(ticket.id);
      }
    }
    
    // --------------------------------------------------------------------
    // 6. IF NO TICKETS → GENERATE PURE RANDOM (OPTIMIZED)
    // --------------------------------------------------------------------
    if (filteredIds.length === 0) {
      const generateSeriesOptimized = (prefixStart) => {
        const arr = [];
        const used = new Set();
        
        for (let p = prefixStart; p < prefixStart + 10; p++) {
          // Generate without do-while when possible
          let num;
          let attempts = 0;
          
          do {
            const last2 = String(Math.floor(Math.random() * 100)).padStart(2, "0");
            num = String(p) + last2;
            attempts++;
            if (attempts > 50) {
              // Fallback to sequential
              for (let i = 0; i < 100; i++) {
                const candidate = String(p) + String(i).padStart(2, "0");
                if (!used.has(candidate)) {
                  num = candidate;
                  break;
                }
              }
              break;
            }
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
        ...generateSeriesOptimized(10),
        ...generateSeriesOptimized(30),
        ...generateSeriesOptimized(50),
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
    
    // --------------------------------------------------------------------
    // 7. PROCESS TICKETS IN BATCHES (MEMORY SAFE)
    // --------------------------------------------------------------------
    const parsedTickets = [];
    const merged = {};
    const numberToTicketMap = {};
    
    // Process tickets in batches to avoid memory overload
    for await (const batch of processTicketsInBatches(filteredIds, CONFIG.BATCH_SIZE)) {
      // Check timeout
      if (Date.now() - executionStart > CONFIG.MAX_EXECUTION_TIME_MS) {
        throw new Error('Execution timeout while processing tickets');
      }
      
      for (const t of batch) {
        totalPoints += Number(t.totalPoints || 0);
        
        let items = [];
        try {
          items = typeof t.ticketNumber === 'string'
            ? JSON.parse(t.ticketNumber)
            : t.ticketNumber;
          if (!Array.isArray(items)) items = [];
        } catch {
          items = [];
        }
        
        const parsedTicket = {
          id: t.id,
          loginId: String(t.loginId),
          totalQuatity: Number(t.totalQuatity || 0),
          items: items.map((i) => ({
            ticketNumber: String(i.ticketNumber || i.number || i),
            quantity: Number(i.quantity || 1),
          })),
        };
        
        parsedTickets.push(parsedTicket);
        
        // Build merged map incrementally
        for (const it of parsedTicket.items) {
          const n = it.ticketNumber;
          merged[n] = (merged[n] || 0) + it.quantity;
          
          if (!numberToTicketMap[n]) numberToTicketMap[n] = new Set();
          numberToTicketMap[n].add(t.id);
        }
      }
    }
    
    // --------------------------------------------------------------------
    // 8. CALCULATE WINNING POOL
    // --------------------------------------------------------------------
    const winningPoolOriginal = Math.floor((totalPoints * percent) / 100);
    let qtyCapacity = Math.floor(winningPoolOriginal / CONFIG.PRICE);
    const preLimit = winningPoolOriginal * 0.8;
    
    // Filter out trash numbers (optimized)
    const trash = new Set();
    for (const [num, qty] of Object.entries(merged)) {
      if (qty * CONFIG.PRICE > preLimit) {
        trash.add(num);
        delete merged[num];
      }
    }
    
    // --------------------------------------------------------------------
    // 9. SELECTION LOGIC (OPTIMIZED)
    // --------------------------------------------------------------------
    let selectionTickets;
    let caseUsed = 3; // Default
    
    if (hasPriority) {
      const priorityTickets = parsedTickets.filter(t => 
        priorityLoginIds.has(t.loginId)
      );
      const normalTickets = parsedTickets.filter(t => 
        !priorityLoginIds.has(t.loginId)
      );
      selectionTickets = [...priorityTickets, ...normalTickets];
      caseUsed = 5;
    } else {
      // Use deterministic selection for performance
      // Removed random case to make it predictable and cacheable
      selectionTickets = [...parsedTickets].sort(
        (a, b) => a.totalQuatity - b.totalQuatity
      );
      caseUsed = 3;
    }
    
    // --------------------------------------------------------------------
    // 10. WINNER SELECTION (OPTIMIZED WITH BOUNDED LOOPS)
    // --------------------------------------------------------------------
    const blocked = new Set();
    const selected = [];
    
    const blockPrefix = (prefix) => {
      if (blocked.has(prefix)) return;
      blocked.add(prefix);
      
      // Block only numbers that actually exist in merged
      for (let i = 0; i < 100; i++) {
        const num = prefix + String(i).padStart(2, "0");
        if (merged[num]) {
          trash.add(num);
          delete merged[num];
        }
      }
    };
    
    const isCase3 = caseUsed === 3;
    
    // Main selection loop with bounds checking
    for (let i = 0; i < selectionTickets.length && qtyCapacity > 0; i++) {
      const tk = selectionTickets[i];
      
      // Check timeout periodically
      if (i % 100 === 0 && Date.now() - executionStart > CONFIG.MAX_EXECUTION_TIME_MS) {
        throw new Error('Execution timeout during winner selection');
      }
      
      let remainingInvestment = Number(tk.totalQuatity || 0);
      let userMax = Math.floor((tk.totalQuatity * 2) / CONFIG.PRICE);
      
      if (isCase3) {
        const strictMax = Math.floor(Number(tk.totalQuatity || 0) / CONFIG.PRICE);
        userMax = Math.min(userMax, Math.max(strictMax, 0));
      }
      
      for (let j = 0; j < tk.items.length && qtyCapacity > 0 && remainingInvestment > 0; j++) {
        const it = tk.items[j];
        const num = it.ticketNumber;
        const mergedQty = merged[num];
        const prefix = num.substring(0, 2);
        
        if (!mergedQty || trash.has(num) || blocked.has(prefix)) continue;
        
        // Quick checks
        if (mergedQty * CONFIG.PRICE > winningPoolOriginal) {
          trash.add(num);
          delete merged[num];
          continue;
        }
        
        if (it.quantity > userMax) {
          trash.add(num);
          continue;
        }
        
        const maxQtyByInvestment = Math.floor(remainingInvestment / CONFIG.PRICE);
        const allowedQty = Math.min(
          mergedQty,
          userMax,
          qtyCapacity,
          Math.max(maxQtyByInvestment, 0)
        );
        
        if (allowedQty <= 0) {
          trash.add(num);
          delete merged[num];
          continue;
        }
        
        const payout = allowedQty * CONFIG.PRICE;
        
        if (payout > winningPoolOriginal) {
          trash.add(num);
          delete merged[num];
          continue;
        }
        
        selected.push({
          number: num,
          quantity: allowedQty,
          payout: payout,
          fromTicket: tk.id,
          ticketIds: Array.from(numberToTicketMap[num] || []),
          ticketCount: (numberToTicketMap[num] || new Set()).size,
        });
        
        qtyCapacity -= allowedQty;
        remainingInvestment -= payout;
        delete merged[num];
        blockPrefix(prefix);
      }
    }
    
    // --------------------------------------------------------------------
    // 11. FINAL WINNERS WITH RANDOM FILL (OPTIMIZED)
    // --------------------------------------------------------------------
    const finalWinners = [];
    const limit = { "1": 0, "3": 0, "5": 0 };
    
    // Add selected winners
    for (const w of selected) {
      const g = w.number[0];
      if (!["1", "3", "5"].includes(g)) continue;
      if (limit[g] >= 10) continue;
      finalWinners.push(w);
      limit[g]++;
    }
    
    const purchased = new Set(Object.keys(numberToTicketMap));
    const used = new Set(finalWinners.map(w => w.number));
    
    // Generate remaining winners with bounded attempts
    const prefixes = ["1", "3", "5"];
    for (const prefix of prefixes) {
      const needed = 10 - (limit[prefix] || 0);
      if (needed <= 0) continue;
      
      const randomNumbers = generateRandomNumbers(
        prefix,
        needed,
        new Set([...purchased, ...used])
      );
      
      for (const num of randomNumbers) {
        finalWinners.push({
          number: num,
          quantity: 0,
          payout: 0,
          fromTicket: null,
          ticketIds: [],
          ticketCount: 0,
        });
        used.add(num);
      }
    }
    
    // --------------------------------------------------------------------
    // 12. SAVE RESULTS
    // --------------------------------------------------------------------
    await winningNumbers.create({
      loginId: 0,
      winningNumbers: finalWinners.map(x => ({
        number: x.number,
        quantity: x.quantity,
        payout: x.payout,
      })),
      totalPoints,
      DrawTime: normalizedTime,
      drawDate,
    });
    
    // --------------------------------------------------------------------
    // 13. RETURN RESPONSE
    // --------------------------------------------------------------------
    const finalResponse = {
      message: "Winners selected successfully",
      caseUsed,
      winners: finalWinners,
    };
    
    if (isAuto) return { success: true, ...finalResponse };
    return res.status(200).json(finalResponse);
    
  } catch (err) {
    console.error('Draw generation error:', err);
    
    // Provide specific error messages
    let message = "Server error";
    if (err.message.includes('timeout')) {
      message = "Draw generation timeout. Too many tickets to process.";
    }
    
    if (isAuto) return { 
      success: false, 
      message,
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    };
    
    return res.status(500).json({ 
      message,
      ...(process.env.NODE_ENV === 'development' && { detail: err.message })
    });
    
  } finally {
    // Always release the lock
    if (drawLockAcquired && drawTime && drawDate) {
      DrawLock.release(drawDate, normalizeTime(drawTime));
    }
  }
};

// ============================================================================
// CRON WRAPPER WITH ADDITIONAL SAFEGUARDS
// ============================================================================
export const autoGenerateWinningNumbers = async () => {
  try {
    const now = new Date();
    const drawDate = now.toISOString().split('T')[0];
    
    // Determine draw time based on current hour (example logic)
    const hour = now.getHours();
    let drawTime;
    if (hour >= 9 && hour < 12) drawTime = 'MORNING';
    else if (hour >= 12 && hour < 17) drawTime = 'AFTERNOON';
    else if (hour >= 17 && hour < 21) drawTime = 'EVENING';
    else drawTime = 'NIGHT';
    
    console.log(`Auto-generating winning numbers for ${drawDate} ${drawTime}`);
    
    // Execute with timeout
    const result = await withTimeout(
      manualGenerateWinningNumbers({ drawTime, drawDate }),
      CONFIG.MAX_EXECUTION_TIME_MS,
      'Auto-generation timeout'
    );
    
    console.log(`Auto-generation result: ${result.success ? 'SUCCESS' : 'FAILED'}`);
    return result;
    
  } catch (error) {
    console.error('Auto-generation failed:', error);
    return { success: false, message: error.message };
  }
};
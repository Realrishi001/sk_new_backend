import moment from "moment-timezone";
import { manualGenerateWinningNumbers } from "./testAutoDraw.Controller.js";
import { winningNumbers } from "../models/winningNumbers.model.js";

export const autoGenerateWinningNumbers = async (drawTime) => {
  const START_TIME = Date.now();
  const MAX_EXECUTION_MS = 20 * 1000; // 20 seconds hard limit

  try {
    if (!drawTime) {
      return { success: false, reason: "drawTime missing" };
    }

    // ✅ Normalize drawTime
    const normalizedDrawTime = String(drawTime).trim().toUpperCase();

    // ✅ IST-safe date
    const drawDate = moment()
      .tz("Asia/Kolkata")
      .format("YYYY-MM-DD");

    /* ---------------------------------------------------
       STEP 1: FAST, INDEXED DUPLICATE CHECK
    --------------------------------------------------- */
    const exists = await winningNumbers.findOne({
      where: {
        drawDate,
        drawTime: normalizedDrawTime, // ❌ NO LIKE
      },
      attributes: ["id"],
    });

    if (exists) {
      return { success: false, reason: "Already generated" };
    }

    if (Date.now() - START_TIME > MAX_EXECUTION_MS) {
      throw new Error("Auto draw execution timeout");
    }

    const result = await manualGenerateWinningNumbers({
      drawTime: normalizedDrawTime,
      drawDate,
    });

    return { success: true, result };
  } catch (err) {
    console.error("AUTO DRAW FAILED:", err.message);
    return { success: false, error: err.message };
  }
};

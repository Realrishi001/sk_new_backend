import { manualGenerateWinningNumbers } from "./testAutoDraw.Controller.js";
import { winningNumbers } from "../models/winningNumbers.model.js";
import { Op } from "sequelize";

export const autoGenerateWinningNumbers = async (drawTime) => {
  try {
    if (!drawTime) {
      console.log("⛔ Auto: drawTime missing");
      return false;
    }

    const normalizedDrawTime = String(drawTime).trim().toUpperCase();
    const drawDate = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

    console.log("⏳ AUTO DRAW Triggered:", normalizedDrawTime, "on", drawDate);

    // Use Op.like to match JSON/array stored DrawTime (e.g. '["09:45 PM"]')
    const exists = await winningNumbers.findOne({
      where: {
        drawDate,
        DrawTime: { [Op.like]: `%${normalizedDrawTime}%` },
      },
    });

    if (exists) {
      console.log("⚠ AUTO: Result already declared for", normalizedDrawTime);
      return false;
    }

    // Call the manual generator directly (see Step 2)
    const result = await manualGenerateWinningNumbers({
      drawTime: normalizedDrawTime,
      drawDate,
    });

    console.log(`🎉 AUTO SUCCESS for DrawTime ${normalizedDrawTime}`);
    return result;
  } catch (err) {
    console.error("❌ AUTO CONTROLLER ERROR:", err);
    return false;
  }
};

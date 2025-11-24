import { manualGenerateWinningNumbers } from "./testAutoDraw.Controller.js";
import { winningNumbers } from "../models/winningNumbers.model.js";

export const autoGenerateWinningNumbers = async (drawTime) => {
  try {
    if (!drawTime) {
      console.log("⛔ Auto: drawTime missing");
      return false;
    }

    const normalizedDrawTime = String(drawTime).trim().toUpperCase();
    const drawDate = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

    console.log("⏳ AUTO DRAW Triggered:", normalizedDrawTime, "on", drawDate);


    const exists = await winningNumbers.findOne({
      where: { DrawTime: normalizedDrawTime, drawDate },
    });

    if (exists) {
      console.log("⚠ AUTO: Result already declared for", normalizedDrawTime);
      return false;
    }

    const fakeReq = {
      body: {
        drawTime: normalizedDrawTime,
        drawDate,
      },
    };

    const manualResponse = {};

    const fakeRes = {
      status: (code) => ({
        json: (data) => {
          manualResponse.code = code;
          manualResponse.data = data;
          return manualResponse;
        },
      }),
    };


    const result = await manualGenerateWinningNumbers(fakeReq, fakeRes);

    console.log(`🎉 AUTO SUCCESS for DrawTime ${normalizedDrawTime}`);
    return result;

  } catch (err) {
    console.error("❌ AUTO CONTROLLER ERROR:", err);
    return false;
  }
};

import cron from "node-cron";
import moment from "moment-timezone";
import { autoGenerateWinningNumbers } from "../controller/autoDraw.controller.js";

// Runs every minute
cron.schedule("* * * * *", async () => {
  try {
    const now = moment().tz("Asia/Kolkata");
    const hour = now.hour();
    const minute = now.minute();

    if (hour < 9 || hour > 23) return;
    if (![0, 15, 30, 45].includes(minute)) return;

    const drawTime = now.format("hh:mm A");

    console.log(`⏳ Auto draw triggered for ${drawTime}`);

    // 🚨 Only ONE result, no admin IDs
    await autoGenerateWinningNumbers(drawTime);

    console.log(`✅ Global Draw saved for: ${drawTime}`);

  } catch (err) {
    console.error("❌ Auto Draw Scheduler Error:", err);
  }
});

console.log("🎯 Auto Draw Scheduler Started...");

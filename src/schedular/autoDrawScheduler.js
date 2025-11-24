import cron from "node-cron";
import moment from "moment-timezone";
import { autoGenerateWinningNumbers } from "../controller/autoDraw.controller.js";

const instance = process.env.NODE_APP_INSTANCE;
const shouldRunScheduler = !instance || instance === "0";

function startScheduler() {
  cron.schedule("* * * * *", async () => {
    try {
      const now = moment().tz("Asia/Kolkata");
      const hour = now.hour();
      const minute = now.minute();

      // Draw window: 9 AM – 11 PM only
      if (hour < 9 || hour > 23) return;

      // Allowed minutes
      if (![0, 15, 30, 45].includes(minute)) return;

      const drawTime = now.format("hh:mm A");

      console.log(`🕒 Auto Draw Triggered for: ${drawTime}`);

      const result = await autoGenerateWinningNumbers(drawTime);

      if (result?.success) {
        console.log(`✅ Auto Draw Saved for: ${drawTime}`);
      } else {
        console.log(`⚠ No auto draw generated for: ${drawTime}`);
      }

    } catch (err) {
      console.error("❌ Auto Draw Scheduler Error:", err);
    }
  });

  console.log("🎯 Auto Draw Scheduler Started (Instance 0)");
}

if (shouldRunScheduler) {
  startScheduler();
} else {
  console.log("⛔ Scheduler disabled for PM2 instance:", instance);
}

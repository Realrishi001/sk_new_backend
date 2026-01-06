import cron from "node-cron";
import moment from "moment-timezone";
import { autoGenerateWinningNumbers } from "../controller/autoDraw.controller.js";

const instance = process.env.NODE_APP_INSTANCE;
const shouldRunScheduler = !instance || instance === "0";

let isRunning = false;          // 🔒 Prevent overlap
let cronTask = null;

function startScheduler() {
  cronTask = cron.schedule(
    "*/15 9-22 * * *", // ⏰ 9:00 AM – 10:00 PM IST
    async () => {
      if (isRunning) {
        console.warn("⏭ Auto Draw skipped (previous job still running)");
        return;
      }

      isRunning = true;
      const timeout = setTimeout(() => {
        console.error("⏱ Auto Draw timeout — force releasing lock");
        isRunning = false;
      }, 2 * 60 * 1000); // 2 minutes hard limit

      try {
        const now = moment().tz("Asia/Kolkata");
        const drawTime = now.format("hh:mm A");

        console.log(`🕒 Auto Draw Triggered: ${drawTime}`);

        const result = await autoGenerateWinningNumbers(drawTime);

        if (result?.success) {
          console.log(`✅ Auto Draw Saved: ${drawTime}`);
        } else {
          console.log(`⚠ No Auto Draw Generated: ${drawTime}`);
        }
      } catch (err) {
        console.error("❌ Auto Draw Error:", err);
      } finally {
        clearTimeout(timeout);
        isRunning = false;
      }
    },
    {
      timezone: "Asia/Kolkata",
      scheduled: true,
    }
  );

  console.log("🎯 Auto Draw Scheduler Started (Production Safe)");
}

/* 🛑 Graceful Shutdown (PM2, Docker, Server Stop) */
function stopScheduler() {
  if (cronTask) {
    cronTask.stop();
    cronTask.destroy();
    cronTask = null;
    console.log("🛑 Auto Draw Scheduler Stopped");
  }
}

if (shouldRunScheduler) {
  startScheduler();
} else {
  console.log("⛔ Scheduler disabled for PM2 instance:", instance);
}

/* PM2 / Docker shutdown signals */
process.on("SIGINT", stopScheduler);
process.on("SIGTERM", stopScheduler);

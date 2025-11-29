import { winning } from "../models/threedWinning.model.js";

export const saveWinningNumber = async (req, res) => {
  try {
    const {
      winningDate,
      winningTime,
      winningNumbers,
      totalAmount,
      totalPoints,
    } = req.body;

    // VALIDATION
    if (!winningDate)
      return res.status(400).json({ status: "error", message: "winningDate is required" });

    if (!winningTime)
      return res.status(400).json({ status: "error", message: "winningTime is required" });

    if (!winningNumbers || !Array.isArray(winningNumbers))
      return res.status(400).json({
        status: "error",
        message: "winningNumbers must be an array",
      });

    if (winningNumbers.length === 0)
      return res.status(400).json({
        status: "error",
        message: "winningNumbers cannot be empty",
      });

    if (!totalAmount)
      return res.status(400).json({ status: "error", message: "totalAmount is required" });

    if (!totalPoints)
      return res.status(400).json({ status: "error", message: "totalPoints is required" });

    // SAVE DATA
    const saved = await winning.create({
      winningDate,
      winningTime,
      winningNumbers,
      totalAmount,
      totalPoints,
    });

    return res.status(201).json({
      status: "success",
      message: "Winning numbers saved successfully!",
      data: saved
    });

  } catch (error) {
    console.error("❌ Error saving winning number:", error);
    return res.status(500).json({
      status: "error",
      message: "Internal server error while saving winning number.",
    });
  }
};


const getISTDate = () => {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().split("T")[0]; 
};


// GET today's winning numbers only
export const getTodayWinningNumbers = async (req, res) => {
  try {
    // Get today's date in IST
    const now = new Date();
    const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
    const todayDate = ist.toISOString().split("T")[0]; // YYYY-MM-DD format

    // Find the latest winning entry for today
    const record = await winning.findOne({
      where: { winningDate: todayDate },
      order: [["id", "DESC"]],
    });

    if (!record) {
      return res.status(200).json({
        status: "success",
        winningNumbers: [],
      });
    }

    let nums = record.winningNumbers;

    // ⭐ FIX SAFELY — ensure it's ALWAYS an array
    if (!Array.isArray(nums)) {
      // If string => try to parse
      if (typeof nums === "string") {
        try {
          nums = JSON.parse(nums);
        } catch {
          nums = [];
        }
      }
      // If object => wrap into array
      else if (typeof nums === "object" && nums !== null) {
        nums = [nums];
      }
      // Otherwise default
      else {
        nums = [];
      }
    }

    // ONLY RETURN the number field
    const onlyNumbers = nums.map((item) => item.number);

    return res.status(200).json({
      status: "success",
      winningNumbers: onlyNumbers, 
    });

  } catch (error) {
    console.error("Error fetching winning numbers:", error);
    return res.status(500).json({
      status: "error",
      message: "Failed to fetch today's winning numbers",
    });
  }
};

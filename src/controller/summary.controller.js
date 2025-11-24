import Admin from "../models/admins.model.js";
import { tickets } from "../models/ticket.model.js";
import { winningPercentage } from "../models/winningPercentage.model.js";
import { Op } from "sequelize";

export const getAdminPointsSummary = async (req, res) => {
  try {
    const { fromDate, toDate, loginId } = req.body;

    // 1. Get admin info
    const admin = await Admin.findOne({
      where: { id: loginId },
      attributes: ["shopName", "userName", "commission", "balance"]
    });
    if (!admin) {
      return res.status(404).json({ message: "Admin not found" });
    }

    // 2. Get tickets for this admin within date range
    const ticketsList = await tickets.findAll({
      where: {
        loginId,
        gameTime: {
          [Op.between]: [fromDate, toDate]
        }
      }
    });

    // 3. Calculate totalPoints (sum of all ticket.totalPoints)
    let totalPoints = 0;
    ticketsList.forEach(ticket => {
      // if totalPoints is stored as string, convert to number
      totalPoints += Number(ticket.totalPoints || 0);
    });

    // 4. Get latest winning percentage
    const winPercRow = await winningPercentage.findOne({
      order: [['createdAt', 'DESC']]
    });
    const winPerc = winPercRow ? Number(winPercRow.percentage) : 0;

    // 5. Calculate commission and net points
    const commissionPerc = Number(admin.commission);
    const netPoints = totalPoints - (totalPoints * commissionPerc / 100); // commission removed
    const updatedTotalPoint = netPoints; // after commission
    const winningPoints = updatedTotalPoint * (winPerc / 100);

    return res.json({
      shopName: admin.shopName,
      userName: admin.userName,
      commission: admin.commission,
      balance: admin.balance,
      totalPoints,
      netPoints: netPoints.toFixed(2),
      updatedTotalPoint: updatedTotalPoint.toFixed(2),
      winningPoints: winningPoints.toFixed(2),
      winningPercentage: winPerc
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

import Admin from "../models/admins.model.js";

export const togglePriorityAdmin = async (req, res) => {
  try {
    const { adminId } = req.params; // matches UI

    const admin = await Admin.findByPk(adminId);

    if (!admin) {
      return res.status(404).json({ message: "Admin not found" });
    }

    // Toggle the value
    const newValue = !admin.priorWinning;

    await admin.update({ priorWinning: newValue });

    return res.status(200).json({
      success: true,
      message: `priorWinning toggled for admin ${adminId}`,
      adminId,
      priorWinning: newValue,
    });

  } catch (err) {
    console.error("❌ Error toggling priority:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

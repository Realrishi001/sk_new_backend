import Admin from "../models/admins.model.js";

export const deleteCommission = async (req, res) => {
  try {
    const { shopName } = req.body;

    if (!shopName) {
      return res.status(400).json({
        success: false,
        message: "shopName is required",
      });
    }

    const admin = await Admin.findOne({ where: { shopName } });

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Shop not found",
      });
    }

    admin.commission = 0;
    await admin.save();

    return res.status(200).json({
      success: true,
      message: "Commission deleted successfully",
      shopName,
      commission: admin.commission,
    });
  } catch (error) {
    console.error("Delete Commission Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};


export const deleteBalance = async (req, res) => {
  try {
    const { shopName } = req.body;

    if (!shopName) {
      return res.status(400).json({
        success: false,
        message: "shopName is required",
      });
    }

    const admin = await Admin.findOne({ where: { shopName } });

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Shop not found",
      });
    }

    admin.balance = 0;
    await admin.save();

    return res.status(200).json({
      success: true,
      message: "Balance deleted successfully",
      shopName,
      balance: admin.balance,
    });
  } catch (error) {
    console.error("Delete Balance Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

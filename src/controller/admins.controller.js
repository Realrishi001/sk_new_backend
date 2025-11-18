import Admin from "../models/admins.model.js";
import { tickets } from "../models/ticket.model.js";
import { winningPercentage } from "../models/winningPercentage.model.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from 'dotenv';
dotenv.config();
import { sequelizeCon } from "../init/dbConnection.js";

const JWT_SECRET = process.env.JWT_SECRET;


export const changeAdminPassword = async (req, res) => {
  try {
    const { userName, oldPassword, newPassword } = req.body;

    // 1️⃣ Check required fields
    if (!userName || !oldPassword || !newPassword) {
      return res.status(400).json({
        status: "error",
        message: "Please provide userName, oldPassword, and newPassword.",
      });
    }

    // 2️⃣ Find admin by username
    const admin = await Admin.findOne({ where: { userName } });

    if (!admin) {
      return res.status(404).json({
        status: "error",
        message: "Admin not found.",
      });
    }

    // 3️⃣ Compare old password
    const isMatch = await bcrypt.compare(oldPassword, admin.password);
    if (!isMatch) {
      return res.status(401).json({
        status: "error",
        message: "Incorrect old password.",
      });
    }

    // 4️⃣ Hash and update new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    await admin.update({ password: hashedPassword });

    // 5️⃣ Respond success
    return res.status(200).json({
      status: "success",
      message: "Password updated successfully.",
    });
  } catch (error) {
    console.error("🔥 Error changing password:", error);
    return res.status(500).json({
      status: "error",
      message: "Internal server error.",
    });
  }
};


// Create Admin Controller
export const createAdmin = async (req, res) => {
  try {
    const {
      shopName = "",
      gstNumber = "",
      panNumber = "",
      contactPersonName = "",
      contactPersonPhone = "",
      contactPersonEmail = "",
      openTime = "",
      closeTime = "",
      userName = "",
      address = "",
      phoneNumber = "",
      emailAddress = "",
      password = "",
      commission = 0,
      balance = 0
    } = req.body;

    // Check for existing email if provided
    if (emailAddress) {
      const existing = await Admin.findOne({ where: { emailAddress } });
      if (existing) {
        return res.status(409).json({ message: "Email already registered." });
      }
    }

    // Create admin (password will be hashed by hook if not empty)
    const admin = await Admin.create({
      shopName,
      gstNumber,
      panNumber,
      contactPersonName,
      contactPersonPhone,
      contactPersonEmail,
      openTime,
      closeTime,
      userName,
      address,
      phoneNumber,
      emailAddress,
      password,
      commission,
      balance
    });

    // Remove password from response
    const { password: _pw, ...adminData } = admin.toJSON();

    res.status(201).json({
      message: "Admin created successfully.",
      admin: adminData
    });
  } catch (error) {
    console.error("Error creating admin:", error);
    res.status(500).json({ message: "Server error.", error: error.message });
  }
};



export const getAllAdmins = async (req, res) => {
  try {
    // Select only the required fields
    const admins = await Admin.findAll({
      attributes: [
        "id",
        "shopName",
        "address",
        "phoneNumber",
        "userName",
        "password",
        "commission",
        "balance"
      ]
    });

    res.status(200).json({
      message: "Admins fetched successfully.",
      admins
    });
  } catch (error) {
    console.error("Error fetching admins:", error);
    res.status(500).json({ message: "Server error.", error: error.message });
  }
};


export const adminLogin = async (req, res) => {
  try {
    const { userName, password } = req.body;

    // Validate input
    if (!userName || !password) {
      return res.status(400).json({ message: "Username and password are required." });
    }

    // Find the admin by username
    const admin = await Admin.findOne({ where: { userName } });
    if (!admin) {
      return res.status(401).json({ message: "Invalid username or password." });
    }

    // Compare the password with the stored hash
    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid username or password." });
    }

    admin.isLoggedIn = true;
    await admin.save();  // Save the updated status to the database

    const payload = {
      id: admin.id,
      userName: admin.userName
    };

    // Generate JWT token
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "1d" });

    // Return success message with the token
    res.status(200).json({
      message: "Login successful!",
      token
    });

  } catch (error) {
    console.error("Admin login error:", error);
    res.status(500).json({ message: "Server error.", error: error.message });
  }
};


export const updateAdmin = async (req, res) => {
  try {
    const {
      id,
      shopName,
      gstNumber,
      panNumber,
      contactPersonName,
      contactPersonPhone,
      contactPersonEmail,
      openTime,
      closeTime,
      userName,
      address,
      phoneNumber,
      emailAddress,
      password, // only update if provided
      commission,
      balance
    } = req.body;

    if (!id) {
      return res.status(400).json({ message: "Admin ID is required." });
    }

    // Find admin by ID
    const admin = await Admin.findByPk(id);
    if (!admin) {
      return res.status(404).json({ message: "Admin not found." });
    }

    // Merge new values with existing (undefined/null/"") falls back to DB value
    const updateData = {
      shopName: shopName ?? admin.shopName,
      gstNumber: gstNumber ?? admin.gstNumber,
      panNumber: panNumber ?? admin.panNumber,
      contactPersonName: contactPersonName ?? admin.contactPersonName,
      contactPersonPhone: contactPersonPhone ?? admin.contactPersonPhone,
      contactPersonEmail: contactPersonEmail ?? admin.contactPersonEmail,
      openTime: openTime ?? admin.openTime,
      closeTime: closeTime ?? admin.closeTime,
      userName: userName ?? admin.userName,
      address: address ?? admin.address,
      phoneNumber: phoneNumber ?? admin.phoneNumber,
      emailAddress: emailAddress ?? admin.emailAddress,
      commission: commission !== undefined && commission !== null && commission !== "" ? commission : admin.commission,
      balance: balance !== undefined && balance !== null && balance !== "" ? balance : admin.balance
    };

    // Only hash and update password if provided & non-empty
    if (password && password.trim() !== "") {
      const salt = await bcrypt.genSalt(10);
      updateData.password = await bcrypt.hash(password, salt);
    }

    await admin.update(updateData);

    const { password: _pw, ...adminData } = admin.toJSON();
    res.status(200).json({
      message: "Admin updated successfully.",
      admin: adminData
    });
  } catch (error) {
    console.error("Error updating admin:", error);
    res.status(500).json({ message: "Server error.", error: error.message });
  }
};

export const adminLogout = async (req, res) => {
  try {
    const { adminId } = req.body;
    
    // Validate adminId
    if (!adminId) {
      return res.status(400).json({ message: "Admin ID is required for logout." });
    }

    // Find the admin by ID
    const admin = await Admin.findByPk(adminId);
    if (!admin) {
      return res.status(404).json({ message: "Admin not found." });
    }

    // Set isLoggedIn to false after logout
    admin.isLoggedIn = false;
    await admin.save();  // Save the updated status to the database

    return res.status(200).json({
      message: "Logout successful!"
    });

  } catch (error) {
    console.error("Admin logout error:", error);
    res.status(500).json({ message: "Server error.", error: error.message });
  }
};

export const getAllAdminsStatus = async (req, res) => {
  try {
    // Fetch all admins' ids, shopName, and isLoggedIn status
    const admins = await Admin.findAll({
      attributes: ["id", "shopName", "isLoggedIn"], // Only retrieve id, shopName, and isLoggedIn
    });

    // Check if admins are found
    if (!admins.length) {
      return res.status(404).json({
        status: "error",
        message: "No admins found.",
      });
    }

    // Return the list of admins with their status
    return res.status(200).json({
      status: "success",
      admins: admins.map((admin) => ({
        id: admin.id,
        shopName: admin.shopName,
        isLoggedIn: admin.isLoggedIn,
      })),
    });
  } catch (error) {
    console.error("Error in getAllAdminsStatus:", error);
    return res.status(500).json({
      status: "error",
      message: "Internal server error while fetching admins' status.",
    });
  }
};


export const updateAdminCommission = async (req, res) => {
  try {
    const { userName, commission } = req.body;

    // Input validation
    if (!userName || typeof commission !== "number" || commission < 0) {
      return res.status(400).json({ message: "Invalid userName or commission." });
    }

    // Find admin by userName
    const admin = await Admin.findOne({ where: { userName } });

    if (!admin) {
      return res.status(404).json({ message: "Admin not found." });
    }

    // Update commission
    admin.commission = commission;
    await admin.save();

    res.status(200).json({
      message: "Commission updated successfully.",
      admin,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error.", error: error.message });
  }
};

export const deleteAdmin = async (req, res) => {
  const { id } = req.body; 
  console.log(id);
  if (!id) {
    return res.status(400).json({ error: "Admin id is required." });
  }

  // Optional: Use a transaction for safety
  const t = await sequelizeCon.transaction();
  try {
    // 1. Find admin by id
    const admin = await Admin.findByPk(id, { transaction: t });
    if (!admin) {
      await t.rollback();
      return res.status(404).json({ error: "Admin not found." });
    }

    // 2. Delete from admins
    await Admin.destroy({
      where: { id },
      transaction: t,
    });

    // 3. Commit
    await t.commit();

    res.json({ message: "Admin deleted successfully." });
  } catch (error) {
    await t.rollback();
    console.error("Error deleting admin:", error);
    res.status(500).json({ error: "Something went wrong." });
  }
};


export const getAdminUsernamesAndCommissions = async (req, res) => {
  try {
    const admins = await Admin.findAll({
      attributes: ["userName", "commission"], 
    });

    res.status(200).json({ admins });
  } catch (error) {
    res.status(500).json({ message: "Server error.", error: error.message });
  }
};

export const deleteAdminByUserName = async (req, res) => {
  try {
    const { userName } = req.body;

    if (!userName) {
      return res.status(400).json({ message: "userName is required." });
    }

    // Find and delete the admin
    const deleted = await Admin.destroy({ where: { userName } });

    if (!deleted) {
      return res.status(404).json({ message: "Admin not found." });
    }

    res.status(200).json({ message: "Admin deleted successfully." });
  } catch (error) {
    res.status(500).json({ message: "Server error.", error: error.message });
  }
};


export const mainAdminLogin = async(req, res) => {
  try {
    const { adminId, password } = req.body;

    console.log(adminId, password);
    // Check required fields
    if (!adminId || !password) {
      return res.status(400).json({ message: "Admin ID and password are required." });
    }

    // Get hashes from env
    const adminIdHash = process.env.ADMIN_ID;
    const adminPasswordHash = process.env.ADMIN_PASSWORD;
    const jwtSecret = process.env.JWT_SECRET; // fallback

    // Compare admin ID
    const isIdMatch = await bcrypt.compare(adminId, adminIdHash);
    if (!isIdMatch) {
      return res.status(401).json({ message: "Invalid credentials." });
    }

    // Compare password
    const isPassMatch = await bcrypt.compare(password, adminPasswordHash);
    if (!isPassMatch) {
      return res.status(401).json({ message: "Invalid credentials." });
    }

    // Issue JWT
    const payload = {
      role: "main_admin",
      adminId: adminId,
      userName: process.env.MAIN_ADMIN_USERNAME || "main_admin"
    };
    const token = jwt.sign(payload, jwtSecret, { expiresIn: "1d" });

    res.status(200).json({
      success: true,                    
      message: "Main Admin Login Successful!",
      token
    });


  } catch (error) {
    console.error("Main admin login error:", error);
    res.status(500).json({ message: "Server error.", error: error.message });
  }
};


// update balance
export const addAdminBalance = async (req, res) => {
  try {
    const { userName, amount } = req.body;

    // Validate input
    if (!userName || typeof amount !== "number" || isNaN(amount)) {
      return res.status(400).json({ success: false, message: "Invalid userName or amount." });
    }

    // Find the admin
    const admin = await Admin.findOne({ where: { userName } });

    if (!admin) {
      return res.status(404).json({ success: false, message: "Admin not found." });
    }

    // Add the amount to the current balance
    admin.balance = admin.balance + amount;
    await admin.save();

    res.status(200).json({
      success: true,
      message: `Balance updated successfully for ${userName}.`,
      updatedBalance: admin.balance,
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Server error while updating balance.",
      error: error.message,
    });
  }
};


export const getAdminUsernamesAndBalance = async (req, res) => {
  try {
    const admins = await Admin.findAll({
      attributes: ["userName", "balance"], 
    });

    res.status(200).json({ admins });
  } catch (error) {
    res.status(500).json({ message: "Server error.", error: error.message });
  }
};

// for shop report
export const getAdminDetails = async (req, res) => {
  try {
    // Fetch latest winning percentage (optional)
    const latestWinning = await winningPercentage.findOne({
      order: [["createdAt", "DESC"]],
      attributes: ["percentage"],
    });
    const winningPercent = latestWinning ? parseFloat(latestWinning.percentage) : 0;

    // Fetch all admins
    const admins = await Admin.findAll({
      attributes: ["id", "userName", "commission", "balance"],
    });

    const adminDetails = await Promise.all(
      admins.map(async (admin) => {
        // Fetch tickets for this admin
        const ticketsData = await tickets.findAll({
          where: { loginId: admin.id },
          attributes: ["totalPoints"],
        });

        // Total tickets count
        const totalTickets = ticketsData.length;

        // Total points sum
        const totalPoints = ticketsData.reduce((sum, t) => sum + (parseFloat(t.totalPoints) || 0), 0);

        // Commission (shop amount)
        const shopAmount = (totalPoints * (admin.commission || 0)) / 100;

        // Net amount
        const netAmount = totalPoints - shopAmount;

        // Winning amount
        const winningAmount = (netAmount * winningPercent) / 100;

        return {
          id: admin.id,
          userName: admin.userName,
          commission: admin.commission,
          balance: admin.balance,
          totalTickets,
          totalPoints: Number(totalPoints.toFixed(2)),
          shopAmount: Number(shopAmount.toFixed(2)),
          netAmount: Number(netAmount.toFixed(2)),
          winningAmount: Number(winningAmount.toFixed(2)),
        };
      })
    );

    res.status(200).json({ success: true, admins: adminDetails });
  } catch (error) {
    console.error("Error fetching admin details with net/shop amounts:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch admin details with net/shop amounts.",
      error: error.message,
    });
  }
};

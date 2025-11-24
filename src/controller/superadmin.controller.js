import superAdmin from "../models/superadmin.model.js";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET; // make sure it's defined in your .env

export const superAdminLogin = async (req, res) => {
  try {
    const { userName, password } = req.body;
    if (!userName || !password) {
      return res.status(400).json({ success: false, message: "Username and password are required." });
    }

    // Find super admin by userName
    const admin = await superAdmin.findOne({ where: { userName } });
    if (!admin) {
      return res.status(401).json({ success: false, message: "Invalid username or password." });
    }

    // Compare password (hashed)
    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Invalid username or password." });
    }

    // Create JWT token
    const payload = {
      id: admin.id,
      userName: admin.userName,
      shopName: admin.shopName,
      emailAddress: admin.emailAddress
    };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "1d" });

    // Remove password from response
    const { password: _pw, ...adminData } = admin.toJSON();

    res.status(200).json({
      success: true,
      message: "Login successful!",
      superAdmin: adminData,
      token
    });
  } catch (error) {
    console.error("Super Admin login error:", error);
    res.status(500).json({ success: false, message: "Server error.", error: error.message });
  }
};

export const createSuperAdmin = async (req, res) => {
  try {
    const {
      shopName,
      userName,
      address,
      phoneNumber,
      emailAddress,
      password
    } = req.body;

    // Simple required field check
    if (
      !shopName ||
      !userName ||
      !address ||
      !phoneNumber ||
      !emailAddress ||
      !password
    ) {
      return res.status(400).json({ message: "All fields are required." });
    }

    // Check for existing username or email
    const exists = await superAdmin.findOne({
      where: { userName }
    });
    if (exists) {
      return res.status(409).json({ message: "Username already exists." });
    }

    const existsEmail = await superAdmin.findOne({
      where: { emailAddress }
    });
    if (existsEmail) {
      return res.status(409).json({ message: "Email already exists." });
    }

    // Create super admin (password hashed by model hook)
    const admin = await superAdmin.create({
      shopName,
      userName,
      address,
      phoneNumber,
      emailAddress,
      password
    });

    // Don't send password in response
    const { password: _pw, ...adminData } = admin.toJSON();

    res.status(201).json({
      message: "Super admin created successfully.",
      superAdmin: adminData
    });
  } catch (error) {
    console.error("Error creating super admin:", error);
    res.status(500).json({ message: "Server error.", error: error.message });
  }
};

export const getAllSuperAdmins = async (req, res) => {
  try {
    const admins = await superAdmin.findAll({
      attributes: [
        "id",
        "shopName",
        "userName",
        "address",
        "phoneNumber",
        "emailAddress",
        "createdAt",
        "updatedAt"
      ]
    });

    res.status(200).json({
      message: "Super admins fetched successfully.",
      superAdmins: admins
    });
  } catch (error) {
    console.error("Error fetching super admins:", error);
    res.status(500).json({ message: "Server error.", error: error.message });
  }
};


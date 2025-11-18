import { sequelizeCon, DataTypes } from "../init/dbConnection.js";
import bcrypt from "bcryptjs";

const Admin = sequelizeCon.define(
  "admins",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    shopName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    gstNumber: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    panNumber: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    contactPersonName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    contactPersonPhone: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    contactPersonEmail: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    openTime: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    closeTime: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    userName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    address: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    phoneNumber: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    emailAddress: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    password: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    commission: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    balance: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    blockStatus: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    },
    blockTill: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    isLoggedIn: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    },

    // ⭐ NEW COLUMN ADDED ⭐
    priorWinning: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    }
  },
  {
    timestamps: true,
    hooks: {
      beforeCreate: async (admin) => {
        if (admin.password) {
          const salt = await bcrypt.genSalt(10);
          admin.password = await bcrypt.hash(admin.password, salt);
        }
      },
      beforeUpdate: async (admin) => {
        if (admin.changed("password")) {
          const salt = await bcrypt.genSalt(10);
          admin.password = await bcrypt.hash(admin.password, salt);
        }
      }
    }
  }
);

export default Admin;

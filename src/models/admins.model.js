import { sequelizeCon, DataTypes } from "../init/dbConnection.js";

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

    // ❗ Password saved in plain text
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

    priorWinning: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    }
  },
  {
    timestamps: true,
    hooks: {} 
  }
);

export default Admin;

import { sequelizeCon, DataTypes } from "../init/dbConnection.js";

const ThreeDCancelledTicket = sequelizeCon.define(
  "3d_cancelled_tickets",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },

    // Original 3D ticket ID (from threed table)
    originalTicketId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    // Admin / Shop ID
    loginId: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    // Stored as gameTime from threed table
    drawTime: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    // Full JSON of ticketNumbers
    ticketNumber: {
      type: DataTypes.JSON,
      allowNull: false,
    },

    // Same as threed.totalPoints
    totalPoints: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    // Same as threed.totalQuantity
    totalQuatity: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    // When ticket was cancelled
    cancelledAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: "3d_cancelled_tickets",
    timestamps: false,
  }
);

export default ThreeDCancelledTicket;

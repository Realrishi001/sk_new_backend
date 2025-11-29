import { sequelizeCon, DataTypes } from "../init/dbConnection.js";

const winning = sequelizeCon.define(
  "winning",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },

    winningDate: {
      type: DataTypes.STRING,
      allowNull: false, 
    },

    winningTime: {
      type: DataTypes.STRING,
      allowNull: false,     
    },

    winningNumbers: {
      type: DataTypes.JSON,
      allowNull: false, 
    },

    totalAmount: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    totalPoints: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  },
  {
    timestamps: true,  
  }
);

export { winning };

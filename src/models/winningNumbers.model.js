import { sequelizeCon, DataTypes } from "../init/dbConnection.js";

const winningNumbers = sequelizeCon.define(
    "winningNumbers",
    {
        id : {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        loginId : {
            type : DataTypes.INTEGER,
            allowNull : false,
        },
        winningNumbers: {
            type: DataTypes.JSON,
            allowNull: false,
        },
        totalPoints : 
        {
            type : DataTypes.INTEGER,
            allowNull : false,
        },
        DrawTime : {
            type : DataTypes.JSON,
            allowNull : false,
        },
        drawDate : {
            type : DataTypes.STRING,
            allowNull : false,
        }
    },
    {
        timestamps : true
    }
)

export {winningNumbers};
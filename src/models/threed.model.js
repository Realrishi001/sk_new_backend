import { sequelizeCon, DataTypes } from "../init/dbConnection.js";

const threed = sequelizeCon.define(
    "threed",
    {
        id : {
            type : DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement : true,
        },
        gameTime : {
            type : DataTypes.STRING,
            allowNull : false,
        },
        loginId : {
            type : DataTypes.STRING,
            allowNull : false,
        },
        ticketNumbers : {
            type : DataTypes.JSON,
            allowNull : false
        },
        range : {
            type : DataTypes.INTEGER,
            allowNull : false,
        },
        totalQuantity : {
            type : DataTypes.INTEGER,
            allowNull : false,
        }, 
        totalPoints : {
            type : DataTypes.STRING,
            allowNull : false,
        },
    },{
        timestamps : true,
    }
)

export {threed};
import { sequelizeCon, DataTypes } from "../init/dbConnection.js";
import bcrypt from "bcryptjs";

const superAdmin = sequelizeCon.define(
    "superAdmins",
    {
        id: {
            type : DataTypes.INTEGER,
            primaryKey : true,
            autoIncrement : true,
        },
        shopName : {
            type: DataTypes.STRING,
            allowNull : true
        },
        userName: {
            type : DataTypes.STRING,
            allowNull: true
        },
        address : {
            type : DataTypes.TEXT,
            allowNull : true
        },
        phoneNumber : {
            type : DataTypes.STRING,
            allowNull : true
        },
        emailAddress : {
            type : DataTypes.STRING,
            allowNull : true
        },
        password : {
            type : DataTypes.STRING,
            allowNull: true,
        }
    },{
        timestamps : true,
        hooks : {
            beforeCreate : async (superAdmin) => {
                if(superAdmin.changed("password")) {
                    const salt = await bcrypt.genSalt(10);
                    superAdmin.password = await bcrypt.hash(superAdmin.password, salt);
                }
            }
        }
    }
);

export default superAdmin;
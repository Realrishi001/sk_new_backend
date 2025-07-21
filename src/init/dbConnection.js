import {Sequelize, Model, DataTypes, Op, QueryTypes} from 'sequelize'
import config from 'config'

const mysqlConfig = config.get('mysql')

export const sequelizeCon = new Sequelize(
    mysqlConfig.database,
    mysqlConfig.username,
    mysqlConfig.password,{
        host: mysqlConfig.host,
        dialect : mysqlConfig.dialect,
        logging : mysqlConfig.logging
    }
);


sequelizeCon.authenticate().then(()=> console.log("Database connection Established"))
.catch((err) =>console.error("Unable to connect to the database", err.message));

export {Model, DataTypes, Op, QueryTypes};
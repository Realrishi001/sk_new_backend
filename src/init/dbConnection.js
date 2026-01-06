import { Sequelize, Model, DataTypes, Op, QueryTypes } from "sequelize";
import config from "config";

/* ----------------------------------------
   LOAD MYSQL CONFIG
---------------------------------------- */
const mysqlConfig = config.get("mysql");

/* ----------------------------------------
   SEQUELIZE CONNECTION
---------------------------------------- */
export const sequelizeCon = new Sequelize(
  mysqlConfig.database,
  mysqlConfig.username,
  mysqlConfig.password,
  {
    host: mysqlConfig.host,
    port: mysqlConfig.port || 3306,
    dialect: "mysql",

    logging: mysqlConfig.logging || false,

    /* ---- TIMEOUT FIX (IMPORTANT) ---- */
    dialectOptions: {
      connectTimeout: 60000, // 60 seconds
    },

    /* ---- CONNECTION POOL ---- */
    pool: {
      max: 10,
      min: 0,
      acquire: 60000, // max time to get connection
      idle: 10000,    // close idle connections
    },

    timezone: "+05:30", // IST (optional)
  }
);

/* ----------------------------------------
   AUTHENTICATE DATABASE
---------------------------------------- */
(async () => {
  try {
    await sequelizeCon.authenticate();
    console.log("✅ Database connection established successfully");
  } catch (error) {
    console.error("❌ Unable to connect to the database");
    console.error("Reason:", error.message);
  }
})();


export { Model, DataTypes, Op, QueryTypes };

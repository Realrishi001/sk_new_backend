import { Sequelize, Model, DataTypes, Op, QueryTypes } from 'sequelize';
import config from 'config';

const dbConfig = config.get('database');

// ✅ PostgreSQL connection (Render requires SSL)
export const sequelizeCon = new Sequelize(
  dbConfig.database,   // database name
  dbConfig.username,   // user
  dbConfig.password,   // password
  {
    host: dbConfig.host,
    dialect: dbConfig.dialect,
    port: dbConfig.port || 5432, // PostgreSQL default port
    logging: dbConfig.logging,
    dialectOptions: {
      ssl: {
        require: true,               // ✅ SSL required
        rejectUnauthorized: false    // ✅ Skip cert verification
      }
    }
  }
);

sequelizeCon.authenticate()
  .then(() => console.log("✅ Database connection established successfully"))
  .catch(err => console.error("❌ Unable to connect to the database:", err.message));

export { Model, DataTypes, Op, QueryTypes };

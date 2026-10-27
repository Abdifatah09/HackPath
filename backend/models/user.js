const { DataTypes } = require("sequelize");
const sequelize = require("../sequelize");

const User = sequelize.define(
  "User",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },

    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      validate: { isEmail: true },
    },

    passwordHash: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },

    role: {
      type: DataTypes.ENUM("student", "instructor", "admin"),
      allowNull: false,
      defaultValue: "student",
    },

    passwordResetCodeHash: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    passwordResetExpiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
    }, 
  },
  {
    tableName: "users",
  }
);

module.exports = User;

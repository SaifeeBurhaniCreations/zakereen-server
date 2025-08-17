const bcrypt = require('bcrypt');
const jwt = require("jsonwebtoken");
const userClient = require('../models/users')
require('dotenv').config()


// Hash password function
const hashPassword = async (plainPassword) => {
  try {
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(plainPassword, saltRounds);
    return hashedPassword;
  } catch (err) {
    console.error('Error hashing password:', err);
    throw err;
  }
};

const validatePassword = async (enteredPassword, hashedPassword) => {
  return await bcrypt.compare(enteredPassword, hashedPassword);
};

const authAdmin = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Authorization token is required." });
  }

  const token = authHeader.split(" ")[1].trim();

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { userid } = decoded;

    const user = await userClient.findOne({ userid }); // replace with _id if that's your field

    if (!user) {
      return res.status(401).json({ message: "User not found." });
    }

    // Correct role check
    if (!["superadmin", "admin"].includes(user.role)) {
      return res.status(403).json({ message: "Access denied. Admin privileges required." });
    }

    req.user = user;
    next();

  } catch (error) {
    console.error("Admin auth error:", error);
    return res.status(403).json({ message: "Invalid token." });
  }
};

const authGroup = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Authorization token is required." });
  }

  const token = authHeader.split(" ")[1].trim();

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { userid } = decoded;

    const user = await userClient.findOne({ userid }); // replace with _id if that's your field

    if (!user) {
      return res.status(401).json({ message: "User not found." });
    }

    // Correct role check
    if (!["superadmin", "admin", "groupadmin"].includes(user.role)) {
      return res.status(403).json({ message: "Access denied. Admin privileges required." });
    }

    req.user = user;
    next();

  } catch (error) {
    console.error("Admin auth error:", error);
    return res.status(403).json({ message: "Invalid token." });
  }
};

const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token is required." });
  }

  const token = authHeader.split(" ")[1].trim();

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userid;
    next();
  } catch (error) {
    console.error("Token verification failed:", error);
    return res.status(403).json({ error: "Invalid token." });
  }
};


module.exports = {
  hashPassword,
  validatePassword,
  authAdmin,
  authGroup,
  verifyToken
};

const jwt = require("jsonwebtoken");

const { config } = require("../config/env");

function createToken(user) {
  return jwt.sign(
    {
      userId: user.userId,
      email: user.email
    },
    config.jwtSecret,
    {
      expiresIn: config.jwtExpiresIn
    }
  );
}

function requireAuth(req, res, next) {
  const authorization = req.headers.authorization;

  if (!authorization || !authorization.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      error: "Authentication token is required."
    });
  }

  const token = authorization.slice(7).trim();

  if (!token) {
    return res.status(401).json({
      success: false,
      error: "Authentication token is missing."
    });
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret);

    if (!decoded.userId || !decoded.email) {
      return res.status(401).json({
        success: false,
        error: "Invalid authentication token."
      });
    }

    req.user = {
      userId: decoded.userId,
      email: decoded.email
    };

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: "Invalid or expired authentication token."
    });
  }
}

function requireIngestionKey(req, res, next) {
  const providedKey = req.headers["x-ingestion-key"];

  if (
    !providedKey ||
    !config.ingestionApiKey ||
    providedKey !== config.ingestionApiKey
  ) {
    return res.status(401).json({
      success: false,
      error: "Invalid ingestion API key."
    });
  }

  next();
}

module.exports = {
  createToken,
  requireAuth,
  requireIngestionKey
};
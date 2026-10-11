function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  const statusCode = Number(error.statusCode || error.status || 500);

  const safeStatusCode =
    statusCode >= 400 && statusCode < 600 ? statusCode : 500;

  if (safeStatusCode >= 500) {
    console.error("[ERROR]", {
      method: req.method,
      path: req.originalUrl,
      message: error.message
    });
  }

  const message =
    safeStatusCode >= 500 && process.env.NODE_ENV === "production"
      ? "An unexpected server error occurred."
      : error.message || "Request failed.";

  res.status(safeStatusCode).json({
    success: false,
    error: message
  });
}

module.exports = errorHandler;
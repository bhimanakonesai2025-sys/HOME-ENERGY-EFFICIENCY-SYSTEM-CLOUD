const jwt = require("jsonwebtoken");

function getToken(req) {
    const header =
        req.headers.authorization || "";

    if (header.startsWith("Bearer ")) {
        return header.substring(7);
    }

    return null;
}

function requireAuth(req, res, next) {
    const token = getToken(req);

    if (!token) {
        return res.status(401).json({
            message:
                "Authentication token required."
        });
    }

    try {
        const payload =
            jwt.verify(
                token,
                process.env.JWT_SECRET
            );

        req.user = payload;

        next();
    } catch (error) {
        return res.status(401).json({
            message:
                "Invalid or expired token."
        });
    }
}

function requireIngestionKey(
    req,
    res,
    next
) {
    const key =
        req.headers["x-ingest-key"];

    if (!process.env.INGEST_API_KEY) {
        return res.status(500).json({
            message:
                "INGEST_API_KEY is not configured."
        });
    }

    if (
        !key ||
        key !== process.env.INGEST_API_KEY
    ) {
        return res.status(401).json({
            message:
                "Invalid ingestion key."
        });
    }

    next();
}

module.exports = {
    requireAuth,
    requireIngestionKey
};
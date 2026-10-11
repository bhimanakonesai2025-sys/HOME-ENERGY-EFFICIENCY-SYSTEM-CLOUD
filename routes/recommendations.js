const express = require("express");

const { requireAuth } = require("../middleware/auth");

const {
  getOwnedHome
} = require("../services/energyService");

const {
  generateRecommendations
} = require("../services/recommendationService");

const router = express.Router();

router.use(requireAuth);

/*
 * GET /api/recommendations
 */
router.get("/", async (req, res, next) => {
  try {
    const home = await getOwnedHome(
      req.user.userId,
      req.query.homeId
    );

    const recommendations = await generateRecommendations(
      home.homeId
    );

    res.json({
      success: true,
      homeId: home.homeId,
      count: recommendations.length,
      recommendations,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
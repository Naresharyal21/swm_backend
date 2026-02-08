const express = require("express");
const ctrl = require("../controllers/signupotp.controller");

const router = express.Router();

// Final URLs (after mounting under /auth):
// POST /auth/signup/request-otp
// POST /auth/signup/verify-otp
// POST /auth/signup/cancel

router.post("/signup/request-otp", ctrl.requestOtp);
router.post("/signup/verify-otp", ctrl.verifyOtp);
router.post("/signup/cancel", ctrl.cancel);

module.exports = router;

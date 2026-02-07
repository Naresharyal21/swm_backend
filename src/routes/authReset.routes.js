const router = require('express').Router();
const c = require('../controllers/authReset.controller');

router.post('/forgot-password', c.forgotPassword);
router.post('/verify-otp', c.verifyOtp);
router.post('/reset-password', c.resetPassword);

module.exports = router;

const express = require("express");
const router = express.Router();

const esewaController = require("../controllers/esewa.controller");
const { authenticate } = require("../middlewares/auth");

// Initiate requires login
router.post("/initiate", authenticate, esewaController.initiateEsewa);

// Status check (auth)
router.get("/status/:txUuid", authenticate, esewaController.esewaStatus);

// Callbacks must be public + support GET/POST
router.all("/success", esewaController.esewaSuccess);
router.all("/failure", esewaController.esewaFailure);

module.exports = router;

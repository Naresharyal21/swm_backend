const express = require('express');
const { authenticate } = require('../middlewares/auth');
const ctrl = require('../controllers/files.controller');

const router = express.Router();
router.use(authenticate);

router.get('/evidence/:id/url', ctrl.getEvidenceDownloadUrl);

module.exports = router;

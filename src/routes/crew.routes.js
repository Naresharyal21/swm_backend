const express = require('express');
const Joi = require('joi');
const multer = require('multer');
const { authenticate, requireRole } = require('../middlewares/auth');
const { validate } = require('../middlewares/validate');
const { ROLES } = require('../config/constants');
const ctrl = require('../controllers/crew.controller');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.use(authenticate);
router.use(requireRole(ROLES.CREW));

router.get('/today-route', ctrl.getTodayRoute);
router.get('/tasks', ctrl.listMyTasks);

router.patch('/tasks/:id/status', validate(Joi.object({ status: Joi.string().required() })), ctrl.updateTaskStatus);
router.post('/tasks/:id/proof', upload.single('file'), ctrl.uploadProof);

// ✅ Recyclable verification flow
router.post(
  '/recyclables/:id/verify',
  validate(
    Joi.object({
      verifiedPieces: Joi.number().min(0).optional(),
      verifiedTotalWeightKg: Joi.number().min(0).optional(),
      note: Joi.string().allow('').optional()
    })
  ),
  ctrl.verifyRecyclableSubmission
);

router.post(
  '/recyclables/:id/reject',
  validate(Joi.object({ reason: Joi.string().allow('').optional() })),
  ctrl.rejectRecyclableSubmission
);

module.exports = router;

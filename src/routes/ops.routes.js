const express = require('express');
const Joi = require('joi');
const { authenticate, requireRole } = require('../middlewares/auth');
const { validate } = require('../middlewares/validate');
const { ROLES } = require('../config/constants');
const ctrl = require('../controllers/ops.controller');

const router = express.Router();
router.use(authenticate);
router.use(requireRole(ROLES.ADMIN, ROLES.SUPERVISOR));

router.get('/cases', ctrl.listCases);
router.post('/cases/:id/approve', validate(Joi.object({ note: Joi.string().allow('').optional(), scheduledDate: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).allow(null).optional(), priority: Joi.number().allow(null).optional() })), ctrl.approveCase);
router.post('/cases/:id/reject', validate(Joi.object({ note: Joi.string().allow('').optional() })), ctrl.rejectCase);

router.get('/tasks', ctrl.listTasks);
router.post('/tasks/:id/assign', validate(Joi.object({ assignedToUserId: Joi.string().allow(null).optional(), vehicleId: Joi.string().allow(null).optional(), scheduledDate: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).allow(null).optional() })), ctrl.assignTask);

router.post('/routes/generate', validate(Joi.object({ date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).optional() })), ctrl.generateRoutes);
router.get('/routes', ctrl.listRoutes);
router.post('/routes/:id/publish', ctrl.publishRouteController);

router.post('/dt/aggregate', ctrl.dtAggregate);
router.get('/dt/virtual-bins', ctrl.dtList);

router.get('/reward-claims', ctrl.listRewardClaims);
router.post('/reward-claims/:id/approve', validate(Joi.object({ note: Joi.string().allow('').optional() })), ctrl.approveRewardClaim);
router.post('/reward-claims/:id/reject', validate(Joi.object({ note: Joi.string().allow('').optional() })), ctrl.rejectRewardClaim);

router.post('/billing/generate', validate(Joi.object({ month: Joi.string().pattern(/^\d{4}-\d{2}$/).optional() })), ctrl.generateInvoices);

// ✅ Manual truck/vehicle location update (testing): triggers 500m alerts
router.post(
  '/vehicles/:vehicleId/location',
  validate(
    Joi.object({
      coordinates: Joi.array().items(Joi.number()).length(2).required(),
      date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).allow(null).optional(),
      source: Joi.string().valid('MANUAL', 'MOBILE').optional()
    })
  ),
  ctrl.postVehicleLocation
);

module.exports = router;

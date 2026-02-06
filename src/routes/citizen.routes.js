const express = require('express');
const Joi = require('joi');
const { authenticate, requireRole } = require('../middlewares/auth');
const { validate } = require('../middlewares/validate');
const { ROLES } = require('../config/constants');
const ctrl = require('../controllers/citizen.controller');
const multer = require('multer');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const router = express.Router();
router.use(authenticate);
router.use(requireRole(ROLES.CITIZEN));

const locationSchema = Joi.object({
  type: Joi.string().valid('Point').default('Point'),
  coordinates: Joi.array().items(Joi.number()).length(2).required()
});

router.post(
  '/litter-reports',
  validate(Joi.object({ location: locationSchema.required(), description: Joi.string().allow('').optional() })),
  ctrl.createLitterReport
);

router.post(
  '/bulky-requests',
  validate(Joi.object({ householdId: Joi.string().required(), bulkyWeightKg: Joi.number().required(), description: Joi.string().allow('').optional() })),
  ctrl.createBulkyRequest
);

router.get('/cases', ctrl.listCases);

router.post(
  '/reward-claims',
  validate(Joi.object({ category: Joi.string().required(), quantity: Joi.number().min(1).required() })),
  ctrl.createRewardClaim
);

router.get('/wallet', ctrl.walletSummary);
router.get('/invoices', ctrl.listInvoices);

// ✅ Billing plans (monthly + daily)
router.get('/billing-plans', ctrl.listBillingPlans);

// list the house hold per citizen(for drop dowm)
router.get('/household/me', ctrl.getMyHousehold);

// Citizen households (for dropdown) Note above router do same work but filter all details: router.get('/household/me', ctrl.getMyHousehold);
router.get('/households/me', ctrl.getMyHouseholds);

// ✅ Household settings
router.put(
  '/households/:householdId/plan',
  validate(Joi.object({ planId: Joi.string().allow(null).optional() })),
  ctrl.updateMyHouseholdPlan
);

router.put(
  '/households/:householdId/pickup-schedule',
  validate(Joi.object({ pickupScheduleDays: Joi.array().items(Joi.string().valid('SUN','MON','TUE','WED','THU','FRI','SAT')).min(1).required() })),
  ctrl.updateMyPickupSchedule
);

// ✅ Membership
router.get('/memberships/plans', ctrl.listMemberships);
router.get('/memberships/me', ctrl.getMyMembership);
router.post('/memberships/subscribe', validate(Joi.object({ planId: Joi.string().required() })), ctrl.subscribeMembership);
router.post('/memberships/cancel', validate(Joi.object({ note: Joi.string().allow('').optional() })), ctrl.cancelMyMembership);

// ✅ Recyclable submission (non-disposal waste)
router.post(
  '/recyclables/submissions',
  upload.array('files', 5),
  validate(
    Joi.object({
      householdId: Joi.string().required(),
      category: Joi.string().required(),
      pieces: Joi.number().min(0).optional(),
      avgWeightKg: Joi.number().min(0).optional(),
      estimatedTotalWeightKg: Joi.number().min(0).optional(),
      scheduledDate: Joi.string().allow(null).optional()
    })
  ),
  ctrl.createRecyclableSubmission
);
router.get('/recyclables/submissions', ctrl.listRecyclables);

// ✅ Notifications
router.get('/notifications', ctrl.myNotifications);
router.put('/notifications/:id/read', ctrl.markNotificationRead);


// Payments
router.post(
  '/invoices/:invoiceId/pay',
  validate(Joi.object({ provider: Joi.string().valid('MOCK', 'KHALTI').optional() })),
  ctrl.payInvoice
);

// Khalti callback
router.get('/payments/khalti/callback', ctrl.khaltiCallback);



// ✅ Payments
// router.post('/invoices/:invoiceId/pay', validate(Joi.object({ provider: Joi.string().valid('MOCK','KHALTI').optional() })), ctrl.payInvoice);

module.exports = router;

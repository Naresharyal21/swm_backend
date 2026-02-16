// src/routes/citizen.routes.js
const express = require("express");
const Joi = require("joi");
const multer = require("multer");

const { authenticate, requireRole } = require("../middlewares/auth");
const { validate } = require("../middlewares/validate");
const { ROLES } = require("../config/constants");

const ctrl = require("../controllers/citizen.controller");

// ✅ PaymentTransaction model (for /citizen/transactions)
const PaymentTransaction = require("../models/PaymentTransaction");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const router = express.Router();

// ✅ Apply auth + role for all citizen routes
router.use(authenticate);
router.use(requireRole(ROLES.CITIZEN));

const locationSchema = Joi.object({
  type: Joi.string().valid("Point").default("Point"),
  coordinates: Joi.array().items(Joi.number()).length(2).required(), // [lng, lat]
});

/* ------------------------------------------------------------------ */
/* Citizen selectable zones + virtual bins                              */
/* ------------------------------------------------------------------ */

// Zones created by admin (dropdown)
router.get("/zones", ctrl.listZones);

// Virtual bins created by admin (dropdown) - filter with ?zoneId=...
router.get(
  "/virtual-bins",
  validate(
    Joi.object({
      zoneId: Joi.string().optional(),
    })
  ),
  ctrl.listVirtualBins
);

/* ------------------------------------------------------------------ */
/* ✅ One-step create Household + Bin (INACTIVE) + Pair Device           */
/* ------------------------------------------------------------------ */

router.post(
  "/household-bins",
  validate(
    Joi.object({
      zoneId: Joi.string().required(),
      virtualBinId: Joi.string().required(),
      address: Joi.string().min(2).required(),
      binId: Joi.string().min(1).required(),
      location: locationSchema.required(),

      // ✅ required for pairing (controller enforces)
      deviceId: Joi.string().min(1).required(),
      deviceKey: Joi.string().min(1).required(),
    })
  ),
  ctrl.createHouseholdWithBin
);

/* ------------------------------------------------------------------ */
/* Existing endpoints                                                   */
/* ------------------------------------------------------------------ */

router.post(
  "/litter-reports",
  validate(
    Joi.object({
      location: locationSchema.required(),
      description: Joi.string().allow("").optional(),
    })
  ),
  ctrl.createLitterReport
);

router.post(
  "/bulky-requests",
  validate(
    Joi.object({
      householdId: Joi.string().required(),
      bulkyWeightKg: Joi.number().required(),
      description: Joi.string().allow("").optional(),
    })
  ),
  ctrl.createBulkyRequest
);

router.get("/cases", ctrl.listCases);

router.post(
  "/reward-claims",
  validate(Joi.object({ category: Joi.string().required(), quantity: Joi.number().min(1).required() })),
  ctrl.createRewardClaim
);

router.get("/wallet", ctrl.walletSummary);
router.get("/invoices", ctrl.listInvoices);

/* ------------------------------------------------------------------ */
/* Transactions                                                         */
/* ------------------------------------------------------------------ */
/**
 * GET /api/citizen/transactions
 * Returns: { items: [...] }
 */
router.get("/transactions", async (req, res, next) => {
  try {
    const userId = req.user?._id || req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const items = await PaymentTransaction.find({ userId })
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();

    return res.json({ items });
  } catch (err) {
    return next(err);
  }
});

// Billing plans (monthly + daily)
router.get("/billing-plans", ctrl.listBillingPlans);

// list one household per citizen (legacy)
router.get("/household/me", ctrl.getMyHousehold);

// Citizen households (for dropdown)
router.get("/households/me", ctrl.getMyHouseholds);

// Household settings
router.put(
  "/households/:householdId/plan",
  validate(Joi.object({ planId: Joi.string().allow(null).optional() })),
  ctrl.updateMyHouseholdPlan
);

router.put(
  "/households/:householdId/pickup-schedule",
  validate(
    Joi.object({
      pickupScheduleDays: Joi.array()
        .items(Joi.string().valid("SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"))
        .min(1)
        .required(),
    })
  ),
  ctrl.updateMyPickupSchedule
);

/* ------------------------------------------------------------------ */
/* Cascade delete Household (+ bins if cascade=1)                       */
/* ------------------------------------------------------------------ */

router.delete(
  "/households/:id",
  validate(
    Joi.object({
      cascade: Joi.string().valid("1").optional(),
    })
  ),
  ctrl.deleteHousehold
);

/* ------------------------------------------------------------------ */
/* Membership                                                           */
/* ------------------------------------------------------------------ */

router.get("/memberships/plans", ctrl.listMemberships);
router.get("/memberships/me", ctrl.getMyMembership);

router.post(
  "/memberships/subscribe",
  validate(Joi.object({ planId: Joi.string().required() })),
  ctrl.subscribeMembership
);

router.post(
  "/memberships/cancel",
  validate(Joi.object({ note: Joi.string().allow("").optional() })),
  ctrl.cancelMyMembership
);

/* ------------------------------------------------------------------ */
/* Recyclable submission                                                */
/* ------------------------------------------------------------------ */

router.post(
  "/recyclables/submissions",
  upload.array("files", 5),
  validate(
    Joi.object({
      householdId: Joi.string().required(),
      category: Joi.string().required(),
      pieces: Joi.number().min(0).optional(),
      avgWeightKg: Joi.number().min(0).optional(),
      estimatedTotalWeightKg: Joi.number().min(0).optional(),
      scheduledDate: Joi.string().allow(null).optional(),
    })
  ),
  ctrl.createRecyclableSubmission
);

router.get("/recyclables/submissions", ctrl.listRecyclables);

/* ------------------------------------------------------------------ */
/* Notifications                                                        */
/* ------------------------------------------------------------------ */

router.get("/notifications", ctrl.myNotifications);
router.put("/notifications/:id/read", ctrl.markNotificationRead);

/* ------------------------------------------------------------------ */
/* Payments                                                             */
/* ------------------------------------------------------------------ */

router.post(
  "/invoices/:invoiceId/pay",
  validate(Joi.object({ provider: Joi.string().valid("MOCK", "KHALTI").optional() })),
  ctrl.payInvoice
);

router.post(
  "/activate-bin",
  validate(Joi.object({ householdId: Joi.string().required(), planId: Joi.string().required() })),
  ctrl.activateBinAfterPayment
);

router.post(
  "/deactivate-bin",
  validate(Joi.object({ householdId: Joi.string().required() })),
  ctrl.deactivateBin
);

/* ------------------------------------------------------------------ */
/* Available Bin IDs for citizen (unassigned only)                      */
/* ------------------------------------------------------------------ */

router.get(
  "/binids/available",
  validate(
    Joi.object({
      q: Joi.string().allow("").optional(),
      limit: Joi.number().min(1).max(200).optional(),
      page: Joi.number().min(1).optional(),
    })
  ),
  ctrl.listAvailableBinIds
);

module.exports = router;

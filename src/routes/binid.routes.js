const router = require("express").Router();
const ctrl = require("../controllers/binid.controller");

// If you already have admin auth middleware, add it here
// const { requireAuth, requireRole } = require("../middlewares/auth");
// router.use(requireAuth, requireRole("ADMIN"));

router.get("/", ctrl.list);

router.post("/", ctrl.createOne);

// bulk ops
router.post("/generate-range", ctrl.generateRange);
router.delete("/delete-range", ctrl.deleteRange);
router.delete("/delete-code-range", ctrl.deleteCodeRange);

// single delete
router.delete("/:id", ctrl.deleteOne);

module.exports = router;

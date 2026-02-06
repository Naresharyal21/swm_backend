const express = require('express');

const authRoutes = require('./auth.routes');
const adminRoutes = require('./admin.routes');
const citizenRoutes = require('./citizen.routes');
const iotRoutes = require('./iot.routes');
const opsRoutes = require('./ops.routes');
const crewRoutes = require('./crew.routes');
const filesRoutes = require('./files.routes');
const esewaRoutes = require("./esewa.routes");

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/admin', adminRoutes);
router.use('/citizen', citizenRoutes);
router.use('/iot', iotRoutes);
router.use('/ops', opsRoutes);
router.use('/crew', crewRoutes);
router.use('/files', filesRoutes);
router.use("/payments/esewa", esewaRoutes);

module.exports = router;

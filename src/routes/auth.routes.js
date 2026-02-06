const express = require('express');
const Joi = require('joi');
const { validate } = require('../middlewares/validate');
const { authenticate } = require('../middlewares/auth');
const { register, loginController, refresh, logout, me } = require('../controllers/auth.controller');

const router = express.Router();

const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  name: Joi.string().allow('').optional(),
  phone: Joi.string().allow('').optional()
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required()
});

const refreshSchema = Joi.object({
  refreshToken: Joi.string().required()
});

router.post('/register', validate(registerSchema), register);
router.post('/login', validate(loginSchema), loginController);
router.post('/refresh', validate(refreshSchema), refresh);
router.post('/logout', authenticate, validate(refreshSchema), logout);
router.get('/me', authenticate, me);

module.exports = router;

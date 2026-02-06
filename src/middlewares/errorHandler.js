const { HttpError } = require('../utils/errors');

function errorHandler(err, req, res, next) {
  // eslint-disable-line no-unused-vars
  const statusCode = err instanceof HttpError ? err.statusCode : 500;
  const payload = {
    message: err.message || 'Internal Server Error'
  };
  if (err instanceof HttpError && err.details) {
    payload.details = err.details;
  }
  if (statusCode >= 500) {
    // Log server errors
    console.error(err);
  }
  res.status(statusCode).json(payload);
}

module.exports = { errorHandler };

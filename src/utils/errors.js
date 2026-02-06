class HttpError extends Error {
  constructor(statusCode, message, details) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

function badRequest(message, details) {
  return new HttpError(400, message, details);
}

function unauthorized(message = 'Unauthorized') {
  return new HttpError(401, message);
}

function forbidden(message = 'Forbidden') {
  return new HttpError(403, message);
}

function notFound(message = 'Not found') {
  return new HttpError(404, message);
}

module.exports = { HttpError, badRequest, unauthorized, forbidden, notFound };

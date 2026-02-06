const { badRequest } = require('../utils/errors');

function validate(schema, property = 'body') {
  return function validator(req, res, next) {
    const { error, value } = schema.validate(req[property], { abortEarly: false, stripUnknown: true });
    if (error) {
      return next(badRequest('Validation error', error.details.map(d => d.message)));
    }
    req[property] = value;
    return next();
  };
}

module.exports = { validate };

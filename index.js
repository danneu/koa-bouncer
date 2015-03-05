// Node
var util = require('util');
// 3rd party
var _ = require('lodash');
var debug = require('debug')('koa-bouncer');
var assert = require('better-assert');
var validator = require('validator');

function ValidationError(key, message) {
  this.name = 'ValidationError';
  this.message = message;
  this.bouncer = {
    key: key,
    message: message
  };
}
ValidationError.prototype = _.create(Error.prototype);

function Validator(props) {
  this.key = props.key;
  this.value = props.value;
  this.type = props.type;
  this.throwError = function(tip) {
    throw new ValidationError(this.key, tip);
  };
}

Validator.prototype.notEmpty = function(tip) {
  if (_.isEmpty(this.value))
    this.throwError(tip || this.key + ' must not be empty');
  return this;
};

// Ensures value is in given array
Validator.prototype.isIn = function(arr, tip) {
  if (!_.contains(arr, this.value))
    this.throwError(tip || 'Invalid ' + this.key);
  return this;
};

// Ensures value is not in given array
Validator.prototype.isNotIn = function(arr, tip) {
  if (_.contains(arr, this.value))
    this.throwError(tip || 'Invalid ' + this.key);
  return this;
};

// Ensures value is an array
Validator.prototype.isArray = function(tip) {
  if (!_.isArray(this.value))
    this.throwError(tip || util.format('%s must be an array', this.key));
  return this;
};

// Ensures value is an email address
Validator.prototype.isEmail = function(tip) {
  if (!validator.isEmail(this.value))
    this.throwError(tip || util.format('%s must be an email address', this.key));

  return this;
};

// Ensures value is a url
Validator.prototype.isUrl = function(tip) {
  if (!validator.isURL(this.value))
    this.throwError(tip || util.format('%s must be a URL', this.key));

  return this;
};

// Ensures value is === equivalent to given value
Validator.prototype.eq = function(otherValue, tip) {
  if (this.value !== otherValue)
    this.throwError(tip || 'Invalid ' + this.key);

  return this;
};

// Ensures value > given value
Validator.prototype.gt = function(otherValue, tip) {
  if (this.value <= otherValue)
    this.throwError(tip || 'Invalid ' + this.key);

  return this;
};

// Ensures value >= given value
Validator.prototype.gte = function(otherValue, tip) {
  if (this.value < otherValue)
    this.throwError(tip || 'Invalid ' + this.key);

  return this;
};

// Ensures value < given value
Validator.prototype.lt = function(otherValue, tip) {
  if (this.value >= otherValue)
    this.throwError(tip || 'Invalid ' + this.key);

  return this;
};

// Ensures value <= given value
Validator.prototype.lte = function(otherValue, tip) {
  if (this.value > otherValue)
    this.throwError(tip || 'Invalid ' + this.key);

  return this;
};

// Ensures value's length is [min, max] inclusive
Validator.prototype.isLength = function(min, max, tip) {
  if (this.value.length < min || this.value.length > max)
    this.throwError(
      tip || util.format('%s must be %s-%s characters long', this.key, min, max)
    );
  return this;
};

// If value is undefined, set it to given value
Validator.prototype.default = function(v) {
  this.value = _.isUndefined(this.value) ? v : this.value;
  return this;
};

// Converts value to integer, throwing if it fails
Validator.prototype.toInt = function(tip) {
  var result = parseInt(this.value, 10);
  if (_.isNaN(result))
    this.throwError(tip || this.key + ' must be an integer');
  this.value = result;
  return this;
};

// If value is not already an array, puts it in a singleton array
Validator.prototype.toArray = function(tip) {
  this.value = _.isUndefined(this.value) ? [] : this.value;
  this.value = (_.isArray(this.value) ? this.value : [this.value]);
  return this;
};

// Converts value to array if it's not already an array,
// and then converts every item in the array to an integer
// throwing if any of them fail conversion
Validator.prototype.toInts = function(tip) {
  this.toArray();
  var results = this.value.map(function(v) {
    return parseInt(v, 10);
  });

  if (!_.every(results, Number.isInteger))
    this.throwError(tip || this.key + ' must be an array of integers');

  this.value = results;
  return this;
};

// Converts value to array if necessary, then de-dupes it
Validator.prototype.uniq = function(tip) {
  this.toArray();
  this.value = _.uniq(this.value);
  return this;
};

// Converts value to boolean
// Always succeeds
Validator.prototype.toBoolean = function() {
  this.value = !!this.value;
  return this;
};

// Converts value to float, throwing if it fails
Validator.prototype.toFloat = function(tip) {
  var result = parseFloat(this.value);
  if (_.isNaN(result))
    this.throwError(tip || this.key + ' must be a float');
  this.value = result;
  return this;
};

// Converts value to string
// Undefined value converts to empty string
// Always succeeds
Validator.prototype.toString = function() {
  this.value = (this.value && this.value.toString() || '');
  return this;
};

// Converts value to lowercase string
// If there is no value, it's converted into a string
// If value is not a string, it's converted into a string
// Always succeeds
Validator.prototype.toLowerCase = function() {
  this.toString();
  this.value = this.value.toLowerCase();
  return this;
};

// Converts value to uppercase string
// Read toLowerCase comment for more info
// Always succeeds
Validator.prototype.toUpperCase = function() {
  this.toString();
  this.value = this.value.toUpperCase();
  return this;
};

// Converts value into a trimmed string
// Always succeeds
Validator.prototype.trim = function() {
  this.toString();
  this.value = this.value.trim();
  return this;
};

// Assert that value does not match the supplied regular expression.
Validator.prototype.notMatch = function(regexp, tip) {
	if (regexp.test(this.value))
    this.throwError(tip || 'Invalid ' + this.key);

	return this;
};

// Assert that a string does match the supplied regular expression.
Validator.prototype.match = function(regexp, tip) {
	if (!regexp.test(this.value))
    this.throwError(tip || 'Invalid ' + this.key);

	return this;
};

Validator.prototype.check = function(result, tip) {
  if (!result)
    this.throwError(tip);

  return this;
};

Validator.prototype.checkNot = function(result, tip) {
  if (!!result)
    this.throwError(tip);

  return this;
};

// API ///////////////////////////////////////////////

exports.ValidationError = ValidationError;

exports.middleware = function middleware() {
  return function*(next) {
    debug('Initializing koa-bouncer');
    var self = this;

    this.validateQuery = function(key) {
      return new Validator({
        key: key,
        // Use existing this.valid value if there is one
        value: self.query[key],
        type: 'query',
        valid: self.valid
      });
    };
    this.validateBody = function(key) {
      return new Validator({
        key: key,
        // Use existing this.valid value if there is one
        value: self.request.body[key],
        type: 'body',
        valid: self.valid
      });
    };
    this.validate = this.check = function(result, tip) {
      if (!result)
        throw new ValidationError(null, tip);
    };
    this.validateNot = this.checkNot = function(result, tip) {
      if (!!result)
        throw new ValidationError(null, tip);
    };
    yield next;
  };
};

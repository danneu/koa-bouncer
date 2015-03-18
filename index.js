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
  this.ctx = props.ctx;  // Koa context
  this.key = props.key;
  this.val = props.val;
  this.vals = props.vals;
  this.type = props.type;
  this.throwError = function(tip) {
    throw new ValidationError(this.key, tip || 'Invalid value for ' + this.key);
  };

  // Populate vals on init
  // Ex: this.validateBody('foo') will populate this.vals.foo
  //     with this.request.body.foo (even if undefined)
  this.vals[this.key] = this.val;
}

Validator.prototype.notEmpty = function(tip) {
  if (_.isEmpty(this.val))
    this.throwError(tip || this.key + ' must not be empty');
  this.vals[this.key] = this.val;
  return this;
};

// Ensures value is in given array
Validator.prototype.isIn = function(arr, tip) {
  if (!_.contains(arr, this.val))
    this.throwError(tip || 'Invalid ' + this.key);
  this.vals[this.key] = this.val;
  return this;
};

// Ensures value is not in given array
Validator.prototype.isNotIn = function(arr, tip) {
  if (_.contains(arr, this.val))
    this.throwError(tip || 'Invalid ' + this.key);
  this.vals[this.key] = this.val;
  return this;
};

// Ensures value is an array
Validator.prototype.isArray = function(tip) {
  if (!_.isArray(this.val))
    this.throwError(tip || util.format('%s must be an array', this.key));
  this.vals[this.key] = this.val;
  return this;
};

// Ensures value is an email address
Validator.prototype.isEmail = function(tip) {
  if (!validator.isEmail(this.val))
    this.throwError(tip || util.format('%s must be an email address', this.key));

  this.vals[this.key] = this.val;
  return this;
};

// Ensures value is a url
Validator.prototype.isUrl = function(tip) {
  if (!validator.isURL(this.val))
    this.throwError(tip || util.format('%s must be a URL', this.key));

  this.vals[this.key] = this.val;
  return this;
};

// Ensures value is === equivalent to given value
Validator.prototype.eq = function(otherValue, tip) {
  if (this.val !== otherValue)
    this.throwError(tip || 'Invalid ' + this.key);

  this.vals[this.key] = this.val;
  return this;
};

// Ensures value > given value
Validator.prototype.gt = function(otherValue, tip) {
  if (this.val <= otherValue)
    this.throwError(tip || 'Invalid ' + this.key);

  this.vals[this.key] = this.val;
  return this;
};

// Ensures value >= given value
Validator.prototype.gte = function(otherValue, tip) {
  if (this.val < otherValue)
    this.throwError(tip || 'Invalid ' + this.key);

  this.vals[this.key] = this.val;
  return this;
};

// Ensures value < given value
Validator.prototype.lt = function(otherValue, tip) {
  if (this.val >= otherValue)
    this.throwError(tip || 'Invalid ' + this.key);

  this.vals[this.key] = this.val;
  return this;
};

// Ensures value <= given value
Validator.prototype.lte = function(otherValue, tip) {
  if (this.val > otherValue)
    this.throwError(tip || 'Invalid ' + this.key);

  this.vals[this.key] = this.val;
  return this;
};

// Ensures value's length is [min, max] inclusive
Validator.prototype.isLength = function(min, max, tip) {
  if (this.val.length < min || this.val.length > max)
    this.throwError(
      tip || util.format('%s must be %s-%s characters long', this.key, min, max)
    );
  this.vals[this.key] = this.val;
  return this;
};

// If value is undefined, set it to given value or to the value
// returned by a function.
Validator.prototype.default = function(valueOrFunction) {
  var val = this.val;
  if (_.isUndefined(this.val))
    if (_.isFunction(valueOrFunction))
      // Run fn with `this` bound to Koa context
      val = valueOrFunction.bind(this.ctx)();
    else
      val = valueOrFunction;

  this.vals[this.key] = this.val = val;
  return this;
};

// Converts value to integer, throwing if it fails
Validator.prototype.toInt = function(tip) {
  if (!validator.isInt(this.val))
    this.throwError(tip || util.format('%s must be an integer', this.key));
  this.vals[this.key] = this.val = parseInt(this.val, 10);
  return this;
};

// Checks it is already an integer (and type number), throws if its not
Validator.prototype.isInt = function(tip) {
  if (!Number.isInteger(this.val))
    this.throwError(tip || util.format('%s must be an integer', this.key));
  this.vals[this.key] = this.val;
  return this;
};

Validator.prototype.isUuid = function(tip) {
  if (!validator.isUUID(this.val))
    this.throwError(tip || util.format('%s must be a UUID', this.key));
  this.vals[this.key] = this.val;
  return this;
};

// If value is not already an array, puts it in a singleton array
Validator.prototype.toArray = function(tip) {
  this.val = _.isUndefined(this.val) ? [] : this.val;
  this.val = (_.isArray(this.val) ? this.val : [this.val]);
  this.vals[this.key] = this.val;
  return this;
};

// Converts value to array if it's not already an array,
// and then converts every item in the array to an integer
// throwing if any of them fail conversion
Validator.prototype.toInts = function(tip) {
  this.toArray();
  if (!_.every(this.val, validator.isInt))
    this.throwError(tip || this.key + ' must be an array of integers');
  var results = this.val.map(function(v) {
    return parseInt(v, 10);
  });
  this.vals[this.key] = this.val = results;
  return this;
};

// Converts value to array if necessary, then de-dupes it
Validator.prototype.uniq = function(tip) {
  this.toArray();
  this.vals[this.key] = this.val = _.uniq(this.val);
  return this;
};

// Converts value to boolean
// Always succeeds
Validator.prototype.toBoolean = function() {
  this.vals[this.key] = this.val = !!this.val;
  return this;
};

// Converts value to float, throwing if it fails
Validator.prototype.toFloat = function(tip) {
  var result = parseFloat(this.val);
  if (_.isNaN(result))
    this.throwError(tip || this.key + ' must be a float');
  this.vals[this.key] = this.val = result;
  return this;
};

// Converts value to string
// Undefined value converts to empty string
// Always succeeds
Validator.prototype.toString = function() {
  this.vals[this.key] = this.val = (this.val && this.val.toString() || '');
  return this;
};

// Converts value to lowercase string
// If there is no value, it's converted into a string
// If value is not a string, it's converted into a string
// Always succeeds
Validator.prototype.toLowerCase = function() {
  this.toString();
  this.vals[this.key] = this.val = this.val.toLowerCase();
  return this;
};

// Converts value to uppercase string
// Read toLowerCase comment for more info
// Always succeeds
Validator.prototype.toUpperCase = function() {
  this.toString();
  this.vals[this.key] = this.val = this.val.toUpperCase();
  return this;
};

// Converts value into a trimmed string
// Always succeeds
Validator.prototype.trim = function() {
  this.toString();
  this.vals[this.key] = this.val = this.val.trim();
  return this;
};

// Assert that value does not match the supplied regular expression.
Validator.prototype.notMatch = function(regexp, tip) {
  if (regexp.test(this.val))
    this.throwError(tip || 'Invalid ' + this.key);

  this.vals[this.key] = this.val;
  return this;
};

// Assert that a string does match the supplied regular expression.
Validator.prototype.match = function(regexp, tip) {
  if (!regexp.test(this.val))
    this.throwError(tip || 'Invalid ' + this.key);

  this.vals[this.key] = this.val;
  return this;
};

Validator.prototype.check = function(result, tip) {
  if (!result)
    this.throwError(tip);

  this.vals[this.key] = this.val;
  return this;
};

Validator.prototype.checkNot = function(result, tip) {
  if (!!result)
    this.throwError(tip);

  this.vals[this.key] = this.val;
  return this;
};

Validator.prototype.fromJson = function(tip) {
  try {
    var parsedObj = JSON.parse(this.val);
  } catch(ex) {
    this.throwError(tip || 'Invalid JSON for ' + this.key);
  }
  this.vals[this.key] = this.val = parsedObj;
  return this;
};

// Arbitrarily transform the current value inside a validator.
//
// f is a function that takes one argument: the current value in the validator.
// Whatever value f returns becomes the new value.
Validator.prototype.tap = function(f) {
  var result;
  try {
    result = f.bind(this.ctx)(this.val);
  } catch(ex) {
    if (ex instanceof ValidationError)
      this.throwError();
    throw ex;
  }
  this.vals[this.key] = this.val = result;
  return this;
};

// Removes falsey/empty things. Always returns array.
Validator.prototype.compact = function() {
  this.vals[this.key] = _.compact(this.val);
  return this;
};

// Pipes val through predicate function that must return truthy
Validator.prototype.checkPred = function(pred, tip) {
  if (!pred(this.val))
    this.throwError(tip);

  this.vals[this.key] = this.val;
  return this;
};

Validator.prototype.checkNotPred = function(pred, tip) {
  if (pred(this.val))
    this.throwError(tip);

  this.vals[this.key] = this.val;
  return this;
};

// API ///////////////////////////////////////////////

exports.ValidationError = ValidationError;

exports.Validator = Validator;

exports.middleware = function middleware() {
  return function*(next) {
    debug('Initializing koa-bouncer');
    var self = this;
    this.vals = {};

    this.validateParam = function(key) {
      return new Validator({
        ctx: self,
        key: key,
        val: self.vals[key] || self.params[key],
        vals: self.vals,
        type: 'param'
      });
    };
    this.validateQuery = function(key) {
      return new Validator({
        ctx: self,
        key: key,
        val: self.vals[key] || self.query[key],
        vals: self.vals,
        type: 'query'
      });
    };
    this.validateBody = function(key) {
      return new Validator({
        ctx: self,
        key: key,
        val: self.vals[key] || self.request.body[key],
        vals: self.vals,
        type: 'body'
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

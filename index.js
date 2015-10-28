'use strict';

// Node
var util = require('util');
// 3rd party
var _ = require('lodash');
var debug = require('debug')('koa-bouncer');
var validator = require('validator');
var assert = require('better-assert');

// Number -> Bool
// ES6 introduces {MIN,MAX}_SAFE_INTEGER
//
// Exported only for testing
var isSafeInteger = exports.isSafeInteger = function(n) {
  return Number.MIN_SAFE_INTEGER <= n && n <= Number.MAX_SAFE_INTEGER;
};

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

// cannot be undefined
Validator.prototype.required = function(tip) {
  if (_.isUndefined(this.val))
    this.throwError(tip || this.key + ' must not be empty');
  return this;
};

// Ensures value is in given array
Validator.prototype.isIn = function(arr, tip) {
  assert(_.isArray(arr));
  if (!_.contains(arr, this.val))
    this.throwError(tip || 'Invalid ' + this.key);
  return this;
};

// Ensures value is not in given array
Validator.prototype.isNotIn = function(arr, tip) {
  assert(_.isArray(arr));
  if (_.contains(arr, this.val))
    this.throwError(tip || 'Invalid ' + this.key);
  return this;
};

// Ensures value is an array
Validator.prototype.isArray = function(tip) {
  if (!_.isArray(this.val))
    this.throwError(tip || util.format('%s must be an array', this.key));
  return this;
};

// Ensures value is === equivalent to given value
Validator.prototype.eq = function(otherValue, tip) {
  if (this.val !== otherValue)
    this.throwError(tip || 'Invalid ' + this.key);
  return this;
};

// Ensures value > given value
Validator.prototype.gt = function(otherValue, tip) {
  assert(_.isNumber(this.val));
  assert(_.isNumber(otherValue));

  if (this.val <= otherValue)
    this.throwError(tip || 'Invalid ' + this.key);

  return this;
};

// Ensures value >= given value
Validator.prototype.gte = function(otherValue, tip) {
  assert(_.isNumber(this.val));
  assert(_.isNumber(otherValue));

  if (this.val < otherValue)
    this.throwError(tip || 'Invalid ' + this.key);

  return this;
};

// Ensures value < given value
Validator.prototype.lt = function(otherValue, tip) {
  assert(_.isNumber(this.val));
  assert(_.isNumber(otherValue));

  if (this.val >= otherValue)
    this.throwError(tip || 'Invalid ' + this.key);

  return this;
};

// Ensures value <= given value
Validator.prototype.lte = function(otherValue, tip) {
  assert(_.isNumber(this.val));
  assert(_.isNumber(otherValue));

  if (this.val > otherValue)
    this.throwError(tip || 'Invalid ' + this.key);

  return this;
};

// Ensures value's length is [min, max] inclusive
//
// Note: You must ensure this.val has a `.length` property before calling
// this method.
Validator.prototype.isLength = function(min, max, tip) {
  assert(!_.isUndefined(this.val.length));
  assert(Number.isInteger(min));
  assert(Number.isInteger(max));
  assert(min <= max);

  if (this.val.length < min || this.val.length > max)
    this.throwError(
      tip || util.format('%s must be %s-%s characters long', this.key, min, max)
    );

  return this;
};

// If value is undefined, set it to given value or to the value
// returned by a function.
Validator.prototype.defaultTo = function(valueOrFunction) {
  var val = this.val;
  if (_.isUndefined(this.val))
    if (_.isFunction(valueOrFunction))
      // Run fn with `this` bound to Koa context
      val = valueOrFunction.call(this.ctx);
    else
      val = valueOrFunction;

  this.vals[this.key] = this.val = val;
  return this;
};

Validator.prototype.isString = function(tip) {
  if (!_.isString(this.val)) {
    this.throwError(tip || util.format('%s must be a string', this.key));
  }

  return this;
};

// Checks if is already an integer (and type number), throws if its not
Validator.prototype.isInt = function(tip) {
  if (!Number.isInteger(this.val)) {
    this.throwError(tip || util.format('%s must be an integer', this.key));
  }

  if (!isSafeInteger(this.val)) {
    this.throwError(tip || util.format('%s is out of integer range', this.key));
  }

  return this;
};


// Converts value to integer, throwing if it fails
Validator.prototype.toInt = function(tip) {
  if (!validator.isInt(this.val)) {
    this.throwError(tip || util.format('%s must be an integer', this.key));
  }

  var num = Number.parseInt(this.val, 10);

  if (!isSafeInteger(num)) {
    this.throwError(tip || util.format('%s is out of integer range', this.key));
  }

  this.vals[this.key] = this.val = num;
  return this;
};

// general isNumber check
Validator.prototype.isFiniteNumber = function(tip) {
  if (!Number.isFinite(this.val))
    this.throwError(tip || util.format('%s must be a number', this.key));

  return this;
};

// If value is not already an array, puts it in a singleton array
Validator.prototype.toArray = function() {
  this.val = _.isUndefined(this.val) ? [] : this.val;
  this.val = (_.isArray(this.val) ? this.val : [this.val]);
  this.vals[this.key] = this.val;
  return this;
};

// Converts value to array if it's not already an array,
// and then converts every item in the array to an integer
// throwing if any of them fail conversion
//
// '5abc' will cause ValidationError even though parseInt would
// parse it into 5. this is because you err on the side of being
// less lenient with user input.
Validator.prototype.toInts = function(tip) {
  assert(_.isArray(this.val));

  if (!_.every(this.val, validator.isInt)) {
    this.throwError(tip || this.key + ' must be an array of integers');
  }

  var results = this.val.map(function(v) {
    return parseInt(v, 10);
  });

  if (!_.every(results, isSafeInteger)) {
    this.throwError(tip || this.key + ' must not contain numbers out of integer range');
  }

  this.vals[this.key] = this.val = results;
  return this;
};

// Converts value to array if necessary, then de-dupes it
Validator.prototype.uniq = function() {
  assert(_.isArray(this.val));
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
  if (!validator.isFloat(this.val))
    this.throwError(tip || this.key + ' must be a float');
  var result = parseFloat(this.val);
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

// Converts value into a trimmed string
// Always succeeds
//
// TODO: Do I need this? user can just .tap(s => s.trim())
// but maybe just having it will remind people to trim user input?
// TODO: Maybe write a collapseWhitespace() function that collapses
// consecutive newlines/spaces spam
Validator.prototype.trim = function() {
  assert(_.isString(this.val));
  this.vals[this.key] = this.val = this.val.trim();
  return this;
};

// Assert that a string does match the supplied regular expression.
Validator.prototype.match = function(regexp, tip) {
  assert(_.isString(this.val));
  assert(_.isRegExp(regexp));

  if (!regexp.test(this.val))
    this.throwError(tip || 'Invalid ' + this.key);

  return this;
};

// Assert that value does not match the supplied regular expression.
Validator.prototype.notMatch = function(regexp, tip) {
  assert(_.isString(this.val));
  assert(_.isRegExp(regexp));

  if (regexp.test(this.val))
    this.throwError(tip || 'Invalid ' + this.key);

  return this;
};

Validator.prototype.check = function(result, tip) {
  if (!result)
    this.throwError(tip);

  return this;
};

Validator.prototype.checkNot = function(result, tip) {
  if (result)
    this.throwError(tip);

  return this;
};

Validator.prototype.fromJson = function(tip) {
  var parsedObj;
  try {
    parsedObj = JSON.parse(this.val);
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
  assert(_.isFunction(f));

  var result;
  try {
    result = f.bind(this.ctx)(this.val);
  } catch(ex) {
    if (ex instanceof ValidationError)
      this.throwError(); // why is this empty
    throw ex;
  }

  this.vals[this.key] = this.val = result;
  return this;
};

// Pipes val through predicate function that must return truthy
Validator.prototype.checkPred = function(pred, tip) {
  assert(_.isFunction(pred));

  if (!pred.call(this.ctx, this.val))
    this.throwError(tip);

  return this;
};

Validator.prototype.checkNotPred = function(pred, tip) {
  assert(_.isFunction(pred));

  if (pred.call(this.ctx, this.val))
    this.throwError(tip);

  return this;
};

// API ///////////////////////////////////////////////

exports.ValidationError = ValidationError;

exports.Validator = Validator;

exports.middleware = function middleware(opts) {
  opts = opts || {};

  // default ctx getters that user can override
  // they should take the Koa context and return an object
  opts.getParams = opts.getParams || function(ctx) { return ctx.params; };
  opts.getQuery = opts.getQuery || function(ctx) { return ctx.query; };
  opts.getBody = opts.getBody || function(ctx) { return ctx.request.body; };

  return function*(next) {
    debug('Initializing koa-bouncer');
    var self = this;
    this.vals = {};

    this.validateParam = function(key) {
      return new Validator({
        ctx: self,
        key: key,
        val: self.vals[key] === undefined ? opts.getParams(self)[key] : self.vals[key],
        vals: self.vals,
        type: 'param'
      });
    };
    this.validateQuery = function(key) {
      return new Validator({
        ctx: self,
        key: key,
        val: self.vals[key] === undefined ? opts.getQuery(self)[key] : self.vals[key],
        vals: self.vals,
        type: 'query'
      });
    };
    this.validateBody = function(key) {
      return new Validator({
        ctx: self,
        key: key,
        val: self.vals[key] === undefined ? opts.getBody(self)[key] : self.vals[key],
        vals: self.vals,
        type: 'body'
      });
    };
    this.validate = this.check = function(result, tip) {
      if (!result)
        throw new ValidationError(null, tip);
    };
    this.validateNot = this.checkNot = function(result, tip) {
      if (result)
        throw new ValidationError(null, tip);
    };
    yield next;
  };
};

'use strict'

// Node
const util = require('util')
// 3rd party
const _ = require('lodash')
const debug = require('debug')('koa-bouncer')
const v = require('validator')
const assert = require('better-assert')

// Number -> Bool
// ES6 introduces {MIN,MAX}_SAFE_INTEGER
//
// Exported only for testing
const isSafeInteger = (exports.isSafeInteger = function(n) {
  return Number.MIN_SAFE_INTEGER <= n && n <= Number.MAX_SAFE_INTEGER
})

// String | Number -> Bool
//
// Works on numbers because .toString() is called on them
const isIntString = (function() {
  const re = /^(?:[-+]?(?:0|[1-9][0-9]*))$/
  return function isIntString(str) {
    assert(_.isString(str) || _.isNumber(str))
    return re.test(str)
  }
})()

// String | Number -> Bool
//
// Use this when you want to use Number.parseFloat to parse numbers
// but do not want to parse things like '5e3' or 'Infinity'.
// Rather just plain ol decimal numbers like '+4.55' and '-6.0001'
//
// Works on numbers because .toString() is called on them
const isDecimalString = (function() {
  const re = /^[-+]?([0-9]+|\.[0-9]+|[0-9]+\.[0-9]+)$/
  return function isDecimalString(str) {
    assert(_.isString(str) || _.isNumber(str))
    return re.test(str)
  }
})()

function ValidationError(key, message) {
  this.name = 'ValidationError'
  this.message = message
  this.bouncer = {
    key: key,
    message: message,
  }
}
ValidationError.prototype = _.create(Error.prototype)

function Validator(props) {
  this.ctx = props.ctx // Koa context
  this.key = props.key
  this.vals = props.vals
  this.throwError = function(tip) {
    throw new ValidationError(this.key, tip || 'Invalid value for ' + this.key)
  }

  // get current contained value
  this.val = () => {
    return this.vals[this.key]
  }

  // set contained value
  this.set = newVal => {
    this.vals[this.key] = newVal
    return this
  }

  this._isOptional = false
  this.isOptional = () => {
    // TODO: Clean this up
    if (this._isOptional) {
      if (_.isString(this.val()) && this.val().trim().length === 0) {
        //this.set(null);
        return this._isOptional
      } else if (!_.isUndefined(this.val())) {
        this._isOptional = false
      }
    }

    return this._isOptional
  }

  // set props.val to define an initial val when instantiating a validator
  //
  // Populate vals on init
  // Ex: this.validateBody('foo') will populate this.vals.foo
  //     with this.request.body.foo (even if undefined)
  this.vals[this.key] = props.val
}

////////////////////////////////////////////////////////////

// wrap prototype functions with this if they should noop
// if the Validator is in optional state
function optionalFn(fn) {
  return function() {
    if (this.isOptional()) {
      return this
    }

    return fn.apply(this, arguments)
  }
}

// add prototype methods to the Validator function with this
// if you want the method to noop when Validator is in optional state
Validator.addMethod = function(name, fn) {
  Validator.prototype[name] = optionalFn(fn)
}

////////////////////////////////////////////////////////////
// Core methods
//
// Everything is built on top of these basic methods.
////////////////////////////////////////////////////////////

Validator.addMethod('check', function(result, tip) {
  if (!Boolean(result)) this.throwError(tip)
  return this
})

Validator.addMethod('checkNot', function(result, tip) {
  if (Boolean(result)) this.throwError(tip)
  return this
})

// Pipes val through predicate function that must return truthy
Validator.addMethod('checkPred', function(pred, tip) {
  assert(_.isFunction(pred))
  this.check(pred.call(this.ctx, this.val()), tip)
  return this
})

Validator.addMethod('checkNotPred', function(pred, tip) {
  assert(_.isFunction(pred))
  this.checkNot(pred.call(this.ctx, this.val()), tip)
  return this
})

// Arbitrarily transform the current value inside a validator.
//
// f is a function that takes one argument: the current value in the validator.
// Whatever value f returns becomes the new value.
Validator.addMethod('tap', function(f, tip) {
  assert(_.isFunction(f))

  let result
  try {
    result = f.call(this.ctx, this.val())
  } catch (err) {
    if (err instanceof ValidationError) this.throwError(tip)
    throw err
  }

  this.set(result)
  return this
})

////////////////////////////////////////////////////////////
// General built-in methods
////////////////////////////////////////////////////////////

// cannot be undefined
Validator.prototype.required = function(tip) {
  this.checkNotPred(_.isUndefined, tip || this.key + ' is required')
  return this
}

Validator.prototype.optional = function() {
  // TODO: Clean this up
  if (_.isString(this.val()) && this.val().trim().length === 0) {
    delete this.vals[this.key]
    this._isOptional = true
  } else if (_.isUndefined(this.val())) {
    this._isOptional = true
  }

  return this
}

Validator.addMethod('isIn', function(arr, tip) {
  assert(_.isArray(arr))
  this.checkPred(val => _.includes(arr, val), tip)
  return this
})

// Ensures value is not in given array
Validator.addMethod('isNotIn', function(arr, tip) {
  assert(_.isArray(arr))
  this.checkNotPred(val => _.includes(arr, val), tip)
  return this
})

// Ensures value is an array
Validator.addMethod('isArray', function(tip) {
  this.checkPred(_.isArray, tip || this.key + ' must be an array')
  return this
})

// Ensures value is === equivalent to given value
Validator.addMethod('eq', function(otherVal, tip) {
  this.checkPred(val => val === otherVal, tip)
  return this
})

// Ensures value > given value
Validator.addMethod('gt', function(otherVal, tip) {
  assert(_.isNumber(this.val()))
  assert(_.isNumber(otherVal))
  this.checkPred(val => val > otherVal, tip)
  return this
})

// Ensures value >= given value
Validator.addMethod('gte', function(otherVal, tip) {
  assert(_.isNumber(this.val()))
  assert(_.isNumber(otherVal))
  this.checkPred(val => val >= otherVal, tip)
  return this
})

// Ensures value < given value
Validator.addMethod('lt', function(otherVal, tip) {
  assert(_.isNumber(this.val()))
  assert(_.isNumber(otherVal))
  this.checkPred(val => val < otherVal, tip)
  return this
})

// Ensures value <= given value
Validator.addMethod('lte', function(otherVal, tip) {
  assert(_.isNumber(this.val()))
  assert(_.isNumber(otherVal))
  this.checkPred(val => val <= otherVal, tip)
  return this
})

// Ensures value's length is [min, max] inclusive
Validator.addMethod('isLength', function(min, max, tip) {
  assert(!_.isUndefined(this.val().length))
  assert(Number.isInteger(min))
  assert(Number.isInteger(max))
  assert(min <= max)
  tip = tip || `${this.key} must be ${min}-${max} characters long`
  this.checkPred(val => val.length >= min, tip)
  this.checkPred(val => val.length <= max, tip)
  return this
})

// If value is undefined, set it to given value or to the value
// returned by a function.
Validator.addMethod('defaultTo', function(valueOrFunction) {
  if (!_.isUndefined(this.val())) return this
  if (_.isFunction(valueOrFunction)) {
    // Run fn with `this` bound to Koa context
    this.set(valueOrFunction.call(this.ctx))
  } else {
    this.set(valueOrFunction)
  }
  return this
})

Validator.addMethod('isString', function(tip) {
  this.checkPred(_.isString, tip || this.key + ' must be a string')
  return this
})

// Checks if is already an integer (and type number), throws if its not
Validator.addMethod('isInt', function(tip) {
  this.checkPred(Number.isInteger, tip || this.key + ' must be an integer')
  this.checkPred(isSafeInteger, tip || this.key + ' is out of integer range')
  return this
})

// Converts value to integer, throwing if it fails
Validator.addMethod('toInt', function(tip) {
  this.checkPred(isIntString, tip || this.key + ' must be an integer')
  const num = Number.parseInt(this.val(), 10)
  this.check(isSafeInteger(num), tip || this.key + ' is out of integer range')
  this.set(num)
  return this
})

// general isNumber check
//
// Note that there are difference betweent he global `isFinite` fn
// and the new ES6 `Number.isFinite` fn.
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/isFinite
Validator.addMethod('isFiniteNumber', function(tip) {
  this.checkPred(Number.isFinite, tip || this.key + ' must be a number')
  return this
})

// If value is not already an array, puts it in a singleton array
Validator.addMethod('toArray', function() {
  this.defaultTo([])
  this.tap(x => (_.isArray(x) ? x : [x]))
  return this
})

// Converts every item in array to an integer.
// Throws if any do not convert or are not within safe integer range.
//
// '5abc' will cause ValidationError even though parseInt would
// parse it into 5. this is because you err on the side of being
// less lenient with user input.
Validator.addMethod('toInts', function(tip) {
  this.defaultTo([])
  this.checkPred(
    val => _.every(val, isIntString),
    tip || this.key + ' must be array of integers'
  )
  const results = this.val().map(val => parseInt(val, 10))
  this.check(
    _.every(results, isSafeInteger),
    tip || this.key + 'must not contain numbers out of integer range'
  )
  this.set(results)
  return this
})

Validator.addMethod('uniq', function() {
  assert(_.isArray(this.val()))
  this.tap(_.uniq)
  return this
})

Validator.addMethod('toBoolean', function() {
  this.tap(Boolean)
  return this
})

Validator.addMethod('toDecimal', function(tip) {
  this.checkPred(isDecimalString, tip || this.key + ' must be a decimal number')
  this.set(Number.parseFloat(this.val()))
  return this
})

// returns true if v is already a float or if it's a string
// that can parse into a float.
function isFloatIncludingInfinity(x) {
  // If it already is a float
  if (typeof x === 'number' && !Number.isNaN(x)) {
    return true
  }
  // If it's a string, use v.isFloat which ensures it doesn't have
  // illegal float characters like "124abc" even though Number.parseFloat
  // could parse it into 124.
  if (typeof x === 'string') {
    x = x.trim()
    if (x === 'Infinity' || x === '-Infinity') {
      return true
    } else {
      return v.isFloat(x)
    }
  }
  return false
}

Validator.addMethod('toFloat', function(tip) {
  this.checkPred(isFloatIncludingInfinity, tip || this.key + ' must be a float')
  this.set(Number.parseFloat(this.val()))
  return this
})

Validator.addMethod('toFiniteFloat', function() {
  return this.toFloat().isFiniteNumber()
})

Validator.addMethod('toString', function() {
  this.set((this.val() && this.val().toString()) || '')
  return this
})

Validator.addMethod('trim', function() {
  assert(_.isString(this.val()))
  this.tap(x => x.trim())
  return this
})

Validator.addMethod('match', function(regexp, tip) {
  assert(_.isString(this.val()))
  assert(_.isRegExp(regexp))
  this.checkPred(val => regexp.test(val), tip)
  return this
})

Validator.addMethod('notMatch', function(regexp, tip) {
  assert(_.isString(this.val()))
  assert(_.isRegExp(regexp))
  this.checkNotPred(val => regexp.test(val), tip)
  return this
})

Validator.addMethod('fromJson', function(tip) {
  assert(_.isString(this.val()))

  let parsedObj
  try {
    parsedObj = JSON.parse(this.val())
  } catch (ex) {
    this.throwError(tip || 'Invalid JSON for ' + this.key)
  }

  this.set(parsedObj)
  return this
})

////////////////////////////////////////////////////////////
// More specific validator methods
////////////////////////////////////////////////////////////

Validator.addMethod(
  'isAlpha',
  (function() {
    const re = /^[a-z]*$/i
    return function isAlpha(tip) {
      tip = tip || this.key + ' must only contain chars a-z'
      this.isString(tip)
      this.checkPred(val => re.test(val), tip)
      return this
    }
  })()
)

Validator.addMethod(
  'isAlphanumeric',
  (function() {
    const re = /^[a-z0-9]*$/i
    return function isAlphanumeric(tip) {
      tip = tip || this.key + ' must must be alphanumeric (a-z, 0-9)'
      this.isString(tip)
      this.checkPred(val => re.test(val), tip)
      return this
    }
  })()
)

Validator.addMethod(
  'isNumeric',
  (function() {
    const re = /^[0-9]*$/
    return function isNumeric(tip) {
      tip = tip || this.key + ' must must only contain numbers'
      this.isString(tip)
      this.checkPred(val => re.test(val), tip)
      return this
    }
  })()
)

Validator.addMethod(
  'isAscii',
  (function() {
    const re = /^[\x00-\x7F]*$/
    return function isAscii(tip) {
      tip = tip || this.key + ' must contain only ASCII chars'
      this.isString(tip)
      this.checkPred(val => re.test(val), tip)
      return this
    }
  })()
)

Validator.addMethod('isBase64', function(tip) {
  tip = tip || this.key + ' must be base64 encoded'
  this.isString(tip)
  if (this.val().length === 0) return this
  this.checkPred(v.isBase64, tip)
  return this
})

// TODO: Add support to validator's `options` into isEmail
Validator.addMethod('isEmail', function(tip) {
  tip = tip || this.key + ' must be a valid email address'
  this.isString(tip)
  this.checkPred(v.isEmail, tip)
  return this
})

Validator.addMethod(
  'isHexColor',
  (function() {
    const re = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i
    return function isHexColor(tip) {
      tip = tip || this.key + ' must be a hex color'
      this.isString(tip)
      this.checkPred(val => re.test(val), tip)
      return this
    }
  })()
)

//.isUuid('v4', 'must be uuid');
//.isUuid('must be uuid');
//.isUuid('v4');
//.isUuid();
Validator.addMethod(
  'isUuid',
  (function() {
    const re = {
      v3: /^[0-9A-F]{8}-[0-9A-F]{4}-3[0-9A-F]{3}-[0-9A-F]{4}-[0-9A-F]{12}$/i,
      v4: /^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i,
      v5: /^[0-9A-F]{8}-[0-9A-F]{4}-5[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i,
      all: /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i,
    }
    return function isUuid(version, tip) {
      if (_.isString(version) && _.isUndefined(tip)) {
        // Handle .isUuid('must be uuid') and .isUuid('v4')
        if (!_.includes(['v3', 'v4', 'v5', 'all'], version)) {
          // Handle: .isUuid('must be uuid')
          tip = version
          version = 'all'
        }
      } else if (_.isUndefined(version) && _.isUndefined(tip)) {
        // Handle: .isUuid()
        version = 'all'
      }

      tip =
        tip || this.key + ' must be a UUID' + (version !== 'all' ? version : '')

      this.isString(tip)
      this.checkPred(val => re[version].test(val), tip)
      return this
    }
  })()
)

Validator.addMethod('isJson', function(tip) {
  tip = tip || this.key + ' must be JSON'
  this.isString(tip)
  try {
    JSON.parse(this.val())
  } catch (err) {
    this.throwError(tip)
  }
  return this
})

Validator.addMethod('encodeBase64', function(tip) {
  this.isString(tip)
  this.tap(val => new Buffer(val).toString('base64'), tip)
  return this
})

Validator.addMethod('decodeBase64', function(tip) {
  tip = tip || this.key + ' must be base64 encoded'
  this.isString(tip)
  if (this.val().length === 0) return this
  this.isBase64(tip)
  this.tap(val => new Buffer(val, 'base64').toString())
  return this
})

Validator.addMethod('clamp', function(min, max) {
  assert(_.isNumber(this.val()))
  assert(_.isNumber(min))
  assert(_.isNumber(max))
  assert(min <= max)
  this.tap(val => (val < min ? min : val))
  this.tap(val => (val > max ? max : val))
  return this
})

////////////////////////////////////////////////////////////
// API
////////////////////////////////////////////////////////////

exports.ValidationError = ValidationError

exports.Validator = Validator

exports.middleware = function middleware(opts = {}) {
  // default ctx getters that user can override
  // they should take the Koa context and return an object
  opts.getParams = opts.getParams || (ctx => ctx.params)
  opts.getQuery = opts.getQuery || (ctx => ctx.query)
  opts.getBody = opts.getBody || (ctx => ctx.request.body)

  return function(ctx, next) {
    debug('Initializing koa-bouncer')
    ctx.vals = {}

    // we save initialized validators for the duration of the request
    // so that multiple calls to, example, this.validateBody('foo')
    // will return the same validator
    const validators = new Map()

    ctx.validateParam = function(key) {
      return (
        validators.get(key) ||
        validators
          .set(
            key,
            new Validator({
              ctx,
              key: key,
              val:
                ctx.vals[key] === undefined
                  ? _.get(opts.getParams(ctx), key)
                  : ctx.vals[key],
              vals: ctx.vals,
            })
          )
          .get(key)
      )
    }

    ctx.validateQuery = function(key) {
      return (
        validators.get(key) ||
        validators
          .set(
            key,
            new Validator({
              ctx,
              key: key,
              val:
                ctx.vals[key] === undefined
                  ? _.get(opts.getQuery(ctx), key)
                  : ctx.vals[key],
              vals: ctx.vals,
            })
          )
          .get(key)
      )
    }

    ctx.validateBody = function(key) {
      return (
        validators.get(key) ||
        validators
          .set(
            key,
            new Validator({
              ctx,
              key: key,
              val:
                ctx.vals[key] === undefined
                  ? _.get(opts.getBody(ctx), key)
                  : ctx.vals[key],
              vals: ctx.vals,
            })
          )
          .get(key)
      )
    }

    ctx.check = function(result, tip) {
      if (!result) throw new ValidationError(null, tip)
    }

    ctx.checkNot = function(result, tip) {
      if (result) throw new ValidationError(null, tip)
    }

    return next()
  }
}

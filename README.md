<img src="bouncer-beagle.png" align="right" height="256" hspace="5px">

# koa-bouncer

[![Build Status](https://travis-ci.org/danneu/koa-bouncer.svg?branch=master)](https://travis-ci.org/danneu/koa-bouncer)
[![NPM version](https://badge.fury.io/js/koa-bouncer.svg)](http://badge.fury.io/js/koa-bouncer)
[![Dependency Status](https://david-dm.org/danneu/koa-bouncer.svg)](https://david-dm.org/danneu/koa-bouncer)

[![NPM](https://nodei.co/npm/koa-bouncer.png?downloads=true&downloadRank=true&stars=true)](https://nodei.co/npm/koa-bouncer/)

An http parameter validation library for [Koa](http://koajs.com) web apps.

    npm install --save koa-bouncer

Inspired by [RocksonZeta](https://github.com/RocksonZeta/koa-validate).

Works best with [koa-router](https://github.com/alexmingoia/koa-router)
for routing.

If you'd like to see how koa-bouncer looks in a real (demo) Koa application,
check out my [koa-skeleton](https://github.com/danneu/koa-skeleton) repository.
<br style="clear: both;">

## Example

Using koa-router for routing

``` javascript
const Koa = require('koa');
const Router = require('koa-router')
const bouncer = require('koa-bouncer');
const app = new Koa();
const router = new Router();

// extends the Koa context with some methods
app.use(bouncer.middleware());

// POST /users - create user endpoint
router.post('/users', async (ctx) => {

  // validate input

  ctx.validateBody('uname')
    .required('Username required')
    .isString()
    .trim()

  ctx.validateBody('email')
    .optional()
    .isString()
    .trim()
    .isEmail('Invalid email format')

  ctx.validateBody('password1')
    .required('Password required')
    .isString()
    .isLength(6, 100, 'Password must be 6-100 chars')

  ctx.validateBody('password2')
    .required('Password confirmation required')
    .isString()
    .eq(ctx.vals.password1, 'Passwords must match')

  // running database query last to give the other validations a chance to fail
  ctx.validateBody('uname')
    .check(await db.findUserByUname(ctx.vals.uname), 'Username taken')

  // if we get this far, then validation succeeded.

  // the validation populates a `ctx.vals` object with validated values
  //=> { uname: 'foo', password1: 'secret', password2: 'secret' }
  console.log(ctx.vals)

  const user = await db.insertUser({
    uname: ctx.vals.uname,
    email: ctx.vals.email,
    password: ctx.vals.password1
  })

  ctx.redirect(`/users/${user.id}`)
})

app
  .use(router.routes())
  .use(router.allowedMethods());
  
```

## The general idea

The idea is that koa-bouncer exposes methods that transform and
assert against user-input (form submissions, request bodies,
query strings) within your routes.

If an assertion fails, then koa-bouncer throws a `bouncer.ValidationError`
that you can catch upstream. For example, maybe you want to redirect back
to the form, show a tip, and repopulate the form with the user's progress.

If validation succeeds, then you can access the validated/transformed
parameters in a `ctx.vals` map that gets populated during validation.

## Usage

First, you need to inject bouncer's middleware:

``` javascript
bouncer.middleware(opts)
```

This extends the Koa context with these methods for you to use in routes,
the bulk of the koa-bouncer abstraction:

- `ctx.validateParam(key)     => Validator`
- `ctx.validateQuery(key)     => Validator`
- `ctx.validateBody(key)      => Validator`
- `ctx.check(value, [tip])    => throws ValidationError if falsey`
- `ctx.checkNot(value, [tip]) => throws ValidationError if truthy`

The first three methods return a validator that targets the value
in the url param, query param, or body param that you specified with 'key'.

When you spawn a validator, it immediately populates `ctx.vals[key]` with
the initial value of the parameter. You can then chain methods like
`.toString().trim().isEmail()` to transform the value in `ctx.vals` and
make assertions against it.

Just by calling these methods, they will begin populating `ctx.vals`:

``` javascript
router.get('/search', async (ctx) => {
  ctx.validateQuery('keyword')
  ctx.validateQuery('sort')
  ctx.body = JSON.stringify(ctx.vals)
})
```

``` bash
curl http://localhost:3000/search
=> {}

curl http://localhost:3000/search?sort=age
=> { "sort": "age" }
```

We can use `.required()` to throw a ValidationError when the parameter is
undefined. For example, we can decide that you must always supply a
?keyword= to our search endpoint.

And we can use `.optional()` to only run the chained validations/assertions
if the parameter is undefined (not given by user) or if it is an empty
string.

``` javascript
router.get('/search', async (ctx) => {
  ctx.validateQuery('keyword').required().isString().trim()
  ctx.validateQuery('sort').toArray()
  ctx.body = JSON.stringify(ctx.vals)
})
```

``` bash
curl http://localhost:3000/search
=> Uncaught ValidationError

curl http://localhost:3000/search?keyword=hello
=> { "keyword": "hello", "sort": [] }

curl http://localhost:3000/search?keyword=hello&sort=age
=> { "keyword": "hello", "sort": ["age"] }

curl http://localhost:3000/search?keyword=hello&sort=age&sort=height
=> { "keyword": "hello", "sort": ["age", "height"] }
```

If a validation fails, then the validator throws a bouncer.ValidationError
that we can catch with upstream middleware.

For example, we can decide that upon validation error, we redirect the user
back to whatever the previous page was and populate a temporary flash
object with the error and their parameters so that we can repopulate the form.

``` javascript
app.use(async (ctx, next) => {
  try {
    await next();
  } catch(err) {
    if (err instanceof bouncer.ValidationError) {
      ctx.flash = {
        message: ['danger', err.message],
        params: ctx.request.body
      };
      return ctx.redirect('back');
    }
    throw err;
  }
});

router.post('/users', async (ctx) => {
  ctx.validateBody('username')
    .required('Username is required')
    .isString()
    .trim()
    .isLength(3, 15, 'Username must be 3-15 chars');

  const user = await database.insertUser(ctx.vals.username);
  ctx.body = 'You successfully registered';
});
```

``` bash
http --form POST localhost:3000/users
=> 302 Redirect to GET /users, message='Username is required'

http --form POST localhost:3000/users username=bo
=> 302 Redirect to GET /users, message='Username must be 3-15 chars'

http --form POST localhost:3000/users username=freeman
=> 200 OK, You successfully registered
```

You can pass options into the `bouncer.middleware()` function.

Here are the default ones:

``` javascript
app.use(bouncer.middleware({
  getParams({params}) { return params; },
  getQuery({query}) { return query; },
  getBody({request}) { return request.body; }
}));
```

You can override these if the validators need to look in a different place
to fetch the respective keys when calling the `validateParam`, `validateQuery`,
and `validateBody` methods.

You can always define custom validators via `Validator.addMethod`:

``` javascript
const Validator = require('koa-bouncer').Validator;

Validator.addMethod('isValidBitcoinAddress', function(tip = 'Invalid Bitcoin address') {
  // Will thread the tip through the nested assertions
  this
    .isString(tip)
    .trim()
    // Must be alphanumeric from start to finish
    .match(/^[a-z0-9]+$/i, tip)
    // But must not contain any of these chars
    .notMatch(/[0O1l]/, tip);

  return this;
});
```

Maybe put that in a `custom_validations.js` file and remember to load it.

Now you can use the custom validator method in a route or middleware:

``` javascript
ctx.validateBody('address')
  .required()
  .isValidBitcoinAddress();
```

These chains always return the underlying validator instance. You can access
its value at any instant with `.val()`.

``` javascript
const validator = ctx.validateBody('address')
  .required()
  .isValidBitcoinAddress();

console.log("current value of ctx.vals['address'] is", validator.val());
```

Here's how you'd write a validator method that transforms the underlying value:

``` javascript
Validator.addMethod('add10', function() {
  this.tap(val => val + 10);
  return this;
});
```

In other words, just use `this.set(newVal)` to update the object
of validated params. And remember to return `this` so that you can continue
chaining things on to the validator.

## Validator methods

#### .val()

Returns the current value currently inside the validator.

``` javascript
router.get('/search', async (ctx) => {
  const validator1 = ctx.validateQuery('q').required();
  const validator2 = ctx.validateQuery('sort').optional();

  ctx.body = JSON.stringify([validator1.val(), validator2.val()]);
});
```

``` bash
curl http://localhost:3000/search?q=hello&sort=created_at
// 200 OK ["hello", "created_at"]
```

I rarely use this method inside a route and prefer to access
values from the `ctx.vals` object. So far I only use it internally when
implementing validator functions.

#### .required([tip])

Only fails if val is `undefined`. Required the user to at least provie

``` javascript
ctx.validateBody('username')
  .required('Must provide username')
```

#### .optional()

If val is `undefined` or if it an empty string (after being trimmed)
at this point, then skip over the rest of the methods.

This is so that you can validate a val only if user provided one.

``` javascript
ctx.validateBody('email')
  .optional()
  .isEmail('Invalid email format') // Only called if ctx.request.body is `undefined`
```

``` javascript
ctx.validateBody('email')
  .tap(x => 'hello@example.com')
  .optional()
  .isEmail()  // Always called since we are ensuring that val is always defined
```

Mutating `ctx.vals` to define a val inside an optional validator will
turn off the validator's `validator.isOptional()` flag.

``` javascript
ctx.validateBody('email').optional();
ctx.vals.email = 'hello@example.com';
ctx.validateBody('email').isEmail();  // This will run
```

You can see the optional state of a validator with its `.isOptional()` method:

``` javascript
const validator = ctx.validateBody('email').optional();
console.log(validator.isOptional());  //=> true
ctx.vals.email = 'hello@example.com';
console.log(validator.isOptional());  //=> false
validator.isEmail();  // This will run
```

The reason koa-bouncer considers empty strings to be unset (instead of
just `undefined`) is because the browser sends empty strings for
text inputs. This is usually the behavior you want.

Also, note that `.required()` only fails if the value is `undefined`. It
succeeds on empty string. This is also usually the behavior you want.

#### .isIn(array, [tip])

Ensure val is included in given array (=== comparison).

``` javascript
ctx.validateBody('role')
  .required('Must provide a role')
  .isIn(['banned', 'member', 'mod', 'admin'], 'Invalid role')
```

#### .isNotIn(array, [tip])

Ensure val is not included in given array (=== comparison).

``` javascript
ctx.validateBody('favorite-fruit')
  .isNotIn(['apple', 'pomegranate'], 'You cannot choose forbidden fruit')
```

#### .defaultTo(defaultVal)

If val is `undefined`, set it to defaultVal.

``` javascript
ctx.validateBody('multiplier')
  .defaultTo(1.0)
  .toFiniteFloat('multiplier must be a valid number')
```

#### .isString([tip])

Ensure val is a string.

Note: Also works with strings created via `new String()`
where `typeof new String() === 'object'`.

``` javascript
ctx.validateBody('username')
  .isString()
```

It's a good practice to always call one of the `.is*` methods since
they add explicit clarity to the validation step.

#### .isArray([tip])

Ensure val is an Array.

``` javascript
ctx.validateQuery('recipients')
  .isArray('recipients must be an array')
```

``` bash
curl http://localhost:3000/?recipients=joey
=> ValidationError

curl http://localhost:3000/?recipients=joey&recipients=kate&recipients=max
=> 200 OK, ctx.vals => ['joey', 'kate', 'max']
```

Note: The previous example can be improved with `.toArray`.

``` javascript
ctx.validateQuery('recipients')
  .toArray()
  .isArray('recipients must be an array')
```

``` bash
curl http://localhost:3000/?recipients=joey
=> 200 OK, ctx.vals.recipients => ['joey']

curl http://localhost:3000/?recipients=joey&recipients=kate&recipients=max
=> 200 OK, ctx.vals.recipients => ['joey', 'kate', 'max']
```

#### .eq(otherVal::Number, [tip])

Ensures `val === otherVal`.

``` javascript
ctx.validateBody('house-edge')
  .eq(0.01, 'House edge must be 1%')
```

#### .gt(otherVal::Number, [tip])

Ensures `val > otherVal`.

``` javascript
ctx.validateBody('hp')
  .gt(0, 'Player must have 1 or more hit points')
```

#### .gte(otherVal::Number, [tip])

Ensures `val >= otherVal`.

``` javascript
ctx.validateBody('age')
  .gte(18, 'Must be 18 or older')
```

#### .lt(otherVal::Number, [tip])

Ensures `val < otherVal`.

``` javascript
ctx.validateBody('pet-count')
  .lt(10, 'You must have fewer than 10 pets')
```

#### .lte(otherVal::Number, [tip])

Ensures `val <= otherVal`.

``` javascript
ctx.validateBody('house-edge')
  .lte(0.10, 'House edge cannot be higher than 10%')
```

#### .isLength(min:Int, max:Int, [tip])

Ensure val is a number `min <= val <= max` (inclusive on both sides).

``` javascript
ctx.validateBody('username')
  .required('Username required')
  .isString()
  .trim()
  .isLength(3, 15, 'Username must be 3-15 chars long')
```

#### .isInt([tip])

Ensures val is already an integer and that it is within integer range
(`Number.MIN_SAFE_INTEGER <= val <= Number.MAX_SAFE_INTEGER`).

``` javascript
ctx.validateBody('age')
  .isInt('Age must be an integer')
```

#### .isFiniteNumber([tip])

Ensures that val is a number (float) but that it is not `Infinity`.

Note: This uses `Number.isFinite(val)` internally. Rather, it does *not*
use the global `isFinite(val)` function because `isFinite(val)` first
parses the number before checking if it is finite. `isFinite('42') => true`.

``` javascript
ctx.validateBody('num')
  .tap(n => Infinity)
  .isFiniteNumber()  // will always fail
```

#### .match(regexp::RegExp, [tip])

Ensures that val matches the given regular expression.

You must ensure that val is a string.

``` javascript
ctx.validateBody('username')
  .required('Username is required')
  .isString()
  .trim()
  .match(/^[a-z0-9_-]+$/i, 'Username must only contain a-z, 0-9, underscore, and hyphen')
```

Note: Remember to start your pattern with `^` ("start of string") and
end your pattern with `$` ("end of string") if val is supposed to
fully match the pattern.

#### .notMatch(regexp::RegExp, [tip])

Ensure that val does **not** match the given regexp.

You must ensure that val is a string.

Note: It is often useful to chain `.notMatch` after a `.match` to refine
the validation.

``` javascript
ctx.validateBody('username')
  .required('Username is required')
  .isString()
  .trim()
  .match(/^[a-z0-9_-]+$/i, 'Username must only contain a-z, 0-9, underscore, and hyphen')
  .notMatch(/admin/i, 'Username must not contain the word "admin" anywhere in it')
  .notMatch(/_{2,}/, 'Username must not contain consecutive underscores')
  .notMatch(/-{2,}/, 'Username must not contain consecutive hyphens')
```

#### .check(result, [tip]) and .checkNot(result, [tip])

Unlike most of the other validator methods, `.check` and `.checkNot` do not
every look at the current val. They only look at the truthy/falseyness of
the `result` you pass into them.

- `.check(result, [tip])` passes if `result` is truthy.
- `.checkNot(result, [tip])` passes if `result` is falsey.

They are a general-purpose tool for short-circuiting a validation, often
based on some external condition.

Example: Ensure username is not taken:

``` javascript
ctx.validateBody('username')
  .required('Username required')
  .isString()
  .trim()
  .checkNot(await database.findUserByUsername(ctx.vals.uname), 'Username taken')
```

Example: Ensure that the email system is online only if they provide an email:

``` javascript
ctx.validateBody('email')
  .optional()
  .check(config.EMAIL_SYSTEM_ONLINE, 'Email system not ready, please try later')
```

#### .checkPred(fn, [tip]) and .checkPredNot(fn, [tip])

Pipes val into given `fn` and checks the result.

- `.checkPred(fn, [tip])` ensures that `fn(val)` returns truthy.
- `.checkPredNot(fn, [tip])` ensures that `fn(val)` returns falsey.

These methods are general-purpose tools that let you make your own
arbitrary assertions on the val.

Example: Ad-hoc predicate function:

``` javascript
ctx.validateBody('num')
  .required()
  .toInt()
  .checkPred(n => n % 2 === 0, 'Your num must be divisible by two')
```

Example: Custom predicate function:

``` javascript
function isValidBitcoinAddress(addr) {
  // ...
}

ctx.validateBody('bitcoin-address')
  .required('Bitcoin address required')
  .isString()
  .trim()
  .checkPred(isValidBitcoinAddress, 'Invalid bitcoin address')
```

#### .isAlpha([tip])

Ensures that val is a string that contains only letters a-z (case insensitive).

``` javascript
ctx.validateBody('username')
  .required()
  .isString()
  .trim()
  .isAlpha()
```

#### .isAlphanumeric([tip])

Ensures that val is a string that contains only letters a-z (case insensitive)
and numbers 0-9.

``` javascript
ctx.validateBody('username')
  .required()
  .isString()
  .trim()
  .isAlphanumeric()
```

#### .isNumeric([tip])

Ensures that val is a string that contains only numbers 0-9.

``` javascript
ctx.validateBody('serial-number')
  .required()
  .isString()
  .trim()
  .isNumeric()
```

#### .isAscii([tip])

Ensures that val is a string that contains only
ASCII characters (https://es.wikipedia.org/wiki/ASCII).

In other words, val must only contain these characters:

    ! " # $ % & ' ( ) * + , - . / 0 1 2 3 4 5 6 7 8 9 : ; < = > ?
    @ A B C D E F G H I J K L M N O P Q R S T U V W X Y Z [ \ ] ^ _
    ` a b c d e f g h i j k l m n o p q r s t u v w x y z { | } ~

``` javascript
ctx.validateBody('command')
  .required()
  .isString()
  .trim()
  .isAscii()
```

#### .isBase64([tip])

Ensures that val is a base64-encoded string.

Note: An empty string (`""`) is considered valid.

``` javascript
ctx.validateBody('data')
  .required()
  .isString()
  .trim()
  .isBase64()
```

#### .isEmail([tip])

Ensures that val is a valid string email address.

``` javascript
ctx.validateBody('email')
  .optional()
  .isString()
  .trim()
  .isEmail()
```

#### .isHexColor([tip])

Ensures that val is a hex color string.

Accepts both 6-digit and 3-digit hex colors
with and without a leading '#' char.

These are all valid: `'#333333'`, `'#333'`, `333333`, `333`.

``` javascript
ctx.validateBody('background-color')
  .required()
  .isString()
  .trim()
  .isHexColor()
  .tap(x => x.startsWith('#') ? x : '#' + x)
```

#### .isUuid([version::String], [tip])

Ensure that val is a valid uuid string.

`version` can be one of `'v3'`, `'v4'`, `'v5'`, `'all'`. default is `'all'`.

koa-bouncer can handle any of these:

    .isUuid('v4', 'must be uuid v4');
    .isUuid('must be any uuid');
    .isUuid('v4');
    .isUuid();

``` javascript
router.get('/things/:uuid', async (ctx) => {
  ctx.validateParam('uuid')
    .isUuid('v3')

  const thing = await database.findThing(ctx.vals.uuid);
});
```

#### .isJson([tip])

Ensures that val is a valid, well-formed JSON string.

Works by simply wrapping `JSON.parse(val)` with a try/catch.

``` javascript
ctx.validateBody('data')
  .isJson()
```

------------------------------------------------------------

### Methods that convert/mutate the val

#### .set(newVal)

Sets val to arbitrary value `newVal`.

Used internally by validator methods to update the value. Can't think
of a reason you'd actually use it inside a route.

``` javascript
ctx.validateQuery('test')
  .set(42)
```

``` bash
curl http://localhost:3000
// 200 OK, ctx.vals.test => 42

curl http://localhost:3000/?test=foo
// 200 OK, ctx.vals.test => 42
```

Note: `.set(42)` is equivalent to `.tap(x => 42)`.

#### .toArray()

Converts val to an array if it is not already an array.

If val is not already an array, then it puts it into an array of one item.

If val is undefined, then sets it to empty array `[]`.

``` javascript
ctx.validateQuery('friends')
  .toArray()
  .isArray()  // Always succeeds
```

``` bash
curl http://localhost:3000/
// 200 OK, ctx.vals.friends => []

curl http://localhost:3000/?friends=joey
// 200 OK, ctx.vals.friends => ['joey']

curl http://localhost:3000/?friends=joey&friends=kate
// 200 OK, ctx.vals.friends => ['joey', 'kate']
```

#### .toInt([tip])

Parses and converts val into an integer.

Fails if val cannot be parsed into an integer or if it is out of
safe integer range.

Uses `parseInt(val, 10)`, so note that decimals and extraneous characters
will be truncated off the end of the value.

``` javascript
ctx.validateQuery('age')
  .required('Must provide your age')
  .toInt('Invalid age')
```

``` bash
curl http://localhost:3000/?age=42
// 200 OK, ctx.vals.age => 42

curl http://localhost:3000/?age=-42
// 200 OK, ctx.vals.age => -42 (parses negative integer)

curl http://localhost:3000/?age=42.123
// 200 OK, ctx.vals.age => 42 (truncation)

curl http://localhost:3000/?age=42abc
// 200 OK, ctx.vals.age => 42 (truncation)

curl http://localhost:3000/?age=9007199254740992
// ValidationError (out of integer range)
```

#### .toInts([tip])

Converts each string in val into an integer.

If val is undefined, sets it to empty array `[]`.

Fails if any item cannot be parsed into an integer or if any parse into
integers that are out of safe integer range.

``` javascript
ctx.validateQuery('guesses')
  .toInts('One of your guesses was invalid')
```

``` bash
curl http://localhost:3000/
// 200 OK, ctx.vals.guesses => []

curl http://localhost:3000/?guesses=42
// 200 OK, ctx.vals.guesses => [42]

curl http://localhost:3000/?guesses=42&guesses=100
// 200 OK, ctx.vals.guesses => [42, 100]

curl http://localhost:3000/?guesses=42&guesses=100&guesses=9007199254740992
// ValidationError (out of safe integer range)

curl http://localhost:3000/?guesses=abc
// ValidationError (one guess does not parse into an int because it is alpha)

curl http://localhost:3000/?guesses=1.2345
// ValidationError (one guess does not parse into an int because it is a decimal)
```

#### .uniq

Removes duplicate items from val which must be an array.

You must ensure that val is already an array.

``` javascript
ctx.validateQuery('nums')
  .toArray()
  .toInts()
  .uniq()
```

```bash
curl http://localhost:3000/?nums=42
// 200 OK, ctx.vals.nums => [42]

curl http://localhost:3000/?nums=42&nums=42&nums=42
// 200 OK, ctx.vals.nums => [42]
```

#### .toBoolean()

Coerces val into boolean `true` | `false`.

Simply uses `!!val`, so note that these will all coerce into `false`:

- Empty string `""`
- Zero `0`
- `null`
- `false`
- `undefined`

``` javascript
ctx.validateBody('remember-me')
  .toBoolean()
```

#### .toDecimal([tip])

Converts val to float, but ensures that it a plain ol decimal number.

In most application, you want this over .toFloat / .toFiniteFloat.

A parsed decimal will always pass a .isFiniteNumber() check.

``` javascript
ctx.validateBody('num')
  .toDecimal()
  .isFiniteNumber() // <-- Redundant
```

#### .toFloat([tip])

Converts val to float, throws if it fails.

Note: it uses `Number.parseFloat(val)` internally, so you will have to
chain `isFiniteNumber()` after it if you don't want `Infinity`:

- `Number.parseFloat('Infinity') => Infinity`
- `Number.parseFloat('5e3') => 5000`
- `Number.parseFloat('1e+50') => 1e+50`
- `Number.parseFloat('5abc') => 5`
- `Number.parseFloat('-5abc') => -5`
- `Number.parseFloat('5.123456789') => 5.123456789`

Use .toDecimal instead of .toFloat when you only want to allow decimal numbers
rather than the whole float shebang.

``` javascript
ctx.validateBody('num')
  .toFloat()
  .isFiniteNumber()
```

#### .toFiniteFloat([tip])

Shortcut for:

``` javascript
ctx.validateBody('num')
  .toFloat()
  .isFiniteNumber()
```

#### .toString()

Calls `val.toString()` or sets it to empty string `""` if it is falsey.

Note: If val is truthy but does not have a `.toString()` method,
like if val is `Object.create(null)`, then koa-bouncer will break since this
is undefined behavior that koa-bouncer does not want to make assumptions about.

**TODO**: Think of a use-case and then write an example.

#### .trim()

Trims whitespace off the left and right side of val which **must** be a string.

You almost always use this for string user-input (aside from passwords) since
leading/trailing whitespace is almost always a mistake or extraneous.

**You do not want to call it on the user's password** since space is perfectly
legal and if you trim user passwords you will hash a password that the
user did not input.

koa-bouncer will break if you do not ensure that val is a string when you
call `.trim()`.

``` javascript
ctx.validateBody('username')
  .required()
  .isString()
  .trim();
```

#### .fromJson([tip])

Parses val into a JSON object.

Fails if it is invalid JSON or if it is not a string.

``` javascript
ctx.validateBody('data')
  .required()
  .fromJson()
```

#### .tap(fn, [tip])

Passes val into given `fn` and sets val to the result of `fn(val)`.

General-purpose tool for transforming the val.

Almost all the validator methods that koa-bouncer provides are just convenience
methods on top of `.tap` and `.checkPred`, so use these methods to implement
your own logic as you please.

`fn` is called with `this` bound to the current validator instance.

`tip` is used if `fn(val)` throws a ValidationError error.

``` javascript
ctx.validateBody('direction')
  .required('Direction is required')
  .isString()
  .trim()
  .tap(x => x.toLowerCase())
  .isIn(['north', 'south', 'east', 'west'], 'Invalid direction')
```

``` bash
curl http://localhost:3000/?direction=WeST
=> 200 OK, ctx.vals.direction => 'west'
```

#### .encodeBase64([tip])

Converts val string into base64 encoded string.

Empty string encodes to empty string.

``` javascript
ctx.vals.message = 'hello';

ctx.validateBody('message')
  .encodeBase64()
  .val(); //=> 'aGVsbG8='
```

#### .decodeBase64([tip])

Decodes val string from base64 to string.

Empty string decodes to empty string.

``` javascript
ctx.vals.message = 'aGVsbG8=';

ctx.validateBody('message')
  .decodeBase64()
  .val(); //=> 'hello'
```

#### .clamp(min::Number, max::Number)

Defines a number range that val is restricted to. If val exceeds this range
in either direction, val is updated to the min or max of the range.

ie. If val < min, then val is set to min. If val > max, then val is set to max.

Note: You must first ensure that val is a number.

``` javascript
router.get('/users', async (ctx) => {
  ctx.validateQuery('per-page')
    .defaultTo(50)
    .toInt('per-page must be an integer')
    .clamp(10, 100);
});
```

``` bash
curl http://localhost:3000/users
// 200 OK, ctx.vals['per-page'] === 50

curl http://localhost:3000/users?per-page=25
// 200 OK, ctx.vals['per-page'] === 25 (not clamped since it's in range)

curl http://localhost:3000/users?per-page=5
// 200 OK, ctx.vals['per-page'] === 10 (clamped to min)

curl http://localhost:3000/users?per-page=350
// 200 OK, ctx.vals['per-page'] === 100 (clamped to max)
```

## Changelog

### 6.0.0

- Supports Koa 2 by default instead of Koa 1.

### 5.1.0

- Added `.toFiniteFloat`.

### 5.0.0

- `.optional()` now considers empty strings (after trimming) to be unset
instead of just `undefined` values.

## License

MIT

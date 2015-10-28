<img src="bouncer-beagle.png" align="right" height="256" hspace="5px">

# koa-bouncer

[![Build Status](https://travis-ci.org/danneu/koa-bouncer.svg?branch=master)](https://travis-ci.org/danneu/koa-bouncer)
[![NPM version](https://badge.fury.io/js/koa-bouncer.svg)](http://badge.fury.io/js/koa-bouncer)
[![Dependency Status](https://david-dm.org/danneu/koa-bouncer.svg)](https://david-dm.org/danneu/koa-bouncer)

[![NPM](https://nodei.co/npm/koa-bouncer.png?downloads=true&downloadRank=true&stars=true)](https://nodei.co/npm/koa-bouncer/)

An http parameter validation library for [Koa](http://koajs.com) web apps.

- Inspired by [RocksonZeta](https://github.com/RocksonZeta/koa-validate)

<br style="clear: both;">

## Example

``` javascript
var bouncer = require('koa-bouncer');
var app = require('koa')();

// extends the Koa context with some methods
app.use(bouncer.middleware());

// POST /users - create user endpoint
app.post('/users', function*() {

  // validate input

  this.validateBody('uname')
    .required('Username required')
    .isString()
    .trim();

  this.validateBody('email')
    .optional()
    .isString()
    .trim()
    .checkPred(v.isEmail, 'Invalid email format');

  this.validateBody('password1')
    .required('Password required')
    .isString()
    .isLength(6, 100, 'Password must be 6-100 chars');

  this.validateBody('password2')
    .required('Password confirmation required')
    .isString()
    .checkPred(p2 => p2 === this.vals.password1, 'Passwords must match');

  // running database query last to give the other validations a chance to fail
  this.validateBody('uname')
    .check(yield db.findUserByUname(this.vals.uname), 'Username taken');

  // if we get this far, then validation succeeded.

  // the validation populates a `this.vals` object with validated values
  //=> { uname: 'foo', password1: 'secret', password2: 'secret' }
  console.log(this.vals);

  var user = yield db.insertUser({
    uname: this.vals.uname,
    email: this.vals.email,
    password: this.vals.password1
  });

  this.redirect('/users/' + user.id);
});
```

## Usage

First, you need to inject bouncer's middleware:

``` javascript
bouncer.middleware(opts)
```

This extends the Koa context with these methods for you to use in routes,
the bulk of the koa-bouncer abstraction:

- `this.validateParam(key)`
- `this.validateQuery(key)`
- `this.validateBody(key)`

Each of these return a validator that targets the value in the url param,
query param, or body param that you specified with 'key'.

When you spawn a validator, it immediately populates `this.vals[key]` with
the initial value of the parameter. You can then chain methods like
`.toString().trim().isEmail()` to transform the value in `this.vals` and
make assertions against it.

Just by calling these methods, they will begin populating `this.vals`:

``` javascript
app.get('/search', function*() {
  this.validateQuery('keyword');
  this.validateQuery('sort');
  this.body = JSON.stringify(this.vals);
});
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
if the parameter is undefined (not given by user).

``` javascript
app.get('/search', function*() {
  this.validateQuery('keyword').required().isString().trim();
  this.validateQuery('sort').toArray();
  this.body = JSON.stringify(this.vals);
});
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
app.use(function*(next) {
  try {
    yield* next;
  } catch(err) {
    if (err instanceof bouncer.ValidationError) {
      this.flash = {
        message: ['danger', err.message],
        params: this.request.body
      };
      return this.redirect('back');
    }
    throw err;
  }
});

app.post('/users', function*() {
  this.validateBody('username')
    .required('Username is required')
    .isString()
    .trim()
    .isLength(3, 15, 'Username must be 3-15 chars');

  var user = yield database.insertUser(this.vals.username);
  this.body = 'You successfully registered';
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
  getParams: function(ctx) { return ctx.params; },
  getQuery: function(ctx) { return ctx.query; },
  getBody: function(ctx) { return ctx.request.body; }
}));
```

You can override these if the validators need to look in a different place
to fetch the respective keys when calling the `validateParams`, `validateQuery`,
and `validateBody` methods.

You can always define custom validators via `Validator.addMethod`:

``` javascript
var Validator = require('koa-bouncer').Validator;

Validator.addMethod('isValidBitcoinAddress', function(tip) {
  // Will thread the tip through the nested assertions
  var tip = tip || 'Invalid Bitcoin address';

  this
    .isString(tip)
    .tap(s => s.trim())
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
this.validateBody('address')
  .required()
  .isValidBitcoinAddress();
```

These chains always return the underlying validator instance. You can access
its value at any instant with `.val()`.

``` javascript
let validator = this.validateBody('address')
  .required()
  .isValidBitcoinAddress();

console.log('current value of this.vals['address'] is', validator.val());
```

Here's how you'd write a validator method that transforms the underlying value:

``` javascript
Validator.addMethod('add10', function() {
  this.vals[this.key] = this.val() + 10;
  return this;
});
```

In other words, just assign to `this.vals[this.key]` to update the object
of validated params. And remember to return `this` so that you can continue
chaining things on to the validator.

## License

MIT

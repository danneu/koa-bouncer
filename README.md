(Warning: work in progress, rapid churn)

<img src="bouncer-beagle.png" align="right" height="256" hspace="5px">

# koa-bouncer

An http parameter validation library for [Koa](http://koajs.com) web apps.

- Inspired by [RocksonZeta](https://github.com/RocksonZeta/koa-validate)

<br style="clear: both;">

## Usage

``` javascript
var bouncer = require('koa-bouncer');
var route = require('koa-route');
// collection of general string validation predicates
var v = require('validator');

// Add koa-bouncer's methods/behavior to Koa's `this` context
// Just ensure this middleware runs before any routes that use koa-bouncer's
// {validateBody,validateParam,validateQuery} methods.
app.use(bouncer.middleware());

// Add middleware that handles koa-bouncer's ValidationError
// (subtype of native Error) when downstream middleware/routes throw it.
//
// In this example, we set an error flash message to the validation error
// (e.g. 'Username taken'), save the user's progress for body params,
// and redirect back to the form they came from.
app.use(function*(next) {
  try {
    yield *next;
  } catch(err) {
    if (err instanceof bouncer.ValidationError) {
      this.flash = {
        message: ['danger', err.bouncer.message],
        params: this.request.body
      };
      this.redirect('back');
      return;
    }
    // but remember to re-throw other errors so they can be handled upstream
    throw err;
  }
});

app.use(route.post('/users', function*() {

  // Validation
  // - Throws a bouncer.ValidationError if any assertions fail
  // - Populates the `this.vals` object for use in the remainder of the route

  this.validateBody('uname')
    .required('Username required')
    .isString()
    .trim();

  this.validateBody('email')  // email is optional
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

  // You can add more validation assertions to params later on in the
  // route. In the case of the username, we only want to incur a
  // database lookup at the end of the validation.
  this.validateBody('uname')
    .check(yield db.findUserByUname(this.vals.uname), 'Username taken');

  // If we got this far, then validation succeeded.

  // We can see the validated/transformed params:
  console.log(this.vals);

  var user = yield db.insertUser({
    uname: this.vals.uname,
    email: this.vals.email,
    password: this.vals.password1
  });

  this.redirect('/users/' + user.id);
}));
```

### Telling bouncer where to find request parameters

By default, koa-bouncer assumes that it will find query params (?foo=42),
route params (`router.get('/users/:id', ...)`), and body params in
`ctx.query`, `ctx.params`, and `ctx.request.body` respectively.

You can override these assumptions by passing in your own getter functions
to `bouncer.middleware(opts)`.

Each function must take the Koa context as its argument and return an object.

For example, here's how the default functions are defined:

``` javascript
app.use(bouncer.middleware({
  getParams: function(ctx) { return ctx.params; },
  getQuery: function(ctx) { return ctx.query; },
  getBody: function(ctx) { return ctx.request.body; }
}));
```

### Custom Validator methods

koa-bouncer comes with Validator methods that are frequently useful when
validating user input.

You can also define your own Validator methods to DRY up common logic.

For example, maybe you want to define '.isValidBitcoinAddress' such that
you can write code like this:

``` javascript
this.validateBody('address')
  .notEmpty()
  .isValidBitcoinAddress();
```

You can implement `.isValidBitcoinAddress` by attaching it to
bouncer.Validator's prototype via the `Validator.addMethod(name, fn)` method.
You could define a file `custom_validators.js` that adds methods to the
Validator and then ensure the file it evaluated before your 
middleware/routes by `require`ing it.

For quick reference, here is how the built-in `.isString` method is
implemented:

``` javascript
Validator.addMethod('isString', function(tip) {
  if (!_.isString(this.val)) {
    this.throwError(tip || util.format('%s must be a string', this.key));
  }

  return this;
};
```

Basically, when you call `this.validateBody('address')` in a route,
it instantiates a new Validator instance and puts the value of the
'address' body param into the Koa context `this.vals['address']`.

The job of Validator methods are to then transform the value of
`this.vals['address']` and/or make assertions about it, throwing a
`bouncer.ValidationError` when the current value is forbidden.

Within a Validator method,

- `this` is the current Validator instance
- `this.vals` is always an object that's keyed by query/param/body parameter
names
- `this.key` is the name of the parameter that the current Validator
instance was created to validate. `this.key` will be 'address' in the
example `this.validateBody('address')`, thus you can access the current
value so far via `this.vals[this.key]`.
- `this.throwError` is used to throw a ValidatorError. The convention is for
Validator methods to take an optional `tip` string argument to allow
the callsite (a route) to provide a custom user-facing error message
if the assertion fails.

Remember to always update `this.vals[this.key]` and `this.val` with any
transformations you make to the value, if any. **TODO**: It's a bit clunky
having to remember to assign both `this.vals[this.key]` and `this.val` 
per transformation.

Also remember to `return this` so that more methods can be chained.

Here's an example of how `.isValidBitcoinAddress` could be implemented:

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

## License

MIT

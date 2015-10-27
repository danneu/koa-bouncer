(Work in progress, alpha software)

# koa-bouncer

An http parameter validation library for [Koa](http://koajs.com) web apps.

- Inspired by [RocksonZeta](https://github.com/RocksonZeta/koa-validate)
- Leans on [chriso/validator.js](https://github.com/chriso/validator.js)

## Usage

``` javascript
var bouncer = require('koa-bouncer');
var route = require('koa-route');

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
    .notEmpty('Username required')
    .isString()
    .tap(s => s.trim());

  // Email is optional
  if (this.request.body.email) {
    this.validateBody('email')
      .isString()
      .tap(s => s.trim())
      .isEmail();
  }

  this.validateBody('password1')
    .notEmpty('Password required')
    .isString()
    .tap(s => s.trim())
    .isLength(6, 100, 'Password must be 6-100 chars');

  this.validateBody('password2')
    .notEmpty('Password confirmation required')
    .isString()
    .tap(s => s.trim())
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

## License

MIT

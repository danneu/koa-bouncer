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
app.use(function*(next) {
  try {
    yield *next;
  } catch(err) {
    if (err instanceof bouncer.ValidationError) {
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

  // If we got this far, then validation succeeded.

  // We can see the validated/transformed params:
  console.log(this.vals);

  var user = yield db.insertUser({
    uname: this.vals.uname,
    email: this.vals.email,
    password: this.vals.password
  });

  this.redirect('/users/' + user.id);
}));
```

## License

MIT

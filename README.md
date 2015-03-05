(Work in progress, alpha software)

# koa-bouncer

An http parameter validation library for [Koa](http://koajs.com) web apps.

- Inspired by [RocksonZeta](https://github.com/RocksonZeta/koa-validate)
- Leans on [chriso/validator.js](https://github.com/chriso/validator.js)

## Usage

``` javascript
var bouncer = require('koa-bouncer');

app.use(bouncer.middleware());
```

`bouncer.middleware()` is middleware that extends the koa context.

- `this.valid` is a map of validated param names to their validated values that's populated by the validator methods
- `this.validateBody('uname')` begins a validation context on a body param named 'uname'
- `this.validate(expression, tip)` allows you to check arbitrary expressions

`this.validateBody` and `this.validate` throw a bouncer.ValidationError when they fail.

`bouncer.ValidationError` is a subclassed `Error` extended with a `bouncer` object:

    err.bouncer.key     //=> 'uname'
    err.bouncer.message //=> 'Username taken'

Use `ex instanceof bouncer.ValidationError` to see if an error is a ValidationError created by bouncer.

## Demo

``` javascript
var bouncer = require('koa-bouncer');

app.use(bouncer.middleware());

//
// POST /users
//
// Create new user
app.post('/users', function*() {

  // === Validate parameters ===

  try {
    this.validateBody('uname')
      .notEmpty('Username required')
      .trim()
      .isLength(3, 15 'Username must be 3-15 characters')
      .match(/^[a-z0-9 ]+$/i, 'Username must only contain a-z, 0-9, and spaces')
      .match(/[a-z]/i, 'Username must contain at least one letter (a-z)')
      .notMatch(/[ ]{2,}/, 'Username contains consecutive spaces')
      .checkNot(yield db.findUserByUname(this.valid.uname), 'Username taken');
    // Email is optional
    if (this.request.body.email)
      this.validateBody('email')
        .notEmpty('Email required')
        .trim()
        .isEmail('Email must be valid')
        .checkNot(yield db.findUserByEmail(this.valid.email), 'Email taken');
    this.validateBody('password2')
      .notEmpty('Password confirmation required');
    this.validateBody('password1')
      .notEmpty('Password required')
      .eq(this.valid.password2, 'Password confirmation must match');
  } catch(ex) {
    if (ex instanceof bouncer.ValidationError) {
      this.status = 400;
      this.body = 'Error for ' + ex.bouncer.key + ': ' + ex.bouncer.message;
      return;
    }
    throw ex;
  }

  // === Validation success ===

  // Read validated params from the `this.valid` object
  // Ex: this.valid => { uname: 'foo', password1: 'secret', password2: 'secret' }

  this.body = this.valid;
});
```

```
$ http --form POST localhost:3000/users

HTTP/1.1 400 Bad Request
Connection: keep-alive
Content-Length: 34
Content-Type: text/plain; charset=utf-8
Date: Thu, 05 Mar 2015 03:32:36 GMT

Error for uname: Username required
```

```
$ http --form POST localhost:3000/users uname=foo password1=secret

HTTP/1.1 400 Bad Request
Connection: keep-alive
Content-Length: 51
Content-Type: text/plain; charset=utf-8
Date: Thu, 05 Mar 2015 03:33:19 GMT

Error for password2: Password confirmation required
```

```
$ http --form POST localhost:3000/users uname=foo password1=secret password2=secret
HTTP/1.1 200 OK
Connection: keep-alive
Content-Length: 57
Content-Type: application/json; charset=utf-8
Date: Thu, 05 Mar 2015 03:34:30 GMT

{
    "password1": "secret",
    "password2": "secret",
    "uname": "foo"
}
```

## License

MIT

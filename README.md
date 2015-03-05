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

  var uname, email, password1, password2
  try {
    uname = this.validateBody('uname')
      .notEmpty('Username required')
      .trim()
      .isLength(3, 15 'Username must be 3-15 characters')
      .match(/^[a-z0-9 ]+$/i, 'Username must only contain a-z, 0-9, and spaces')
      .match(/[a-z]/i, 'Username must contain at least one letter (a-z)')
      .notMatch(/[ ]{2,}/, 'Username contains consecutive spaces')
      .value;
    this.checkNot(yield db.findUserByUname(uname), 'Username taken');
    // Email is optional
    if (this.request.body.email) {}
      email = this.validateBody('email')
        .notEmpty('Email required')
        .trim()
        .isEmail('Email must be valid')
        .value;
      this.checkNot(yield db.findUserByEmail(email), 'Email taken');
    }
    password2 = this.validateBody('password2')
      .notEmpty('Password confirmation required')
      .value;
    password1 = this.validateBody('password1')
      .notEmpty('Password required')
      .eq(password2, 'Password confirmation must match')
      .value;
  } catch(ex) {
    if (ex instanceof bouncer.ValidationError) {
      this.status = 400;
      this.body = 'Error for ' + ex.bouncer.key + ': ' + ex.bouncer.message;
      return;
    }
    throw ex;
  }

  // === Validation success ===

  this.body = [uname, email, password1, password2];
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

["foo", null, "secret", "secret"]
```

## License

MIT

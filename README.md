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

## License

MIT

'use strict';
require('babel-polyfill');
// 3rd
const request = require('supertest');
const koa = require('koa');
const assert = require('chai').assert;
const _ = require('lodash');
// 1st
const bouncer = require('../src/index.js');

// returns 418 response if it catches a ValidationError
// for easy supertest testing
// TODO: find a better way to test koa-bouncer
var exposeBouncer = async function (ctx, next) {
  try {
    await next();
    ctx.status = 200;
  } catch (err) {
    if (err instanceof bouncer.ValidationError) {
      ctx.status = 418;
      return;
    }
    err.expose = true;
    console.error(err.stack);
    ctx.throw(err);
  }
};

function makeApp(opts) {
  const app = new koa();
  app.use(bouncer.middleware(opts));
  app.use(exposeBouncer);
  return app;
}

////////////////////////////////////////////////////////////

describe('Validator', () => {
  it('populates ctx.vals on instantiation', (done) => {
    // i.e. does not require a Validation method to be called just to
    // populate ctx.vals[this.key]
    const app = makeApp();
    app.use(function(ctx) {
      ctx.validateQuery('test');
      ctx.body = ctx.vals.test;
    });
    request(app.listen())
      .get('/?test=foo')
      .expect(200)
      .expect('foo')
      .end(done);
  });
});

////////////////////////////////////////////////////////////

describe('Validator#checkPred', () => {
  it('works with arbitrary predicates', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.validateQuery('test').checkPred(_.isArray);
    });
    request(app.listen()).get('/?test=a&test=b').expect(200).end(done);
  });
});

describe('Validator#checkPred', () => {
  it('works with arbitrary predicates', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.validateQuery('test').checkNotPred(_.isArray);
    });
    request(app.listen()).get('/?test=a').expect(200).end(done);
  });
});

////////////////////////////////////////////////////////////

describe('Validator#required', () => {
  it('throws if val is undefined', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.validateQuery('test').required();
    });
    request(app.listen()).get('/').expect(418).end(done);
  });

  it('does not throw if val is defined', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.validateQuery('test').required();
    });
    request(app.listen()).get('/?test=42').expect(200).end(done);
  });

  it('does not throw if val is falsey', done => {
    const app = makeApp();
    app.use(function(ctx) {
      // ensure the querystring parser actually does what i think it does
      assert.equal(0, ctx.query.test.length);
      ctx.validateQuery('test').required();
    });
    request(app.listen()).get('/?test=').expect(200).end(done);
  });
});

////////////////////////////////////////////////////////////

describe('Validator#isIn', () => {
  it('passes if item is in array', (done) => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.validateQuery('test').isIn(['a', 'b', 'c']);
    });
    request(app.listen()).get('/?test=b').expect(200).end(done);
  });

  it('throws ValidationError if item is not in array', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.validateQuery('test').isIn(['a', 'b', 'c']);
    });
    request(app.listen()).get('/?test=z').expect(418).end(done);
  });
});

////////////////////////////////////////////////////////////

describe('Validator#isNotIn', () => {
  it('throws ValidationError if item is in array', (done) => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.validateQuery('test').isNotIn(['a', 'b', 'c']);
    });
    request(app.listen()).get('/?test=b').expect(418).end(done);
  });

  it('passes if item is not in array', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.validateQuery('test').isNotIn(['a', 'b', 'c']);
    });
    request(app.listen()).get('/?test=z').expect(200).end(done);
  });
});

////////////////////////////////////////////////////////////

describe('Validator#isArray', () => {
  it('passes if val is array', (done) => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.validateQuery('test').isArray();
    });
    request(app.listen()).get('/?test=a&test=b').expect(200).end(done);
  });

  it('throws ValidationError if val is not array', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.validateQuery('test').isArray();
    });
    request(app.listen()).get('/?test=a').expect(418).end(done);
  });
});

////////////////////////////////////////////////////////////

describe('Validation#tap', () => {
  it('allows arbitrary value change', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.validateQuery('test').tap(() => 'bar');
      ctx.body = ctx.vals.test;
    });
    request(app.listen())
      .get('/?test=foo')
      .expect(200)
      .expect('bar')
      .end(done);
  });
});

////////////////////////////////////////////////////////////

describe('Parameter getter override', () => {
  describe('Validation#getParams', () => {
    it('allows override', done => {
      const app = makeApp({
        getParams: () => {
          return { test: 'aaa' };
        }
      });
      app.use(function(ctx) {
        ctx.validateParam('test');
        ctx.body = ctx.vals.test;
      });
      request(app.listen()).get('/').expect(200).expect('aaa').end(done);
    });
  });

  describe('Validation#getQuery', () => {
    it('allows override', done => {
      const app = makeApp({
        getQuery: () => {
          return { test: 'bbb' };
        }
      });
      app.use(function(ctx) {
        ctx.validateQuery('test');
        ctx.body = ctx.vals.test;
      });
      request(app.listen()).get('/').expect(200).expect('bbb').end(done);
    });
  });

  describe('Validation#getBody', () => {
    it('allows override', done => {
      const app = makeApp({
        getBody: () => {
          return { test: 'ccc' };
        }
      });
      app.use(function(ctx) {
        ctx.validateBody('test');
        ctx.body = ctx.vals.test;
      });
      request(app.listen()).get('/').expect(200).expect('ccc').end(done);
    });
  });
});

////////////////////////////////////////////////////////////

describe('Validator#eq', () => {
  it('passes if strictly === equivalent', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.validateQuery('test').eq('foo');
    });
    request(app.listen()).get('/?test=foo').expect(200).end(done);
  });

  it('throws ValidationError if only == equivalent', done => {
    const app = makeApp();
    app.use(function(ctx) {
      assert.isString(ctx.query.test);  // check assumptions
      ctx.validateQuery('test').eq(2);
    });
    request(app.listen()).get('/?test=2').expect(418).end(done);
  });

  it('throws ValidationError for obvious inequality', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.validateQuery('test').eq(['a', 'b', 'c']);
    });
    request(app.listen()).get('/').expect(418).end(done);
  });
});

describe('Validator#gt', () => {
  it('passes if val > target', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals['test'] = 11;
      ctx.validateQuery('test').gt(10);
    });
    request(app.listen()).get('/').expect(200).end(done);
  });

  it('throws ValidationError if val === target', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals['test'] = 10;
      ctx.validateQuery('test').gt(10);
    });
    request(app.listen()).get('/').expect(418).end(done);
  });

  it('throws ValidationError if val < target', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals['test'] = 9;
      ctx.validateQuery('test').gt(10);
    });
    request(app.listen()).get('/').expect(418).end(done);
  });
});

describe('Validator#gte', () => {
  it('passes if val > target', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals['test'] = 11;
      ctx.validateQuery('test').gte(10);
    });
    request(app.listen()).get('/').expect(200).end(done);
  });

  it('passes if val === target', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals['test'] = 10;
      ctx.validateQuery('test').gte(10);
    });
    request(app.listen()).get('/').expect(200).end(done);
  });

  it('throws ValidationError if val < target', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals['test'] = 9;
      ctx.validateQuery('test').gte(10);
    });
    request(app.listen()).get('/').expect(418).end(done);
  });
});

describe('Validator#lt', () => {
  it('passes if val < target', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals['test'] = 9;
      ctx.validateQuery('test').lt(10);
    });
    request(app.listen()).get('/').expect(200).end(done);
  });

  it('throws ValidationError if val === target', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals['test'] = 10;
      ctx.validateQuery('test').lt(10);
    });
    request(app.listen()).get('/').expect(418).end(done);
  });

  it('throws ValidationError if val > target', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals['test'] = 11;
      ctx.validateQuery('test').lt(10);
    });
    request(app.listen()).get('/').expect(418).end(done);
  });
});

describe('Validator#lte', () => {
  it('passes if val < target', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals['test'] = 9;
      ctx.validateQuery('test').lte(10);
    });
    request(app.listen()).get('/').expect(200).end(done);
  });

  it('passes if val === target', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals['test'] = 10;
      ctx.validateQuery('test').lte(10);
    });
    request(app.listen()).get('/').expect(200).end(done);
  });

  it('throws ValidationError if val > target', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals['test'] = 11;
      ctx.validateQuery('test').lte(10);
    });
    request(app.listen()).get('/').expect(418).end(done);
  });
});

////////////////////////////////////////////////////////////

describe('Validator#isLength', () => {
  it('throws ValidationError if length < min', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals['test'] = [1, 2];
      ctx.validateQuery('test').isLength(3, 5);
    });
    request(app.listen()).get('/').expect(418).end(done);
  });

  it('passes if length === min', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals['test'] = [1, 2, 3];
      ctx.validateQuery('test').isLength(3, 5);
    });
    request(app.listen()).get('/').expect(200).end(done);
  });

  it('passes if min < length < max', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals['test'] = [1, 2, 3, 4];
      ctx.validateQuery('test').isLength(3, 5);
    });
    request(app.listen()).get('/').expect(200).end(done);
  });

  it('passes if length === max', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals['test'] = [1, 2, 3, 4, 5];
      ctx.validateQuery('test').isLength(3, 5);
    });
    request(app.listen()).get('/').expect(200).end(done);
  });

  it('throws ValidationError if length > max', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals['test'] = [1, 2, 3, 4, 5, 6];
      ctx.validateQuery('test').isLength(3, 5);
    });
    request(app.listen()).get('/').expect(418).end(done);
  });
});

describe('Validator#defaultTo', () => {
  it('sets val to x if val it is undefined and x is not a function', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.validateQuery('test').defaultTo('foo');
      ctx.body = ctx.vals.test;
    });
    request(app.listen()).get('/').expect(200).expect('foo').end(done);
  });

  it('sets val to x if val it is undefined and x is a function', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.validateQuery('test').defaultTo(() => 'foo');
      ctx.body = ctx.vals.test;
    });
    request(app.listen()).get('/').expect(200).expect('foo').end(done);
  });

  it('function passed to defaultTo can access Koa ctx with `this`', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.canYouReadMe = true;
      ctx.validateQuery('test').defaultTo(function() {
        return this.canYouReadMe;
      });
      ctx.body = JSON.stringify(ctx.vals.test);
    });
    request(app.listen()).get('/').expect(200).expect('true').end(done);
  });

  it('does not set val if val is only falsey', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals.test1 = '';
      ctx.vals.test2 = 0;
      ctx.vals.test3 = false;
      ctx.vals.test4 = null;
      ctx.validateQuery('test1').defaultTo('foo');
      ctx.validateQuery('test2').defaultTo('foo');
      ctx.validateQuery('test3').defaultTo('foo');
      ctx.validateQuery('test4').defaultTo('foo');
      assert.notMatch(_.values(ctx.vals).join(''), /foo/);
    });
    request(app.listen()).get('/').expect(200).end(done);
  });
});

describe('Validator#isString', () => {
  it('passes if val is string', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.validateQuery('test').isString();
    });
    request(app.listen()).get('/?test=foo').expect(200).end(done);
  });

  it('works with new String() as well (where typeof is \'object\')', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals.test = new String('hello world');
      ctx.validateQuery('test').isString();
    });
    request(app.listen()).get('/').expect(200).end(done);
  });

  it('throws ValidationError if val is not a string', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals.test = 42;
      ctx.validateQuery('test').isString();
    });
    request(app.listen()).get('/').expect(418).end(done);
  });
});

describe('Validator#toString', () => {
  it('works', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals.test = [1, 2, 3];
      ctx.validateQuery('test').toString();
      ctx.body = ctx.vals.test;
    });
    request(app.listen())
      .get('/')
      .expect(200)
      .expect('1,2,3')
      .end(done);
  });

  it('converts null/undefined into empty string', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals.test1 = null;
      ctx.vals.test2 = undefined;
      ctx.validateQuery('test1').toString();
      ctx.validateQuery('test2').toString();
      assert.equal(ctx.vals.test1, '');
      assert.equal(ctx.vals.test2, '');
    });
    request(app.listen())
      .get('/')
      .expect(200)
      .end(done);
  });
});

describe('Validator#trim', () => {
  it('works', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals.test = '  foo  ';
      ctx.validateQuery('test').trim();
      ctx.body = ctx.vals.test.length.toString();
    });
    request(app.listen())
      .get('/')
      .expect(200)
      .expect('3')
      .end(done);
  });
});

describe('Validator#isInt', () => {
  it('passes if val is an integer', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals.test = 5;
      ctx.validateQuery('test').isInt();
    });
    request(app.listen())
      .get('/')
      .expect(200)
      .end(done);
  });

  it('throws ValidationError if val is obviously not an integer', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals.test = '5';
      ctx.validateQuery('test').isInt();
    });
    request(app.listen())
      .get('/')
      .expect(418)
      .end(done);
  });

  it('passes if val is a decimal that lands on .00', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals.test = 5.00;
      ctx.validateQuery('test').isInt();
    });
    request(app.listen())
      .get('/')
      .expect(200)
      .end(done);
  });

  it('throws ValidationError if val is a decimal that does not land on .0', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals.test = 5.0001;
      ctx.validateQuery('test').isInt();
    });
    request(app.listen())
      .get('/')
      .expect(418)
      .end(done);
  });

  it('throws ValidationError if val is not a safe integer', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals.test = Number.MAX_SAFE_INTEGER + 1;
      ctx.validateQuery('test').isInt();
    });
    request(app.listen())
      .get('/')
      .expect(418)
      .end(done);
  });
});

////////////////////////////////////////////////////////////

describe('Validator#toInt', () => {
  it('passes when val parses fully into integer', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals.test = '5';
      ctx.validateQuery('test').toInt();
      ctx.body = ctx.vals.test.toString();
    });
    request(app.listen())
      .get('/')
      .expect(200)
      .expect('5')
      .end(done);
  });

  it('throws ValidationError if val has extraneous non-integer chars', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals.test = '5.67abc';
      ctx.validateQuery('test').toInt();
    });
    request(app.listen())
      .get('/')
      .expect(418)
      .end(done);
  });

  it('throws ValidationError if val cannot parse into an integer', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals.test = 'abc';
      ctx.validateQuery('test').toInt();
    });
    request(app.listen())
      .get('/')
      .expect(418)
      .end(done);
  });

  it('throws ValidationError if val parses into unsafe integer', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals.test = (Number.MAX_SAFE_INTEGER + 1).toString();
      ctx.validateQuery('test').toInt();
    });
    request(app.listen())
      .get('/')
      .expect(418)
      .end(done);
  });
});

describe('Validator#isFiniteNumber', () => {
  it('works', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals.test = 1.67;
      ctx.validateQuery('test').isFiniteNumber();
    });
    request(app.listen())
      .get('/')
      .expect(200)
      .end(done);
  });

  it('throws ValidationError if val is Infinity', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals.test = Infinity;
      ctx.validateQuery('test').isFiniteNumber();
    });
    request(app.listen())
      .get('/')
      .expect(418)
      .end(done);
  });

  // ensure it doesn't behave like the old global isFinite impl
  it('throws ValidationError if val is null', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals.test = null;
      ctx.validateQuery('test').isFiniteNumber();
    });
    request(app.listen())
      .get('/')
      .expect(418)
      .end(done);
  });
});

////////////////////////////////////////////////////////////

describe('Validator#toFiniteFloat', () => {
  it('succeeds on "1e+50"', done => {
    const app = makeApp();
    app.use(function*() {
      this.vals.test = '1e+50';
      this.validateQuery('test').toFiniteFloat();
      this.body = this.vals.test.toString();
    });
    request(app.listen())
      .get('/')
      .expect(200)
      .expect('1e+50')
      .end(done);
  });

  it('fails on Infinity (float)', done => {
    const app = makeApp();
    app.use(function*() {
      this.vals.test = Infinity;
      this.validateQuery('test').toFiniteFloat();
      this.body = this.vals.test.toString();
    });
    request(app.listen())
      .get('/')
      .expect(418)
      .end(done);
  });

  it('fails on "Infinity" (string)', done => {
    const app = makeApp();
    app.use(function*() {
      this.vals.test = 'Infinity';
      this.validateQuery('test').toFiniteFloat();
      this.body = this.vals.test.toString();
    });
    request(app.listen())
      .get('/')
      .expect(418)
      .end(done);
  });

  it('handles val that already is a float', done => {
    const app = makeApp();
    app.use(function*() {
      this.vals.test = 5.67;
      this.validateQuery('test').toFiniteFloat();
      this.body = this.vals.test.toString();
    });
    request(app.listen())
      .get('/')
      .expect(200)
      .expect('5.67')
      .end(done);
  });

  it('passes when val can parse into float', done => {
    const app = makeApp();
    app.use(function*() {
      this.vals.test = '05.67';
      this.validateQuery('test').toFiniteFloat();
      this.body = this.vals.test.toString();
    });
    request(app.listen())
      .get('/')
      .expect(200)
      .expect('5.67')
      .end(done);
  });

  it('passes when val has illegal chars even though parseFloat would work', done => {
    const app = makeApp();
    app.use(function*() {
      this.vals.test = '05.67aasdfsad';
      this.validateQuery('test').toFiniteFloat();
    });
    request(app.listen())
      .get('/')
      .expect(418)
      .end(done);
  });

  it('throws ValidationError if val cannot parse into float', done => {
    const app = makeApp();
    app.use(function*() {
      this.vals.test = 'abc';
      this.validateQuery('test').toFiniteFloat();
    });
    request(app.listen())
      .get('/')
      .expect(418)
      .end(done);
  });
});

////////////////////////////////////////////////////////////

describe('Validator#toFloat', () => {
  it('allows Infinity (already a float)', done => {
    const app = makeApp();
    app.use(function*() {
      this.vals.test = Infinity;
      this.validateQuery('test').toFloat();
      this.body = this.vals.test.toString();
    });
    request(app.listen())
      .get('/')
      .expect(200)
      .expect((res) => res.body === Infinity)
      .end(done);
  });

  it('allows " Infinity " (string)', done => {
    const app = makeApp();
    app.use(function*() {
      this.vals.test = ' Infinity ';
      this.validateQuery('test').toFloat();
      this.body = this.vals.test.toString();
    });
    request(app.listen())
      .get('/')
      .expect(200)
      .expect((res) => {
        console.log('res.body', res.body);
        res.body === Infinity
      })
      .end(done);
  });

  it('handles val that already is a float', done => {
    const app = makeApp();
    app.use(function*() {
      this.vals.test = 5.67;
      this.validateQuery('test').toFloat();
      this.body = this.vals.test.toString();
    });
    request(app.listen())
      .get('/')
      .expect(200)
      .expect('5.67')
      .end(done);
  });

  it('passes when val can parse into float', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals.test = '05.67';
      ctx.validateQuery('test').toFloat();
      ctx.body = ctx.vals.test.toString();
    });
    request(app.listen())
      .get('/')
      .expect(200)
      .expect('5.67')
      .end(done);
  });

  it('passes when val has illegal chars even though parseFloat would work', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals.test = '05.67aasdfsad';
      ctx.validateQuery('test').toFloat();
    });
    request(app.listen())
      .get('/')
      .expect(418)
      .end(done);
  });

  it('throws ValidationError if val cannot parse into float', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals.test = 'abc';
      ctx.validateQuery('test').toFloat();
    });
    request(app.listen())
      .get('/')
      .expect(418)
      .end(done);
  });
});

describe('Validator#toDecimal', () => {
  it('passes when val can parse into decimal', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals.test = '05.67';
      ctx.validateQuery('test').toDecimal();
      ctx.body = ctx.vals.test.toString();
    });
    request(app.listen())
      .get('/')
      .expect(200)
      .expect('5.67')
      .end(done);
  });

  it('throws with legal floats that are not decimal numbers (Infinity)', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals.test = 'Infinity';
      ctx.validateQuery('test').toDecimal();
    });
    request(app.listen())
      .get('/')
      .expect(418)
      .end(done);
  });

  it('throws with legal floats that are not decimal numbers (exponential form)', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals.test = '5e3';
      ctx.validateQuery('test').toDecimal();
    });
    request(app.listen())
      .get('/')
      .expect(418)
      .end(done);
  });

  it('throws ValidationError if val is not fully decimal', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals.test = '1.234abc';
      ctx.validateQuery('test').toDecimal();
    });
    request(app.listen())
      .get('/')
      .expect(418)
      .end(done);
  });
});

describe('Validator#toArray', () => {
  it('converts undefined val into []', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.validateQuery('test').toArray();
      ctx.body = JSON.stringify(ctx.vals.test);
    });
    request(app.listen())
      .get('/')
      .expect(200)
      .expect('[]')
      .end(done);
  });

  it('converts defined non-array val to [val]', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals.test = 42;
      ctx.validateQuery('test').toArray();
      ctx.body = JSON.stringify(ctx.vals.test);
    });
    request(app.listen())
      .get('/')
      .expect(200)
      .expect('[42]')
      .end(done);
  });

  it('does nothing if val is already an array', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals.test = [1, 2, 3];
      ctx.validateQuery('test').toArray();
      ctx.body = JSON.stringify(ctx.vals.test);
    });
    request(app.listen())
      .get('/')
      .expect(200)
      .expect('[1,2,3]')
      .end(done);
  });
});

describe('Validator#toInts', () => {
  it('passes if array is blank', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals.test = [];
      ctx.validateQuery('test').toInts();
      ctx.body = JSON.stringify(ctx.vals.test);
    });
    request(app.listen())
      .get('/')
      .expect(200)
      .expect('[]')
      .end(done);
  });

  it('fails if an item is a decimal', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals.test = ['1.23'];
      ctx.validateQuery('test').toInts();
    });
    request(app.listen())
      .get('/')
      .expect(418)
      .end(done);
  });

  it('fails if an item is alpha', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals.test = ['abc'];
      ctx.validateQuery('test').toInts();
    });
    request(app.listen())
      .get('/')
      .expect(418)
      .end(done);
  });

  it('converts val to [] if val is undefined', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals.test = undefined;
      ctx.validateQuery('test').toInts();
      ctx.body = JSON.stringify(ctx.vals.test);
    });
    request(app.listen())
      .get('/')
      .expect(200)
      .expect('[]')
      .end(done);
  });

  it('passes if string array parses fully into integer array', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals.test = ['1', '2', '3'];
      ctx.validateQuery('test').toInts();
      ctx.body = JSON.stringify(ctx.vals.test);
    });
    request(app.listen())
      .get('/')
      .expect(200)
      .expect('[1,2,3]')
      .end(done);
  });

  it('throws ValidationError if an item does not fully parse into integer', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals.test = ['1', '2', NaN];
      ctx.validateQuery('test').toInts();
    });
    request(app.listen())
      .get('/')
      .expect(418)
      .end(done);
  });

  it('throws ValidationError if an item is not a safe integer', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals.test = ['1', '2', (Number.MAX_SAFE_INTEGER + 1).toString()];
      ctx.validateQuery('test').toInts();
    });
    request(app.listen())
      .get('/')
      .expect(418)
      .end(done);
  });
});

describe('Validator#uniq', () => {
  it('de-dupes array items', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals.test = [1, 2, 2, 2, 3];
      ctx.validateQuery('test').uniq();
      ctx.body = JSON.stringify(ctx.vals.test);
    });
    request(app.listen())
      .get('/')
      .expect(200)
      .expect('[1,2,3]')
      .end(done);
  });
});

describe('Validator#toBoolean', () => {
  it('!!coerces val into boolean', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals.test1 = {};
      ctx.vals.test2 = null;
      ctx.validateQuery('test1').toBoolean();
      ctx.validateQuery('test2').toBoolean();
      ctx.body = JSON.stringify([
        ctx.vals.test1, ctx.vals.test2
      ]);
    });
    request(app.listen())
      .get('/')
      .expect(200)
      .expect('[true,false]')
      .end(done);
  });

  // i've seen param validators in the wild that allow you to pass
  // strings like "false" and "off" in to be converted into false boolean
  // but i don't want that.
  it('considers val="false" truthy', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals.test1 = 'false';
      ctx.validateQuery('test1').toBoolean();
      ctx.body = JSON.stringify(ctx.vals.test1);
    });
    request(app.listen())
      .get('/')
      .expect(200)
      .expect('true')
      .end(done);
  });

  it('considers val="off" truthy', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals.test1 = 'off';
      ctx.validateQuery('test1').toBoolean();
      ctx.body = JSON.stringify(ctx.vals.test1);
    });
    request(app.listen())
      .get('/')
      .expect(200)
      .expect('true')
      .end(done);
  });
});

////////////////////////////////////////////////////////////

describe('Validator#match', () => {
  it('passes if regex test passes', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals.test = 'foobar';
      ctx.validateQuery('test').match(/^foo/);
    });
    request(app.listen())
      .get('/')
      .expect(200)
      .end(done);
  });

  it('throws ValidationError if regex test fails', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals.test = 'foobar';
      ctx.validateQuery('test').match(/^foo$/);
    });
    request(app.listen())
      .get('/')
      .expect(418)
      .end(done);
  });
});

describe('Validator#notMatch', () => {
  it('passes if regex test fails', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals.test = 'barfoo';
      ctx.validateQuery('test').notMatch(/^foo/);
    });
    request(app.listen())
      .get('/')
      .expect(200)
      .end(done);
  });

  it('throws ValidationError if regex test passes', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals.test = 'foobar';
      ctx.validateQuery('test').notMatch(/^foo/);
    });
    request(app.listen())
      .get('/')
      .expect(418)
      .end(done);
  });
});

////////////////////////////////////////////////////////////

describe('Validator#check', () => {
  it('passes when val is truthy', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.validateQuery('test').check(true);
    });
    request(app.listen())
      .get('/')
      .expect(200)
      .end(done);
  });

  it('throws Validation Error when val is falsey', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.validateQuery('test').check(false);
    });
    request(app.listen())
      .get('/')
      .expect(418)
      .end(done);
  });
});

describe('Validator#checkNot', () => {
  it('passes when val is falsey', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.validateQuery('test').checkNot(false);
    });
    request(app.listen())
      .get('/')
      .expect(200)
      .end(done);
  });

  it('throws Validation Error when val is truthy', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.validateQuery('test').checkNot(true);
    });
    request(app.listen())
      .get('/')
      .expect(418)
      .end(done);
  });
});

////////////////////////////////////////////////////////////

describe('Validator#fromJson', () => {
  it('works if val is valid JSON', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals.test1 = '{ "foo": "bar" }';
      ctx.vals.test2 = 'true';
      ctx.validateQuery('test1').fromJson();
      ctx.validateQuery('test2').fromJson();
      ctx.body = JSON.stringify([ctx.vals.test1.foo, ctx.vals.test2]);
    });
    request(app.listen())
      .get('/')
      .expect(200)
      .expect('["bar",true]')
      .end(done);
  });

  it('throws ValidationError if val is not valid JSON', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals.test = '{ foo: bar }';
      ctx.validateQuery('test').fromJson();
    });
    request(app.listen())
      .get('/')
      .expect(418)
      .end(done);
  });
});

////////////////////////////////////////////////////////////

describe('general sanity checks', () => {
  it('works', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals.test = '{ "foo": "bar" }';

      ctx.validateQuery('test')
        .required()
        .fromJson()
        .tap(x => x.foo)
        .tap(x => '5' + x)
        .tap(x => Number.parseInt(x, 10))
        .toArray()
        .toInts();

      ctx.body = JSON.stringify(ctx.vals.test);
    });
    request(app.listen())
      .get('/')
      .expect(200)
      .expect('[5]')
      .end(done);
  });

  it('works with optional()', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals.test = undefined;

      ctx.validateQuery('test')
        .optional()
        .fromJson()
        .tap(x => x.foo)
        .tap(x => '5' + x)
        .tap(x => Number.parseInt(x, 10))
        .toArray()
        .toInts();

      ctx.body = String(ctx.vals.test);
    });
    request(app.listen())
      .get('/')
      .expect(200)
      .expect('undefined')
      .end(done);
  });

  it('loses optional state if initialized with its ctx.vals defined', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals.test = 'foo';

      ctx.validateQuery('test')
        .optional()
        .check(false);
    });
    request(app.listen())
      .get('/')
      .expect(418)
      .end(done);
  });

  it('does not lose optional state if initialized with its ctx.vals undefined', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals.test = undefined;

      ctx.validateQuery('test')
        .optional()
        .check(false);
    });
    request(app.listen())
      .get('/')
      .expect(200)
      .end(done);
  });
});

////////////////////////////////////////////////////////////

describe('isSafeInteger', () => {
  it('should work', () => {
    assert.isTrue(bouncer.isSafeInteger(Number.MIN_SAFE_INTEGER));
    assert.isFalse(bouncer.isSafeInteger(Number.MIN_SAFE_INTEGER - 1));
    assert.isTrue(bouncer.isSafeInteger(Number.MAX_SAFE_INTEGER));
    assert.isFalse(bouncer.isSafeInteger(Number.MAX_SAFE_INTEGER + 1));
  });
});

////////////////////////////////////////////////////////////

describe('multiple Validator chains', () => {
  it('persists the underlying value', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals.test = 0;

      ctx.validateQuery('test')
        .tap(n => n + 1);

      ctx.validateQuery('test')
        .tap(n => n + 1);

      ctx.body = JSON.stringify(ctx.vals.test);
    });
    request(app.listen())
      .get('/')
      .expect(200)
      .expect('2')
      .end(done);
  });
});

////////////////////////////////////////////////////////////

describe('Validator#optional' ,() => {
  it('short-circuits when val is undefined', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals.test = undefined;

      ctx.validateQuery('test')
        .optional()
        .check(false);
    });
    request(app.listen())
      .get('/')
      .expect(200)
      .end(done);
  });

  it('short-circuits when val is empty string', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals.test = '';

      ctx.validateQuery('test')
        .optional()
        .check(false);
    });
    request(app.listen())
      .get('/')
      .expect(200)
      .end(done);
  })

  it('short-circuits when val is string that condenses to nothing when trim()\'ed', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals.test = '            ';

      ctx.validateQuery('test')
        .optional()
        .check(false);
    });
    request(app.listen())
      .get('/')
      .expect(200)
      .end(done);
  })

  it('optional val is not added to ctx.vals', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals.test = '';

      ctx.validateQuery('test')
        .optional()
        .check(false);

      assert.isUndefined(ctx.vals.test);
    });
    request(app.listen())
      .get('/')
      .expect(200)
      .end(done);
  })

  it('continues when val is defined and not empty string', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals.test = 42;
      ctx.validateQuery('test')
        .optional()
        .check(false);
    });
    request(app.listen())
      .get('/')
      .expect(418)
      .end(done);
  });

  it('optional state does not apply when defined later on', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals.test = undefined;

      ctx.validateQuery('test')
        .optional()
        .check(false);

      ctx.vals.test = 42;

      ctx.validateQuery('test')
        .check(false);
    });
    request(app.listen())
      .get('/')
      .expect(418)
      .end(done);
  });

  it('optional state remains through validate* calls', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals.test = undefined;

      const validatorStart = ctx.validateQuery('test')
        .optional()
        .check(false);

      assert.isTrue(validatorStart.isOptional());

      const validatorFinish = ctx.validateQuery('test');
      assert.isTrue(validatorFinish.isOptional());
    });
    request(app.listen())
      .get('/')
      .expect(200)
      .end(done);
  });

  it('loses optional state when defined later on', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals.test = undefined;

      const validatorStart = ctx.validateQuery('test')
        .optional()
        .check(false);

      assert.isTrue(validatorStart.isOptional());

      ctx.vals.test = 42;

      const validatorFinish = ctx.validateQuery('test');
      assert.equal(validatorStart, validatorFinish);
      assert.isFalse(validatorFinish.isOptional());
    });
    request(app.listen())
      .get('/')
      .expect(200)
      .end(done);
  });

  // random non-general checks

  it('short-circuits isIn when val is undefined', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals.test = undefined;

      ctx.validateQuery('test')
        .optional()
        .isIn(['this', 'would normally', 'fail']);
    });
    request(app.listen())
      .get('/')
      .expect(200)
      .end(done);
  });

  it('short-circuits eq when val is undefined', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals.test = undefined;

      ctx.validateQuery('test')
        .optional()
        .eq(42);
    });
    request(app.listen())
      .get('/')
      .expect(200)
      .end(done);
  });
});

////////////////////////////////////////////////////////////

describe('Validator instantiation', () => {
  it('only gets instantiated once', done => {
    const app = makeApp();
    app.use(function(ctx) {
      const v1 = ctx.validateQuery('test');
      const v2 = ctx.validateQuery('test');
      const v3 = ctx.validateQuery('other');
      ctx.body = JSON.stringify([v1 === v2, v1 === v3]);
    });
    request(app.listen())
      .get('/')
      .expect(200)
      .expect('[true,false]')
      .end(done);
  });

  it('reads its starting val from existing ctx.vals', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals.test = 42;
      const validator = ctx.validateQuery('test');
      ctx.body = JSON.stringify(validator.val());
    });
    request(app.listen())
      .get('/')
      .expect(200)
      .expect('42')
      .end(done);
  });

  it('does not have a stale val()', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals.test = 42;
      const validator = ctx.validateQuery('test');
      ctx.vals.test = 'foo';
      ctx.body = JSON.stringify(validator.val());
    });
    request(app.listen())
      .get('/')
      .expect(200)
      .expect('"foo"')
      .end(done);
  });
});

////////////////////////////////////////////////////////////

function buildSimpleTests(methodName, specs) {
  // ['inputVal', 200, 'testDescription']
  // ['inputVal', { opts }, 200, 'testDescription']
  (specs || []).forEach(spec => {
    let testInput;
    let statusCode;
    let testDescription;
    let methodOpts;
    if (spec.length <= 3) {
      // ['inputVal', 200]
      // ['inputVal', 200, 'testDescription']
      testInput = spec[0];
      statusCode = spec[1];
      testDescription = spec[2];
    } else {
      // ['inputVal', { opts }, 200, 'testDescription']
      assert.equal(spec.length, 4);
      testInput = spec[0];
      methodOpts = spec[1];
      statusCode = spec[2];
      testDescription = spec[3];
    }
    it(testDescription, done => {
      const app = makeApp();
      app.use(function(ctx) {
        ctx.vals.test = testInput;
        ctx.validateQuery('test')[methodName](methodOpts);
      });
      request(app.listen()).get('/').expect(statusCode).end(done);
    });
  });
}

describe('Validator#isAlpha', () => {
  buildSimpleTests('isAlpha', [
    ['abc', 200, 'positive case works'],
    ['123', 418, 'negative case works'],
    ['', 200, 'passes on empty string']
  ]);
});

describe('Validator#isAlphanumeric', () => {
  buildSimpleTests('isAlphanumeric', [
    ['abc123', 200, 'positive case works'],
    ['abc123$', 418, 'negative case works'],
    ['', 200, 'passes on empty string']
  ]);
});

describe('Validator#isAscii', () => {
  buildSimpleTests('isAscii', [
    ['$1abc[]', 200, 'positive case works'],
    ['$abc123©', 418, 'negative case works'],
    ['', 200, 'passes on empty string']
  ]);
});

describe('Validator#isNumeric', () => {
  buildSimpleTests('isNumeric', [
    ['123', 200, 'positive case works'],
    ['abc123', 418, 'negative case works'],
    ['', 200, 'passes on empty string']
  ]);
});

describe('Validator#isBase64', () => {
  buildSimpleTests('isBase64', [
    ['aGVsbG8=', 200, 'positive case works'],
    ['aGVsbG8=$', 418, 'negative case works'],
    ['', 200, 'passes on empty string']
  ]);
});

describe('Validator#isEmail', () => {
  buildSimpleTests('isEmail', [
    ['kate@example.com', 200, 'positive case works'],
    ['kate', 418, 'negative case works'],
    ['', 418, 'throws on empty string']
  ]);
});

describe('Validator#isHexColor', () => {
  buildSimpleTests('isHexColor', [
    ['aaaaaa', 200, 'works with 6-digit'],
    ['#aaaaaa', 200, 'works with #6-digit'],
    ['aaa', 200, 'works with 3-digit'],
    ['#aaa', 200, 'works with #3-digit'],
    ['', 418, 'throws on empty string']
  ]);
});

describe('Validator#isUuid', () => {
  buildSimpleTests('isUuid', [
    [undefined,  418, 'does not blow up if val is undefined'],
    [42,         418, 'does not blow up if val is not string'],
    [new Date(), 418, 'does not blow up if val is not string'],
    // v3
    ['00000000-0000-3000-0000-000000000000', 'v3', 200, 'recognizes v3'],
    ['00000000-0000-4000-0000-000000000000', 'v3', 418, 'recognizes non-v3'],
    ['00000000-0000-4000-8000-000000000000', 'v4', 200, 'recognizes non-v3'],//v4
    // v4
    ['00000000-0000-4000-8000-000000000000', 'v4', 200, 'recognizes v4'],
    ['00000000-0000-4000-0000-000000000000', 'v4', 418, 'recognizes non-v4'],
    ['00000000-0000-3000-0000-000000000000', 'v4', 418, 'recognizes non-v4'],//v3
    // v5
    ['00000000-0000-5000-8000-000000000000', 'v5', 200, 'recognizes v5'],
    ['00000000-0000-5000-0000-000000000000', 'v5', 418, 'recognizes non-v5'],
    ['00000000-0000-3000-0000-000000000000', 'v5', 418, 'recognizes non-v5'],//v3
    ['00000000-0000-4000-8000-000000000000', 'v5', 418, 'recognizes non-v4'],//v4
    // all
    // - with explicit version set
    ['00000000-0000-3000-0000-000000000000', 'all', 200, 'explicit all: recognizes v3'],
    ['00000000-0000-4000-8000-000000000000', 'all', 200, 'explicit all: recognizes v4'],
    ['00000000-0000-5000-8000-000000000000', 'all', 200, 'explicit all: recognizes v5'],
    ['xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', 'all', 418, 'explicit all: recognizes non-uuid'],
    // - without explicit version set
    ['00000000-0000-3000-0000-000000000000', 200, 'default all: recognizes v3'],
    ['00000000-0000-4000-8000-000000000000', 200, 'default all: recognizes v4'],
    ['00000000-0000-5000-8000-000000000000', 200, 'default all: recognizes v5'],
    ['xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', 418, 'explicit all: recognizes non-uuid'],
    // case insensitive
    ['aaaaaaaa-aaaa-3aaa-aaaa-aaaaaaaaaaaa', 200, 'case-insensitive (lowercase)'],
    ['AAAAAAAA-AAAA-3AAA-AAAA-AAAAAAAAAAAA', 200, 'case-insensitive (uppercase)'],
  ]);
});

describe('Validator#isJson', () => {
  buildSimpleTests('isJson', [
    ['{}', 200],
    ['{ "foo": "bar" }', 200],
    ['{ "foo": ["bar", 42, true] }', 200],
    ['{ "foo": ["bar", 42, true }', 418],
    ['{ "foo: "bar" }', 418],
    ['{ "foo" }', 418],
  ]);
});

describe('Validator#encodeBase64', () => {
  it('works when given string with length>0', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals.test = 'hello'
      ctx.validateQuery('test').encodeBase64();
      ctx.body = JSON.stringify(ctx.vals.test);
    });
    request(app.listen())
      .get('/')
      .expect(200)
      .expect('"aGVsbG8="')
      .end(done);
  });

  it('encodes empty string to empty string', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals.test = ''
      ctx.validateQuery('test').encodeBase64();
      ctx.body = JSON.stringify(ctx.vals.test);
    });
    request(app.listen())
      .get('/')
      .expect(200)
      .expect('""')
      .end(done);
  });

  it('throws ValidationError if val is not string', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals.test = new Date();
      ctx.validateQuery('test').encodeBase64();
    });
    request(app.listen())
      .get('/')
      .expect(418)
      .end(done);
  });
});

describe('Validator#decodeBase64', () => {
  it('decodes a string of length>0', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals.test = 'aGVsbG8=';
      ctx.validateQuery('test').decodeBase64();
      ctx.body = ctx.vals.test;
    });
    request(app.listen())
      .get('/')
      .expect(200)
      .expect('hello')
      .end(done);
  });

  it('decodes empty string to empty string', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals.test = '';
      ctx.validateQuery('test').decodeBase64();
      ctx.body = ctx.vals.test;
    });
    request(app.listen())
      .get('/')
      .expect(200)
      .expect('')
      .end(done);
  });

  it('throws ValidationError if val is not string', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals.test = new Date();
      ctx.validateQuery('test').decodeBase64();
    });
    request(app.listen())
      .get('/')
      .expect(418)
      .end(done);
  });
});

////////////////////////////////////////////////////////////

describe('bouncer#check', () => {
  it('passes when truthy', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.check('this is ok');
    });
    request(app.listen())
      .get('/')
      .expect(200)
      .end(done);
  });

  it('throws ValidationError when falsey', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.check(false);
    });
    request(app.listen())
      .get('/')
      .expect(418)
      .end(done);
  })
});

describe('bouncer#checkNot', () => {
  it('passes when falsey', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.checkNot(false);
    });
    request(app.listen())
      .get('/')
      .expect(200)
      .end(done);
  });

  it('throws ValidationError when truthy', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.checkNot('this is ok');
    });
    request(app.listen())
      .get('/')
      .expect(418)
      .end(done);
  })
});

describe('Validator#clamp', () => {
  it('does not change val if min <= val <= max', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals.test = 42;
      ctx.validateQuery('test').clamp(0, 100);
      ctx.body = JSON.stringify(ctx.vals.test);
    });
    request(app.listen())
      .get('/')
      .expect(200)
      .expect('42')
      .end(done);
  });

  it('clamps val to min if val < min', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals.test = -1;
      ctx.validateQuery('test').clamp(0, 100);
      ctx.body = JSON.stringify(ctx.vals.test);
    });
    request(app.listen())
      .get('/')
      .expect(200)
      .expect('0')
      .end(done);
  });

  it('clamps val to max if val > max', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals.test = 101;
      ctx.validateQuery('test').clamp(0, 100);
      ctx.body = JSON.stringify(ctx.vals.test);
    });
    request(app.listen())
      .get('/')
      .expect(200)
      .expect('100')
      .end(done);
  });

  it('allows min === max', done => {
    const app = makeApp();
    app.use(function(ctx) {
      ctx.vals.test = -1;
      ctx.validateQuery('test').clamp(50, 50);
      ctx.body = JSON.stringify(ctx.vals.test);
    });
    request(app.listen())
      .get('/')
      .expect(200)
      .expect('50')
      .end(done);
  });
});

describe('when ctx getters return undefined', () => {
  it('getBody() does not err on member access', done => {
    const app = new koa();
    app.use(exposeBouncer);
    app.use(bouncer.middleware({
      getBody: ctx => undefined
    }));
    app.use(function(ctx) {
      ctx.validateBody('test');
      ctx.body = ctx.vals;
    });

    request(app.listen())
      .get('/')
      .expect(200)
      .expect({})
      .end(done);
  });

  it('getQuery() does not err on member access', done => {
    const app = new koa();
    app.use(exposeBouncer);
    app.use(bouncer.middleware({
      getQuery: ctx => undefined
    }));
    app.use(function(ctx) {
      ctx.validateQuery('test');
      ctx.body = ctx.vals;
    });

    request(app.listen())
      .get('/')
      .expect(200)
      .expect({})
      .end(done);
  });

  it('getParam() does not err on member access', done => {
    const app = new koa();
    app.use(exposeBouncer);
    app.use(bouncer.middleware({
      getParam: ctx => undefined
    }));
    app.use(function(ctx) {
      ctx.validateParam('test');
      ctx.body = ctx.vals;
    });

    request(app.listen())
      .get('/')
      .expect(200)
      .expect({})
      .end(done);
  });
});

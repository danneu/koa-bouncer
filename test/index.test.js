'use strict';
const request = require('supertest');
const koa = require('koa');
const assert = require('chai').assert;
const bouncer = require('../index.js');
const _ = require('lodash');

// returns 418 response if it catches a ValidationError
// for easy supertest testing
// TODO: find a better way to test koa-bouncer
var exposeBouncer = function*(next) {
  try {
    yield* next;
    this.status = 200;
  } catch(err){
    if (err instanceof bouncer.ValidationError) {
      this.status = 418;
      return;
      //this.throw('boom', 418);
    }
    err.expose = true;
    console.error(err);
    console.error(err.stack);
    throw err;
  }
};

function makeApp(opts) {
  const app = koa();
  app.use(bouncer.middleware(opts));
  app.use(exposeBouncer);
  return app;
}

////////////////////////////////////////////////////////////

describe('Validator', () => {
  it('populates this.vals on instantiation', (done) => {
    // i.e. does not require a Validation method to be called just to
    // populate this.vals[this.key]
    const app = makeApp();
    app.use(function*() {
      this.validateQuery('test');
      this.body = this.vals.test;
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
    app.use(function*() {
      this.validateQuery('test').checkPred(_.isArray);
    });
    request(app.listen()).get('/?test=a&test=b').expect(200).end(done);
  });
});

describe('Validator#checkPred', () => {
  it('works with arbitrary predicates', done => {
    const app = makeApp();
    app.use(function*() {
      this.validateQuery('test').checkNotPred(_.isArray);
    });
    request(app.listen()).get('/?test=a').expect(200).end(done);
  });
});

////////////////////////////////////////////////////////////

describe('Validator#required', () => {
  it('throws if val is undefined', done => {
    const app = makeApp();
    app.use(function*() {
      this.validateQuery('test').required();
    });
    request(app.listen()).get('/').expect(418).end(done);
  });

  it('does not throw if val is defined', done => {
    const app = makeApp();
    app.use(function*() {
      this.validateQuery('test').required();
    });
    request(app.listen()).get('/?test=42').expect(200).end(done);
  });

  it('does not throw if val is falsey', done => {
    const app = makeApp();
    app.use(function*() {
      // ensure the querystring parser actually does what i think it does
      assert.equal(0, this.query.test.length);
      this.validateQuery('test').required();
    });
    request(app.listen()).get('/?test=').expect(200).end(done);
  });
});

////////////////////////////////////////////////////////////

describe('Validator#isIn', () => {
  it('passes if item is in array', (done) => {
    const app = makeApp();
    app.use(function*() {
      this.validateQuery('test').isIn(['a', 'b', 'c']);
    });
    request(app.listen()).get('/?test=b').expect(200).end(done);
  });

  it('throws ValidationError if item is not in array', done => {
    const app = makeApp();
    app.use(function*() {
      this.validateQuery('test').isIn(['a', 'b', 'c']);
    });
    request(app.listen()).get('/?test=z').expect(418).end(done);
  });
});

////////////////////////////////////////////////////////////

describe('Validator#isNotIn', () => {
  it('throws ValidationError if item is in array', (done) => {
    const app = makeApp();
    app.use(function*() {
      this.validateQuery('test').isNotIn(['a', 'b', 'c']);
    });
    request(app.listen()).get('/?test=b').expect(418).end(done);
  });

  it('passes if item is not in array', done => {
    const app = makeApp();
    app.use(function*() {
      this.validateQuery('test').isNotIn(['a', 'b', 'c']);
    });
    request(app.listen()).get('/?test=z').expect(200).end(done);
  });
});

////////////////////////////////////////////////////////////

describe('Validator#isArray', () => {
  it('passes if val is array', (done) => {
    const app = makeApp();
    app.use(function*() {
      this.validateQuery('test').isArray();
    });
    request(app.listen()).get('/?test=a&test=b').expect(200).end(done);
  });

  it('throws ValidationError if val is not array', done => {
    const app = makeApp();
    app.use(function*() {
      this.validateQuery('test').isArray();
    });
    request(app.listen()).get('/?test=a').expect(418).end(done);
  });
});

////////////////////////////////////////////////////////////

describe('Validation#tap', () => {
  it('allows arbitrary value change', done => {
    const app = makeApp();
    app.use(function*() {
      this.validateQuery('test').tap(() => 'bar');
      this.body = this.vals.test;
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
      app.use(function*() {
        this.validateParam('test');
        this.body = this.vals.test;
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
      app.use(function*() {
        this.validateQuery('test');
        this.body = this.vals.test;
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
      app.use(function*() {
        this.validateBody('test');
        this.body = this.vals.test;
      });
      request(app.listen()).get('/').expect(200).expect('ccc').end(done);
    });
  });
});

////////////////////////////////////////////////////////////

describe('Validator#eq', () => {
  it('passes if strictly === equivalent', done => {
    const app = makeApp();
    app.use(function*() {
      this.validateQuery('test').eq('foo');
    });
    request(app.listen()).get('/?test=foo').expect(200).end(done);
  });

  it('throws ValidationError if only == equivalent', done => {
    const app = makeApp();
    app.use(function*() {
      assert.isString(this.query.test);  // check assumptions
      this.validateQuery('test').eq(2);
    });
    request(app.listen()).get('/?test=2').expect(418).end(done);
  });

  it('throws ValidationError for obvious inequality', done => {
    const app = makeApp();
    app.use(function*() {
      this.validateQuery('test').eq(['a', 'b', 'c']);
    });
    request(app.listen()).get('/').expect(418).end(done);
  });
});

describe('Validator#gt', () => {
  it('passes if val > target', done => {
    const app = makeApp();
    app.use(function*() {
      this.vals['test'] = 11;
      this.validateQuery('test').gt(10);
    });
    request(app.listen()).get('/').expect(200).end(done);
  });

  it('throws ValidationError if val === target', done => {
    const app = makeApp();
    app.use(function*() {
      this.vals['test'] = 10;
      this.validateQuery('test').gt(10);
    });
    request(app.listen()).get('/').expect(418).end(done);
  });

  it('throws ValidationError if val < target', done => {
    const app = makeApp();
    app.use(function*() {
      this.vals['test'] = 9;
      this.validateQuery('test').gt(10);
    });
    request(app.listen()).get('/').expect(418).end(done);
  });
});

describe('Validator#gte', () => {
  it('passes if val > target', done => {
    const app = makeApp();
    app.use(function*() {
      this.vals['test'] = 11;
      this.validateQuery('test').gte(10);
    });
    request(app.listen()).get('/').expect(200).end(done);
  });

  it('passes if val === target', done => {
    const app = makeApp();
    app.use(function*() {
      this.vals['test'] = 10;
      this.validateQuery('test').gte(10);
    });
    request(app.listen()).get('/').expect(200).end(done);
  });

  it('throws ValidationError if val < target', done => {
    const app = makeApp();
    app.use(function*() {
      this.vals['test'] = 9;
      this.validateQuery('test').gte(10);
    });
    request(app.listen()).get('/').expect(418).end(done);
  });
});

describe('Validator#lt', () => {
  it('passes if val < target', done => {
    const app = makeApp();
    app.use(function*() {
      this.vals['test'] = 9;
      this.validateQuery('test').lt(10);
    });
    request(app.listen()).get('/').expect(200).end(done);
  });

  it('throws ValidationError if val === target', done => {
    const app = makeApp();
    app.use(function*() {
      this.vals['test'] = 10;
      this.validateQuery('test').lt(10);
    });
    request(app.listen()).get('/').expect(418).end(done);
  });

  it('throws ValidationError if val > target', done => {
    const app = makeApp();
    app.use(function*() {
      this.vals['test'] = 11;
      this.validateQuery('test').lt(10);
    });
    request(app.listen()).get('/').expect(418).end(done);
  });
});

describe('Validator#lte', () => {
  it('passes if val < target', done => {
    const app = makeApp();
    app.use(function*() {
      this.vals['test'] = 9;
      this.validateQuery('test').lte(10);
    });
    request(app.listen()).get('/').expect(200).end(done);
  });

  it('passes if val === target', done => {
    const app = makeApp();
    app.use(function*() {
      this.vals['test'] = 10;
      this.validateQuery('test').lte(10);
    });
    request(app.listen()).get('/').expect(200).end(done);
  });

  it('throws ValidationError if val > target', done => {
    const app = makeApp();
    app.use(function*() {
      this.vals['test'] = 11;
      this.validateQuery('test').lte(10);
    });
    request(app.listen()).get('/').expect(418).end(done);
  });
});

////////////////////////////////////////////////////////////

describe('Validator#isLength', () => {
  it('throws ValidationError if length < min', done => {
    const app = makeApp();
    app.use(function*() {
      this.vals['test'] = [1, 2];
      this.validateQuery('test').isLength(3, 5);
    });
    request(app.listen()).get('/').expect(418).end(done);
  });

  it('passes if length === min', done => {
    const app = makeApp();
    app.use(function*() {
      this.vals['test'] = [1, 2, 3];
      this.validateQuery('test').isLength(3, 5);
    });
    request(app.listen()).get('/').expect(200).end(done);
  });

  it('passes if min < length < max', done => {
    const app = makeApp();
    app.use(function*() {
      this.vals['test'] = [1, 2, 3, 4];
      this.validateQuery('test').isLength(3, 5);
    });
    request(app.listen()).get('/').expect(200).end(done);
  });

  it('passes if length === max', done => {
    const app = makeApp();
    app.use(function*() {
      this.vals['test'] = [1, 2, 3, 4, 5];
      this.validateQuery('test').isLength(3, 5);
    });
    request(app.listen()).get('/').expect(200).end(done);
  });

  it('throws ValidationError if length > max', done => {
    const app = makeApp();
    app.use(function*() {
      this.vals['test'] = [1, 2, 3, 4, 5, 6];
      this.validateQuery('test').isLength(3, 5);
    });
    request(app.listen()).get('/').expect(418).end(done);
  });
});

describe('Validator#defaultTo', () => {
  it('sets val to x if val it is undefined and x is not a function', done => {
    const app = makeApp();
    app.use(function*() {
      this.validateQuery('test').defaultTo('foo');
      this.body = this.vals.test;
    });
    request(app.listen()).get('/').expect(200).expect('foo').end(done);
  });

  it('sets val to x if val it is undefined and x is a function', done => {
    const app = makeApp();
    app.use(function*() {
      this.validateQuery('test').defaultTo(() => 'foo');
      this.body = this.vals.test;
    });
    request(app.listen()).get('/').expect(200).expect('foo').end(done);
  });

  it('function passed to defaultTo can access Koa ctx with `this`', done => {
    const app = makeApp();
    app.use(function*() {
      this.canYouReadMe = true;
      this.validateQuery('test').defaultTo(function() {
        return this.canYouReadMe;
      });
      this.body = JSON.stringify(this.vals.test);
    });
    request(app.listen()).get('/').expect(200).expect('true').end(done);
  });

  it('does not set val if val is only falsey', done => {
    const app = makeApp();
    app.use(function*() {
      this.vals.test1 = '';
      this.vals.test2 = 0;
      this.vals.test3 = false;
      this.vals.test4 = null;
      this.validateQuery('test1').defaultTo('foo');
      this.validateQuery('test2').defaultTo('foo');
      this.validateQuery('test3').defaultTo('foo');
      this.validateQuery('test4').defaultTo('foo');
      assert.notMatch(_.values(this.vals).join(''), /foo/);
    });
    request(app.listen()).get('/').expect(200).end(done);
  });
});

describe('Validator#isString', () => {
  it('passes if val is string', done => {
    const app = makeApp();
    app.use(function*() {
      this.validateQuery('test').isString();
    });
    request(app.listen()).get('/?test=foo').expect(200).end(done);
  });

  it('throws ValidationError if val is not a string', done => {
    const app = makeApp();
    app.use(function*() {
      this.vals.test = 42;
      this.validateQuery('test').isString();
    });
    request(app.listen()).get('/').expect(418).end(done);
  });
});

describe('Validator#toString', () => {
  it('works', done => {
    const app = makeApp();
    app.use(function*() {
      this.vals.test = [1, 2, 3];
      this.validateQuery('test').toString();
      this.body = this.vals.test;
    });
    request(app.listen())
      .get('/')
      .expect(200)
      .expect('1,2,3')
      .end(done);
  });

  it('converts null/undefined into empty string', done => {
    const app = makeApp();
    app.use(function*() {
      this.vals.test1 = null;
      this.vals.test2 = undefined;
      this.validateQuery('test1').toString();
      this.validateQuery('test2').toString();
      assert.equal(this.vals.test1, '');
      assert.equal(this.vals.test2, '');
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
    app.use(function*() {
      this.vals.test = '  foo  ';
      this.validateQuery('test').trim();
      this.body = this.vals.test.length.toString();
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
    app.use(function*() {
      this.vals.test = 5;
      this.validateQuery('test').isInt();
    });
    request(app.listen())
      .get('/')
      .expect(200)
      .end(done);
  });

  it('throws ValidationError if val is obviously not an integer', done => {
    const app = makeApp();
    app.use(function*() {
      this.vals.test = '5';
      this.validateQuery('test').isInt();
    });
    request(app.listen())
      .get('/')
      .expect(418)
      .end(done);
  });

  it('passes if val is a decimal that lands on .00', done => {
    const app = makeApp();
    app.use(function*() {
      this.vals.test = 5.00;
      this.validateQuery('test').isInt();
    });
    request(app.listen())
      .get('/')
      .expect(200)
      .end(done);
  });

  it('throws ValidationError if val is a decimal that does not land on .0', done => {
    const app = makeApp();
    app.use(function*() {
      this.vals.test = 5.0001;
      this.validateQuery('test').isInt();
    });
    request(app.listen())
      .get('/')
      .expect(418)
      .end(done);
  });

  it('throws ValidationError if val is not a safe integer', done => {
    const app = makeApp();
    app.use(function*() {
      this.vals.test = Number.MAX_SAFE_INTEGER + 1;
      this.validateQuery('test').isInt();
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
    app.use(function*() {
      this.vals.test = '5';
      this.validateQuery('test').toInt();
      this.body = this.vals.test.toString();
    });
    request(app.listen())
      .get('/')
      .expect(200)
      .expect('5')
      .end(done);
  });

  it('throws ValidationError if val has extraneous non-integer chars', done => {
    const app = makeApp();
    app.use(function*() {
      this.vals.test = '5.67abc';
      this.validateQuery('test').toInt();
    });
    request(app.listen())
      .get('/')
      .expect(418)
      .end(done);
  });

  it('throws ValidationError if val cannot parse into an integer', done => {
    const app = makeApp();
    app.use(function*() {
      this.vals.test = 'abc';
      this.validateQuery('test').toInt();
    });
    request(app.listen())
      .get('/')
      .expect(418)
      .end(done);
  });

  it('throws ValidationError if val parses into unsafe integer', done => {
    const app = makeApp();
    app.use(function*() {
      this.vals.test = (Number.MAX_SAFE_INTEGER + 1).toString();
      this.validateQuery('test').toInt();
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
    app.use(function*() {
      this.vals.test = 1.67;
      this.validateQuery('test').isFiniteNumber();
    });
    request(app.listen())
      .get('/')
      .expect(200)
      .end(done);
  });

  it('throws ValidationError if val is Infinity', done => {
    const app = makeApp();
    app.use(function*() {
      this.vals.test = Infinity;
      this.validateQuery('test').isFiniteNumber();
    });
    request(app.listen())
      .get('/')
      .expect(418)
      .end(done);
  });

  // ensure it doesn't behave like the old global isFinite impl
  it('throws ValidationError if val is null', done => {
    const app = makeApp();
    app.use(function*() {
      this.vals.test = null;
      this.validateQuery('test').isFiniteNumber();
    });
    request(app.listen())
      .get('/')
      .expect(418)
      .end(done);
  });
});


describe('Validator#toFloat', () => {
  it('passes when val can parse into float', done => {
    const app = makeApp();
    app.use(function*() {
      this.vals.test = '05.67';
      this.validateQuery('test').toFloat();
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
      this.validateQuery('test').toFloat();
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
      this.validateQuery('test').toFloat();
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
    app.use(function*() {
      this.validateQuery('test').toArray();
      this.body = JSON.stringify(this.vals.test);
    });
    request(app.listen())
      .get('/')
      .expect(200)
      .expect('[]')
      .end(done);
  });

  it('converts defined non-array val to [val]', done => {
    const app = makeApp();
    app.use(function*() {
      this.vals.test = 42;
      this.validateQuery('test').toArray();
      this.body = JSON.stringify(this.vals.test);
    });
    request(app.listen())
      .get('/')
      .expect(200)
      .expect('[42]')
      .end(done);
  });

  it('does nothing if val is already an array', done => {
    const app = makeApp();
    app.use(function*() {
      this.vals.test = [1, 2, 3];
      this.validateQuery('test').toArray();
      this.body = JSON.stringify(this.vals.test);
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
    app.use(function*() {
      this.vals.test = [];
      this.validateQuery('test').toInts();
      this.body = JSON.stringify(this.vals.test);
    });
    request(app.listen())
      .get('/')
      .expect(200)
      .expect('[]')
      .end(done);
  });

  it('passes if string array parses fully into integer array', done => {
    const app = makeApp();
    app.use(function*() {
      this.vals.test = ['1', '2', '3'];
      this.validateQuery('test').toInts();
      this.body = JSON.stringify(this.vals.test);
    });
    request(app.listen())
      .get('/')
      .expect(200)
      .expect('[1,2,3]')
      .end(done);
  });

  it('throws ValidationError if an item does not fully parse into integer', done => {
    const app = makeApp();
    app.use(function*() {
      this.vals.test = ['1', '2', NaN];
      this.validateQuery('test').toInts();
    });
    request(app.listen())
      .get('/')
      .expect(418)
      .end(done);
  });

  it('throws ValidationError if an item is not a safe integer', done => {
    const app = makeApp();
    app.use(function*() {
      this.vals.test = ['1', '2', (Number.MAX_SAFE_INTEGER + 1).toString()];
      this.validateQuery('test').toInts();
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
    app.use(function*() {
      this.vals.test = [1, 2, 2, 2, 3];
      this.validateQuery('test').uniq();
      this.body = JSON.stringify(this.vals.test);
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
    app.use(function*() {
      this.vals.test1 = {};
      this.vals.test2 = null;
      this.validateQuery('test1').toBoolean();
      this.validateQuery('test2').toBoolean();
      this.body = JSON.stringify([
        this.vals.test1, this.vals.test2
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
    app.use(function*() {
      this.vals.test1 = 'false';
      this.validateQuery('test1').toBoolean();
      this.body = JSON.stringify(this.vals.test1);
    });
    request(app.listen())
      .get('/')
      .expect(200)
      .expect('true')
      .end(done);
  });

  it('considers val="off" truthy', done => {
    const app = makeApp();
    app.use(function*() {
      this.vals.test1 = 'off';
      this.validateQuery('test1').toBoolean();
      this.body = JSON.stringify(this.vals.test1);
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
    app.use(function*() {
      this.vals.test = 'foobar';
      this.validateQuery('test').match(/^foo/);
    });
    request(app.listen())
      .get('/')
      .expect(200)
      .end(done);
  });

  it('throws ValidationError if regex test fails', done => {
    const app = makeApp();
    app.use(function*() {
      this.vals.test = 'foobar';
      this.validateQuery('test').match(/^foo$/);
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
    app.use(function*() {
      this.vals.test = 'barfoo';
      this.validateQuery('test').notMatch(/^foo/);
    });
    request(app.listen())
      .get('/')
      .expect(200)
      .end(done);
  });

  it('throws ValidationError if regex test passes', done => {
    const app = makeApp();
    app.use(function*() {
      this.vals.test = 'foobar';
      this.validateQuery('test').notMatch(/^foo/);
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
    app.use(function*() {
      this.validateQuery('test').check(true);
    });
    request(app.listen())
      .get('/')
      .expect(200)
      .end(done);
  });

  it('throws Validation Error when val is falsey', done => {
    const app = makeApp();
    app.use(function*() {
      this.validateQuery('test').check(false);
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
    app.use(function*() {
      this.validateQuery('test').checkNot(false);
    });
    request(app.listen())
      .get('/')
      .expect(200)
      .end(done);
  });

  it('throws Validation Error when val is truthy', done => {
    const app = makeApp();
    app.use(function*() {
      this.validateQuery('test').checkNot(true);
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
    app.use(function*() {
      this.vals.test1 = '{ "foo": "bar" }';
      this.vals.test2 = 'true';
      this.validateQuery('test1').fromJson();
      this.validateQuery('test2').fromJson();
      this.body = JSON.stringify([this.vals.test1.foo, this.vals.test2]);
    });
    request(app.listen())
      .get('/')
      .expect(200)
      .expect('["bar",true]')
      .end(done);
  });

  it('throws ValidationError if val is not valid JSON', done => {
    const app = makeApp();
    app.use(function*() {
      this.vals.test = '{ foo: bar }';
      this.validateQuery('test').fromJson();
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
    app.use(function*() {
      this.vals.test = '{ "foo": "bar" }';

      this.validateQuery('test')
        .required()
        .fromJson()
        .tap(x => x.foo)
        .tap(x => '5' + x)
        .tap(x => Number.parseInt(x, 10))
        .toArray()
        .toInts();

      this.body = JSON.stringify(this.vals.test);
    });
    request(app.listen())
      .get('/')
      .expect(200)
      .expect('[5]')
      .end(done);
  });

  it('works with optional()', done => {
    const app = makeApp();
    app.use(function*() {
      this.vals.test = undefined;

      this.validateQuery('test')
        .optional()
        .fromJson()
        .tap(x => x.foo)
        .tap(x => '5' + x)
        .tap(x => Number.parseInt(x, 10))
        .toArray()
        .toInts();

      this.body = String(this.vals.test);
    });
    request(app.listen())
      .get('/')
      .expect(200)
      .expect('undefined')
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
    app.use(function*() {
      this.vals.test = 0;

      this.validateQuery('test')
        .tap(n => n + 1);

      this.validateQuery('test')
        .tap(n => n + 1);

      this.body = JSON.stringify(this.vals.test);
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
    app.use(function*() {
      this.vals.test = undefined;

      this.validateQuery('test')
        .optional()
        .check(false);
    });
    request(app.listen())
      .get('/')
      .expect(200)
      .end(done);
  });

  it('continues when val is defined', done => {
    const app = makeApp();
    app.use(function*() {
      this.vals.test = 42;
      this.validateQuery('test')
        .optional()
        .check(false);
    });
    request(app.listen())
      .get('/')
      .expect(418)
      .end(done);
  });

  // random non-general checks

  it('short-circuits isIn when val is undefined', done => {
    const app = makeApp();
    app.use(function*() {
      this.vals.test = undefined;

      this.validateQuery('test')
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
    app.use(function*() {
      this.vals.test = undefined;

      this.validateQuery('test')
        .optional()
        .eq(42);
    });
    request(app.listen())
      .get('/')
      .expect(200)
      .end(done);
  });
});

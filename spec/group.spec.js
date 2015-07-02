'use strict';

var test = require('tape'),
    G = require('../').Group,
    fs = require('fs');


var kitty = {name: 'robert', gender: 'male'};

function asyncKitty(callback/*(err, value)*/) {
    process.nextTick(function() {
        callback(null, kitty);
    });
}

function asyncSpreadKitty(callback/*(err, name, gender)*/) {
    process.nextTick(function() {
        callback(null, kitty.name, kitty.gender);
    });
}


test('Wrapping single async call', function(assert) {
    var group = new G();
    asyncKitty(group.slot());
    group.then(function(err, val) {
        assert.error(err);
        assert.equal(val, kitty);
        assert.end();
    });
});


test('Handle all response arguments of the async call', function(assert) {
    var group = new G();
    asyncSpreadKitty(group.slot('multi'));
    group.then(function(err, response) {
        assert.error(err);
        assert.equal(response.length, 2);
        assert.equal(response[0], kitty.name);
        assert.equal(response[1], kitty.gender);
        assert.end();
    });
});

test('Forgetting to call slot() when passing as a callback', function(assert) {
    var group = new G();
    //assert.throws() will try to call it without providing `this`
    assert.throws(group.slot, /Forgot to call/);
    assert.end();
});

test('Starting chain with `when`', function(assert) {
    var error = new Error('hello');
    G.when(
        error
    ).fail(function(err) {
        assert.equal(err, error);
        G.when(
            null, 'message'
        ).anyway(function(err, message) {
            assert.error(err);
            assert.equal(message, 'message');
            assert.end();
        });
    });
});

test('Resolving group with synchronous data via `pass`', function(assert) {
    G.chain(function() {
        this.pass();
    }).then(function(err, val) {
        assert.error(err);
        assert.equal(arguments.length, 2);
        assert.equal(val, undefined);

        this.pass('one', 'two', 'three');
        this.pass([1, 2, 3]);
    }).then(function(err, val1, val2, val3, val4) {
        assert.error(err);
        assert.deepEqual(
            [].slice.call(arguments, 1),
            ['one', 'two', 'three', [1, 2, 3]]);

        this.pass(null);
        this.pass(undefined);
        this.pass(0);
        this.pass('');
        this.pass();
    }).then(function(err) {
        assert.error(err);
        assert.deepEqual(
            [].slice.call(arguments, 1),
            [null, undefined, 0, '', undefined]);

        assert.end();
    });
});

test('Wrapping two concurrent async calls', function(assert) {
    G.chain(function() {
        asyncKitty(this.slot());
        this.pass(kitty);
    }).then(function(err, val1, val2) {
        assert.error(err);
        assert.equal(val1, kitty);
        assert.equal(val2, kitty);
        assert.end();
    });
});

test('Queuing several callbacks', function(assert) {
    G.chain(function() {
        var group2 = new G();
        asyncKitty(group2.slot());
        group2.then(this.slot());
        group2.then(this.slot());
    }).then(function(err, val1, val2) {
        assert.error(err);
        assert.equal(val1, kitty);
        assert.equal(val2, kitty);
        assert.end();
    });
});

test('Queuing callback of the resolved group', function(assert) {
    var group = new G();
    asyncKitty(group.slot());
    group.then(function(err, text) {
        assert.equal(group.resolved, 'fulfilled');
        group.then(function(err, val) {
            assert.error(err);
            assert.equal(val, kitty);
            assert.end();
        });
    });
});

test('Wrapping a function in the group-sandbox', function(assert) {
    var promise = new G().fbind(function(val) {
        this.pass(val);
        asyncKitty(this.slot());
    });
    promise('test').then(function(err, text, val) {
        assert.error(err);
        assert.equal(text, 'test');
        assert.equal(val, kitty);
        assert.end();
    });
});

test('resolving a group with empty args', function(assert) {
    new G().resolve().anyway(assert.end);
});

test('erroring a group', function(assert) {
    new G().error('hello').anyway(function(err) {
        assert.equal(err, 'hello');
        assert.end();
    });
});

test('Propagating value if no callback given', function(assert) {
    var error = new Error('Hello error');
    G.chain(function() {
        asyncKitty(this.slot());
    }).then(null, function(err) {
        assert.fail('never should be called');
    }).anyway(function(err, val) {
        assert.error(err);
        assert.equal(val, kitty);
        assert.end();
    });
});

test('Propagating error without errbacks', function(assert) {
    var error = new Error('Hello error');
    G.chain(function() {
        throw error;
    }).then(function(err) {
        assert.fail('never should be called');
    }).anyway(function(err) {
        assert.equal(err, error);
        assert.end();
    });
});

test('Handling errors in the middle', function(assert) {
    var error = new Error('Hello error');
    G.chain(function() {
        throw error;
    }).then(function(err) {
        assert.fail('never should be called');
    }).then(null, function(err) {
        assert.ok(err);
        asyncKitty(this.slot());
    }).anyway(function(err, val) {
        assert.error(err);
        assert.equal(val, kitty);
        assert.end();
    });
});

test('slotGroup is an alias for subgroup', function(assert) {
    var g = new G();
    assert.equal(g.subgroup, g.slotGroup);
    assert.end();
});

test('Creating dependent group via slotGroup', function(assert) {
    G.chain(function() {
        this.pass('pass');
        asyncKitty(this.slot());
        this.slotGroup().fcall(function() {
            this.pass('pass2');
            asyncKitty(this.slot());
        });
    }).anyway(function(err, sync, async, group) {
        assert.error(err);
        assert.equal(sync, 'pass');
        assert.equal(async, kitty);
        assert.equal(group[0], 'pass2');
        assert.equal(group[1], kitty);
        assert.end();
    });
});

test('Handling error in slotGroup', function(assert) {
    G.chain(function() {
        this.pass('pass');
        this.slotGroup().fcall(function() {
            throw 'Boom';
        });
    }).anyway(function(err) {
        assert.equal(err, 'Boom');
        assert.end();
    });
});

test('Sharing the same `options` object through the chain', function(assert) {
    new G({message: 'hello'}).fcall(function() {
        this.pass(this.options.message);
    }).then(function(err, message) {
        assert.error(err);
        assert.equal(this.options.message, message);
        this.options.response = 'hi';
        this.pass(this.options.response);
        this.options = {}; //should have no effect
    }).anyway(function(err, response) {
        assert.error(err);
        assert.equal(this.options.response, response);
        assert.end();
    });
});

test('Shortcut `this.self` for `this.options.self`', function(assert) {
    new G({self: {message: 'hello'}}).fcall(function() {
        assert.equal(this.self.message, this.options.self.message);
        this.pass(this.self);
    }).anyway(function(err, self) {
        assert.error(err);
        assert.equal(this.self.message, self.message);
        assert.end();
    });
});

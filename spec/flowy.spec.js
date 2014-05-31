'use strict';

var test = require('tape'),
    Flowy = require('../'),
    fs = require('fs');

var kitty = {name: 'robert', gender: 'male'};

function asyncKitty(callback/*(err, value)*/) {
    process.nextTick(function() {
        callback(null, kitty);
    });
}

function asyncEcho(val, callback) {
    process.nextTick(function() {
        callback(null, val);
    });
}

test('calling step with less than two steps', function(assert) {
    try {
        Flowy();
    } catch(e) {
        assert.ok(e);
        assert.end();
    }
});

test('simple function chaining', function(assert) {
    assert.plan(5);

    Flowy(
        function() {
            //parallel execution of async calls
            asyncKitty(this.slot());
            asyncEcho('hello kitty', this.slot());
        },
        function(err, val, hello) {
            assert.equal(val, kitty);
            assert.equal(hello, 'hello kitty');
            this.pass(kitty.name.toUpperCase(), 'uppercasing');
        },
        function(err, text, whatWeHaveDone) {
            assert.error(err);
            assert.equal(text, kitty.name.toUpperCase());
            assert.equal(whatWeHaveDone, 'uppercasing');
            //breaking step flow
        },
        function() {
            assert.fail('should not be there');
        }
    );
});

test('should throw error and catch it in last callback', function(assert) {
    var error = new Error("hello error!");
    Flowy(
        function() {
            throw error;
        },
        function(err) {
            assert.fail('should not be there');
        },
        function(err) {
            assert.fail('should not be there');
        },
        function(err) {
            assert.equal(err, error);
            assert.end();
        }
    );
});

test('sync values are handled asynchronously', function(assert) {
    Flowy(
        function() {
            asyncKitty(this.slot());
            this.pass('test');

            var group = this.slotGroup();
            for (var i = 0; i < 5; i++) {
                group.pass('test' + i);
            }
            for (var i = 5; i < 10; i++) {
                asyncEcho('test' + i, group.slot());
            }
        },
        function(err, async, sync, group) {
            assert.error(err);
            assert.equal(async, kitty);
            assert.equal(sync, 'test');
            assert.equal(group.length, 10);
            assert.equal(group[0], 'test0');
            assert.equal(group[9], 'test9');
            assert.end();
        }
    );
});

test('simple combined function test', function(assert) {
    var multifun = Flowy.compose(
        function(err, val) {
            asyncEcho(val, this.slot());
        },
        function(err, text) {
            this.pass(text.toUpperCase());
        }
    );

    Flowy(
        function() {
            asyncKitty(this.slot());
        },
        function(err, pet) {
            multifun(pet.name, this.slot());
        },
        function(err, text) {
            assert.error(err);
            assert.equal(text, kitty.name.toUpperCase());
            assert.end();
        }
    );
});

test('saving the context of the composed function', function(assert) {
    var multifun = Flowy.compose(
        function() {
            this.pass(this.self);
        },
        function(err, self) {
            assert.equal(this.self, self);
            assert.equal(this.self, this.options.self);
            this.pass(self);
        }
    );

    var context = {message: 'hello'};
    multifun.call(context, function(err, self) {
        assert.equal(self.message, context.message);
        assert.end(err);
    });
});

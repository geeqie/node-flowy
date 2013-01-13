'use strict';
var G = require('../lib/flowy').Group,
    fs = require('fs');

var standard = fs.readFileSync(__filename, 'utf8');
function afun(callback) {
    fs.readFile(__filename, 'utf8', callback);
}
function afunMultiArgs(callback) {
    fs.readFile(__filename, 'utf8', function(err, text) {
        callback(err, text, __filename);
    });
}

describe('Testing group functionality', function() {
    it('Wrapping single async call', function(done) {
        var group = new G();
        afun(group.slot());
        group.then(function(err, text) {
            expect(text).toEqual(standard);
            done(err);
        });
    });

    it('Handle all response arguments of the async call', function(done) {
        var group = new G();
        afunMultiArgs(group.slot('multi'));
        group.then(function(err, response) {
            expect(response.length).toBe(2);
            expect(response[0]).toBe(standard);
            expect(response[1]).toBe(__filename);
            done(err);
        });
    });

    it('Starting chain with `when`', function(done) {
        var error = new Error('hello');
        G.when(
            error
        ).fail(function(err) {
            expect(err).toBe(error);
            G.when(
                null, 'message'
            ).anyway(function(err, message) {
                expect(message).toBe('message');
                done(err);
            });
        });
    });

    it('Wrapping two concurrent async calls', function(done) {
        G.chain(function() {
            afun(this.slot());
            this.pass(standard);
        }).then(function(err, text1, text2) {
            expect(text1).toEqual(standard);
            expect(text2).toEqual(standard);
            done(err);
        });
    });

    it('Queuing several callbacks', function(done) {
        G.chain(function() {
            var group2 = new G();
            afun(group2.slot());
            group2.then(this.slot());
            group2.then(this.slot());
        }).then(function(err, text1, text2) {
            expect(text1).toEqual(standard);
            expect(text2).toEqual(standard);
            done(err);
        });
    });

    it('Queuing callback of the resolved group', function(done) {
        var group = new G();
        afun(group.slot());
        group.then(function(err, text) {
            expect(group.resolved).toEqual('fulfilled');
            group.then(function(err, text) {
                expect(text).toEqual(standard);
                done(err);
            });
        });
    });

    it('Wrapping a function in the group-sandbox', function(done) {
        var promise = new G().fbind(function(val) {
            this.pass(val);
            afun(this.slot());
        });
        promise('test').then(function(err, val, text) {
            expect(val).toBe('test');
            expect(text).toBe(standard);
            done(err);
        });
    });

    it('resolving a group with empty args', function(done) {
        new G().resolve().anyway(done);
    });

    it('erroring a group', function(done) {
        new G().error('hello').anyway(function(err) {
            expect(err).toBe('hello');
            done();
        });
    });

    it('Propagating value if no callback given', function(done) {
        var error = new Error('Hello error');
        G.chain(function() {
            afun(this.slot());
        }).then(null, function(err) {
            //never should be called
            expect(1).toBe(2);
        }).anyway(function(err, text) {
            expect(text).toBe(standard);
            done(err);
        });
    });

    it('Propagating error without errbacks', function(done) {
        var error = new Error('Hello error');
        G.chain(function() {
            throw error;
        }).then(function(err) {
            //never should be called
            expect(1).toBe(2);
        }).anyway(function(err) {
            expect(err).toBe(error);
            done();
        });
    });

    it('Handling errors in the middle', function(done) {
        var error = new Error('Hello error');
        G.chain(function() {
            throw error;
        }).then(function(err) {
            //never should be called
            expect(1).toBe(2);
        }).then(null, function(err) {
            afun(this.slot());
        }).anyway(function(err, text) {
            expect(text).toBe(standard);
            done(err);
        });
    });

    it('Creating dependent group via slotGroup', function(done) {
        G.chain(function() {
            this.pass('pass');
            afun(this.slot());
            this.slotGroup().fcall(function() {
                this.pass('pass2');
                afun(this.slot());
            });
        }).anyway(function(err, sync, async, group) {
            expect(sync).toBe('pass');
            expect(async).toBe(standard);
            expect(group[0]).toBe('pass2');
            expect(group[1]).toBe(standard);
            done(err);
        });
    });

    it('Sharing the same `options` object through the chain', function(done) {
        new G({message: 'hello'}).fcall(function() {
            this.pass(this.options.message);
        }).then(function(err, message) {
            expect(this.options.message).toBe(message);
            this.options.response = 'hi';
            this.pass(this.options.response);
            this.options = {}; //should have no effect
        }).anyway(function(err, response) {
            expect(this.options.response).toBe(response);
            done(err);
        });
    });

    it('Shortcut `this.self` for `this.options.self`', function(done) {
        new G({self: {message: 'hello'}}).fcall(function() {
            expect(this.self.message).toBe(this.options.self.message);
            this.pass(this.self);
        }).anyway(function(err, self) {
            expect(this.self.message).toBe(self.message);
            done(err);
        });
    });
});

'use strict';

var Step = require('../../lib/twoStep').Step,
    fs = require('fs');

var standard = fs.readFileSync(__filename, 'utf8');
function afun(callback) {
    fs.readFile(__filename, 'utf8', callback);
}
function echoAsync(val, callback) {
    process.nextTick(function() {
        callback(null, val);
    });
}

describe('Step usage', function() {

    it('calling step with less than two steps', function() {
        try {
            Step();
        } catch(e) {
            expect(e).toBeTruthy();
        }
    });

    it('simple function chaining', function(done) {
        Step(
            function() {
                //parallel execution of async calls
                afun(this.slot());
                echoAsync('timeouted', this.slot());
            },
            function(err, text, timeouted) {
                expect(text).toBe(standard);
                expect(timeouted).toBe('timeouted');
                this.pass(text.toUpperCase(), 'uppercasing');
            },
            function(err, text, whatWeHaveDone) {
                done(err);
                expect(text).toBe(standard.toUpperCase());
                expect(whatWeHaveDone).toBe('uppercasing');
                //breaking step flow
            },
            function() {
                done(new Error('should not be there'));
            }
        );
    });

    it('Handling errors on the way', function(done) {
        var error = new Error("hello error!");
        Step(
            function() {
                throw(error);
            },
            function(err) {
                expect(err).toBe(error);
                this.pass(null);
            },
            function(err) {
                expect(err).toBeFalsy();
                throw(error);
            },
            Step.throwIfError(function(err) {
                done(new Error('should not be here'));
            }),
            function(err) {
                expect(err).toEqual(error);
                done();
            }
        );
    });

    it('sync values are handled asynchronously', function(done) {
        Step(
            function() {
                afun(this.slot());
                this.pass('test');

                var group = this.makeGroup();
                for (var i = 0; i < 5; i++) {
                    group.pass('test' + i);
                }
                for (var i = 5; i < 10; i++) {
                    echoAsync('test' + i, group.slot());
                }
            },
            function(err, async, sync, group) {
                done(err);
                expect(async).toBe(standard);
                expect(sync).toBe('test');
                expect(group.length).toBe(10);
                expect(group[0]).toBe('test0');
                expect(group[9]).toBe('test9');
            }
        );
    });

    it('simple combined function test', function(done) {
        var multifun = Step.fn(
            function(val) {
                echoAsync(val, this.slot());
            },
            function(err, text) {
                this.pass(text.toUpperCase());
            }
        );

        Step(
            function() {
                afun(this.slot());
            },
            function(err, text) {
                multifun(text, this.slot());
            },
            function(err, text) {
                done(err);
                expect(text).toBe(standard.toUpperCase());
            }
        );
    });
});

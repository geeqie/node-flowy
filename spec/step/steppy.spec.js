'use strict';

var Steppy = require('../../lib/twoStep').Steppy,
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

describe('Steppy usage', function() {
    it('should throw error and catch it in last callback', function(done) {
        var error = new Error("hello error!");
        Steppy(
            function() {
                throw error;
            },
            function(err) {
                done(new Error('should not be there'));
            },
            function(err) {
                done(new Error('should not be there'));
            },
            function(err) {
                expect(err).toEqual(error);
                done();
            }
        );
    });
});

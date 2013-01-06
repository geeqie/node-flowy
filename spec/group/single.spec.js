'use strict';
var G = require('../../lib/twoStep').Group,
    fs = require('fs');

describe('Testing single group functionality', function() {
    it('Wrapping single async call', function(done) {
        var selfText = fs.readFileSync(__filename, 'utf8');
        var group = new G(function(err, text) {
            expect(selfText).toEqual(text);
            done(err);
        });
        fs.readFile(__filename, 'utf8', group.slot());
    });
});

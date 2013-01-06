'use strict';
var G = require('../../lib/twoStep').Group,
    fs = require('fs');

var selfText = fs.readFileSync(__filename, 'utf8');

describe('Testing single group functionality', function() {
    it('Wrapping single async call', function(done) {
        var group = new G(function(err, text) {
            expect(selfText).toEqual(text);
            done(err);
        });
        fs.readFile(__filename, 'utf8', group.slot());
    });

    it('Wrapping two concurrent async calls', function(done) {
        var group = new G(function(err, text1, text2) {
            expect(selfText).toEqual(text1);
            expect(selfText).toEqual(text2);
            done(err);
        });
        fs.readFile(__filename, 'utf8', group.slot());
        group.pass(selfText);
    });

    it('Queuing several callbacks', function(done) {
        var group = new G(function(err, text1, text2) {
            expect(selfText).toEqual(text1);
            expect(selfText).toEqual(text2);
            done(err);
        });

        var group2 = new G();
        fs.readFile(__filename, 'utf8', group2.slot());
        group2.then(group.slot());
        group2.then(group.slot());
    });

    it('Queuing callback of the resolved group', function(done) {
        var group = new G();
        fs.readFile(__filename, 'utf8', group.slot());
        group.then(function(err, text) {
            expect(group.resolved).toEqual(true);
            group.then(function(err, text) {
                expect(selfText).toEqual(text);
                done(err);
            });
        });
    });
});

'use strict';
var G = require('../../lib/twoStep').Group,
    fs = require('fs');

var selfText = fs.readFileSync(__filename, 'utf8');

describe('Testing single group functionality', function() {
    it('Wrapping single async call', function(done) {
        var group = new G();
        fs.readFile(__filename, 'utf8', group.slot());
        group.then(function(err, text) {
            expect(selfText).toEqual(text);
            done(err);
        });
    });

    it('Wrapping two concurrent async calls', function(done) {
        G.chain(function() {
            fs.readFile(__filename, 'utf8', this.slot());
            this.pass(selfText);
        }).then(function(err, text1, text2) {
            expect(selfText).toEqual(text1);
            expect(selfText).toEqual(text2);
            done(err);
        });
    });

    it('Queuing several callbacks', function(done) {
        G.chain(function() {
            var group2 = new G();
            fs.readFile(__filename, 'utf8', group2.slot());
            group2.then(this.slot());
            group2.then(this.slot());
        }).then(function(err, text1, text2) {
            expect(selfText).toEqual(text1);
            expect(selfText).toEqual(text2);
            done(err);
        });
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

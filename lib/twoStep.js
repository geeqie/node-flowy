'use strict';

/**
 * Twostep - a simple flow-control library for node.js.
 *
 * Steppy - even more simple in usage tool covering majority
 * of the everyday routine use-cases.
 */

var Group = require('./group').Group;

function slice() {
    var fn = Array.prototype.slice;
    return fn.call.apply(fn, arguments);
}


function makeChainer(method) {
    return function(/*step1, step2, ...*/) {
        return chainSteps(slice(arguments), method);
    };
}

/**
 * Chain and execute given steps immediately. The last step in chain
 * will be the error- and result-handling callback.
 */
function chainAndCall(chainer) {
    return function(/*step1, step2, ...*/) {
        var steps = slice(arguments);
        var callback = steps.pop();
        chainer.apply(null, steps)(callback);
    };
}

/**
 * Chaining together all passed functions. The results of the step call
 * are passed to the following step in the form of stepN(err, args...).
 *
 * The execution result of the whole chain is passed via
 * the callback call: callback(err, result).
 *
 * @param {[function]} steps functions to chain
 * @param {String} method
 *   one of the Group's chaining methods ('then', 'anyway', 'fail')
 * @return {function(args..., callback)} the resulting chain of steps
 */
function chainSteps(steps, method) {
    return function(/*arg1, ... argN, callback*/) {
        var initArgs = slice(arguments);
        var callback = initArgs.pop();
        if (!callback) {
            throw new Error('Callback is missing');
        }

        steps.reduce(
            function(soFar, step) {
                return soFar[method](step);
            }, Group.when.apply(null, initArgs)
        ).end(callback);
    };
};


exports.Group = Group;

var waterfallChainer = makeChainer('then');
exports.Steppy = chainAndCall(waterfallChainer);
exports.Steppy.fn = waterfallChainer;

var handlingChainer = makeChainer('anyway');
exports.Step = chainAndCall(handlingChainer);
exports.Step.fn = handlingChainer;

exports.Step.simple = function(arg) {
    return arg;
};
exports.Step.throwIfError = function(fn) {
    return function(err, args) {
        if (err) throw err;
        return fn.apply(this, arguments);
    };
};




'use strict';

/**
 * Twostep - a simple flow-control library for node.js.
 *
 * Steppy - even more simple in usage tool covering majority
 * of the everyday routine use-cases.
 */

var slice = Array.prototype.slice,
    Group = require('./group').Group;


/**
 * Chaining together all passed functions.
 * The results of the step call are passed to the following step
 * in the form of stepN(err, args...).
 * The execution result of the whole chain is passed
 * via the callback call: callback(err, result).
 *
 * @return {function(args..., callback)} the resulting chain of steps
 */
function chainSteps(/*fun1, fun2, ..., funN*/) {
	var steps = slice.call(arguments);
	return function(/*arg1, ... argN, callback*/) {
		var initArgs = slice.call(arguments);
		var callback = initArgs.pop();
		if (!callback) {
			throw new Error('Callback is missing');
		}
		iterateSteps(steps, initArgs, callback);
	};
};

/**
 * Similar to `makeSteps` but the chaining continues only on
 * successful execution of the previous step and breaks after
 * the first error occured.
 */
function chainStepsNoError() {
	var steps = slice.call(arguments).map(function(step) {
		return notHandlingError(step);
	});
	return chainSteps.apply(null, steps);
};


/**
 * The heart of the TwoStep, function executing and chaining all given steps
 */
function iterateSteps(steps, initArgs, callback) {
	var pos = 0;

	function next(/*err, args...*/) {
		if (pos >= steps.length) {
			return callback.apply(null, arguments);
		}
		var step = steps[pos++];
		var group = new Group(next);
		try {
			step.apply(group, arguments);
		} catch (e) {
			return group.error(e);
		}
	};
	next.apply(null, initArgs);
}


function notHandlingError(func) {
    return function(err, args) {
		if (err) throw err;
		return func.apply(this, arguments);
	};
}

function identity(arg) {
    return arg;
}

/**
 * Chain and execute given steps immediately. The last step in chain
 * will be the error- and result-handling callback.
 */
function chainAndCall(chainer) {
    return function(/*step1, step2, ...*/) {
        var steps = slice.call(arguments);
	    var callback = steps.pop();
	    chainer.apply(null, steps)(callback);
    };
}

exports.Step = chainAndCall(chainSteps);
exports.Step.fn = chainSteps;
exports.Step.simple = identity;
exports.Step.throwIfError = notHandlingError;

exports.Steppy = chainAndCall(chainStepsNoError);
exports.Steppy.fn = chainStepsNoError;

exports.Group = Group;


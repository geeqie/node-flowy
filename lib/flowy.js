'use strict';

function slice() {
    var fn = Array.prototype.slice;
    return fn.call.apply(fn, arguments);
}

/**
 * Group serves as a modified version of CommonJS promise which allows deferring
 * code execution until each of the group's slots is resolved.
 *
 * Group defines a term `slot` meaning one result of asynchronous execution.
 * You can imagine Group's slots as an array of promises that are resolving
 * concurrently. When all slots are resolved, their results are passed to
 * callbacks of the group, in the nodejs-style:
 *   callback(err, slot1, slot2, ...);
 *
 * A Group also becomes resolved at the first error occurred during
 * the resolving of any of its slots.
 *
 * @param {Object} options
 *   A key-value storage shared between all groups in the chain.
 *   One of its keys - `self` - will be available through the shortcut getter
 *   `group.self`
 */
function Group(options) {
    this.resolved = '';
    this.slots = [null];        //first slot represents error status
    this.reservedSlots = 0;
    this.callbacks = [];
    this.errbacks = [];

    this.options = options;
    Object.defineProperty(this, 'self', {
        get: function() {return this.options.self;}
    });
}

/**
 * Static method allowing to begin a chain of groups with a function
 * generating slot values.
 */
Group.chain = function(fn /*, arg1, arg2, ...*/) {
    return new Group().fapply(fn, slice(arguments, 1));
};

/**
 * Static method allowing to begin a chain of groups with immediate
 * set of slot values.
 */
Group.when = function(/*err, slot1, slot2, ...*/) {
    return Group.prototype.resolve.apply(new Group(), arguments);
};

/**
 * If group was not resolved before, resolve it with given arguments
 */
Group.prototype.resolve = function() {
    this.slots = slice(arguments);
    this._onResolve();
    return this;
};

Group.prototype.error = function(err) {
    return this.resolve(err);
};

/**
 * Execute given function in the context of the group.
 *
 * @param {function} fn
 *   A function to be called within the context of the group that
 *   might reserve some slots of the group. The value returned by
 *   the `fn` will be ignored.
 * @param {misc} arg1...argN
 *   arguments to be passed to the `fn`
 *
 * @return group itself
 */
Group.prototype.fcall = function(fn /*, arg1, arg2, ...*/) {
    try {
        fn.apply(this, slice(arguments, 1));
    } catch(e) {
        this.error(e);
    } finally {
        return this;
    }
};

Group.prototype.fapply = function(fn, args) {
    return Group.prototype.fcall.apply(this,
        [fn].concat(slice(args || [])));
};

/**
 * Return wrapped into the group context function
 */
Group.prototype.fbind = function(fn) {
    return (function() {
        return this.fapply(fn, arguments);
    }).bind(this);
};

/**
 * Callbacks that will be triggered on group resolution.
 *
 * If no callback passed, the values will be propagated further in chain.
 * If no errback passed, this error will be rethrown further in chain.
 * Each callback/errback will be called in the context of its own group.
 */
Group.prototype.then = function(callback, errback) {
    callback = callback || function() {
        this.resolve.apply(this, arguments);
    };
    errback = errback || function(err) {
        throw err;
    };
    return this._queueCallbacks(callback, errback);
};

/**
 * Whatever resolution of the group happens, this callback will be called.
 */
Group.prototype.anyway = function(callback) {
    return this.then(callback, callback);
};

/**
 * Adding an errback to the group.
 */
Group.prototype.fail = function(errback) {
    return this.then(null, errback);
};

/**
 * Works like `anyway` but breaks the chain, thus preventing callback
 * from wrapping into the group's sandbox: any error thrown from this
 * callback will be unhandled by the group code.
 */
Group.prototype.end = function(callback) {
    return this._queueCallbacks(callback, callback, 'naked');
};


/**
 * Reserve one slot of the group to be resolved with values
 * provided by the returned callback.
 *
 * @param {boolean} multi
 *   - If `true`, the slot will be resolved with the array of
 *   data values provided by the callback.
 *   - If `false`, the slot will be resolved with the first
 *   data value provided by the callback.
 *
 * @return {function(err, data...)} callback to fill the slot with data
 */
Group.prototype.slot = function slot(multi) {
    var responseHandler = multi ?
        function(/*err, data...*/) {return slice(arguments, 1)} :
        function(err, data) {return data};

    return this._reserveSlot(responseHandler);
};

/**
 * Creates a nested group, all results of which will be put
 * into the reserved slot as a single array.
 */
Group.prototype.slotGroup = function() {
    var group = new Group();
    group.then(this.slot('multi'));
    return group;
};

/**
 * Wrapper for passing synchronous values to the next step.
 * Each value will be placed in the separate slot.
 */
Group.prototype.pass = function pass(/*values*/) {
    var values = slice(arguments);
    for (var i = 0; i < values.length; i++) {
        this.slot()(null, values[i]);
    }
};


/**
 * Reserve space for one argument in the `slots` array.
 *
 * @param {function(err, val1, val2, ...)} responseHandler
 *   function that in case of no error processes callback arguments
 *   and returns a value to fill the reserved slot with
 * @return {function(err, val1, val2, ...)}
 *   callback which arguments will be processed by the `responseHandler`
 */
Group.prototype._reserveSlot = function(responseHandler) {
    this.reservedSlots++;
    var slot = this.slots.push(undefined) - 1;

    var self = this;
    return function(err/*, values...*/) {
        var response = slice(arguments);
        process.nextTick(function() {
            err ?
                self.error(err) :
                self._fillSlot(slot, responseHandler.apply(null, response));
        });
    };
};

/**
 * Fill the reserved slot addressed by `index` with the given `value`.
 */
Group.prototype._fillSlot = function(index, data) {
    this.slots[index] = data;
    if (!--this.reservedSlots) {
        this._onResolve();
    }
};

Group.prototype._onResolve = function() {
    if (this.resolved) return;
    this.resolved = (this.slots[0]) ? 'rejected' : 'fulfilled';
    this._ensureCallbacksTriggered();
};

/**
 * Queue callbacks of the group resolution. If the group is already resolved,
 * callbacks will be called on the next nodejs-tick. Each pair callback-errback
 * will be executed within context of the freshly created group, sharing
 * the same `options` object as the parent group.
 *
 * If `naked` param receives the truthy value, callbacks won't be wrapped
 * in any context.
 *
 * @return the context callbacks will be executed in
 */
Group.prototype._queueCallbacks = function(callback, errback, naked) {
    var context = undefined;
    if (!naked) {
        context = new Group(this.options);
        callback = context.fbind(callback);
        errback = context.fbind(errback);
    }

    this.callbacks.push(callback);
    this.errbacks.push(errback);
    this._ensureCallbacksTriggered();
    return context;
};

/**
 * Trigger callbacks appropriate to the group state.
 */
Group.prototype._ensureCallbacksTriggered = function() {
    if (!this.resolved) return;

    var callbacks = (this.resolved == 'fulfilled') ?
        this.callbacks : this.errbacks;

    while (callbacks.length) {
        this._triggerCallback(callbacks.shift());
    }
};

Group.prototype._triggerCallback = function(callback) {
    var self = this;
    process.nextTick(function() {
        callback.apply(null, self.slots);
    });
};


/**
 * Exposing Flowy
 */

/**
 * Chaining together all passed functions. The results of the step call
 * are passed to the following step in the form of stepN(err, args...).
 *
 * The execution result of the whole chain is passed via callback:
 *   callback(err, result)
 *
 * The context of the returned function (`this` property) will be stored
 * in the composed group chain under the `this.self` alias.
 *
 * @param {[function]} steps functions to chain
 * @param {String} method
 *   one of the Group's chaining methods ('then', 'anyway', 'fail')
 * @return {function(args..., callback)} the resulting chain of steps
 */
function composeSteps(/*step1, ..., stepN*/) {
    var steps = slice(arguments);
    return function(/*arg1, ... argN, callback*/) {
        var initArgs = slice(arguments);
        var callback = initArgs.pop();
        if (!callback) throw new Error('Callback is missing');

        var start = new Group({self: this}); //saving the context
        Group.prototype.resolve.apply(start, [null].concat(initArgs));

        steps.reduce(
            function(chain, step) {
                return chain.then(step);
            }, start
        ).end(callback);
    };
};

module.exports = function(/*step1, ..., stepN, callback*/) {
    var steps = slice(arguments);
    var callback = steps.pop();
    composeSteps.apply(null, steps)(callback);
};
module.exports.compose = composeSteps;

/**
 * Exposing Group-related stuff
 */
module.exports.Group = Group;
module.exports.group = function() {
    return new Group();
};
module.exports.chain = Group.chain;
module.exports.when = Group.when;

'use strict';

/**
 * Group serves as a modified version of CommonJS promise which allows deferring
 * asynchronous code execution until each of the group's slots is resolved.
 *
 * The main feature of the Group is that it handles multiple simultaneous
 * asynchronous processes while promise handles only one async process at a time.
 *
 * To make it possible, Group defines a term `slot` meaning one deferred result
 * of the async execution. You can imagine Group's slots as an array of
 * promises that are resolving concurrently. When all slots are resolved, their
 * results are passed to the callback of the group, in the nodejs-style:
 *   callback(err, slot1, slot2, ...);
 *
 * The Group breaks also becomes resolved when the first error occures during
 * the resolving each of its slots.
 */


function slice() {
    var fn = Array.prototype.slice;
    return fn.call.apply(fn, arguments);
}

/**
 * @param {function(args)} [body]
 *   a body of the group to be executed within its context
 */
function Group() {
    this.resolved = '';
    this.slots = [null];        //first slot represents error status
    this.reservedSlots = 0;
    this.callbacks = [];
    this.errbacks = [];
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
    this.slots[0] = err;
    this._onResolve();
    return this;
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
Group.prototype.wrap = function(fn) {
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
 * Reserve one slot in the arguments array to be passed
 * to the group's callback. Group's callback will not be called until
 * all reserved slots are filled with data or the error occures.
 *
 * @return {function(err, data)} callback to fill the slot with data
 */
Group.prototype.slot = function slot() {
    var self = this;
    var slot = self._reserveSlot();
    return function(err, data) {
        process.nextTick(function() {
            if (err) {
                return self.error(err);
            }
            self._fillSlot(slot, data);
        });
    };
};

/**
 * Creates a nested group, all results of which will be put
 * into the reserved slot as a single array.
 */
Group.prototype.slotGroup = function() {
    var callback = this.slot();
    var group = new Group();
    group.then(function (err) {
        var data = slice(arguments, 1);
        callback(err, data);
    });
    return group;
};

/**
 * Wrapper for passing synchronous values to the next step
 */
Group.prototype.pass = function pass(/*values*/) {
    var values = slice(arguments);
    for (var i = 0, l = values.length; i < l; i++) {
        this.slot()(null, values[i]);
    }
};


/**
 * Reserve space for one argument in the `slots` array.
 * @return {Number} index of the reserved slot
 */
Group.prototype._reserveSlot = function() {
    this.reservedSlots++;
    return this.slots.push(undefined) - 1;
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
 * Queue callbacks of the group resolution. If the group
 * is already resolved, callbacks will be called on the next nodejs-tick.
 * Each pair callback-errback will be executed within context of the
 * freshly created group.
 *
 * If `naked` param receives the truly value, callbacks won't be wrapped
 * in any context.
 *
 * @return group which well be the context of the callbacks
 */
Group.prototype._queueCallbacks = function(callback, errback, naked) {
    var context;
    if (!naked) {
        context = new Group();
        callback = context.wrap(callback);
        errback = context.wrap(errback);
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


module.exports.Group = Group;

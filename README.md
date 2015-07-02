# Flowy #

[![build status](https://secure.travis-ci.org/maslennikov/node-flowy.png)
](http://travis-ci.org/maslennikov/node-flowy)
&nbsp;
[![npm version](http://img.shields.io/npm/v/flowy.svg?style=flat)
](https://npmjs.org/package/flowy "View on npm")


A flow-control library for Node.js inspired by [TwoStep](https://github.com/2do2go/node-twostep)
and CommonJS promises (especial appreciation to the [Q library](https://github.com/kriskowal/q)
for its convenient API design).

Features:
- flattening of the callback chain;
- encouraging Node.js-style function and callback interfaces;
- managing parallel execution of asynchronous calls;
- automatic error handling and propagation;
- uniformly handling asynchronous and synchronous data flow.


## Getting started ##

Without the help of any tool, asynchronous javascript code can quickly become a pain:
```javascript
function leaveMessage(username, text, callback) {
    model.users.findOne(username, function(err, user) {
        if (err) return callback(err);
        if (!user) return callback(new Error('user not found'));
        model.messages.create(user, text, function(err, message) {
            if (err) return callback(err);
            model.notifications.create(message, function(err, notification) {
                callback(err, notification);
            });
        });
    });
}
```

On the other hand, asynchronous flow management in Node.js can be that simple:
```javascript
function leaveMessage(username, text, callback) {
    Flowy.chain(function() {
        model.users.findOne(username, this.slot());
    }).then(function(err, user) {
        if (!user) throw new Error('user not found');
        model.messages.create(user, text, this.slot());
    }).then(function(err, message) {
        model.notifications.create(message, this.slot());
    }).end(callback); //any error will be automatically propagated to this point
}
```
or that simple:
```javascript
function leaveMessage(username, text, callback) {
    Flowy(
        function() {
            model.users.findOne(username, this.slot());
        },
        function(err, user) {
            if (!user) throw new Error('user not found');
            model.messages.create(user, text, this.slot());
        },
        function(err, message) {
            model.notifications.create(message, this.slot());
        },
        callback //any error will be automatically propagated to this point
    );
}
```

### Terminology

- **Flowy**: a wrapper allowing to combine steps of execution in a waterfall manner.
- **Step**: a function executed by the *Flowy* in the context of a *Group* and deciding what data will be passed to the next *Step*.
- **Group**: the core of the *Flowy* library, guarantees all sync and async data to be collected into the one single place and passed to the appropriate handler.


### How it works

`Flowy()` function starts executing its arguments in the waterfall manner, passing results of
the previous step to the next. Every step is run in the context of Flowy's *Group*, which
guarantees all the data will be collected before the next step begins. To notify that you want
to pass any asynchronous data to the next step, you pass to the ordinary async function as a callback
param one of the Group's hooks (in this example, `this.slot()`). When this callback is eventually
called, Group becomes resolved and the flow passes to the next step.

Any error occurred during the step execution (passed to the Group's callback) will be immediately
propagated to the last step of the Flowy. If an error is thrown from the last step, it will stay
unhandled.


## Tutorial ##

To understand the principle of the *Flowy* waterfall, let's start from the exploring of its core.


### Flowy Group

At first glance a *Group* seems to resemble CommonJS promises, it also matches promise [terminology](http://howtonode.org/promises):
- *Fulfillment*: When a successful promise is fulfilled, all of the pending callbacks are called with the value. If more callbacks are registered in the future, they will be called with the same value. Fulfilment is the asynchronous analog for returning a value.
- *Rejection*: When a promise cannot be fulfilled, a promise is 'rejected' which invokes the errbacks that are waiting and remembers the error that was rejected for future errbacks that are attached. Rejection is the asynchronous analog for throwing an exception.
- *Resolution*: A promise is resolved when it makes progress toward fulfillment or rejection. A promise can only be resolved once, and it can be resolved with a promise instead of a fulfillment or rejection.
- *Callback*: A function executed if a a promise is fulfilled with a value.
- *Errback*: A function executed if a promise is rejected, with an exception.

The main difference is that a *Group* should be treated like a group of promises, all executing concurrently, and
a group would be resolved either every of its promises is fulfilled or any of the promises becomes rejected.

On the group resolution, it will be ready to pass to its callbacks the values of all resolved promises - its *slots*.
Every slot should be treated as an argument eventually passed to the group's callback:
`callback(err, slot1, slot2, ...)`.

#### Creation
To create a new group, simply call
```
Flowy.group()
//or
new Flowy.Group()
```
When it is created, nothing happens. The group keeps the unresolved state until each of its slots becomes fulfilled.
During the slot resolution process may may occur errors. This will will force the group to change its state toward
rejection. Freshly created group has no slots, so you'll want to reserve a couple.

#### Slot reservation
All slots reserved in a group will be resolved in parallel. The *order of the slot reservation will be preserved*
independent of the order of slot resolution. All slots will be passed to the group callbacks in this order.

To reserve an asynchronous slot, call `group.slot()`. This method returns a callback function
`function(err, data1, data2, ...)`. The slot will be resolved with the first data value passed to its callback.
If called with a boolean `multi` argument, the reserved slot will be resolved with an array of data values
passed to the callback: `[data1, data2, ...]`.
```javascript
//reserving a slot for an asynchronous call
var callback = group.slot();
fs.readFile(filename, 'utf8', callback);
//reserving a slot to handle all callback arguments
group.slot('multi');
```

To fill one or more slots with immediate values, use `group.pass(value1, value2, ...)`. The corresponding slots
will be resolved with these values on the next Node tick.
```javascript
//passing immediate value side by side with asynchronous data
group.pass(user);
model.stats.collectUserStats(user, group.slot());
//handling both in the same place
group.then(function (err, user, stats) {
    //managing user and his statistics
});
```

Slot can also be resolved with a
[thenable](https://github.com/promises-aplus/promises-spec) promise via a `pslot()` method:
```javascript
//passing a thenable promise to resolve the slot
var thenable = returnsPromise();
group.pslot(thenable);
group.anyway(function (err, user, stats) {
    //any error in thenable will also be properly caught here
});
```

There is also a helper method for an often occuring usage pattern: reserving a slot whose resolution
will be a result of resolution of another group.
```javascript
var group = Flowy.group();
var nested = Flowy.group();
nested.anyway(group.slot('multi'));

//instead, adding a grain of sugar:
var group = Flowy.group();
var nested = group.subgroup();
```

#### Handling resolution
A group can be resolved in two ways: successfully or not. To handle these situations, there are four methods.
Each of callback methods accepts callbacks in the standard form: `function(err, value1, value2, ...)`.
```javascript
//handling both success and error:
group.then(callback, errback);

//handling only success:
group.then(callback);

//handling only failure:
group.fail(errback); //shortcut for:
group.then(null, errback);

//handling any situation:
group.anyway(callback); //shortcut for:
group.then(callback, callback);
```

#### Chaining callbacks
Each callback is executed the context (`this` variable) of its own group.
Callback methods described above return the future context of the callback, making possible chaining of groups.
```javascript
//a group that was acquired elsewhere earlier
group.then(function(err, message) {
    this.pass(message); //forwarding immediate value to the next step
    var nested = this.subgroup();
    message.recipients.forEach(function(username) {
        model.users.findOne(username, nested.slot());
    });
}).then(function(err, message, users) {
    //doing stuff
})
```

#### Result propagation
If no callback is passed to the group, slots resolved by the group will be propagated down the chain
until handled; if no errback is passed to the group, the error will be propagated down the chain in the same way:
```javascript
group.error(
    new Error('whoops')
).then(function(err) {
    //will not be called, error is propagating further
}).then(null, function(err) {
    //error was propagated to the nearest handler
    this.pass(err.message);
}).fail(function(err) {
    //will not be called, error was handled in the previous step
    //message is propagating further
}).anyway(function(err, message) {
    //if there were no error handlers in the middle, err it would be cought here
    //message was propagated here
    console.log(message);
});
```
The drawaback of this approach is the possibility of losing an error thrown from the last callback in the chain.
It happens because it is executed in the group's try-catch sandbox. To prevent the last callback from sandboxing
(and from executing in the group's context), there is method to end the chain:
```javascript
//similar to `group.anyway()` but without wrapping a callback into the group's sandbox
group.end(callback);
```

#### Manually resolving group
There are two ways to manually resolve group ignoring all its reserved slots:
```javascript
//immediately resolve group with the given slots
group.resolve(err, slot1, slot2, slot3);

//resolve group with the given error
group.error(err); //an alias to group.resolve(err)
```
All group's callbacks will be triggered on the next Node tick. Methods return group to allow further chaining.

#### Wrapping and executing functions
To execute a function in the group's context and sandbox, there are analogues of `call` and `apply` methods:
```javascript
group.fcall(fn, arg1, arg2, arg3);
group.fapply(fn, [arg1, arg2, arg3]);
```
Each method returns a group to make chaining possible:
```javascript
function getUserMessages(username, callback) {
    //we could do it better with Group.chain() method
    Flowy.group().fcall(function() {
        model.users.findOne(username, this.slot());
        model.messages.find(username, this.slot());
    }).then(function(err, user, messages) {
        messages.forEach(function(message) {
            message.recipient = user;
        });
        this.pass(messages);
    }).end(callback)
}
```

#### Starting a chain
To make starting a chain easier, there are two static methods of the `Group` class:
```javascript
//starting a chain with the function,
//analogous to `new Group().fcall(fn, arg1, arg2)`
Group.chain(fn, arg1, arg2);

//starting a chain with the immediate slot values
//analogous to `new Group().resolve(err, slot1, slot2)`
Group.when(err, slot1, slot2);
```
Both methods return group of the chain head.

#### Sharing options through the chain flow
Group constructor can take an optional `options` argument. This is a key-value
storage that will be shared between all groups in the chain. An `options` object
has one special `options.self` field which is mirrored via `group.self` getter.
```javascript
Flowy.group({username: 'alex', message: 'hello'}).fcall(function() {
    model.users.findOne(this.options.username, this.slot());
}).then(function(err, user) {
    model.messages.send(user, this.options.message, this.slot());
});
```


### Flowy
Flowy is a thin wrapper that allows composing functions in a group chain.
```javascript
Flowy.compose(step1, ..., stepN)
```
returns a `function(arg1, ..., argN, callback)` which initiates an execution of
chained steps passing its `arg1, ..., argN` arguments to the first step as initial values
and guarantees returning of the eventual result (or error) through its callback.
The context of this function will be stored in the group chain's `options.self` option,
thus making it easier to define methods of the classes:
```javascript
MessageController.prototype.getUserMessages = Flowy.compose(
    function(username) {
        //`users` and `messages` models are fields of the `MessageController`
        this.self.users.findOne(username, this.slot());
        this.self.messages.find(username, this.slot());
    }, function(err, user, messages) {
        //making something with messages... and eventually:
        this.pass(messages);
    }
);
```

There is a shortcut for `Flowy.compose(step1, ..., stepN)(callback)` that immediately runs
chained steps:
```javascript
Flowy(step1, ..., stepN, callback)
```

Keeping that in mind, we can rewrite our `getUserMessages` function in the following way:
```javascript
function getUserMessages(username, callback) {
    Flowy(
        function() {
            model.users.findOne(username, this.slot());
            model.messages.find(username, this.slot());
        },
        function(err, user, messages) {
            //making something with messages... and eventually:
            this.pass(messages);
        },
        callback
    );
}
```

`Flowy` also is very nice to mirror `Group` static methods, so you can start a group chain painlessly:
```javascript
Flowy.chain(/*...*/).then(/*...*/).end(/*...*/);
Flowy.when(/*...*/).then(/*...*/).end(/*...*/);

```

## Installation ##

```
npm install flowy
```

## Testing ##

In project root run:
```
npm install
```
After all development dependencies are installed run:
```
npm test
```

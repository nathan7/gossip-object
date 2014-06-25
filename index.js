'use strict';
module.exports = Model
var Scuttlebutt = require('scuttlebutt')
  , inherits = require('util').inherits
  , clj = require('fun-map')
  , assocInM = clj.assocInM
  , getIn = clj.getIn

inherits(Model, Scuttlebutt)
function Model(opts) {
  if (!this || this === global) return new Model(opts)
  Scuttlebutt.call(this, opts)
  this._cache = null
  this._changes = []
}

function Transaction(model) {
  this.model = model
  this.transaction = []
}

var m = Model.prototype
  , t = Transaction.prototype

// key ::= string of nonzero length, not equal to "__proto__"
m._validKey = function(key) {
  return typeof key == 'string'
      && key.length !== 0
      && key !== '__proto__'
}

// path ::= [key]
//      ||= [key, ..path]
m._validPath = function(path) {
  return Array.isArray(path)
      && path.length !== 0
      && path.every(this._validKey, this)
}

// value ::= undefined
//       ||= null
//       ||= boolean
//       ||= number
//       ||= string
m._validValue = function(value) {
  return value === null
      || typeof value != 'object'
}

// ref is an empty set — it is defined by subclasses, if they support references
m._validRef = function(ref) {
  return false
}

// change ::= [path]
//        ||= [path, value]
//        ||= [path, 'ref', key]
m._validChange = function validChange(change) {
  return Array.isArray(change)
      && this._validPath(change[0])
      && (  change.length === 1
         || (  change.length === 2
            && this._validValue(change[1])
            )
         || (  change.length === 3
            && change[1] === 'ref'
            && this._validKey(change[2])
            && this._validRef(change[3])
            )
         )
}

// transaction ::= [change]
//             ||= [change, ..transaction]
m._validTransaction = function(transaction) {
  return Array.isArray(transaction)
      && transaction.length !== 0
      && transaction.every(this._validChange, this)
}

// update ::= [transaction, timestamp, node-id]
m._validUpdate = function(update) {
  return Array.isArray(update)
      && this._validTransaction(update[0])
}

t.execute = function() { this.model.localUpdate(this.transaction) }
m.transact = function() { return new Transaction(this) }

t.localChange = function(change) {
  if (!this.model._validChange(change)) throw new TypeError('invalid change')
  this.transaction.push(change)
}

m.localChange = function(change) {
  if (!this._validChange(change)) throw new TypeError('invalid change')
  this.localUpdate([change])
}

t.set = m.set = function(path, value) {
  if (typeof path == 'string') path = [path]
  this.localChange([path, value])
}

t.ref = m.ref = function(path, value) {
  if (typeof path == 'string') path = [path]
  this.localChange([path, 'ref', value])
}

t.delete = m.delete = function(path) {
  if (typeof path == 'string') path = [path]
  this.localChange([path])
}

m.get = function(path, fallback) {
  if (typeof path == 'string') path = [path]
  return getIn(this.toJSON(), path, fallback)
}

m.applyUpdate = function(update) {
  if (!this._validUpdate(update)) return false

  var changeListeners = this.listeners('change').length !== 0
    , old = changeListeners && this.toJSON()

  this._cache = null
  this.mergeHistory([update])

  if (changeListeners)
    this.emit('change', old)
  
  return true
}

m.mergeHistory = function(updates) { var self = this
  updates.forEach(function(update) {
    var transaction = update[0]
    for (var i = 0, len = transaction.length; i < len; i++)
      transaction[i].update = update

    ;[].push.apply(self._changes, transaction)
  })

  this._changes = this._changes
    .sort(function(a, b) { return byTimestamp(a.update, b.update) })
    .reduce(function(changes, freshChange) {
      // freshChange = [a, _]
      // invalidates a previous update
      // change = [b, _]
      //
      // when a = [b, ..]
      // analogous to an object set wiping out the values below it in the tree
      // invalidates anything with [[a, ..], _]
      //
      // when [a, ..] = b
      // analogous to a deep object set wiping out the values above it in the tree

      changes = changes
        .filter(function(change) {
          return !startsWith(freshChange[0], change[0])
              && !startsWith(change[0], freshChange[0])
        })

      changes.push(freshChange)
      return changes
    }, [])
}


m.history = function(sources) {
  return this._changes
    .map(function(change) { return change.update })
    .filter(function(update, i, updates) { return update !== updates[i - 1] })
    .filter(function(update) {
      var ts = update[1]
        , source = update[2]
      return (!sources || !sources[source] || sources[source] < ts)
    })
}

m._toJSON = function() { var self = this
  return this._changes
    .reduce(function(obj, change) {
      return change.length === 1
        ? obj
        : change.length === 2
          ? assocInM(obj, change[0], change[1])
          : assocInM(obj, change[0], self._deref(change[2]))
    }, {})
}

m.toJSON = function() {
  return this._cache || (this._cache = this._toJSON())
}

function byTimestamp(a, b) { return a[1] - b[1] || (a[2] > b[2] ? 1 : -1) }
function concat(a, b) { return [].concat(a).concat(b) }

function startsWith(prefix, value) {
  for (var i = 0, len = prefix.length; i < len; i++)
    if (prefix[i] !== value[i])
      return false
  return true
}

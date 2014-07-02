'use strict';
module.exports = Model
var Scuttlebutt = require('scuttlebutt')
  , inherits = require('util').inherits
  , clj = require('fun-map')
  , assocInM = clj.assocInM
  , getIn = clj.getIn
  , binarySearch = require('binary-search')

inherits(Model, Scuttlebutt)
function Model(opts) {
  if (!this || this === global) return new Model(opts)
  Scuttlebutt.call(this, opts)
  this._cache = null
  this._transactions = []
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
            && this._validRef(change[2])
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

m.mergeHistory = function(updates) {
  for (var update$ = 0, update$len = updates.length; update$ < update$len; update$++) {
    var update = updates[update$]
    this.applyUpdate(update)
  }
}

m.applyUpdate = function(update) {
  if (!this._validUpdate(update)) return false

  var changeListeners = this.listeners('change').length !== 0
    , old = changeListeners && this.toJSON()

  var transaction = update[0]
    , transaction$
    , change
    , change$
    , change$len
    , freshTransaction
    , freshTransaction$
    , freshTransaction$len
    , freshChange
    , freshChange$
    , freshChange$len

  // let's not get into weird places with mutable state
  transaction = transaction.slice()
  // show off where we're from
  transaction.update = update

  // now let's figure out where to live
  var index = ~binarySearch(this._transactions, transaction, byUpdateTimestamp)
  // if there isn't already someone taking that
  if (index < 0) return false

  var dropped
  if (this.listeners('update').length !== 0)
    dropped = []

  // and see if nobody has obsoleted us yet
  for (freshTransaction$ = index, freshTransaction$len = this._transactions.length; freshTransaction$ < freshTransaction$len; freshTransaction$++) {
    freshTransaction = this._transactions[freshTransaction$]
    for (freshChange$ = 0, freshChange$len = freshTransaction.length; freshChange$ < freshChange$len; freshChange$++) {
      freshChange = freshTransaction[freshChange$]
      for (change$ = 0, change$len = transaction.length; change$ < change$len; change$++) {
        change = transaction[change$]
        if (invalidates(change, freshChange)) {
          if (--change$len !== 0)
            transaction.splice(change$--, 1)
          else
            return false
        }
      }
    }
  }

  // well, apparently we're still relevant
  this._cache = null
  this._transactions.splice(index, 0, transaction)
  freshTransaction = transaction

  // now let's get rid of any updates we supersede
  processing: for (transaction$ = index - 1; transaction$ >= 0; transaction$--) {
    transaction = this._transactions[transaction$]
    for (freshChange$ = freshTransaction.length - 1; freshChange$ >= 0; freshChange$--) {
      freshChange = freshTransaction[freshChange$]
      for (change$ = transaction.length - 1; change$ >= 0; change$--) {
        change = transaction[change$]
        if (invalidates(change, freshChange)) {
          if (dropped)
            dropped.push(change)
          if (transaction.length > 1)
            transaction.splice(change$, 1)
          else {
            this._transactions.splice(transaction$, 1)
            continue processing
          }
        }
      }
    }
  }

  if (dropped) {
    var added = transaction.slice()
    added.update = update
    this.emit('update', { added: transaction, dropped: dropped })
  }

  if (changeListeners)
    this.emit('change', old)

  return true
}

function invalidates(change, freshChange) {
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

  return startsWith(freshChange[0], change[0])
      || startsWith(change[0], freshChange[0])
}


m.history = function(sources) {
  return this._transactions
    .map(function(transaction) { return transaction.update })
    .filter(function(update) {
      var ts = update[1]
        , source = update[2]
      return (!sources || !sources[source] || sources[source] < ts)
    })
}

m._toJSON = function() { var self = this
  return this._transactions
    .reduce(function(obj, transaction) {
      return transaction.reduce(function(obj, change) {
        return change.length === 1
          ? obj
          : change.length === 2
            ? assocInM(obj, change[0], change[1])
            : assocInM(obj, change[0], self._deref(change[2]))
      }, obj)
    }, {})
}

m.toJSON = function() {
  return this._cache || (this._cache = this._toJSON())
}

function byUpdateTimestamp(a, b) { return byTimestamp(a.update, b.update) }
function byTimestamp(a, b) { return a[1] - b[1] || (a[2] > b[2] ? 1 : -1) }

function startsWith(prefix, value) {
  for (var i = 0, len = prefix.length; i < len; i++)
    if (prefix[i] !== value[i])
      return false
  return true
}

'use strict';
module.exports = Model
var Scuttlebutt = require('scuttlebutt')
  , inherits = require('util').inherits
  , eq = require('is-equal')
  , clj = require('fun-map')
  , assocInM = clj.assocInM
  , getIn = clj.getIn

inherits(Model, Scuttlebutt)
function Model(opts) {
  if (!this || this === global) return new Model(opts)
  Scuttlebutt.call(this, opts)
  this._cache = null
  this._history = []
}

var m = Model.prototype

function Transaction(model) {
  this.model = model
  this.updates = []
}

var t = Transaction.prototype

function validUpdate(update) {
  return Array.isArray(update)
      && update.length >= 1
      && Array.isArray(update[0])
      && update[0].length !== 0
      && update[0].every(function(item) { return typeof item == 'string'
                                              && item !== '__proto__'
                                              && item.length !== 0 })
      && (  update.length === 1
         || (  update.length === 2
            && (update[1] === null || typeof update[1] !== 'object')
            )
         )
}

function validUpdates(updates) {
  return Array.isArray(updates)
      && updates.length >= 1
      && updates.every(validUpdate)
}

t.localUpdate = function(updates) {
  ;[].push.apply(this.updates, updates)
}

t.execute = function() {
  this.model.localUpdate(this.updates)
}

m.transact = function() { return new Transaction(this) }

t.set = m.set = function(path, value) {
  if (!Array.isArray(path)) path = [path]

  var update = [path, value]

  if (!validUpdate(update)) throw new TypeError('invalid update')

  this.localUpdate([update])
}

t.delete = m.delete = function(path) {
  if (!Array.isArray(path)) path = [path]

  var update = [path]

  if (!validUpdate(update)) throw new TypeError('invalid update')

  this.localUpdate([update])
}

m.get = function(path, fallback) {
  if (!Array.isArray(path)) path = [path]
  return getIn(this.toJSON(), path, fallback)
}

m.applyUpdate = function(message) {
  if (!validUpdates(message[0])) return false

  var changeListeners = this.listeners('change').length !== 0
    , old = changeListeners && this.toJSON()

  this._cache = null
  this.mergeHistory([message])

  if (changeListeners)
    this.emit('change', old)
  
  return true
}

m.mergeHistory = function(messages) {
  this._history = this._history
    .concat(messages
      .map(function(message) {
        var meta = message.slice(1)
        meta.push(message)
        return message[0]
          .map(function(update) {
            return [update].concat(meta)
          })
      })
      .reduce(concat))
    .sort(byTimestamp)
    .reduce(function(history, freshMessage) {
      // freshUpdate = [a, _]
      // invalidates a previous update
      // update = [b, _]
      //
      // when a = [b, ..]
      // analogous to an object set wiping out the values below it in the tree
      // invalidates anything with [[a, ..], _]
      //
      // when [a, ..] = b
      // analogous to a deep object set wiping out the values above it in the tree

      var freshUpdate = freshMessage[0]
      return history
        .filter(function(message) {
          var update = message[0]
          return !startsWith(freshUpdate[0], update[0])
              && !startsWith(update[0], freshUpdate[0])
        })
        .concat([freshMessage])
    }, [])
}


m.history = function(sources) {
  return this._history
    .map(function(message) {
      return message[3]
    })
    .filter(function(message, i, messages) {
      return message !== messages[i - 1]
    })
    .filter(function(message) {
      var ts = message[1]
        , source = message[2]
      return (!sources || !sources[source] || sources[source] < ts)
    })
}

m._toJSON = function() {
  return this._history
    .reduce(function(obj, message) {
      var update = message[0]
      return update.length === 1
        ? obj
        : assocInM(obj, update[0], update[1])
    }, {})
}

m.toJSON = function() {
  return this._cache || (this._cache = this._toJSON())
}

function byTimestamp(a, b) {
  return a[1] - b[1] || (a[2] > b[2] ? 1 : -1)
}

function startsWith(prefix, value) { return eq(prefix, value.slice(0, prefix.length)) }
function concat(a, b) { return [].concat(a).concat(b) }

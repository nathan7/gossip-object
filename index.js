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

m.set = function(path, value) {
  if (!Array.isArray(path)) path = [path]

  var update = [path, value]

  if (!validUpdate(update)) throw new TypeError('invalid update')

  this.localUpdate(update)
}

m.delete = function(path) {
  if (!Array.isArray(path)) path = [path]

  var update = [path]

  if (!validUpdate(update)) throw new TypeError('invalid update')

  this.localUpdate(update)
}

m.get = function(path, fallback) {
  if (!Array.isArray(path)) path = [path]
  return getIn(this.toJSON(), path, fallback)
}

m.applyUpdate = function(message) {
  if (!validUpdate(message[0])) return false

  var changeListeners = this.listeners('change').length !== 0
  var old = changeListeners && this.toJSON()

  this._cache = null
  this._history = this._history
    .concat([message])
    .sort(byTimestamp)
    .reduce(function(history, freshMessage) {
      // freshUpdate = [[a], b]
      // invalidates anything with [[a, ..], b]
      var freshUpdate = freshMessage[0]
      return history
        .filter(function(message) {
          var update = message[0]
          return startsWith(freshUpdate[0], update[0])
        })
        .concat([freshMessage])
    }, [])

  if (changeListeners)
    this.emit('change', old)
  
  return true
}

m.history = function(sources) {
  return this._history
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
      return assocInM(obj, update[0], update[1])
    }, {})
}

m.toJSON = function() {
  return this._cache || (this._cache = this._toJSON())
}

function byTimestamp(a, b) {
  return a[1] - b[1] || (a[2] > b[2] ? 1 : -1)
}

function startsWith(prefix, value) { return eq(prefix, value.slice(0, prefix.length)) }

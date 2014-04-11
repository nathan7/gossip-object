'use strict'; //jshint node:true
module.exports = Model
var Scuttlebutt = require('scuttlebutt')
  , inherits = require('util').inherits
  , eq = require('is-equal')
  , clj = require('fun-map')
  , assocInM = clj.assocInM

inherits(Model, Scuttlebutt)
function Model(opts) {
  if (!this || this === global) return new Model(opts)
  Scuttlebutt.call(this, opts)
  this._history = []
}

var m = Model.prototype

function validUpdate(update) {
  return Array.isArray(update)
      && update.length === 2
      && Array.isArray(update[0])
      && update[0].length !== 0
      && update[0].every(function(item) { return typeof item == 'string'
                                              && item !== '__proto__'
                                              && item.length !== 0 })
      && (update[1] === null || typeof update[1] !== 'object')
}

m._set = function(path, value) {
  var update = [path, value]

  if (!validUpdate(update)) throw new TypeError('invalid update')

  this.localUpdate(update)
}

m.applyUpdate = function(message) {
  if (!validUpdate(message[0])) return false

  this._history = this._history
    .concat([message])
    .sort(byTimestamp)
    .reduce(function(history, freshMessage) {
      console.log(freshMessage)
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

m.toJSON = function() {
  return this._history
    .reduce(function(obj, message) {
      var update = message[0]
      return assocInM(obj, update[0], update[1])
    }, {})
}

function byTimestamp(a, b) {
  return a[1] - b[1] || (a[2] > b[2] ? 1 : -1)
}

function startsWith(prefix, value) { return eq(prefix, value.slice(0, prefix.length)) }

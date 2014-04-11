'use strict'; //jshint node:true
module.exports = Model
var Scuttlebutt = require('scuttlebutt')
  , inherits = require('util').inherits
  , eq = require('is-equal')
  , clj = require('fun-map')
  , assocIn = clj.assocIn

inherits(Model, Scuttlebutt)
function Model(opts) {
  if (!this || this === global) return new Model(opts)
  Scuttlebutt.call(this, opts)
  this._history = []
}

var m = Model.prototype

m._set = function(path, value) {
  this.localUpdate([path, value])
}

m.applyUpdate = function(message) {
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
      return assocIn(obj, update[0], update[1])
    }, {})
}

function byTimestamp(a, b) {
  return a[1] - b[1] || (a[2] > b[2] ? 1 : -1)
}

function startsWith(prefix, value) { return eq(prefix, value.slice(0, prefix.length)) }

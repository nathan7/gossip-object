'use strict';
var G = require('./')

var gA = new G()
  , gB = new G()

gA.set('a', true)

gB.on('change', function(old) {
  console.log(old, this.toJSON())
})

var stream
(stream = gA.createStream()).pipe(gB.createStream()).pipe(stream)

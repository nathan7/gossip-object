# gossip-object

  replicate an object with scuttlebutt

## Installation

    npm install gossip-object

## API

```js
var Model = require('gossip-object')
```

### Model()
### new Model()
  
  Make yourself a fresh one.

### model.set(key, value)
### model.set(path, value)

  set a value, with either a path (an array of keys, diving into recursive objects) or a plain key

### model.get(key, value, default)
### model.get(path, value, default)

  get a value, with either a path (an array of keys, diving into recursive objects) or a plain key


### model.delete(key)
### model.delete(path)

  delete a value, with either a path (an array of keys, diving into recursive objects) or a plain key

### model.toJSON()

  get all the data plain JS object

### model.on('change', function(old))

  get notified when changes happen, you're passed the .toJSON() from before the change so you can tell the difference.

### model.createStream()

  [Scuttlebutt replication](https://github.com/dominictarr/scuttlebutt#replication)


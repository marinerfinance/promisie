'use strict';
const path = require('path');
const series_generator = require('./series_generator');
const series_iterator = require('./iterator');
const divide = require('./divisions');
const chainables = require('./chainables');
const parallel_generator = require('./parallel_generator');
const settle_generator = require('./settle_generator');
const dowhilst_generator = require('./dowhilst_generator');
const retry_generator = require('./retry_generator');
const { QUEUE } = require(path.join(__dirname, '../bin/index'));

var _series = function (operations, cb) {
  for (let i = 0; i < operations.length; i++) {
    if (typeof operations[i] !== 'function') return cb(new TypeError(`ERROR: series can only be called with functions - argument ${i}: ${operations[i]}`));
  }
  let operator = series_generator(operations);
  let iterate = series_iterator(operator, cb);
  iterate();
};

var _map = function (operation, values, concurrency, cb) {
  if (!Array.isArray(values)) cb(new TypeError('ERROR: map can only be called with an Array'));
  cb = (typeof concurrency === 'function') ? concurrency : cb;
  let queue = new QUEUE(operation, concurrency, values);
  if (!queue || !queue.values || !queue.values.length) cb(null, []);
  return queue.insert(...queue.values)
    .resolve()
    .then(result => cb(null, result))
    .catch(cb);
};

var _settle = function (fns) {
  try {
    let fulfilled = [];
    let rejected = [];
    fns[Symbol.iterator] = settle_generator(fns, fulfilled, rejected);
    return this.all(fns)
      .then(() => {
        return { 
          fulfilled: (fulfilled.length < 1) ? fulfilled : fulfilled.sort((a, b) => a.index - b.index), 
          rejected: (rejected.length < 1) ? rejected : rejected.sort((a, b) => a.index - b.index)
        };
      }, e => this.reject(e));
  }
  catch (e) {
    return this.reject(e);
  }
};

var _parallel = function (fns, args) {
  try {
    let result = Array.isArray(fns) ? [] : {};
    fns[Symbol.iterator] = parallel_generator(fns, args, result);
    return this.all(fns)
      .then(() => result, e => this.reject(e));
  }
  catch (e) {
    return this.reject(e);
  }
};

var _dowhilst = function (fn, evaluate, cb) {
  try {
    let operator = dowhilst_generator(fn, evaluate)();
    let iterate = series_iterator(operator, cb);
    iterate();
  }
  catch (e) {
    cb(e);
  }
};

var _iterate = function (generator, cb) {
  let iterate = series_iterator(generator, cb);
  iterate();
};

var _retry = function (fn, options, cb) {
  try {
    let operator = retry_generator.call(this, fn, options)();
    let iterate = series_iterator(operator, cb);
    iterate();
  }
  catch (e) {
    cb(e);
  }
};

var safe_assign = function (data) {
  let result = {};
  for (let key in data) {
    let descriptor = Object.getOwnPropertyDescriptor(data, key);
    if (descriptor && descriptor.writable) result[key] = data[key];
  } 
  return result;
};

var isGenerator = function (val) {
  let generator = function* () { yield true; };
  let constructor = generator.constructor;
  return val.constructor === generator.constructor;
};

var _handleRecursiveParallel = function (fns) {
  return Object.keys(fns).reduce((result, key) => {
    if (fns[key] && typeof fns[key] === 'object') result[key] = this.parallel.bind(this, _handleRecursiveParallel.call(this, fns[key]));
    else result[key] = fns[key];
    return result;
  }, (Array.isArray(fns)) ? [] : {});
};

module.exports = {
  series_generator,
  series_iterator,
  divide,
  chainables,
  parallel_generator,
  settle_generator,
  _series,
  _map,
  _parallel,
  _settle,
  safe_assign,
  isGenerator,
  _dowhilst,
  _iterate,
  _retry,
  _handleRecursiveParallel
};

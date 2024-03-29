"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.DRACOLoader = void 0;

var _typeof2 = _interopRequireDefault(require("@babel/runtime/helpers/typeof"));

var _classCallCheck2 = _interopRequireDefault(require("@babel/runtime/helpers/classCallCheck"));

var _createClass2 = _interopRequireDefault(require("@babel/runtime/helpers/createClass"));

var _inherits2 = _interopRequireDefault(require("@babel/runtime/helpers/inherits"));

var _possibleConstructorReturn2 = _interopRequireDefault(require("@babel/runtime/helpers/possibleConstructorReturn"));

var _getPrototypeOf2 = _interopRequireDefault(require("@babel/runtime/helpers/getPrototypeOf"));

var _three = require("three");

function _createSuper(Derived) { var hasNativeReflectConstruct = _isNativeReflectConstruct(); return function () { var Super = (0, _getPrototypeOf2["default"])(Derived), result; if (hasNativeReflectConstruct) { var NewTarget = (0, _getPrototypeOf2["default"])(this).constructor; result = Reflect.construct(Super, arguments, NewTarget); } else { result = Super.apply(this, arguments); } return (0, _possibleConstructorReturn2["default"])(this, result); }; }

function _isNativeReflectConstruct() { if (typeof Reflect === "undefined" || !Reflect.construct) return false; if (Reflect.construct.sham) return false; if (typeof Proxy === "function") return true; try { Boolean.prototype.valueOf.call(Reflect.construct(Boolean, [], function () {})); return true; } catch (e) { return false; } }

var _taskCache = new WeakMap();

var DRACOLoader = /*#__PURE__*/function (_Loader) {
  (0, _inherits2["default"])(DRACOLoader, _Loader);

  var _super = _createSuper(DRACOLoader);

  function DRACOLoader(manager) {
    var _this;

    (0, _classCallCheck2["default"])(this, DRACOLoader);
    _this = _super.call(this, manager);
    _this.decoderPath = '';
    _this.decoderConfig = {};
    _this.decoderBinary = null;
    _this.decoderPending = null;
    _this.workerLimit = 4;
    _this.workerPool = [];
    _this.workerNextTaskID = 1;
    _this.workerSourceURL = '';
    _this.defaultAttributeIDs = {
      position: 'POSITION',
      normal: 'NORMAL',
      color: 'COLOR',
      uv: 'TEX_COORD'
    };
    _this.defaultAttributeTypes = {
      position: 'Float32Array',
      normal: 'Float32Array',
      color: 'Float32Array',
      uv: 'Float32Array'
    };
    return _this;
  }

  (0, _createClass2["default"])(DRACOLoader, [{
    key: "setDecoderPath",
    value: function setDecoderPath(path) {
      this.decoderPath = path;
      return this;
    }
  }, {
    key: "setDecoderConfig",
    value: function setDecoderConfig(config) {
      this.decoderConfig = config;
      return this;
    }
  }, {
    key: "setWorkerLimit",
    value: function setWorkerLimit(workerLimit) {
      this.workerLimit = workerLimit;
      return this;
    }
  }, {
    key: "load",
    value: function load(url, onLoad, onProgress, onError) {
      var _this2 = this;

      var loader = new _three.FileLoader(this.manager);
      loader.setPath(this.path);
      loader.setResponseType('arraybuffer');
      loader.setRequestHeader(this.requestHeader);
      loader.setWithCredentials(this.withCredentials);
      loader.load(url, function (buffer) {
        var taskConfig = {
          attributeIDs: _this2.defaultAttributeIDs,
          attributeTypes: _this2.defaultAttributeTypes,
          useUniqueIDs: false
        };

        _this2.decodeGeometry(buffer, taskConfig).then(onLoad)["catch"](onError);
      }, onProgress, onError);
    }
    /** @deprecated Kept for backward-compatibility with previous DRACOLoader versions. */

  }, {
    key: "decodeDracoFile",
    value: function decodeDracoFile(buffer, callback, attributeIDs, attributeTypes) {
      var taskConfig = {
        attributeIDs: attributeIDs || this.defaultAttributeIDs,
        attributeTypes: attributeTypes || this.defaultAttributeTypes,
        useUniqueIDs: !!attributeIDs
      };
      this.decodeGeometry(buffer, taskConfig).then(callback);
    }
  }, {
    key: "decodeGeometry",
    value: function decodeGeometry(buffer, taskConfig) {
      var _this3 = this;

      // TODO: For backward-compatibility, support 'attributeTypes' objects containing
      // references (rather than names) to typed array constructors. These must be
      // serialized before sending them to the worker.
      for (var attribute in taskConfig.attributeTypes) {
        var type = taskConfig.attributeTypes[attribute];

        if (type.BYTES_PER_ELEMENT !== undefined) {
          taskConfig.attributeTypes[attribute] = type.name;
        }
      } //


      var taskKey = JSON.stringify(taskConfig); // Check for an existing task using this buffer. A transferred buffer cannot be transferred
      // again from this thread.

      if (_taskCache.has(buffer)) {
        var cachedTask = _taskCache.get(buffer);

        if (cachedTask.key === taskKey) {
          return cachedTask.promise;
        } else if (buffer.byteLength === 0) {
          // Technically, it would be possible to wait for the previous task to complete,
          // transfer the buffer back, and decode again with the second configuration. That
          // is complex, and I don't know of any reason to decode a Draco buffer twice in
          // different ways, so this is left unimplemented.
          throw new Error('THREE.DRACOLoader: Unable to re-decode a buffer with different ' + 'settings. Buffer has already been transferred.');
        }
      } //


      var worker;
      var taskID = this.workerNextTaskID++;
      var taskCost = buffer.byteLength; // Obtain a worker and assign a task, and construct a geometry instance
      // when the task completes.

      var geometryPending = this._getWorker(taskID, taskCost).then(function (_worker) {
        worker = _worker;
        return new Promise(function (resolve, reject) {
          worker._callbacks[taskID] = {
            resolve: resolve,
            reject: reject
          };
          worker.postMessage({
            type: 'decode',
            id: taskID,
            taskConfig: taskConfig,
            buffer: buffer
          }, [buffer]); // this.debug();
        });
      }).then(function (message) {
        return _this3._createGeometry(message.geometry);
      }); // Remove task from the task list.
      // Note: replaced '.finally()' with '.catch().then()' block - iOS 11 support (#19416)


      geometryPending["catch"](function () {
        return true;
      }).then(function () {
        if (worker && taskID) {
          _this3._releaseTask(worker, taskID); // this.debug();

        }
      }); // Cache the task result.

      _taskCache.set(buffer, {
        key: taskKey,
        promise: geometryPending
      });

      return geometryPending;
    }
  }, {
    key: "_createGeometry",
    value: function _createGeometry(geometryData) {
      var geometry = new _three.BufferGeometry();

      if (geometryData.index) {
        geometry.setIndex(new _three.BufferAttribute(geometryData.index.array, 1));
      }

      for (var i = 0; i < geometryData.attributes.length; i++) {
        var attribute = geometryData.attributes[i];
        var name = attribute.name;
        var array = attribute.array;
        var itemSize = attribute.itemSize;
        geometry.setAttribute(name, new _three.BufferAttribute(array, itemSize));
      }

      return geometry;
    }
  }, {
    key: "_loadLibrary",
    value: function _loadLibrary(url, responseType) {
      var loader = new _three.FileLoader(this.manager);
      loader.setPath(this.decoderPath);
      loader.setResponseType(responseType);
      loader.setWithCredentials(this.withCredentials);
      return new Promise(function (resolve, reject) {
        loader.load(url, resolve, undefined, reject);
      });
    }
  }, {
    key: "preload",
    value: function preload() {
      this._initDecoder();

      return this;
    }
  }, {
    key: "_initDecoder",
    value: function _initDecoder() {
      var _this4 = this;

      if (this.decoderPending) return this.decoderPending;
      var useJS = (typeof WebAssembly === "undefined" ? "undefined" : (0, _typeof2["default"])(WebAssembly)) !== 'object' || this.decoderConfig.type === 'js';
      var librariesPending = [];

      if (useJS) {
        librariesPending.push(this._loadLibrary('draco_decoder.js', 'text'));
      } else {
        librariesPending.push(this._loadLibrary('draco_wasm_wrapper.js', 'text'));
        librariesPending.push(this._loadLibrary('draco_decoder.wasm', 'arraybuffer'));
      }

      this.decoderPending = Promise.all(librariesPending).then(function (libraries) {
        var jsContent = libraries[0];

        if (!useJS) {
          _this4.decoderConfig.wasmBinary = libraries[1];
        }

        var fn = DRACOWorker.toString();
        var body = ['/* draco decoder */', jsContent, '', '/* worker */', fn.substring(fn.indexOf('{') + 1, fn.lastIndexOf('}'))].join('\n');
        _this4.workerSourceURL = URL.createObjectURL(new Blob([body]));
      });
      return this.decoderPending;
    }
  }, {
    key: "_getWorker",
    value: function _getWorker(taskID, taskCost) {
      var _this5 = this;

      return this._initDecoder().then(function () {
        if (_this5.workerPool.length < _this5.workerLimit) {
          var _worker2 = new Worker(_this5.workerSourceURL);

          _worker2._callbacks = {};
          _worker2._taskCosts = {};
          _worker2._taskLoad = 0;

          _worker2.postMessage({
            type: 'init',
            decoderConfig: _this5.decoderConfig
          });

          _worker2.onmessage = function (e) {
            var message = e.data;

            switch (message.type) {
              case 'decode':
                _worker2._callbacks[message.id].resolve(message);

                break;

              case 'error':
                _worker2._callbacks[message.id].reject(message);

                break;

              default:
                console.error('THREE.DRACOLoader: Unexpected message, "' + message.type + '"');
            }
          };

          _this5.workerPool.push(_worker2);
        } else {
          _this5.workerPool.sort(function (a, b) {
            return a._taskLoad > b._taskLoad ? -1 : 1;
          });
        }

        var worker = _this5.workerPool[_this5.workerPool.length - 1];
        worker._taskCosts[taskID] = taskCost;
        worker._taskLoad += taskCost;
        return worker;
      });
    }
  }, {
    key: "_releaseTask",
    value: function _releaseTask(worker, taskID) {
      worker._taskLoad -= worker._taskCosts[taskID];
      delete worker._callbacks[taskID];
      delete worker._taskCosts[taskID];
    }
  }, {
    key: "debug",
    value: function debug() {
      console.log('Task load: ', this.workerPool.map(function (worker) {
        return worker._taskLoad;
      }));
    }
  }, {
    key: "dispose",
    value: function dispose() {
      for (var i = 0; i < this.workerPool.length; ++i) {
        this.workerPool[i].terminate();
      }

      this.workerPool.length = 0;
      return this;
    }
  }]);
  return DRACOLoader;
}(_three.Loader);
/* WEB WORKER */


exports.DRACOLoader = DRACOLoader;

function DRACOWorker() {
  var decoderConfig;
  var decoderPending;

  onmessage = function onmessage(e) {
    var message = e.data;

    switch (message.type) {
      case 'init':
        decoderConfig = message.decoderConfig;
        decoderPending = new Promise(function (resolve
        /*, reject*/
        ) {
          decoderConfig.onModuleLoaded = function (draco) {
            // Module is Promise-like. Wrap before resolving to avoid loop.
            resolve({
              draco: draco
            });
          };

          DracoDecoderModule(decoderConfig); // eslint-disable-line no-undef
        });
        break;

      case 'decode':
        var buffer = message.buffer;
        var taskConfig = message.taskConfig;
        decoderPending.then(function (module) {
          var draco = module.draco;
          var decoder = new draco.Decoder();
          var decoderBuffer = new draco.DecoderBuffer();
          decoderBuffer.Init(new Int8Array(buffer), buffer.byteLength);

          try {
            var geometry = decodeGeometry(draco, decoder, decoderBuffer, taskConfig);
            var buffers = geometry.attributes.map(function (attr) {
              return attr.array.buffer;
            });
            if (geometry.index) buffers.push(geometry.index.array.buffer);
            self.postMessage({
              type: 'decode',
              id: message.id,
              geometry: geometry
            }, buffers);
          } catch (error) {
            console.error(error);
            self.postMessage({
              type: 'error',
              id: message.id,
              error: error.message
            });
          } finally {
            draco.destroy(decoderBuffer);
            draco.destroy(decoder);
          }
        });
        break;
    }
  };

  function decodeGeometry(draco, decoder, decoderBuffer, taskConfig) {
    var attributeIDs = taskConfig.attributeIDs;
    var attributeTypes = taskConfig.attributeTypes;
    var dracoGeometry;
    var decodingStatus;
    var geometryType = decoder.GetEncodedGeometryType(decoderBuffer);

    if (geometryType === draco.TRIANGULAR_MESH) {
      dracoGeometry = new draco.Mesh();
      decodingStatus = decoder.DecodeBufferToMesh(decoderBuffer, dracoGeometry);
    } else if (geometryType === draco.POINT_CLOUD) {
      dracoGeometry = new draco.PointCloud();
      decodingStatus = decoder.DecodeBufferToPointCloud(decoderBuffer, dracoGeometry);
    } else {
      throw new Error('THREE.DRACOLoader: Unexpected geometry type.');
    }

    if (!decodingStatus.ok() || dracoGeometry.ptr === 0) {
      throw new Error('THREE.DRACOLoader: Decoding failed: ' + decodingStatus.error_msg());
    }

    var geometry = {
      index: null,
      attributes: []
    }; // Gather all vertex attributes.

    for (var attributeName in attributeIDs) {
      var attributeType = self[attributeTypes[attributeName]];
      var attribute = void 0;
      var attributeID = void 0; // A Draco file may be created with default vertex attributes, whose attribute IDs
      // are mapped 1:1 from their semantic name (POSITION, NORMAL, ...). Alternatively,
      // a Draco file may contain a custom set of attributes, identified by known unique
      // IDs. glTF files always do the latter, and `.drc` files typically do the former.

      if (taskConfig.useUniqueIDs) {
        attributeID = attributeIDs[attributeName];
        attribute = decoder.GetAttributeByUniqueId(dracoGeometry, attributeID);
      } else {
        attributeID = decoder.GetAttributeId(dracoGeometry, draco[attributeIDs[attributeName]]);
        if (attributeID === -1) continue;
        attribute = decoder.GetAttribute(dracoGeometry, attributeID);
      }

      geometry.attributes.push(decodeAttribute(draco, decoder, dracoGeometry, attributeName, attributeType, attribute));
    } // Add index.


    if (geometryType === draco.TRIANGULAR_MESH) {
      geometry.index = decodeIndex(draco, decoder, dracoGeometry);
    }

    draco.destroy(dracoGeometry);
    return geometry;
  }

  function decodeIndex(draco, decoder, dracoGeometry) {
    var numFaces = dracoGeometry.num_faces();
    var numIndices = numFaces * 3;
    var byteLength = numIndices * 4;

    var ptr = draco._malloc(byteLength);

    decoder.GetTrianglesUInt32Array(dracoGeometry, byteLength, ptr);
    var index = new Uint32Array(draco.HEAPF32.buffer, ptr, numIndices).slice();

    draco._free(ptr);

    return {
      array: index,
      itemSize: 1
    };
  }

  function decodeAttribute(draco, decoder, dracoGeometry, attributeName, attributeType, attribute) {
    var numComponents = attribute.num_components();
    var numPoints = dracoGeometry.num_points();
    var numValues = numPoints * numComponents;
    var byteLength = numValues * attributeType.BYTES_PER_ELEMENT;
    var dataType = getDracoDataType(draco, attributeType);

    var ptr = draco._malloc(byteLength);

    decoder.GetAttributeDataArrayForAllPoints(dracoGeometry, attribute, dataType, byteLength, ptr);
    var array = new attributeType(draco.HEAPF32.buffer, ptr, numValues).slice();

    draco._free(ptr);

    return {
      name: attributeName,
      array: array,
      itemSize: numComponents
    };
  }

  function getDracoDataType(draco, attributeType) {
    switch (attributeType) {
      case Float32Array:
        return draco.DT_FLOAT32;

      case Int8Array:
        return draco.DT_INT8;

      case Int16Array:
        return draco.DT_INT16;

      case Int32Array:
        return draco.DT_INT32;

      case Uint8Array:
        return draco.DT_UINT8;

      case Uint16Array:
        return draco.DT_UINT16;

      case Uint32Array:
        return draco.DT_UINT32;
    }
  }
}
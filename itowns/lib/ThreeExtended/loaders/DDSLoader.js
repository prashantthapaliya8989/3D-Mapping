"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.DDSLoader = void 0;

var _classCallCheck2 = _interopRequireDefault(require("@babel/runtime/helpers/classCallCheck"));

var _createClass2 = _interopRequireDefault(require("@babel/runtime/helpers/createClass"));

var _inherits2 = _interopRequireDefault(require("@babel/runtime/helpers/inherits"));

var _possibleConstructorReturn2 = _interopRequireDefault(require("@babel/runtime/helpers/possibleConstructorReturn"));

var _getPrototypeOf2 = _interopRequireDefault(require("@babel/runtime/helpers/getPrototypeOf"));

var _three = require("three");

function _createSuper(Derived) { var hasNativeReflectConstruct = _isNativeReflectConstruct(); return function () { var Super = (0, _getPrototypeOf2["default"])(Derived), result; if (hasNativeReflectConstruct) { var NewTarget = (0, _getPrototypeOf2["default"])(this).constructor; result = Reflect.construct(Super, arguments, NewTarget); } else { result = Super.apply(this, arguments); } return (0, _possibleConstructorReturn2["default"])(this, result); }; }

function _isNativeReflectConstruct() { if (typeof Reflect === "undefined" || !Reflect.construct) return false; if (Reflect.construct.sham) return false; if (typeof Proxy === "function") return true; try { Boolean.prototype.valueOf.call(Reflect.construct(Boolean, [], function () {})); return true; } catch (e) { return false; } }

var DDSLoader = /*#__PURE__*/function (_CompressedTextureLoa) {
  (0, _inherits2["default"])(DDSLoader, _CompressedTextureLoa);

  var _super = _createSuper(DDSLoader);

  function DDSLoader(manager) {
    (0, _classCallCheck2["default"])(this, DDSLoader);
    return _super.call(this, manager);
  }

  (0, _createClass2["default"])(DDSLoader, [{
    key: "parse",
    value: function parse(buffer, loadMipmaps) {
      var dds = {
        mipmaps: [],
        width: 0,
        height: 0,
        format: null,
        mipmapCount: 1
      }; // Adapted from @toji's DDS utils
      // https://github.com/toji/webgl-texture-utils/blob/master/texture-util/dds.js
      // All values and structures referenced from:
      // http://msdn.microsoft.com/en-us/library/bb943991.aspx/

      // let DDPF_RGB = 0x40;
      // let DDPF_YUV = 0x200;
      // let DDPF_LUMINANCE = 0x20000;
      function fourCCToInt32(value) {
        return value.charCodeAt(0) + (value.charCodeAt(1) << 8) + (value.charCodeAt(2) << 16) + (value.charCodeAt(3) << 24);
      }

      function int32ToFourCC(value) {
        return String.fromCharCode(value & 0xff, value >> 8 & 0xff, value >> 16 & 0xff, value >> 24 & 0xff);
      }

      function loadARGBMip(buffer, dataOffset, width, height) {
        var dataLength = width * height * 4;
        var srcBuffer = new Uint8Array(buffer, dataOffset, dataLength);
        var byteArray = new Uint8Array(dataLength);
        var dst = 0;
        var src = 0;

        for (var y = 0; y < height; y++) {
          for (var x = 0; x < width; x++) {
            var b = srcBuffer[src];
            src++;
            var g = srcBuffer[src];
            src++;
            var r = srcBuffer[src];
            src++;
            var a = srcBuffer[src];
            src++;
            byteArray[dst] = r;
            dst++; //r

            byteArray[dst] = g;
            dst++; //g

            byteArray[dst] = b;
            dst++; //b

            byteArray[dst] = a;
            dst++; //a
          }
        }

        return byteArray;
      }

      var FOURCC_DXT1 = fourCCToInt32('DXT1');
      var FOURCC_DXT3 = fourCCToInt32('DXT3');
      var FOURCC_DXT5 = fourCCToInt32('DXT5');
      var FOURCC_ETC1 = fourCCToInt32('ETC1');
      // let off_caps3 = 29;
      // let off_caps4 = 30;
      // Parse header
      var header = new Int32Array(buffer, 0, 31);

      if (header[0] !== 0x20534444) {
        console.error('THREE.DDSLoader.parse: Invalid magic number in DDS header.');
        return dds;
      }

      if (!header[20] & 0x4) {
        console.error('THREE.DDSLoader.parse: Unsupported format, must contain a FourCC code.');
        return dds;
      }

      var blockBytes;
      var fourCC = header[21];
      var isRGBAUncompressed = false;

      switch (fourCC) {
        case FOURCC_DXT1:
          blockBytes = 8;
          dds.format = _three.RGB_S3TC_DXT1_Format;
          break;

        case FOURCC_DXT3:
          blockBytes = 16;
          dds.format = _three.RGBA_S3TC_DXT3_Format;
          break;

        case FOURCC_DXT5:
          blockBytes = 16;
          dds.format = _three.RGBA_S3TC_DXT5_Format;
          break;

        case FOURCC_ETC1:
          blockBytes = 8;
          dds.format = _three.RGB_ETC1_Format;
          break;

        default:
          if (header[22] === 32 && header[23] & 0xff0000 && header[24] & 0xff00 && header[25] & 0xff && header[26] & 0xff000000) {
            isRGBAUncompressed = true;
            blockBytes = 64;
            dds.format = _three.RGBAFormat;
          } else {
            console.error('THREE.DDSLoader.parse: Unsupported FourCC code ', int32ToFourCC(fourCC));
            return dds;
          }

      }

      dds.mipmapCount = 1;

      if (header[2] & 0x20000 && loadMipmaps !== false) {
        dds.mipmapCount = Math.max(1, header[7]);
      }

      var caps2 = header[28];
      dds.isCubemap = caps2 & 0x200 ? true : false;

      if (dds.isCubemap && (!(caps2 & 0x400) || !(caps2 & 0x800) || !(caps2 & 0x1000) || !(caps2 & 0x2000) || !(caps2 & 0x4000) || !(caps2 & 0x8000))) {
        console.error('THREE.DDSLoader.parse: Incomplete cubemap faces');
        return dds;
      }

      dds.width = header[4];
      dds.height = header[3];
      var dataOffset = header[1] + 4; // Extract mipmaps buffers

      var faces = dds.isCubemap ? 6 : 1;

      for (var face = 0; face < faces; face++) {
        var width = dds.width;
        var height = dds.height;

        for (var i = 0; i < dds.mipmapCount; i++) {
          var byteArray = void 0,
              dataLength = void 0;

          if (isRGBAUncompressed) {
            byteArray = loadARGBMip(buffer, dataOffset, width, height);
            dataLength = byteArray.length;
          } else {
            dataLength = Math.max(4, width) / 4 * Math.max(4, height) / 4 * blockBytes;
            byteArray = new Uint8Array(buffer, dataOffset, dataLength);
          }

          var mipmap = {
            'data': byteArray,
            'width': width,
            'height': height
          };
          dds.mipmaps.push(mipmap);
          dataOffset += dataLength;
          width = Math.max(width >> 1, 1);
          height = Math.max(height >> 1, 1);
        }
      }

      return dds;
    }
  }]);
  return DDSLoader;
}(_three.CompressedTextureLoader);

exports.DDSLoader = DDSLoader;
/**
 * PDF.js 5.5+ uses Map/WeakMap getOrInsertComputed (ES2026).
 * Polyfill for browsers that lack it — import before pdfjs-dist.
 */
if (typeof Map !== 'undefined' && !Map.prototype.getOrInsertComputed) {
  Map.prototype.getOrInsertComputed = function (key, callbackfn) {
    if (this.has(key)) return this.get(key)
    const value = callbackfn(key)
    this.set(key, value)
    return value
  }
}

if (typeof Map !== 'undefined' && !Map.prototype.getOrInsert) {
  Map.prototype.getOrInsert = function (key, defaultValue) {
    if (this.has(key)) return this.get(key)
    this.set(key, defaultValue)
    return defaultValue
  }
}

if (typeof WeakMap !== 'undefined' && !WeakMap.prototype.getOrInsertComputed) {
  WeakMap.prototype.getOrInsertComputed = function (key, callbackfn) {
    if (this.has(key)) return this.get(key)
    const value = callbackfn(key)
    this.set(key, value)
    return value
  }
}

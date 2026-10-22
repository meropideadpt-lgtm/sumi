/* Raster-only custom logo uploads. Brand SVG assets are handled by the catalogue. */
const SumiLogoUpload = (() => {
  const MAX_BYTES = 500000;
  const MAX_EDGE = 4096;
  const MAX_PIXELS = 16000000;
  const MIME_TYPES = Object.freeze(['image/png', 'image/jpeg', 'image/webp']);
  const fail = message => { throw new Error(message); };
  const invalid = () => fail('图片内容无效或文件不完整，请选择有效的 PNG、JPEG 或 WebP 图片。');
  const ascii = (bytes, offset, length) => String.fromCharCode(...bytes.subarray(offset, offset + length));
  const big16 = (bytes, offset) => bytes[offset] * 256 + bytes[offset + 1];
  const big32 = (bytes, offset) => bytes[offset] * 16777216 + bytes[offset + 1] * 65536 + bytes[offset + 2] * 256 + bytes[offset + 3];
  const little24 = (bytes, offset) => bytes[offset] + bytes[offset + 1] * 256 + bytes[offset + 2] * 65536;
  const little32 = (bytes, offset) => little24(bytes, offset) + bytes[offset + 3] * 16777216;

  function dimensions(width, height) {
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) invalid();
    if (width > MAX_EDGE || height > MAX_EDGE || width * height > MAX_PIXELS) {
      fail('图片尺寸过大：每边最多 4096 像素，总像素不超过 1600 万。');
    }
    return {width, height};
  }

  function validateFile(file) {
    if (!file || !MIME_TYPES.includes(file.type)) fail('请选择 PNG、JPEG 或 WebP 图片，不支持 SVG 或其他文件类型。');
    if (!Number.isSafeInteger(file.size) || file.size < 1) fail('图片文件为空或无法读取。');
    if (file.size > MAX_BYTES) fail('请选择不超过 500KB 的图片。');
    return {mime:file.type, size:file.size};
  }

  function png(bytes) {
    const signature = [137,80,78,71,13,10,26,10];
    if (bytes.length < 45 || signature.some((value, index) => bytes[index] !== value)) invalid();
    if (big32(bytes, 8) !== 13 || ascii(bytes, 12, 4) !== 'IHDR') invalid();
    const size = dimensions(big32(bytes, 16), big32(bytes, 20));
    let offset = 8, hasImage = false, ended = false;
    while (offset < bytes.length) {
      if (offset + 12 > bytes.length) invalid();
      const length = big32(bytes, offset), type = ascii(bytes, offset + 4, 4);
      if (!/^[A-Za-z]{4}$/.test(type) || offset + 12 + length > bytes.length) invalid();
      if (type === 'IHDR' && offset !== 8) invalid();
      if (type === 'acTL') fail('请使用静态图片，不支持动画图标。');
      if (type === 'IDAT' && length) hasImage = true;
      offset += 12 + length;
      if (type === 'IEND') {
        if (length !== 0 || offset !== bytes.length) invalid();
        ended = true;
        break;
      }
    }
    if (!ended || !hasImage) invalid();
    return size;
  }

  function jpeg(bytes) {
    if (bytes.length < 20 || bytes[0] !== 255 || bytes[1] !== 216 || bytes.at(-2) !== 255 || bytes.at(-1) !== 217) invalid();
    const frameMarkers = new Set([192,193,194,195,197,198,199,201,202,203,205,206,207]);
    let offset = 2, size = null;
    while (offset < bytes.length - 2) {
      if (bytes[offset++] !== 255) invalid();
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === undefined || marker === 0 || marker === 216 || marker === 217) invalid();
      if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
      if (offset + 2 > bytes.length - 2) invalid();
      const length = big16(bytes, offset);
      if (length < 2 || offset + length > bytes.length - 2) invalid();
      if (frameMarkers.has(marker)) {
        if (size || length < 8) invalid();
        const components = bytes[offset + 7];
        if (!components || length !== 8 + components * 3) invalid();
        size = dimensions(big16(bytes, offset + 5), big16(bytes, offset + 3));
      }
      if (marker === 218) {
        if (!size || length < 6 || offset + length >= bytes.length - 2) invalid();
        return size;
      }
      offset += length;
    }
    invalid();
  }

  function webp(bytes) {
    if (bytes.length < 26 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP' || little32(bytes, 4) + 8 !== bytes.length) invalid();
    let offset = 12, canvas = null, image = null;
    while (offset < bytes.length) {
      if (offset + 8 > bytes.length) invalid();
      const type = ascii(bytes, offset, 4), length = little32(bytes, offset + 4), start = offset + 8;
      if (start + length + (length % 2) > bytes.length) invalid();
      if (type === 'ANIM' || type === 'ANMF') fail('请使用静态图片，不支持动画图标。');
      if (type === 'VP8X') {
        if (offset !== 12 || length !== 10 || canvas) invalid();
        if (bytes[start] & 2) fail('请使用静态图片，不支持动画图标。');
        canvas = dimensions(little24(bytes, start + 4) + 1, little24(bytes, start + 7) + 1);
      } else if (type === 'VP8 ') {
        if (image || length < 10 || (bytes[start] & 1) || bytes[start + 3] !== 157 || bytes[start + 4] !== 1 || bytes[start + 5] !== 42) invalid();
        image = dimensions((bytes[start + 6] + bytes[start + 7] * 256) & 16383, (bytes[start + 8] + bytes[start + 9] * 256) & 16383);
      } else if (type === 'VP8L') {
        if (image || length < 5 || bytes[start] !== 47 || (bytes[start + 4] >> 5) !== 0) invalid();
        image = dimensions(1 + ((bytes[start + 1] + bytes[start + 2] * 256) & 16383),
          1 + ((bytes[start + 2] >> 6) + bytes[start + 3] * 4 + ((bytes[start + 4] & 15) * 1024)));
      }
      offset = start + length + (length % 2);
    }
    if (!image || (canvas && (canvas.width !== image.width || canvas.height !== image.height))) invalid();
    return canvas || image;
  }

  function inspectBytes(bytes, mime) {
    if (!(bytes instanceof Uint8Array)) invalid();
    validateFile({type:mime, size:bytes.length});
    const size = mime === 'image/png' ? png(bytes) : mime === 'image/jpeg' ? jpeg(bytes) : webp(bytes);
    return {mime, ...size};
  }

  function readDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reader.onabort = () => reject(new Error('read-failed'));
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });
  }

  function decodeImage(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const finish = (callback, value) => {
        clearTimeout(timer);
        image.onload = image.onerror = null;
        callback(value);
      };
      const timer = setTimeout(() => {
        finish(reject, new Error('decode-timeout'));
        image.src = '';
      }, 10000);
      image.onerror = () => finish(reject, new Error('decode-failed'));
      image.onload = () => finish(resolve, {width:image.naturalWidth, height:image.naturalHeight});
      image.src = url;
    });
  }

  async function read(file, adapters = {}) {
    const {mime, size} = validateFile(file);
    let url;
    try { url = await (adapters.readDataURL || readDataURL)(file); }
    catch { fail('图片读取失败，请重试。'); }
    if (typeof url !== 'string' || url.length > Math.ceil(MAX_BYTES / 3) * 4 + 40) invalid();
    const prefix = 'data:' + mime + ';base64,';
    if (!url.startsWith(prefix)) invalid();
    const encoded = url.slice(prefix.length);
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) invalid();
    let bytes;
    try { bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0)); }
    catch { invalid(); }
    if (bytes.length !== size) invalid();
    inspectBytes(bytes, mime);
    let decoded;
    try { decoded = await (adapters.decodeImage || decodeImage)(url); }
    catch { fail('无法读取这张图片，请选择有效的图片文件。'); }
    dimensions(decoded?.width, decoded?.height);
    return url;
  }

  return Object.freeze({MAX_BYTES, MAX_EDGE, MAX_PIXELS, MIME_TYPES, validateFile, inspectBytes, read});
})();
if (typeof module !== 'undefined' && module.exports) module.exports = SumiLogoUpload;

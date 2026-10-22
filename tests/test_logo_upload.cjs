const test = require('node:test');
const assert = require('node:assert/strict');
const Upload = require('../logo-upload.js');

// Small actual raster files; JPEG/WebP fixtures were generated locally with Pillow.
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const JPEG = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAADAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDjqKKK+kPAP//Z';
const WEBP = 'UklGRjgAAABXRUJQVlA4ICwAAADQAQCdASoCAAMAAUAmJaACdLoB+AADsAD+8iJf/LPn8NnHv/5BcsLriMAAAA==';
const WEBP_LOSSLESS = 'UklGRh4AAABXRUJQVlA4TBEAAAAvAYAAEAdQrXrUsniBiOh/AAA=';
const WEBP_EXTENDED = 'UklGRloAAABXRUJQVlA4WAoAAAAQAAAAAQAAAgAAQUxQSAcAAAAAeHh4eHh4AFZQOCAsAAAA0AEAnQEqAgADAAFAJiWgAnS6AfgAA7AA/vIiX/yz5/DZx7/+QXLC64jAAAA=';
const bytes = base64 => new Uint8Array(Buffer.from(base64, 'base64'));
const file = (body = PNG, type = 'image/png') => ({name:'logo', type, size:bytes(body).length});
const adapters = (body = PNG, type = 'image/png') => ({
  readDataURL:async () => `data:${type};base64,${body}`,
  decodeImage:async () => ({width:type === 'image/png' ? 1 : 2, height:type === 'image/png' ? 1 : 3})
});
function be32(array, offset, value) { array[offset] = value >>> 24; array[offset+1] = value >>> 16; array[offset+2] = value >>> 8; array[offset+3] = value; }

test('upload metadata accepts only bounded nonempty raster files', () => {
  for (const type of Upload.MIME_TYPES) assert.deepEqual(Upload.validateFile({type,size:500000}), {mime:type,size:500000});
  for (const candidate of [null,{}, {type:'image/svg+xml',size:1}, {type:'image/gif',size:1}, {type:'image/png',size:0}, {type:'image/png',size:500001}, {type:'image/png',size:NaN}, {type:'image/png',size:1.5}]) {
    assert.throws(() => Upload.validateFile(candidate));
  }
});

test('actual PNG JPEG and all three static WebP layouts report their dimensions', () => {
  assert.deepEqual(Upload.inspectBytes(bytes(PNG), 'image/png'), {mime:'image/png',width:1,height:1});
  assert.deepEqual(Upload.inspectBytes(bytes(JPEG), 'image/jpeg'), {mime:'image/jpeg',width:2,height:3});
  for (const body of [WEBP,WEBP_LOSSLESS,WEBP_EXTENDED]) {
    assert.deepEqual(Upload.inspectBytes(bytes(body), 'image/webp'), {mime:'image/webp',width:2,height:3});
  }
});

test('file extensions and declared MIME cannot make SVG or unrelated bytes a raster', () => {
  const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>');
  for (const type of Upload.MIME_TYPES) assert.throws(() => Upload.inspectBytes(svg,type));
  assert.throws(() => Upload.inspectBytes(bytes(JPEG),'image/png'));
  assert.throws(() => Upload.inspectBytes(bytes(PNG),'image/webp'));
  assert.throws(() => Upload.inspectBytes('not bytes','image/png'));
});

test('truncated or trailing-content PNG JPEG and WebP files are rejected', () => {
  for (const [body,type] of [[PNG,'image/png'],[JPEG,'image/jpeg'],[WEBP,'image/webp']]) {
    const value = bytes(body);
    assert.throws(() => Upload.inspectBytes(value.subarray(0,value.length-1),type));
    assert.throws(() => Upload.inspectBytes(new Uint8Array([...value,60,115,118,103,62]),type));
  }
  const brokenChunk=bytes(PNG); be32(brokenChunk,33,10000);
  assert.throws(() => Upload.inspectBytes(brokenChunk,'image/png'));
  const brokenRiff=bytes(WEBP); brokenRiff[4]--;
  assert.throws(() => Upload.inspectBytes(brokenRiff,'image/webp'));
});

test('oversized PNG dimensions and total pixels are rejected before decode', () => {
  for (const [width,height] of [[4097,1],[1,4097],[4096,4096],[0,1]]) {
    const value=bytes(PNG); be32(value,16,width);be32(value,20,height);
    assert.throws(() => Upload.inspectBytes(value,'image/png'));
  }
  const allowed=bytes(PNG);be32(allowed,16,4000);be32(allowed,20,4000);
  assert.equal(Upload.inspectBytes(allowed,'image/png').width,4000);
});

test('oversized JPEG and WebP dimensions are detected in headers', () => {
  const jpg=bytes(JPEG), marker=Buffer.from(jpg).indexOf(Buffer.from([255,192]));
  jpg[marker+7]=0x10;jpg[marker+8]=0x01;
  assert.throws(() => Upload.inspectBytes(jpg,'image/jpeg'), /尺寸/);
  const lossy=bytes(WEBP);lossy[26]=1;lossy[27]=16;
  assert.throws(() => Upload.inspectBytes(lossy,'image/webp'), /尺寸/);
  const lossless=bytes(WEBP_LOSSLESS);lossless[21]=0;lossless[22]=(lossless[22]&0xc0)|16;
  assert.throws(() => Upload.inspectBytes(lossless,'image/webp'), /尺寸/);
  const extended=bytes(WEBP_EXTENDED);extended[24]=0;extended[25]=16;extended[26]=0;
  assert.throws(() => Upload.inspectBytes(extended,'image/webp'), /尺寸/);
});

test('animation and inconsistent extended WebP dimensions are rejected', () => {
  const animated=bytes(WEBP_EXTENDED);animated[20]|=2;
  assert.throws(() => Upload.inspectBytes(animated,'image/webp'), /静态/);
  const mismatched=bytes(WEBP_EXTENDED);mismatched[24]=9;
  assert.throws(() => Upload.inspectBytes(mismatched,'image/webp'));
  const png=bytes(PNG), chunk=new Uint8Array(20);
  be32(chunk,0,8);chunk.set(new TextEncoder().encode('acTL'),4);
  const apng=new Uint8Array(png.length+chunk.length);apng.set(png.subarray(0,33));apng.set(chunk,33);apng.set(png.subarray(33),53);
  assert.throws(() => Upload.inspectBytes(apng,'image/png'), /静态/);
});

test('read returns the original validated data URL only after real-image adapter acceptance', async () => {
  for (const [body,type] of [[PNG,'image/png'],[JPEG,'image/jpeg'],[WEBP,'image/webp']]) {
    let decoded=false;
    const io=adapters(body,type), decode=io.decodeImage;
    io.decodeImage=async url => { decoded=true;assert.equal(url,await io.readDataURL());return decode(url); };
    assert.equal(await Upload.read(file(body,type),io),`data:${type};base64,${body}`);
    assert.equal(decoded,true);
  }
});

test('invalid metadata and raster headers fail before invoking expensive image decode', async () => {
  let read=false, decode=false;
  const io={readDataURL:async()=>{read=true;return 'data:image/png;base64,PHN2Zz4='},decodeImage:async()=>{decode=true;return {width:1,height:1}}};
  await assert.rejects(Upload.read({type:'image/svg+xml',size:5},io));
  assert.equal(read,false);
  await assert.rejects(Upload.read({type:'image/png',size:5},io));
  assert.equal(read,true);assert.equal(decode,false);
});

test('read rejects mismatched data URLs lengths and malformed base64', async () => {
  for (const url of [`data:image/jpeg;base64,${PNG}`,`data:image/png;base64,${PNG.slice(0,-1)}!`,'javascript:alert(1)',null]) {
    await assert.rejects(Upload.read(file(),{...adapters(),readDataURL:async()=>url}));
  }
  await assert.rejects(Upload.read({...file(),size:1},adapters()));
});

test('read and image-decode failures remain explicit and never return partial content', async () => {
  await assert.rejects(Upload.read(file(),{readDataURL:async()=>{throw Error('I/O')}}),/读取失败/);
  await assert.rejects(Upload.read(file(),{...adapters(),decodeImage:async()=>{throw Error('invalid image')}}),/无法读取/);
  await assert.rejects(Upload.read(file(),{...adapters(),decodeImage:async()=>({width:0,height:0})}));
  await assert.rejects(Upload.read(file(),{...adapters(),decodeImage:async()=>({width:9000,height:9000})}),/尺寸/);
});

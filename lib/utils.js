const { readdirSync, statSync, existsSync, readFileSync } = require('fs');
const { join, relative, resolve, parse, extname } = require('path');
const fs = require('fs-extra');
const { isString, toArray, isValue, isFunction, isBoolean, isPlainObject } = require('chek');
const colurs = require('colurs').get();

function toRelative(path, from) {
  from = from || process.cwd();
  return relative(from, path);
}

function emptyDir(dir, nested) {
  if (nested) {
    fs.emptyDirSync(dir);
  } else {
    const files = walk(dir, false);
    files.forEach((f) => {
      fs.removeSync(f);
    });
  }
}

function copyDir(from, to) {
  const files = walk(from, false);
  files.forEach((f) => {
    const parsed = parse(f);
    const dest = join(to, parsed.base);
    fs.copySync(f, dest);
  });
}

function walk(dir, excluded, nested, transform) {

  if (!dir)
    return;

  if (isBoolean(excluded)) {
    transform = nested;
    nested = excluded;
    excluded = [];
  }

  if (isFunction(nested)) {
    transform = nested;
    nested = undefined;
  }

  excluded = toArray(excluded, []);

  const result = [];

  const isExcluded = (path, name) => {
    const clone = excluded.slice(0);
    if (!clone.length)
      return false;
    if (/^\./.test(name))
      return true;
    let _excluded = false;
    while (!_excluded && clone.length) {
      let exp = clone.shift();
      if (isString(exp))
        exp = new RegExp(exp, 'g');
      _excluded = exp.test(path);
    }
    return _excluded;
  };

  const walkDir = (d) => {

    readdirSync(d).forEach((name) => {

      let fullpath = join(d, name);
      const stat = statSync(fullpath);

      if (stat.isFile() && !isExcluded(fullpath, name)) {
        if (transform)
          fullpath = transform(fullpath, d, dir);
        result.push(fullpath);
      } else if (stat.isDirectory() && nested !== false) {
        walkDir(fullpath);
      }

    });

  };

  dir = resolve(dir);

  if (existsSync(dir))
    walkDir(dir);

  return result;

}

function readFile(path) {
  return readFileSync(resolve(path), 'utf8');
}

function readCSV(path, transform, headers, delim) {
  delim = delim || ',';
  headers = typeof headers === 'undefined' ? true : headers;
  const obj = {
    headers: null,
    rows: []
  };
  const file = readFileSync(path).toString();
  let rows = file.split(/\r?\n/);
  if (headers) {
    headers = rows.shift().split(delim).map(v => v.trim().toLowerCase());
  }
  // No header rows use numeric col numbers.
  else {
    headers = rows[0].split(delim).map((v, i) => i);
  }
  obj.headers = headers;
  obj.rows = rows.map((v) => {
    const o = {};
    v.split(delim).forEach((v, i) => {
      v = v.trim();
      // check if should transform the value.
      if (transform)
        v = transform(v, headers[i]);
      o[headers[i]] = v.trim();
    });
    return o;
  });
  return obj;
}

function repeat(char, cur, next) {
  if (next.length < cur.length)
    return cur;
  return char.repeat(next.length);
}

function colorize(val, styles) {
  return colurs.applyAnsi(val, styles || []);
}

function format(val, ...arr) {
  const exp = /%s/g;
  const matches = val.match(exp);
  if (!matches.length)
    return val;
  let i = 0;
  return val.replace(exp, (v) => {
    v = arr[i] || 'unknown';
    i++;
    return v;
  });
}

function log(msg, prefix, styles, suppress) {
  const arr = [];
  if (isBoolean(prefix)) {
    suppress = prefix;
    prefix = undefined;
  }
  if (prefix)
    arr.push(colorize(prefix + ':', styles));
  arr.push(msg);
  if (!suppress)
    console.log();
  console.log(...arr);
  if (!suppress)
    console.log();
}


module.exports = {
  format,
  log,
  colorize,
  join,
  resolve,
  extname,
  toRelative,
  repeat,
  walk,
  readFile,
  readCSV,
  copyDir,
  emptyDir
};
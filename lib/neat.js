const { table, getBorderCharacters } = require('table');
const tbl2 = require('text-table');
const fs = require('fs-extra');
const { extname } = require('path');
const { getType, castType, toDate, slugify, isDate, isNumber, isString, extend, contains, capitalize, titlecase, last } = require('chek');
const colurs = require('colurs').init();
const utils = require('./utils');

function ensureBackup(dir, options) {

  if (!options.backup || options.preview || options.backup === 'false')
    return;

  const backupDir = utils.join(dir, options.backup);

  if (fs.existsSync(backupDir)) {
    utils.log(`whoops directory "${utils.toRelative(backupDir, dir)}" already exists, run "list-purge" before running action.`, 'WARNING', 'yellow');
    process.exit(1);
  }

  // Ensure backup directory.
  fs.ensureDirSync(backupDir);

  // Copy files to backup.
  utils.copyDir(dir, backupDir);

}

function normalizeSlug(str) {
  str = slugify(str);
  return str.replace(/^-{1,}/, '').replace(/-{1,}$/, '');
}

function transformFilename(path, current, options) {
  const obj = {
    dir: current,
    filename: utils.toRelative(path, current),
    columns: []
  };
  obj.columns = obj.filename.split(options.cols || ' - ');
  // don't normalize slug or neg vals.
  if (!options.key || !options.key.length)
    return obj;
  let amt = obj.columns[options.key[1]];
  const isNeg = /^\$?-/.test(amt) || /^\$?\(/.test(amt);
  amt = amt.replace(/\.[a-z]+/, '').replace(/[^0-9.]/g, '');
  if (isNeg)
    amt = '(' + amt + ')';
  const vendor = normalizeSlug(obj.columns[options.key[0]]);
  obj.key = (vendor + '-' + amt).toLowerCase();
  obj.vendor = vendor;
  obj.amount = amt;
  return obj;
}

function transformPre(val, options, post) {

  const isNeg = /^\$?-/.test(val) || /^\$?\(/.test(val);

  if (/^(\(|-|\$|\$-)\$?[0-9]/.test(val))
    val = val.replace(/[^0-9.]/g, '');

  if (/^[0-9.]+\.$/.test(val))
    val = val.slice(0, val.length - 1);

  const type = getType(val);
  val = castType(val, type, val);

  if (type === 'string') {
    let tmp = toDate(val);
    if (isDate(tmp)) {
      tmp = tmp.toISOString().split('T');
      val = tmp[0];
    } else {
      val = normalizeSlug(val);
      if (val.length > (options.truncate)) {
        val = val.slice(0, options.truncate);
        val = val.replace(/-$/, '');
      }
    }
  } else if (isNumber(val)) {
    const rnd = (Math.round(val * 100) / 100) + '';
    val = parseFloat(rnd).toFixed(2);
    if (isNeg)
      val = `(${val})`;
  }

  if (post)
    return transformPost(val, options);

  return val;

}

function transformPost(val, options) {

  const isNeg = /^\([0-9.]+\)/.test(val);

  if (isNumber(val) || isNeg) {

    let tmp = (val + '');
    tmp = isNeg ? tmp.replace(/(\(|\)|-)/g, '') : tmp;
    const padOffset = options.parens ? options.pad - 2 : options.pad - 1;
    const padLen = isNeg ? padOffset : options.pad;
    let len = padLen - tmp.length;
    len = len > 0 ? len : 0;
    const pad = len > 0 ? '0'.repeat(len) : '';
    val = isNeg ? options.parens ? `(${pad}${tmp})` : `-${pad}${tmp}` : `${pad}${tmp}`;

  } else if (isString(val) && options.titlecase) {
    val = titlecase(val);
  }

  return val;

}

function showPreview(dir, matches, conflicts, type) {

  type = type || 'conflict';

  console.log();

  if (matches.length) {

    let prevDiv = ['-', '-'];

    const prevTable = matches.map(m => {
      const src = utils.toRelative(m.src, dir);
      const dest = utils.toRelative(m.dest, dir);
      prevDiv[0] = utils.repeat('-', prevDiv[0], src);
      prevDiv[1] = utils.repeat('-', prevDiv[1], dest);
      return [
        src,
        dest
      ];
    });

    prevDiv = prevDiv.map(p => utils.colorize(p, 'gray'));

    prevTable.unshift(prevDiv);
    prevTable.unshift(['From', 'To']);

    const prevTableStr = tbl2(prevTable, {
      stringLength: (s) => {
        return colurs.strip(s).length;
      }
    });

    console.log(prevTableStr);

  }

  if (conflicts.length) {

    let confDiv = ['-'];

    const confTable = conflicts.map(f => {

      let filename = utils.join(f.dir, f.filename);
      filename = utils.toRelative(filename, dir);
      confDiv[0] = utils.repeat('-', confDiv[0], filename);

      return [filename, utils.colorize('(' + type + ')', 'red')];

    });

    confDiv = confDiv.map(p => utils.colorize(p, 'gray'));
    confTable.unshift(confDiv);
    confTable.unshift(['Filename']);

    const confTableStr = tbl2(confTable, {
      align: ['l'],
      stringLength: (s) => {
        return colurs.strip(s).length;
      }
    });

    console.log();
    console.log(confTableStr);

  }

  if (!matches.length && !conflicts.length)
    console.log('Whoops nothing to preview...');

  console.log();

}

function renameList(dir, map, preview, options) {

  const defaults = {
    mapExp: /[a-zA-Z0-9_]+/g,
    truncate: 25,
    csv: '_list.csv',
    backup: '_backup',
    delim: ',',
    key: [0, 1]
  };

  dir = utils.resolve(dir || '.');
  options = extend({}, defaults, options);

  options.key = options.key.map(k => parseInt(k));

  const csvPath = utils.join(dir, options.csv);

  if (!fs.existsSync(csvPath)) {
    utils.log(`cannot load csv using ${utils.toRelative(csvPath, dir)} the path was not found.`, 'ERROR', 'red');
    process.exit(1);
  }

  ensureBackup(dir, options);

  // Read the CSV.
  function transform(val, header) {
    return transformPre(val, options);
  }
  const csv = utils.readCSV(csvPath, transform, true, options.delim);

  const joiner = options.joiner === 'space' ? ' ' : options.joiner;
  const hdrs = csv.headers.join(joiner);
  map = map || hdrs;

  // Allows specifying map by indexes instead of names.
  if (/^[0-9]{1,},/.test(map)) {
    map = map
      .replace(/\s+/g, '')
      .split(',')
      .map(v => {
        return csv.headers[v];
      }).join(joiner);
  }

  // Load filenames.
  const listExp = new RegExp(options.csv + '$');
  const files = utils.walk(dir, listExp, false, (path, current) => {
    return transformFilename(path, current, options);
  });

  const matches = [];
  const filesClone = files.slice(0) || [];

  csv.rows.forEach((row, i) => {

    if (!row.vendor)
      return;

    const vendor = row.vendor;
    const amount = row.amount;
    const vendorExp = new RegExp('^' + vendor);
    let key = vendor + '-' + amount;

    const isMatch = (item) => {
      return (item.key === key) || (vendorExp.test(item.vendor) && ((item.amount + '') === (amount + '')));
    };

    const found = filesClone.filter(f => {
      return isMatch(f);
    });

    // Ensure found ONLY one match.
    if (found.length < 2 && found[0]) {

      let rename = map.replace(options.mapExp, (v) => {

        return transformPost(row[v] || '');

        // let val = row[v] || '';

        // // const isNeg = /^\(/.test(val);

        // const isNeg = /^\([0-9.]+\)/.test(val);

        // if (isNumber(val) || isNeg) {

        //   let tmp = (val + '');
        //   tmp = isNeg ? tmp.replace(/(\(|\))/g, '') : tmp;
        //   const padLen = isNeg ? options.pad - 2 : options.pad;
        //   let len = padLen - tmp.length;
        //   len = len > 0 ? len : 0;
        //   const pad = len > 0 ? '0'.repeat(len) : '';
        //   // val = isNeg ? `(${pad}${tmp})` : `${pad}${tmp}`;
        //   val = isNeg ? options.parens ? `(${pad}${tmp})` : `-${pad}${tmp}` : `${pad}${tmp}`;

        // } else if (isString(val) && options.titlecase) {

        //   val = titlecase(val);

        // }

        // return val;
      }) + utils.extname(found[0].filename);

      rename = rename.trim();

      if (/\s\[\]\..+$/.test(rename))
        rename = rename.replace(/\s\[\]/, '');

      row.dest = utils.join(found[0].dir, rename);
      row.src = utils.join(found[0].dir, found[0].filename);

      matches.push(row);
      filesClone.splice(filesClone.indexOf(found[0]), 1);

    }

  });

  // Show preview for rename.
  if (preview) {

    showPreview(dir, matches, filesClone);

  }

  // Rename the files.
  else {

    if (matches.length) {
      matches.forEach(m => {
        fs.renameSync(m.src, m.dest);
      });
    }

    if (filesClone.length) {

      fs.ensureDirSync(utils.join(dir, '_conflicts'));

      filesClone.forEach(m => {

        const src = utils.join(m.dir, m.filename);
        const dest = utils.join(m.dir, '_conflicts', m.filename);
        fs.copySync(src, dest);
        fs.removeSync(src);

      });

    }

  }

  return {
    renamed: matches.length || 0,
    conflicts: filesClone.length || 0
  };

}

function restoreList(dir, from, empty, purge) {
  dir = utils.resolve(dir || process.cwd());
  if (empty)
    utils.emptyDir(dir);
  from = utils.resolve(dir, from);
  if (!fs.existsSync(from)) {
    utils.log(`cannot restore from directory ${from} the path was not found.`, 'ERROR', 'red');
    process.exit(1);
  }
  utils.copyDir(from, dir);
  if (purge)
    purgeList(dir, from);
}

function purgeList(dir, backup) {
  dir = utils.resolve(dir || '.');
  backup = utils.resolve(dir, backup || '_backup');
  if (!fs.existsSync(backup)) {
    utils.log(`cannot purge directory ${utils.toRelative(backup)} the path was not found.`, 'ERROR', 'red');
    process.exit(1);
  }
  fs.removeSync(backup);
  const conflictPath = utils.resolve(dir, '_conflicts');
  if (fs.existsSync(conflictPath))
    fs.removeSync(conflictPath);
}

function replaceList(dir, options) {

  dir = utils.resolve(dir || '.');

  ensureBackup(dir, options);

  let find = options.find;
  let replace = options.replace || '';
  let filter = options.filter;

  const matches = [];
  const conflicts = [];

  if (filter && !utils.isRegExp(filter)) {

    if (!~filter.indexOf('/'))
      filter = '/' + utils.escapeRegexp(filter) + '/gi';

    filter = utils.toRegExp(filter);

  }

  if (!options.insert) {

    if (!utils.isRegExp(find)) {

      if (options.multi && !/^\//.test(find))
        find = '/(' + utils.escapeRegexp(find.trim()).replace(/,/gi, '|') + ')/gi';

      if (!~find.indexOf('/'))
        find = '/' + utils.escapeRegexp(find) + '/gi';

      find = utils.toRegExp(find);

    }

  }

  let files = utils.walk(dir, (path, current) => {
    return transformFilename(path, current, options, false);
  });

  files.forEach((o) => {

    let split = options.insert || options.span ? find.split(',') : null;

    if ((options.insert || options.span) && split.length !== 2) {
      utils.log(`whoops, cannot insert or replace range without start and end find characters.`, 'WARNING', 'yellow');
      process.exit(1);
    }

    const iStart = split ? o.filename.indexOf(split[0]) : null;
    const iEnd = split ? o.filename.lastIndexOf(split[1]) : null;

    const hasInsert = split && split.length === 2 && ~iStart && ~iEnd;
    let hasMatch = hasInsert || (utils.isRegExp(find) && find.test(o.filename));

    if (filter && !filter.test(o.filename))
      hasMatch = false;

    if (hasMatch) {

      let dest;

      if (options.insert)
        dest = utils.replaceInsert(o.filename, iStart, iEnd, replace);
      else if (options.span)
        dest = utils.replaceRange(o.filename, iStart, iEnd, replace);
      else
        dest = o.filename.replace(find, replace);

      matches.push({
        src: utils.join(o.dir, o.filename),
        dest: utils.join(o.dir, dest)
      });

    } else {
      conflicts.push(o);
    }

  });

  if (options.preview) {

    showPreview(dir, matches, conflicts, 'ignored');

  } else {

    matches.forEach((v) => {
      try {
        fs.renameSync(v.src, v.dest);
      } catch (ex) {
        utils.log(ex.message, 'WARNING', 'yellow');
      }
    });

  }

  return {
    renamed: matches.length || 0,
    conflicts: conflicts.length || 0
  };

}

function reorderList(dir, options) {

  dir = utils.resolve(dir || '.');

  ensureBackup(dir, options);

  const matches = [];
  const conflicts = [];
  let filter = options.filter;

  if (filter && !utils.isRegExp(filter)) {
    if (!~filter.indexOf('/'))
      filter = '/' + utils.escapeRegexp(filter) + '/gi';
    filter = utils.toRegExp(filter);
  }

  const excludeExp = [new RegExp('_list.csv$'), /^\..+/];

  let files = utils.walk(dir, excludeExp, false, (path, current) => {
    return transformFilename(path, current, options, false);
  });

  files.forEach((f) => {

    if (filter && !filter.test(f.filename)) {
      conflicts.push(f);
      return;
    }

    // strip last column of file extension.
    const ext = extname(f.filename);
    f.columns[f.columns - 1] = last(f.columns).replace(ext, '');

    f.columns = options.order.map((idx) => {
      idx = parseInt(idx);
      if (!f.columns[idx]) {
        utils.log(`cannot reorder index ${idx} using column of undefined - ${f.columns.join(', ')}.`, 'ERROR', 'red');
        process.exit(1);
      }
      return transformPre(f.columns[idx], options, true);
    });

    f.src = utils.join(dir, f.filename);
    f.dest = utils.join(dir, f.columns.join(options.cols) + ext);

    matches.push(f);

  });

  if (options.preview) {

    showPreview(dir, matches, conflicts, 'ignored');

  } else {

    matches.forEach((v) => {
      try {
        fs.renameSync(v.src, v.dest);
      } catch (ex) {
        utils.log(ex.message, 'WARNING', 'yellow');
      }
    });

  }

  return {
    renamed: matches.length || 0,
    conflicts: conflicts.length || 0
  };


}

module.exports = {
  renameList,
  restoreList,
  purgeList,
  replaceList,
  reorderList
};
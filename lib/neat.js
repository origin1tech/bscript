const { table, getBorderCharacters } = require('table');
const tbl2 = require('text-table');
const fs = require('fs-extra');
const { getType, castType, toDate, slugify, isDate, isNumber, extend, contains, capitalize } = require('chek');
const colurs = require('colurs').get();
const utils = require('./utils');

function renameList(dir, map, preview, options) {

  const defaults = {
    mapExp: /[a-zA-Z0-9_]+/g,
    truncate: 25,
    csv: '_list.csv',
    backup: '_backup'
  };

  dir = utils.resolve(dir || '.');
  options = extend({}, defaults, options);

  const csvPath = utils.join(dir, options.csv);

  if (!fs.existsSync(csvPath)) {
    utils.log(`cannot load csv using ${utils.toRelative(csvPath, dir)} the path was not found.`, 'ERROR', 'red');
    process.exit(1);
  }

  if (options.backup && !preview) {

    const backupDir = utils.join(dir, options.backup);

    if (fs.existsSync(backupDir)) {
      utils.log(`whoops directory "${utils.toRelative(backupDir, dir)}" already exists, run "list-purge" before running list-rename.`, 'WARNING', 'yellow');
      process.exit(1);
    }

    // Ensure backup directory.
    fs.ensureDirSync(backupDir);

    // Copy files to backup.
    utils.copyDir(dir, backupDir);

  }

  function transform(val, header) {

    const isNeg = /^\$?-/.test(val) || /^\$?\(/.test(val);

    if (/^(\(|-|\$|\$-)\$?[0-9]/.test(val))
      val = val.replace(/[^0-9.]/g, '');

    const type = getType(val);
    val = castType(val, type, val);

    if (type === 'string') {
      let tmp = toDate(val);
      if (isDate(tmp)) {
        tmp = tmp.toISOString().split('T');
        val = tmp[0];
        // 'T' + tmp[1].split('.')[0];
      } else {
        val = slugify(val);
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

    return val;

  }

  // Read the CSV.
  const csv = utils.readCSV(csvPath, transform, true, ';');

  map = map || csv.headers.join('-');

  // Load filenames.
  const listExp = new RegExp(options.csv + '$');
  const files = utils.walk(dir, listExp, false, (path, current) => {
    const obj = {
      dir: current,
      filename: utils.toRelative(path, current),
      columns: []
    };
    obj.columns = obj.filename.split(' - ');
    let amt = obj.columns[obj.columns.length - 1];
    const isNeg = /^\$?-/.test(amt) || /^\$?\(/.test(amt);
    amt = amt.replace(/\.[a-z]+/, '').replace(/[^0-9.]/g, '');
    if (isNeg)
      amt = '(' + amt + ')';
    const vendor = slugify(obj.columns[0]);
    obj.key = (vendor + '-' + amt).toLowerCase();
    return obj;
  });

  const matches = [];
  const filesClone = files.slice(0) || [];

  csv.rows.forEach((row, i) => {

    if (!row.vendor)
      return;

    let key = row.vendor + '-' + row.amount;
    const found = filesClone.filter(f => {
      return f.key === key;
    });

    // Ensure found ONLY one match.
    if (found.length < 2 && found[0]) {

      const rename = map.replace(options.mapExp, (v) => {
        return row[v] || '';
      }) + utils.extname(found[0].filename);

      row.dest = utils.join(found[0].dir, rename);
      row.src = utils.join(found[0].dir, found[0].filename);

      matches.push(row);
      filesClone.splice(filesClone.indexOf(found[0]), 1);

    }

  });

  // Show preview for rename.
  if (preview) {

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

    if (filesClone.length) {

      let confDiv = ['-'];
      const confTable = filesClone.map(f => {

        let filename = utils.join(f.dir, f.filename);
        filename = utils.toRelative(filename, dir);
        confDiv[0] = utils.repeat('-', confDiv[0], filename);

        return [filename, utils.colorize('(conflict)', 'red')];

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

    if (!matches.length && !filesClone.legth)
      console.log('Whoops nothing to preview...');

    console.log();

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
  fs.removeSync(utils.resolve(dir, '_conflicts'));
}

module.exports = {
  renameList,
  restoreList,
  purgeList
};
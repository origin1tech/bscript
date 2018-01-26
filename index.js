const Pargv = require('pargv').Pargv;
const pkg = require('./package.json');
const figlet = require('figlet');
const colurs = require('colurs').init();
const app = require('./lib/app');
const neat = require('./lib/neat');
const nmap = require('./lib/nmap');
const utils = require('./lib/utils');
const { toArray } = require('chek');

const CONFIG = app.load();

const pargv = new Pargv({
  layoutWidth: 90,
  displayNone: true
});

// PARGV

let appName = figlet.textSync(pkg.name, { font: 'ogre' });
appName = colurs.blue(appName);

pargv.name(appName)
  .description('Bscript consists of a group of helpful scripts for Brandon Lindholm.')
  .version(pkg.version)
  .license(pkg.license);

// RENAMING

pargv.command('list-rename.lr [dir:string:.]', 'Renames files in a directory using a csv file\'s metadata to create the new filename.')
  .option('--csv, -c [csv]', 'The csv file path to parse.', '_list.csv')
  .option('--key, -k [key]', 'The column indexes used for key.', [0, 1])
  .option('--delim, -d [delim]', 'The delimiter to be used for csv rows', ',')
  .option('--map, -m [map:string]', 'A map string used to build rename filename.')
  .option('--cols, -c [cols]', 'The expression for creating columns', ' - ')
  .option('--preview, -p', 'When true previews renames & conflicts.')
  .option('--pad, -d [pad]', 'Ensures numbers padded with 0 this many digits before decimal.', 9)
  .option('--truncate, -t [truncate:number]', 'Max string length.', 25)
  .option('--titlecase, -l', 'When true strings converted to titlecase.')
  .option('--joiner, -j [joiner]', 'Character uses for joining typicaly space or -.', 'space')
  .option('--backup, -b [backup]', 'Relative backup directory or false.', '_backup')
  .example([
    [`$ list-rename --map 'receipt-vendor-[note]-amount'`, 'Using map and current directory.'],
    [`$ list-rename ./some/path --map 'vendor [note] $amount`, 'Rename with custom directory.'],
    [`$ list-rename --backkup 'my_backup'`, 'Rename with custom backup directory.'],
    [`$ list-rename --truncate 30`, 'Specify truncate length.'],
    [`$ list-rename './some/path' --preview`, 'Preview renames & conflicts.']
  ])
  .action((dir, parsed, cmd) => {
    const result = neat.renameList(dir, parsed.map, parsed.preview, {
      truncate: parsed.truncate,
      backup: parsed.backup,
      csv: parsed.csv,
      titlecase: parsed.titlecase,
      pad: parsed.pad,
      joiner: parsed.joiner,
      delim: parsed.delim,
      key: parsed.key,
      cols: parsed.cols
    });
    let renamed = utils.colorize(' ' + result.renamed + ' ', ['bgGreen', 'black']);
    let conflicts = utils.colorize(' ' + result.conflicts + ' ', ['bgRed']);
    let msg = '%s files renamed with %s conflicts.';
    let prefix = 'SUCCESS';
    let styles = ['green'];
    if (parsed.preview) {
      prefix = 'PREVIEW';
      msg = '%s files can be renamed with %s conflicts.';
    }
    if (result.renamed === 0) {
      if (!parsed.preview)
        prefix = 'WARNING';
      styles = ['yellow'];
    }
    msg = utils.format(msg, renamed, conflicts);
    utils.log(msg, prefix, styles);
  });

pargv.command('list-replace [dir:string:.]', 'Find and replace by an expression.')
  .option('--find, -f <find:string>', 'The expression to find.')
  .option('--replace, -r [replace]', 'The value to replace found values with.')
  .option('--multi, -m', 'When true replaces csv values from find.')
  .option('--insert, -i', 'Inserts current value between two replaced values.')
  .option('--range, -r', 'Replaces all characters in range including start/end chars.')
  .option('--filter, -f [filter]', 'An expression to prefilter before find action.', undefined, 'string')
  .option('--backup, -b [backup]', 'Backup folder location', '_backup')
  .option('--preview, -p', 'Shows preview without changes.')
  .when('--all', '--replace')
  .example([
    [`$ list-replace --find '['`, 'Replace character "[" with empty space.'],
    [`$ list-replace --find '610.87' --replace '625.55`, 'Replace charactes "610.87" with "625.87".'],
    [`$ list-replace --find '/pdf$/' --replace 'txt'`, 'Replace all "pdf" file extensions with "txt".'],
    [`$ list-replace --find '[,],)' --multi`, 'Replaces either "[", "]" or ")" with a space.']
  ])
  .action((dir, parsed) => {
    const result = neat.replaceList(dir, parsed);
    let renamed = utils.colorize(' ' + result.renamed + ' ', ['bgGreen', 'black']);
    let ignored = utils.colorize(' ' + result.conflicts + ' ', ['bgYellow', 'black']);
    let msg = '%s files renamed with %s ignored.';
    let prefix = 'SUCCESS';
    let styles = ['green'];
    if (parsed.preview) {
      prefix = 'PREVIEW';
      msg = '%s files can be renamed with %s ignored.';
    }
    if (result.renamed === 0) {
      if (!parsed.preview)
        prefix = 'WARNING';
      styles = ['yellow'];
    }
    msg = utils.format(msg, renamed, ignored);
    utils.log(msg, prefix, styles);
  });

pargv.command('list-restore.lt [to:string:.]', 'Restores a previous list-rename action using a backup folder, typically named _backup.')
  .option('--from, -f [from]', 'Specify folder name to restore from.', '_backup')
  .option('--empty, -e', 'When true empties the directory before restore.', true)
  .option('--purge, -p', 'When true purges the backup folder.', false)
  .example([
    ['$ list-restore', 'Restore to current dir from _backup folder.'],
    [`$ list-restore './some/path'`, 'Restore to defined path.'],
    [`$ list-restore --from 'my_folder'`, 'Restore to current dir from my_folder.'],
    [`$ list-restore --destroy`, 'Restore to current dir & destroy _backup.'],
  ])
  .action((to, parsed, cmd) => {
    neat.restoreList(to, parsed.from, parsed.empty, parsed.purge);
    to = utils.toRelative(to);
    console.log();
    utils.log(`restored directory "${to || '.'}" using "${parsed.from}".`, 'SUCCESS', 'green', true);
    if (parsed.purge)
      utils.log(`directory "${parsed.from}" has been purged.`, 'PURGED', 'magenta', true);
    console.log();
  });

pargv.command('list-purge.lp [dir]', 'Purges the auto generated backup and conflicts folders from running list-rename.')
  .option('--backup, -b [backup]', 'The backup folder path.', '_backup')
  .describe('dir', 'The directory to purge backup and conflicts folders for.')
  .example([
    ['$ list-purge', 'Purge using defaults in current directory.'],
    [`$ list-purge --backup 'my_backup'`, 'Purge using custom backup directory.']
  ])
  .action((dir, parsed, cmd) => {
    neat.purgeList(dir, parsed.backup);
    utils.log(`purged ${parsed.backup} using directory "${utils.toRelative(dir || '.') || '.'}".`, 'SUCCESS', 'green');
  });

// NETWORK

pargv.command('ping.pi [start:string] [end:string] --servers [servers:string] --mode [mode]', 'Pings network looking up hostnames, mac addresses and vendor details. Pass --mode import to import scanned values and overwrite local values or --mode merge to merge local values with new scanned hostnames.')
  .describe('--mode', 'import overwrites, merge combines scan w/ local hostnames.')
  .describe('start', 'The starting server address, range or cidr to query.')
  .describe('end', 'The ending ip to query in range.')
  .describe('--servers', 'A CSV list of server ip\'s wrapped in quotes.')
  .default('--mode', 'merge')
  .example([
    ['$ ping', 'queries network using local machine cidr.'],
    ['$ ping 192.168.1.25 192.168.1.50', 'queries range between addresses.'],
    ['$ ping 192.168.1.25-50', 'queries as above but in shorthand.'],
    ['$ ping 192.168.1.0/24', 'queries cidr range.'],
  ])
  .action((start, end, parsed) => {
    if (!parsed.servers)
      parsed.servers = true;
    nmap.ping(start, end, parsed.servers, parsed.mode);
  });

// OPEN

pargv.command('open.op <file> [app] --opts.o [opts]', 'Opens any file, ip or url from command line. Pass through flags must be prefixed with xx- or xx--. This tells the CLI to ignore processing and simply pass through to the opening program.')
  .coerce('--opts', (val, cmd) => {
    if (/^xx/.test(val))
      return val.replace(/^xx/, '');
    return val;
  })
  .describe('file', 'File, IP or URL to be opened.')
  .describe('app', 'A specified app to use to open the value.')
  .describe('--opts', 'A csv list of optional arguments.')
  .example([
    ['$ open google.com', 'Opens url using default browser.'],
    ['$ open google.com firefox', 'Opens url using defined browser.'],
    [`$ open google.com 'google chrome' --opts 'xx--incognito'`, 'Opens url using chrome in incognito mode.'],
  ])
  .action((file, app, parsed, cmd) => {
    parsed.opts = toArray(parsed.opts, []);
    nmap.open(file, app, parsed.opts);
  });

// CONFIG

pargv.command('set.st <key:string> <value>', 'Sets a key\'s value in the "bscript" config file.')
  .describe('key', 'The config key to set.')
  .describe('value', 'The value for the key.')
  .example([
    ['$ set defaults.browser firefox', 'sets Firefox as the browser default.'],
    ['$ set hosts.192-168-1-22 my_host_name', 'sets a host name.']
  ])
  .action((key, value, parsed, cmd) => {
    const prev = app.find(key);
    app.put(key, value);
    app.save();
    utils.log(`key: ${utils.colorize(key, 'cyan')}  previous: ${utils.colorize(prev, 'magenta')}  current: ${utils.colorize(value, 'green')}`);
  });

pargv.command('get.gt <key:string>', 'Sets a key\'s value in the "bscript" config file.')
  .describe('key', 'The config key to set.')
  .example([
    ['$ get defaults.browser', 'gets the browser default.'],
    ['$ set hosts.192-168-1-22', 'gets a host name.']
  ])
  .action((key, parsed, cmd) => {
    const val = app.find(key);
    utils.log(`key: ${utils.colorize(key, 'cyan')}  value: ${utils.colorize(val, 'green')}`);
  });

pargv.command('remove.rm <key:string>', 'Remove a key from the "bscript" config file.')
  .describe('key', 'The configuration key to be removed.')
  .example([
    ['$ remove defaults.browser', 'removes the default brower setting.']
  ])
  .action((key, parsed) => {
    const prev = app.find(key);
    app.remove(key);
    app.save();
    utils.log(`key: ${utils.colorize(key, 'cyan')}  removed: ${utils.colorize(prev, 'red')}`);
  });

pargv.command('set-host.sh <ip:string> <name>', 'Sets a hostname in "bscript" config file.')
  .describe('ip', 'The ip address to set a host name for.')
  .describe('name', 'The hostname associated with the ip.')
  .example([
    ['$ set-host 192.168.1.50 my_host_name', 'sets hostname for ip.']
  ])
  .action((ip, name, parsed) => {
    const prev = nmap.getHost(ip);
    nmap.setHost(ip, name);
    app.save();
    utils.log(`ip: ${utils.colorize(ip, 'cyan')}  previous: ${utils.colorize(prev, 'magenta')}  current: ${utils.colorize(name, 'green')}`);
  });

pargv.command('get-host.gh <ip:string>', 'Gets a hostname or ip in "bscript" config file.')
  .describe('ip', 'The ip address to set a host name for.')
  .example([
    ['$ get-host 192.168.1.50', 'gets hostname for ip.'],
    ['$ get-host my_hostname', 'gets ip for hostname.']
  ])
  .action((ip, parsed) => {
    let type = 'ip';
    let type2 = 'hostname';
    let val = nmap.getHost(ip);
    if (!val) { // try to lookup by host name.
      val = nmap.getHostByName(ip);
      type = 'hostname';
      type2 = 'ip';
    }
    utils.log(`${type}: ${utils.colorize(ip, 'cyan')}  ${type2}: ${utils.colorize(val, 'green')}`);
  });

pargv.command('remove-host.rh <ip:string>', 'Removes a hostname in "bscript" config file.')
  .describe('ip', 'The ip address to be removed.')
  .example([
    ['$ remove-host 192.168.1.50', 'removes hostname for ip.']
  ])
  .action((ip, parsed) => {
    const prev = nmap.getHost(ip);
    nmap.removeHost(ip);
    app.save();
    utils.log(`ip: ${utils.colorize(ip, 'cyan')}  removed: ${utils.colorize(prev, 'red')}`);
  });

pargv.command('version', 'Shows the current version of the application.')
  .action(() => {
    utils.log(`Bscript version: ${pkg.version}`);
  });


pargv.exec();
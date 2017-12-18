const xml2js = require('xml2js');
const { spawn, exec } = require('child_process');
const { inspect } = require('util');
const { isValue, isObject, keys, isBoolean, isArray, contains, toArray, isWindows } = require('chek');
const colurs = require('colurs').get();
const { log, colorize } = require('./utils');
const { table, getBorderCharacters } = require('table');
const Ora = require('ora');
const opn = require('opn');
const ip = require('./ip');
const app = require('./app');
const exp = require('./exp');

const CONFIG = app.load();

const SPINNER = new Ora({
  text: 'Scanning network...',
  spinner: 'dots2'
});

const ADDRESS = ip.address(true);
const SUBNET = ip.subnet(ADDRESS.address, ADDRESS.netmask);


function handleError(err, exit) {

  if (SPINNER)
    SPINNER.clear();

  let stack = err.stack || '';
  console.log();
  log(err.message, 'ERROR', 'red', true);

  if (stack.length) {
    stack = stack.split('\n').slice(1, 4)
      .map(s => {
        return colorize('  ' + s.replace(/^\s*/, ''), 'gray');
      });
    console.log(stack.join('\n'));
  }

  console.log();

  if (isValue(exit) && exit !== false) {
    exit = exit === true ? 1 : exit;
    process.exit(exit);
  }

}

function parseXML(chunks, done) {

  if (!isObject(chunks))
    return done(new Error(`Cannot parse chunks of type ${typeof chunks}.`));

  const xml = chunks.join('');

  try {

    const opts = { attrkey: 'item' };
    const parser = new xml2js.Parser(opts);

    parser.parseString(xml, function parseXML(err, json) {
      if (err)
        return done(err);
      done(null, json.nmaprun);
    });

  } catch (err) {
    done(err);
  }

}

function run(args, done) {

  args = args || [];

  // Default args.
  if (!args.length)
    args = ['-sP', '192.168.1.0/24'];

  args.unshift('nmap');

  // Ensure XML output.
  if (!~args.indexOf('-oX -'))
    args.push('-oX -');

  let chunks = [];

  let child = exec(args.join(' '), (err) => {
    if (err)
      return done(err);
  });

  child.stderr.on('data', function byteErr(chunk) {
    // ignore errors.
  });

  child.stdout.on('data', function byteChunk(chunk) {
    chunks.push(chunk);
  });

  child.stdout.on('end', function byteEnd() {
    if (chunks.length > 0) {
      parseXML(chunks, done);
    } else {
      done(null, {});
    }
  });
}

function compile(data) {

  const item = data.item;
  const stats = data.runstats[0];
  const finished = stats.finished[0].item;
  const totals = stats.hosts[0].item;
  const hosts = data.host;

  const meta = {
    version: item.version,
    args: item.args,
    status: finished.exit,
    start: item.start,
    end: finished.time,
    elapsed: finished.elapsed,
    up: totals.up,
    down: totals.down,
    total: totals.total
  };

  const nodes = [];


  hosts.forEach((h) => {
    const status = h.status[0].item;
    const addresses = h.address.map(a => {
      return {
        address: a.item.addr,
        type: a.item.addrtype,
        vendor: a.item.vendor
      };
    });
    if (h.hostnames.length === 1 && /\r?\n/.test(h.hostnames[0]))
      h.hostnames = [];

    h.hostnames = h.hostnames || [];
    const hostnames = h.hostnames.map(h => {
      return h.hostname[0].item.name;
    });
    nodes.push({
      state: status.state,
      reason: status.reason,
      hostnames: hostnames,
      addresses: addresses
    });
  });

  return {
    meta: meta,
    nodes: nodes
  };

}

function format(data, truncate) {

  if (!isValue(truncate))
    truncate = 20;

  if (truncate === 0)
    truncate = undefined;

  const meta = data.meta;
  const nodes = data.nodes;
  const border = getBorderCharacters('void');

  let div = '-'.repeat(85) + '\n';
  let str = div + `NMAP NETWORK SCAN\n${colurs.applyAnsi(meta.args, 'gray')}`;
  str += '\n' + div;

  const tblData = [
    ['No.', 'Address', 'Host', 'Mac', 'Vendor']
  ];

  nodes.forEach((n, i) => {

    const addrs = n.addresses.slice(0).filter(a => a.type !== 'mac').map(a => a.address);
    const mac = n.addresses.slice(0).filter(a => a.type === 'mac')[0];
    const hosts = n.hostnames.slice(0) || [];

    let host = hosts.shift();
    const addr = addrs.shift();
    const addrsList = addrs.length ? addrs.join(', ') : '';

    let arr = [i + 1 + ')', addr, host || '', (mac && mac.address) || '', (mac && mac.vendor) || ''];

    tblData.push(arr);

  });

  // Build out the output.
  str += table(tblData, { border: border, columns: { 2: { truncate: truncate }, 4: { truncate: truncate } } });
  str += div;
  str += `up: ${colurs.applyAnsi(meta.up, 'gray')} down: ${colurs.applyAnsi(meta.down, 'gray')} total: ${colurs.applyAnsi(meta.total, 'gray')} elapsed: ${colurs.applyAnsi(meta.elapsed, 'gray')} status: ${colurs.applyAnsi(meta.status, 'gray')} `;

  return str;

}

function show(data, text) {
  SPINNER.clear();
  console.log(data);
  console.log();
  SPINNER.succeed(text || 'Done!').stop();
  console.log();
}

function serializeIp(addr) {
  if (!addr)
    return;
  return addr.replace(/\./g, '-');
}

function deserializeIp(addr) {
  if (!addr)
    return;
  return addr.replace(/-/g, '.');
}

function setHost(addr, name) {
  if (!addr || !name)
    handleError(`cannot set host using address ${addr} with name ${name}.`, true);
  let serialized = 'hosts.' + serializeIp(addr);
  app.put(serialized, name);
}

function getHost(addr) {
  let serialized = 'hosts.' + serializeIp(addr);
  return app.find(serialized);
}

function getHostByName(name) {
  const hosts = app.find('hosts') || {};
  let key;
  for (const k in hosts) {
    if (key) break;
    if (hosts[k] === name)
      key = k;
  }
  return deserializeIp(key);
}

function removeHost(addr) {
  let serialized = 'hosts.' + serializeIp(addr);
  app.remove(serialized);
}

function clearHosts() {
  app.put('hosts', {});
}

function ping(start, end, servers, mode) {

  console.log();
  SPINNER.start();

  if (isArray(end) || isBoolean(end)) {
    mode = servers;
    servers = end;
    end = undefined;
  }

  const args = ['-sP'];

  // If no start add default.
  if (!start) {
    end = undefined;
    start = SUBNET.networkAddress + '/' + SUBNET.subnetMaskLength;
  }

  if (!end && !/(\/|-)/g.test(start))
    handleError('start & ending address, cidr or range required, ex: 192.168.1.0/24 or 192.168.1.100-225.', true);

  // If end create range.
  if (end) {
    end = end.split('.').pop();
    start += ('-' + end);
  }

  if (servers === true) {

    servers = [];

    // If cidr get subnet info asssume
    // first address is router.
    let firstAddr;
    if (/\//.test(start)) {
      firstAddr = ip.cidrSubnet(start).firstAddress;
    } else {
      let octets = start.split('.').slice(0, 3);
      octets.push('1');
      firstAddr = octets.join('.');
    }

    if (firstAddr && !contains(servers, firstAddr))
      servers.unshift(firstAddr);

  }

  args.push(start);
  if (servers) {
    args.push('--dns-servers');
    args.push(servers.join(','));
  }

  run(args, (err, data) => {

    if (err)
      handleError(err, true);

    const compiled = compile(data);

    // MODES: input, output, merge.
    // import: scan host names are imported to new config.hosts object.
    // merge: use config.hosts but if missing and scanned has results input. (default)

    if (mode === 'import')
      clearHosts();

    // if mode is false don't process hostnames.
    if (mode !== false) {

      compiled.nodes.forEach(n => {

        // scanned hostname.
        let hostname = n.hostnames[0];
        let hostnameLookup;

        n.addresses.forEach(a => {
          if (!hostnameLookup)
            hostnameLookup = getHost(a.address);
          if (a.type !== 'mac' && hostname && ((mode === 'import') || (mode === 'merge' && !hostnameLookup))) {
            setHost(a.address, hostname);
          }
        });

        // If merge update scanned results.
        if (mode === 'merge' && hostnameLookup) {
          if (!contains(n.hostnames, hostnameLookup))
            n.hostnames.unshift(hostnameLookup);
        }

      });

    }

    if (isValue(mode) && mode !== false)
      app.save();

    show(format(compiled));

  });

}

function open(addr, app, args) {

  let opts = { wait: false };

  if (isWindows())
    opts.wait = true;

  args = args || [];

  const lookupHost = getHostByName(addr);
  if (lookupHost)
    addr = 'http://' + lookupHost;

  if (!app) {
    if (CONFIG.defaults.browser) {
      if ((exp.IP_EXP.test(addr) || exp.URL_EXP.test(addr))) {
        app = CONFIG.defaults.browser;
      } else if (exp.hasDomainExt(addr)) {
        addr = 'http://' + addr.replace(/^http:\/\//, '');
        app = CONFIG.defaults.browser;
      }
    }
    if (exp.IMG_EXP.test(addr) && CONFIG.defaults.image)
      app = CONFIG.defaults.image;
  }


  if (app)
    args.unshift(app);

  opts.app = args;

  opn(addr, opts).then((proc) => {
    log(`opened "${addr}" successfully.`, 'SUCCESS', 'green');
    process.exit(0);
  }).catch((err) => {
    handleError(err, true);
  });

}

module.exports = {
  ping,
  open,
  setHost,
  removeHost,
  getHost,
  getHostByName,
  serializeIp,
  deserializeIp
};
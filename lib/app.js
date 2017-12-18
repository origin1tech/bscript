const fs = require('fs-extra');
const { homedir, EOL } = require('os');
const { join } = require('path');
const { get, set, del, extend, isArray, isPlainObject } = require('chek');
const { platform } = require('os');


const HOME_DIR = homedir();
const HOME_PATH = join(HOME_DIR, '.bscript');
const HOME_CONFIG_PATH = join(HOME_PATH, 'bscript.json');
const PLATFORM = platform();

const DEFAULTS = {
  defaults: {},
  hosts: {}
};

if (PLATFORM === 'darwin') {
  DEFAULTS.defaults.browser = 'google chrome';
  DEFAULTS.defaults.image = 'Preview';
} else if (PLATFORM === 'win32') {
  // DEFAULTS.defaults.browser = 'chrome';
} else {
  DEFAULTS.defaults.browser = 'google-chrome';
}

let _config;

function load(force) {

  if (_config && !force)
    return _config;

  fs.ensureDirSync(HOME_PATH);

  if (fs.existsSync(HOME_CONFIG_PATH))
    _config = fs.readJSONSync(HOME_CONFIG_PATH);

  _config = extend({}, DEFAULTS, _config);
  save();

  return _config;

}

function find(key) {
  return get(_config, key);
}

function put(key, val) {
  set(_config, key, val);
  return _config;
}

function remove(key) {
  del(_config, key);
  return _config;
}

function save(config) {
  const json = JSON.stringify(config || _config, null, 2);
  fs.writeFileSync(HOME_CONFIG_PATH, json);
}

module.exports = {
  load,
  save,
  put,
  remove,
  find
};
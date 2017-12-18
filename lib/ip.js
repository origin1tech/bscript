const { keys, isBoolean } = require('chek');
const { networkInterfaces } = require('os');
const ip = require('ip');

function address(name, family, detail) {

  if (isBoolean(name)) {
    detail = name;
    name = undefined;
  }

  if (isBoolean(family)) {
    detail = family;
    family = undefined;
  }

  const interfaces = networkInterfaces();
  family = family || 'ipv4';

  if (name && name !== 'private' && name !== 'public') {
    const res = interfaces[name].filter((details) => {
      const fam = details.family.toLowerCase();
      return fam === family;
    });
    if (res.length === 0)
      return null;
    if (detail)
      return res[0];
    return res[0].address;
  }

  const mapped = keys(interfaces).map((nic) => {

    const addresses = interfaces[nic].filter((details) => {
      details.family = details.family.toLowerCase();
      if (details.family !== family || ip.isLoopback(details.address)) {
        return false;
      } else if (!name) {
        return true;
      }

      return name === 'public' ? ip.isPrivate(details.address) :
        ip.isPublic(details.address);

    });

    return addresses.length ? addresses[0] : null;

  }).filter(Boolean);

  const loop = { address: ip.loopback(family) };
  const result = !mapped.length ? loop : mapped[0];

  if (detail)
    return result;

  return result.address;

}

// Override address.
ip.address = address;

module.exports = ip;
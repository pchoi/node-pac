var fs = require('fs');
var tgz = require('tar.gz');
var mkdirp = require('mkdirp');
var Path = require('path');
var glob = require('glob');
var async = require('async');
var _ = require('underscore');


var log = function() {
  console.log.apply(console, arguments);
};

var error = function() {
  console.error.apply(console, arguments);
};


module.exports = function(targetModule, isProduction) {

  var cwd = process.cwd();
  var pkgjson = require(Path.join(cwd, 'package.json'));

  // get dependency list
  var deps = pkgjson.dependencies;
  var devDeps = pkgjson.devDependencies;

  var modulePath = Path.join(cwd, '.modules');
  var dependenciesPath = Path.join(modulePath, 'dependencies');
  var devDependenciesPath = Path.join(modulePath, 'devDependencies');
  var sep = '-v';

  var pack = function(name, version, cb) {
    log('Packing', name + sep + version);
    var source = Path.join(cwd, 'node_modules', name);

    var dest;
    if (deps[name]) {
      dest = Path.join(dependenciesPath, name + sep + version + '.tgz');
    } else {
      dest = Path.join(devDependenciesPath, name + sep + version + '.tgz');
    }

    new tgz().compress(source, dest, function(err) {
      if (err)
        error('Failed to pack', name);
      else
        log('Packed', name);
      cb();
    });
  };

  var packAll = function(srcPath, srcList, curInst) {
    // retrieve all packed dependencies
    var curMods = glob.sync('*.tgz', {
      cwd: srcPath
    }).reduce(function(memo, file) {
      file = file.replace(/\.tgz$/i, '');
      var name = file.substring(0, file.lastIndexOf(sep));
      var version = file.substring(file.lastIndexOf(sep) + sep.length);
      memo[name] = version;
      return memo;
    }, {});

    // remove any packed modules that are not in the source list
    _.difference(Object.keys(curMods), Object.keys(srcList)).forEach(function(name) {
      var fv = name + sep + curMods[name];
      log('Module ', fv, 'is not in the ' + srcPath, '. Removing it.');
      fs.unlinkSync(Path.join(srcPath, fv + '.tgz'));
    });

    // warn about missing deps
    _.difference(Object.keys(srcList), Object.keys(curInst)).forEach(function(name) {
      error('WARNING:', name, 'is not installed!');
    });

    // Update any dependencies that have different versions
    // and pack any that are missing completely
    async.eachSeries(Object.keys(curInst), function(name, cb) {
      if (!srcList[name]) return cb();
      if (curInst[name] === curMods[name]) return cb();
      if (!curMods[name]) {
        log('Adding', name + sep + curInst[name]);
      }
      if (curMods[name] && curInst[name] !== curMods[name]) {
        log('Module', name, 'has changed from ', curMods[name], 'to', curInst[name]);
        fs.unlinkSync(Path.join(srcPath, name + sep + curMods[name] + '.tgz'));
      }
      return pack(name, curInst[name], cb);
    });
  };

  // ensure that the .modules directory exists
  mkdirp.sync(modulePath);
  mkdirp.sync(dependenciesPath);
  mkdirp.sync(devDependenciesPath);

  // fail if the user specified a module that doesn't exist
  if (targetModule && !deps[targetModule] && !devDeps[targetModule]) {
    error(targetModule + ' doesn\'t exist');
    process.exit(1);
  }
  // check for a specific module to pac
  else if (targetModule && (deps[targetModule] || devDeps[targetModule])) {
    var name = targetModule;
    var file, version;
    try {
      file = require(Path.join(process.cwd(), 'node_modules', name, 'package.json'));
      version = file.version;
    } catch (e) {
      error(e);
      process.exit(1);
    }
    log('Adding', name + sep + file.version);
    pack(name, version, function() {
      process.exit(0);
    });
  }
  // otherwise pac them all
  else {
    // get a list of currently installed node_modules
    var curInst = glob.sync('node_modules/*/package.json', {
      cwd: cwd
    }).reduce(function(memo, file) {
      file = Path.join(cwd, file);
      var pkg = require(file);
      memo[pkg.name] = pkg.version;
      return memo;
    }, {});

    packAll(dependenciesPath, deps, curInst);

    if (!isProduction) {
      packAll(devDependenciesPath, devDeps, curInst);
    }

  }

}
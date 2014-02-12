var fs = require('fs');
var tgz = require('tar.gz');
var mkdirp = require('mkdirp');
var Path = require('path');
var glob = require('glob');
var async = require('async');
var rmrf = require('rmrf');

var log = function() {
  console.log.apply(console, arguments);
};

var error = function() {
  console.error.apply(console, arguments);
};

module.exports = function(isProduction) {

  var cwd = process.cwd();
  var modulePath = Path.join(cwd, '.modules');
  var dependenciesPath = Path.join(modulePath, 'dependencies');
  var devDependenciesPath = Path.join(modulePath, 'devDependencies');
  var nodeModulesPath = Path.join(cwd, 'node_modules');

  // ensure that the node_modules directory exists
  mkdirp.sync(nodeModulesPath);

  function install(srcPath, destPath) {
    var sep = '-v';
    async.eachSeries(glob.sync('*.tgz', {
      cwd: srcPath
    }), function(file, cb) {
      var archive = Path.join(srcPath, file);
      file = file.replace(/\.tgz$/i, '');
      var name = file.substring(0, file.lastIndexOf(sep));
      var version = file.substring(file.lastIndexOf(sep) + sep.length);

      // remove existing installed module
      if (fs.existsSync(Path.join(destPath, name))) {
        rmrf(Path.join(destPath, name));
      }

      // extract the module into node_modules
      new tgz().extract(archive, destPath, function(err) {
        if (!err) log('Extracted', name + '@' + version);
        else error(err);
        cb();
      });

    }, function() {
      log('\nDone! Now run \'npm rebuild\'');
    });
  }

  install(dependenciesPath, nodeModulesPath);

  if (!isProduction) {
    install(devDependenciesPath, nodeModulesPath);
  }

};
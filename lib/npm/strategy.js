'use strict';

var fs = require('fs');
var tgz = require('tar.gz');
var mkdirp = require('mkdirp');
var Path = require('path');
var glob = require('glob');
var async = require('async');
var rmrf = require('rmrf');
var _ = require('underscore');

var log = function() {
  console.log.apply(console, arguments);
};

var error = function() {
  console.error.apply(console, arguments);
};

function NpmStrategy(options) {
	this.isProduction = options.isProduction || false;
	this.cwd = options.cwd || process.cwd();
	this.modulePath = Path.join(this.cwd, '.modules');
	this.nodeModulesPath = Path.join(this.cwd, 'node_modules');
	this.dependenciesPath = Path.join(this.modulePath, 'dependencies');
	this.devDependenciesPath = Path.join(this.modulePath, 'devDependencies');

	var pkgjson = require(Path.join(this.cwd, 'package.json'));
	this.deps = pkgjson.dependencies;
	this.devDeps = pkgjson.devDependencies;

	// ensure that the relevant directory exists
	mkdirp.sync(this.nodeModulesPath);
	mkdirp.sync(this.dependenciesPath);
	mkdirp.sync(this.devDependenciesPath);
}

NpmStrategy.prototype._install = function(srcPath, destPath) {
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
};

NpmStrategy.prototype._pack = function(name, version, cb) {
	var sep = '-v';

	log('Packing', name + sep + version);
	var source = Path.join(this.cwd, 'node_modules', name);

	var dest;
	if (this.deps[name]) {
	  dest = Path.join(this.dependenciesPath, name + sep + version + '.tgz');
	} else {
	  dest = Path.join(this.devDependenciesPath, name + sep + version + '.tgz');
	}

	new tgz().compress(source, dest, function(err) {
	  if (err)
	    error('Failed to pack', name);
	  else
	    log('Packed', name);
	  cb();
	});
};

NpmStrategy.prototype._packAll = function(srcPath, srcList, curInst) {
	var self = this;
	var sep = '-v';

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
	  return self._pack(name, curInst[name], cb);
	});
};

NpmStrategy.prototype.install = function() {
	this._install(this.dependenciesPath, this.nodeModulesPath);

	if (!this.isProduction) {
		this._install(this.devDependenciesPath, this.nodeModulesPath);
	}
};

NpmStrategy.prototype.pack = function(target) {
	var self = this;
	var sep = '-v';
	
	if (target && !this.deps[target] && !this.devDeps[target]) {
		error(target + ' doesn\'t exist');
		process.exit(1);
	} else if (target && (this.deps[target] || this.devDeps[target])) {
		var name = target;
		var file, version;
		try {
			file = require(Path.join(this.cwd, 'node_modules', name, 'package.json'));
			version = file.version;
		} catch (e) {
			error(e);
			process.exit(1);
		}
		log('Adding', name + sep + file.version);
		this._pack(name, version, function() {
			process.exit(0);
		});
	} else {
		// get a list of currently installed node_modules
		var curInst = glob.sync('node_modules/*/package.json', {
		  cwd: this.cwd
		}).reduce(function(memo, file) {
		  file = Path.join(self.cwd, file);
		  var pkg = require(file);
		  memo[pkg.name] = pkg.version;
		  return memo;
		}, {});

		this._packAll(this.dependenciesPath, this.deps, curInst);

		if (!this.isProduction) {
		  this._packAll(this.devDependenciesPath, this.devDeps, curInst);
		}
	}
};

module.exports = NpmStrategy;
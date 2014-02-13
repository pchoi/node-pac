'use strict';
var NpmStrategy = require('./lib/npm/strategy');

var isProduction = process.env.NODE_ENV === 'production';

var npmStrategy = new NpmStrategy({
	isProduction: isProduction
});

if (~process.argv.indexOf('install')) {
	npmStrategy.install();
} else {
	var arg = process.argv[0] === 'node' ? process.argv[2] : process.argv[1];
	npmStrategy.pack(arg);
}
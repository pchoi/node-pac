var packer = require('./packer.js');
var installer = require('./installer.js');


var isProduction = process.env.NODE_ENV === 'production' || process.argv.indexOf('--production') > -1;

// naive
if (~process.argv.indexOf('install')) {
  installer(isProduction);
} else {
  var arg = process.argv[0] == 'node' ? process.argv[2] : process.argv[1];
  packer(arg, isProduction);
}


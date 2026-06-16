require('react-native-get-random-values');

const { Buffer } = require('buffer');
const process = require('process');

if (typeof globalThis.Buffer === 'undefined') {
  globalThis.Buffer = Buffer;
}
if (typeof global !== 'undefined' && typeof global.Buffer === 'undefined') {
  global.Buffer = Buffer;
}

if (typeof globalThis.process === 'undefined') {
  globalThis.process = process;
}
if (typeof global !== 'undefined' && typeof global.process === 'undefined') {
  global.process = process;
}

const fallbackNavigator = { userAgent: 'ReactNative/Expo' };

if (typeof globalThis.navigator === 'undefined') {
  globalThis.navigator = fallbackNavigator;
} else if (!globalThis.navigator.userAgent) {
  Object.defineProperty(globalThis.navigator, 'userAgent', {
    value: fallbackNavigator.userAgent,
    configurable: true,
  });
}

if (typeof global !== 'undefined') {
  if (typeof global.navigator === 'undefined') {
    global.navigator = globalThis.navigator;
  } else if (!global.navigator.userAgent) {
    Object.defineProperty(global.navigator, 'userAgent', {
      value: fallbackNavigator.userAgent,
      configurable: true,
    });
  }
}

require('expo-router/entry');

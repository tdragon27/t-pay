module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          root: ['./'],
          alias: {
            '@': './',
            '@components': './components',
            '@hooks': './hooks',
            '@store': './store',
            '@lib': './lib',
            '@utils': './utils',
            '@constants': './constants',
          },
        },
      ],
      'react-native-reanimated/plugin',
    ],
  };
};
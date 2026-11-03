const appConfig = require('./app.json').expo;

module.exports = {
  ...appConfig,

  extra: {
    ...appConfig.extra,
    eas: {
      ...appConfig.extra?.eas,
      projectId: '8ee9b5e8-bf8f-45a7-b322-e7be62a62c42',
    },
  },

  plugins: [
    ...appConfig.plugins,
    [
      'react-native-maps',
      {
        androidGoogleMapsApiKey: process.env.GOOGLE_MAPS_ANDROID_API_KEY,
        iosGoogleMapsApiKey: process.env.GOOGLE_MAPS_IOS_API_KEY,
      },
    ],
  ],
};
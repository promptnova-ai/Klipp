const appConfig = require('./app.json').expo;

module.exports = {
  ...appConfig,
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

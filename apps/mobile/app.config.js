module.exports = ({ config }) => {
  const allowLocalHttp = process.env.EXPO_PUBLIC_ALLOW_LOCAL_HTTP === 'true';
  return {
    ...config,
    plugins: [
      ...config.plugins,
      [
        'expo-build-properties',
        { android: { usesCleartextTraffic: allowLocalHttp } },
      ],
    ],
    ios: {
      ...config.ios,
      infoPlist: {
        ...config.ios.infoPlist,
        NSAppTransportSecurity: { NSAllowsArbitraryLoads: allowLocalHttp },
      },
    },
  };
};

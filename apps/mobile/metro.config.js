const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('wasm');
const defaultResolver = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, name, platform) => {
  if (!context.dev && name.endsWith('/previews/design-system/preview')) {
    return {
      type: 'sourceFile',
      filePath: path.join(__dirname, 'src/previews/disabled.ts'),
    };
  }
  return (defaultResolver ?? context.resolveRequest)(context, name, platform);
};
config.server.enhanceMiddleware = (middleware) => (request, response, next) => {
  response.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  return middleware(request, response, next);
};
module.exports = config;

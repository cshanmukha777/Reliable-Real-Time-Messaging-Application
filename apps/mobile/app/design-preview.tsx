/* eslint-disable @typescript-eslint/no-require-imports -- Keep development fixtures behind a Metro compile-time gate. */
import { Redirect, router } from 'expo-router';

export default function DesignPreviewRoute() {
  if (!__DEV__) return <Redirect href="/" />;
  const Preview: typeof import('../src/previews/design-system/preview').DesignPreview =
    require('../src/previews/design-system/preview').DesignPreview;
  return (
    <Preview
      onClose={() => (router.canGoBack() ? router.back() : router.replace('/'))}
    />
  );
}

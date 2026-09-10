import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // ISOLATED POC ONLY: use a distinct Android package so this GitHub-signed
  // test build can coexist with the Base44-signed production BoriSend app.
  // The Base44 backend application ID remains 6a3f3ae0473f4e5dce013c32 via
  // VITE_BASE44_APP_ID in the GitHub Actions build.
  appId: 'com.base6a3f3ae0473f4e5dce013c32.app.geofencepoc',
  appName: 'BoriSend Geofence POC',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
  },
  ios: {
    contentInset: 'always',
  },
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
  },
  plugins: {
    // RC20 Part 22: Native splash — solid BoriSend Magenta + static White
    // approved BoriSend logo. Configured here; the actual PNG asset must be
    // provided locally (see docs/NATIVE_BUILD_AND_DEVICE_QA.md §11).
    SplashScreen: {
      launchShowDuration: 0,
      backgroundColor: '#DA1B8A',
      androidSplashResourceName: 'splash',
      iosSplashResourceName: 'Splash',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
    },
    // RC20 Part 23: Status bar — light icons over Magenta splash.
    StatusBar: {
      backgroundColor: '#DA1B8A',
      style: 'LIGHT',
      overlaysWebView: false,
    },
    // RC20 Part 24: Portrait-first launch.
    ScreenOrientation: {
      orientation: 'portrait',
    },
  },
};

export default config;
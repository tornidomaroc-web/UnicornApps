import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.unicornappsai.app',
  appName: 'UnicornApps',
  webDir: 'capacitor-shell',
  // Appended to the WebView User-Agent on every request (including the top-level
  // document load from server.url). The server reads this token to detect the
  // native app and strip ALL pricing / external-checkout UI before sending HTML —
  // no flash, no Paddle URLs in the payload. Keep in sync with NATIVE_UA_TOKEN
  // in src/lib/native-request.ts.
  appendUserAgent: 'UnicornAppsAndroid',
  server: {
    url: 'https://unicorn-apps.vercel.app',
    cleartext: false
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: "#000000",
      showSpinner: false
    },
    StatusBar: {
      style: "dark",
      backgroundColor: "#000000"
    }
  }
};

export default config;

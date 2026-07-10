import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.estoqui.app',
  appName: 'Estoqui',
  webDir: 'dist',
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#ffffff',
  },
  plugins: {
    BarcodeScanner: {
      // native ML Kit scanner on device, html5-qrcode on web
    },
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#10b981',
      showSpinner: false,
    },
  },
};

export default config;

import { ExpoConfig, ConfigContext } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "MESL Outreach",
  slug: "mesl-mobile",
  version: "1.0.2",
  orientation: "portrait",
  icon: "./assets/icon.png",
  scheme: "mesl",
  userInterfaceStyle: "light",
  newArchEnabled: true,

  // ✅ CHANGED: Hardcoded runtime version (required for bare workflow)
  runtimeVersion: "1.0.2",
  
  updates: {
    url: "https://u.expo.dev/441b8745-e510-45f5-8579-63abfc8ac6ae"
  },

  splash: {
    image: "./assets/splash.png",
    resizeMode: "contain",
    backgroundColor: "#9a3412",
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.mesl.mobile",
  },
  android: {
    adaptiveIcon: {
      backgroundColor: "#9a3412",
    },
    package: "com.mesl.mobile",
  },
  plugins: [
    "expo-router",
    "expo-image-picker",
    [
      "expo-splash-screen",
      {
        image: "./assets/splash.png",
        resizeMode: "contain",
        backgroundColor: "#9a3412",
      },
    ],
  ],
});
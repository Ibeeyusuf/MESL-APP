import { ExpoConfig, ConfigContext } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "CareReach Data",
  slug: "carereach-mobile",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  scheme: "carereach",
  userInterfaceStyle: "light",
  newArchEnabled: true,
  splash: {
    backgroundColor: "#9a3412",
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.carereach.mobile",
  },
  android: {
    adaptiveIcon: {
      backgroundColor: "#9a3412",
    },
    package: "com.carereach.mobile",
  },
  plugins: ["expo-router", "expo-image-picker"],
});

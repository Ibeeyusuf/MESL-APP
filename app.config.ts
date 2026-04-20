import { ExpoConfig, ConfigContext } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "MESL",
  slug: "mesl-mobile",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  scheme: "mesl",
  userInterfaceStyle: "light",
  newArchEnabled: true,

  extra: {
    eas: {
      projectId: "edcb943d-8464-4655-953a-dbad2988df0f",
    },
  },

  splash: {
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
  plugins: ["expo-router", "expo-image-picker"],
});
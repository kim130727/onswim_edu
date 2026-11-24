import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "edu.onswim.modumath",
  appName: "온쉼에듀",
  webDir: "dist",
  server: {
    androidScheme: "https",
    iosScheme: "capacitor",
    cleartext: true,
  },
  plugins: {
    Preferences: {},
  },
};

export default config;

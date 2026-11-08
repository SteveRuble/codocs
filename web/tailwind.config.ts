import type { Config } from "tailwindcss";
import daisyui from "daisyui";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  plugins: [daisyui],
  daisyui: { themes: ["light", "dark"] },
};
export default config;

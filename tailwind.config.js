/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        cream: "#e2d2b7",
        coffee: "#4d3726",
        caramel: "#8c6d4f",
        fog: "#dfe3e8",
        sage: "#bad4d1",
        ink: "#17120f"
      },
      fontFamily: {
        display: ["Fraunces", "Georgia", "serif"],
        body: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["Space Mono", "ui-monospace", "monospace"]
      },
      boxShadow: {
        glow: "0 0 44px rgba(226, 210, 183, 0.23)",
        glass: "0 22px 60px rgba(0, 0, 0, 0.32)"
      }
    }
  },
  plugins: []
};

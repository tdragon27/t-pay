/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Arc brand palette
        arc: {
          bg:       '#0A0A0F',      // deep space black
          surface:  '#12121A',      // card surface
          elevated: '#1A1A26',      // elevated surface
          border:   '#2A2A3A',      // subtle border
          muted:    '#3A3A50',      // muted elements

          // Accent — electric cyan-blue (Arc brand)
          primary:  '#00D4FF',
          'primary-dim': '#0099BB',

          // USDC green
          usdc:     '#2775CA',
          'usdc-light': '#5BA3F5',

          // Status
          success:  '#00E88F',
          warning:  '#FFB547',
          error:    '#FF4D6A',

          // Text hierarchy
          'text-1': '#F0F0FF',      // primary text
          'text-2': '#9090B0',      // secondary text
          'text-3': '#5050708',     // tertiary text
        },
      },
      fontFamily: {
        sans: ['SpaceGrotesk-Regular'],
        mono: ['SpaceMono-Regular'],
      },
    },
  },
  plugins: [],
};

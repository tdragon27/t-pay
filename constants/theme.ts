// constants/theme.ts
// ─────────────────────────────────────────────────────────────────────────────
// Centralised design tokens for consistent styling across the app.
// Used in StyleSheet objects and inline styles where NativeWind isn't enough.
// ─────────────────────────────────────────────────────────────────────────────

export const Colors = {
  bg:           '#0A0A0F',
  surface:      '#12121A',
  elevated:     '#1A1A26',
  border:       '#2A2A3A',
  muted:        '#3A3A50',

  primary:      '#00D4FF',
  primaryDim:   '#0099BB',
  primaryGlow:  'rgba(0, 212, 255, 0.15)',

  usdc:         '#2775CA',
  usdcLight:    '#5BA3F5',

  success:      '#00E88F',
  successBg:    'rgba(0, 232, 143, 0.12)',
  warning:      '#FFB547',
  warningBg:    'rgba(255, 181, 71, 0.12)',
  error:        '#FF4D6A',
  errorBg:      'rgba(255, 77, 106, 0.12)',

  text1:        '#F0F0FF',
  text2:        '#8888AA',
  text3:        '#505070',

  white:        '#FFFFFF',
  black:        '#000000',
  transparent:  'transparent',
} as const;

export const Radius = {
  sm:   8,
  md:   12,
  lg:   16,
  xl:   24,
  full: 999,
} as const;

export const Spacing = {
  xs:   4,
  sm:   8,
  md:   16,
  lg:   24,
  xl:   32,
  xxl:  48,
} as const;

export const FontSize = {
  xs:   11,
  sm:   13,
  md:   15,
  lg:   17,
  xl:   20,
  xxl:  28,
  hero: 42,
} as const;

export const Shadow = {
  card: {
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 8,
  },
  glow: {
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
} as const;

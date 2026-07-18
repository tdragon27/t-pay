// Central design tokens for T Pay's quiet-fintech visual system.

export const Colors = {
  bg: '#07090D',
  surface: '#10141B',
  elevated: '#171C25',
  border: '#242B36',
  muted: '#344054',

  primary: '#35D5F4',
  primaryDim: '#1599B5',
  primaryGlow: 'rgba(53, 213, 244, 0.12)',

  usdc: '#2775CA',
  usdcLight: '#6FA8FF',

  success: '#32D583',
  successBg: 'rgba(50, 213, 131, 0.10)',
  warning: '#FDB022',
  warningBg: 'rgba(253, 176, 34, 0.10)',
  error: '#F97066',
  errorBg: 'rgba(249, 112, 102, 0.10)',

  text1: '#F5F7FA',
  text2: '#98A2B3',
  text3: '#667085',

  white: '#FFFFFF',
  black: '#000000',
  transparent: 'transparent',
} as const;

export const ActionColors = {
  pay: '#35D5F4',
  request: '#59E0C5',
  split: '#8B79FF',
  swap: '#F2A65A',
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 18,
  xl: 24,
  full: 999,
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const FontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 28,
  hero: 42,
} as const;

export const FontFamily = {
  displaySemiBold: 'GeneralSans-Semibold',
  displayBold: 'GeneralSans-Bold',
  body: 'Inter-Regular',
  bodyMedium: 'Inter-Medium',
  bodySemiBold: 'Inter-SemiBold',
  mono: 'SpaceMono-Regular',
} as const;

export const Shadow = {
  card: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 5,
  },
  glow: {
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 7,
  },
} as const;

export const Glass = {
  regular: 'rgba(13, 18, 26, 0.76)',
  clear: 'rgba(14, 20, 29, 0.58)',
  accent: 'rgba(24, 38, 56, 0.72)',
  border: 'rgba(225, 247, 255, 0.13)',
  highlight: 'rgba(255, 255, 255, 0.24)',
} as const;

export const Motion = {
  pressIn: 110,
  pressOut: 110,
  reveal: 260,
  sheen: 760,
  ambient: 3200,
} as const;

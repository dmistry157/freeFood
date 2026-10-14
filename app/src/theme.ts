// Tokens from the design reference (claude.ai/artifact/C51n6BPinKsAPTU4FLCKhx).
export const colors = {
  ground: '#EEECE6',
  ink: '#16150F',
  inkSoft: '#3F3C36',
  muted: '#5C5850',
  label: '#6A665E',
  live: '#C8261E',
  soon: '#9A968E',
  card: '#FFFFFF',
  tag: '#F1EEE6',
};

export const fonts = {
  regular: 'Geist_400Regular',
  medium: 'Geist_500Medium',
  semibold: 'Geist_600SemiBold',
  bold: 'Geist_700Bold',
  mono: 'GeistMono_500Medium',
};

export const shadow = {
  pill: {
    shadowColor: colors.ink,
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  card: {
    shadowColor: colors.ink,
    shadowOpacity: 0.22,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
};

export const CAMPUS = {
  latitude: 37.8719,
  longitude: -122.2585,
  latitudeDelta: 0.016,
  longitudeDelta: 0.012,
};

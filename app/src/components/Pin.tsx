import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { colors } from '../theme';

/** Map pin from the design: white-ringed dot, red + pulsing halo when live, grey when soon. */
export function Pin({ live, selected }: { live: boolean; selected: boolean }) {
  const [pulse] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!live) return;
    const loop = Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: 2000, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [live, pulse]);

  const size = selected ? 26 : live ? 20 : 17;
  const color = live ? colors.live : colors.soon;
  return (
    <View style={styles.target} collapsable={false}>
      {live && (
        <Animated.View
          style={[
            styles.halo,
            {
              backgroundColor: colors.live,
              opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0] }),
              transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1.5] }) }],
            },
          ]}
        />
      )}
      <View
        style={[
          styles.dot,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: color },
          selected && { borderColor: colors.card, shadowColor: live ? colors.live : colors.muted, shadowOpacity: 0.9, shadowRadius: 2 },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  target: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },
  halo: { position: 'absolute', width: 36, height: 36, borderRadius: 18 },
  dot: {
    borderWidth: 3,
    borderColor: colors.card,
    shadowColor: colors.ink,
    shadowOpacity: 0.35,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
});

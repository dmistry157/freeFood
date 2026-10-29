import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

// Live pins glow gold: a halo fading outward from the gold ring. Static, no animation.
const DROP = '0px 1px 3px rgba(22, 21, 15, 0.3)';
const GLOW = '0px 0px 0px 3px rgba(253, 181, 21, 0.6), 0px 0px 14px 7px rgba(253, 181, 21, 0.45)';

/** Map pin: a white badge with the food emoji inside, gold ring + glow when live, grey when soon. */
export function Pin({ live, selected, emoji }: { live: boolean; selected: boolean; emoji: string }) {
  const size = selected ? 42 : live ? 36 : 30;
  return (
    <View style={styles.target} collapsable={false}>
      <View
        style={[
          styles.badge,
          { width: size, height: size, borderRadius: size / 2, borderColor: live ? colors.gold : colors.soon },
          { boxShadow: live ? `${GLOW}, ${DROP}` : DROP },
          selected && styles.selected,
        ]}
      >
        <Text style={{ fontSize: Math.round(size * 0.55), lineHeight: Math.round(size * 0.7) }} allowFontScaling={false}>
          {emoji}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  target: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    backgroundColor: colors.card,
  },
  selected: { borderWidth: 3.5 },
});

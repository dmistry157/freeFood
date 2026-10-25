import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, shadow } from '../theme';
import { FoodEvent, isLive, linkLabel, statusText, whenText, whereText } from '../events';

type Props = {
  event: FoodEvent;
  now: Date;
  onClose?: () => void;
  arrow?: { left: number; side: 'top' | 'bottom' } | null; // pointer toward the pin
  flat?: boolean; // inside the list: no shadow
};

/** The event popup from the design: status, title, When / Where / Food / To get in, link button. */
export function EventCard({ event: e, now, onClose, arrow, flat }: Props) {
  const live = isLive(e, now);
  const statusColor = live ? colors.live : colors.muted;
  const likely = e.food_status === 'likely';
  const food = likely ? e.food_reason || 'Not mentioned' : e.food || 'Free food';
  const link = e.link && /^https?:\/\//i.test(e.link) ? e.link : null; // only open web links

  return (
    <View style={[styles.card, !flat && shadow.card]}>
      {arrow && <View style={[styles.arrow, { left: arrow.left - 7 }, arrow.side === 'top' ? { top: -6 } : { bottom: -6 }]} />}

      <View style={styles.header}>
        <View style={styles.headerText}>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.status, { color: statusColor }]}>{statusText(e, now)}</Text>
          </View>
          <Text style={styles.title}>{e.title}</Text>
          {likely && (
            <View style={styles.tag}>
              <Text style={styles.tagText}>Food likely · not confirmed</Text>
            </View>
          )}
        </View>
        {onClose && (
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close event details" style={styles.close} hitSlop={4}>
            <Text style={styles.closeX}>✕</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.rows}>
        <Row label="When" value={whenText(e)} />
        <Row label="Where" value={whereText(e)} />
        <Row label="Food" value={food} strong={!likely} />
        <Row label="To get in" value={e.requirements || e.open_to || 'Open to all'} />
      </View>

      {link && (
        <Pressable
          onPress={() => Linking.openURL(link)}
          accessibilityRole="link"
          style={({ pressed }) => [styles.button, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.buttonText}>{linkLabel(e)}  ↗</Text>
        </Pressable>
      )}
    </View>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, strong && { fontFamily: fonts.medium }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: 272, padding: 16, backgroundColor: colors.card, borderRadius: 16, gap: 12 },
  arrow: { position: 'absolute', width: 14, height: 14, backgroundColor: colors.card, borderRadius: 2, transform: [{ rotate: '45deg' }] },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  headerText: { flex: 1, gap: 6 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  status: { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 0.44, textTransform: 'uppercase' },
  title: { fontFamily: fonts.semibold, fontSize: 17, lineHeight: 21, letterSpacing: -0.17, color: colors.ink },
  tag: { alignSelf: 'flex-start', backgroundColor: colors.tag, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  tagText: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 0.4, textTransform: 'uppercase', color: colors.inkSoft },
  close: { width: 44, height: 44, marginTop: -12, marginRight: -12, alignItems: 'center', justifyContent: 'center' },
  closeX: { fontSize: 15, color: colors.muted },
  rows: { gap: 8 },
  row: { flexDirection: 'row', gap: 10 },
  rowLabel: { width: 68, fontFamily: fonts.regular, fontSize: 12, color: colors.label, paddingTop: 1 },
  rowValue: { flex: 1, fontFamily: fonts.regular, fontSize: 14, lineHeight: 19, color: colors.ink },
  button: { height: 44, borderRadius: 12, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.card },
});

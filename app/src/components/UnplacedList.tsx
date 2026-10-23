import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '../theme';
import { FoodEvent } from '../events';
import { EventCard } from './EventCard';

/** Events we couldn't put on the map (no building match), as a sheet of cards. */
export function UnplacedList({ events, now, visible, onClose }: {
  events: FoodEvent[];
  now: Date;
  visible: boolean;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.sheet}>
        <View style={styles.head}>
          <Text style={styles.heading}>Not on the map</Text>
          <Pressable onPress={onClose} accessibilityRole="button" style={styles.done} hitSlop={8}>
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        </View>
        <Text style={styles.sub}>These listings didn’t name a campus building we recognize.</Text>
        <ScrollView contentContainerStyle={styles.list}>
          {events.map((e) => (
            <View key={e.id} style={styles.item}>
              <EventCard event={e} now={now} flat />
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: colors.ground, paddingTop: 20 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 },
  heading: { fontFamily: fonts.bold, fontSize: 22, color: colors.ink, letterSpacing: -0.2 },
  done: { minHeight: 44, justifyContent: 'center' },
  doneText: { fontFamily: fonts.semibold, fontSize: 16, color: colors.ink },
  sub: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted, paddingHorizontal: 20, marginTop: 4 },
  list: { padding: 20, gap: 12, alignItems: 'center' },
  item: { borderRadius: 16, overflow: 'hidden' },
});

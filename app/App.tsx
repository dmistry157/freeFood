import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFonts, Geist_400Regular, Geist_500Medium, Geist_600SemiBold, Geist_700Bold } from '@expo-google-fonts/geist';
import { GeistMono_500Medium } from '@expo-google-fonts/geist-mono';

import { CAMPUS, colors, fonts, shadow } from './src/theme';
import { FoodEvent, fetchEvents, isLive, spreadPins } from './src/events';
import MapView, { Marker, Region } from './src/components/Map';
import { Pin } from './src/components/Pin';
import { EventCard } from './src/components/EventCard';
import { UnplacedList } from './src/components/UnplacedList';

const REFRESH_MS = 5 * 60 * 1000;
const CLOCK_MS = 30 * 1000;
const PIN_Y = 0.3; // selected pin sits 30% down the screen, card below it

export default function App() {
  const [loaded] = useFonts({ Geist_400Regular, Geist_500Medium, Geist_600SemiBold, Geist_700Bold, GeistMono_500Medium });
  if (!loaded) return <View style={{ flex: 1, backgroundColor: colors.ground }} />;
  return (
    <SafeAreaProvider>
      <FoodMap />
    </SafeAreaProvider>
  );
}

function FoodMap() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const mapRef = useRef<MapView>(null);
  const region = useRef<Region>(CAMPUS);

  const [events, setEvents] = useState<FoodEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(new Date());
  const [selected, setSelected] = useState<number | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [pinPoint, setPinPoint] = useState<{ x: number; y: number } | null>(null);

  // Refresh on open, every 5 minutes, and when the app returns to the foreground.
  const refresh = useCallback(async () => {
    try {
      setEvents(await fetchEvents());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t load events');
    }
    setNow(new Date());
  }, []);
  useEffect(() => {
    refresh();
    const poll = setInterval(refresh, REFRESH_MS);
    const tick = setInterval(() => setNow(new Date()), CLOCK_MS); // keeps "Now / In 20 min" current
    const sub = AppState.addEventListener('change', (s) => s === 'active' && refresh());
    return () => { clearInterval(poll); clearInterval(tick); sub.remove(); };
  }, [refresh]);

  const visible = useMemo(() => events.filter((e) => new Date(e.end_time) > now), [events, now]);
  const coords = useMemo(() => spreadPins(visible), [visible]);
  const placed = visible.filter((e) => coords.has(e.id));
  const unplaced = visible.filter((e) => !coords.has(e.id));
  const liveCount = placed.filter((e) => isLive(e, now)).length;
  const soonCount = placed.length - liveCount;
  const sel = placed.find((e) => e.id === selected) ?? null;

  // Measure where the selected pin really landed, so the card sits just below it.
  const measurePin = async (id: number | null = selected) => {
    const c = id == null ? undefined : coords.get(id);
    if (!c || !mapRef.current) return;
    setPinPoint(await mapRef.current.pointForCoordinate(c));
  };

  const select = (e: FoodEvent) => {
    setSelected(e.id);
    setPinPoint(null);
    const c = coords.get(e.id)!;
    const { latitudeDelta, longitudeDelta } = region.current;
    // Put the pin at PIN_Y of the screen height so the card fits beneath it.
    mapRef.current?.animateToRegion(
      { latitude: c.latitude - (0.5 - PIN_Y) * latitudeDelta, longitude: c.longitude, latitudeDelta, longitudeDelta },
      250,
    );
    setTimeout(() => measurePin(e.id), 300); // after the animation settles
  };

  const today = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const cardLeft = (width - 272) / 2;
  const pinX = pinPoint?.x ?? width / 2;
  const cardTop = (pinPoint?.y ?? height * PIN_Y) + 13 + 16; // selected pin radius + gap for the arrow
  const arrowLeft = Math.min(252, Math.max(20, pinX - cardLeft));

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={CAMPUS}
        mapType="mutedStandard"
        showsPointsOfInterests={false}
        showsBuildings={false}
        pitchEnabled={false}
        rotateEnabled={false}
        showsCompass={false}
        onRegionChangeComplete={(r) => { region.current = r; measurePin(); }}
        onPanDrag={() => setSelected(null)}
        onPress={(ev) => { if (ev.nativeEvent.action !== 'marker-press') setSelected(null); }}
      >
        {placed.map((e) => (
          <Marker
            key={e.id}
            coordinate={coords.get(e.id)!}
            anchor={{ x: 0.5, y: 0.5 }}
            onPress={() => select(e)}
            accessibilityLabel={`${e.title}, ${isLive(e, now) ? 'happening now' : 'starting soon'}`}
            zIndex={e.id === selected ? 2 : isLive(e, now) ? 1 : 0}
          >
            <Pin live={isLive(e, now)} selected={e.id === selected} />
          </Marker>
        ))}
      </MapView>

      <View style={[styles.header, shadow.pill, { top: insets.top + 8 }]}>
        <Text style={styles.brand}>Free food</Text>
        <Text style={styles.headerSub}>Berkeley · {today}</Text>
      </View>

      {error && (
        <Pressable onPress={refresh} style={[styles.error, shadow.pill, { top: insets.top + 60 }]} accessibilityRole="button">
          <Text style={styles.errorText}>{error} · tap to retry</Text>
        </Pressable>
      )}

      {sel && (
        <View style={[styles.cardWrap, { top: cardTop, left: cardLeft }]}>
          <EventCard event={sel} now={now} onClose={() => setSelected(null)} arrow={{ left: arrowLeft, side: 'top' }} />
        </View>
      )}

      <View style={[styles.bottom, { bottom: insets.bottom + 20 }]}>
        {unplaced.length > 0 && (
          <Pressable onPress={() => setListOpen(true)} style={[styles.pill, styles.listPill, shadow.pill]} accessibilityRole="button">
            <Text style={styles.listText}>{unplaced.length} not on the map  ›</Text>
          </Pressable>
        )}
        <View style={[styles.pill, shadow.pill]}>
          {placed.length === 0 ? (
            <Text style={styles.legendSoft}>No free food in the next 6 hrs</Text>
          ) : (
            <>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: colors.live }]} />
                <Text style={styles.legendStrong}>{liveCount} happening now</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: colors.soon }]} />
                <Text style={styles.legendSoft}>{soonCount} in the next 6 hrs</Text>
              </View>
            </>
          )}
        </View>
      </View>

      <UnplacedList events={unplaced} now={now} visible={listOpen} onClose={() => setListOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ground },
  header: {
    position: 'absolute', left: 16, flexDirection: 'row', alignItems: 'baseline', gap: 8,
    paddingVertical: 10, paddingHorizontal: 16, backgroundColor: colors.card, borderRadius: 999,
  },
  brand: { fontFamily: fonts.bold, fontSize: 17, letterSpacing: -0.17, color: colors.ink },
  headerSub: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted },
  error: { position: 'absolute', left: 16, right: 16, padding: 12, backgroundColor: colors.card, borderRadius: 12 },
  errorText: { fontFamily: fonts.medium, fontSize: 13, color: colors.live },
  cardWrap: { position: 'absolute' },
  bottom: { position: 'absolute', left: 0, right: 0, alignItems: 'center', gap: 10 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, paddingHorizontal: 18,
    backgroundColor: colors.card, borderRadius: 999,
  },
  listPill: { paddingVertical: 10, minHeight: 44 },
  listText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.ink },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendStrong: { fontFamily: fonts.semibold, fontSize: 13, color: colors.ink },
  legendSoft: { fontFamily: fonts.regular, fontSize: 13, color: colors.inkSoft },
});

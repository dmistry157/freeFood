// Web map: MapLibre with free OpenFreeMap tiles, exposing the small slice of the react-native-maps
// API that App.tsx uses (initialRegion, region/pan/press callbacks, animateToRegion, pointForCoordinate,
// and Markers whose children are rendered into the map with a portal).
import { createContext, forwardRef, useContext, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

const STYLE = 'https://tiles.openfreemap.org/styles/positron';
// Metro doesn't emit MapLibre's separate worker file, so load the matching version from a CDN.
maplibregl.setWorkerUrl(`https://cdn.jsdelivr.net/npm/maplibre-gl@${maplibregl.getVersion()}/dist/maplibre-gl-worker.mjs`);

export type Region = { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };
type LatLng = { latitude: number; longitude: number };
type PressEvent = { nativeEvent: { action?: string } };

type Props = {
  style?: StyleProp<ViewStyle>;
  initialRegion: Region;
  onRegionChangeComplete?: (r: Region) => void;
  onPanDrag?: () => void;
  onPress?: (e: PressEvent) => void;
  children?: ReactNode;
  // App.tsx also passes native-only props (mapType, showsBuildings, ...); web ignores them.
};

export type MapHandle = {
  animateToRegion: (r: Region, ms?: number) => void;
  pointForCoordinate: (c: LatLng) => Promise<{ x: number; y: number }>;
};

const MapContext = createContext<maplibregl.Map | null>(null);

function regionOf(map: maplibregl.Map): Region {
  const b = map.getBounds(), c = map.getCenter();
  return { latitude: c.lat, longitude: c.lng, latitudeDelta: b.getNorth() - b.getSouth(), longitudeDelta: b.getEast() - b.getWest() };
}

const MapView = forwardRef<MapHandle, Props>(function MapView(
  { style, initialRegion, onRegionChangeComplete, onPanDrag, onPress, children },
  ref,
) {
  const container = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<maplibregl.Map | null>(null);
  const handlers = useRef({ onRegionChangeComplete, onPanDrag, onPress });
  useEffect(() => { handlers.current = { onRegionChangeComplete, onPanDrag, onPress }; });

  useEffect(() => {
    const r = initialRegion;
    const m = new maplibregl.Map({
      container: container.current!,
      style: STYLE,
      bounds: [[r.longitude - r.longitudeDelta / 2, r.latitude - r.latitudeDelta / 2],
               [r.longitude + r.longitudeDelta / 2, r.latitude + r.latitudeDelta / 2]],
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      attributionControl: { compact: true },
    });
    m.touchZoomRotate.disableRotation();
    m.on('moveend', () => handlers.current.onRegionChangeComplete?.(regionOf(m)));
    m.on('dragstart', () => handlers.current.onPanDrag?.());
    m.on('click', () => handlers.current.onPress?.({ nativeEvent: {} }));
    setMap(m);
    return () => m.remove();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- initialRegion is only read once, like react-native-maps

  useImperativeHandle(ref, () => ({
    animateToRegion: (r, ms = 250) => map?.easeTo({ center: [r.longitude, r.latitude], duration: ms }),
    pointForCoordinate: async (c) => map ? map.project([c.longitude, c.latitude]) : { x: 0, y: 0 },
  }), [map]);

  return (
    <View style={style}>
      <div ref={container} style={{ position: 'absolute', inset: 0 }} />
      {map && <MapContext.Provider value={map}>{children}</MapContext.Provider>}
    </View>
  );
});

export default MapView;

type MarkerProps = {
  coordinate: LatLng;
  onPress?: () => void;
  zIndex?: number;
  accessibilityLabel?: string;
  children?: ReactNode;
};

export function Marker({ coordinate, onPress, zIndex = 0, accessibilityLabel, children }: MarkerProps) {
  const map = useContext(MapContext);
  const [el] = useState(() => document.createElement('div'));
  const marker = useRef<maplibregl.Marker | null>(null);
  const press = useRef(onPress);
  useEffect(() => { press.current = onPress; });
  const { latitude, longitude } = coordinate;

  useEffect(() => {
    const m = new maplibregl.Marker({ element: el }).setLngLat([longitude, latitude]).addTo(map!);
    const div = m.getElement();
    div.style.cursor = 'pointer';
    div.setAttribute('role', 'button');
    // Stop the click here so the map's own click handler (which deselects) doesn't also fire.
    const click = (e: MouseEvent) => { e.stopPropagation(); press.current?.(); };
    div.addEventListener('click', click);
    marker.current = m;
    return () => { div.removeEventListener('click', click); m.remove(); marker.current = null; };
  }, [map, el]); // eslint-disable-line react-hooks/exhaustive-deps -- position updates are handled below

  useEffect(() => { marker.current?.setLngLat([longitude, latitude]); }, [longitude, latitude]);

  useEffect(() => {
    const div = marker.current?.getElement();
    if (!div) return;
    div.style.zIndex = String(zIndex);
    if (accessibilityLabel) div.setAttribute('aria-label', accessibilityLabel);
  }, [el, zIndex, accessibilityLabel]);

  return createPortal(children, el);
}

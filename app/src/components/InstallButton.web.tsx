// "Install" pill for the website: Chrome/Android get the browser's own install prompt; iPhone has no
// prompt, so it shows the Share → Add to Home Screen steps. Hidden once the site runs as an installed app.
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, shadow } from '../theme';

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const installed = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
const ios = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent));

export function InstallButton({ top }: { top: number }) {
  const [hidden, setHidden] = useState(installed);
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [help, setHelp] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setPrompt(e as InstallPrompt); };
    const onInstalled = () => setHidden(true);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (hidden) return null;

  const press = async () => {
    if (!prompt) return setHelp((h) => !h);
    await prompt.prompt();
    if ((await prompt.userChoice).outcome === 'accepted') setHidden(true);
    setPrompt(null); // a prompt can only be used once
  };

  return (
    <>
      <Pressable onPress={press} style={[styles.pill, shadow.pill, { top }]} accessibilityRole="button" accessibilityLabel="Install the app">
        <Text style={styles.pillText}>Install</Text>
      </Pressable>
      {help && (
        <View style={[styles.help, shadow.card, { top: top + 52 }]}>
          <Text style={styles.title}>Add it to your Home Screen</Text>
          {ios() ? (
            <>
              <Text style={styles.step}>1. In Safari, tap the Share button (or ••• then Share).</Text>
              <Text style={styles.step}>2. Choose Add to Home Screen, then Add.</Text>
            </>
          ) : (
            <Text style={styles.step}>
              Open the browser menu (⋮) and choose Install app or Add to Home screen. On a computer, open dhilen.com/freefood on your phone.
            </Text>
          )}
          <Text style={styles.note}>It opens full screen like an app and always shows the latest events.</Text>
          <Pressable onPress={() => setHelp(false)} style={styles.done} accessibilityRole="button">
            <Text style={styles.doneText}>Got it</Text>
          </Pressable>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  pill: {
    position: 'absolute', right: 16, paddingVertical: 10, paddingHorizontal: 14,
    backgroundColor: colors.ink, borderRadius: 999,
  },
  pillText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.card },
  help: {
    position: 'absolute', right: 16, left: 16, maxWidth: 320, marginLeft: 'auto', gap: 8,
    padding: 16, backgroundColor: colors.card, borderRadius: 16,
  },
  title: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  step: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.inkSoft },
  note: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 17, color: colors.muted },
  done: { alignSelf: 'flex-end', paddingVertical: 8, paddingHorizontal: 12, minHeight: 36, justifyContent: 'center' },
  doneText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.ink },
});

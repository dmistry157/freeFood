# Berkeley Free Food

A live map of UC Berkeley events with free food.

**👉 [calfreefood.com](https://calfreefood.com)**

- 🟡 **Gold pin:** happening now
- 🔵 **Navy pin:** starts within the next 6 hours
- Each pin shows the food (🍕 🧋 🌮 …). Numbered circles are several events close together; tap to zoom in.
- Tap a pin to see the time, place, what food there is, who can go, and a link to the original post.
- The list shows every event, including ones without a known location. Share your location to sort it nearest first.

The map refreshes every few minutes and pulls events from Berkeley's events calendar, mailing lists, and club Instagram accounts. Club events only show up when the post actually says there's food, so you won't be sent to a GM on a guess. Events marked **"Food likely · not confirmed"** (like info sessions) usually have food but don't promise it.

## Get it on your phone (free)

No App Store needed. Add the website to your Home Screen and it opens full screen, like an app, always with the latest events.

### iPhone
1. Open **[calfreefood.com](https://calfreefood.com)** in **Safari**.
2. Tap the **Share** button (or **•••** then **Share**).
3. Tap **Add to Home Screen**, then **Add**.

You can also tap the gold **Install** button at the top right to see these steps.

### Android
1. Open **[calfreefood.com](https://calfreefood.com)** in **Chrome**.
2. Open Chrome's menu (**⋮**) and choose **Install app** or **Add to Home screen**.

### Computer
Just open [calfreefood.com](https://calfreefood.com). In Chrome or Edge, the install icon in the address bar adds it as a desktop app.

## Native iPhone app (beta testers)

There's also an iPhone version that uses Apple Maps, run through the free **Expo Go** app. It needs an invite, so ask Dhilen if you want to try it.
1. Install **Expo Go** from the App Store and update it to the latest version.
2. Accept the invite to the `dhilens-team` Expo organization, then sign in to Expo Go with that account.
3. Open this link on your phone:
   `exp://u.expo.dev/789ba935-9128-4c2a-8862-db0a48fb7770?channel-name=production&runtime-version=1.0.0`

For most people, the website above is the easier option.

## Missing an event?
If you see free food that isn't on the map, send it to Dhilen and it'll be picked up.

## For developers
The pipeline (Python on GitHub Actions, Supabase, Gemini), the website (`web/`, Next.js, originally designed by Mohul) and the iPhone app (`app/`, Expo / React Native) live in this repo. See [`CLAUDE.md`](CLAUDE.md) for how it works and how to run it, and [`Original Plan.md`](Original%20Plan.md) for the full design.

# Berkeley Free Food

A live map of UC Berkeley events with free food.

**👉 [dhilen.com/freefood](https://dhilen.com/freefood)**

- 🔴 **Red pin:** happening now
- ⚪ **Grey pin:** starts within the next 6 hours
- Tap a pin to see the time, place, what food there is, who can go, and a link to the original post.
- Events without a known location are under **"not on the map"** at the bottom.

The map refreshes every few minutes and pulls events from Berkeley's events calendar, mailing lists, and club Instagram accounts. Club events only show up when the post actually says there's food, so you won't be sent to a GM on a guess. Events marked **"Food likely · not confirmed"** (like info sessions) usually have food but don't promise it.

## Get it on your phone (free)

No App Store needed. Add the website to your Home Screen and it opens full screen, like an app, always with the latest events.

### iPhone
1. Open **[dhilen.com/freefood](https://dhilen.com/freefood)** in **Safari**.
2. Tap the **Share** button (or **•••** then **Share**).
3. Tap **Add to Home Screen**, then **Add**.

You can also tap the **Install** button at the top right of the map to see these steps.

### Android
1. Open **[dhilen.com/freefood](https://dhilen.com/freefood)** in **Chrome**.
2. Tap **Install** at the top right of the map, then **Install** again.
   If you don't see it, open Chrome's menu (**⋮**) and choose **Install app** or **Add to Home screen**.

### Computer
Just open [dhilen.com/freefood](https://dhilen.com/freefood). In Chrome or Edge, the **Install** button adds it as a desktop app.

## Native iPhone app (beta testers)

There's also a version that uses Apple Maps, run through the free **Expo Go** app. It needs an invite, so ask Dhilen if you want to try it.
1. Install **Expo Go** from the App Store and update it to the latest version.
2. Accept the invite to the `dhilens-team` Expo organization, then sign in to Expo Go with that account.
3. Open this link on your phone:
   `exp://u.expo.dev/789ba935-9128-4c2a-8862-db0a48fb7770?channel-name=production&runtime-version=1.0.0`

For most people, the website above is the easier option.

## Missing an event?
If you see free food that isn't on the map, send it to Dhilen and it'll be picked up.

## For developers
The pipeline (Python on GitHub Actions, Supabase, Gemini) and the app (Expo / React Native) live in this repo. See [`CLAUDE.md`](CLAUDE.md) for how it works and how to run it, and [`Original Plan.md`](Original%20Plan.md) for the full design.

# Real-phone test round

Everything so far was tested in a computer browser. This round finds what only a real phone shows: the keyboard's microphone,
WhatsApp opening, sharing a PDF, the home-screen icon, and working with a weak or no signal.

## Part A: your iPhone (free, 5 minutes, no laptop)

The Vercel web app installs like an app.

1. On the iPhone, open **Safari** and go to `https://munim-coral.vercel.app`.
2. Tap the **Share** button, then **Add to Home Screen**, then **Add**. A blue "M" icon appears.
3. Open it from the home screen. It opens full screen with no browser bar.
4. Log in with `demo.dealer@example.com` / `Munim-demo-2026` (sample data), or **Create account** with your own email.
5. **Open it once with a good signal and browse around** (party list, one ledger). That saves a copy for offline use.

## Part B: your father's Android phone

Option 1 (easiest): open `https://munim-coral.vercel.app` in **Chrome**, tap the **⋮ menu**, then **Install app** / **Add to Home screen**.

Option 2 (a real installable file, free): build the Android app with Expo's cloud. Do this on a laptop:

```bash
npm install -g eas-cli
eas login                      # your free Expo account (expo.dev)
cd apps/dealer
eas init                       # links the project to your Expo account
eas env:create --name EXPO_PUBLIC_SUPABASE_URL --value "https://aykaxusbjywmfuvhdryz.supabase.co" --environment preview --visibility plaintext
eas env:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "<your sb_publishable_ key>" --environment preview --visibility plaintext
eas env:create --name EXPO_PUBLIC_WEB_URL --value "https://munim-coral.vercel.app" --environment preview --visibility plaintext
eas build -p android --profile preview
```

When the build finishes (about 15 minutes) EAS gives a link; open it on the Android phone and install the `.apk`
(Android asks you to allow installing from this source). Never put a `service_role` key or database password anywhere here.

iPhone App Store builds need a paid Apple developer account ($99/year); until then use Part A.

## Part C: what to test

Use the **demo data** first. Tick each line and note anything odd.

| # | Test | Expected |
|---|---|---|
| 1 | Open from the home-screen icon | Full screen, no browser bar, icon is the blue "M" |
| 2 | Language: Settings → App language हिन्दी, then मराठी, then English | Screens change; Devanagari text is readable and not cut off |
| 3 | Open a party ledger | Columns fit the screen; no sideways scrolling |
| 4 | **Speak**: tap 🎤 Speak, then the keyboard's microphone, say a sentence in Hindi, e.g. "संतोष को 80 बैग JSW 360 रुपये के भाव से दिया" | Text appears; "Understand" fills the form; the read-back shows the right amounts |
| 5 | Same in Marathi and in English | Understood, or the assistant asks a clear question |
| 6 | Save an entry, then open the party list | Balance and the "today's sales" figure update |
| 7 | **Offline**: turn on airplane mode, then add an entry | Banner "Offline · 1 entry is waiting to upload"; entry shows "waiting to upload"; balance already includes it |
| 8 | Close the app completely (swipe it away), reopen **while still in airplane mode** | App opens; the party list shows; the waiting entry is still there |
| 9 | Turn airplane mode off | Within seconds the banner goes away; the entry is saved once (check the ledger shows it once) |
| 10 | Party ledger → **Statement** → "Send on WhatsApp" | WhatsApp opens with the statement text and the customer's number; **you** tap send |
| 11 | Statement → "Make PDF" | The share sheet / print dialog opens with a readable PDF |
| 12 | Statement → "Live statement link": create a link and send it to a second phone | Second phone opens it in its browser, asks for the last 4 digits of the customer's phone, shows only that customer's account |
| 13 | Reminders: tick one person, "Continue" | WhatsApp opens for that one person only; nobody else |
| 14 | Reports → "All entries (CSV backup)" | A file downloads or the share sheet appears; opens in a spreadsheet app with Hindi/Marathi text intact |
| 15 | Reports → "Import handwritten pages": paste the sample data | Review screen with "All numbers match the page" |
| 16 | Slow network: walk somewhere with a weak signal and add 2-3 entries | No entry lost; none doubled |
| 17 | Log out while an entry is waiting (airplane mode) | Refused with a message that entries are waiting |

## Part D: if something goes wrong

1. Settings (⚙ on the home screen) → **Share diagnostics** → send it on WhatsApp to the developer. It contains no names, phone numbers or amounts.
2. Add a screenshot and one line: what you tapped, what you expected, what happened.
3. Note the phone model and OS version (Settings → About phone).

## Known limits to ignore for now

- Dictation needs the phone keyboard's own microphone button (there is no built-in microphone button yet).
- Hindi/Marathi dictation of brand names may arrive in Devanagari; add that spelling under "Other names" in Items.
- PDF/CSV on iPhone depends on Safari's share sheet and may look different from Android.
- The first time you open the installed app, use a good signal so it can save its offline copy.

## Part E: Talk to Munim (the voice assistant)

Open the app and tap **🎙 Talk**. Munim greets you out loud, asks "What are today's entries?", listens by itself, shows each entry on
screen and reads it back. **Only your tap on Save saves.** Everything written on screen is English; Munim speaks and listens in the
language you choose at the top (English or Hindi, mixed Hindi/English in one sentence is fine).

Where it works:
- **Android phone, Chrome (the web app) or the installed Android app:** best. Uses Google's speech engine.
- **iPhone, Safari in a normal tab:** works. A home-screen web app on iPhone often cannot use the microphone; if so, open the site in Safari instead, or use the keyboard's microphone with **Type instead**.
- Listening needs internet (Google's engine). Munim can still speak and show entries offline.
- **Hindi voice:** if Munim stays silent in Hindi, install the Hindi voice: Android Settings → Apps → Google Text-to-speech → Install voice data → Hindi.
- The very first time, the phone asks to allow the **microphone**. Tap Allow.

| # | Say or do | Expected |
|---|---|---|
| 18 | Tap 🎙 Talk | Munim speaks the greeting, the orb turns green ("Listening"), a short English caption shows |
| 19 | "संतोष को मोइरा साइट पर 80 बैग JSW 365 रुपये के भाव से दिया" (use a real party of yours) | Munim reads it back in Hindi with amounts in words; the entry card shows it in English with old and new balance |
| 20 | Say "हाँ" | Munim says to tap Save; **nothing is saved** |
| 21 | Tap **Save** | "सेव हो गया। और कोई एंट्री?"; the entry is in the ledger |
| 22 | Leave the rate out: "संतोष को 80 बैग JSW दिया" | Munim asks for the rate; answer "तीन सौ साठ" |
| 23 | After a read-back say "नहीं, 40 बैग" | Munim corrects it and reads it back again |
| 24 | Say two things: "…2 बुट्टी रेती 700, गाड़ी भाड़ा 800" | Two entries, one after the other |
| 25 | Say a name not in your parties | Munim says so; an "Add this party" box appears |
| 26 | Stay silent | "I'm listening", then "I didn't hear anything" and it waits for the mic tap |
| 27 | Say "बस" after saving | "हो गया। आज मैंने … एंट्री सेव कीं।" |
| 28 | Same in English: "Gave Santosh 80 bags JSW at 365" | Munim replies in English |
| 29 | Noisy yard test: try 5 entries with a truck running | Note how many were understood; wrong ones are caught at the read-back |

Tip: add the party's name in Devanagari under **Nicknames** (party details), e.g. "संतोष". Munim then says the name in Hindi
and understands it when spoken in Devanagari.

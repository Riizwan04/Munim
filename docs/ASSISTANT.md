# Your assistant (questions, commands, hands-free)

Every business names its own assistant (first-run screen "Name your assistant"; change it any time in Settings → Your assistant). The name wakes it in hands-free mode and replaces "Munim" in everything it says. (Munim is the name of the app; the assistant is yours.)

Munim is one tap away on EVERY screen (the saffron 🎙 button; on Home it is the middle button) and opens on top of whatever you were doing.
On a customer's page he knows who "this customer" is: you never have to name them.

## Ask him (answered from your ledger by code, never guessed)
- "Santosh ka kitna baaki hai" / "how much does Santosh owe" · "last payment kab hua tha" · "when did he last buy something"
- "what was the last rate of JSW" (for the open customer, or name one) · "total baaki kitna hai" · "sabse zyada baaki kiska hai" · "aaj ki sale kitni hui"
- If you do not say a customer and none is open, he asks "Which customer?".

## Tell him (he prepares, you tap)
- Entries, with a date: "kal 20 bag JSW 360 ka add karo" · "5000 UPI 12 November ko diye" · "parso", "3 days ago", "12 tareekh", "on the 20th". (Future dates are ignored.)
- Open things: "Santosh kholo" · "reports kholo" · "items dikhao" · "settings".
- Reminder: "Santosh ko reminder bhejo" → the reminder screen for him opens; sending is your tap.
- New customer: "naya customer Rahul Patil 9876543210" → a form appears, you tap Create.
- Saving, sending and cancelling are ALWAYS a manual tap. Nothing is cancelled or deleted by voice.

## Hands-free: "Munim, …" (Settings → Hands-free, off by default)
While the app is open and screen on, the phone's speech recognition runs in short bursts. Everything that does not START with the name "Munim" (or "मुनीम", or a close mishearing) is
thrown away immediately: not stored, not sent by this app. It switches itself off after 10 minutes without "Munim", when the app goes to the background, and when you tap the green pill.
Limits of the web version: it cannot listen when the screen is locked or the app is closed; the browser's recogniser may send audio to Google (Chrome); Android Chrome may beep on each restart.
A real Android app can listen on the phone itself and is the right home for true hands-free.

## Privacy (not legal advice: have a lawyer review before offering it to other businesses)
- Do not turn hands-free on where customers' conversations would be picked up unaware; tell staff and visitors.
- Customer names, phones and balances are personal data (India's DPDP Act, 2023). Munim stores no audio. The words of a command are kept only as the proof line of an entry you save.

## Skills are separate from understanding
Every action above is plain code (`packages/ledger-core/src/assistant.ts`). The free rules choose the skill from your sentence today; the AI reader (docs/AI-SETUP.md) can later choose better without changing any skill.

## Ask anything about YOUR business (needs the AI reader)
Beyond the built-in questions, any question about the shop's own books can be asked: "which customer bought the most cement last month", "how much cement did we sell this week",
"what did we collect from Santosh in October", "compare JSW and Super sales", "who has not paid for more than 30 days".
How it stays safe and exact:
- The AI only CHOOSES among read-only tools (`ASK_TOOLS` in `packages/ledger-core/src/ask.ts`) and words the answer. The tools run ON THE PHONE on the signed-in owner's own data, so no other business can be reached.
- Every number is computed by code in those tools; the AI is told never to calculate or invent. Cancelled entries never count.
- Only the question and the tool RESULTS leave the phone (checked by a test): no customer list, no ledger is ever uploaded.
- It cannot save, send, cancel or change anything.
Setup: deploy the `ask` function (supabase/functions/ask/index.ts, same secret and "Verify JWT off" as `understand`, see docs/AI-SETUP.md). The switch `EXPO_PUBLIC_UNDERSTAND_FUNCTION=1` turns on both.
Without it, the assistant answers the built-in questions and says plainly that other questions need the AI reader.
Cost: about 2-3 short AI calls per question, roughly ₹0.1 per question on Haiku 5.5.

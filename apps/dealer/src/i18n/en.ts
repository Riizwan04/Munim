/** English: the reference dictionary. hi.ts and mr.ts must have exactly the same keys (checked by the compiler). */
export const en = {
  // common
  "common.back": "Back", "common.close": "Close", "common.save": "Save", "common.cancel": "Cancel", "common.skip": "Skip",
  "common.ok": "OK", "common.logout": "Log out", "common.yes": "Yes", "common.no": "No", "common.today": "Today",
  "common.none": "None", "common.add": "Add", "common.remove": "Remove", "common.search": "Search by name",
  "common.nevermind": "Never mind", "common.settings": "Settings",
  "tab.parties": "Parties", "tab.reminders": "Reminders", "tab.items": "Items",
  // login & setup
  "login.tagline": "Just speak. Munim writes your accounts.", "login.email": "Email", "login.password": "Password", "login.button": "Log in",
  "ob.title": "Your business", "ob.sub": "Set up once. You can change everything later.", "ob.name": "Shop / business name",
  "ob.phone": "Your phone number", "ob.what": "What do you sell?", "ob.start": "Start ›",
  // home
  "home.receivable": "Total receivable", "home.todaySales": "Today's sales", "home.todayReceived": "Received today",
  "home.overdue": "Over 30 days", "home.parties_one": "{n} party", "home.parties_other": "{n} parties",
  "home.sortBalance": "By balance", "home.sortOverdue": "Oldest first", "home.daysDue": "{n} days overdue",
  "home.empty": "No parties yet. Use \"+ Entry\" to add one.", "home.entry": "+ Entry", "home.speak": "🎤 Speak",
  // ledger
  "ledger.parties": "‹ Parties", "ledger.remind": "Remind", "ledger.statement": "Statement", "ledger.balanceDue": "Balance due",
  "ledger.editParty": "Edit details ›", "col.date": "DATE", "col.item": "ITEM", "col.qty": "QTY", "col.rate": "RATE", "col.amount": "AMOUNT",
  "row.balance": "Balance", "row.total": "Total", "row.charge": "Transport / Charge", "row.discount": "Discount", "row.return": "Return",
  "mode.cash": "Cash", "mode.upi": "Online (UPI)", "mode.cheque": "Cheque", "mode.bank": "Bank transfer", "mode.paid": "Paid",
  // entry types and detail
  "type.sale": "Sale (goods given)", "type.payment": "Payment received", "type.charge": "Transport / Charge", "type.discount": "Discount", "type.return": "Return",
  "detail.version": "Version {v} · {status}", "status.active": "active", "status.edited": "replaced by an edit", "status.cancelled": "cancelled",
  "detail.site": "Site: {name}", "detail.sendWa": "Send to party on WhatsApp", "detail.edit": "Edit", "detail.cancelEntry": "Cancel entry",
  "detail.cancelReason": "Reason for cancelling (required)", "detail.cancelNote": "The entry is not deleted. It stays in the history but no longer changes the balance.",
  "detail.confirmCancel": "Yes, cancel",
  // add entry (form)
  "add.title": "New entry", "add.editTitle": "Edit entry", "add.closeX": "Close ✕", "add.party": "Party", "add.newParty": "+ New party",
  "add.name": "Name", "add.phone": "Phone", "add.createParty": "Create party", "add.what": "What happened?", "add.site": "Site (optional)",
  "add.newSite": "+ New site", "add.siteName": "Site name", "add.item": "Item {n}", "add.changeItem": "Change item", "add.qty": "Quantity",
  "add.qtyUnit": "Quantity ({unit})", "add.rate": "Rate per {unit} (₹) *", "add.unit": "unit", "add.lastRate": "Last time it was ₹{rate} ({date}). Use the same?",
  "add.addItem": "+ Add item", "add.amount": "Amount", "add.amountField": "Amount (₹)", "add.date": "Date", "add.reason": "Reason for change (required)",
  "add.reasonPh": "e.g. it was 40 bags, not 50", "add.review": "Review and save ›",
  "issue.date": "The date is not valid", "issue.items": "Add at least one item", "issue.item": "Item {n}: choose the item",
  "issue.unit": "Item {n}: choose a unit", "issue.qty": "Item {n}: enter the quantity", "issue.rate": "Item {n}: enter the rate",
  "issue.amount": "Enter the amount", "issue.mode": "Choose how it was paid",
  // assistant: questions, read-back, voice
  "q.partyWhich": "Which {spoken}? Choose below.", "q.partyUnknown": "\"{spoken}\" is not in your parties. Create a new party?",
  "q.partyAsk": "Which party is this for?", "q.site": "I couldn't find the site \"{spoken}\". Choose one or add a new site.",
  "q.materialWhich": "Item {n}: which {spoken}? {options}", "q.materialNone": "Item {n}: I couldn't find \"{spoken}\". Please choose.",
  "q.unit": "Item {n}: in which unit? ({options})", "q.qty": "Item {n}: how much?", "q.rate": "Item {n}: what is the rate (₹ per unit)?",
  "q.amount": "How much money?", "q.mode": "How was it paid? Cash / UPI / Cheque / Bank",
  "a.heard": "I heard: “{text}”", "a.allFound": "I have everything. Please check and confirm.", "a.queue": "Entry {i} of {n}",
  "rv.line": "{name}: {qty} {unit} × {rate} = {total}", "rv.entryTotal": "Entry total: {v}", "rv.oldBalance": "Old balance: {v}",
  "rv.newBalance": "New balance: {v}", "rv.save": "Yes, save", "rv.change": "Change", "rv.reason": "Reason: {r}",
  "warn.credit": "This goes over the credit limit (limit {v})", "warn.rate": "Item {n}: rate {r} is very different from the last rate {last}. Is it correct?",
  "voice.title": "Speak or type", "voice.intro": "Say the entry. You can use the 🎤 on your keyboard (Hindi, Marathi or English).",
  "voice.placeholder": "Gave Santosh 80 bags JSW at 360 rate", "voice.go": "Understand ›", "voice.examples": "Examples (tap to use)",
  "voice.hint": "Always say the rate. I will ask about anything you don't say. You will see everything before it is saved.",
  "voice.fail": "I didn't understand. Please say the party, the goods or the amount again.",
  "voice.ex1": "Gave Santosh 80 bags JSW at 360 rate for Moira site", "voice.ex2": "Santosh paid 50,000 by UPI", "voice.ex3": "Sold Santosh 2 butti sand at 700, transport 800",
  // statement
  "st.title": "Send statement", "st.period": "Period", "st.month": "This month", "st.30": "Last 30 days", "st.all": "All time", "st.site": "Site",
  "st.allSites": "All", "st.lang": "Language of the message", "st.empty": "No entries in this period.", "st.wa": "Send on WhatsApp", "st.share": "Share",
  "st.pdf": "Make PDF", "st.waNote": "WhatsApp is opening. Tap 'send' there.", "st.done": "Done.", "st.pdfDone": "PDF is ready.",
  "st.hint": "You have to tap 'send' in WhatsApp yourself.",
  // reminders
  "rem.title": "Reminders", "rem.sub": "Choose only the people you want to remind. Nothing is sent automatically.", "rem.oldest": "Oldest first",
  "rem.highest": "Highest balance first", "rem.never": "never reminded", "rem.today": "reminded today", "rem.ago": "reminded {n} days ago",
  "rem.nobody": "Nobody owes anything.", "rem.pick": "Choose someone first", "rem.next": "Continue ({n} selected)", "rem.of": "{i} / {n}",
  "rem.due": "Due {v} · {phone}", "rem.send": "Send on WhatsApp", "rem.confirmAsk": "Did you tap 'send' in WhatsApp? Press \"Yes\" only if you did.",
  "rem.yes": "Yes, I sent it", "rem.notSent": "Not sent", "rem.doneTitle": "Done", "rem.doneBody": "Reminded {a}, skipped {b}.",
  "rem.logFail": "{n} could not be recorded (database setup pending).", "rem.daysOverdue": "{n} days overdue",
  // items
  "it.title": "Items", "it.new": "+ New", "it.empty": "No items yet. Add one with \"+ New\".", "it.editTitle": "Edit item", "it.newTitle": "New item",
  "it.name": "Name (use the brand name for brands, e.g. JSW)", "it.category": "Category (e.g. Cement)", "it.units": "Sold in which units? (one or more)",
  "it.local": "Other names (comma separated, e.g. reti, vaalu)",
  // party edit
  "pe.back": "‹ Back", "pe.title": "Party details", "pe.name": "Name", "pe.phone": "Phone", "pe.nick": "Nicknames (comma separated)",
  "pe.limit": "Credit limit (₹, blank = no limit)", "pe.opening": "Opening balance (₹)", "pe.lang": "Message language",
  // settings
  "set.title": "Settings", "set.appLang": "App language", "set.asstLang": "Assistant language",
  "set.note": "The assistant asks its questions and reads back entries in this language. Dictation with your keyboard's mic works in any language.",
  "set.msgNote": "Messages to parties use each party's own language (set in the party's details).",
} as const;
export type Key = keyof typeof en;

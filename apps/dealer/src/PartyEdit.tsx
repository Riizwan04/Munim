import { useState } from "react";
import { ScrollView, Text } from "react-native";
import { parseRupees } from "@munim/ledger-core";
import { updateParty, type PartyRow } from "./data";
import { FONT, useTheme } from "./theme";
import { Btn, Chip, Field, Row, Section } from "./ui";

const LANGS = [{ k: "hi", l: "Hindi" }, { k: "mr", l: "Marathi" }, { k: "en", l: "English" }];

/** Party details: nicknames help voice entry ("Santosh bhai", "Naik mistri"), credit limit warns, opening balance starts the ledger (FR-10/11/05). */
export function PartyEdit({ party, onBack, onSaved }: { party: PartyRow; onBack: () => void; onSaved: () => void }) {
  const t = useTheme();
  const [name, setName] = useState(party.name);
  const [phone, setPhone] = useState(party.phone);
  const [nick, setNick] = useState(party.nicknames.join(", "));
  const [limit, setLimit] = useState(party.creditLimit === null ? "" : String(party.creditLimit / 100));
  const [opening, setOpening] = useState(String(party.opening / 100));
  const [lang, setLang] = useState(party.language);
  const [err, setErr] = useState("");
  const lim = limit.trim() === "" ? null : parseRupees(limit);
  const open = parseRupees(opening.replace(/^-/, ""));
  const bad = !name.trim() || phone.trim().length < 8 || (limit.trim() !== "" && lim === null) || open === null;
  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={{ padding: 16, gap: 16 }} keyboardShouldPersistTaps="handled">
      <Text onPress={onBack} style={{ fontSize: FONT.body, color: t.accent, fontWeight: "600" }}>‹ Wapas</Text>
      <Text style={{ fontSize: FONT.title, fontWeight: "700", color: t.ink }}>Party ki jaankari</Text>
      <Field label="Naam" nativeID="pe-name" value={name} onChangeText={setName} />
      <Field label="Phone" nativeID="pe-phone" keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
      <Field label="Bulane ke naam (comma se alag)" nativeID="pe-nick" value={nick} onChangeText={setNick} placeholder="Santosh bhai, Naik mistri" />
      <Field label="Credit limit (₹, khaali = koi limit nahi)" nativeID="pe-limit" keyboardType="decimal-pad" value={limit} onChangeText={setLimit} />
      <Field label="Shuruaati baaki / opening balance (₹)" nativeID="pe-open" keyboardType="decimal-pad" value={opening} onChangeText={setOpening} />
      <Section title="Message ki bhasha"><Row>{LANGS.map((l) => <Chip key={l.k} label={l.l} on={lang === l.k} onPress={() => setLang(l.k)} />)}</Row></Section>
      {err ? <Text style={{ color: t.due }}>{err}</Text> : null}
      <Row wrap={false}><Btn label="Save" disabled={bad} onPress={async () => {
        try {
          await updateParty(party.id, { name: name.trim(), phone: phone.trim(), nicknames: nick.split(",").map((x) => x.trim()).filter(Boolean), creditLimit: lim, opening: open!, language: lang });
          onSaved();
        } catch (e: any) { setErr(e.message); }
      }} /></Row>
    </ScrollView>
  );
}

import { useState, type ReactNode } from "react";
import { Platform, Pressable, ScrollView, Switch, Text, View } from "react-native";
import Constants from "expo-constants";
import { saveAssistantName, saveBusinessName, saveTagline } from "./data";
import { recent, report } from "./diagnostics";
import { LANGS, useI18n } from "./i18n";
import { Avatar } from "./Logo";
import { useOutbox } from "./offline/outbox";
import { useReachable } from "./offline/net";
import { requestSignOut } from "./offline/signout";
import { shareText } from "./share";
import { FONT, HEAD, useTheme, useThemeMode } from "./theme";
import { Btn, Field } from "./ui";

type Page = null | "profile" | "voice" | "language" | "dark" | "help";
interface Props {
  onBack: () => void; businessId: string; tagline: string; business: string; assistantName: string; onSaved: () => void;
  handsFree: boolean; onHandsFree: (on: boolean) => void;
}

/**
 * Settings the way everyday apps do it: a profile card on top, a short list of plain-word rows, each opening its own small page.
 * Choices (language, dark mode, hands-free) apply the moment you tap. Typing a name shows one "Save changes" bar only while there is
 * something to save; leaving with unsaved changes asks first.
 */
export function Settings({ onBack, businessId, tagline, business, assistantName, onSaved, handsFree, onHandsFree }: Props) {
  const t = useTheme();
  const { tr, ui, asst, setUi, setAsst } = useI18n();
  const { mode, setMode } = useThemeMode();
  const [page, setPage] = useState<Page>(null);
  const [biz, setBiz] = useState(business);
  const [tag, setTag] = useState(tagline);
  const [aName, setAName] = useState(assistantName);
  const [base, setBase] = useState({ biz: business, tag: tagline, name: assistantName }); // what is saved right now (updated at once on Save)
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [ask, setAsk] = useState<Exclude<Page, null> | "main" | "exit" | null>(null);
  const [how, setHow] = useState(false);
  const [diagNote, setDiagNote] = useState("");
  const online = useReachable();
  const { pending, failed } = useOutbox();
  const version = Constants.expoConfig?.version ?? "?";
  const langName = (k: string) => LANGS.find((l) => l.k === k)?.label ?? "";

  const dirty = (page === "profile" && (biz.trim() !== base.biz || tag.trim() !== base.tag)) || (page === "voice" && aName.trim() !== base.name);
  const valid = page === "profile" ? biz.trim().length >= 2 : page === "voice" ? aName.trim().length >= 2 : true;

  async function save(): Promise<boolean> {
    if (!dirty || !valid) return true;
    setBusy(true);
    try {
      if (page === "profile") { if (biz.trim() !== base.biz) await saveBusinessName(businessId, biz); if (tag.trim() !== base.tag) await saveTagline(businessId, tag); }
      if (page === "voice") await saveAssistantName(businessId, aName);
      setBase({ biz: biz.trim(), tag: tag.trim(), name: aName.trim() }); onSaved(); setToast(tr("set.saved")); setTimeout(() => setToast(""), 1800);
      setBusy(false); return true;
    } catch { setToast(tr("set.taglineFail")); setBusy(false); return false; }
  }
  function discard() { setBiz(base.biz); setTag(base.tag); setAName(base.name); }
  function leave(to: Exclude<Page, null> | "main" | "exit") { if (to === "exit") onBack(); else setPage(to === "main" ? null : to); }
  function go(to: Exclude<Page, null> | "main" | "exit") { if (dirty) { setAsk(to); return; } leave(to); }

  // ── small building blocks ──
  const Group = ({ children }: { children: ReactNode }) => <View style={{ backgroundColor: t.surface, borderRadius: 16, borderWidth: 1, borderColor: t.line, overflow: "hidden" }}>{children}</View>;
  const Row1 = ({ icon, tint, title, value, onPress, last }: { icon: string; tint: string; title: string; value?: string; onPress: () => void; last?: boolean }) => (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={title} style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 12, paddingHorizontal: 14, minHeight: 58, borderBottomWidth: last ? 0 : 1, borderColor: t.rule }}>
      <View style={{ width: 34, height: 34, borderRadius: 9, backgroundColor: tint, alignItems: "center", justifyContent: "center" }}><Text style={{ fontSize: 18 }}>{icon}</Text></View>
      <Text style={{ flex: 1, fontSize: FONT.body, color: t.fg, fontWeight: "600" }}>{title}</Text>
      {value ? <Text style={{ fontSize: FONT.small, color: t.muted }} numberOfLines={1}>{value}</Text> : null}
      <Text style={{ fontSize: 20, color: t.muted }}>›</Text>
    </Pressable>
  );
  const Tick = ({ label, on, onPress, last }: { label: string; on: boolean; onPress: () => void; last?: boolean }) => (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={label} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 14, paddingHorizontal: 16, minHeight: 54, borderBottomWidth: last ? 0 : 1, borderColor: t.rule }}>
      <Text style={{ flex: 1, fontSize: FONT.body, color: t.fg, fontWeight: on ? "700" : "500" }}>{label}</Text>
      {on ? <Text style={{ fontSize: 20, color: t.paid, fontWeight: "800" }}>✓</Text> : null}
    </Pressable>
  );
  const Title = ({ children }: { children: string }) => <Text style={{ fontFamily: HEAD, fontSize: FONT.title, color: t.ink }}>{children}</Text>;
  const Label = ({ children }: { children: string }) => <Text style={{ fontSize: 13, fontWeight: "800", color: t.muted, textTransform: "uppercase", letterSpacing: 1, marginTop: 6 }}>{children}</Text>;

  let body: ReactNode;
  if (page === null) {
    body = (<>
      <Pressable onPress={() => setPage("profile")} accessibilityRole="button" accessibilityLabel={tr("s2.editProfile")} style={{ flexDirection: "row", alignItems: "center", gap: 14, padding: 14, borderRadius: 16, backgroundColor: t.surface, borderWidth: 1, borderColor: t.line }}>
        <Avatar name={business || "?"} size={60} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: HEAD, fontSize: FONT.body + 4, color: t.ink }} numberOfLines={1}>{business}</Text>
          <Text style={{ fontSize: FONT.small, color: t.muted }} numberOfLines={1}>{tagline || tr("s2.editProfile")}</Text>
        </View>
        <Text style={{ fontSize: 20, color: t.muted }}>›</Text>
      </Pressable>
      <Group>
        <Row1 icon="🎙" tint="#dff3e4" title={tr("s2.voice")} value={assistantName} onPress={() => setPage("voice")} />
        <Row1 icon="🌐" tint="#dbe8ff" title={tr("s2.lang")} value={langName(ui)} onPress={() => setPage("language")} />
        <Row1 icon="🌙" tint="#e8e0ff" title={tr("s2.dark")} value={mode === "system" ? tr("s2.darkSys") : mode === "dark" ? tr("s2.on") : tr("s2.off")} onPress={() => setPage("dark")} last />
      </Group>
      <Group><Row1 icon="❓" tint="#ffe9cf" title={tr("s2.help")} value={`v${version}`} onPress={() => setPage("help")} last /></Group>
      <Pressable onPress={async () => { if (!(await requestSignOut())) setToast(tr("offline.logoutBlocked")); }} accessibilityRole="button" style={{ minHeight: 52, alignItems: "center", justifyContent: "center", borderRadius: 16, backgroundColor: t.surface, borderWidth: 1, borderColor: t.line }}>
        <Text style={{ fontSize: FONT.body, fontWeight: "800", color: t.due }}>{tr("common.logout")}</Text>
      </Pressable>
    </>);
  } else if (page === "profile") {
    body = (<>
      <View style={{ alignItems: "center", gap: 10, paddingVertical: 6 }}><Avatar name={biz || "?"} size={84} /></View>
      <Field label={tr("set.f.biz")} nativeID="set-biz" value={biz} onChangeText={setBiz} />
      <Field label={tr("set.tag")} nativeID="tagline" value={tag} onChangeText={(v) => setTag(v.slice(0, 60))} maxLength={60} placeholder={tr("set.taglinePh")} />
    </>);
  } else if (page === "voice") {
    body = (<>
      <Field label={tr("s2.name")} nativeID="set-asst" value={aName} onChangeText={(v) => setAName(v.slice(0, 20))} />
      <Label>{tr("s2.speaks")}</Label>
      <Group>{LANGS.map((l, i) => <Tick key={l.k} label={l.label} on={asst === l.k} onPress={() => setAsst(l.k)} last={i === LANGS.length - 1} />)}</Group>
      <Group>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: FONT.body, color: t.fg, fontWeight: "600" }}>{tr("s2.hands")}</Text>
            <Text style={{ fontSize: FONT.small - 1, color: t.muted }}>{tr("hf.short")}</Text>
          </View>
          <Switch value={handsFree} onValueChange={onHandsFree} accessibilityLabel={tr("s2.hands")} trackColor={{ true: t.paid, false: t.line }} />
        </View>
      </Group>
      <Pressable onPress={() => setHow(!how)} accessibilityRole="button"><Text style={{ fontSize: FONT.small, color: t.accent, fontWeight: "700" }}>ⓘ {tr("s2.how")}</Text></Pressable>
      {how ? <Text style={{ fontSize: FONT.small, color: t.muted }}>{tr("hf.note")}</Text> : null}
    </>);
  } else if (page === "language") {
    body = (<Group>{LANGS.map((l, i) => <Tick key={l.k} label={l.label} on={ui === l.k} onPress={() => setUi(l.k)} last={i === LANGS.length - 1} />)}</Group>);
  } else if (page === "dark") {
    body = (<Group>
      <Tick label={tr("s2.darkSys")} on={mode === "system"} onPress={() => setMode("system")} />
      <Tick label={tr("s2.darkOff")} on={mode === "light"} onPress={() => setMode("light")} />
      <Tick label={tr("s2.darkOn")} on={mode === "dark"} onPress={() => setMode("dark")} last />
    </Group>);
  } else {
    body = (<>
      <Text style={{ fontSize: FONT.body, color: t.fg, fontWeight: "700" }}>{tr("diag.version", { v: version })}</Text>
      {Platform.OS === "web" ? <Text style={{ fontSize: FONT.small, color: t.muted }}>{tr("diag.install")}</Text> : null}
      <Label>{tr("diag.recent")}</Label>
      {recent(8).length === 0 ? <Text style={{ fontSize: FONT.small, color: t.paid }}>{tr("diag.none")}</Text> : recent(8).map((l, i) => <Text key={i} style={{ fontSize: 12, color: t.due }}>{l}</Text>)}
      <Btn kind="ghost" label={tr("s2.report")} onPress={async () => { await shareText(report({ version, ui, asst, online, pending, failed })); setDiagNote(tr("diag.shared")); }} />
      {diagNote ? <Text style={{ fontSize: FONT.small, color: t.muted }}>{diagNote}</Text> : null}
    </>);
  }

  const heading = page === null ? tr("set.title") : page === "profile" ? tr("s2.profile") : page === "voice" ? tr("s2.voice") : page === "language" ? tr("s2.lang") : page === "dark" ? tr("s2.dark") : tr("s2.help");

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 8, minHeight: 54, borderBottomWidth: 1, borderColor: t.rule, backgroundColor: t.surface }}>
        <Pressable onPress={() => go(page === null ? "exit" : "main")} accessibilityRole="button" accessibilityLabel={tr("common.back")} style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: 30, color: t.accent, marginTop: -4 }}>‹</Text>
        </Pressable>
        <Text style={{ fontFamily: HEAD, fontSize: FONT.body + 3, color: t.ink }}>{heading}</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">{body}</ScrollView>

      {dirty && !ask ? (
        <View style={{ position: "absolute", left: 12, right: 12, bottom: 12, flexDirection: "row", gap: 10, padding: 10, borderRadius: 18, backgroundColor: t.surface, borderWidth: 1.5, borderColor: t.ink, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8 }} testID="savebar">
          <View style={{ flex: 1 }}><Btn kind="ghost" label={tr("set.discard")} onPress={discard} /></View>
          <View style={{ flex: 2 }}><Btn label={tr("set.save")} disabled={!valid || busy} onPress={() => void save()} /></View>
        </View>
      ) : null}

      {ask ? (
        <View style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end", padding: 12 }} testID="leave-ask">
          <View style={{ backgroundColor: t.surface, borderRadius: 22, padding: 18, gap: 12 }}>
            <Text style={{ fontFamily: HEAD, fontSize: FONT.title - 2, color: t.ink, textAlign: "center" }}>{tr("set.leaveQ")}</Text>
            <Btn label={tr("set.save")} disabled={!valid || busy} onPress={async () => { const to = ask; if (to && await save()) { setAsk(null); leave(to); } }} />
            <Btn kind="ghost" label={tr("set.discard")} onPress={() => { const to = ask; discard(); setAsk(null); if (to) leave(to); }} />
          </View>
        </View>
      ) : null}

      {toast ? <View pointerEvents="none" style={{ position: "absolute", top: 60, left: 0, right: 0, alignItems: "center" }}><Text style={{ backgroundColor: t.ink, color: t.accentFg, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 16, fontWeight: "700", overflow: "hidden" }}>{toast}</Text></View> : null}
    </View>
  );
}

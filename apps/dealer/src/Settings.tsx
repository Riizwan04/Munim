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
import { Btn, Chip, Field, Row } from "./ui";

type Page = null | "profile" | "assistant" | "language" | "appearance" | "help";
interface Props {
  onBack: () => void; businessId: string; tagline: string; business: string; assistantName: string; onSaved: () => void;
  handsFree: boolean; onHandsFree: (on: boolean) => void;
}

/**
 * Settings, as a clean list (like a phone's own settings): a profile header, then one row per topic that opens its own small page.
 * Switches and choices apply the moment you tap. Typing a name never needs a Save button of its own: one "Save changes" bar
 * appears at the bottom only while there is something to save, and leaving with unsaved changes asks first.
 */
export function Settings({ onBack, businessId, tagline, business, assistantName, onSaved, handsFree, onHandsFree }: Props) {
  const t = useTheme();
  const { tr, ui, asst, setUi, setAsst } = useI18n();
  const { mode, setMode } = useThemeMode();
  const [page, setPage] = useState<Page>(null);
  const [biz, setBiz] = useState(business);
  const [tag, setTag] = useState(tagline);
  const [aName, setAName] = useState(assistantName);
  const [base, setBase] = useState({ biz: business, tag: tagline, name: assistantName }); // what is saved right now (updated at once on Save, before the app refreshes)
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [ask, setAsk] = useState<Exclude<Page, null> | "main" | "exit" | null>(null); // "leave with unsaved changes?" and where to go afterwards
  const [diagNote, setDiagNote] = useState("");
  const online = useReachable();
  const { pending, failed } = useOutbox();
  const version = Constants.expoConfig?.version ?? "?";

  const dirty = (page === "profile" && (biz.trim() !== base.biz || tag.trim() !== base.tag)) || (page === "assistant" && aName.trim() !== base.name);
  const valid = page === "profile" ? biz.trim().length >= 2 : page === "assistant" ? aName.trim().length >= 2 : true;

  async function save(): Promise<boolean> {
    if (!dirty || !valid) return true;
    setBusy(true);
    try {
      if (page === "profile") { if (biz.trim() !== base.biz) await saveBusinessName(businessId, biz); if (tag.trim() !== base.tag) await saveTagline(businessId, tag); }
      if (page === "assistant") await saveAssistantName(businessId, aName);
      setBase({ biz: biz.trim(), tag: tag.trim(), name: aName.trim() }); onSaved(); setToast(tr("set.saved")); setTimeout(() => setToast(""), 1800);
      setBusy(false); return true;
    } catch { setToast(tr("set.taglineFail")); setBusy(false); return false; }
  }
  function discard() { setBiz(base.biz); setTag(base.tag); setAName(base.name); }
  /** Going somewhere else while something is unsaved asks first; otherwise just goes. */
  function go(to: Exclude<Page, null> | "main" | "exit") {
    if (dirty) { setAsk(to); return; }
    leave(to);
  }
  function leave(to: Exclude<Page, null> | "main" | "exit") { if (to === "exit") onBack(); else setPage(to === "main" ? null : to); }

  const Item = ({ icon, title, sub, onPress, last }: { icon: string; title: string; sub?: string; onPress: () => void; last?: boolean }) => (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={title} style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: last ? 0 : 1, borderColor: t.rule, minHeight: 64 }}>
      <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: t.paidBg, alignItems: "center", justifyContent: "center" }}><Text style={{ fontSize: 19 }}>{icon}</Text></View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: FONT.body, fontWeight: "700", color: t.fg }}>{title}</Text>
        {sub ? <Text style={{ fontSize: FONT.small - 1, color: t.muted }} numberOfLines={1}>{sub}</Text> : null}
      </View>
      <Text style={{ fontSize: 22, color: t.muted }}>›</Text>
    </Pressable>
  );
  const Card = ({ children }: { children: ReactNode }) => <View style={{ backgroundColor: t.surface, borderRadius: 18, borderWidth: 1, borderColor: t.line, overflow: "hidden" }}>{children}</View>;
  const Title = ({ children }: { children: string }) => <Text style={{ fontFamily: HEAD, fontSize: FONT.title, color: t.ink }}>{children}</Text>;
  const Note = ({ children }: { children: string }) => <Text style={{ fontSize: FONT.small, color: t.muted }}>{children}</Text>;

  let body: ReactNode;
  if (page === null) {
    body = (
      <>
        <Pressable onPress={() => setPage("profile")} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", gap: 14, padding: 16, borderRadius: 18, backgroundColor: t.surface, borderWidth: 1, borderColor: t.line }}>
          <Avatar name={business || "?"} size={56} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: HEAD, fontSize: FONT.body + 4, color: t.ink }} numberOfLines={1}>{business}</Text>
            <Text style={{ fontSize: FONT.small, color: t.muted }} numberOfLines={1}>{tagline || `${tr("set.r.assistant")}: ${assistantName}`}</Text>
          </View>
          <Text style={{ fontSize: 22, color: t.muted }}>›</Text>
        </Pressable>
        <Card>
          <Item icon="🏪" title={tr("set.r.profile")} sub={tr("set.r.profileSub")} onPress={() => setPage("profile")} />
          <Item icon="🎙" title={tr("set.r.assistant")} sub={`${assistantName} · ${tr("set.r.assistantSub")}`} onPress={() => setPage("assistant")} />
          <Item icon="🌐" title={tr("set.r.language")} sub={tr("set.r.languageSub")} onPress={() => setPage("language")} />
          <Item icon="🌓" title={tr("set.r.appearance")} sub={tr("set.r.appearanceSub")} onPress={() => setPage("appearance")} last />
        </Card>
        <Card><Item icon="🛟" title={tr("set.r.help")} sub={`${tr("set.r.helpSub")} · v${version}`} onPress={() => setPage("help")} last /></Card>
        <Row wrap={false}><Btn kind="ghost" label={tr("common.logout")} onPress={async () => { if (!(await requestSignOut())) setToast(tr("offline.logoutBlocked")); }} /></Row>
      </>
    );
  } else if (page === "profile") {
    body = (<>
      <Title>{tr("set.r.profile")}</Title>
      <Field label={tr("set.f.biz")} nativeID="set-biz" value={biz} onChangeText={setBiz} />
      <Field label={tr("set.tag")} nativeID="tagline" value={tag} onChangeText={(v) => setTag(v.slice(0, 60))} maxLength={60} placeholder={tr("set.taglinePh")} />
    </>);
  } else if (page === "assistant") {
    body = (<>
      <Title>{tr("set.r.assistant")}</Title>
      <Field label={tr("set.f.asst")} nativeID="set-asst" value={aName} onChangeText={(v) => setAName(v.slice(0, 20))} />
      <Note>{tr("set.asstHint")}</Note>
      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 16 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: FONT.body, fontWeight: "700", color: t.fg }}>{tr("hf.title")}</Text>
            <Text style={{ fontSize: FONT.small - 1, color: t.muted }}>{handsFree ? tr("hf.on") : tr("hf.off")}</Text>
          </View>
          <Switch value={handsFree} onValueChange={onHandsFree} accessibilityLabel={tr("hf.title")} trackColor={{ true: t.paid, false: t.line }} />
        </View>
      </Card>
      <Note>{tr("hf.note")}</Note>
      <Text style={{ fontSize: FONT.small, color: t.muted, fontWeight: "700", marginTop: 6 }}>{tr("set.voiceLang")}</Text>
      <Row>{LANGS.map((l) => <Chip key={l.k} label={l.label} on={asst === l.k} onPress={() => setAsst(l.k)} />)}</Row>
      <Note>{tr("set.voiceNote")}</Note>
    </>);
  } else if (page === "language") {
    body = (<>
      <Title>{tr("set.r.language")}</Title>
      <Text style={{ fontSize: FONT.small, color: t.muted, fontWeight: "700" }}>{tr("set.appLang")}</Text>
      <Row>{LANGS.map((l) => <Chip key={l.k} label={l.label} on={ui === l.k} onPress={() => setUi(l.k)} />)}</Row>
      <Note>{tr("set.writtenNote")}</Note>
    </>);
  } else if (page === "appearance") {
    body = (<>
      <Title>{tr("set.r.appearance")}</Title>
      <Row>{(["system", "light", "dark"] as const).map((m) => <Chip key={m} label={tr(`theme.${m}` as const)} on={mode === m} onPress={() => setMode(m)} />)}</Row>
    </>);
  } else {
    body = (<>
      <Title>{tr("set.r.help")}</Title>
      <Text style={{ fontSize: FONT.body, color: t.fg, fontWeight: "700" }}>{tr("diag.version", { v: version })}</Text>
      <Note>{tr("diag.note")}</Note>
      {Platform.OS === "web" ? <Note>{tr("diag.install")}</Note> : null}
      <Text style={{ fontSize: FONT.small, color: t.muted, fontWeight: "700" }}>{tr("diag.recent")}</Text>
      {recent(8).length === 0 ? <Text style={{ fontSize: FONT.small, color: t.paid }}>{tr("diag.none")}</Text> : recent(8).map((l, i) => <Text key={i} style={{ fontSize: 12, color: t.due }}>{l}</Text>)}
      <Row wrap={false}><Btn kind="ghost" label={tr("diag.share")} onPress={async () => { await shareText(report({ version, ui, asst, online, pending, failed })); setDiagNote(tr("diag.shared")); }} /></Row>
      {diagNote ? <Note>{diagNote}</Note> : null}
    </>);
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => go(page === null ? "exit" : "main")} accessibilityRole="button" style={{ minHeight: 44, justifyContent: "center", alignSelf: "flex-start" }}>
          <Text style={{ fontSize: FONT.body, color: t.accent, fontWeight: "700" }}>‹ {page === null ? tr("common.back") : tr("set.title")}</Text>
        </Pressable>
        {page === null ? <Title>{tr("set.title")}</Title> : null}
        {body}
      </ScrollView>

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

      {toast ? <View pointerEvents="none" style={{ position: "absolute", top: 10, left: 0, right: 0, alignItems: "center" }}><Text style={{ backgroundColor: t.ink, color: t.accentFg, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 16, fontWeight: "700", overflow: "hidden" }}>{toast}</Text></View> : null}
    </View>
  );
}

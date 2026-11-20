"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import type { PostType } from "@/studio/post-types";
import type { Plan, PlanIdea, TypeStat } from "@/studio/planner";
import type { QuickIdea } from "@/studio/quick-ideas";
import { fetchStream, type LiveFields } from "@/studio/stream-client";
import { BLOG_STYLE } from "@/studio/blog-style";
import { changedLines, figuresOf, parseBody, toEditorHtml, toPlainText, type Span } from "@/studio/format";
import { DEFAULT_OPENAI_MODEL, MAX_AI_IMAGES, OPENAI_KEY_PATTERN, OPENAI_MODELS } from "@/studio/openai-models";
import { makeZip } from "@/studio/zip";

const noopSubscribe = () => () => {};
/** 브라우저 저장값 읽기 (사생활 모드 등에서 실패하면 null) */
function readLocal(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeLocal(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {}
}
const KEY_STORE = "hb-openai-key";
const MODEL_STORE = "hb-openai-model";

/** 에디터 붙여넣기용: 사진을 긴 변 1200px JPEG data URL로 (원본 그대로 넣으면 클립보드가 너무 커짐) */
async function toDataUrl(src: string, maxSide = 1200): Promise<string | undefined> {
  try {
    const bmp = await createImageBitmap(await (await fetch(src)).blob());
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    return canvas.toDataURL("image/jpeg", 0.85);
  } catch {
    return undefined;
  }
}

/** AI 그림 상태 — [그림: 설명] 문구로 짝지음 (본문을 고쳐 순서가 바뀌어도 같은 그림이 같은 자리에) */
type FigureState = { desc: string; status: "loading" | "done" | "error"; src?: string; error?: string };
const figureFor = (figures: FigureState[], desc: string) => figures.find((f) => f.desc === desc);

type AgentInfo = { id: string; label: string; plan: string; loginHelp: string };

/**
 * 업로드 전 사진 축소: 긴 변 1600px JPEG(품질 0.82).
 * 웹 배포(Vercel)는 요청 본문 4.5MB 한도가 있고, AI가 글을 쓰는 데는 이 해상도로 충분하다.
 * 이미 작은 JPEG는 그대로 보낸다. 실패하면 원본을 보낸다.
 */
const MAX_SIDE = 1600;
async function shrinkImage(file: File): Promise<File> {
  if (file.type === "image/jpeg" && file.size < 600 * 1024) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff"; // 투명 PNG 배경
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.82));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}
type Result = {
  title: string;
  body: string;
  tags: string[];
  notes: string;
  agent: string;
  imagesSeen: boolean;
  examplesUsed: number;
  photos: string[];
  keywords: string[];
  /** 초안을 만들 때 적은 주제·내용 (수정 요청 때 사실 근거로 함께 보냄) */
  topic: string;
  /** 자동 글(원장님 입력 없이 작성) 여부 */
  auto?: boolean;
  /** AI 그림을 넣기로 하고 만든 글 (그림 패널 표시) */
  aiFigures?: boolean;
};

/** 수정 요청 빠른 버튼 */
const REVISE_PRESETS = ["전체를 조금 더 짧게", "더 따뜻하고 부드러운 말투로", "소제목을 더 짧고 눈에 띄게", "마무리 문단을 더 자연스럽게"];

const AGENT_KEY = "hb-studio-agent";

export default function StudioClient({
  ideas,
  agents,
  postTypes,
  keywordGroups,
  logout,
}: {
  /** 추천 주제 (학사 시기·최근 글 공백으로 즉시 계산) */
  ideas: QuickIdea[];
  agents: AgentInfo[];
  postTypes: PostType[];
  keywordGroups: { label: string; items: string[] }[];
  logout: () => Promise<void>;
}) {
  const saved = useSyncExternalStore(noopSubscribe, () => readLocal(AGENT_KEY), () => null);
  const [picked, setPicked] = useState<string | null>(null);
  // 기본: PC에서는 ChatGPT(구독), 웹에서는 GPT(내 API 키)
  const fallback = agents.find((a) => a.id === "chatgpt")?.id ?? agents.find((a) => a.id === "gpt")?.id ?? agents.find((a) => a.id === "openai")?.id ?? agents[0].id;
  const agent = picked ?? (saved && agents.some((a) => a.id === saved) ? saved : fallback);

  // GPT(내 API 키): 키·모델은 이 브라우저에만 저장 (null = 아직 화면에서 바꾸지 않음 → 저장값 사용)
  const savedKey = useSyncExternalStore(noopSubscribe, () => readLocal(KEY_STORE), () => null);
  const savedModel = useSyncExternalStore(noopSubscribe, () => readLocal(MODEL_STORE), () => null);
  const [keyInput, setKeyInput] = useState<string | null>(null);
  const [modelPicked, setModelPicked] = useState<string | null>(null);
  const apiKey = (keyInput ?? savedKey ?? "").trim();
  const model = modelPicked ?? (OPENAI_MODELS.some((m) => m.id === savedModel) ? savedModel! : DEFAULT_OPENAI_MODEL);
  const isByok = agent === "openai";
  const keyOk = OPENAI_KEY_PATTERN.test(apiKey);
  const byokHeaders: Record<string, string> = isByok ? { "X-OpenAI-Key": apiKey, "X-OpenAI-Model": model } : {};
  const [aiImages, setAiImages] = useState(false);
  const [figures, setFigures] = useState<FigureState[]>([]);
  const [editText, setEditText] = useState(false);
  const [center, setCenter] = useState(true); // 기본: 가운데 정렬
  const [view, setView] = useState<"mobile" | "pc">("mobile"); // 미리보기 폭 (블로그 방문자 대부분 모바일)
  // 자연어 수정: 요청 → AI가 해당 부분만 고침. history 로 한 단계씩 되돌리기
  const [revText, setRevText] = useState("");
  const [revising, setRevising] = useState(false);
  const [revMsg, setRevMsg] = useState<{ ok: boolean; text: string; changes?: string[] } | null>(null);
  /** 마지막 글 고치기에서 바뀐 줄 (미리보기에 노란 표시). 직접 고치거나 새 글을 만들면 지움 */
  const [changed, setChanged] = useState<Set<number> | null>(null);
  const [history, setHistory] = useState<{ title: string; body: string; figures: FigureState[] }[]>([]);
  const [typeId, setTypeId] = useState(postTypes[0].id);
  // null = 아직 고르지 않음 → 글 유형의 기본 키워드 사용
  const [kwPicked, setKwPicked] = useState<string[] | null>(null);
  const [topic, setTopic] = useState("");
  const [ideaPicked, setIdeaPicked] = useState<string | null>(null);
  /** 고른 추천 칩: 주제 칸에 그 제목이 남아 있을 때만 선택된 것으로 본다 (직접 바꾸면 해제) */
  const pickedIdea = ideas.find((i) => i.id === ideaPicked && topic.split("\n")[0].trim() === i.title);
  /** 주제 없이 바로 쓸 맞춤 추천: 원장님께 받을 사실이 없는 첫 추천 */
  const todayPick = ideas.find((i) => i.needs.length === 0);
  const [files, setFiles] = useState<File[]>([]);
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ msg: string; raw?: string } | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [body, setBody] = useState("");
  const [copied, setCopied] = useState("");
  /** 스트리밍: AI가 지금까지 쓴 제목·본문 (생성·고치기 중에만) */
  const [live, setLive] = useState<LiveFields | null>(null);
  // 요청 순번·취소: 늦게 온 이전 응답이 새 글을 덮어쓰지 않게, 새 요청·화면 이탈 시 이전 요청은 취소
  const runId = useRef(0);
  const inFlight = useRef<AbortController | null>(null);
  const draftSeq = useRef(0); // 그림 요청이 어느 초안 것인지
  useEffect(() => () => inFlight.current?.abort(), []);
  function startRun() {
    inFlight.current?.abort();
    const ctrl = new AbortController();
    inFlight.current = ctrl;
    return { id: ++runId.current, signal: ctrl.signal };
  }
  const isCurrent = (id: number) => runId.current === id;
  const busy = loading || revising;

  const type = postTypes.find((t) => t.id === typeId)!;
  const selectedKeywords = kwPicked ?? [type.defaultKeyword];
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach(URL.revokeObjectURL), [previews]);

  function pickAgent(id: string) {
    setPicked(id);
    try {
      localStorage.setItem(AGENT_KEY, id);
    } catch {}
  }

  /** 플래너 제안 → 글 유형·주제·키워드 채우고 주제 칸으로 이동 */
  function applyIdea(idea: PlanIdea) {
    setTypeId(idea.type);
    setKwPicked(idea.keywords.length > 0 ? idea.keywords : null);
    const lines = [idea.title, ...idea.outline.map((o) => `- ${o}`)];
    if (idea.needs.length) {
      lines.push("", "[실제 사실 — 채운 내용만 글에 들어갑니다]", ...idea.needs.map((n) => `· ${n}: `));
    }
    setTopic(lines.join("\n"));
    requestAnimationFrame(() => {
      const el = document.getElementById("topic-input") as HTMLTextAreaElement | null;
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      el?.focus({ preventScroll: true });
    });
  }

  function move(i: number, d: -1 | 1) {
    const j = i + d;
    if (j < 0 || j >= files.length) return;
    const next = [...files];
    [next[i], next[j]] = [next[j], next[i]];
    setFiles(next);
  }

  function updateKey(v: string) {
    setKeyInput(v);
    writeLocal(KEY_STORE, v.trim() ? v.trim() : null);
  }
  function pickModel(id: string) {
    setModelPicked(id);
    writeLocal(MODEL_STORE, id);
  }

  /** 초안의 [그림: …] 자리마다 일러스트를 그린다 (동시에, 실패한 것만 다시 그리기 가능) */
  async function drawFigure(desc: string, headers: Record<string, string>, seq = draftSeq.current) {
    // 그사이 새 초안을 만들었으면 이전 초안의 그림은 버린다
    const set = (next: FigureState) => {
      if (draftSeq.current === seq) setFigures((prev) => prev.map((f) => (f.desc === desc ? next : f)));
    };
    set({ desc, status: "loading" });
    try {
      const res = await fetch("/api/studio/images", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Studio-Request": "1", ...headers },
        body: JSON.stringify({ description: desc }),
      });
      const json = await res.json();
      set(json.success ? { desc, status: "done", src: json.data.image } : { desc, status: "error", error: json.error });
    } catch (err) {
      set({ desc, status: "error", error: err instanceof Error ? err.message : "요청 실패" });
    }
  }

  function generate(e: React.FormEvent) {
    e.preventDefault();
    runDraft({ mode: "manual", type: typeId, topic, keywords: selectedKeywords });
  }

  /** ⚡ 자동 글: 원장님 입력 없이 확인된 교습소 정보 + 일반 교육 이야기로 바로 올릴 글 (주제·유형은 선택) */
  function autoWrite(opts: { type?: string; topic?: string; keywords?: string[] } = {}) {
    runDraft({ mode: "auto", type: opts.type ?? "", topic: opts.topic ?? "", keywords: opts.keywords ?? [] });
    requestAnimationFrame(() => document.getElementById("result")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  async function runDraft(req: { mode: "manual" | "auto"; type: string; topic: string; keywords: string[] }) {
    if (busy) return;
    if (isByok && !keyOk) {
      setError({ msg: "OpenAI API 키(sk-로 시작)를 1번 칸에 입력해 주세요." });
      return;
    }
    setLoading(true);
    setLive(null);
    setChanged(null);
    setError(null);
    setResult(null);
    setFigures([]);
    setEditText(false);
    const run = startRun();
    const headers = byokHeaders; // 생성 도중 키를 바꿔도 그림은 같은 키로
    const fd = new FormData();
    fd.set("agent", agent);
    fd.set("mode", req.mode);
    fd.set("type", req.type);
    fd.set("topic", req.topic);
    req.keywords.forEach((k) => fd.append("keywords", k));
    fd.set("consent", consent ? "yes" : "no");
    fd.set("aiImages", isByok && aiImages ? String(MAX_AI_IMAGES) : "0");
    try {
      for (const f of await Promise.all(files.map(shrinkImage))) fd.append("images", f);
      const json = (await fetchStream(
        "/api/studio/drafts",
        { method: "POST", body: fd, headers: { "X-Studio-Request": "1", ...headers }, signal: run.signal },
        (l) => isCurrent(run.id) && setLive(l),
      )) as { success: boolean; error: string; data: Omit<Result, "topic" | "photos"> };
      if (!isCurrent(run.id)) return;
      if (!json.success) {
        setError({ msg: json.error });
      } else {
        const withFigures = isByok && aiImages;
        const descs = withFigures ? [...new Set(figuresOf(json.data.body))].slice(0, MAX_AI_IMAGES) : [];
        // 제출 당시 사진 순서를 결과와 함께 고정 ([사진N] 마커와 일치)
        setResult({
          ...json.data,
          topic: req.topic,
          photos: files.map((f) => URL.createObjectURL(f)),
          aiFigures: withFigures,
        });
        setHistory([]);
        setRevMsg(null);
        setBody(json.data.body);
        const seq = ++draftSeq.current;
        setFigures(descs.map((desc) => ({ desc, status: "loading" })));
        descs.forEach((d) => drawFigure(d, headers, seq));
      }
    } catch (err) {
      if (isCurrent(run.id) && !run.signal.aborted) setError({ msg: err instanceof Error ? err.message : "요청 실패" });
    } finally {
      if (isCurrent(run.id)) {
        setLoading(false);
        setLive(null);
      }
    }
  }

  /** 그림 상태를 새 본문의 [그림: 설명]에 맞춤 (설명이 같은 그림은 유지, 새 자리는 "다시 그리기") */
  function remapFigures(newBody: string) {
    const newDescs = [...new Set(figuresOf(newBody))].slice(0, MAX_AI_IMAGES);
    setFigures((prev) => newDescs.map((d) => figureFor(prev, d) ?? { desc: d, status: "error", error: "새 그림 자리예요" }));
  }

  async function revise(instruction: string) {
    if (!result || !instruction.trim() || busy) return;
    if (isByok && !keyOk) {
      setRevMsg({ ok: false, text: "OpenAI API 키를 1번 칸에 입력해 주세요." });
      return;
    }
    setRevising(true);
    setRevMsg(null);
    setLive(null);
    const run = startRun();
    const before = { title: result.title, body, figures };
    try {
      const json = (await fetchStream(
        "/api/studio/revise",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Studio-Request": "1", ...byokHeaders },
          body: JSON.stringify({
            agent,
            title: result.title,
            body,
            instruction,
            topic: result.topic,
            keyword: result.keywords[0] ?? "",
          }),
          signal: run.signal,
        },
        (l) => isCurrent(run.id) && setLive(l),
      )) as {
        success: boolean;
        error: string;
        data: { title: string; body: string; notes: string; changes: string[]; unchanged: boolean };
      };
      if (!isCurrent(run.id)) return;
      if (!json.success) {
        setRevMsg({ ok: false, text: json.error });
        return;
      }
      setHistory((h) => [...h, before]);
      if (result.aiFigures) remapFigures(json.data.body);
      setResult((r) => (r ? { ...r, title: json.data.title } : r));
      setBody(json.data.body);
      setRevText("");
      setChanged(changedLines(before.body, json.data.body));
      setRevMsg(
        json.data.unchanged
          ? { ok: false, text: "요청이 글에 반영되지 않았어요. 어느 부분을 어떻게 바꿀지 조금 더 구체적으로 적어 다시 요청해 주세요." }
          : { ok: true, text: json.data.notes, changes: json.data.changes },
      );
    } catch (err) {
      if (isCurrent(run.id) && !run.signal.aborted) setRevMsg({ ok: false, text: err instanceof Error ? err.message : "요청 실패" });
    } finally {
      if (isCurrent(run.id)) {
        setRevising(false);
        setLive(null);
      }
    }
  }

  function undo() {
    const last = history.at(-1);
    if (!last || !result) return;
    setFigures(last.figures); // 그 시점의 그림 상태 그대로
    setHistory((h) => h.slice(0, -1));
    setResult({ ...result, title: last.title });
    setBody(last.body);
    setChanged(null);
    setRevMsg({ ok: true, text: "이전 글로 되돌렸습니다." });
  }

  function flash(label: string) {
    setCopied(label);
    setTimeout(() => setCopied(""), 1500);
  }

  async function copy(label: string, text: string) {
    await navigator.clipboard.writeText(text);
    flash(label);
  }

  /** 네이버 에디터용: 서식(HTML) + 사진·그림을 함께 클립보드에 (붙여넣기 하면 순서대로 들어감) */
  async function copyForEditor() {
    if (!result) return;
    setCopied("에디터-준비");
    try {
      const photos = await Promise.all(result.photos.map((p) => toDataUrl(p)));
      const figs = figuresOf(body).map((d) => {
        const f = figureFor(figures, d);
        return f?.status === "done" ? f.src : undefined;
      });
      const html = toEditorHtml(body, { photos, figures: figs, center });
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([toPlainText(body)], { type: "text/plain" }),
        }),
      ]);
      flash("에디터");
    } catch {
      // 서식 복사를 지원하지 않는 브라우저 → 텍스트만
      await copy("본문", toPlainText(body));
    }
  }

  /**
   * 사진·그림을 본문에 나오는 순서대로 이름 붙여 ZIP 하나로 저장 (01_사진2.jpg, 02_그림1.jpg …).
   * 네이버 에디터는 붙여넣기로 사진을 받지 않으므로, [사진N] 자리에 같은 번호 파일을 끌어다 놓으면 된다.
   * 본문에 자리가 없는 사진은 뒤에 '추가_사진N'으로 넣는다.
   */
  async function saveImages() {
    if (!result) return;
    setCopied("사진-준비");
    try {
      const files: { name: string; data: Uint8Array }[] = [];
      const used = new Set<number>();
      const extOf = (type: string) => (type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg");
      const add = async (label: string, src: string | undefined) => {
        if (!src) return;
        const blob = await (await fetch(src)).blob();
        files.push({
          name: `${String(files.length + 1).padStart(2, "0")}_${label}.${extOf(blob.type)}`,
          data: new Uint8Array(await blob.arrayBuffer()),
        });
      };
      for (const b of parseBody(body)) {
        if (b.kind === "photo" && !used.has(b.n)) {
          used.add(b.n);
          await add(`사진${b.n}`, result.photos[b.n - 1]);
        } else if (b.kind === "figure") {
          const f = figureFor(figures, b.desc);
          await add(`그림${b.n}`, f?.status === "done" ? f.src : undefined);
        }
      }
      for (let n = 1; n <= result.photos.length; n++) if (!used.has(n)) await add(`추가_사진${n}`, result.photos[n - 1]);
      if (files.length === 0) {
        setCopied("");
        return;
      }
      const url = URL.createObjectURL(makeZip(files));
      const a = document.createElement("a");
      a.href = url;
      a.download = `블로그사진_${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      flash("사진");
    } catch {
      setCopied("");
    }
  }

  const imageCount = result ? result.photos.length + figures.filter((f) => f.status === "done").length : 0;
  const selectedAgent = agents.find((a) => a.id === agent)!;
  const tagText = result?.tags.map((t) => `#${t}`).join(" ") ?? "";

  return (
    <div className="min-h-dvh bg-bg-soft">
      <header className="border-b-[3px] border-hb-blue bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div>
            <p className="font-display text-xl text-hb-navy">블로그 스튜디오</p>
            <p className="text-xs text-ink-soft">사진 + 주제 → 백운밸리점 블로그 스타일 초안</p>
          </div>
          <div className="flex items-center gap-4 text-sm font-bold text-hb-navy">
            <Link href="/studio/report" className="rounded-full bg-bg-soft px-3 py-1.5 ring-1 ring-line">
              📊 분석 리포트
            </Link>
            <Link href="/" className="underline">
              홈페이지
            </Link>
            <form action={logout}>
              <button className="text-ink-soft underline">로그아웃</button>
            </form>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* ── 입력 ── */}
        <form onSubmit={generate}>
          {/* 생성 중에는 입력을 잠가 사진 순서와 [사진N] 마커가 어긋나지 않게 함 */}
          <fieldset disabled={busy} className="space-y-5">
            <Card title="1. 사용할 AI">
              <div className="grid gap-2 sm:grid-cols-3">
                {agents.map((a) => (
                  <label
                    key={a.id}
                    className={`cursor-pointer rounded-xl border-2 p-3 text-sm ${agent === a.id ? "border-hb-navy bg-bg-soft" : "border-line"}`}
                  >
                    <input
                      type="radio"
                      name="agent"
                      className="sr-only"
                      checked={agent === a.id}
                      onChange={() => pickAgent(a.id)}
                    />
                    <p className="font-extrabold">{a.label}</p>
                    <p className="text-xs text-ink-soft">{a.plan}</p>
                  </label>
                ))}
              </div>
              <p className="mt-2 text-xs text-ink-soft">{selectedAgent.loginHelp}</p>
              {isByok && (
                <div className="space-y-2 rounded-xl bg-bg-soft p-3">
                  <label className="block text-sm font-bold">
                    OpenAI API 키
                    <div className="mt-1 flex gap-2">
                      <input
                        type="password"
                        autoComplete="off"
                        spellCheck={false}
                        value={keyInput ?? savedKey ?? ""}
                        onChange={(e) => updateKey(e.target.value)}
                        placeholder="sk-..."
                        className="min-w-0 flex-1 rounded-lg border border-line bg-white px-3 py-2 font-mono text-sm font-normal"
                      />
                      {apiKey && (
                        <button
                          type="button"
                          onClick={() => updateKey("")}
                          className="rounded-lg border border-line bg-white px-3 text-xs font-bold text-ink-soft"
                        >
                          지우기
                        </button>
                      )}
                    </div>
                  </label>
                  <p className={`text-xs ${apiKey && !keyOk ? "text-red-600" : "text-ink-soft"}`}>
                    {apiKey
                      ? keyOk
                        ? "✓ 이 브라우저에 저장됨 (공용 PC라면 다 쓴 뒤 '지우기'를 눌러 주세요)"
                        : "키 형식이 맞지 않습니다. sk-로 시작하는 키 전체를 붙여넣어 주세요."
                      : "키가 없으면 platform.openai.com → API keys 에서 새로 만들 수 있어요."}
                  </p>
                  <label className="block text-sm font-bold">
                    글쓰기 모델
                    <select
                      value={model}
                      onChange={(e) => pickModel(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm font-normal"
                    >
                      {OPENAI_MODELS.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
            </Card>

            <div className="rounded-2xl bg-hb-navy p-5 text-white">
              <p className="font-round text-lg">⚡ 바로 한 편 쓰기</p>
              <p className="mt-1 text-xs leading-5 text-white/80">
                원장님이 따로 적지 않아도, 교습소 수업 방식·과정 같은 <b>확인된 정보</b>와 지금 시기에 맞는 교육
                이야기로 그대로 올릴 수 있는 글을 씁니다. 주제도 AI가 최근 글과 겹치지 않게 정합니다.
              </p>
              {todayPick && (
                <div className="mt-3 rounded-xl bg-white/10 p-3">
                  <p className="text-[11px] font-bold text-hb-yellow">오늘의 맞춤 추천</p>
                  <p className="mt-0.5 font-extrabold">{todayPick.title}</p>
                  <p className="mt-0.5 text-[11px] leading-4 text-white/70">{todayPick.reason}</p>
                  <button
                    type="button"
                    onClick={() =>
                      autoWrite({
                        type: todayPick.type,
                        topic: [todayPick.title, ...todayPick.outline].join("\n"),
                        keywords: todayPick.keywords,
                      })
                    }
                    disabled={busy}
                    className="mt-2 w-full rounded-full bg-hb-yellow py-3 text-sm font-extrabold text-ink disabled:opacity-60"
                  >
                    {loading ? `${selectedAgent.label}가 글을 쓰는 중…` : "⚡ 이 주제로 바로 쓰기"}
                  </button>
                </div>
              )}
              <button
                type="button"
                onClick={() => autoWrite()}
                disabled={busy}
                className={
                  todayPick
                    ? "mt-2 w-full rounded-full border-2 border-white/40 py-2.5 text-sm font-bold text-white disabled:opacity-60"
                    : "mt-3 w-full rounded-full bg-hb-yellow py-3 text-sm font-extrabold text-ink disabled:opacity-60"
                }
              >
                {loading ? `${selectedAgent.label}가 글을 쓰는 중…` : todayPick ? "주제도 AI에게 맡기기" : "⚡ 알아서 한 편 쓰기"}
              </button>
              <p className="mt-2 text-[11px] leading-4 text-white/60">
                성적·인원·이벤트·날짜 같은 사실은 넣지 않습니다. 그런 소식은 아래 3번 칸에 적어서 만들어 주세요.
              </p>
            </div>

            <Planner
              onAuto={(idea) => autoWrite({ type: idea.type, topic: [idea.title, ...idea.outline].join("\n"), keywords: idea.keywords })}
              agent={agent}
              agentLabel={selectedAgent.label}
              postTypes={postTypes}
              onUse={applyIdea}
              headers={byokHeaders}
              blocked={isByok && !keyOk ? "OpenAI API 키를 1번 칸에 먼저 입력해 주세요." : ""}
            />

            <Card title="2. 글 유형">
              <div className="grid gap-2 sm:grid-cols-2">
                {postTypes.map((t) => (
                  <button
                    type="button"
                    key={t.id}
                    onClick={() => setTypeId(t.id)}
                    className={`rounded-xl border-2 p-3 text-left text-sm ${typeId === t.id ? "border-hb-navy bg-bg-soft" : "border-line"}`}
                  >
                    <p className="font-extrabold">
                      {t.emoji} {t.label}
                    </p>
                    <p className="text-xs text-ink-soft">{t.description}</p>
                  </button>
                ))}
              </div>
            </Card>

            <Card title="3. 주제 및 내용 · 요청사항">
              {ideas.length > 0 && (
                <div className="rounded-xl bg-bg-soft p-3">
                  <p className="text-sm font-bold text-hb-navy">💡 추천 주제 — 누르면 아래 칸이 채워져요</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {ideas.map((idea) => (
                      <button
                        key={idea.id}
                        type="button"
                        aria-pressed={pickedIdea?.id === idea.id}
                        onClick={() => {
                          setIdeaPicked(idea.id);
                          applyIdea(idea);
                        }}
                        className={`rounded-full border px-3 py-1.5 text-left text-[13px] font-bold transition ${
                          pickedIdea?.id === idea.id
                            ? "border-hb-navy bg-hb-navy text-white"
                            : "border-line bg-white text-ink hover:border-hb-blue"
                        }`}
                      >
                        {postTypes.find((t) => t.id === idea.type)?.emoji} {idea.title}
                      </button>
                    ))}
                  </div>
                  {(() => {
                    const cur = pickedIdea;
                    return (
                      <p className="mt-2 text-xs leading-5 text-ink-soft">
                        {cur
                          ? `${cur.reason}${cur.needs.length ? " · 아래 [실제 사실] 칸을 채우면 그 내용만 글에 들어갑니다." : ""}`
                          : "다가오는 학사 시기와 블로그에 오래 안 올라온 글 종류를 보고 골랐습니다."}
                      </p>
                    );
                  })()}
                </div>
              )}
              <Input
                id="topic-input"
                label="무엇에 대한 글인지, 넣고 싶은 내용과 요청사항을 자유롭게 적어 주세요"
                required
                long
                value={topic}
                onChange={setTopic}
                placeholder={`예) ${type.fields
                  .map((f) => f.placeholder)
                  .filter(Boolean)
                  .join(", ")}\n분위기는 밝고 따뜻하게 써 주세요.`}
              />
              <p className="text-xs text-amber-700">
                ⚠️ 점수·인원·학생 말처럼 사실이 필요한 내용은 여기에 적은 것만 글에 들어갑니다.
              </p>
              <details className="rounded-lg border border-line px-3 py-2">
                <summary className="cursor-pointer text-sm font-bold text-hb-navy">
                  검색 키워드 (선택) · 지금: {selectedKeywords.join(", ")}
                </summary>
                <div className="mt-3">
                  <KeywordPicker groups={keywordGroups} selected={selectedKeywords} onChange={setKwPicked} />
                </div>
              </details>
            </Card>

            <Card title="4. 사진 (최대 6장, 블로그에 올릴 순서대로)">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                onChange={(e) => setFiles([...files, ...Array.from(e.target.files ?? [])].slice(0, 6))}
                className="block w-full text-sm"
              />
              {files.length > 0 && (
                <ul className="mt-3 grid grid-cols-3 gap-2">
                  {files.map((f, i) => (
                    <li key={previews[i]} className="relative overflow-hidden rounded-lg bg-white ring-1 ring-line">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={previews[i]} alt="" className="aspect-square w-full object-cover" />
                      <span className="absolute left-1 top-1 rounded bg-hb-navy px-1.5 text-xs font-bold text-white">
                        사진{i + 1}
                      </span>
                      <div className="flex justify-between bg-white px-1 py-0.5 text-xs">
                        <button type="button" onClick={() => move(i, -1)} aria-label="앞으로">
                          ◀
                        </button>
                        <button
                          type="button"
                          onClick={() => setFiles(files.filter((_, k) => k !== i))}
                          className="text-red-600"
                        >
                          삭제
                        </button>
                        <button type="button" onClick={() => move(i, 1)} aria-label="뒤로">
                          ▶
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {files.length > 0 && (
                <label className="mt-3 flex gap-2 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    학생 얼굴·이름·학교명·성적표 개인정보를 <b>미리 가렸고</b>, 홍보 게시에 대한 <b>보호자 동의</b>를
                    받았습니다. (사진은 선택한 AI 회사로 전송됩니다)
                  </span>
                </label>
              )}
              {isByok && (
                <label className="mt-3 flex gap-2 rounded-lg bg-bg-soft p-3 text-xs leading-5">
                  <input
                    type="checkbox"
                    checked={aiImages}
                    onChange={(e) => setAiImages(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    <b className="text-hb-navy">🎨 글 중간에 AI 그림 넣기 (최대 {MAX_AI_IMAGES}장)</b>
                    <br />
                    내용을 설명하는 일러스트를 그려 본문 사이에 넣습니다. 실제 수업 사진처럼 보이는 그림은 그리지
                    않습니다. 그림 1장마다 OpenAI 이미지 요금이 따로 듭니다.
                  </span>
                </label>
              )}
            </Card>

            <button
              disabled={busy}
              className="w-full rounded-full bg-hb-navy py-4 text-lg font-extrabold text-white shadow-[0_4px_0_#00317a] disabled:opacity-60"
            >
              {loading ? `${selectedAgent.label}가 글을 쓰는 중… (1~3분)` : "✍️ 초안 만들기"}
            </button>
          </fieldset>
        </form>

        {/* ── 결과 ── */}
        <section id="result" className="scroll-mt-4 lg:sticky lg:top-4 lg:self-start">
          {loading && !result && (
            <div className="space-y-2" aria-live="polite">
              <p className="rounded-xl bg-hb-navy px-4 py-2 text-xs font-bold text-white">
                ✍️ {selectedAgent.label}가 쓰는 중…{" "}
                {live?.body ? `${live.body.replace(/\*\*/g, "").length}자` : "글 구성을 준비하고 있어요"}
              </p>
              {live?.body ? (
                <Preview title={live.title} body={live.body} photos={[]} figures={[]} center={center} view={view} />
              ) : (
                <div className="grid min-h-60 place-items-center rounded-2xl bg-white p-8 text-sm text-ink-soft ring-1 ring-line">
                  <span className="animate-pulse">곧 글이 나타납니다…</span>
                </div>
              )}
            </div>
          )}
          {!result && !error && !loading && (
            <div className="grid min-h-80 place-items-center rounded-2xl border-2 border-dashed border-line bg-white p-8 text-center text-sm text-ink-soft">
              왼쪽을 채우고 &lsquo;초안 만들기&rsquo;를 누르면
              <br />
              여기에 블로그 글이 나타납니다.
            </div>
          )}
          {error && (
            <div className="rounded-2xl bg-red-50 p-5 text-sm text-red-800 ring-1 ring-red-200">
              <p className="font-bold">생성 실패</p>
              <p className="mt-1 whitespace-pre-wrap">{error.msg}</p>
              {error.raw && <pre className="mt-3 max-h-60 overflow-auto whitespace-pre-wrap text-xs">{error.raw}</pre>}
            </div>
          )}
          {result && (
            <div className="space-y-4">
              {result.auto && (
                <p className="rounded-xl bg-hb-navy px-4 py-2 text-xs font-bold text-white">
                  ⚡ 자동 글 — 확인된 교습소 정보와 일반 교육 이야기로만 썼습니다. 한 번 읽어 보고 바로 올리셔도 됩니다.
                </p>
              )}
              {result.notes && (
                <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
                  <b>확인해 주세요:</b> {result.notes}
                </div>
              )}
              <Out label="제목" onCopy={() => copy("제목", result.title)} copied={copied === "제목"}>
                <p className="font-extrabold">{result.title}</p>
              </Out>
              <div className="rounded-xl bg-white p-4 ring-1 ring-line">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-bold text-ink-soft">본문</p>
                  <div className="flex gap-1 rounded-full bg-bg-soft p-1 text-xs font-bold">
                    <button
                      type="button"
                      onClick={() => setEditText(false)}
                      className={`rounded-full px-3 py-1 ${!editText ? "bg-white text-hb-navy shadow" : "text-ink-soft"}`}
                    >
                      미리보기
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditText(true)}
                      className={`rounded-full px-3 py-1 ${editText ? "bg-white text-hb-navy shadow" : "text-ink-soft"}`}
                    >
                      글 고치기
                    </button>
                  </div>
                </div>
                {editText ? (
                  <>
                    <textarea
                      value={body}
                      onChange={(e) => {
                        setBody(e.target.value);
                        setChanged(null);
                      }}
                      readOnly={revising}
                      className="h-[30rem] w-full resize-y rounded-lg border border-line p-3 text-[14px] leading-6"
                    />
                    <p className="mt-1 text-xs text-ink-soft">
                      <code>## </code> 소제목 · <code>&gt; </code> 인용 · <code>**키워드**</code> 강조색 · <code>[사진N]</code>{" "}
                      <code>[그림: …]</code> 이미지 자리
                    </p>
                  </>
                ) : (
                  <>
                    <div className="mb-2 flex items-center justify-between text-xs">
                      <p className="text-ink-soft">네이버 블로그에 올렸을 때 모습</p>
                      <div className="flex gap-1 rounded-full bg-bg-soft p-0.5 font-bold">
                        {(["mobile", "pc"] as const).map((v) => (
                          <button
                            key={v}
                            type="button"
                            aria-pressed={view === v}
                            onClick={() => setView(v)}
                            className={`rounded-full px-2.5 py-0.5 ${view === v ? "bg-white text-hb-navy shadow" : "text-ink-soft"}`}
                          >
                            {v === "mobile" ? "📱 모바일" : "💻 PC"}
                          </button>
                        ))}
                      </div>
                    </div>
                    {revising && (
                      <p className="mb-2 rounded-lg bg-hb-blue px-3 py-1.5 text-xs font-bold text-white" aria-live="polite">
                        ✏️ 고치는 중… {live?.body ? "고친 글이 아래에 나타나고 있어요" : "요청을 읽고 있어요"}
                      </p>
                    )}
                    <Preview
                      title={revising && live?.title ? live.title : result.title}
                      body={revising && live?.body ? live.body : body}
                      photos={result.photos}
                      figures={figures}
                      center={center}
                      view={view}
                      changed={revising ? undefined : (changed ?? undefined)}
                    />
                    {changed && changed.size > 0 && !revising && (
                      <p className="mt-1.5 flex items-center justify-between text-xs text-ink-soft">
                        <span>
                          <span className="mr-1 inline-block h-3 w-3 rounded-sm bg-[#fff3b0] align-middle ring-1 ring-amber-300" />
                          방금 고친 줄 {changed.size}곳
                        </span>
                        <button type="button" onClick={() => setChanged(null)} className="underline">
                          표시 지우기
                        </button>
                      </p>
                    )}
                  </>
                )}
                <div className="mt-4 space-y-2">
                  <button
                    type="button"
                    onClick={copyForEditor}
                    disabled={copied === "에디터-준비"}
                    className="w-full rounded-full bg-hb-navy py-3 text-sm font-extrabold text-white disabled:opacity-60"
                  >
                    {copied === "에디터"
                      ? "복사됨 ✓ 네이버 글쓰기 본문에 붙여넣기(Ctrl+V) 하세요"
                      : copied === "에디터-준비"
                        ? "사진 준비 중…"
                        : "📋 네이버 에디터용 복사 (글자 서식 포함)"}
                  </button>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <label className="flex items-center gap-1.5 text-ink-soft">
                      <input type="checkbox" checked={center} onChange={(e) => setCenter(e.target.checked)} />
                      가운데 정렬로 복사
                    </label>
                    <button type="button" onClick={() => copy("본문", toPlainText(body))} className="font-bold text-hb-navy underline">
                      {copied === "본문" ? "복사됨 ✓" : "텍스트만 복사"}
                    </button>
                  </div>
                  {imageCount > 0 && (
                    <button
                      type="button"
                      onClick={saveImages}
                      disabled={copied === "사진-준비"}
                      className="w-full rounded-full border-2 border-hb-navy bg-white py-2.5 text-sm font-extrabold text-hb-navy disabled:opacity-60"
                    >
                      {copied === "사진"
                        ? "저장됨 ✓ 압축을 풀고 [사진N] 자리에 같은 번호 파일을 끌어다 놓으세요"
                        : copied === "사진-준비"
                          ? "사진 묶는 중…"
                          : `📦 사진·그림 ${imageCount}장 한 번에 저장 (본문 순서대로 번호)`}
                    </button>
                  )}
                  {figures.some((f) => f.status === "loading") && (
                    <p className="text-xs text-hb-blue">🎨 그림을 그리는 중입니다 (1장에 30초~1분). 다 그려진 뒤 복사하면 그림도 함께 들어갑니다.</p>
                  )}
                </div>
                <details className="mt-3 rounded-lg bg-bg-soft px-3 py-2 text-xs leading-5" open>
                  <summary className="cursor-pointer font-bold text-hb-navy">✅ 네이버에 올리기 전 체크리스트</summary>
                  <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-ink">
                    <li>네이버 글쓰기에서 제목을 붙여넣고, 본문을 클릭한 뒤 붙여넣기(Ctrl+V)</li>
                    <li>
                      글이 왼쪽으로 붙었다면: 본문 클릭 → <b>Ctrl+A</b>(전체 선택) → 위쪽 <b>가운데 정렬</b> 버튼
                    </li>
                    {(result.photos.length > 0 || figuresOf(body).length > 0) && (
                      <li>
                        사진: <b>📦 한 번에 저장</b> → 압축 풀기 → 에디터의 <b>[사진N]</b> 글자 자리에 같은 번호 파일을 끌어다
                        놓고, [사진N] 글자는 지우기
                      </li>
                    )}
                    <li>
                      위치: 위쪽 <b>장소</b> 버튼 → &lsquo;스마트해법영어 백운밸리점&rsquo; 검색 → 추가 (원장님 글처럼 맨 아래에)
                    </li>
                    <li>
                      태그: 아래 <b>태그 복사</b> → 글 아래 태그 칸에 붙여넣기
                    </li>
                  </ol>
                  <p className="mt-1.5 text-ink-soft">
                    정렬·사진이 매번 풀린다면{" "}
                    <Link href="/studio/paste-test" className="font-bold text-hb-navy underline">
                      붙여넣기 시험
                    </Link>
                    에서 어떤 방식이 되는지 확인해 알려 주세요. 그 방식으로 맞춰 드립니다.
                  </p>
                </details>
                <p className="mt-3 text-xs leading-5 text-ink-soft">
                  {result.photos.length > 0 && !result.imagesSeen && "이 AI는 사진을 보지 못해 위치만 표시했습니다."}
                  <br />
                  {result.examplesUsed > 1
                    ? "✍️ 원장님 대표 글 + 블로그 최근 글의 문체를 참고했습니다."
                    : result.examplesUsed === 1
                      ? "✍️ 원장님 대표 글의 문체를 참고했습니다. (최근 글은 불러오지 못함)"
                      : "✍️ 기본 문체 예시로 썼습니다."}
                </p>
              </div>
              <div className="rounded-xl bg-white p-4 ring-1 ring-line">
                <p className="mb-2 text-sm font-bold text-ink-soft">✏️ 고쳐 달라고 하기</p>
                <textarea
                  value={revText}
                  onChange={(e) => setRevText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !busy) revise(revText);
                  }}
                  rows={3}
                  disabled={busy}
                  placeholder={"예) 두 번째 소제목 내용을 더 짧게 줄여 주세요\n예) 마지막에 '12월 첫째 주 개강' 문장을 넣어 주세요"}
                  className="w-full rounded-lg border border-line p-3 text-sm leading-6"
                />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {REVISE_PRESETS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      disabled={busy}
                      onClick={() => setRevText(p)}
                      className="rounded-full border border-line px-3 py-1 text-xs font-bold text-ink-soft hover:border-hb-blue disabled:opacity-50"
                    >
                      {p}
                    </button>
                  ))}
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => revise(revText)}
                    disabled={busy || !revText.trim()}
                    className="flex-1 rounded-full bg-hb-blue py-2.5 text-sm font-extrabold text-white disabled:opacity-50"
                  >
                    {revising ? `${selectedAgent.label}가 고치는 중… (30초~1분)` : "수정하기"}
                  </button>
                  {history.length > 0 && (
                    <button
                      type="button"
                      onClick={undo}
                      disabled={busy}
                      className="rounded-full border-2 border-line px-4 text-sm font-bold text-ink-soft disabled:opacity-50"
                    >
                      ↩ 되돌리기
                    </button>
                  )}
                </div>
                {revMsg && (
                  <p
                    className={`mt-2 rounded-lg p-2.5 text-xs leading-5 ${revMsg.ok ? "bg-amber-50 text-amber-900" : "bg-red-50 text-red-800"}`}
                  >
                    {revMsg.ok && revMsg.changes?.length ? (
                      <>
                        <b>✓ 이렇게 고쳤어요</b>
                        {revMsg.changes.map((c) => (
                          <span key={c} className="block">
                            · {c}
                          </span>
                        ))}
                        {revMsg.text && <span className="mt-1 block">확인해 주세요: {revMsg.text}</span>}
                      </>
                    ) : (
                      <>
                        {revMsg.ok ? "✓ " : ""}
                        {revMsg.text || (revMsg.ok ? "고쳤습니다." : "")}
                      </>
                    )}
                  </p>
                )}
                <p className="mt-2 text-xs text-ink-soft">
                  요청한 부분만 고치고 나머지는 그대로 둡니다. 새 날짜·인원·비용은 요청에 적은 것만 들어갑니다.
                </p>
              </div>
              {(result.aiFigures || figures.length > 0) && figuresOf(body).length > 0 && (
                <div className="rounded-xl bg-white p-4 ring-1 ring-line">
                  <p className="mb-2 text-sm font-bold">🎨 AI 그림</p>
                  <div className="grid grid-cols-2 gap-3">
                    {[...new Set(figuresOf(body))].slice(0, MAX_AI_IMAGES).map((desc, i) => {
                      const f: FigureState = figureFor(figures, desc) ?? { desc, status: "error", error: "새 그림 자리예요" };
                      return (
                        <figure key={i} className="text-xs">
                          {f.status === "done" ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={f.src} alt={desc} className="aspect-[3/2] w-full rounded object-cover" />
                          ) : (
                            <div className="grid aspect-[3/2] place-items-center rounded bg-bg-soft p-2 text-center text-ink-soft">
                              {f.status === "loading" ? "그리는 중…" : (f.error ?? "실패")}
                            </div>
                          )}
                          <figcaption className="mt-1 flex items-center justify-between gap-1">
                            <span className="font-bold">그림{i + 1}</span>
                            {f.status === "done" ? (
                              <a href={f.src} download={`그림${i + 1}.jpg`} className="text-hb-navy underline">
                                저장
                              </a>
                            ) : f.status === "error" && desc ? (
                              <button
                                type="button"
                                onClick={() => {
                                  if (!figureFor(figures, desc)) setFigures((prev) => [...prev, { desc, status: "loading" }]);
                                  drawFigure(desc, byokHeaders);
                                }}
                                className="text-hb-navy underline"
                              >
                                다시 그리기
                              </button>
                            ) : null}
                          </figcaption>
                        </figure>
                      );
                    })}
                  </div>
                </div>
              )}
              <Out
                label={`태그 ${result.tags.length}개`}
                onCopy={() => copy("태그", tagText)}
                copied={copied === "태그"}
              >
                <p className="text-sm leading-6 text-hb-blue">{tagText}</p>
              </Out>
              {result.photos.length > 0 && (
                <div className="rounded-xl bg-white p-4 ring-1 ring-line">
                  <p className="mb-2 text-sm font-bold">사진 순서 (초안 생성 당시)</p>
                  <div className="flex flex-wrap gap-2">
                    {result.photos.map((p, i) => (
                      <figure key={p} className="w-20 text-center text-xs">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p} alt="" className="aspect-square w-20 rounded object-cover" />
                        사진{i + 1}
                      </figure>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3 rounded-2xl bg-white p-5 ring-1 ring-line">
      <legend className="float-left mb-1 w-full font-round text-lg text-hb-navy">{title}</legend>
      <div className="clear-both space-y-3">{children}</div>
    </fieldset>
  );
}

function Input({
  id,
  label,
  value,
  onChange,
  placeholder,
  required,
  long,
}: {
  id?: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  long?: boolean;
}) {
  const cls = "mt-1 w-full rounded-lg border border-line px-3 py-2 font-normal";
  return (
    <label className="block text-sm font-bold">
      {label} {required && <span className="text-red-500">*</span>}
      {long ? (
        <textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          rows={7}
          className={cls}
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          className={cls}
        />
      )}
    </label>
  );
}

function Out({
  label,
  children,
  onCopy,
  copied,
}: {
  label: string;
  children: React.ReactNode;
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <div className="rounded-xl bg-white p-4 ring-1 ring-line">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-bold text-ink-soft">{label}</p>
        <button
          type="button"
          onClick={onCopy}
          className="rounded-full bg-hb-navy px-3 py-1 text-xs font-bold text-white"
        >
          {copied ? "복사됨 ✓" : "복사"}
        </button>
      </div>
      {children}
    </div>
  );
}

const MAX_KW = 12;

/** 키워드 다중 선택: 첫 번째가 대표(제목 괄호), 나머지는 태그·본문용 */
function KeywordPicker({
  groups,
  selected,
  onChange,
}: {
  groups: { label: string; items: string[] }[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [custom, setCustom] = useState("");
  const known = new Set(groups.flatMap((g) => g.items));
  const customs = selected.filter((k) => !known.has(k));

  function toggle(k: string) {
    if (selected.includes(k)) onChange(selected.filter((x) => x !== k));
    else if (selected.length < MAX_KW) onChange([...selected, k]);
  }
  function makePrimary(k: string) {
    onChange([k, ...selected.filter((x) => x !== k)]);
  }
  function addCustom() {
    const v = custom
      .replace(/[[\]#<>{}"]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 20);
    if (v && !selected.includes(v) && selected.length < MAX_KW) onChange([...selected, v]);
    setCustom("");
  }

  const chip = (k: string) => {
    const on = selected.includes(k);
    const primary = selected[0] === k;
    return (
      <button
        type="button"
        key={k}
        onClick={() => toggle(k)}
        className={`rounded-full border px-3 py-1 text-[13px] font-bold transition ${
          primary
            ? "border-hb-navy bg-hb-navy text-white"
            : on
              ? "border-hb-blue bg-bg-soft text-hb-navy"
              : "border-line bg-white text-ink-soft hover:border-hb-blue"
        }`}
      >
        {primary && "★ "}
        {k}
      </button>
    );
  };

  return (
    <div className="text-sm">
      <div className="flex items-baseline justify-between">
        <p className="font-bold">검색 키워드 (여러 개 선택)</p>
        <p className="text-xs text-ink-soft">
          {selected.length}/{MAX_KW}
        </p>
      </div>
      <div className="mt-2 space-y-2.5">
        {groups.map((g) => (
          <div key={g.label}>
            <p className="mb-1 text-xs text-ink-soft">{g.label}</p>
            <div className="flex flex-wrap gap-1.5">{g.items.map(chip)}</div>
          </div>
        ))}
        {customs.length > 0 && (
          <div>
            <p className="mb-1 text-xs text-ink-soft">직접 추가</p>
            <div className="flex flex-wrap gap-1.5">{customs.map(chip)}</div>
          </div>
        )}
        <div className="flex gap-2">
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                addCustom();
              }
            }}
            placeholder="키워드 직접 입력 (예: 의왕 초등 영어)"
            className="min-w-0 flex-1 rounded-lg border border-line px-3 py-1.5"
          />
          <button type="button" onClick={addCustom} className="rounded-lg bg-hb-blue px-3 text-xs font-bold text-white">
            추가
          </button>
        </div>
      </div>
      {selected.length > 0 && (
        <div className="mt-3 rounded-lg bg-bg-soft p-3 text-xs leading-5">
          <p>
            <b className="text-hb-navy">★ 대표: {selected[0]}</b> → 제목 끝 <code>[{selected[0]}]</code>
          </p>
          {selected.length > 1 && (
            <p className="mt-1 text-ink-soft">
              나머지 {selected.length - 1}개는 태그로 들어가고, 본문에도 자연스러운 곳에 녹입니다. 대표 바꾸기:{" "}
              {selected.slice(1).map((k) => (
                <button key={k} type="button" onClick={() => makePrimary(k)} className="mr-1.5 underline">
                  {k}
                </button>
              ))}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

type PlanResult = Plan & { context: { postsAnalyzed: number; last30: number; seasons: string[]; types: TypeStat[] } };

/** 콘텐츠 플래너: 시기·블로그 현황을 보고 이번 주 글 3개 추천 → 고르면 아래 칸이 채워짐 */
function Planner({
  onAuto,
  agent,
  agentLabel,
  postTypes,
  onUse,
  headers,
  blocked,
}: {
  agent: string;
  agentLabel: string;
  postTypes: PostType[];
  onUse: (idea: PlanIdea) => void;
  /** 이 주제로 자동 글 바로 쓰기 (원장님 입력 없이) */
  onAuto: (idea: PlanIdea) => void;
  headers: Record<string, string>;
  /** 비어 있지 않으면 추천을 막고 이 안내를 보여 줌 (예: API 키 없음) */
  blocked: string;
}) {
  const [memo, setMemo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [plan, setPlan] = useState<PlanResult | null>(null);
  const [used, setUsed] = useState<number | null>(null);

  async function run() {
    if (blocked) {
      setError(blocked);
      return;
    }
    setLoading(true);
    setError("");
    setUsed(null);
    try {
      const res = await fetch("/api/studio/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Studio-Request": "1", ...headers },
        body: JSON.stringify({ agent, memo }),
      });
      const json = await res.json();
      if (json.success) setPlan(json.data);
      else setError(json.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : "요청 실패");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card title="✨ 이번 주 뭐 쓸까? (선택)">
      <p className="text-xs leading-5 text-ink-soft">
        다가오는 시기(시험·방학·행사)와 블로그 최근 글을 AI가 살펴보고, 이번 주에 올리면 좋을 글 3개를
        추천합니다. ⚡ 바로 쓰기는 입력 없이 바로, 정보 채워서 쓰기는 아래 칸이 채워집니다.
      </p>
      <Input
        label="이번 주 상황 (선택)"
        value={memo}
        onChange={setMemo}
        placeholder="예) 다음 주부터 기말고사 대비 시작, 겨울방학 특강 모집 예정"
      />
      <button
        type="button"
        onClick={run}
        disabled={loading}
        className="w-full rounded-full border-2 border-hb-navy bg-white py-2.5 text-sm font-extrabold text-hb-navy disabled:opacity-60"
      >
        {loading ? `${agentLabel}가 블로그를 살펴보는 중…` : plan ? "🔄 다시 추천 받기" : "💡 글 추천 받기"}
      </button>
      {error && <p className="rounded-lg bg-red-50 p-3 text-xs text-red-800 ring-1 ring-red-200">{error}</p>}
      {plan && (
        <div className="space-y-3">
          <div className="rounded-lg bg-bg-soft p-3 text-xs leading-5">
            <p className="font-bold text-hb-navy">
              📊 블로그 최근 글 {plan.context.postsAnalyzed}편 분석 · 최근 30일 {plan.context.last30}편
            </p>
            {plan.context.seasons.length > 0 && <p className="mt-1">📅 다가오는 시기: {plan.context.seasons.join(", ")}</p>}
            <p className="mt-1 text-ink-soft">
              {plan.context.types
                .map((t) => `${t.emoji} ${t.label.split(" · ")[0]} ${t.daysAgo === null ? "없음" : `${t.daysAgo}일 전`}`)
                .join("  ·  ")}
            </p>
          </div>
          {plan.summary && <p className="text-sm font-bold leading-6">{plan.summary}</p>}
          {plan.ideas.map((idea, i) => {
            const t = postTypes.find((p) => p.id === idea.type);
            return (
              <div key={i} className={`rounded-xl border-2 p-4 ${used === i ? "border-hb-blue bg-bg-soft" : "border-line"}`}>
                <p className="text-xs font-bold text-hb-blue">
                  {t?.emoji} {t?.label}
                </p>
                <p className="mt-1 font-extrabold">{idea.title}</p>
                <p className="mt-1 text-xs leading-5 text-ink-soft">💬 {idea.reason}</p>
                {idea.outline.length > 0 && (
                  <ul className="mt-2 list-disc space-y-0.5 pl-5 text-[13px] leading-5">
                    {idea.outline.map((o) => (
                      <li key={o}>{o}</li>
                    ))}
                  </ul>
                )}
                {idea.needs.length > 0 && (
                  <p className="mt-2 rounded bg-amber-50 px-2 py-1 text-xs leading-5 text-amber-900">
                    ✏️ 채우면 더 좋아지는 내용: {idea.needs.join(" / ")}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onAuto(idea)}
                    className="rounded-full bg-hb-yellow px-4 py-1.5 text-xs font-extrabold text-ink"
                  >
                    ⚡ 바로 쓰기
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setUsed(i);
                      onUse(idea);
                    }}
                    className="rounded-full bg-hb-navy px-4 py-1.5 text-xs font-bold text-white"
                  >
                    {used === i ? "✓ 아래에 채웠어요" : "정보 채워서 쓰기 ↓"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

/** 핵심 키워드(**…**)를 블로그처럼 굵은 강조색으로 */
function Spans({ spans, strong }: { spans: Span[]; strong?: string }) {
  return (
    <>
      {spans.map((s, k) =>
        s.key ? (
          <b key={k} style={{ color: BLOG_STYLE.keywordColor }}>
            {s.text}
          </b>
        ) : strong ? (
          <b key={k} style={{ color: strong }}>
            {s.text}
          </b>
        ) : (
          <span key={k}>{s.text}</span>
        ),
      )}
    </>
  );
}

/**
 * 네이버 블로그처럼 보이는 미리보기: 원장님 블로그 실제 서식(blog-style.ts)과 같은 글꼴 크기·색·정렬,
 * 모바일(375px)·PC(693px, 스마트에디터 본문 폭) 두 가지 폭.
 */
function Preview({
  title,
  body,
  photos,
  figures,
  center,
  view,
  changed,
}: {
  title: string;
  body: string;
  photos: string[];
  figures: FigureState[];
  center: boolean;
  view: "mobile" | "pc";
  /** 방금 고친 줄 번호 (노란 배경) */
  changed?: Set<number>;
}) {
  const S = BLOG_STYLE;
  return (
    <div className="max-h-[40rem] overflow-auto rounded-lg bg-[#f5f6f8] p-3">
      <article
        className="mx-auto bg-white shadow-sm ring-1 ring-black/5"
        style={{
          // PC는 스마트에디터 본문 폭 그대로(좁은 화면에서는 가로 스크롤), 모바일은 최대 375px
          ...(view === "mobile" ? { maxWidth: 375 } : { width: 693 + 64, minWidth: 693 + 64 }),
          fontFamily: '-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif',
        }}
      >
        <header className={`border-b border-[#ebebeb] ${view === "mobile" ? "px-4 pb-4 pt-5" : "px-8 pb-6 pt-8"}`}>
          <p className="text-[13px] text-[#00c73c]">스마트해법영어 백운밸리점</p>
          <h3 className={`mt-2 font-bold leading-snug text-[#222] ${view === "mobile" ? "text-[20px]" : "text-[26px]"}`}>
            {title || "제목"}
          </h3>
          <p className="mt-3 text-[12px] text-[#999]">sukjoon331 · 방금 전</p>
        </header>
        <div
          className={view === "mobile" ? "px-4 py-6" : "px-8 py-8"}
          style={{ fontSize: S.fontSize, lineHeight: S.lineHeight, color: S.bodyColor, textAlign: center ? "center" : "left" }}
        >
          {parseBody(body).map((b, i) => {
            const el = renderBlock(b, i);
            return changed?.has(i) ? (
              <div key={i} className="rounded-sm bg-[#fff3b0]">
                {el}
              </div>
            ) : (
              el
            );
          })}
        </div>
      </article>
    </div>
  );

  function renderBlock(b: ReturnType<typeof parseBody>[number], i: number) {
    switch (b.kind) {
      case "blank":
        return <div key={i} style={{ height: `${S.lineHeight}em` }} />;
      case "heading":
        return (
          <p key={i}>
            <b style={{ color: S.headingColor }}>{b.text}</b>
          </p>
        );
      case "quote":
        return (
          <p key={i}>
            <Spans spans={b.spans} strong={S.strongColor} />
          </p>
        );
      case "photo": {
        const src = photos[b.n - 1];
        return src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={i} src={src} alt={`사진${b.n}`} className="my-3 inline-block w-full" />
        ) : (
          <p key={i} className="my-2 rounded bg-bg-soft py-6 text-center text-xs font-bold text-ink-soft">
            [사진{b.n}] 자리
          </p>
        );
      }
      case "figure": {
        const f = figureFor(figures, b.desc);
        return f?.status === "done" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={i} src={f.src} alt={b.desc} className="my-3 inline-block w-full" />
        ) : (
          <p key={i} className="my-2 rounded border border-dashed border-hb-blue py-4 text-center text-xs text-hb-blue">
            🎨 그림{b.n} {f?.status === "loading" ? "그리는 중…" : ""} — {b.desc}
          </p>
        );
      }
      default:
        if (b.role === "greeting-name") {
          return (
            <p key={i}>
              <b style={{ color: S.nameColor }}>스마트해법영어 백운밸리점</b>
              {b.text.replace(/^스마트해법영어 백운밸리점/, "")}
            </p>
          );
        }
        return (
          <p key={i}>
            <Spans spans={b.spans} strong={b.role ? S.strongColor : undefined} />
          </p>
        );
    }
  }
}

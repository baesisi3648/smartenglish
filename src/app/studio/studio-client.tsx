"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import type { PostType } from "@/studio/post-types";
import type { Plan, PlanIdea, TypeStat } from "@/studio/planner";
import { figuresOf, parseBody, toEditorHtml, toPlainText } from "@/studio/format";
import { DEFAULT_OPENAI_MODEL, MAX_AI_IMAGES, OPENAI_KEY_PATTERN, OPENAI_MODELS } from "@/studio/openai-models";

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

type FigureState = { status: "loading" | "done" | "error"; src?: string; error?: string };

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
};

const AGENT_KEY = "hb-studio-agent";

export default function StudioClient({
  agents,
  postTypes,
  keywordGroups,
  openaiServerKey,
  logout,
}: {
  agents: AgentInfo[];
  postTypes: PostType[];
  keywordGroups: { label: string; items: string[] }[];
  /** 서버 환경변수(OPENAI_API_KEY)에 키가 있음 → 화면에 키를 안 넣어도 GPT 사용 가능 (키 값은 화면에 오지 않음) */
  openaiServerKey: boolean;
  logout: () => Promise<void>;
}) {
  const saved = useSyncExternalStore(noopSubscribe, () => readLocal(AGENT_KEY), () => null);
  const [picked, setPicked] = useState<string | null>(null);
  // 기본: PC에서는 ChatGPT(구독), 웹에서는 GPT(내 API 키)
  const fallback = agents.find((a) => a.id === "chatgpt")?.id ?? agents.find((a) => a.id === "openai")?.id ?? agents[0].id;
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
  // 화면 키가 있으면 그 키, 없으면 서버 키 (헤더에 키를 빼면 서버가 env 키를 씀)
  const canUseGpt = keyOk || (!apiKey && openaiServerKey);
  const byokHeaders: Record<string, string> = isByok
    ? { "X-OpenAI-Model": model, ...(apiKey ? { "X-OpenAI-Key": apiKey } : {}) }
    : {};
  const [aiImages, setAiImages] = useState(false);
  const [figures, setFigures] = useState<FigureState[]>([]);
  const [editText, setEditText] = useState(false);
  const [center, setCenter] = useState(false);
  const [typeId, setTypeId] = useState(postTypes[0].id);
  // null = 아직 고르지 않음 → 글 유형의 기본 키워드 사용
  const [kwPicked, setKwPicked] = useState<string[] | null>(null);
  const [topic, setTopic] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ msg: string; raw?: string } | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [body, setBody] = useState("");
  const [copied, setCopied] = useState("");

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
  async function drawFigure(i: number, desc: string, headers: Record<string, string>) {
    setFigures((prev) => prev.map((f, k) => (k === i ? { status: "loading" } : f)));
    try {
      const res = await fetch("/api/studio/images", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Studio-Request": "1", ...headers },
        body: JSON.stringify({ description: desc }),
      });
      const json = await res.json();
      setFigures((prev) =>
        prev.map((f, k) =>
          k === i ? (json.success ? { status: "done", src: json.data.image } : { status: "error", error: json.error }) : f,
        ),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "요청 실패";
      setFigures((prev) => prev.map((f, k) => (k === i ? { status: "error", error: msg } : f)));
    }
  }

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    if (isByok && !canUseGpt) {
      setError({ msg: "OpenAI API 키(sk-로 시작)를 1번 칸에 입력해 주세요." });
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    setFigures([]);
    setEditText(false);
    const headers = byokHeaders; // 생성 도중 키를 바꿔도 그림은 같은 키로
    const fd = new FormData();
    fd.set("agent", agent);
    fd.set("type", typeId);
    fd.set("topic", topic);
    selectedKeywords.forEach((k) => fd.append("keywords", k));
    fd.set("consent", consent ? "yes" : "no");
    fd.set("aiImages", isByok && aiImages ? String(MAX_AI_IMAGES) : "0");
    try {
      for (const f of await Promise.all(files.map(shrinkImage))) fd.append("images", f);
      const res = await fetch("/api/studio/drafts", {
        method: "POST",
        body: fd,
        headers: { "X-Studio-Request": "1", ...headers },
      });
      const json = await res.json();
      if (!json.success) {
        setError({ msg: json.error, raw: json.raw });
      } else {
        // 제출 당시 사진 순서를 결과와 함께 고정 ([사진N] 마커와 일치)
        setResult({ ...json.data, photos: files.map((f) => URL.createObjectURL(f)) });
        setBody(json.data.body);
        const descs = isByok && aiImages ? figuresOf(json.data.body).slice(0, MAX_AI_IMAGES) : [];
        setFigures(descs.map(() => ({ status: "loading" })));
        descs.forEach((d, i) => drawFigure(i, d, headers));
      }
    } catch (err) {
      setError({ msg: err instanceof Error ? err.message : "요청 실패" });
    } finally {
      setLoading(false);
    }
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
      const figs = figures.map((f) => (f.status === "done" ? f.src : undefined));
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
          <fieldset disabled={loading} className="space-y-5">
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
                        placeholder={openaiServerKey ? "서버 키 사용 중 (비워 두세요)" : "sk-..."}
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
                      : openaiServerKey
                        ? "✓ 서버에 등록된 키를 사용합니다. 비워 두면 되고, 여기에 키를 넣으면 그 키가 우선합니다."
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

            <Planner
              agent={agent}
              agentLabel={selectedAgent.label}
              postTypes={postTypes}
              onUse={applyIdea}
              headers={byokHeaders}
              blocked={isByok && !canUseGpt ? "OpenAI API 키를 1번 칸에 먼저 입력해 주세요." : ""}
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
              disabled={loading}
              className="w-full rounded-full bg-hb-navy py-4 text-lg font-extrabold text-white shadow-[0_4px_0_#00317a] disabled:opacity-60"
            >
              {loading ? `${selectedAgent.label}가 글을 쓰는 중… (1~3분)` : "✍️ 초안 만들기"}
            </button>
          </fieldset>
        </form>

        {/* ── 결과 ── */}
        <section className="lg:sticky lg:top-4 lg:self-start">
          {!result && !error && (
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
                      onChange={(e) => setBody(e.target.value)}
                      className="h-[30rem] w-full resize-y rounded-lg border border-line p-3 text-[14px] leading-6"
                    />
                    <p className="mt-1 text-xs text-ink-soft">
                      <code>## </code> 소제목 · <code>&gt; </code> 인용 · <code>[사진N]</code> <code>[그림: …]</code> 이미지
                      자리
                    </p>
                  </>
                ) : (
                  <Preview body={body} photos={result.photos} figures={figures} center={center} />
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
                        : "📋 네이버 에디터용 복사 (서식 + 사진·그림 포함)"}
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
                  {figures.some((f) => f.status === "loading") && (
                    <p className="text-xs text-hb-blue">🎨 그림을 그리는 중입니다 (1장에 30초~1분). 다 그려진 뒤 복사하면 그림도 함께 들어갑니다.</p>
                  )}
                </div>
                <p className="mt-3 text-xs leading-5 text-ink-soft">
                  {result.photos.length > 0 && !result.imagesSeen && "이 AI는 사진을 보지 못해 위치만 표시했습니다. "}
                  사진·그림이 붙여넣기로 안 들어가면 <b>[사진N]</b>·<b>[그림N]</b> 자리에 직접 올려 주세요.
                  <br />
                  {result.examplesUsed > 1
                    ? "✍️ 원장님 대표 글 + 블로그 최근 글의 문체를 참고했습니다."
                    : result.examplesUsed === 1
                      ? "✍️ 원장님 대표 글의 문체를 참고했습니다. (최근 글은 불러오지 못함)"
                      : "✍️ 기본 문체 예시로 썼습니다."}
                </p>
              </div>
              {figures.length > 0 && (
                <div className="rounded-xl bg-white p-4 ring-1 ring-line">
                  <p className="mb-2 text-sm font-bold">🎨 AI 그림</p>
                  <div className="grid grid-cols-2 gap-3">
                    {figures.map((f, i) => {
                      const desc = figuresOf(body)[i] ?? "";
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
                              <button type="button" onClick={() => drawFigure(i, desc, byokHeaders)} className="text-hb-navy underline">
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
        추천합니다. 마음에 드는 걸 고르면 아래 칸이 채워집니다.
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
                    ✏️ 원장님이 채워 주실 내용: {idea.needs.join(" / ")}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setUsed(i);
                    onUse(idea);
                  }}
                  className="mt-3 rounded-full bg-hb-navy px-4 py-1.5 text-xs font-bold text-white"
                >
                  {used === i ? "✓ 아래에 채웠어요" : "이 주제로 쓰기 ↓"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

/** 본문 미리보기: 서식 표시를 실제 모양(굵은 소제목·인용·사진·그림)으로 */
function Preview({
  body,
  photos,
  figures,
  center,
}: {
  body: string;
  photos: string[];
  figures: FigureState[];
  center: boolean;
}) {
  return (
    <div
      className={`max-h-[34rem] overflow-auto rounded-lg border border-line p-4 text-[15px] leading-7 ${center ? "text-center" : ""}`}
    >
      {parseBody(body).map((b, i) => {
        switch (b.kind) {
          case "blank":
            return <div key={i} className="h-4" />;
          case "heading":
            return (
              <p key={i} className="mt-1 text-[17px] font-extrabold text-hb-navy">
                {b.text}
              </p>
            );
          case "quote":
            return (
              <p key={i} className="text-ink-soft">
                {b.text}
              </p>
            );
          case "photo": {
            const src = photos[b.n - 1];
            return src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={src} alt={`사진${b.n}`} className="my-2 inline-block max-h-72 rounded" />
            ) : (
              <p key={i} className="my-1 rounded bg-bg-soft py-2 text-center text-xs font-bold text-ink-soft">
                [사진{b.n}]
              </p>
            );
          }
          case "figure": {
            const f = figures[b.n - 1];
            return f?.status === "done" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={f.src} alt={b.desc} className="my-2 inline-block max-h-72 rounded" />
            ) : (
              <p key={i} className="my-1 rounded border border-dashed border-hb-blue py-2 text-center text-xs text-hb-blue">
                🎨 그림{b.n} {f?.status === "loading" ? "그리는 중…" : ""} — {b.desc}
              </p>
            );
          }
          default:
            return <p key={i}>{b.text}</p>;
        }
      })}
    </div>
  );
}

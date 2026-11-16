"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import type { PostType } from "@/studio/post-types";

const noopSubscribe = () => () => {};
function readSavedAgent() {
  try {
    return localStorage.getItem("hb-studio-agent");
  } catch {
    return null;
  }
}

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
  logout,
}: {
  agents: AgentInfo[];
  postTypes: PostType[];
  keywordGroups: { label: string; items: string[] }[];
  logout: () => Promise<void>;
}) {
  const saved = useSyncExternalStore(noopSubscribe, readSavedAgent, () => null);
  const [picked, setPicked] = useState<string | null>(null);
  const fallback = agents.find((a) => a.id === "chatgpt")?.id ?? agents[0].id; // 기본: ChatGPT
  const agent = picked ?? (saved && agents.some((a) => a.id === saved) ? saved : fallback);
  const [typeId, setTypeId] = useState(postTypes[0].id);
  // null = 아직 고르지 않음 → 글 유형의 기본 키워드 사용
  const [kwPicked, setKwPicked] = useState<string[] | null>(null);
  const [topic, setTopic] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [memo, setMemo] = useState("");
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

  function move(i: number, d: -1 | 1) {
    const j = i + d;
    if (j < 0 || j >= files.length) return;
    const next = [...files];
    [next[i], next[j]] = [next[j], next[i]];
    setFiles(next);
  }

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    const fd = new FormData();
    fd.set("agent", agent);
    fd.set("type", typeId);
    fd.set("topic", topic);
    fd.set("memo", memo);
    selectedKeywords.forEach((k) => fd.append("keywords", k));
    fd.set("consent", consent ? "yes" : "no");
    for (const f of type.fields) fd.set(`f_${f.key}`, values[f.key] ?? "");
    try {
      for (const f of await Promise.all(files.map(shrinkImage))) fd.append("images", f);
      const res = await fetch("/api/studio/drafts", {
        method: "POST",
        body: fd,
        headers: { "X-Studio-Request": "1" },
      });
      const json = await res.json();
      if (!json.success) {
        setError({ msg: json.error, raw: json.raw });
      } else {
        // 제출 당시 사진 순서를 결과와 함께 고정 ([사진N] 마커와 일치)
        setResult({ ...json.data, photos: files.map((f) => URL.createObjectURL(f)) });
        setBody(json.data.body);
      }
    } catch (err) {
      setError({ msg: err instanceof Error ? err.message : "요청 실패" });
    } finally {
      setLoading(false);
    }
  }

  async function copy(label: string, text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(""), 1500);
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
            </Card>

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

            <Card title="3. 내용">
              <Input
                label="주제"
                required
                value={topic}
                onChange={setTopic}
                placeholder="예) 덕장중 3학년 2학기 중간고사 결과"
              />
              {type.fields.map((f) => (
                <Input
                  key={`${type.id}-${f.key}`}
                  label={f.label}
                  required={f.required}
                  long={f.long}
                  placeholder={f.placeholder}
                  value={values[f.key] ?? ""}
                  onChange={(v) => setValues({ ...values, [f.key]: v })}
                />
              ))}
              <Input
                label="추가 메모 (선택)"
                long
                value={memo}
                onChange={setMemo}
                placeholder="강조하고 싶은 점, 분위기 등"
              />
              <KeywordPicker groups={keywordGroups} selected={selectedKeywords} onChange={setKwPicked} />
              <p className="text-xs text-amber-700">
                ⚠️ 입력하지 않은 점수·인원·학생 말은 AI가 쓰지 않습니다. 필요한 사실은 직접 적어 주세요.
              </p>
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
              <Out label="본문 (수정 가능)" onCopy={() => copy("본문", body)} copied={copied === "본문"}>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="h-[28rem] w-full resize-y rounded-lg border border-line p-3 text-[14px] leading-6"
                />
                <p className="mt-2 text-xs text-ink-soft">
                  네이버 에디터에 붙여넣은 뒤 <b>[사진N]</b> 위치에 해당 사진을 올려 주세요.
                  {result.photos.length > 0 && !result.imagesSeen && " (이 AI는 사진을 보지 못해 위치만 표시했습니다)"}
                  <br />
                  {result.examplesUsed > 0
                    ? `✍️ 블로그 최근 글 ${result.examplesUsed}편의 문체를 참고했습니다.`
                    : "✍️ 블로그 글을 불러오지 못해 기본 문체 예시로 썼습니다."}
                </p>
              </Out>
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
  label,
  value,
  onChange,
  placeholder,
  required,
  long,
}: {
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
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          rows={3}
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

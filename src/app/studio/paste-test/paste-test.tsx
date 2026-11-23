"use client";

import { useState } from "react";
import Link from "next/link";
import { toEditorHtml, toPlainText, type AlignMode } from "@/studio/format";

/**
 * 네이버 스마트에디터 붙여넣기 시험: 어떤 HTML 모양이 가운데 정렬·사진·지도 링크를 살리는지
 * 원장님(또는 개발자)이 직접 붙여 보고 결과를 체크 → '결과 복사'로 전달하면 그 방식으로 스튜디오를 맞춘다.
 */

const SAMPLE = `안녕하세요
스마트해법영어 백운밸리점입니다.

> “붙여넣기 시험 글입니다”

## 1. 가운데 정렬 확인
이 줄들이 가운데에 있으면 성공입니다.
**핵심 키워드**는 주황색 굵은 글씨여야 해요.
__이 문장은 굵은 밑줄이어야 해요__
“이 줄은 굵은 기울임이어야 해요”

[사진1]`;

/** 끝인사 시험용 (실제 글 끝과 같은 모양: "감사합니다" 뒤에 연락처) */
const OUTRO = `오늘도 읽어 주셔서 고맙습니다.

" 감사합니다 "

📞 시험용 연락처 줄`;

type Test = { id: string; label: string; desc: string; text?: string; make: (ctx: Ctx) => Promise<string> | string };
/** 배포 사이트의 공개 이미지 (내 PC에서 열어도 https 주소로 시험) */
const HTTPS_IMAGE = "https://smartenglish-kappa.vercel.app/og.png";
type Ctx = { origin: string; placeUrl: string };

const ALIGN_TESTS: { mode: AlignMode; label: string; desc: string }[] = [
  { mode: "style", label: "A. 지금 방식", desc: '<p style="text-align:center">' },
  { mode: "attr", label: "B. 정렬 속성", desc: '<p align="center">' },
  { mode: "se", label: "C. 스마트에디터 구조", desc: "원장님 블로그 HTML과 같은 클래스" },
  { mode: "all", label: "D. 세 가지 모두", desc: "A + B + C 한꺼번에" },
];

/** 시험용 작은 그림 (data URL) */
function sampleImage(): string {
  const c = document.createElement("canvas");
  c.width = 480;
  c.height = 240;
  const g = c.getContext("2d")!;
  g.fillStyle = "#e8f4fc";
  g.fillRect(0, 0, 480, 240);
  g.fillStyle = "#00317a";
  g.font = "bold 36px sans-serif";
  g.textAlign = "center";
  g.fillText("시험 사진", 240, 135);
  return c.toDataURL("image/jpeg", 0.85);
}

const TESTS: Test[] = [
  ...ALIGN_TESTS.map((t) => ({
    id: t.mode,
    label: t.label,
    desc: `가운데 정렬 — ${t.desc}`,
    make: () => toEditorHtml(SAMPLE, { photos: [], figures: [], center: true, align: t.mode }),
  })),
  {
    id: "img-data",
    label: "E. 사진 (지금 방식)",
    desc: "사진을 글 속 데이터로 넣기 (data URL)",
    text: "(사진 시험 E — 글자만 붙었다면 사진은 안 들어간 것)",
    make: () => toEditorHtml("[사진1]\n사진 아래 글", { photos: [sampleImage()], figures: [], center: true, align: "all" }),
  },
  {
    id: "img-https",
    label: "F. 사진 (인터넷 주소)",
    desc: "사진을 인터넷 주소로 넣기 (https)",
    text: "(사진 시험 F — 글자만 붙었다면 사진은 안 들어간 것)",
    make: () => toEditorHtml("[사진1]\n사진 아래 글", { photos: [HTTPS_IMAGE], figures: [], center: true, align: "all", allowHttpsImages: true }),
  },
  {
    id: "map",
    label: "G. 네이버 지도 링크",
    desc: "지도 주소 한 줄 (지도·링크 카드로 바뀌는지)",
    text: "(지도 시험 G)",
    make: ({ placeUrl }) => `<p style="text-align:center;" align="center"><a href="${placeUrl}">${placeUrl}</a></p>`,
  },
  {
    id: "size",
    label: "H. 글씨 크기 19",
    desc: "본문 글씨가 19 크기로 붙는지 (에디터 글씨 크기 칸에 19가 보이면 성공)",
    make: () => toEditorHtml(SAMPLE, { photos: [], figures: [], center: true, align: "all", style: { fontSize: 19, font: "default", thanksHand: false } }),
  },
  {
    id: "font",
    label: "I. 글씨체 나눔명조",
    desc: "본문이 나눔명조로 붙는지 (에디터 글씨체 칸에 나눔명조가 보이면 성공)",
    make: () =>
      toEditorHtml(SAMPLE, { photos: [], figures: [], center: true, align: "all", style: { fontSize: 16, font: "nanummyeongjo", thanksHand: false } }),
  },
  {
    id: "thanks",
    label: "J. 끝인사 손글씨",
    desc: "“감사합니다” 줄만 손글씨체(다시시작해)로 붙는지",
    text: OUTRO,
    make: () => toEditorHtml(OUTRO, { photos: [], figures: [], center: true, align: "all", style: { fontSize: 16, font: "default", thanksHand: true } }),
  },
];

const RESULTS = ["잘 됨", "일부만", "안 됨"] as const;

export default function PasteTest({ placeUrl }: { placeUrl: string }) {
  const [copied, setCopied] = useState("");
  const [marks, setMarks] = useState<Record<string, (typeof RESULTS)[number]>>({});
  const [note, setNote] = useState("");

  async function copy(t: Test) {
    const html = await t.make({ origin: window.location.origin, placeUrl });
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([t.text ?? toPlainText(SAMPLE)], { type: "text/plain" }),
        }),
      ]);
      setCopied(t.id);
      setTimeout(() => setCopied(""), 1500);
    } catch {
      setCopied("fail");
    }
  }

  const summary = [
    "[붙여넣기 시험 결과]",
    ...TESTS.map((t) => `${t.label}: ${marks[t.id] ?? "안 해봄"}`),
    note.trim() ? `메모: ${note.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <main className="min-h-dvh bg-bg-soft px-4 py-8">
      <div className="mx-auto max-w-2xl space-y-5">
        <div>
          <Link href="/studio" className="text-sm font-bold text-hb-navy underline">
            ← 스튜디오
          </Link>
          <h1 className="mt-2 font-display text-2xl text-hb-navy">네이버 붙여넣기 시험</h1>
          <p className="mt-2 text-sm leading-6 text-ink-soft">
            네이버 에디터가 어떤 모양의 글을 그대로 받아 주는지 확인합니다. 네이버 블로그 <b>글쓰기</b> 화면을 다른 탭에 열고,
            아래 버튼을 하나씩 눌러 복사 → 에디터 본문에 붙여넣기 → 결과를 체크해 주세요. (시험 글은 임시저장하지 말고 지우면
            됩니다)
          </p>
        </div>

        <ol className="space-y-3">
          {TESTS.map((t) => (
            <li key={t.id} className="rounded-2xl bg-white p-4 ring-1 ring-line">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-extrabold">{t.label}</p>
                  <p className="text-xs text-ink-soft">{t.desc}</p>
                </div>
                <button
                  type="button"
                  onClick={() => copy(t)}
                  className="rounded-full bg-hb-navy px-4 py-2 text-sm font-bold text-white"
                >
                  {copied === t.id ? "복사됨 ✓" : "복사"}
                </button>
              </div>
              <fieldset className="mt-3 flex gap-1.5">
                <legend className="sr-only">{t.label} 결과</legend>
                {RESULTS.map((r) => (
                  <label
                    key={r}
                    className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-bold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-hb-blue ${
                      marks[t.id] === r ? "border-hb-navy bg-hb-navy text-white" : "border-line text-ink-soft"
                    }`}
                  >
                    <input
                      type="radio"
                      name={`result-${t.id}`}
                      className="sr-only"
                      checked={marks[t.id] === r}
                      onChange={() => setMarks((m) => ({ ...m, [t.id]: r }))}
                    />
                    {r}
                  </label>
                ))}
              </fieldset>
            </li>
          ))}
        </ol>
        {copied === "fail" && (
          <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">이 브라우저는 서식 복사를 지원하지 않습니다. 크롬이나 엣지로 열어 주세요.</p>
        )}

        <div className="rounded-2xl bg-white p-4 ring-1 ring-line">
          <label className="block text-sm font-bold">
            눈에 띈 점 (선택)
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="예) C는 가운데는 되는데 글자가 작아짐 / F는 사진이 회색 상자로 나옴"
              className="mt-1 w-full rounded-lg border border-line p-3 text-sm font-normal"
            />
          </label>
          <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-bg-soft p-3 text-xs">{summary}</pre>
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(summary);
                setCopied("summary");
              } catch {
                setCopied("summary-fail");
              }
              setTimeout(() => setCopied(""), 2500);
            }}
            className="mt-2 w-full rounded-full bg-hb-blue py-2.5 text-sm font-extrabold text-white"
          >
            {copied === "summary" ? "복사됨 ✓ 개발자에게 붙여넣어 보내 주세요" : "결과 복사"}
          </button>
          <p aria-live="polite" className="mt-1 text-xs text-red-700">
            {copied === "summary-fail" ? "복사하지 못했습니다. 위 결과 글을 직접 선택해 복사해 주세요." : ""}
          </p>
        </div>
      </div>
    </main>
  );
}

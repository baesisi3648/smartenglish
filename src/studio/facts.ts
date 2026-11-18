import "server-only";
import { academy } from "@/content/academy";
import { programs, startSteps } from "@/content/programs";

/**
 * 자동 글의 근거: 원장님 입력 없이 써도 되는 "확인된 정보"만 모은다.
 * - 홈페이지 SSOT(academy.ts, programs.ts) + 원장님이 블로그에 직접 공개한 수업 방식
 * - 성적·인원 변화·이벤트·혜택·날짜처럼 그때그때 다른 사실은 넣지 않는다 (자동 글에서는 쓰지 못하게)
 */
export function academyFacts() {
  const t = academy.tuition.value;
  return `
[교습소 확인된 정보 — 자동 글에서 교습소 이야기는 이 안에서만]
- 이름: ${academy.name} (영어교습소, ${academy.director}), 위치: 의왕 학의동 백운밸리 (해링턴플레이스 1단지 상가)
- 대상 학교: ${academy.schools.join(", ")} 학생들
- 수업 방식: 레벨 진단을 바탕으로 한 1:1 맞춤 학습. 반 정원 최대 ${t.capacity}명의 소수 수업
- 과정:
${programs.map((p) => `  · ${p.tag} — ${p.title} (${p.steps.join(" → ")}): ${p.body}`).join("\n")}
- 초등 수업 흐름 (원장님 블로그에 공개된 내용):
  태블릿으로 알파벳을 보고 소리 내어 읽고 녹음 → 배운 단어를 선생님과 함께 소리 내어 읽기
  → 단어가 들어간 문장·스토리 읽기 → 단어시험으로 배운 내용 확인 (틀린 단어는 다시 복습)
- 중등 시험 대비 방식 (원장님 블로그에 공개된 내용):
  학교별 시험 범위·출제 경향 분석 → 아이마다 취약한 문법·독해 유형 확인 후 하나씩 보완
  → 개념을 실제 문장에 적용하는 반복 점검 → 지문에서 답의 근거를 직접 찾는 연습
- 상담부터 첫 수업까지: ${startSteps.map(([s, d]) => `${s}(${d})`).join(" → ")}
- 무료 레벨테스트·상담 예약 가능 (네이버 예약 또는 문자)
- 네이버 플레이스 방문자 리뷰에서 많이 나온 말: ${academy.reviewKeywords.items.map((k) => `"${k.label}"`).join(", ")}
- 교습소 소개 문구: "${academy.tagline}"
`.trim();
}

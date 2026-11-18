/** GPT(내 API 키)에서 고를 수 있는 글쓰기 모델 — 화면·서버 공용 (2026-11 OpenAI 모델 목록·가격 기준) */
export const OPENAI_MODELS = [
  { id: "gpt-6-luna", label: "GPT-6 Luna · 추천 (저렴, 초안에 충분)" },
  { id: "gpt-6.1-terra", label: "GPT-6.1 Terra · 더 자연스러운 글 (약 10배 비쌈)" },
  { id: "gpt-6.1-sol", label: "GPT-6.1 Sol · 고급 (느리고 가장 비쌈)" },
] as const;

/** 초안 기본 모델 */
export const DEFAULT_OPENAI_MODEL = OPENAI_MODELS[0].id;
/** 콘텐츠 플래너는 여러 자료를 엮어 판단해야 해서 Terra로 고정 (월 몇 번이라 비용 차이 작음) */
export const PLANNER_OPENAI_MODEL = "gpt-6.1-terra";

export function isOpenAIModel(id: string) {
  return OPENAI_MODELS.some((m) => m.id === id);
}

/** 키 형식만 가볍게 확인 (실제 유효성은 OpenAI가 판단) */
export const OPENAI_KEY_PATTERN = /^sk-[A-Za-z0-9_-]{20,200}$/;

/** 초안에 넣을 수 있는 AI 그림 최대 개수 (그림마다 이미지 요금이 따로 든다) */
export const MAX_AI_IMAGES = 2;

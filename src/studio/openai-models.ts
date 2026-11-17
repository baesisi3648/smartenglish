/** GPT(내 API 키)에서 고를 수 있는 글쓰기 모델 — 화면·서버 공용 (2026-11 OpenAI 모델 목록 기준) */
export const OPENAI_MODELS = [
  { id: "gpt-6.1-terra", label: "GPT-6.1 Terra · 추천 (빠르고 자연스러운 글)" },
  { id: "gpt-6-luna", label: "GPT-6 Luna · 가장 저렴" },
  { id: "gpt-6.1-sol", label: "GPT-6.1 Sol · 고급 (느리고 비쌈)" },
] as const;

export const DEFAULT_OPENAI_MODEL = OPENAI_MODELS[0].id;

export function isOpenAIModel(id: string) {
  return OPENAI_MODELS.some((m) => m.id === id);
}

/** 브라우저에서 키 형식만 가볍게 확인 (실제 유효성은 OpenAI가 판단) */
export const OPENAI_KEY_PATTERN = /^sk-[A-Za-z0-9_-]{20,200}$/;

/** 초안에 넣을 수 있는 AI 그림 최대 개수 (그림마다 이미지 요금이 따로 든다) */
export const MAX_AI_IMAGES = 2;

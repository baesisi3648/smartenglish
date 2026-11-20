/**
 * 쓰는 중인 JSON 글에서 최상위 문자열 항목(title·body)의 지금까지 값을 꺼낸다 (서버·화면 공용).
 * - 따옴표가 아직 안 닫혔으면 받은 데까지 (done: false)
 * - 끝에 걸린 미완성 이스케이프(\, \u12)와 짝 없는 상위 서로게이트는 다음 조각까지 보류
 * - 최상위 객체의 키만 본다 (중첩 객체 속 같은 이름은 무시)
 */
export function partialField(raw: string, field: string): { value: string; done: boolean } {
  let depth = 0;
  let i = raw.indexOf("{");
  if (i < 0) return { value: "", done: false };
  for (; i < raw.length; i++) {
    const c = raw[i];
    if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") depth--;
    else if (c === '"') {
      const key = readString(raw, i + 1);
      if (!key.done) return { value: "", done: false };
      let j = key.end + 1;
      while (j < raw.length && /\s/.test(raw[j])) j++;
      const isKey = raw[j] === ":";
      if (isKey && depth === 1 && key.value === field) {
        j++;
        while (j < raw.length && /\s/.test(raw[j])) j++;
        if (j >= raw.length || raw[j] !== '"') return { value: "", done: false };
        const v = readString(raw, j + 1);
        return { value: v.value, done: v.done };
      }
      i = key.end; // 다른 키·값 문자열은 건너뜀
    }
  }
  return { value: "", done: false };
}

function readString(raw: string, start: number): { value: string; done: boolean; end: number } {
  let out = "";
  for (let i = start; i < raw.length; i++) {
    const c = raw[i];
    if (c === '"') return { value: out, done: true, end: i };
    if (c !== "\\") {
      out += c;
      continue;
    }
    const n = raw[i + 1];
    if (n === undefined) break;
    if (n === "u") {
      const hex = raw.slice(i + 2, i + 6);
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) break;
      out += String.fromCharCode(parseInt(hex, 16));
      i += 5;
      continue;
    }
    out += ({ n: "\n", t: "\t", r: "\r", b: "\b", f: "\f" } as Record<string, string>)[n] ?? n;
    i += 1;
  }
  // 닫히지 않음: 마지막 글자가 짝 없는 상위 서로게이트면 보류
  const last = out.charCodeAt(out.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) out = out.slice(0, -1);
  return { value: out, done: false, end: raw.length };
}

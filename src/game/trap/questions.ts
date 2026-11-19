import type { Level, Question } from "./engine";

/**
 * 단어 사파리 기본 문제 (레벨별 20문항, 4지선다).
 * 형식은 애니멀 트랩·더비 문제 파일(question·choices·answer 1~4·explanation)과 같아서
 * toTrapImport() 로 내보내면 교실용 게임에도 그대로 넣을 수 있다.
 * 원장님 교재·단어장으로 바꾸려면 이 파일의 문항만 교체하면 된다.
 */

type Raw = [question: string, choices: [string, string, string, string], answer: 1 | 2 | 3 | 4, explanation: string];

const make = (prefix: string, rows: Raw[]): Question[] =>
  rows.map(([question, choices, answer, explanation], i) => ({
    id: `${prefix}${String(i + 1).padStart(2, "0")}`,
    question,
    choices,
    answer,
    explanation,
  }));

const PHONICS = make("p", [
  ["🍎 그림에 맞는 단어는?", ["apple", "ant", "egg", "orange"], 1, "apple은 사과예요. a는 /애/ 소리로 시작해요."],
  ["🐱 고양이는 영어로?", ["dog", "cat", "cow", "cup"], 2, "cat은 고양이예요. c-a-t 세 소리를 이어서 읽어요."],
  ["'b'로 시작하는 단어는?", ["ball", "doll", "sun", "map"], 1, "ball은 b 소리(/b/)로 시작해요. 입술을 붙였다가 터뜨려요."],
  ["c-a-t을 합쳐 읽으면?", ["cut", "cot", "cat", "cap"], 3, "/k/ + /æ/ + /t/ — 소리를 짧게 이어 붙이면 cat!"],
  ["'sun'과 라임이 같은 단어는? (-un)", ["sit", "run", "sad", "sea"], 2, "sun과 run은 둘 다 -un으로 끝나요. 이렇게 끝부분 소리가 같은 걸 라임이라고 해요."],
  ["🐶 강아지는 영어로?", ["pig", "dog", "bag", "dig"], 2, "dog은 강아지예요."],
  ["/f/ 소리로 시작하는 단어는?", ["fish", "dish", "wish", "ship"], 1, "fish는 /f/ 소리로 시작해요."],
  ["🎩 'hat'의 가운데 글자는?", ["a", "e", "i", "o"], 1, "h-a-t, 가운데 a가 /애/ 소리를 내요."],
  ["'pig'와 라임이 같은 단어는? (-ig)", ["big", "pin", "pot", "bag"], 1, "pig와 big은 둘 다 -ig로 끝나요. bag은 -ag라서 라임이 아니에요."],
  ["🚌 버스는 영어로?", ["bus", "box", "bed", "bee"], 1, "bus는 버스! b-u-s."],
  ["'sh' 소리로 시작하는 단어는?", ["chip", "ship", "sip", "tip"], 2, "ship은 sh 소리(/ʃ/)로 시작해요. 조용히 하라고 할 때 내는 '쉬' 소리와 비슷해요."],
  ["🐟 f-i-sh를 합쳐 읽으면?", ["fish", "fist", "dish", "fin"], 1, "/f/ + /ɪ/ + /ʃ/ — 소리를 이어 붙이면 fish!"],
  ["'red'는 무슨 색일까요?", ["파랑", "빨강", "노랑", "초록"], 2, "red는 빨간색이에요."],
  ["🥚 달걀은 영어로?", ["egg", "leg", "bag", "bed"], 1, "egg는 달걀! e는 /에/ 소리예요."],
  ["대문자 'G'의 소문자는?", ["q", "g", "j", "p"], 2, "G의 소문자는 g예요."],
  ["'ch' 소리로 시작하는 단어는?", ["cheese", "shoe", "three", "sock"], 1, "cheese는 ch 소리(/tʃ/)로 시작해요. 기차 소리 '츄츄'의 첫소리와 비슷해요."],
  ["🦊 'fox'는 어떤 글자로 시작할까요?", ["f", "p", "v", "b"], 1, "fox는 f로 시작해요. 윗니로 아랫입술을 살짝 물고 /f/!"],
  ["'cake'처럼 끝에 e가 붙으면 a는 어떻게 읽을까요?", ["/애/", "/에이/", "/아/", "/어/"], 2, "끝의 e는 소리가 나지 않고, 앞의 a를 /에이/로 읽게 해요. 매직 e!"],
  ["🌞 'sun'의 뜻은?", ["달", "별", "해", "구름"], 3, "sun은 해예요."],
  ["'six'는 숫자 몇일까요?", ["4", "5", "6", "7"], 3, "six는 6이에요."],
]);

const ELEMENTARY = make("e", [
  ["I ___ a student.", ["am", "is", "are", "be"], 1, "I 다음에는 am을 써요. I am a student."],
  ["She ___ my sister.", ["am", "is", "are", "be"], 2, "She, He, It 다음에는 is를 써요."],
  ["'happy'의 반대말은?", ["sad", "glad", "big", "fast"], 1, "happy(행복한) ↔ sad(슬픈)"],
  ["'수요일'은 영어로?", ["Monday", "Tuesday", "Wednesday", "Thursday"], 3, "Wednesday는 수요일! 가운데 d는 소리 내지 않아요."],
  ["There ___ three apples.", ["is", "are", "am", "be"], 2, "사과가 여러 개(복수)라서 are를 써요."],
  ["'library'는 어디일까요?", ["병원", "도서관", "우체국", "공원"], 2, "library는 책을 빌리는 도서관이에요."],
  ["A dog has ___ legs.", ["two", "three", "four", "six"], 3, "강아지 다리는 네 개, four!"],
  ["___ you like apples?", ["Do", "Does", "Are", "Is"], 1, "you에게 묻는 일반동사 질문은 Do로 시작해요."],
  ["He ___ soccer every day.", ["play", "plays", "to play", "are play"], 2, "현재형 문장에서 He, She, It 다음 일반동사에는 -s를 붙여요. He plays."],
  ["'tall'의 반대말은?", ["short", "long", "big", "small"], 1, "키가 tall(큰) ↔ short(작은)"],
  ["1년의 첫 번째 달은?", ["January", "June", "July", "March"], 1, "January는 1월이에요."],
  ["Can you swim? — Yes, I ___.", ["do", "can", "am", "is"], 2, "Can으로 물으면 can으로 대답해요."],
  ["'hungry'의 뜻은?", ["졸린", "배고픈", "목마른", "화난"], 2, "hungry는 배고픈이에요."],
  ["This is ___ apple.", ["a", "an", "two", "many"], 2, "모음(a, e, i, o, u) 소리 앞에는 an을 써요."],
  ["'cold'의 반대말은?", ["cool", "hot", "fast", "wet"], 2, "cold(추운) ↔ hot(더운)"],
  ["It's three o'clock. 무슨 뜻일까요?", ["3시 정각이에요", "3분이에요", "3일이에요", "3살이에요"], 1, "o'clock은 '정각'이라는 뜻이에요."],
  ["She is ___ a book now. (지금 읽고 있는 중)", ["read", "reads", "reading", "readed"], 3, "지금 하고 있는 일은 be동사 + -ing로 말해요."],
  ["'kitchen'은 집의 어디일까요?", ["침실", "부엌", "욕실", "거실"], 2, "kitchen은 요리하는 부엌이에요."],
  ["I have two ___.", ["box", "boxes", "boxs", "boxies"], 2, "box처럼 x로 끝나는 단어는 보통 -es를 붙여 여러 개를 나타내요."],
  ["The cat is ___ the box. (상자 안에)", ["on", "in", "under", "at"], 2, "in은 '~ 안에'예요. on은 위, under는 아래!"],
]);

const MIDDLE = make("m", [
  ["I want ___ a doctor.", ["be", "to be", "being", "been"], 2, "want는 to부정사를 목적어로 써요. want to be"],
  ["She has ___ in Seoul since 2020.", ["live", "lived", "living", "lives"], 2, "since와 함께 쓰는 현재완료: has + 과거분사(lived)"],
  ["This book is ___ than that one.", ["interesting", "more interesting", "most interesting", "interestinger"], 2, "긴 형용사의 비교급은 more + 형용사예요."],
  ["The boy ___ is singing is my brother.", ["which", "who", "what", "where"], 2, "사람을 꾸미는 주격 관계대명사는 who예요."],
  ["If I ___ a bird, I could fly.", ["am", "will be", "were", "be"], 3, "현재와 반대되는 상상(가정법 과거)은 과거형으로 써요. be동사는 보통 were를 쓰고, 일상 회화에서는 was도 써요."],
  ["He enjoys ___ soccer.", ["play", "to play", "playing", "played"], 3, "enjoy는 동명사(-ing)를 목적어로 써요."],
  ["decide(결정하다)에서 '결정'을 뜻하는 명사는?", ["decision", "decisive", "decided", "deciding"], 1, "decide(결정하다) → decision(결정). decisive는 '결단력 있는'이라는 형용사예요."],
  ["The window was broken ___ Tom.", ["by", "with", "from", "of"], 1, "수동태에서 행동한 사람은 by로 나타내요."],
  ["I don't know ___ he lives.", ["where", "what", "which", "who"], 1, "'그가 어디에 사는지' — 간접의문문 where + 주어 + 동사"],
  ["She is old enough ___ alone.", ["travel", "to travel", "traveling", "traveled"], 2, "형용사 + enough + to부정사: ~할 만큼 충분히 …한"],
  ["'necessary'의 뜻은?", ["필요한", "위험한", "가능한", "유명한"], 1, "necessary는 필요한이에요."],
  ["Look at the girl ___ hair is long.", ["who", "whose", "which", "that"], 2, "'그 소녀의 머리카락' — 소유격 관계대명사 whose"],
  ["I'm looking forward to ___ you.", ["see", "seeing", "saw", "seen"], 2, "look forward to의 to는 전치사라서 뒤에 동명사가 와요."],
  ["동사와 과거분사가 잘못 짝지어진 것은?", ["go – gone", "eat – eaten", "write – written", "buy – buyed"], 4, "buy의 과거분사는 bought예요."],
  ["'reduce'의 뜻은?", ["늘리다", "줄이다", "고치다", "나누다"], 2, "reduce는 줄이다예요."],
  ["It is difficult ___ me to solve this problem.", ["of", "for", "to", "with"], 2, "to부정사의 의미상 주어는 보통 for + 목적격으로 써요."],
  ["Have you ever ___ to Jeju?", ["go", "went", "been", "going"], 3, "경험을 묻는 현재완료: Have you ever been to ~?"],
  ["Tom is the ___ student in our class. (우리 반에서 가장 키가 큰)", ["tall", "taller", "tallest", "more tall"], 3, "'가장 ~한'은 the + 최상급: the tallest"],
  ["She made me ___.", ["cry", "to cry", "crying", "cried"], 1, "사역동사 make + 목적어 + 동사원형"],
  ["'although'와 뜻이 가장 비슷한 것은?", ["because", "though", "so", "unless"], 2, "although와 though는 둘 다 '비록 ~이지만'이에요."],
]);

export const BANKS: Record<Level, Question[]> = { phonics: PHONICS, elementary: ELEMENTARY, middle: MIDDLE };

export const LEVEL_INFO: Record<Level, { label: string; sub: string; emoji: string }> = {
  phonics: { label: "파닉스", sub: "알파벳 소리 · 그림 단어", emoji: "🔤" },
  elementary: { label: "초등 영어", sub: "기초 단어 · 쉬운 문장", emoji: "📗" },
  middle: { label: "중등 영어", sub: "문법 · 내신 어휘", emoji: "📘" },
};

/** 애니멀 트랩·더비 '가져오기' 형식으로 내보내기 (교실용 게임에 같은 문제를 쓰고 싶을 때) */
export function toTrapImport(level: Level) {
  return {
    sets: [
      {
        title: `단어 사파리 — ${LEVEL_INFO[level].label}`,
        questions: BANKS[level].map((q, i) => ({
          difficulty: i < 7 ? "easy" : i < 14 ? "normal" : "hard",
          question: q.question,
          choices: q.choices,
          answer: q.answer,
          explanation: q.explanation,
        })),
      },
    ],
  };
}

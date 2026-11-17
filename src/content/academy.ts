/**
 * 학원 정보 단일 진실 원천(SSOT).
 * 홈페이지, 블로그 고정 블록(추후 생성기)이 모두 이 파일을 참조한다.
 * `verify: true` 항목은 원본 서류 확인 전이므로 화면에 [확인 필요]로 표시된다.
 * 출처/확인일은 docs/00-direction.md 참고.
 */

export type Field<T> = { value: T; verify?: boolean; source: string; checkedAt?: string };

export const academy = {
  name: "스마트해법영어 백운밸리점",
  shortName: "백운밸리점",
  type: "영어교습소",
  director: "Ryan 원장",

  // 학원법상 광고 표시사항 — 교습소 신고증명서/교습비 신고 내역으로 확정할 것
  registration: { value: "제1920호", source: "원장 확인", checkedAt: "2026-11-16" } as Field<string>,
  subject: { value: "영어", source: "교습비 산정 내역서 (교습소명: 스마트해법영어백운밸리점영어교습소)", checkedAt: "2026-11-16" } as Field<string>,
  tuition: {
    value: {
      filedAt: "2025.01.20",
      weeksPerMonth: 4.3, // 매월 정해진 날 납부 기준
      capacity: 8, // 반별 정원
      discount: "형제할인 10,000원",
      groups: [
        {
          label: "초등",
          rows: [
            { name: "파닉스", minutes: 60, perWeek: 5, monthlyMinutes: 1290, fee: 200_000 },
            { name: "영어 A", minutes: 60, perWeek: 5, monthlyMinutes: 1290, fee: 220_000 },
            { name: "영어 B", minutes: 90, perWeek: 3, monthlyMinutes: 1161, fee: 220_000 },
            { name: "영어 C", minutes: 90, perWeek: 5, monthlyMinutes: 1935, fee: 250_000 },
            { name: "영어 D", minutes: 120, perWeek: 3, monthlyMinutes: 1548, fee: 250_000 },
          ],
        },
        {
          label: "중등",
          rows: [
            { name: "영어 A", minutes: 60, perWeek: 5, monthlyMinutes: 1290, fee: 250_000 },
            { name: "영어 B", minutes: 90, perWeek: 3, monthlyMinutes: 1161, fee: 250_000 },
            { name: "영어 C", minutes: 90, perWeek: 5, monthlyMinutes: 1935, fee: 280_000 },
            { name: "영어 D", minutes: 120, perWeek: 3, monthlyMinutes: 1548, fee: 280_000 },
          ],
        },
      ],
    },
    source: "교습비 산정 내역서(별지서식) 2025.01.20",
    checkedAt: "2026-11-16",
  } as Field<{
    filedAt: string;
    weeksPerMonth: number;
    capacity: number;
    discount: string;
    groups: { label: string; rows: { name: string; minutes: number; perWeek: number; monthlyMinutes: number; fee: number }[] }[];
  }>,

  contact: {
    phone: { display: "0507-1383-3732", tel: "050713833732", note: "대표 전화" },
    mobile: { display: "010-8559-3732", tel: "01085593732", note: "문자 상담" },
    smsBody: "상담문의",
  },
  hours: {
    consult: "월–금 13:00–20:00",
    source: "원장 확인 (2026-11-16)",
  },

  address: {
    road: "경기 의왕시 백운중앙로 46",
    detail: "해링턴플레이스1단지 상가 2층 15호",
    landmark: "파리바게트 2층",
    // 원장님 최근 블로그 글·네이버 플레이스 기준으로 확정 (2026-11-17). 이전에 쓰던 "201호(GS편의점 건물 2층)"는 틀린 정보
    verify: false,
    jibun: "경기 의왕시 학의동 1150",
    parking: "주차 가능 · 도착 후 전화 주시면 차단기를 열어 드립니다.",
    geo: { lat: 37.370498, lng: 127.0054621 },
  },

  links: {
    naverBooking: "https://m.booking.naver.com/booking/6/bizes/1362746/items/6576527",
    naverPlace: "https://map.naver.com/p/entry/place/1174367813",
    talktalk: "https://talk.naver.com/wv8reei",
    blog: "https://blog.naver.com/sukjoon331",
    blogRss: "https://rss.blog.naver.com/sukjoon331.xml",
    instagram: "https://www.instagram.com/hb_baegunvalley/",
  },

  reviewKeywords: {
    asOf: "2026.11.16",
    source: "네이버 플레이스 방문자 리뷰 키워드",
    items: [
      { label: "수업이 체계적이에요", count: 17 },
      { label: "맞춤 지도를 잘해줘요", count: 16 },
      { label: "선생님이 열정적이에요", count: 16 },
    ],
  },

  tagline: "시대를 읽어 세대를 만드는 교육현장",
  // 블로그 프로필 소개글(원장 작성)
  intro: [
    "Q. 영어가 마냥 힘들고 어렵기만 하다면?",
    "Q. 학원은 다니고 있지만 실력이 제자리라면?",
    "Q. 영어 학습이 처음이라면?",
  ],
  introClose: "Ryan쌤을 만나보세요! 많은 변화가 시작됩니다.",

  // 블로그 생성기용 지역/학교 키워드
  areaKeywords: ["의왕", "학의동", "백운호수", "백운밸리"],
  schools: ["백운호수초등학교", "백운중학교", "덕장중학교"],
} as const;

export const smsHref = `sms:${academy.contact.mobile.tel}?body=${encodeURIComponent(
  academy.contact.smsBody,
)}`;

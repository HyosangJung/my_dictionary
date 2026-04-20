// 외부 URL을 호출하는 도구 불러오기
const fetch = require("node-fetch");

// ──────────────────────────────
// API 키 & 기본 URL 설정
// ──────────────────────────────
const STDICT_KEY = "65CED42C4060FCCF99B9740E2D500BBC"; // 표준국어대사전
const OPENDICT_KEY = "C5C54EC59709F8F7D6026BC2DB48D8FF"; // 우리말샘

const STDICT_URL = "https://stdict.korean.go.kr/api/search.do";
const OPENDICT_URL = "https://opendict.korean.go.kr/api/search";

// ──────────────────────────────
// 표준국어대사전 검색 함수
// ──────────────────────────────
async function searchStdict(word) {
  // 요청 URL 조립
  const url =
    `${STDICT_URL}` +
    `?key=${STDICT_KEY}` +
    `&q=${encodeURIComponent(word)}` + // 한글을 URL에 안전하게 변환
    `&req_type=json` +                 // JSON 형식으로 받기
    `&num=1`;                          // 결과 1개만

  // 실제 API 호출
  const res = await fetch(url);

  // HTTP 오류 체크 (서버가 응답은 했지만 에러인 경우)
  if (!res.ok) throw new Error("stdict_http_error");

  const data = await res.json();
  const channel = data?.channel;

  // 결과가 없으면 null 반환
  if (!channel?.total || channel.total === 0) return null;

  // 첫 번째 결과에서 필요한 정보만 추출
  const item = channel.item?.[0];
  if (!item) return null;

  const sense = item.sense?.[0];

  return {
    source: "표준국어대사전",          // 어느 사전에서 가져왔는지
    word: item.word,                   // 표제어
    pos: sense?.pos ?? "",             // 품사 (없으면 빈 문자열)
    definition: sense?.definition ?? "", // 뜻풀이
    examples: [],                      // 검색 API엔 예문 없음 (view API 별도)
  };
}

// ──────────────────────────────
// 우리말샘 검색 함수
// ──────────────────────────────
async function searchOpendict(word) {
  const url =
    `${OPENDICT_URL}` +
    `?key=${OPENDICT_KEY}` +
    `&q=${encodeURIComponent(word)}` +
    `&req_type=json` +
    `&num=1`;

  const res = await fetch(url);

  if (!res.ok) throw new Error("opendict_http_error");

  const data = await res.json();
  const channel = data?.channel;

  if (!channel?.total || channel.total === 0) return null;

  const item = channel.item?.[0];
  if (!item) return null;

  const sense = item.sense?.[0];

  return {
    source: "우리말샘",
    word: item.word,
    pos: sense?.pos ?? "",
    definition: sense?.definition ?? "",
    examples: [],
  };
}

// ──────────────────────────────
// 예문 가져오기 — 표준국어대사전 (view API)
// ──────────────────────────────
async function fetchStdictExamples(targetCode) {
  const url =
    `https://stdict.korean.go.kr/api/view.do` +
    `?key=${STDICT_KEY}` +
    `&method=target_code` +
    `&req_type=json` +
    `&q=${targetCode}`;

  const res = await fetch(url);
  if (!res.ok) return [];

  const data = await res.json();

  // 깊숙이 중첩된 구조에서 예문만 꺼내기
  const examples = [];
  const posInfoList = data?.channel?.item?.word_info?.pos_info;
  if (!Array.isArray(posInfoList)) return [];

  for (const posInfo of posInfoList) {
    const senseList = posInfo?.comm_pattern_info?.sense_info;
    if (!Array.isArray(senseList)) continue;
    for (const sense of senseList) {
      const exList = sense?.example_info;
      if (!Array.isArray(exList)) continue;
      for (const ex of exList) {
        if (ex?.example) examples.push(ex.example);
        if (examples.length >= 3) return examples; // 최대 3개
      }
    }
  }

  return examples;
}

// ──────────────────────────────
// 예문 가져오기 — 우리말샘 (view API)
// ──────────────────────────────
async function fetchOpendictExamples(targetCode) {
  const url =
    `https://opendict.korean.go.kr/api/view` +
    `?key=${OPENDICT_KEY}` +
    `&method=target_code` +
    `&req_type=json` +
    `&q=${targetCode}`;

  const res = await fetch(url);
  if (!res.ok) return [];

  const data = await res.json();

  const examples = [];
  const senseList = data?.channel?.item?.sense_info;
  if (!Array.isArray(senseList)) return [];

  for (const sense of senseList) {
    const exList = sense?.example_info;
    if (!Array.isArray(exList)) continue;
    for (const ex of exList) {
      if (ex?.example) examples.push(ex.example);
      if (examples.length >= 3) return examples; // 최대 3개
    }
  }

  return examples;
}

// ──────────────────────────────
// 단축어에서 호출되는 메인 함수
// ──────────────────────────────
module.exports = async (req, res) => {
  // CORS 허용 헤더 (어디서 호출해도 막히지 않게)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  // 검색어 받기
  const word = req.query.q;

  // 검색어 없으면 에러
  if (!word) {
    return res.status(400).json({ error: "검색어(q)가 없습니다." });
  }

  try {
    let result = null;
    let targetCode = null;
    let examples = [];

    // ① 표준국어대사전 먼저 시도
    result = await searchStdict(word);

    if (result) {
      // 표준국어대사전에서 찾았으면 target_code도 별도로 가져오기
      // (예문 조회에 필요)
      const codeRes = await fetch(
        `${STDICT_URL}?key=${STDICT_KEY}&q=${encodeURIComponent(word)}&req_type=json&num=1`
      );
      const codeData = await codeRes.json();
      targetCode = codeData?.channel?.item?.[0]?.target_code;

      if (targetCode) {
        examples = await fetchStdictExamples(targetCode);
      }
    } else {
      // ② 표준국어대사전에 없으면 우리말샘 시도
      result = await searchOpendict(word);

      if (result) {
        const codeRes = await fetch(
          `${OPENDICT_URL}?key=${OPENDICT_KEY}&q=${encodeURIComponent(word)}&req_type=json&num=1`
        );
        const codeData = await codeRes.json();
        targetCode = codeData?.channel?.item?.[0]?.target_code;

        if (targetCode) {
          examples = await fetchOpendictExamples(targetCode);
        }
      }
    }

    // ③ 둘 다 없으면 "없음" 상태 반환
    if (!result) {
      return res.status(200).json({
        found: false,         // 단어 없음 표시
        word: word,
        source: null,
        definition: null,
        examples: [],
      });
    }

    // ④ 결과 반환
    return res.status(200).json({
      found: true,
      word: result.word,
      pos: result.pos,
      source: result.source,       // "표준국어대사전" or "우리말샘"
      definition: result.definition,
      examples: examples,          // 예문 배열 (없으면 빈 배열)
    });

  } catch (err) {
    // API 자체가 응답 안 할 때
    return res.status(502).json({
      error: "api_error",
      message: err.message,
    });
  }
};

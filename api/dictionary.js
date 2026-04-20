const fetch = require("node-fetch");

// ──────────────────────────────
// API 키 설정
// ──────────────────────────────
const STDICT_KEY = "65CED42C4060FCCF99B9740E2D500BBC";
const OPENDICT_KEY = "C5C54EC59709F8F7D6026BC2DB48D8FF";

// ──────────────────────────────
// 텍스트로 안전하게 받는 함수
// ──────────────────────────────
async function safeJson(res) {
  const text = await res.text();
  if (!text || text.trim() === "") return { _raw: "(빈 응답)" };
  try {
    return JSON.parse(text);
  } catch {
    // JSON 변환 실패 시 원문 텍스트 그대로 반환 (XML일 가능성)
    return { _raw: text };
  }
}

// ──────────────────────────────
// 메인 함수
// ──────────────────────────────
module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  const word = req.query.q;
  const debug = req.query.debug === "true"; // 디버그 모드 스위치

  if (!word) {
    return res.status(400).json({ error: "검색어(q)가 없습니다." });
  }

  // ──────────────────────────────
  // 표준국어대사전 호출
  // ──────────────────────────────
  const stdictUrl =
    `https://stdict.korean.go.kr/api/search.do` +
    `?key=${STDICT_KEY}` +
    `&q=${encodeURIComponent(word)}` +
    `&req_type=json` +
    `&num=1`;

  let stdictData = null;
  let stdictError = null;

  try {
    const stdictRes = await fetch(stdictUrl);
    stdictData = await safeJson(stdictRes);
  } catch (e) {
    stdictError = e.message;
  }

  // ──────────────────────────────
  // 우리말샘 호출
  // ──────────────────────────────
  const opendictUrl =
    `https://opendict.korean.go.kr/api/search` +
    `?key=${OPENDICT_KEY}` +
    `&q=${encodeURIComponent(word)}` +
    `&req_type=json` +
    `&num=1`;

  let opendictData = null;
  let opendictError = null;

  try {
    const opendictRes = await fetch(opendictUrl);
    opendictData = await safeJson(opendictRes);
  } catch (e) {
    opendictError = e.message;
  }

  // ──────────────────────────────
  // 디버그 모드: 원문 응답 그대로 반환
  // ──────────────────────────────
  if (debug) {
    return res.status(200).json({
      검색어: word,
      표준국어대사전: {
        요청URL: stdictUrl,
        응답: stdictData,
        오류: stdictError,
      },
      우리말샘: {
        요청URL: opendictUrl,
        응답: opendictData,
        오류: opendictError,
      },
    });
  }

  return res.status(200).json({ message: "debug=true 를 붙여서 확인하세요." });
};

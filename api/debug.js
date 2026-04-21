const fetch = require("node-fetch");

const OPENDICT_KEY = "C5C54EC59709F8F7D6026BC2DB48D8FF";
const OPENDICT_SEARCH_URL = "https://opendict.korean.go.kr/api/search";
const OPENDICT_VIEW_URL = "https://opendict.korean.go.kr/api/view";

async function safeJson(res) {
  const text = await res.text();
  if (!text || text.trim() === "") return { _raw: "(빈 응답)" };
  try {
    return JSON.parse(text);
  } catch {
    return { _raw: text };
  }
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const word = req.query.q;
  const code = req.query.code;

  // ──────────────────────────────
  // 모드 1: ?q=사랑 → 우리말샘 search로 target_code 확인
  // ──────────────────────────────
  if (word && !code) {
    const url =
      `${OPENDICT_SEARCH_URL}?key=${OPENDICT_KEY}` +
      `&q=${encodeURIComponent(word)}` +
      `&req_type=json&num=10&part=word`;

    const searchRes = await fetch(url);
    const searchData = await safeJson(searchRes);

    // item 목록과 각각의 target_code만 추출
    const items = searchData?.channel?.item;
    const itemList = Array.isArray(items) ? items : items ? [items] : [];

    return res.status(200).json({
      total: searchData?.channel?.total,
      // target_code 목록만 보기 좋게 추출
      items: itemList.map((item) => ({
        word: item.word,
        target_code: item.target_code,
        definition: Array.isArray(item.sense)
          ? item.sense[0]?.definition
          : item.sense?.definition,
      })),
    });
  }

  // ──────────────────────────────
  // 모드 2: ?code=숫자 → view API 원문 확인
  // ──────────────────────────────
  if (code) {
    const url =
      `${OPENDICT_VIEW_URL}?key=${OPENDICT_KEY}` +
      `&method=target_code&req_type=json&q=${code}`;

    const viewRes = await fetch(url);
    const viewData = await safeJson(viewRes);

    return res.status(200).json({
      요청URL: url,
      item: viewData?.channel?.item ?? null,
    });
  }

  return res.status(400).json({ error: "q 또는 code 파라미터가 필요합니다." });
};

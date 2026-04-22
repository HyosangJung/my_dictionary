module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  const word = req.query.q;
  const plain = req.query.plain === "true"; // ← 순수 텍스트 모드 여부 확인

  if (!word) {
    return res.status(400).json({ error: "검색어(q)가 없습니다." });
  }

  try {
    const results = await searchOpendict(word);

    if (!results) {
      // plain 모드일 때도 "없음" 텍스트 반환
      if (plain) {
        return res.status(200).send("검색 결과 없음");
      }
      return res.status(200).json({ found: false, word, definitions: [] });
    }

    const definitionsWithExamples = await Promise.all(
      results.map(async (def) => {
        const examples = await fetchExamplesByCode(def.target_code);
        return { word: def.word, definition: def.definition, examples };
      })
    );

    // ── plain 모드: 순수 텍스트로 반환 ──────────────────
    if (plain) {
      const lines = definitionsWithExamples.map((def, i) => {
        // 중괄호 제거, 큰따옴표 제거, 줄바꿈 → 공백
        const cleanDef = (def.definition || "")
          .replace(/[{}]/g, "")       // 중괄호 제거
          .replace(/"/g, "'")         // 큰따옴표 → 작은따옴표
          .replace(/\n/g, " ");       // 줄바꿈 → 공백

        const cleanExamples = (def.examples || [])
          .map(ex =>
            ex.replace(/[{}]/g, "")   // 중괄호 제거
              .replace(/"/g, "'")     // 큰따옴표 → 작은따옴표
              .replace(/\n/g, " ")    // 줄바꿈 → 공백
          )
          .join(" / ");               // 예문 구분자

        return `뜻${i + 1}: ${cleanDef} | 예문: ${cleanExamples}`;
      });

      return res.status(200).send(lines.join(" || ")); // 뜻 구분자
    }
    // ────────────────────────────────────────────────────

    return res.status(200).json({
      found: true,
      word,
      source: "우리말샘",
      definitions: definitionsWithExamples,
    });

  } catch (err) {
    return res.status(502).json({ error: "api_error", message: err.message });
  }
};

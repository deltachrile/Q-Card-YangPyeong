import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import "dotenv/config";

async function startServer() {
  const app = express();
  const PORT = 3000;

  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });

  app.use(express.json({ limit: '10mb' }));

  // API Routes
  app.get("/api/test-connection", async (req, res) => {
    const startTime = Date.now();
    const envLoaded = !!process.env.GEMINI_API_KEY;
    
    if (!envLoaded) {
      return res.status(500).json({ 
        status: "error", 
        message: "GEMINI_API_KEY is missing in server environment.",
        envLoaded,
        duration: Date.now() - startTime
      });
    }

    try {
      const result = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ parts: [{ text: "ping" }] }]
      });
      
      const endTime = Date.now();
      return res.json({
        status: "success",
        message: "API connection is healthy.",
        envLoaded,
        duration: endTime - startTime,
        response: result.text
      });
    } catch (error: any) {
      return res.status(500).json({
        status: "error",
        message: error.message || "Failed to connect to Gemini API.",
        envLoaded,
        duration: Date.now() - startTime
      });
    }
  });

  app.post("/api/summarize", async (req, res) => {
    const { fileName, mimeType, base64Data } = req.body;

    if (!process.env.GEMINI_API_KEY) {
      console.error("DEBUG: GEMINI_API_KEY is missing from process.env");
      return res.status(500).json({ error: "Gemini API key is not configured on the server. Please check your deployment settings." });
    }

    const maxRetries = 2;
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        const result = await Promise.race([
          ai.models.generateContent({
            model: "gemini-1.5-flash", // Use a more stable model for JSON extraction
            contents: [
              {
                parts: [
                  {
                    inlineData: {
                      mimeType: mimeType,
                      data: base64Data,
                    },
                  },
                  {
                    text: `당신은 행정 서류 분석 전문가입니다. 
업로드된 서류(${fileName})를 분석하여 다음 JSON 스키마에 따라 데이터를 추출하십시오.

[중요 지시사항]
- 출력은 반드시 순수한 JSON 데이터여야 합니다.
- "The page content...", "Here is the summary..." 등의 어떠한 서두나 사족도 붙이지 마십시오.
- 마크다운 백틱(\`\`\`json)도 사용하지 말고 오직 { 로 시작해서 } 로 끝나는 JSON만 반환하십시오.

[추출 필드 가이드]
1. 'title': 문서의 공식 사업 명칭.
2. 'content': 실무자가 파악하기 좋게 핵심 내용을 간결한 개조식(~임, ~함)으로 요약. 문장마다 줄바꿈(\n) 포함.
3. 'supplementaryInfo': 신청 방법, 제출 서류, 문의처 등 상세 가이드 정보.
4. 'startDate' & 'endDate': 'YYYY-MM-DD' 형식. 불분명하면 빈 문자열.
5. 'isAlwaysOpen': 상시/수시 접수 여부 (boolean).
6. 'department': 담당 부서/팀 명칭.
7. 'hashtags': 핵심 키워드 4~5개 (배열).`,
                  },
                ],
              },
            ],
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  content: { type: Type.STRING },
                  supplementaryInfo: { type: Type.STRING },
                  startDate: { type: Type.STRING },
                  endDate: { type: Type.STRING },
                  department: { type: Type.STRING },
                  isAlwaysOpen: { type: Type.BOOLEAN },
                  hashtags: { type: Type.ARRAY, items: { type: Type.STRING } },
                },
                required: ["title", "content", "supplementaryInfo"]
              }
            },
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 45000))
        ]) as any;

        const responseText = result.text || "";
        try {
          // Attempt to parse directly
          return res.json(JSON.parse(responseText));
        } catch (parseError) {
          // If direct parse fails, try to extract JSON from the text
          const jsonMatch = responseText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            return res.json(JSON.parse(jsonMatch[0]));
          }
          throw parseError;
        }
      } catch (error: any) {
        attempt++;
        console.error(`Attempt ${attempt} failed:`, error.message);
        if (attempt === maxRetries) {
          return res.status(500).json({ error: error.message || "AI Analysis failed. Information could not be extracted as valid JSON." });
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

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

    const maxRetries = 3;
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        const result = await Promise.race([
          ai.models.generateContent({
            model: "gemini-3-flash-preview",
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
                    text: `행정 서류 공고문(또는 지침서)을 분석하여 아래 필드에 맞게 JSON 형식으로 추출해줘. 
                    
                    파일 정보: ${fileName}
                    
                    중요 가이드라인:
                    1. 'title': 문서의 공식 사업 명칭을 정확히 추출할 것.
                    2. 'content': 실무 공무원들이 한눈에 파악할 수 있도록 핵심 내용을 요약할 것. 
                       - **반드시** 문장마다 줄바꿈을 포함하여 가독성을 높일 것.
                       - 문장은 "~됨", "~함", "~있음" 과 같은 간결한 개조식으로 끝맺음 할 것.
                       - 가독성을 위해 불필요한 수식어를 제거하고 핵심 위주로 정리할 것.
                    3. 'supplementaryInfo': 핵심 요약 외에 실무자가 참고해야 할 구체적인 신청 방법, 제출 서류, 문의처, 주의사항 등을 상세히 정리할 것.
                    4. 'startDate' & 'endDate': 문서에서 확인되는 신청 기간의 시작일과 종료일을 'YYYY-MM-DD' 형식으로 각각 추출할 것.
                       만약 기간이 명확하지 않으면 빈 칸으로 둘 것.
                    4. 'isAlwaysOpen': 만약 공고문에 "상시 접수", "수시 접수", "예산 소진 시까지" 등의 표현이 있다면 true로 설정할 것.
                    5. 'hashtags': 검색에 용이한 키워드 4~5개를 '#' 포함하여 추천할 것.
                    
                    주의: 만약 파일이 HWP/HWPX 형식이라 읽기 어렵다면, 문서 내에 포함된 텍스트나 메타테이터를 최대한 분석하여 내용을 유추해줘. 
                    절대 빈 값으로 두지 말고 가능한 많은 정보를 'content'에 요약해줘.`,
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
          new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 30000))
        ]) as any;

        return res.json(JSON.parse(result.text || "{}"));
      } catch (error: any) {
        attempt++;
        console.error(`Attempt ${attempt} failed:`, error.message);
        if (attempt === maxRetries) {
          return res.status(500).json({ error: error.message || "AI Analysis failed after multiple attempts." });
        }
        // Wait before retrying (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
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

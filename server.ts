import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import "dotenv/config";

const app = express();
const PORT = 3000;

// Security & Parsing
app.use(express.json({ limit: "20mb" }));

// Initialize Gemini
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || "",
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

// --- API Router for Vercel/Serverless Compatibility ---
const apiRouter = express.Router();

apiRouter.get("/test-connection", async (req, res) => {
  const startTime = Date.now();
  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    return res.status(500).json({ 
      status: "error", 
      message: "GEMINI_API_KEY is not configured in the environment.",
    });
  }

  try {
    const result = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: "ping",
    });
    return res.json({
      status: "success",
      duration: Date.now() - startTime,
      response: result.text,
    });
  } catch (error: any) {
    return res.status(500).json({
      status: "error",
      message: error.message || "Failed to connect to Gemini API.",
    });
  }
});

apiRouter.post("/summarize", async (req, res) => {
  const { fileName, mimeType, base64Data } = req.body;

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: "Gemini API key is not configured on the server." });
  }

  try {
    const response = await ai.models.generateContent({
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
              text: `당신은 행정 서류 분석 전문가입니다. 
업로드된 서류(${fileName})를 분석하여 주어진 JSON 스키마에 따라 데이터를 추출하십시오.

[중요 지시사항]
- 출력은 반드시 순수한 JSON 데이터여야 합니다.
- 어떠한 서두나 사족도 붙이지 마십시오.
- 마크다운 백틱도 사용하지 마십시오.

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
          required: ["title", "content", "supplementaryInfo"],
        },
      },
    });

    const responseText = response.text;
    return res.json(JSON.parse(responseText));
  } catch (error: any) {
    console.error("Gemini Error:", error);
    return res.status(500).json({ error: error.message || "AI 분석 중 오류가 발생했습니다." });
  }
});

// Apply API Router
app.use("/api", apiRouter);

// --- Static Client Serving & Vite Integration ---
async function setupVite() {
  try {
    if (process.env.NODE_ENV !== "production") {
      console.log("Starting Vite in development mode...");
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
      console.log("Vite middleware attached.");
    } else {
      console.log("Starting in production mode...");
      const distPath = path.join(process.cwd(), "dist");
      app.use(express.static(distPath));
      app.get("*", (req, res) => {
        // API routes should not fall through to SPA index
        if (!req.path.startsWith("/api")) {
          res.sendFile(path.join(distPath, "index.html"));
        }
      });
    }
  } catch (error) {
    console.error("Error setting up Vite:", error);
  }
}

console.log("Initializing server...");
setupVite().then(() => {
  console.log("Vite setup complete, starting listener...");
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}).catch(err => {
  console.error("Critical server startup error:", err);
});

// Export for Vercel
export default app;


import React, { useState } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, serverTimestamp } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCc7aGqiYo1B3mCPD9ET3RgLaubnw7aicg",
  authDomain: "q-card-a73b5.firebaseapp.com",
  projectId: "q-card-a73b5",
  storageBucket: "q-card-a73b5.firebasestorage.app",
  messagingSenderId: "268832497963",
  appId: "1:268832497963:web:aa4ecf13306153fef2a56e",
  measurementId: "G-WF2J26V5ZG"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export default function App() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // 데이터 추출용 7개 칸 상태 관리
  const [formData, setFormData] = useState({
    title: '', content: '', supplementaryInfo: '',
    startDate: '', endDate: '', department: '', hashtags: []
  });

  // 파일 드래그 앤 드롭 시 실행되는 함수
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);

    try {
      // 1. 파일을 컴퓨터가 읽을 수 있는 Base64 데이터로 변환
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        const base64Raw = reader.result as string;
        const base64Data = base64Raw.split(',')[1];

        // 2. 버셀 서버를 거치지 않고, 구글 AI 스튜디오 최신 키로 다이렉트 호출!
        // 브라우저에서 직접 신호를 쏘기 때문에 버셀의 10초 제한을 완벽하게 우회합니다.
        const ai = new GoogleGenAI({ apiKey: "AIzaSyCDisjG0Rf0P8N7AbwOKB2sIZIJifA5Htk" });

        const response = await ai.models.generateContent({
          model: 'gemini-1.5-flash',
          contents: [
            { inlineData: { mimeType: file.type, data: base64Data } },
            { text: `당신은 행정 서류 분석 전문가입니다. 업로드된 서류를 분석하여 주어진 규칙에 따라 데이터를 추출하십시오.
                     출력은 반드시 순수한 JSON 데이터여야 하며, 어떠한 서두나 사족, 마크다운 백틱(\`\`\`)도 붙이지 마십시오.
                     'title': 문서의 공식 사업 명칭
                     'content': 핵심 내용을 간결한 개조식(~임, ~함)으로 요약. 문장마다 줄바꿈 포함.
                     'supplementaryInfo': 신청 방법 및 상세 가이드
                     'startDate': 시작일 (YYYY-MM-DD)
                     'endDate': 종료일 (YYYY-MM-DD)
                     'department': 담당 부서/팀 명칭
                     'hashtags': 핵심 키워드 4~5개 배열` }
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
                hashtags: { type: Type.ARRAY, items: { type: Type.STRING } }
              },
              required: ["title", "content"]
            }
          }
        });

        // 3. 구글이 돌려준 JSON 데이터를 화면 칸에 자동으로 채우기
        const result = JSON.parse(response.text);
        setFormData({
          title: result.title || '',
          content: result.content || '',
          supplementaryInfo: result.supplementaryInfo || '',
          startDate: result.startDate || '',
          endDate: result.endDate || '',
          department: result.department || '',
          hashtags: result.hashtags || []
        });
        setLoading(false);
      };
    } catch (err: any) {
      console.error(err);
      setError(err.message || "AI 분석 중 오류가 발생했습니다.");
      setLoading(false);
    }
  };

  // 파이어베이스 영구 저장 함수
  const handleSave = async () => {
    try {
      await addDoc(collection(db, "documents"), {
        ...formData,
        createdAt: serverTimestamp()
      });
      alert("파이어베이스 장부에 영구 저장 완료!");
    } catch (err) {
      alert("저장 실패: " + err);
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <h2>통합 데이터 자동 추출 (다이렉트 우회 버전)</h2>
      <div style={{ border: '2px dashed #ccc', padding: '4px', textAlign: 'center', marginBottom: '20px' }}>
        <input type="file" accept="application/pdf" onChange={handleFileUpload} />
        <p>파일을 선택하거나 드래그하여 던지세요 (PDF)</p>
      </div>

      {loading && <p style={{ color: 'blue' }}>🔄 버셀 10초 제한을 우회하여 구글 본청에서 직접 요약 중입니다... 잠시만 기다려주세요.</p>}
      {error && <p style={{ color: 'red' }}>⚠️ 에러 발생: {error}</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <label>[사업 명칭]</label>
        <input type="text" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} style={{ padding: '10px' }} />
        
        <label>[신청 기간]</label>
        <div style={{ display: 'flex', gap: '10px' }}>
          <input type="text" placeholder="시작일" value={formData.startDate} onChange={e => setFormData({...formData, startDate: e.target.value})} style={{ padding: '10px', flex: 1 }} />
          <input type="text" placeholder="종료일" value={formData.endDate} onChange={e => setFormData({...formData, endDate: e.target.value})} style={{ padding: '10px', flex: 1 }} />
        </div>

        <label>[부서명 또는 팀명]</label>
        <input type="text" value={formData.department} onChange={e => setFormData({...formData, department: e.target.value})} style={{ padding: '10px' }} />

        <label>[핵심 요약 정보]</label>
        <textarea value={formData.content} onChange={e => setFormData({...formData, content: e.target.value})} style={{ padding: '10px', height: '150px' }} />

        <label>[상세 가이드]</label>
        <textarea value={formData.supplementaryInfo} onChange={e => setFormData({...formData, supplementaryInfo: e.target.value})} style={{ padding: '10px', height: '100px' }} />

        <button onClick={handleSave} style={{ padding: '15px', backgroundColor: '#0070f3', color: 'white', border: 'none', cursor: 'pointer', fontSize: '16px', marginTop: '10px' }}>
          장부에 저장하기 💾
        </button>
      </div>
    </div>
  );
}
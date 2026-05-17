import React, { useState, useMemo, useEffect } from 'react';
import { 
  Search, 
  Plus, 
  FileUp, 
  X, 
  Tag, 
  Calendar, 
  User, 
  MapPin, 
  Info, 
  Settings, 
  ShieldCheck, 
  Loader2,
  ArrowRight,
  AlertCircle,
  RotateCcw,
  Lock,
  Unlock,
  FileText,
  Hash,
  Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  onSnapshot, 
  query, 
  orderBy, 
  serverTimestamp 
} from 'firebase/firestore';
import { GoogleGenAI, Type } from "@google/genai";

// --- Firebase Configuration (Hardcoded) ---
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

// --- Gemini Configuration (Hardcoded) ---
const GEN_AI = new GoogleGenAI({ apiKey: "AIzaSyCDisjG0Rf0P8N7AbwOKB2sIZIJifA5Htk" });

// --- Utility for Tailwind class merging ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---

interface BusinessData {
  id: string;
  title: string;
  content: string;
  supplementaryInfo: string;
  startDate: string;
  endDate: string;
  department: string;
  isAlwaysOpen: boolean;
  hashtags: string[];
  comments: Comment[];
  createdAt: any;
  editPassword?: string;
}

interface Comment {
  id: string;
  text: string;
  createdAt: string;
}

// --- Main Component ---

export default function App() {
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<BusinessData | null>(null);
  const [isAdminAuthOpen, setIsAdminAuthOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [password, setPassword] = useState('');
  const [unlockPassword, setUnlockPassword] = useState('');
  const [isEditMode, setIsEditMode] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'all' | 'ongoing' | 'completed'>('all');
  
  const [data, setData] = useState<BusinessData[]>([]);

  // Firebase Real-time Sync
  useEffect(() => {
    const q = query(collection(db, 'documents'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as BusinessData[];
      setData(docs);
    });

    return () => unsubscribe();
  }, []);

  // Modal Form State
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [formData, setFormData] = useState<Omit<BusinessData, 'id' | 'createdAt' | 'comments'>>({
    title: '',
    content: '',
    supplementaryInfo: '',
    startDate: '',
    endDate: '',
    department: '',
    isAlwaysOpen: false,
    hashtags: [],
    editPassword: '',
  });
  const [tagInput, setTagInput] = useState('');
  const [commentInput, setCommentInput] = useState('');
  const [sessionAddedTags, setSessionAddedTags] = useState<string[]>([]);
  const [sessionAddedComments, setSessionAddedComments] = useState<string[]>([]);
  const [duplicateError, setDuplicateError] = useState<{ message: string; type: 'warning' | 'info' } | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDebugOpen, setIsDebugOpen] = useState(false);
  const [debugResult, setDebugResult] = useState<{
    status: 'idle' | 'loading' | 'success' | 'error';
    message?: string;
    duration?: number;
    response?: string;
  }>({ status: 'idle' });

  const testConnection = async () => {
    setDebugResult({ status: 'loading' });
    try {
      const start = Date.now();
      const result = await GEN_AI.models.generateContent({
        model: "gemini-1.5-flash",
        contents: [{ parts: [{ text: "ping" }] }]
      });
      const text = result.text;
      setDebugResult({
        status: 'success',
        message: 'Direct Gemini Connection Successful',
        duration: Date.now() - start,
        response: text
      });
    } catch (error: any) {
      setDebugResult({
        status: 'error',
        message: error.message || 'Direct API error'
      });
    }
  };

  useEffect(() => {
    if (selectedItem) {
      const updated = data.find(i => i.id === selectedItem.id);
      if (updated && JSON.stringify(updated) !== JSON.stringify(selectedItem)) {
        setSelectedItem(updated);
      }
    }
  }, [data, selectedItem]);

  // Duplicate Check
  useEffect(() => {
    const newTitle = formData.title.trim();
    if (!newTitle || (!isModalOpen && !selectedItem)) {
      setDuplicateError(null);
      return;
    }

    const normalize = (str: string) => str.replace(/\s+/g, '').toLowerCase();
    const targetNorm = normalize(newTitle);

    let detected: { message: string; type: 'warning' | 'info' } | null = null;
    for (const item of data) {
      if (selectedItem && item.id === selectedItem.id) continue;
      const existingNorm = normalize(item.title);
      if (targetNorm === existingNorm) {
        detected = { message: '이미 동일한 제목의 사업이 등록되어 있습니다.', type: 'warning' };
        break;
      } else if (targetNorm.includes(existingNorm) || existingNorm.includes(targetNorm)) {
        detected = { message: '유사한 제목의 사업이 존재합니다. 중복 여부를 확인해주세요.', type: 'warning' };
        break;
      }
    }
    setDuplicateError(detected);
  }, [formData.title, data, selectedItem, isModalOpen]);

  const filteredResults = useMemo(() => {
    const now = new Date().toISOString().split('T')[0];
    let baseData = data;
    
    if (filterStatus === 'ongoing') {
      baseData = data.filter(item => item.isAlwaysOpen || !item.endDate || item.endDate >= now);
    } else if (filterStatus === 'completed') {
      baseData = data.filter(item => !item.isAlwaysOpen && item.endDate && item.endDate < now);
    }

    if (!searchQuery.trim()) return filterStatus === 'all' ? [] : baseData;

    const query = searchQuery.toLowerCase();
    return baseData.filter(item => {
      const matchText = (item.title + item.content + (item.supplementaryInfo || '') + (item.department || '')).toLowerCase();
      const matchTags = item.hashtags.some(tag => tag.toLowerCase().includes(query));
      return matchText.includes(query) || matchTags;
    });
  }, [searchQuery, data, filterStatus]);

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = (error) => reject(error);
    });
  };

  const extractWithGemini = async (file: File) => {
    setIsExtracting(true);
    setExtractionError(null);
    try {
      const base64Data = await fileToBase64(file);
      
      const prompt = `당신은 행정 서류 분석 전문가입니다. 업로드된 서류(${file.name})를 분석하여 주어진 JSON 스키마에 따라 데이터를 추출하십시오.

[중요 지시사항]
- 출력은 반드시 순수한 JSON 데이터여야 합니다.
- 어떠한 서두나 사족도 붙이지 마십시오.
- 마크다운 백틱도 사용하지 마십시오.

[추출 필드 가이드]
1. 'title': 문서의 공식 사업 명칭.
2. 'content': 실무자가 파악하기 좋게 핵심 내용을 간결한 개조식(~임, ~함)으로 요약. 문장마다 줄바꿈(\\n) 포함.
3. 'supplementaryInfo': 신청 방법, 제출 서류, 문의처 등 상세 가이드 정보.
4. 'startDate' & 'endDate': 'YYYY-MM-DD' 형식. 불분명하면 빈 문자열.
5. 'isAlwaysOpen': 상시/수시 접수 여부 (boolean).
6. 'department': 담당 부서/팀 명칭.
7. 'hashtags': 핵심 키워드 4~5개 (배열).`;

      const result = await GEN_AI.models.generateContent({
        model: "gemini-1.5-flash",
        contents: [
          {
            parts: [
              {
                inlineData: {
                  mimeType: file.type || "application/pdf",
                  data: base64Data,
                },
              },
              { text: prompt },
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

      const text = result.text;
      const parsed = JSON.parse(text);

      setFormData({
        title: parsed.title || "",
        content: parsed.content || "",
        supplementaryInfo: parsed.supplementaryInfo || "",
        startDate: parsed.startDate || "",
        endDate: parsed.endDate || "",
        department: parsed.department || "",
        isAlwaysOpen: parsed.isAlwaysOpen || false,
        hashtags: parsed.hashtags || [],
        editPassword: '',
      });
    } catch (error: any) {
      console.error(error);
      setExtractionError("AI 분석 중 오류가 발생했습니다. 직접 입력해 주세요.");
    } finally {
      setIsExtracting(false);
    }
  };

  const handleFileUpload = (files: FileList | null) => {
    if (files && files[0]) extractWithGemini(files[0]);
  };

  const addTag = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      const newTag = tagInput.trim().startsWith('#') ? tagInput.trim() : `#${tagInput.trim()}`;
      if (!formData.hashtags.includes(newTag)) {
        setFormData({ ...formData, hashtags: [...formData.hashtags, newTag] });
      }
      setTagInput('');
      e.preventDefault();
    }
  };

  const removeTag = (tag: string) => {
    setFormData({ ...formData, hashtags: formData.hashtags.filter(t => t !== tag) });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      setValidationError("사업 명칭을 입력해 주세요.");
      return;
    }

    try {
      if (selectedItem) {
        await updateDoc(doc(db, 'documents', selectedItem.id), { ...formData });
        setSelectedItem(null);
        setIsEditMode(false);
      } else {
        await addDoc(collection(db, 'documents'), {
          ...formData,
          comments: [],
          createdAt: serverTimestamp(),
        });
        setIsModalOpen(false);
      }
      resetForm();
    } catch (error) {
      console.error(error);
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    try {
      await deleteDoc(doc(db, 'documents', itemId));
      handleCloseModal();
    } catch (error) {
      console.error(error);
    }
  };

  const handleAddComment = async (itemId: string, text: string) => {
    if (!text.trim()) return;
    const targetItem = data.find(i => i.id === itemId);
    if (!targetItem) return;

    const newComment = {
      id: Math.random().toString(36).substr(2, 9),
      text: text.trim(),
      createdAt: new Date().toLocaleString(),
    };

    try {
      await updateDoc(doc(db, 'documents', itemId), {
        comments: [...(targetItem.comments || []), newComment]
      });
      setSessionAddedComments(prev => [...prev, newComment.id]);
    } catch (error) {
      console.error(error);
    }
  };

  const resetForm = () => {
    setFormData({
      title: '', content: '', supplementaryInfo: '', startDate: '', endDate: '', department: '', isAlwaysOpen: false, hashtags: [], editPassword: '',
    });
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedItem(null);
    setIsEditMode(false);
    setShowDeleteConfirm(false);
    resetForm();
  };

  const handleSelectItem = (item: BusinessData) => {
    setSelectedItem(item);
    setFormData({
      title: item.title,
      content: item.content,
      supplementaryInfo: item.supplementaryInfo || '',
      startDate: item.startDate,
      endDate: item.endDate,
      department: item.department || '',
      isAlwaysOpen: item.isAlwaysOpen || false,
      hashtags: item.hashtags,
      editPassword: item.editPassword || '',
    });
    setIsEditMode(false);
  };

  const handleUnlock = () => {
    if (selectedItem && (isAdmin || (selectedItem.editPassword || '') === unlockPassword)) {
      setIsEditMode(true);
      setUnlockPassword('');
    } else {
      alert('비밀번호가 일치하지 않습니다.');
    }
  };

  const handleAddCommunityTag = async (itemId: string, newTag: string) => {
    const formattedTag = newTag.trim().startsWith('#') ? newTag.trim() : `#${newTag.trim()}`;
    if (!formattedTag || formattedTag === '#') return;
    const targetItem = data.find(i => i.id === itemId);
    if (!targetItem || targetItem.hashtags.includes(formattedTag)) return;

    try {
      await updateDoc(doc(db, 'documents', itemId), {
        hashtags: [...targetItem.hashtags, formattedTag]
      });
      setSessionAddedTags(prev => [...prev, formattedTag]);
    } catch (error) {
       console.error(error);
    }
  };

  const handleRemoveCommunityTag = async (itemId: string, tagToRemove: string) => {
    const targetItem = data.find(i => i.id === itemId);
    if (!targetItem) return;
    try {
      await updateDoc(doc(db, 'documents', itemId), {
        hashtags: targetItem.hashtags.filter(t => t !== tagToRemove)
      });
      setSessionAddedTags(prev => prev.filter(t => t !== tagToRemove));
    } catch (error) {
       console.error(error);
    }
  };

  const handleRemoveComment = async (itemId: string, commentId: string) => {
    const targetItem = data.find(i => i.id === itemId);
    if (!targetItem) return;
    try {
      await updateDoc(doc(db, 'documents', itemId), {
        comments: targetItem.comments.filter(c => c.id !== commentId)
      });
    } catch (error) {
      console.error(error);
    }
  };

  const handleRewrite = (item: BusinessData) => {
    setFormData({
      title: item.title,
      content: item.content,
      supplementaryInfo: item.supplementaryInfo || '',
      startDate: '',
      endDate: '',
      department: item.department || '',
      isAlwaysOpen: false,
      hashtags: [...item.hashtags],
      editPassword: item.editPassword || '',
    });
    setIsModalOpen(true);
    setSelectedItem(null);
  };

  const handleAdminAuth = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === '1234') {
      setIsAdmin(true);
      setIsAdminAuthOpen(false);
      setPassword('');
    } else {
      alert('비밀번호가 일치하지 않습니다.');
    }
  };

  return (
    <div className="min-h-screen bg-[#fafafa] text-[#333] font-sans text-[15px] selection:bg-blue-100 selection:text-blue-900">
      
      <nav className="fixed top-0 left-0 right-0 h-14 bg-white/80 backdrop-blur-md z-40 border-b border-gray-100 px-6 flex items-center justify-between">
        <div className="flex items-center gap-2 font-bold text-gray-800 tracking-tight">
          <div className="w-6 h-6 bg-blue-600 rounded-md flex items-center justify-center text-white text-[10px]">AI</div>
          큐카드 (Q-Card)
        </div>
        <div className="flex items-center gap-4">
          <div className="text-[12px] text-gray-400 font-medium hidden sm:block">AI 기반 지식 관리 서비스</div>
          <button onClick={() => setIsDebugOpen(true)} className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-blue-500 transition-colors">
            <Settings size={18} />
          </button>
        </div>
      </nav>

      <main className="pt-24 pb-20 px-6 max-w-6xl mx-auto flex flex-col items-center">
        
        <motion.div animate={{ marginTop: (searchQuery || filterStatus !== 'all') ? '0rem' : '15vh' }} className="w-full text-center">
          {(!searchQuery && filterStatus === 'all') && (
            <div className="mb-10">
              <h1 className="text-4xl font-black text-gray-900 mb-4 tracking-tight">큐카드 (Q-Card)</h1>
              <p className="text-gray-500 max-w-xl mx-auto font-medium">사업명, 키워드 등 무엇이든 검색해보세요.</p>
            </div>
          )}

          <div className="relative w-full max-w-3xl mx-auto flex items-center gap-3">
            <div className="relative flex-1 group">
              <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors" size={24} />
              <input 
                type="text" 
                placeholder="검색어를 입력하세요..."
                className="w-full bg-white border border-gray-200 rounded-full h-16 pl-16 pr-20 text-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-xl shadow-gray-200/40"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="hidden sm:flex bg-gray-100 p-1 rounded-2xl h-16 shrink-0 border border-gray-200/50 shadow-[inset_0_2px_4px_rgba(0,0,0,0.05)]">
              <button onClick={() => setFilterStatus(filterStatus === 'ongoing' ? 'all' : 'ongoing')} className={cn("px-5 rounded-[14px] flex flex-col items-center justify-center transition-all min-w-[80px]", filterStatus === 'ongoing' ? "bg-white text-blue-600 shadow-md ring-1 ring-black/5" : "text-gray-400")}>
                <span className="text-[9px] font-black uppercase tracking-tight">Active</span>
                <span className="text-[11px] font-extrabold whitespace-nowrap">진행중</span>
              </button>
              <button onClick={() => setFilterStatus(filterStatus === 'completed' ? 'all' : 'completed')} className={cn("px-5 rounded-[14px] flex flex-col items-center justify-center transition-all min-w-[80px]", filterStatus === 'completed' ? "bg-white text-gray-600 shadow-md ring-1 ring-black/5" : "text-gray-400")}>
                <span className="text-[9px] font-black uppercase tracking-tight">Closed</span>
                <span className="text-[11px] font-extrabold whitespace-nowrap">완료 사업</span>
              </button>
            </div>

            <button onClick={() => setIsModalOpen(true)} className="w-16 h-16 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl flex items-center justify-center transition-all shadow-lg shadow-blue-500/30 active:scale-95 shrink-0 group">
              <Plus size={32} className="group-hover:rotate-90 transition-transform duration-300" />
            </button>
          </div>
        </motion.div>

        <div className="w-full mt-14 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <AnimatePresence mode="popLayout">
            {filteredResults.map((item, idx) => (
              <motion.div 
                key={item.id}
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: idx * 0.05 }}
                layout
                onClick={() => handleSelectItem(item)}
                className="group bg-white overflow-hidden rounded-xl border border-gray-100 shadow-sm hover:shadow-md hover:border-blue-300 transition-all cursor-pointer flex flex-col h-full"
              >
                <div className="flex flex-col h-full">
                  <div className="bg-gray-50/50 p-3 border-b border-gray-100 flex-grow">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1 text-[9px] font-black text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded tracking-wider uppercase">
                          <FileText size={9} strokeWidth={3} /> 큐카드(Q-Card)
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {item.editPassword && <div className="text-amber-500 opacity-60"><Lock size={10} /></div>}
                      </div>
                    </div>
                    <h3 className="font-bold text-[13px] text-gray-800 leading-snug line-clamp-2 mb-2 group-hover:text-blue-600">{item.title}</h3>
                    <div className="bg-white rounded-lg p-2.5 border border-gray-100 shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)] min-h-[3.5rem]">
                      <p className="text-[11px] text-gray-500 line-clamp-3 leading-relaxed">{item.content}</p>
                    </div>
                  </div>
                  <div className="p-3 bg-white flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Calendar size={11} className="text-gray-400 shrink-0" />
                        <span className="text-[10px] font-bold text-gray-500 truncate">
                          {item.isAlwaysOpen ? '상시 접수' : (item.endDate || '미정')}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 min-w-0">
                        <User size={11} className="text-gray-400 shrink-0" />
                        <span className="text-[10px] font-bold text-gray-500 truncate">{item.department}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {item.hashtags.slice(0, 3).map(tag => (
                        <span key={tag} className="text-[9px] font-bold text-blue-400 bg-blue-50/20 px-1.5 py-0.5 rounded border border-blue-100/10">{tag}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </main>

      <footer className="fixed bottom-6 left-6 z-30">
        {!isAdmin ? (
          <button onClick={() => setIsAdminAuthOpen(true)} className="text-[11px] text-gray-400 hover:text-gray-600 flex items-center gap-2 bg-white/60 px-4 py-2 rounded-full border border-gray-100 backdrop-blur-sm">
            <ShieldCheck size={13} /> 관리 시스템 인증
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-blue-600 font-extrabold bg-blue-50 px-4 py-2 rounded-full border border-blue-100 flex items-center gap-2">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" /> 전문가 관리자 모드
            </span>
          </div>
        )}
      </footer>

      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={handleCloseModal} className="absolute inset-0 bg-black/50 backdrop-blur-md" />
            <motion.div initial={{ scale: 0.9, opacity: 0, y: 30 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 30 }} className="relative w-full max-w-4xl bg-white rounded-[24px] shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
              <div className="flex items-center justify-between p-4 border-b">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white text-[10px]">AI</div>
                  <div>
                    <h2 className="text-lg font-black text-gray-900 tracking-tight">통합 데이터 자동 추출</h2>
                  </div>
                </div>
                <button onClick={handleCloseModal} className="text-gray-300 hover:text-gray-900"><X size={24} /></button>
              </div>

              <div className="p-4 overflow-y-auto bg-[#fafafa]">
                <div className="mb-4">
                  <label 
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFileUpload(e.dataTransfer.files); }}
                    className={cn("w-full h-20 border-2 border-dashed rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all", isExtracting ? "border-blue-500 bg-white" : "border-gray-200 bg-white")}
                  >
                    {isExtracting ? (
                      <div className="flex flex-col items-center gap-1">
                        <Loader2 className="animate-spin text-blue-500" size={24} />
                        <p className="text-blue-600 font-black text-xs">실시간 정밀 분석 중...</p>
                      </div>
                    ) : (
                      <>
                        <FileUp className="text-gray-300 mb-0.5" size={24} />
                        <p className="text-gray-600 font-bold text-xs">파일을 여기에 드래그하거나 클릭 (PDF)</p>
                      </>
                    )}
                    <input type="file" className="hidden" onChange={(e) => handleFileUpload(e.target.files)} accept=".pdf,.png,.jpg,.jpeg" />
                  </label>
                </div>

                <div className="space-y-3">
                  <div className="bg-white p-4 rounded-xl border">
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">[사업 명칭]</label>
                    <input type="text" className="w-full border-b-2 py-1 text-lg font-bold focus:outline-none focus:border-blue-600" value={formData.title} onChange={(e) => setFormData({...formData, title: e.target.value})} />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="bg-white p-3 rounded-xl border">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">[신청 기간]</label>
                      <input type="text" className="w-full bg-gray-50/50 rounded-lg px-2.5 py-1 text-[11px] mt-1" placeholder="YYYY-MM-DD" value={formData.endDate} onChange={(e) => setFormData({...formData, endDate: e.target.value})} />
                    </div>
                    <div className="bg-white p-3 rounded-xl border">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">[부서명 또는 팀명]</label>
                      <input type="text" className="w-full bg-gray-50/50 rounded-lg px-3 py-1 text-[11px] mt-1" value={formData.department} onChange={(e) => setFormData({...formData, department: e.target.value})} />
                    </div>
                    <div className="bg-white p-3 rounded-xl border">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">[핵심 키워드]</label>
                      <div className="flex flex-wrap gap-1 mb-1 mt-1">
                        {formData.hashtags.map(tag => (
                          <span key={tag} className="bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full text-[9px] font-black border border-blue-100">{tag}</span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm">
                    <label className="block text-[10px] font-black text-gray-400 mb-1.5 uppercase tracking-widest">[핵심 요약 정보]</label>
                    <textarea 
                      className="w-full bg-gray-50/50 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-xs h-36 resize-none leading-relaxed text-gray-700 font-medium whitespace-pre-wrap"
                      value={formData.content}
                      onChange={(e) => setFormData({...formData, content: e.target.value})}
                    />
                  </div>

                  <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm">
                    <label className="block text-[10px] font-black text-gray-400 mb-1.5 uppercase tracking-widest">[상세 가이드 / 기타 사항]</label>
                    <textarea 
                      className="w-full bg-gray-50/50 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-xs h-36 resize-none leading-relaxed text-gray-700 font-medium whitespace-pre-wrap"
                      value={formData.supplementaryInfo}
                      onChange={(e) => setFormData({...formData, supplementaryInfo: e.target.value})}
                    />
                    <div className="mt-2 flex items-center justify-end gap-2">
                       <input type="password" placeholder="수정 비밀번호 (선택)" className="bg-gray-50 px-3 py-1 text-[10px] w-32 border rounded" value={formData.editPassword} onChange={(e) => setFormData({...formData, editPassword: e.target.value})} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 border-t flex justify-end gap-2 bg-white">
                <button onClick={resetForm} className="px-5 py-2 text-gray-400 font-bold hover:bg-gray-50 text-sm">초기화</button>
                <button onClick={handleCloseModal} className="px-5 py-2 text-gray-400 font-bold hover:bg-gray-50 text-sm">닫기</button>
                <button onClick={handleSubmit} className="px-8 py-2 rounded-xl font-black bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-500/20 text-sm flex items-center gap-2">장부에 저장하기 💾 <ArrowRight size={18} /></button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedItem && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white w-full max-w-4xl max-h-[90vh] rounded-[24px] overflow-hidden shadow-2xl flex flex-col relative border">
              <div className="bg-white px-6 py-4 border-b flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center"><FileText size={20} /></div>
                  <h2 className="text-lg font-black text-gray-900 tracking-tight">{selectedItem.title}</h2>
                </div>
                <button onClick={handleCloseModal} className="text-gray-300 hover:text-gray-900"><X size={24} /></button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 bg-gray-50/30">
                <div className="max-w-3xl mx-auto space-y-6">
                  {!isEditMode && (
                    <div className="rounded-xl p-3 flex items-center justify-between bg-gray-800 shadow-md">
                      <div className="flex items-center gap-2 text-white">
                        <Lock size={14} /> <span className="text-[12px] font-black">수정 잠금 해제</span>
                      </div>
                      <div className="flex gap-2">
                        {(!isAdmin && selectedItem.editPassword) && (
                          <input type="password" placeholder="비밀번호" className="w-24 bg-white/10 rounded-lg px-2 text-white text-[11px] focus:outline-none" value={unlockPassword} onChange={(e) => setUnlockPassword(e.target.value)} />
                        )}
                        <button onClick={handleUnlock} className="bg-white text-blue-600 px-3 py-1 rounded-lg text-[11px] font-black">수정하기</button>
                      </div>
                    </div>
                  )}

                  {!isEditMode ? (
                    <div className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="bg-white p-4 rounded-2xl border shadow-sm">
                          <span className="text-[10px] font-black text-gray-300 uppercase block mb-1 font-bold">[신청 기간]</span>
                          <span className="text-[13px] font-black text-gray-800">{selectedItem.isAlwaysOpen ? '상시 접수' : selectedItem.endDate}</span>
                        </div>
                        <div className="bg-white p-4 rounded-2xl border shadow-sm">
                          <span className="text-[10px] font-black text-gray-300 uppercase block mb-1 font-bold">[담당 부서]</span>
                          <span className="text-[13px] font-black text-gray-800">{selectedItem.department}</span>
                        </div>
                        <div className="bg-white p-4 rounded-2xl border shadow-sm md:col-span-2">
                          <span className="text-[10px] font-black text-gray-300 uppercase block mb-1 font-bold">[핵심 키워드]</span>
                          <div className="flex flex-wrap gap-1.5">
                            {selectedItem.hashtags.map(tag => (
                              <span key={tag} className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">{tag}</span>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="bg-white rounded-3xl border shadow-sm overflow-hidden">
                        <div className="bg-blue-50/50 px-6 py-3 border-b text-[10px] font-black text-blue-600 uppercase">[핵심 요약 정보]</div>
                        <div className="p-7 text-[16px] leading-[1.8] font-bold text-gray-800 whitespace-pre-wrap">{selectedItem.content}</div>
                      </div>

                      <div className="bg-white rounded-3xl border shadow-sm overflow-hidden">
                        <div className="bg-amber-50/50 px-6 py-3 border-b text-[10px] font-black text-amber-600 uppercase">[상세 가이드 / 기타 사항]</div>
                        <div className="p-7 text-[13px] leading-[1.8] font-medium text-gray-700 whitespace-pre-wrap">{selectedItem.supplementaryInfo}</div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                       <input type="text" className="w-full bg-white p-4 rounded-xl border text-sm font-bold" value={formData.title} onChange={(e) => setFormData({...formData, title: e.target.value})} />
                       <div className="grid grid-cols-2 gap-4">
                          <input type="text" className="bg-white p-4 rounded-xl border text-xs" placeholder="종료일" value={formData.endDate} onChange={(e) => setFormData({...formData, endDate: e.target.value})} />
                          <input type="text" className="bg-white p-4 rounded-xl border text-xs" placeholder="부서명" value={formData.department} onChange={(e) => setFormData({...formData, department: e.target.value})} />
                       </div>
                       <textarea className="w-full bg-white p-4 rounded-xl border text-xs h-64 h-60" value={formData.content} onChange={(e) => setFormData({...formData, content: e.target.value})} />
                       <textarea className="w-full bg-white p-4 rounded-xl border text-xs h-40" value={formData.supplementaryInfo} onChange={(e) => setFormData({...formData, supplementaryInfo: e.target.value})} />
                       <button onClick={handleSubmit} className="w-full bg-blue-600 text-white py-4 rounded-xl font-black">저장하기</button>
                    </div>
                  )}

                  <div className="bg-white rounded-3xl border shadow-sm p-6 space-y-4">
                    <h4 className="text-sm font-black text-gray-900 uppercase">[추가 보완 정보]</h4>
                    <div className="space-y-3">
                      {selectedItem.comments?.map(comment => (
                        <div key={comment.id} className="bg-gray-50/50 p-3 rounded-xl border text-[12px] flex justify-between items-center group">
                          <div>
                            <div className="text-[9px] opacity-50 font-bold mb-1">{comment.createdAt}</div>
                            <p className="text-gray-700 font-medium">{comment.text}</p>
                          </div>
                          <button onClick={() => handleRemoveComment(selectedItem.id, comment.id)} className="text-gray-300 hover:text-red-500"><Trash2 size={12} /></button>
                        </div>
                      ))}
                      <div className="flex gap-2">
                        <input className="flex-1 bg-gray-50 rounded-xl px-4 text-xs" placeholder="보완 내용 입력..." value={commentInput} onChange={(e) => setCommentInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (handleAddComment(selectedItem.id, commentInput), setCommentInput(''))} />
                        <button onClick={() => { handleAddComment(selectedItem.id, commentInput); setCommentInput(''); }} className="bg-gray-900 text-white px-6 py-2 rounded-xl font-black text-[11px]">등록</button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white px-6 py-4 border-t flex justify-end gap-2">
                {isEditMode && <button onClick={() => handleDeleteItem(selectedItem.id)} className="bg-red-50 text-red-600 px-6 rounded-xl font-black text-xs">삭제</button>}
                <button onClick={handleCloseModal} className="px-6 py-2 rounded-xl text-gray-400 font-black border">닫기</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isAdminAuthOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsAdminAuthOpen(false)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl p-8">
              <h2 className="text-xl font-bold mb-6 text-center tracking-tight font-black">관리자 인증</h2>
              <form onSubmit={handleAdminAuth} className="space-y-4">
                <input type="password" autoFocus placeholder="비밀번호 입력" className="w-full bg-gray-50 border rounded-xl px-4 py-3 focus:outline-none" value={password} onChange={(e) => setPassword(e.target.value)} />
                <button type="submit" className="w-full bg-blue-600 text-white py-3 rounded-xl font-black">인증하기</button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isDebugOpen && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-6" onClick={() => setIsDebugOpen(false)}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl p-8" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-black text-gray-900 mb-4 font-black">Gemini API 시스템 상태</h3>
              <div className="bg-gray-900 rounded-2xl p-6 text-white font-mono text-[11px] mb-6 whitespace-pre-wrap">
                 {debugResult.status === 'idle' && "> Ready..."}
                 {debugResult.status === 'loading' && "> Analyzing..."}
                 {debugResult.status === 'success' && `> Status: ${debugResult.status}\n> Duration: ${debugResult.duration}ms\n> Response: ${debugResult.response}`}
                 {debugResult.status === 'error' && `> Error: ${debugResult.message}`}
              </div>
              <button 
                onClick={testConnection}
                className="w-full h-14 bg-gray-900 text-white rounded-2xl font-black hover:bg-black transition-all shadow-xl active:scale-95 flex items-center justify-center"
              >
                {debugResult.status === 'loading' ? "Loading..." : "연결 테스트 시작"}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

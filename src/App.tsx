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
import { motion, AnimatePresence } from 'motion/react';
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
  getDocFromServer 
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// --- Firebase Initialization ---
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// --- Error Handling Utilities ---
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: null, 
      email: null,
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/** Utility for Tailwind class merging */
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---

interface BusinessData {
  id: string;
  title: string;
  content: string;      /** 통합 요약 내용 */
  supplementaryInfo: string; /** 추가 보완 정보 */
  startDate: string;    /** 신청 시작일 (YYYY-MM-DD) */
  endDate: string;      /** 신청 종료일 (YYYY-MM-DD) */
  department: string;   /** 부서명 또는 팀명 */
  isAlwaysOpen: boolean; /** 상시 여부 */
  hashtags: string[];
  comments: Comment[];  /** 보완/추가 내용 댓글 */
  createdAt: string;
  editPassword?: string; /** 수정용 비밀번호 (선택사항) */
}

interface Comment {
  id: string;
  text: string;
  createdAt: string;
}

// --- Initial Data ---
const INITIAL_DATA: BusinessData[] = [
  {
    id: '1',
    title: '2026년 농림축산식품사업 시행지침서',
    content: '- 농업인, 농업법인, 생산자단체를 대상으로 보조금을 지원함.\n- 농가당 최대 60만원 및 맞춤형 정책자금을 지급함.\n- 지자체 농정부서 방문 또는 온라인 시스템으로 접수함.',
    supplementaryInfo: '- 신청 방법: 지자체 방문 또는 홈페이지 접수\n- 제출 서류: 사업신청서, 사업계획서, 농업경영체 등록확인서\n- 문의처: 농정지원과 (02-1234-5678)',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    department: '농정지원과',
    isAlwaysOpen: false,
    hashtags: ['#2026년', '#농림축산', '#정부지침', '#보조금'],
    comments: [],
    createdAt: '2026-03-02',
    editPassword: '',
  }
];

// --- Main Component ---

export default function App() {
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<BusinessData | null>(null); // 상세 보기용
  const [isAdminAuthOpen, setIsAdminAuthOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [password, setPassword] = useState('');
  const [unlockPassword, setUnlockPassword] = useState(''); // 게시물 잠금 해제용
  const [isEditMode, setIsEditMode] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'all' | 'ongoing' | 'completed'>('all');
  
  const [data, setData] = useState<BusinessData[]>([]);

  // Firebase Real-time Sync
  useEffect(() => {
    const q = query(collection(db, 'qcards'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as BusinessData[];
      setData(docs);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'qcards');
    });

    return () => unsubscribe();
  }, []);

  // Connection Test
  useEffect(() => {
    async function testFirebase() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error: any) {
        if (error.message?.includes('offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    }
    testFirebase();
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
    envLoaded?: boolean;
    response?: string;
  }>({ status: 'idle' });

  const testConnection = async () => {
    setDebugResult({ status: 'loading' });
    try {
      const start = Date.now();
      const res = await fetch('/api/test-connection');
      const data = await res.json();
      setDebugResult({
        status: res.ok ? 'success' : 'error',
        ...data,
        duration: data.duration || (Date.now() - start)
      });
    } catch (error: any) {
      setDebugResult({
        status: 'error',
        message: error.message || 'Network error'
      });
    }
  };

  useEffect(() => {
    // Sync selectedItem with latest data from Firestore
    if (selectedItem) {
      const updated = data.find(i => i.id === selectedItem.id);
      if (updated) {
        // Only update if there's a difference to avoid infinite loops if any
        if (JSON.stringify(updated) !== JSON.stringify(selectedItem)) {
          setSelectedItem(updated);
        }
      }
    }
  }, [data, selectedItem]);

  // Centralized Advanced Duplicate Check
  useEffect(() => {
    const newTitle = formData.title.trim();
    if (!newTitle || (!isModalOpen && !selectedItem)) {
      setDuplicateError(null);
      return;
    }

    // Extract year from string (e.g., "2026년", "26년", "2026")
    const extractYear = (str: string, dateStr: string | null) => {
      if (dateStr) return dateStr.substring(0, 4);
      const yearMatch = str.match(/\b(20\d{2}|[12]\d)년?\b/);
      if (yearMatch) {
        const y = yearMatch[1];
        return y.length === 2 ? "20" + y : y;
      }
      return null;
    };

    const normalize = (str: string) => {
      let normalized = str.replace(/\s+/g, '').toLowerCase();
      // Remove years like 2026년, 26년
      normalized = normalized.replace(/\b(20\d{2}|[12]\d)년?\b/g, '');
      // Generic administrative stop-words
      ['지원사업', '경기도', '양평군', '사업', '공고', '안내', '지침서'].forEach(word => {
        normalized = normalized.split(word.toLowerCase()).join('');
      });
      return normalized;
    };

    const targetNorm = normalize(newTitle);
    const targetYear = extractYear(newTitle, formData.startDate || formData.endDate || null);

    let detected: { message: string; type: 'warning' | 'info' } | null = null;

    for (const item of data) {
      if (selectedItem && item.id === selectedItem.id) continue;

      const existingNorm = normalize(item.title);
      const existingYear = extractYear(item.title, item.startDate || item.endDate || null);

      // 1. Hashtag Overlap Check (70%+)
      if (formData.hashtags.length > 0 && item.hashtags.length > 0) {
        const commonTags = formData.hashtags.filter(tag => item.hashtags.includes(tag));
        const overlapRatio = commonTags.length / Math.max(formData.hashtags.length, item.hashtags.length);
        if (overlapRatio >= 0.7) {
          detected = { message: `[성격 유사] 해시태그가 ${Math.round(overlapRatio * 100)}% 일치하는 사업이 있습니다.`, type: 'info' };
        }
      }

      // 2. Title Logic (Stop-word filtered matching)
      let titleMatch = false;
      if (targetNorm.length >= 2 && existingNorm.length >= 2) {
        if (targetNorm === existingNorm) titleMatch = true;
        else if (targetNorm.length >= 3) { // Reduced to 3 chars for better coverage after stripping stop-words
          const minLen = Math.min(targetNorm.length, 4); 
          for (let i = 0; i <= targetNorm.length - minLen; i++) {
            if (existingNorm.includes(targetNorm.substring(i, i + minLen))) {
              titleMatch = true;
              break;
            }
          }
        }
      }

      if (titleMatch) {
        // 3. Year differentiation - CRITICAL FIX
        if (targetYear && existingYear && targetYear !== existingYear) {
          detected = { message: `${existingYear}년에도 시행된 계속 사업으로 추정됩니다. (이전 데이터 참고 가능)`, type: 'info' };
        } else if (targetNorm === existingNorm) {
          detected = { message: '이미 동일한 제목의 사업이 등록되어 있습니다.', type: 'warning' };
        } else {
          detected = { message: '유사한 제목의 사업이 이미 존재합니다. 중복 여부를 확인해주세요.', type: 'warning' };
        }
        break; 
      }
    }

    setDuplicateError(detected);
  }, [formData.title, formData.startDate, formData.endDate, formData.hashtags, data, selectedItem, isModalOpen]);

  // Global ESC key listener to close all modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCloseModal();
        setIsAdminAuthOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // --- Logic ---

  const filteredResults = useMemo(() => {
    const now = new Date().toISOString().split('T')[0];
    
    let baseData = data;
    
    // Status Filter Logic
    if (filterStatus === 'ongoing') {
      baseData = data.filter(item => 
        item.isAlwaysOpen || 
        !item.endDate || 
        item.endDate >= now
      );
    } else if (filterStatus === 'completed') {
      baseData = data.filter(item => 
        !item.isAlwaysOpen && 
        item.endDate && 
        item.endDate < now
      );
    }

    if (!searchQuery.trim()) {
      // If filter is active but no search, show the filtered list
      // If no filter ('all') and no search, show empty (original behavior)
      return filterStatus === 'all' ? [] : baseData;
    }

    const query = searchQuery.toLowerCase().replace('#', '');
    return baseData.filter(item => {
      const matchText = (
        item.title + 
        item.content + 
        (item.supplementaryInfo || '') +
        item.startDate +
        item.endDate +
        (item.department || '') +
        (item.comments?.map(c => c.text).join(' ') || '')
      ).toLowerCase();
      const matchTags = item.hashtags.some(tag => tag.toLowerCase().includes(query));
      return matchText.includes(query) || matchTags;
    });
  }, [searchQuery, data, filterStatus]);

  const handleFileUpload = async (files: FileList | null) => {
    if (files && files.length > 0) {
      const file = files[0];
      const fileName = file.name.toLowerCase();
      
      // Basic check for HWP (Gemini doesn't support it natively well)
      if (fileName.endsWith('.hwp') || fileName.endsWith('.hwpx')) {
        setExtractionError('HWP/HWPX 파일은 AI 직접 분석 지원이 제한적일 수 있습니다. 가급적 PDF로 변환하여 업로드해주세요.');
      } else {
        setExtractionError(null);
      }

      await extractWithGemini(file);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64String = (reader.result as string).split(',')[1];
        resolve(base64String);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const extractWithGemini = async (file: File) => {
    setIsExtracting(true);
    setFormData({ 
      title: '', content: '', supplementaryInfo: '', startDate: '', endDate: '', department: '', hashtags: [], editPassword: '', isAlwaysOpen: false
    });

    try {
      const base64Data = await fileToBase64(file);
      const fileName = file.name.toLowerCase();
      let mimeType = file.type || "application/octet-stream";
      
      // MimeType mapping for better backend processing
      if (fileName.endsWith('.pdf')) mimeType = 'application/pdf';
      else if (fileName.endsWith('.png')) mimeType = 'image/png';
      else if (fileName.endsWith('.jpg') || fileName.endsWith('.jpeg')) mimeType = 'image/jpeg';
      else if (fileName.endsWith('.hwp')) mimeType = 'application/x-hwp';
      else if (fileName.endsWith('.hwpx')) mimeType = 'application/zip';

      const response = await fetch('/api/summarize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileName: file.name,
          mimeType,
          base64Data,
        }),
      });

      const contentType = response.headers.get('content-type');
      if (!response.ok) {
        let errorMessage = 'Server error during analysis';
        if (contentType && contentType.includes('application/json')) {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } else {
          const textError = await response.text();
          console.error('Non-JSON error response:', textError);
          errorMessage = `HTTP ${response.status}: 서버에서 잘못된 응답을 받았습니다. API 설정을 확인해주세요.`;
        }
        throw new Error(errorMessage);
      }

      if (!contentType || !contentType.includes('application/json')) {
        const textResponse = await response.text();
        console.error('Expected JSON but received:', textResponse);
        throw new Error('서버가 JSON이 아닌 데이터를 반환했습니다. 백엔드 구성을 확인하세요.');
      }

      const result = await response.json();
      
      const processText = (text: string) => {
        if (!text) return "";
        return text.replace(/\\n/g, '\n').replace(/\n\s*\n/g, '\n');
      };

      const extractedTitle = result.title || file.name.replace(/\.[^/.]+$/, "");
      
      setFormData({
        title: extractedTitle,
        content: processText(result.content || ""),
        supplementaryInfo: processText(result.supplementaryInfo || ""),
        startDate: result.startDate || "",
        endDate: result.endDate || "",
        department: result.department || "",
        isAlwaysOpen: result.isAlwaysOpen || false,
        hashtags: result.hashtags || [],
        editPassword: '',
      });
    } catch (error: any) {
      console.error("Gemini Extraction Error:", error);
      setExtractionError(error.message || "AI 분석 중 오류가 발생했습니다. 직접 입력하시거나 PDF 파일을 권장합니다.");
      
      setFormData({
        ...formData,
        title: file.name.replace(/\.[^/.]+$/, ""),
        content: "분석에 실패함. 내용을 직접 확인하여 기입이 필요함.",
      });
    } finally {
      setIsExtracting(false);
    }
  };

  const handleDateChange = (field: 'startDate' | 'endDate', value: string) => {
    const digits = value.replace(/\D/g, '');
    let formatted = value;
    if (digits.length === 8) {
      formatted = `${digits.substring(0, 4)}-${digits.substring(4, 6)}-${digits.substring(6, 8)}`;
    }
    setFormData(prev => ({ ...prev, [field]: formatted }));
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
    setValidationError(null);

    const errors = [];
    if (!formData.title.trim()) errors.push('사업 명칭');
    if (!formData.isAlwaysOpen && (!formData.startDate.trim() || !formData.endDate.trim())) errors.push('신청 기간');
    if (!formData.department.trim()) errors.push('부서명/팀명');
    if (formData.hashtags.length === 0) errors.push('핵심 키워드');
    if (!formData.content.trim()) errors.push('핵심 요약 정보');

    if (errors.length > 0) {
      setValidationError(`필수 정보가 누락되었습니다: ${errors.join(', ')}`);
      return;
    }

    try {
      if (selectedItem) {
        const docRef = doc(db, 'qcards', selectedItem.id);
        await updateDoc(docRef, {
          ...formData,
          updatedAt: new Date().toISOString()
        });
        setSelectedItem(null);
        setIsEditMode(false);
      } else {
        const newItem = {
          ...formData,
          comments: [],
          createdAt: new Date().toISOString().split('T')[0],
        };
        await addDoc(collection(db, 'qcards'), newItem);
        setIsModalOpen(false);
      }
      resetForm();
    } catch (error) {
      handleFirestoreError(error, selectedItem ? OperationType.UPDATE : OperationType.CREATE, 'qcards');
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    try {
      await deleteDoc(doc(db, 'qcards', itemId));
      setShowDeleteConfirm(false);
      handleCloseModal();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `qcards/${itemId}`);
    }
  };

  const handleAddComment = async (itemId: string, text: string) => {
    if (!text.trim()) return;
    
    const newComment: Comment = {
      id: Math.random().toString(36).substr(2, 9),
      text: text.trim(),
      createdAt: new Date().toLocaleString(),
    };

    const targetItem = data.find(i => i.id === itemId);
    if (!targetItem) return;

    const updatedComments = [...(targetItem.comments || []), newComment];

    try {
      const docRef = doc(db, 'qcards', itemId);
      await updateDoc(docRef, { comments: updatedComments });
      
      if (selectedItem && selectedItem.id === itemId) {
        setSessionAddedComments(prev => [...prev, newComment.id]);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `qcards/${itemId}`);
    }
  };

  const resetForm = () => {
    setFormData({
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
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedItem(null);
    setIsEditMode(false);
    setShowDeleteConfirm(false);
    setUnlockPassword('');
    setCommentInput('');
    setSessionAddedTags([]);
    setSessionAddedComments([]);
    resetForm();
    setExtractionError(null);
    setValidationError(null);
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
    setUnlockPassword('');
    setIsEditMode(false);
  };

  const handleUnlock = () => {
    if (selectedItem && (isAdmin || (selectedItem.editPassword || '') === unlockPassword)) {
      // 최신 selectedItem 데이터를 기반으로 폼 데이터 동기화 (커뮤니티 태그 등 포함)
      setFormData({
        title: selectedItem.title,
        content: selectedItem.content,
        supplementaryInfo: selectedItem.supplementaryInfo || '',
        startDate: selectedItem.startDate,
        endDate: selectedItem.endDate,
        department: selectedItem.department || '',
        isAlwaysOpen: selectedItem.isAlwaysOpen || false,
        hashtags: selectedItem.hashtags,
        editPassword: selectedItem.editPassword || '',
      });
      setIsEditMode(true);
      setUnlockPassword('');
    } else {
      alert('비밀번호가 일치하지 않습니다.');
    }
  };

  const handleAddCommunityTag = (itemId: string, newTag: string) => {
    const formattedTag = newTag.trim().startsWith('#') ? newTag.trim() : `#${newTag.trim()}`;
    if (!formattedTag || formattedTag === '#') return;

    setData(prev => prev.map(item => {
      if (item.id === itemId && !item.hashtags.includes(formattedTag)) {
        return { ...item, hashtags: [...item.hashtags, formattedTag] };
      }
      return item;
    }));
    
    if (selectedItem && selectedItem.id === itemId) {
      setSelectedItem(prev => prev && !prev.hashtags.includes(formattedTag) 
        ? { ...prev, hashtags: [...prev.hashtags, formattedTag] } 
        : prev
      );
      setSessionAddedTags(prev => [...prev, formattedTag]);
    }
  };

  const handleRemoveCommunityTag = (itemId: string, tagToRemove: string) => {
    setData(prev => prev.map(item => {
      if (item.id === itemId) {
        return { ...item, hashtags: item.hashtags.filter(t => t !== tagToRemove) };
      }
      return item;
    }));
    
    if (selectedItem && selectedItem.id === itemId) {
      setSelectedItem(prev => prev ? { ...prev, hashtags: prev.hashtags.filter(t => t !== tagToRemove) } : null);
    }
    setSessionAddedTags(prev => prev.filter(t => t !== tagToRemove));
  };

  const handleRemoveComment = (itemId: string, commentId: string) => {
    setData(prev => prev.map(item => {
      if (item.id === itemId) {
        return { ...item, comments: item.comments?.filter(c => c.id !== commentId) || [] };
      }
      return item;
    }));
    if (selectedItem && selectedItem.id === itemId) {
       setSelectedItem(prev => prev ? { ...prev, comments: prev.comments?.filter(c => c.id !== commentId) || [] } : null);
    }
    setSessionAddedComments(prev => prev.filter(t => t !== commentId));
  };

  const handleRewrite = (item: BusinessData) => {
    const commentsText = item.comments && item.comments.length > 0 
      ? "\n\n[기존 보완 및 추가 내용]\n" + item.comments.map(c => `- ${c.text}`).join('\n')
      : "";

    setFormData({
      title: item.title,
      content: item.content + commentsText,
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
    setIsEditMode(false);
  };

  const handleAdminAuth = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === '1234') {
      setIsAdmin(true);
      setIsAdminAuthOpen(false);
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
          <button 
            onClick={() => setIsDebugOpen(true)}
            className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-blue-500 transition-colors"
            title="API 시스템 상태"
          >
            <Settings size={18} />
          </button>
        </div>
      </nav>

      <main className="pt-24 pb-20 px-6 max-w-6xl mx-auto flex flex-col items-center">
        
        <motion.div 
          initial={false}
          animate={{ marginTop: (searchQuery || filterStatus !== 'all') ? '0rem' : '15vh' }}
          className="w-full text-center"
        >
          {(!searchQuery && filterStatus === 'all') && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-10"
            >
              <h1 className="text-4xl font-black text-gray-900 mb-4 tracking-tight">
                큐카드 (Q-Card)
              </h1>
              <p className="text-gray-500 max-w-xl mx-auto font-medium">
                사업명, 키워드, 지침서 분석 등 무엇이든 검색하고 등록해보세요.
              </p>
            </motion.div>
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
            <button 
              className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 bg-gray-50 hover:bg-blue-50 text-gray-400 hover:text-blue-600 rounded-full flex items-center justify-center transition-all active:scale-90"
              title="검색"
            >
              <Search size={20} />
            </button>
          </div>

          <div className="hidden sm:flex bg-gray-100 p-1 rounded-2xl h-16 shrink-0 border border-gray-200/50 shadow-[inset_0_2px_4px_rgba(0,0,0,0.05)]">
            <button 
              onClick={() => setFilterStatus(filterStatus === 'ongoing' ? 'all' : 'ongoing')}
              className={cn(
                "px-5 rounded-[14px] flex flex-col items-center justify-center transition-all min-w-[80px]",
                filterStatus === 'ongoing' ? "bg-white text-blue-600 shadow-md ring-1 ring-black/5" : "text-gray-400 hover:text-gray-500"
              )}
            >
              <span className="text-[9px] font-black uppercase tracking-tight">Active</span>
              <span className="text-[11px] font-extrabold whitespace-nowrap">진행중</span>
            </button>
            <button 
              onClick={() => setFilterStatus(filterStatus === 'completed' ? 'all' : 'completed')}
              className={cn(
                "px-5 rounded-[14px] flex flex-col items-center justify-center transition-all min-w-[80px]",
                filterStatus === 'completed' ? "bg-white text-gray-600 shadow-md ring-1 ring-black/5" : "text-gray-400 hover:text-gray-500"
              )}
            >
              <span className="text-[9px] font-black uppercase tracking-tight">Closed</span>
              <span className="text-[11px] font-extrabold whitespace-nowrap">완료 사업</span>
            </button>
          </div>

          <button 
            onClick={() => setIsModalOpen(true)}
            title="새 문서 자동 추출 등록"
            className="w-16 h-16 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl flex items-center justify-center transition-all shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 active:scale-95 shrink-0 group"
          >
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
                  {/* Top Header & Title */}
                  <div className="bg-gray-50/50 p-3 border-b border-gray-100 flex-grow">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {(!item.isAlwaysOpen && item.endDate && item.endDate < new Date().toISOString().split('T')[0]) ? (
                          <div className="flex items-center gap-1 text-[9px] font-black text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded tracking-wider uppercase">
                            <AlertCircle size={9} strokeWidth={3} />
                            신청마감
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-[9px] font-black text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded tracking-wider uppercase">
                            <FileText size={9} strokeWidth={3} />
                            큐카드(Q-Card)
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {item.editPassword && (
                          <div className="text-amber-500 opacity-60">
                            <Lock size={10} />
                          </div>
                        )}
                        <span className="text-[9px] text-gray-300 font-bold">{item.createdAt}</span>
                      </div>
                    </div>
                    <h3 className="font-bold text-[13px] text-gray-800 leading-snug line-clamp-2 mb-2 group-hover:text-blue-600 transition-colors">
                      {item.title}
                    </h3>
                    {/* Compact Summary Block */}
                    <div className="bg-white rounded-lg p-2.5 border border-gray-100 shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)] min-h-[3.5rem]">
                      <p className="text-[11px] text-gray-500 line-clamp-3 leading-relaxed font-normal">
                        {item.content}
                      </p>
                    </div>
                  </div>

                  {/* Metadata & Footer */}
                  <div className="p-3 bg-white flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Calendar size={11} className="text-gray-400 shrink-0" />
                        <span className={cn(
                          "text-[10px] font-bold truncate", 
                          item.isAlwaysOpen ? "text-blue-600" : (item.endDate && item.endDate < new Date().toISOString().split('T')[0] ? "text-red-500" : "text-gray-500")
                        )}>
                          {item.isAlwaysOpen 
                            ? '상시 접수' 
                            : (item.startDate || item.endDate ? (item.endDate || item.startDate) : '상시')
                          }
                        </span>
                      </div>
                      {item.department && (
                        <div className="flex items-center gap-1.5 min-w-0">
                          <User size={11} className="text-gray-400 shrink-0" />
                          <span className="text-[10px] font-bold text-gray-500 truncate">{item.department}</span>
                        </div>
                      )}
                    </div>
                    
                    {/* Minimalist Hashtags */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex flex-wrap gap-1">
                        {item.hashtags.slice(0, 3).map(tag => (
                          <span key={tag} className="text-[9px] font-bold text-blue-400 bg-blue-50/20 px-1.5 py-0.5 rounded border border-blue-100/10">
                            {tag}
                          </span>
                        ))}
                        {item.hashtags.length > 3 && (
                          <span className="text-[9px] text-gray-300 font-bold py-0.5">+{item.hashtags.length - 3}</span>
                        )}
                      </div>
                      
                      {(!item.isAlwaysOpen && item.endDate && item.endDate < new Date().toISOString().split('T')[0]) && (
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRewrite(item);
                          }}
                          className="flex items-center gap-1 px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all shadow-md active:scale-95 text-[10px] font-black"
                        >
                          <RotateCcw size={10} />
                          <span>재작성</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {(searchQuery || filterStatus !== 'all') && filteredResults.length === 0 && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="col-span-full py-24 text-center"
            >
              <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6 text-gray-200">
                <Search size={40} />
              </div>
              <p className="text-gray-400 text-lg">해당되는 행정 정보가 없습니다.</p>
              <p className="text-gray-300 text-sm mt-1">검색어나 필터 조건을 확인해보세요.</p>
            </motion.div>
          )}
        </div>
      </main>

      <footer className="fixed bottom-6 left-6 z-30">
        {!isAdmin ? (
          <button 
            onClick={() => setIsAdminAuthOpen(true)}
            className="text-[11px] text-gray-400 hover:text-gray-600 transition-all flex items-center gap-2 bg-white/60 px-4 py-2 rounded-full border border-gray-100 backdrop-blur-sm shadow-sm"
          >
            <ShieldCheck size={13} />
            관리 시스템 인증
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-blue-600 font-extrabold bg-blue-50 px-4 py-2 rounded-full border border-blue-100 flex items-center gap-2 backdrop-blur-sm shadow-sm">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
              전문가 관리자 모드
            </span>
            <button onClick={() => setIsAdmin(false)} className="text-[11px] text-gray-400 hover:text-red-500">로그아웃</button>
          </div>
        )}
      </footer>

      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={handleCloseModal}
              className="absolute inset-0 bg-black/50 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 30 }}
              className="relative w-full max-w-4xl bg-white rounded-[24px] shadow-2xl overflow-hidden flex flex-col max-h-[95vh]"
            >
              <div className="flex items-center justify-between p-4 border-b border-gray-50">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white shadow-lg shadow-blue-500/20 text-[10px]">
                    AI
                  </div>
                  <div>
                    <h2 className="text-lg font-black text-gray-900 tracking-tight leading-none">큐카드 생성 (Q-Card)</h2>
                    <p className="text-gray-400 text-[10px]">업로드된 파일을 분석하여 핵심 내용을 추출합니다.</p>
                  </div>
                </div>
                <button onClick={handleCloseModal} className="text-gray-300 hover:text-gray-900 transition-colors p-2">
                  <X size={24} />
                </button>
              </div>

              <div className="p-4 overflow-y-auto bg-[#fafafa]">
                <div className="mb-4">
                  <label 
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFileUpload(e.dataTransfer.files); }}
                    className={cn(
                      "w-full h-20 border-2 border-dashed rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all",
                      isExtracting ? "border-blue-500 bg-white" : 
                      isDragging ? "border-blue-600 bg-blue-50/50 shadow-xl" : "border-gray-200 bg-white hover:border-blue-400 shadow-sm"
                    )}
                  >
                    {isExtracting ? (
                      <div className="flex flex-col items-center gap-1">
                        <Loader2 className="animate-spin text-blue-500" size={24} />
                        <p className="text-blue-600 font-black text-xs animate-pulse">실시간 정밀 분석 중...</p>
                      </div>
                    ) : (
                      <>
                        <FileUp className={cn("text-gray-300 mb-0.5 transition-transform", isDragging && "scale-110 text-blue-500")} size={24} />
                        <p className="text-gray-600 font-bold text-xs">파일을 여기에 드래그하거나 클릭 (PDF)</p>
                        {extractionError && (
                          <div className="mt-1 flex items-center gap-1.5 text-amber-600 bg-amber-50 px-2 py-0.5 rounded text-[9px] border border-amber-100">
                            <AlertCircle size={10} />
                            {extractionError}
                          </div>
                        )}
                      </>
                    )}
                    <input type="file" className="hidden" onChange={(e) => handleFileUpload(e.target.files)} accept=".pdf,.hwp,.hwpx,.png,.jpg,.jpeg" />
                  </label>
                </div>

                <div className="space-y-3">
                  <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">[사업 명칭]</label>
                      {duplicateError && (
                        <div className={cn(
                          "text-[10px] font-black flex items-center gap-1",
                          duplicateError.type === 'warning' ? "text-red-500 animate-bounce" : "text-amber-500"
                        )}>
                          {duplicateError.type === 'warning' ? <AlertCircle size={10} /> : <RotateCcw size={10} />}
                          {duplicateError.type === 'warning' ? '중복 주의' : '계속 사업 안내'}
                        </div>
                      )}
                    </div>
                    <input 
                      type="text" 
                      className={cn(
                        "w-full border-b-2 py-1 text-lg font-bold focus:outline-none transition-all placeholder:text-gray-200",
                        duplicateError?.type === 'warning' ? "border-red-200 text-red-600 focus:border-red-500" : 
                        duplicateError?.type === 'info' ? "border-amber-200 text-amber-600 focus:border-amber-500" :
                        "border-gray-100 focus:border-blue-600 text-gray-900"
                      )}
                      placeholder="분석된 사업명을 입력하세요"
                      value={formData.title}
                      onChange={(e) => {
                        setFormData({...formData, title: e.target.value});
                        if (validationError) setValidationError(null);
                      }}
                    />
                    <p className="text-[10px] text-red-500 font-bold mt-1.5 flex items-center gap-1 opacity-80">
                      <Info size={10} /> {duplicateError ? "동일·유사 사업명이 존재합니다. 기간이 다른 사업은 등록 해주세요." : "중복 등록은 자제해 주시고, 기존 사업카드가 있을 경우 해당 카드에 내용을 추가해 주세요."}
                    </p>
                    {duplicateError && (
                      <p className={cn(
                        "mt-2 text-[11px] font-bold px-3 py-2 rounded-lg border",
                        duplicateError.type === 'warning' ? "text-red-500 bg-red-50 border-red-100" : "text-amber-600 bg-amber-50 border-amber-100"
                      )}>
                        {duplicateError.message}
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm">
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">[신청 기간]</label>
                        <button 
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, isAlwaysOpen: !prev.isAlwaysOpen }))}
                          className={cn(
                            "px-2.5 py-0.5 rounded-full text-[10px] font-black transition-all border",
                            formData.isAlwaysOpen ? "bg-blue-600 border-blue-600 text-white" : "bg-gray-50 border-gray-200 text-gray-400"
                          )}
                        >
                          상시
                        </button>
                      </div>
                      <div className={cn("flex flex-col gap-1.5 transition-opacity", formData.isAlwaysOpen && "opacity-50")}>
                        <div className="relative">
                          <input 
                            type="text" placeholder="시작일 (YYYY-MM-DD)"
                            className="w-full bg-gray-50/50 rounded-lg px-2.5 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-medium text-[11px] text-gray-700 cursor-pointer"
                            value={formData.startDate}
                            onFocus={() => formData.isAlwaysOpen && setFormData(prev => ({ ...prev, isAlwaysOpen: false }))}
                            onChange={(e) => {
                              handleDateChange('startDate', e.target.value);
                              if (formData.isAlwaysOpen) setFormData(prev => ({ ...prev, isAlwaysOpen: false }));
                            }}
                          />
                        </div>
                        <div className="relative">
                          <input 
                            type="text" placeholder="종료일 (YYYY-MM-DD)"
                            className="w-full bg-gray-50/50 rounded-lg px-2.5 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-medium text-[11px] text-gray-700 cursor-pointer"
                            value={formData.endDate}
                            onFocus={() => formData.isAlwaysOpen && setFormData(prev => ({ ...prev, isAlwaysOpen: false }))}
                            onChange={(e) => {
                              handleDateChange('endDate', e.target.value);
                              if (formData.isAlwaysOpen) setFormData(prev => ({ ...prev, isAlwaysOpen: false }));
                            }}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm flex flex-col">
                      <label className="block text-[10px] font-black text-gray-400 mb-1.5 uppercase tracking-widest">[부서명 또는 팀명]</label>
                      <div className="flex-1 flex flex-col justify-center">
                        <input 
                          type="text" 
                          placeholder="담당 부서나 팀을 입력하세요"
                          className="w-full bg-gray-50/50 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-medium text-[11px] text-gray-700"
                          value={formData.department}
                          onChange={(e) => setFormData({...formData, department: e.target.value})}
                        />
                        <p className="mt-2 text-[9px] text-gray-400 leading-tight">예: 회계과, 산업팀 등</p>
                      </div>
                    </div>

                    <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm">
                      <label className="block text-[10px] font-black text-gray-400 mb-1 uppercase tracking-widest">[핵심 키워드]</label>
                      <div className="flex flex-wrap gap-1 mb-1.5 min-h-[18px]">
                        {formData.hashtags.map(tag => (
                          <span key={tag} className="flex items-center gap-1 bg-blue-50/50 text-blue-600 px-1.5 py-0.5 rounded-full text-[9px] font-black border border-blue-100/50">
                            {tag}
                            <button onClick={() => removeTag(tag)} className="hover:text-red-500 ml-0.5 transition-colors"><X size={8} /></button>
                          </span>
                        ))}
                      </div>
                      <div className="relative">
                        <Tag className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-300" size={10} />
                        <input 
                          type="text" placeholder="태그 입력 + Enter"
                          className="w-full bg-gray-50/50 rounded-lg pl-8 pr-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-medium text-[10px] h-[26px]"
                          value={tagInput}
                          onChange={(e) => setTagInput(e.target.value)}
                          onKeyDown={addTag}
                        />
                      </div>
                    </div>
                  </div>

                  {validationError && (
                    <motion.div 
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-red-50 border border-red-200 p-3 rounded-xl flex items-center gap-2 text-red-600 shadow-sm"
                    >
                      <AlertCircle size={16} strokeWidth={3} className="shrink-0" />
                      <span className="text-[11px] font-black">{validationError}</span>
                    </motion.div>
                  )}

                  <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm">
                    <label className="block text-[10px] font-black text-gray-400 mb-1.5 uppercase tracking-widest">[핵심 요약 정보]</label>
                    <textarea 
                      className="w-full bg-gray-50/50 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-xs h-36 resize-none leading-relaxed text-gray-700 font-medium border border-transparent focus:border-blue-100 transition-all whitespace-pre-wrap"
                      placeholder="AI가 분석한 핵심 요약 내용입니다."
                      value={formData.content}
                      onChange={(e) => setFormData({...formData, content: e.target.value})}
                    />
                    <div className="mt-2 flex items-center justify-between gap-4">
                       <p className="text-[9px] text-gray-300">사업의 핵심 내용을 개조식으로 요약한 정보입니다.</p>
                       <div className="flex items-center gap-2 bg-gray-50/50 px-2 py-1 rounded-lg border border-dashed border-gray-200">
                          <Lock size={12} className="text-gray-400" />
                          <input 
                            type="password" placeholder="수정 비밀번호 (선택)"
                            className="bg-transparent text-[10px] focus:outline-none w-32 text-gray-600"
                            value={formData.editPassword}
                            onChange={(e) => setFormData({...formData, editPassword: e.target.value})}
                          />
                       </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 border-t border-gray-50 flex items-center justify-between bg-white shrink-0">
                <p className="text-[11px] text-gray-400 font-medium whitespace-nowrap overflow-hidden text-ellipsis mr-4">분석된 요약 내용을 확인하고 저장하세요.</p>
                <div className="flex gap-2">
                  <button onClick={handleCloseModal} className="px-5 py-2 rounded-xl text-gray-400 font-bold hover:bg-gray-50 text-sm transition-colors">닫기</button>
                  <button 
                    onClick={handleSubmit}
                    className={cn(
                      "px-8 py-2 rounded-xl font-black transition-all shadow-lg flex items-center gap-2 active:scale-95 text-sm",
                      "bg-blue-600 text-white hover:bg-blue-700 shadow-blue-500/20"
                    )}
                  >
                    저장하기 <ArrowRight size={18} />
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isAdminAuthOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsAdminAuthOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl p-8"
            >
              <h2 className="text-xl font-bold mb-6 text-center">관리자 인증</h2>
              <form onSubmit={handleAdminAuth} className="space-y-4">
                <input 
                  type="password" autoFocus placeholder="비밀번호 입력"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button type="submit" className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition-all active:scale-[0.98]">인증하기</button>
                <button type="button" onClick={() => setIsAdminAuthOpen(false)} className="w-full text-gray-400 text-sm hover:text-gray-600 transition-colors">닫기</button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedItem && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex flex-col items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-4xl max-h-[90vh] rounded-[24px] overflow-hidden shadow-2xl flex flex-col relative border border-gray-100"
            >
              {/* Refined Header */}
              <div className="bg-white px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
                    <FileText size={20} strokeWidth={2.5} />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-lg font-black text-gray-900 tracking-tight truncate leading-tight">
                      {isEditMode ? '지침 상세 수정' : selectedItem.title}
                    </h2>
                    <div className="flex items-center gap-2 mt-0.5">
                       <span className="text-gray-400 text-[10px] font-bold">등록일: {selectedItem.createdAt}</span>
                       {selectedItem.editPassword && (
                         <span className="text-amber-600 text-[9px] font-black bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100">보안 문서</span>
                       )}
                    </div>
                  </div>
                </div>
                <button onClick={handleCloseModal} className="w-8 h-8 flex items-center justify-center text-gray-300 hover:text-gray-900 hover:bg-gray-50 rounded-full transition-all">
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-gray-50/30">
                <div className="max-w-3xl mx-auto space-y-6">
                  {/* Unlock Banner (Slimmed or Direct Edit) */}
                  {!isEditMode && (
                    <div className={cn(
                      "rounded-xl p-3 flex items-center justify-between gap-4 shadow-md",
                      selectedItem.editPassword ? "bg-blue-600" : "bg-gray-800"
                    )}>
                      <div className="flex items-center gap-2 text-white">
                        {isAdmin ? <ShieldCheck size={14} className="text-yellow-300" /> : (selectedItem.editPassword ? <Lock size={14} /> : <Unlock size={14} />)}
                        <span className="text-[12px] font-black">
                          {isAdmin ? '관리자 권한 (자유 수정 모드)' : (selectedItem.editPassword ? '수정 잠금 해제' : '자유 수정 가능 모드')}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        {(!isAdmin && selectedItem.editPassword) && (
                          <input 
                            type="password" placeholder="비밀번호"
                            className="w-24 bg-white/10 border border-white/20 rounded-lg px-2 py-1 text-white placeholder:text-white/40 text-[11px] focus:outline-none focus:ring-2 focus:ring-white/30 font-medium"
                            value={unlockPassword}
                            onChange={(e) => setUnlockPassword(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
                          />
                        )}
                        <button 
                          onClick={handleUnlock} 
                          className="bg-white text-blue-600 px-3 py-1 rounded-lg text-[11px] font-black hover:bg-blue-50 transition-colors"
                        >
                          {(isAdmin || !selectedItem.editPassword) ? '수정하기' : '인증'}
                        </button>
                      </div>
                    </div>
                  )}

                  {isEditMode ? (
                    <div className="space-y-4">
                       <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                        <label className="text-[10px] font-black text-gray-400 mb-2 block uppercase">[사업 명칭]</label>
                        <input 
                          type="text" 
                          className={cn(
                            "w-full bg-gray-50 rounded-lg px-3 py-2 text-sm font-bold border transition-all focus:outline-none",
                            duplicateError?.type === 'warning' ? "border-red-200 text-red-600 focus:border-red-500" : 
                            duplicateError?.type === 'info' ? "border-amber-200 text-amber-600 focus:border-amber-500" :
                            "border-transparent focus:border-blue-100 text-gray-900"
                          )}
                          value={formData.title}
                          onChange={(e) => {
                            setFormData({...formData, title: e.target.value});
                          }}
                        />
                        {duplicateError && (
                          <p className={cn(
                            "mt-2 text-[10px] font-bold px-3 py-1.5 rounded-lg border flex items-center gap-1",
                            duplicateError.type === 'warning' ? "text-red-500 bg-red-50 border-red-100" : "text-amber-600 bg-amber-50 border-amber-100"
                          )}>
                            {duplicateError.type === 'warning' ? <AlertCircle size={10} /> : <RotateCcw size={10} />}
                            {duplicateError.message}
                          </p>
                        )}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                          <div className="flex items-center justify-between mb-2">
                            <label className="text-[10px] font-black text-gray-400 block">[신청 기간]</label>
                            <button 
                              type="button"
                              onClick={() => setFormData(prev => ({ ...prev, isAlwaysOpen: !prev.isAlwaysOpen }))}
                              className={cn(
                                "px-2.5 py-0.5 rounded-full text-[10px] font-black transition-all border",
                                formData.isAlwaysOpen ? "bg-blue-600 border-blue-600 text-white" : "bg-gray-50 border-gray-200 text-gray-400"
                              )}
                            >
                              상시
                            </button>
                          </div>
                          <div className={cn("flex flex-col gap-2", formData.isAlwaysOpen && "opacity-40")}>
                            <input 
                              type="text" className="w-full bg-gray-50 rounded-lg px-3 py-1.5 text-[11px] font-bold outline-none"
                              placeholder="시작일" value={formData.startDate}
                              onFocus={() => formData.isAlwaysOpen && setFormData(prev => ({ ...prev, isAlwaysOpen: false }))}
                              onChange={(e) => {
                                handleDateChange('startDate', e.target.value);
                                if (formData.isAlwaysOpen) setFormData(prev => ({ ...prev, isAlwaysOpen: false }));
                              }}
                            />
                            <input 
                              type="text" className="w-full bg-gray-50 rounded-lg px-3 py-1.5 text-[11px] font-bold outline-none"
                              placeholder="종료일" value={formData.endDate}
                              onFocus={() => formData.isAlwaysOpen && setFormData(prev => ({ ...prev, isAlwaysOpen: false }))}
                              onChange={(e) => {
                                handleDateChange('endDate', e.target.value);
                                if (formData.isAlwaysOpen) setFormData(prev => ({ ...prev, isAlwaysOpen: false }));
                              }}
                            />
                          </div>
                        </div>

                        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex flex-col">
                          <label className="text-[10px] font-black text-gray-400 mb-2 block">[부서명 또는 팀명]</label>
                          <div className="flex-1 flex flex-col justify-center">
                            <input 
                              type="text" placeholder="담당 부서나 팀"
                              className="w-full bg-gray-50 rounded-lg px-3 py-2 text-[11px] font-bold outline-none"
                              value={formData.department}
                              onChange={(e) => setFormData({...formData, department: e.target.value})}
                            />
                            <p className="mt-2 text-[9px] text-gray-400">예: 회계과, 산업팀 등</p>
                          </div>
                        </div>

                        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                          <label className="text-[10px] font-black text-gray-400 mb-1 block">[핵심 키워드]</label>
                          <div className="flex flex-wrap gap-1 mb-3">
                            {formData.hashtags.map(tag => (
                              <span key={tag} className="flex items-center gap-1 bg-blue-50 text-blue-600 px-2 py-0.5 rounded text-[10px] font-black border border-blue-100">
                                {tag}
                                <button onClick={() => removeTag(tag)} className="hover:text-red-500 transition-colors"><X size={10} /></button>
                              </span>
                            ))}
                          </div>
                          <div className="flex gap-2">
                            <input 
                              type="text" placeholder="입력 후 Enter 또는 +"
                              className="flex-1 bg-gray-50 rounded-lg px-3 py-1.5 text-[11px] outline-none"
                              value={tagInput}
                              onChange={(e) => setTagInput(e.target.value)}
                              onKeyDown={addTag}
                            />
                            <button 
                              onClick={(e) => {
                                // Manual trigger for addTag
                                const dummyEvent = { key: 'Enter', preventDefault: () => {} } as React.KeyboardEvent;
                                addTag(dummyEvent);
                              }}
                              className="w-8 h-8 bg-blue-600 text-white rounded-lg flex items-center justify-center hover:bg-blue-700 transition-colors"
                            >
                              <Plus size={16} />
                            </button>
                          </div>
                        </div>
                      </div>

                      {validationError && (
                        <motion.div 
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="bg-red-50 border border-red-200 p-3 rounded-xl flex items-center gap-2 text-red-600 shadow-sm"
                        >
                          <AlertCircle size={16} strokeWidth={3} className="shrink-0" />
                          <span className="text-[11px] font-black">{validationError}</span>
                        </motion.div>
                      )}

                      <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                        <label className="text-[10px] font-black text-gray-400 mb-2 block uppercase">[핵심 요약 정보]</label>
                        <textarea 
                          className="w-full bg-gray-50 rounded-xl px-4 py-4 text-[13px] h-60 resize-none leading-relaxed text-gray-800 font-medium outline-none"
                          value={formData.content}
                          onChange={(e) => setFormData({...formData, content: e.target.value})}
                        />
                      </div>

                      {/* Comments Management in Edit Mode */}
                      <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm space-y-4">
                        <label className="text-[10px] font-black text-gray-400 block uppercase">[추가 의견 및 메모]</label>
                        <div className="space-y-2">
                          {selectedItem?.comments && selectedItem.comments.length > 0 ? (
                            selectedItem.comments.map(comment => (
                              <div key={comment.id} className="bg-gray-50 p-2 rounded flex justify-between items-center group">
                                <span className="text-[11px] text-gray-600 font-medium truncate flex-1">{comment.text}</span>
                                <button 
                                  onClick={() => handleRemoveComment(selectedItem.id, comment.id)}
                                  className="text-gray-300 hover:text-red-500 transition-colors p-1"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            ))
                          ) : (
                            <p className="text-[10px] text-gray-400 italic">등록된 댓글이 없습니다.</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {/* Compact Metadata Row */}
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                          <span className="text-[10px] font-black text-gray-300 uppercase block mb-1">[신청 기간]</span>
                          <div className="flex items-center gap-2">
                             <Calendar size={14} className="text-blue-600" />
                             <span className="text-[13px] font-black text-gray-800">
                               {selectedItem.isAlwaysOpen ? '상시 접수' : (selectedItem.startDate || selectedItem.endDate ? `${selectedItem.startDate || '미정'} ~ ${selectedItem.endDate || '미정'}` : '상시 접수')}
                             </span>
                          </div>
                        </div>
                        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                          <span className="text-[10px] font-black text-gray-300 uppercase block mb-1">[담당 부서]</span>
                          <div className="flex items-center gap-2">
                             <User size={14} className="text-blue-600" />
                             <span className="text-[13px] font-black text-gray-800 truncate">
                               {selectedItem.department || '미지정'}
                             </span>
                          </div>
                        </div>
                        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm md:col-span-2 flex flex-col justify-between">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-black text-gray-300 uppercase block">[핵심 키워드]</span>
                            <span className="text-[9px] font-black text-blue-400 uppercase tracking-tighter">키워드 추가</span>
                          </div>
                          
                          <div className="flex flex-wrap gap-1.5 mb-3 leading-none">
                            {selectedItem.hashtags.map(tag => (
                              <span key={tag} className="flex items-center gap-1 text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100/30">
                                {tag}
                                {sessionAddedTags.includes(tag) && (
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRemoveCommunityTag(selectedItem.id, tag);
                                    }}
                                    className="hover:text-red-500 transition-colors"
                                  >
                                    <X size={10} />
                                  </button>
                                )}
                              </span>
                            ))}
                          </div>

                          <div className="flex gap-2">
                            <input 
                              type="text" placeholder="새 키워드 입력 후 Enter"
                              className="flex-1 bg-gray-50 rounded-lg px-3 py-1.5 text-[10px] font-bold outline-none border border-transparent focus:border-blue-100 transition-all"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  handleAddCommunityTag(selectedItem.id, (e.target as HTMLInputElement).value);
                                  (e.target as HTMLInputElement).value = '';
                                 }
                              }}
                            />
                            <button 
                              onClick={(e) => {
                                const input = (e.currentTarget.previousSibling as HTMLInputElement);
                                if (input.value) {
                                  handleAddCommunityTag(selectedItem.id, input.value);
                                  input.value = '';
                                }
                              }}
                              className="bg-blue-600 text-white w-7 h-7 rounded-lg flex items-center justify-center hover:bg-blue-700 transition-all flex-shrink-0"
                            >
                              <Plus size={14} />
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Content Card - Harmonized */}
                      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="bg-blue-50/50 px-6 py-3 border-b border-blue-100/30 flex items-center justify-between">
                           <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-2">
                             <div className="w-1 h-1 bg-blue-600 rounded-full" /> [핵심 요약 정보]
                           </span>
                           <button onClick={() => window.print()} className="text-[10px] font-bold text-gray-400 hover:text-blue-600 transition-colors">인쇄/저장</button>
                        </div>
                        <div className="p-7">
                           <div className="text-[16px] leading-[1.8] whitespace-pre-wrap font-bold text-gray-800 tracking-tight">
                             {selectedItem.content}
                           </div>
                        </div>
                      </div>

                      {/* Collaborative Section (Dense) */}
                      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 space-y-4">
                        <h4 className="text-sm font-black text-gray-900 flex items-center gap-2">
                          <Hash size={14} className="text-blue-600" /> [추가 의견 및 메모]
                        </h4>
                        
                        <div className="space-y-3">
                          {selectedItem.comments && selectedItem.comments.length > 0 ? (
                            selectedItem.comments.map(comment => (
                              <div key={comment.id} className="bg-gray-50/50 p-3 rounded-xl border border-gray-100 text-[12px] group">
                                <div className="flex items-center justify-between mb-1">
                                  <div className="flex items-center gap-2 opacity-50 font-bold text-[9px]">
                                    <User size={10} /> <span>{comment.createdAt}</span>
                                  </div>
                                  {sessionAddedComments.includes(comment.id) && (
                                    <button 
                                      onClick={() => handleRemoveComment(selectedItem.id, comment.id)}
                                      className="text-gray-300 hover:text-red-500 transition-colors p-1"
                                    >
                                      <Trash2 size={10} />
                                    </button>
                                  )}
                                </div>
                                <p className="text-gray-700 font-medium leading-relaxed">{comment.text}</p>
                              </div>
                            ))
                          ) : (
                            <p className="text-center py-4 text-gray-300 text-[11px] font-medium border-2 border-dashed border-gray-50 rounded-xl italic">해당 지침에 대해 동료들과 공유할 팁이 있나요?</p>
                          )}
                        </div>

                        <div className="flex gap-2">
                          <input 
                            placeholder="의견 및 참고 정보(담당자 연락처, 주의사항 등) 입력..."
                            className="flex-1 bg-gray-50 rounded-xl px-4 py-2.5 text-xs font-semibold outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/10 transition-all"
                            value={commentInput}
                            onChange={(e) => setCommentInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && (handleAddComment(selectedItem.id, commentInput), setCommentInput(''))}
                          />
                          <button 
                            onClick={() => { handleAddComment(selectedItem.id, commentInput); setCommentInput(''); }} 
                            className="bg-gray-900 text-white px-4 py-2.5 rounded-xl font-black text-[11px] hover:bg-gray-800 transition-all active:scale-95"
                          >
                            등록
                          </button>
                        </div>
                      </div>

                      {/* Information about verification */}
                      <div className="bg-blue-50/30 rounded-2xl p-4 border border-blue-100/30 text-center">
                        <p className="text-[10px] text-blue-400 font-black tracking-widest uppercase">인증된 행정 지식 관리 시스템 (KMS)</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Functional Footer */}
              <div className="bg-white px-6 py-4 border-t border-gray-100 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2 text-gray-300">
                   <ShieldCheck size={14} />
                   <p className="text-[10px] font-bold">인증된 행정 KMS 데이터</p>
                </div>
                <div className="flex items-center gap-4">
                  {!isEditMode && (
                    <div className="hidden sm:flex items-center gap-1.5 text-red-600 font-black text-[9px] bg-red-50 px-3 py-1.5 rounded-lg border border-red-100/50">
                      <AlertCircle size={10} strokeWidth={3} />
                      <span>추가 정보는 자동 저장되며, 종료 후에는 수정이 불가합니다.</span>
                    </div>
                  )}
                  {!isEditMode && (!selectedItem.isAlwaysOpen && selectedItem.endDate && selectedItem.endDate < new Date().toISOString().split('T')[0]) && (
                    <button 
                      onClick={() => handleRewrite(selectedItem)}
                      className="px-5 py-2 bg-blue-600 text-white rounded-xl font-black hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20 active:scale-95 text-xs flex items-center gap-1.5"
                    >
                      <RotateCcw size={12} />
                      재작성하기
                    </button>
                  )}
                  {isEditMode && (
                    <div className="flex items-center gap-2">
                      {!showDeleteConfirm ? (
                        <button 
                          onClick={() => setShowDeleteConfirm(true)}
                          className="px-5 py-2 bg-red-50 text-red-600 rounded-xl font-black hover:bg-red-100 transition-all text-xs flex items-center gap-1.5"
                        >
                          <Trash2 size={14} />
                          삭제하기
                        </button>
                      ) : (
                        <div className="flex items-center gap-1 bg-red-50 p-1 rounded-xl border border-red-100">
                          <button 
                            onClick={() => handleDeleteItem(selectedItem.id)}
                            className="px-3 py-1 bg-red-600 text-white rounded-lg font-black text-[10px] hover:bg-red-700 transition-all"
                          >
                            정말 삭제
                          </button>
                          <button 
                            onClick={() => setShowDeleteConfirm(false)}
                            className="px-3 py-1 bg-white text-gray-400 rounded-lg font-black text-[10px] border border-gray-200 hover:bg-gray-50"
                          >
                            취소
                          </button>
                        </div>
                      )}
                      {!showDeleteConfirm && (
                        <button 
                          onClick={handleSubmit} 
                          className={cn(
                            "px-6 py-2 rounded-xl font-black transition-all shadow-lg text-xs active:scale-95",
                            "bg-blue-600 text-white hover:bg-blue-700 shadow-blue-500/20"
                          )}
                        >
                          저장하기
                        </button>
                      )}
                    </div>
                  )}
                  <button onClick={handleCloseModal} className="px-5 py-2 rounded-xl text-gray-400 font-black hover:bg-gray-50 hover:text-gray-600 text-xs transition-colors border border-gray-50">
                    닫기 (ESC)
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* API Debug Modal */}
      <AnimatePresence>
        {isDebugOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-6"
            onClick={() => setIsDebugOpen(false)}
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
                    <Settings size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-gray-900 leading-tight">Gemini API 시스템 상태</h3>
                    <p className="text-[11px] text-gray-500 font-bold uppercase tracking-widest">Debug & Connection Logs</p>
                  </div>
                </div>
                <button onClick={() => setIsDebugOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-200 transition-colors text-gray-400">
                  <X size={20} />
                </button>
              </div>

              <div className="p-8 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-tighter mb-1 block">환경변수 로드</span>
                    <div className="flex items-center gap-2">
                      {debugResult.envLoaded === undefined ? (
                        <span className="text-gray-300 font-bold text-sm">확인 안 됨</span>
                      ) : debugResult.envLoaded ? (
                        <div className="flex items-center gap-1.5 text-emerald-600 font-black text-sm">
                          <ShieldCheck size={16} /> LOADED
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-red-600 font-black text-sm">
                          <AlertCircle size={16} /> MISSING
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-tighter mb-1 block">응답 시간</span>
                    <div className="text-gray-900 font-black text-lg">
                      {debugResult.duration ? `${debugResult.duration}ms` : '--'}
                    </div>
                  </div>
                </div>

                <div className="bg-gray-900 rounded-2xl p-6 text-white font-mono text-[11px] min-h-[120px] relative overflow-hidden group">
                   <div className="absolute top-0 left-0 w-1 h-full bg-blue-500" />
                   <div className="flex items-center justify-between mb-4 border-b border-white/10 pb-2">
                     <span className="text-white/40 font-bold uppercase tracking-widest">Server Response Log</span>
                     <span className={cn(
                       "px-2 py-0.5 rounded text-[9px] font-black",
                       debugResult.status === 'success' ? "bg-emerald-500/20 text-emerald-400" :
                       debugResult.status === 'error' ? "bg-red-500/20 text-red-400" :
                       "bg-white/10 text-white/40"
                     )}>
                       {debugResult.status.toUpperCase()}
                     </span>
                   </div>
                   <div className="max-h-[200px] overflow-y-auto space-y-2 text-white/80 leading-relaxed custom-scrollbar">
                     {debugResult.status === 'idle' && "> Ready to test connection..."}
                     {debugResult.status === 'loading' && "> Connecting to Gemini API..."}
                     {debugResult.status === 'success' && (
                       <>
                         <p className="text-emerald-400 font-bold">SUCCESS: {debugResult.message}</p>
                         <p className="text-white/40 mt-2">RAW_RESPONSE:</p>
                         <p className="bg-white/5 p-2 rounded">{debugResult.response}</p>
                       </>
                     )}
                     {debugResult.status === 'error' && (
                       <>
                         <p className="text-red-400 font-bold">ERROR_CAUGHT:</p>
                         <p className="text-red-300">{debugResult.message}</p>
                         <p className="text-white/30 mt-2 italic">※ .env 파일 혹은 서버 설정의 API 키를 확인해주세요.</p>
                       </>
                     )}
                   </div>
                </div>

                <button 
                  onClick={testConnection}
                  disabled={debugResult.status === 'loading'}
                  className="w-full h-14 bg-gray-900 text-white rounded-2xl font-black hover:bg-black transition-all shadow-xl active:scale-95 disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center gap-2 group"
                >
                  {debugResult.status === 'loading' ? (
                    <>
                      <Loader2 className="animate-spin" size={20} />
                      테스트 중...
                    </>
                  ) : (
                    <>
                      <RotateCcw size={18} className="group-hover:rotate-180 transition-transform duration-500" />
                      연결 테스트 시작
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

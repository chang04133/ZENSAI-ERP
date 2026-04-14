import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Drawer, Input, Button } from 'antd';
import {
  QuestionCircleOutlined, SendOutlined, RobotOutlined,
  UserOutlined, CloseOutlined, CustomerServiceOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '../modules/auth/auth.store';
import {
  faqData, searchFaq, popularFaqIds, getFilteredFaqs, getFilteredCategories,
  type FaqItem,
} from '../data/faq-data';

/* ── 타입 ── */
interface ChatMessage {
  role: 'bot' | 'user';
  text: string;
  answerFaq?: FaqItem;
  suggestions?: FaqItem[];
  typing?: boolean;
}

/* ── 상수 ── */
const CAT_COLORS: Record<string, string> = {
  '상품': '#2196F3', '재고': '#4CAF50', '판매': '#FF9800', '출고': '#00BCD4',
  '생산': '#9C27B0', 'MD분석': '#E91E63', '고객': '#FFC107', '시스템': '#607D8B',
};

export default function FaqChatBot() {
  const { user } = useAuthStore();
  const role = user?.role || 'STORE_STAFF';

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [category, setCategory] = useState('전체');
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<any>(null);

  // 역할별 데이터
  const categories = useMemo(() => getFilteredCategories(role), [role]);
  const myFaqs = useMemo(() => getFilteredFaqs(role), [role]);
  const popularFaqs = useMemo(() =>
    popularFaqIds.map(id => myFaqs.find(f => f.id === id)).filter(Boolean) as FaqItem[],
  [myFaqs]);

  // 스크롤
  useEffect(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  }, [messages]);

  // 열 때 인사
  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([{ role: 'bot', text: '무엇을 도와드릴까요?' }]);
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [open]);

  // 타이핑 후 답변
  const addBotAnswer = useCallback((faq: FaqItem, extra?: FaqItem[]) => {
    setMessages(prev => [...prev, { role: 'bot', text: '', typing: true }]);
    setTimeout(() => {
      setMessages(prev => {
        const next = prev.filter(m => !m.typing);
        const suggestions = extra?.filter(f => f.id !== faq.id).slice(0, 3);
        return [...next, {
          role: 'bot', text: '', answerFaq: faq,
          suggestions: suggestions?.length ? suggestions : undefined,
        }];
      });
    }, 400);
  }, []);

  const handleSend = useCallback((query?: string) => {
    const q = (query || input).trim();
    if (!q) return;
    setInput('');

    setMessages(prev => [...prev, { role: 'user', text: q }]);

    const results = searchFaq(q, role, category);
    if (results.length > 0) {
      addBotAnswer(results[0], results.slice(1));
    } else {
      setMessages(prev => [...prev, { role: 'bot', text: '', typing: true }]);
      setTimeout(() => {
        setMessages(prev => {
          const next = prev.filter(m => !m.typing);
          return [...next, {
            role: 'bot',
            text: '해당 내용의 도움말을 찾지 못했어요.\n다른 키워드로 다시 질문해보시겠어요?',
            suggestions: popularFaqs.slice(0, 3),
          }];
        });
      }, 400);
    }
  }, [input, role, category, addBotAnswer, popularFaqs]);

  const handleFaqClick = useCallback((faq: FaqItem) => {
    setMessages(prev => [...prev, { role: 'user', text: faq.question }]);
    addBotAnswer(faq);
  }, [addBotAnswer]);

  const handleCategoryClick = useCallback((cat: string) => {
    setCategory(cat);
    if (cat === '전체') return;
    const catFaqs = myFaqs.filter(f => f.category === cat);
    setMessages(prev => [...prev,
      { role: 'user', text: `${cat} 관련 도움말` },
      { role: 'bot', text: `${cat} 관련 자주 묻는 질문이에요:`, suggestions: catFaqs },
    ]);
  }, [myFaqs]);

  const handleClose = () => { setOpen(false); setMessages([]); setCategory('전체'); };

  return (
    <>
      {/* 플로팅 버튼 */}
      <div
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: 28, right: 28, zIndex: 999,
          width: 52, height: 52, borderRadius: '50%',
          background: 'linear-gradient(135deg, #1677ff, #4096ff)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', boxShadow: '0 4px 16px rgba(22,119,255,0.4)',
          transition: 'transform 0.2s',
        }}
        onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.1)')}
        onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
        title="도움이 필요하신가요?"
      >
        <CustomerServiceOutlined style={{ fontSize: 22, color: '#fff' }} />
      </div>

      <Drawer
        placement="right"
        width={400}
        open={open}
        onClose={handleClose}
        closable={false}
        styles={{
          header: { display: 'none' },
          body: { padding: 0, display: 'flex', flexDirection: 'column' },
        }}
      >
        {/* ── 헤더 ── */}
        <div style={{
          background: 'linear-gradient(135deg, #1677ff, #4096ff)',
          padding: '18px 20px 14px', color: '#fff', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <RobotOutlined style={{ fontSize: 18, color: '#fff' }} />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>ZENSAI 도우미</div>
                <div style={{ fontSize: 11, opacity: 0.8 }}>FAQ 기반 자동 응답</div>
              </div>
            </div>
            <Button type="text" icon={<CloseOutlined />} onClick={handleClose}
              style={{ color: '#fff' }} size="small" />
          </div>
          {/* 카테고리 칩 */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 12 }}>
            {categories.map(cat => (
              <div key={cat} onClick={() => handleCategoryClick(cat)} style={{
                padding: '2px 10px', borderRadius: 12, fontSize: 12, cursor: 'pointer',
                background: category === cat ? '#fff' : 'rgba(255,255,255,0.15)',
                color: category === cat ? '#1677ff' : '#fff',
                fontWeight: category === cat ? 600 : 400,
                transition: 'all 0.2s',
              }}>{cat}</div>
            ))}
          </div>
        </div>

        {/* ── 채팅 영역 ── */}
        <div style={{
          flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px 14px', background: '#f7f8fa',
        }}>
          {messages.map((msg, i) => (
            <div key={i} style={{ marginBottom: 14 }}>
              {msg.role === 'bot'
                ? <BotBubble msg={msg} onFaqClick={handleFaqClick} />
                : <UserBubble text={msg.text} />
              }
            </div>
          ))}

          {/* 첫 화면 인기 질문 */}
          {messages.length === 1 && popularFaqs.length > 0 && (
            <div style={{ marginTop: 4 }}>
              <div style={{ fontSize: 11, color: '#999', marginBottom: 8, paddingLeft: 38 }}>
                자주 묻는 질문
              </div>
              {popularFaqs.map(faq => (
                <SuggestionChip key={faq.id} faq={faq} onClick={handleFaqClick} />
              ))}
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* ── 입력 영역 ── */}
        <div style={{
          padding: '10px 14px', borderTop: '1px solid #eee', background: '#fff',
          display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0,
        }}>
          <Input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onPressEnter={() => handleSend()}
            placeholder="궁금한 점을 입력하세요..."
            style={{ flex: 1, fontSize: 14 }}
          />
          <Button
            type="primary" shape="circle" icon={<SendOutlined />}
            onClick={() => handleSend()}
            disabled={!input.trim()}
            style={{ boxShadow: 'none' }}
          />
        </div>
      </Drawer>
    </>
  );
}

/* ── 봇 말풍선 ── */
function BotBubble({ msg, onFaqClick }: { msg: ChatMessage; onFaqClick: (f: FaqItem) => void }) {
  if (msg.typing) {
    return (
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <BotAvatar />
        <div style={{
          background: '#fff', borderRadius: '4px 14px 14px 14px', padding: '12px 16px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        }}>
          <span style={{ display: 'inline-flex', gap: 4 }}>
            <span style={dotStyle(0)} /><span style={dotStyle(1)} /><span style={dotStyle(2)} />
          </span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
      <BotAvatar />
      <div style={{ flex: 1, maxWidth: 'calc(100% - 42px)' }}>
        {/* 직접 답변 */}
        {msg.answerFaq && (
          <div style={{
            background: '#fff', borderRadius: '4px 14px 14px 14px', padding: 14,
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <span style={{
                display: 'inline-block', padding: '1px 8px', borderRadius: 10, fontSize: 11,
                fontWeight: 600, color: '#fff',
                background: CAT_COLORS[msg.answerFaq.category] || '#888',
              }}>{msg.answerFaq.category}</span>
              <span style={{ fontWeight: 600, fontSize: 13 }}>{msg.answerFaq.question}</span>
            </div>
            <div style={{
              fontSize: 13, lineHeight: 1.7, color: '#333', whiteSpace: 'pre-line',
              borderTop: '1px solid #f3f3f3', paddingTop: 8,
            }}>{msg.answerFaq.answer}</div>
          </div>
        )}

        {/* 텍스트 메시지 */}
        {!msg.answerFaq && msg.text && (
          <div style={{
            background: '#fff', borderRadius: '4px 14px 14px 14px', padding: '10px 14px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-line',
          }}>{msg.text}</div>
        )}

        {/* 추천 질문 */}
        {msg.suggestions && msg.suggestions.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 11, color: '#999', marginBottom: 4 }}>
              {msg.answerFaq ? '관련 질문' : '이런 질문은 어떠세요?'}
            </div>
            {msg.suggestions.map(faq => (
              <SuggestionChip key={faq.id} faq={faq} onClick={onFaqClick} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── 사용자 말풍선 ── */
function UserBubble({ text }: { text: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
      <div style={{
        background: 'linear-gradient(135deg, #1677ff, #4096ff)',
        color: '#fff', borderRadius: '14px 4px 14px 14px', padding: '10px 14px',
        fontSize: 13, maxWidth: '80%', lineHeight: 1.5,
        boxShadow: '0 1px 3px rgba(22,119,255,0.2)',
      }}>{text}</div>
      <div style={{
        width: 30, height: 30, borderRadius: '50%', background: '#e8e8e8',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <UserOutlined style={{ fontSize: 14, color: '#666' }} />
      </div>
    </div>
  );
}

/* ── 추천 질문 칩 ── */
function SuggestionChip({ faq, onClick }: { faq: FaqItem; onClick: (f: FaqItem) => void }) {
  return (
    <div
      onClick={() => onClick(faq)}
      style={{
        background: '#fff', border: '1px solid #e8e8e8', borderRadius: 10,
        padding: '7px 12px', cursor: 'pointer', fontSize: 13, marginBottom: 4,
        display: 'flex', alignItems: 'center', gap: 6,
        transition: 'all 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = '#1677ff'; e.currentTarget.style.background = '#f0f5ff'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = '#e8e8e8'; e.currentTarget.style.background = '#fff'; }}
    >
      <QuestionCircleOutlined style={{ color: CAT_COLORS[faq.category] || '#888', fontSize: 13 }} />
      <span style={{ color: '#333' }}>{faq.question}</span>
    </div>
  );
}

/* ── 봇 아바타 ── */
function BotAvatar() {
  return (
    <div style={{
      width: 30, height: 30, borderRadius: '50%',
      background: 'linear-gradient(135deg, #1677ff, #4096ff)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      boxShadow: '0 2px 6px rgba(22,119,255,0.2)',
    }}>
      <RobotOutlined style={{ color: '#fff', fontSize: 14 }} />
    </div>
  );
}

/* ── 타이핑 도트 ── */
function dotStyle(i: number): React.CSSProperties {
  return {
    display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
    background: '#bbb',
    animation: `typingBounce 1.2s ease-in-out ${i * 0.15}s infinite`,
  };
}

if (typeof document !== 'undefined' && !document.getElementById('faq-chatbot-style')) {
  const style = document.createElement('style');
  style.id = 'faq-chatbot-style';
  style.textContent = `
    @keyframes typingBounce {
      0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
      30% { transform: translateY(-4px); opacity: 1; }
    }
  `;
  document.head.appendChild(style);
}

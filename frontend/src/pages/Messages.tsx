import { useEffect, useState, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';
import {
  MessageSquare, Search, Send, Paperclip, User, Check, CheckCheck,
  Plus, ArrowLeft, X, Loader2, Image, FileText, Download, BellOff, Bell, AlertCircle,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Participant {
  userId: string;
  firstName: string;
  lastName: string;
  photoUrl?: string;
  jobTitle?: string;
}

interface Conversation {
  id: string;
  title: string | null;
  isGroup: boolean;
  lastMessageAt: string | null;
  lastMessageText: string | null;
  unread: boolean;
  isMuted: boolean;
  participants: Participant[];
  otherParticipants: Participant[];
}

interface Attachment {
  id: string;
  fileUrl: string;
  fileName: string;
  fileSize: number | null;
  mimeType: string | null;
}

interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string | null;
  isSystem: boolean;
  attachments: Attachment[];
  createdAt: string;
  sender: {
    id: string;
    email: string;
    employee?: { firstName: string; lastName: string; photoUrl?: string };
  };
}

interface DirectoryUser {
  id: string;
  email: string;
  role: string;
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    photoUrl?: string;
    jobTitle?: string;
    department?: { name: string };
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function timeAgo(date: string) {
  const d = new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return d.toLocaleDateString('bg-BG', { day: '2-digit', month: '2-digit' });
}

function isImageMime(mime: string | null) {
  return mime?.startsWith('image/');
}

function Avatar({ src, name, size = 'md' }: { src?: string; name: string; size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'w-8 h-8', md: 'w-10 h-10', lg: 'w-12 h-12' };
  const iconSizes = { sm: 'w-4 h-4', md: 'w-5 h-5', lg: 'w-6 h-6' };
  if (src) {
    return <img src={src} alt={name} className={`${sizes[size]} rounded-full object-cover`} />;
  }
  return (
    <div className={`${sizes[size]} rounded-full bg-primary-900/40 flex items-center justify-center`}>
      <User className={`${iconSizes[size]} text-primary-400`} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function Messages() {
  const { user } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();

  // Conversations
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loadingConvos, setLoadingConvos] = useState(true);
  const [activeConvoId, setActiveConvoId] = useState<string | null>(searchParams.get('c'));
  const [convoSearch, setConvoSearch] = useState('');

  // Messages
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [msgText, setMsgText] = useState('');
  const [sending, setSending] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // New chat
  const [showNewChat, setShowNewChat] = useState(false);
  const [dirSearch, setDirSearch] = useState('');
  const [directory, setDirectory] = useState<DirectoryUser[]>([]);
  const [loadingDir, setLoadingDir] = useState(false);

  // Polling
  const pollRef = useRef<ReturnType<typeof setInterval>>();

  // -----------------------------------------------------------------------
  // Fetch conversations
  // -----------------------------------------------------------------------
  const [convoError, setConvoError] = useState('');

  const fetchConversations = useCallback(async () => {
    try {
      const { data } = await api.get('/messages/conversations');
      setConversations(data.data);
      setConvoError('');
    } catch {
      setConvoError('Failed to load conversations');
    }
    setLoadingConvos(false);
  }, []);

  useEffect(() => {
    fetchConversations();
    const id = setInterval(fetchConversations, 5000);
    return () => clearInterval(id);
  }, [fetchConversations]);

  // -----------------------------------------------------------------------
  // Fetch messages for active conversation
  // -----------------------------------------------------------------------
  const fetchMessages = useCallback(async (convoId: string) => {
    setLoadingMsgs(true);
    try {
      const { data } = await api.get(`/messages/conversations/${convoId}/messages`);
      setMessages(data.data);
      // Mark as read
      api.post(`/messages/conversations/${convoId}/read`).catch(() => {});
    } catch { /* ignore */ }
    setLoadingMsgs(false);
  }, []);

  useEffect(() => {
    if (activeConvoId) {
      fetchMessages(activeConvoId);
      // Poll messages
      clearInterval(pollRef.current);
      pollRef.current = setInterval(() => fetchMessages(activeConvoId), 3000);
      return () => clearInterval(pollRef.current);
    } else {
      setMessages([]);
      clearInterval(pollRef.current);
    }
  }, [activeConvoId, fetchMessages]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // -----------------------------------------------------------------------
  // Select conversation
  // -----------------------------------------------------------------------
  function selectConvo(id: string) {
    setActiveConvoId(id);
    setSearchParams({ c: id });
    setShowNewChat(false);
  }

  // -----------------------------------------------------------------------
  // Send message
  // -----------------------------------------------------------------------
  const [sendError, setSendError] = useState('');

  async function handleSend(e?: React.FormEvent) {
    e?.preventDefault();
    if ((!msgText.trim() && attachments.length === 0) || !activeConvoId || sending) return;

    setSending(true);
    setSendError('');
    try {
      const formData = new FormData();
      if (msgText.trim()) formData.append('content', msgText.trim());
      attachments.forEach((f) => formData.append('attachments', f));

      await api.post(`/messages/conversations/${activeConvoId}/messages`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setMsgText('');
      setAttachments([]);
      await fetchMessages(activeConvoId);
      fetchConversations();
    } catch {
      setSendError('Failed to send message. Please try again.');
    }
    setSending(false);
  }

  // -----------------------------------------------------------------------
  // New chat: search directory
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!showNewChat) return;
    const timer = setTimeout(async () => {
      setLoadingDir(true);
      try {
        const { data } = await api.get(`/messages/directory?search=${encodeURIComponent(dirSearch)}`);
        setDirectory(data.data);
      } catch { /* ignore */ }
      setLoadingDir(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [dirSearch, showNewChat]);

  const [chatError, setChatError] = useState('');

  async function startChat(targetUserId: string) {
    setChatError('');
    try {
      const { data } = await api.post('/messages/conversations', { participantIds: [targetUserId] });
      selectConvo(data.data.id);
      setShowNewChat(false);
      fetchConversations();
    } catch {
      setChatError('Failed to start conversation. Please try again.');
    }
  }

  // -----------------------------------------------------------------------
  // Toggle mute
  // -----------------------------------------------------------------------
  async function toggleMute(convoId: string, currentlyMuted: boolean) {
    try {
      await api.patch(`/messages/conversations/${convoId}/mute`, { muted: !currentlyMuted });
      fetchConversations();
    } catch { /* ignore */ }
  }

  // -----------------------------------------------------------------------
  // Active conversation data
  // -----------------------------------------------------------------------
  const activeConvo = conversations.find((c) => c.id === activeConvoId);
  const convoDisplayName = activeConvo
    ? activeConvo.isGroup
      ? activeConvo.title || 'Group Chat'
      : activeConvo.otherParticipants.map((p) => `${p.firstName} ${p.lastName}`).join(', ')
    : '';
  const convoDisplayPhoto = activeConvo && !activeConvo.isGroup
    ? activeConvo.otherParticipants[0]?.photoUrl
    : undefined;
  const convoDisplayJob = activeConvo && !activeConvo.isGroup
    ? activeConvo.otherParticipants[0]?.jobTitle
    : `${activeConvo?.participants.length || 0} participants`;

  // Filter conversations by search
  const filtered = conversations.filter((c) => {
    if (!convoSearch) return true;
    const q = convoSearch.toLowerCase();
    if (c.title?.toLowerCase().includes(q)) return true;
    return c.otherParticipants.some(
      (p) => `${p.firstName} ${p.lastName}`.toLowerCase().includes(q)
    );
  });

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <div className="flex h-[calc(100vh-64px)] -m-6">
      {/* ===== LEFT SIDEBAR: Conversation List ===== */}
      <div className={`w-80 border-r border-gray-800 flex flex-col bg-black/30 flex-shrink-0 ${activeConvoId ? 'hidden md:flex' : 'flex'}`}>
        {/* Header */}
        <div className="p-4 border-b border-gray-800">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-white">Messages</h2>
            <button
              onClick={() => { setShowNewChat(true); setDirSearch(''); }}
              className="p-2 rounded-lg hover:bg-gray-800 text-primary-400"
              title="New Chat"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              value={convoSearch}
              onChange={(e) => setConvoSearch(e.target.value)}
              placeholder="Search conversations..."
              className="input-field pl-9 py-2 text-sm"
            />
          </div>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          {loadingConvos ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
            </div>
          ) : convoError && conversations.length === 0 ? (
            <div className="text-center py-12 px-4">
              <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
              <p className="text-sm text-red-400">{convoError}</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 px-4">
              <MessageSquare className="w-10 h-10 text-gray-700 mx-auto mb-3" />
              <p className="text-sm text-gray-500">No conversations yet</p>
              <button onClick={() => { setShowNewChat(true); setDirSearch(''); }} className="text-primary-400 text-sm mt-2 hover:underline">
                Start a new chat
              </button>
            </div>
          ) : (
            filtered.map((c) => {
              const name = c.isGroup
                ? c.title || 'Group Chat'
                : c.otherParticipants.map((p) => `${p.firstName} ${p.lastName}`).join(', ');
              const photo = !c.isGroup ? c.otherParticipants[0]?.photoUrl : undefined;
              const isActive = c.id === activeConvoId;

              return (
                <button
                  key={c.id}
                  onClick={() => selectConvo(c.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-800/60 transition-colors ${
                    isActive ? 'bg-gray-800/80 border-l-2 border-primary-500' : ''
                  }`}
                >
                  <div className="relative flex-shrink-0">
                    <Avatar src={photo} name={name} />
                    {c.unread && (
                      <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-primary-500 rounded-full border-2 border-gray-900" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <p className={`text-sm truncate ${c.unread ? 'font-semibold text-white' : 'text-gray-300'}`}>
                        {name}
                      </p>
                      {c.lastMessageAt && (
                        <span className="text-xs text-gray-500 flex-shrink-0 ml-2">{timeAgo(c.lastMessageAt)}</span>
                      )}
                    </div>
                    {c.lastMessageText && (
                      <p className={`text-xs truncate mt-0.5 ${c.unread ? 'text-gray-300' : 'text-gray-500'}`}>
                        {c.lastMessageText}
                      </p>
                    )}
                  </div>
                  {c.isMuted && <BellOff className="w-3 h-3 text-gray-600 flex-shrink-0" />}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ===== RIGHT SIDE: Chat or New Chat ===== */}
      <div className="flex-1 flex flex-col min-w-0">
        {showNewChat ? (
          /* --- New Chat Directory --- */
          <div className="flex flex-col h-full">
            <div className="p-4 border-b border-gray-800 flex items-center gap-3">
              <button onClick={() => setShowNewChat(false)} className="p-1 rounded hover:bg-gray-800 text-gray-400">
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h3 className="text-white font-semibold">New Message</h3>
            </div>
            <div className="p-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="text"
                  value={dirSearch}
                  onChange={(e) => setDirSearch(e.target.value)}
                  placeholder="Search employees..."
                  className="input-field pl-9"
                  autoFocus
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-4">
              {chatError && (
                <div className="mb-3 p-2 rounded-lg bg-red-900/30 text-red-400 text-sm">{chatError}</div>
              )}
              {loadingDir ? (
                <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-gray-500" /></div>
              ) : (
                directory.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => startChat(u.id)}
                    className="w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-gray-800/60 transition-colors"
                  >
                    <Avatar src={u.employee.photoUrl} name={`${u.employee.firstName} ${u.employee.lastName}`} />
                    <div className="text-left min-w-0">
                      <p className="text-sm font-medium text-white truncate">
                        {u.employee.firstName} {u.employee.lastName}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {u.employee.jobTitle}
                        {u.employee.department ? ` · ${u.employee.department.name}` : ''}
                      </p>
                    </div>
                  </button>
                ))
              )}
              {!loadingDir && directory.length === 0 && dirSearch && (
                <p className="text-center text-sm text-gray-500 py-8">No employees found</p>
              )}
            </div>
          </div>
        ) : activeConvoId && activeConvo ? (
          /* --- Active Chat --- */
          <>
            {/* Chat header */}
            <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-3">
              <button
                onClick={() => { setActiveConvoId(null); setSearchParams({}); }}
                className="p-1 rounded hover:bg-gray-800 text-gray-400 md:hidden"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <Avatar src={convoDisplayPhoto} name={convoDisplayName} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white truncate">{convoDisplayName}</p>
                <p className="text-xs text-gray-500 truncate">{convoDisplayJob}</p>
              </div>
              <button
                onClick={() => toggleMute(activeConvoId, activeConvo.isMuted)}
                className="p-2 rounded-lg hover:bg-gray-800 text-gray-400"
                title={activeConvo.isMuted ? 'Unmute' : 'Mute'}
              >
                {activeConvo.isMuted ? <BellOff className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
              </button>
            </div>

            {/* Messages area */}
            <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 space-y-1">
              {loadingMsgs && messages.length === 0 ? (
                <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-gray-500" /></div>
              ) : messages.length === 0 ? (
                <div className="text-center py-12">
                  <MessageSquare className="w-10 h-10 text-gray-700 mx-auto mb-3" />
                  <p className="text-sm text-gray-500">No messages yet. Say hello!</p>
                </div>
              ) : (
                messages.map((msg, i) => {
                  const isMe = msg.senderId === user?.id;
                  const prevMsg = messages[i - 1];
                  const showAvatar = !isMe && (!prevMsg || prevMsg.senderId !== msg.senderId);
                  const senderName = msg.sender.employee
                    ? `${msg.sender.employee.firstName} ${msg.sender.employee.lastName}`
                    : msg.sender.email;
                  const showTime = !prevMsg ||
                    new Date(msg.createdAt).getTime() - new Date(prevMsg.createdAt).getTime() > 300000 ||
                    prevMsg.senderId !== msg.senderId;

                  if (msg.isSystem) {
                    return (
                      <div key={msg.id} className="text-center py-2">
                        <span className="text-xs text-gray-600 bg-gray-800/50 px-3 py-1 rounded-full">{msg.content}</span>
                      </div>
                    );
                  }

                  return (
                    <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} ${showTime ? 'mt-3' : 'mt-0.5'}`}>
                      <div className={`flex gap-2 max-w-[75%] ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                        {/* Avatar */}
                        <div className="w-8 flex-shrink-0">
                          {showAvatar && !isMe && (
                            <Avatar src={msg.sender.employee?.photoUrl} name={senderName} size="sm" />
                          )}
                        </div>

                        <div>
                          {/* Sender name */}
                          {showAvatar && !isMe && (
                            <p className="text-xs text-gray-500 mb-0.5 ml-1">{senderName}</p>
                          )}

                          {/* Bubble */}
                          <div className={`rounded-2xl px-3.5 py-2 ${
                            isMe
                              ? 'bg-primary-600 text-black rounded-br-md'
                              : 'bg-gray-800 text-gray-200 rounded-bl-md'
                          }`}>
                            {msg.content && <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>}

                            {/* Attachments */}
                            {msg.attachments.length > 0 && (
                              <div className={`${msg.content ? 'mt-2' : ''} space-y-1.5`}>
                                {msg.attachments.map((att) => (
                                  isImageMime(att.mimeType) ? (
                                    <a key={att.id} href={att.fileUrl} target="_blank" rel="noopener noreferrer">
                                      <img src={att.fileUrl} alt={att.fileName} className="max-w-[240px] rounded-lg" />
                                    </a>
                                  ) : (
                                    <a
                                      key={att.id}
                                      href={att.fileUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className={`flex items-center gap-2 p-2 rounded-lg ${isMe ? 'bg-primary-700/50' : 'bg-gray-700/50'}`}
                                    >
                                      <FileText className="w-4 h-4 flex-shrink-0" />
                                      <span className="text-xs truncate flex-1">{att.fileName}</span>
                                      <Download className="w-3 h-3 flex-shrink-0" />
                                    </a>
                                  )
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Time + seen */}
                          <div className={`flex items-center gap-1 mt-0.5 ${isMe ? 'justify-end mr-1' : 'ml-1'}`}>
                            <span className="text-[10px] text-gray-600">
                              {new Date(msg.createdAt).toLocaleTimeString('bg-BG', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            {isMe && (
                              <CheckCheck className="w-3 h-3 text-primary-400" />
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Attachment preview */}
            {attachments.length > 0 && (
              <div className="px-4 py-2 border-t border-gray-800 flex gap-2 flex-wrap">
                {attachments.map((f, i) => (
                  <div key={i} className="flex items-center gap-1.5 bg-gray-800 rounded-lg px-2.5 py-1.5 text-xs text-gray-300">
                    {f.type.startsWith('image/') ? <Image className="w-3 h-3" /> : <FileText className="w-3 h-3" />}
                    <span className="truncate max-w-[120px]">{f.name}</span>
                    <button onClick={() => setAttachments((a) => a.filter((_, j) => j !== i))} className="text-gray-500 hover:text-red-400">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Send error */}
            {sendError && (
              <div className="px-4 py-1.5">
                <p className="text-xs text-red-400 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> {sendError}
                </p>
              </div>
            )}

            {/* Input bar */}
            <form onSubmit={handleSend} className="px-4 py-3 border-t border-gray-800 flex items-end gap-2">
              <input
                type="file"
                ref={fileInputRef}
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) setAttachments((a) => [...a, ...Array.from(e.target.files!)]);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-2.5 rounded-lg hover:bg-gray-800 text-gray-400"
              >
                <Paperclip className="w-5 h-5" />
              </button>
              <div className="flex-1 relative">
                <textarea
                  value={msgText}
                  onChange={(e) => setMsgText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Type a message..."
                  rows={1}
                  className="input-field resize-none py-2.5 pr-4 min-h-[42px] max-h-[120px]"
                  style={{ height: 'auto', overflow: 'hidden' }}
                  onInput={(e) => {
                    const t = e.target as HTMLTextAreaElement;
                    t.style.height = 'auto';
                    t.style.height = Math.min(t.scrollHeight, 120) + 'px';
                  }}
                />
              </div>
              <button
                type="submit"
                disabled={sending || (!msgText.trim() && attachments.length === 0)}
                className="p-2.5 rounded-lg bg-primary-600 text-black hover:bg-primary-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              </button>
            </form>
          </>
        ) : (
          /* --- Empty State --- */
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <MessageSquare className="w-16 h-16 text-gray-800 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-400">Your Messages</h3>
              <p className="text-sm text-gray-600 mt-1 mb-4">Select a conversation or start a new one</p>
              <button
                onClick={() => { setShowNewChat(true); setDirSearch(''); }}
                className="btn-primary"
              >
                <Plus className="w-4 h-4 mr-2" /> New Message
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

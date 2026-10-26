import React, { useState, useEffect, useRef } from "react";
import {
  Send,
  Bot,
  User,
  Sparkles,
  RefreshCw,
  AlertCircle,
  Copy,
  Check,
  Plus,
  Trash2,
  Download,
  Menu,
  X,
  Zap,
  ShieldCheck,
  Cpu,
  Terminal,
  Clock,
  ArrowDown
} from "lucide-react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  model?: string;
  durationMs?: number;
  error?: boolean;
}

interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  messages: Message[];
}

interface HealthData {
  ok: boolean;
  status: string;
  diagnostics?: {
    geminiConfigured: boolean;
    keyPrefix?: string;
    model: string;
    runtime: string;
  };
}

const STARTER_PROMPTS = [
  {
    icon: Terminal,
    title: "TypeScript debounce helper",
    prompt: "Write a production-ready TypeScript debounce function with type generics and cancellation support."
  },
  {
    icon: Zap,
    title: "Explain Quantum Computing",
    prompt: "Explain quantum computing and qubits in simple, intuitive terms for a software engineer."
  },
  {
    icon: Sparkles,
    title: "Product Launch Tweet Thread",
    prompt: "Draft an engaging 4-tweet launch thread for ZOIR AI, highlighting its speed and developer ergonomics."
  },
  {
    icon: Cpu,
    title: "Serverless vs Containers",
    prompt: "Compare Vercel Serverless Functions with persistent Docker containers: pros, cons, cold starts, and pricing."
  }
];

export default function App() {
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    try {
      const saved = localStorage.getItem("zoir_sessions");
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn("Could not read stored sessions:", e);
    }
    const defaultSession: ChatSession = {
      id: "session-" + Date.now(),
      title: "New Conversation",
      createdAt: Date.now(),
      messages: []
    };
    return [defaultSession];
  });

  const [currentSessionId, setCurrentSessionId] = useState<string>(() => {
    return sessions[0]?.id || "session-" + Date.now();
  });

  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [health, setHealth] = useState<HealthData | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Active session helper
  const currentSession = sessions.find((s) => s.id === currentSessionId) || sessions[0];
  const messages = currentSession?.messages || [];

  // Persist sessions
  useEffect(() => {
    try {
      localStorage.setItem("zoir_sessions", JSON.stringify(sessions));
    } catch (err) {
      console.warn("Failed to persist sessions to localStorage:", err);
    }
  }, [sessions]);

  // Check backend health
  useEffect(() => {
    async function checkHealth() {
      try {
        const res = await fetch("/api/health");
        if (res.ok) {
          const data: HealthData = await res.json();
          setHealth(data);
        } else {
          setHealth({
            ok: false,
            status: `HTTP ${res.status}`,
          });
        }
      } catch (e: any) {
        setHealth({
          ok: false,
          status: "Offline / Unreachable",
        });
      }
    }
    checkHealth();
  }, []);

  // Auto-scroll on messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // Handle scroll detection for "Scroll to bottom" button
  const handleScroll = () => {
    if (!chatContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
    const distanceToBottom = scrollHeight - scrollTop - clientHeight;
    setShowScrollBottom(distanceToBottom > 150);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Adjust textarea height
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  }, [input]);

  // Start new session
  const handleNewChat = () => {
    const newSession: ChatSession = {
      id: "session-" + Date.now(),
      title: "New Conversation",
      createdAt: Date.now(),
      messages: []
    };
    setSessions((prev) => [newSession, ...prev]);
    setCurrentSessionId(newSession.id);
    setErrorMessage(null);
    setInput("");
    setIsSidebarOpen(false);
  };

  // Delete session
  const handleDeleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSessions((prev) => {
      const filtered = prev.filter((s) => s.id !== id);
      if (filtered.length === 0) {
        const fresh: ChatSession = {
          id: "session-" + Date.now(),
          title: "New Conversation",
          createdAt: Date.now(),
          messages: []
        };
        setCurrentSessionId(fresh.id);
        return [fresh];
      }
      if (currentSessionId === id) {
        setCurrentSessionId(filtered[0].id);
      }
      return filtered;
    });
  };

  // Send message
  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || input).trim();
    if (!text || isLoading) return;

    setErrorMessage(null);
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    const userMessage: Message = {
      id: "msg-" + Date.now() + "-user",
      role: "user",
      content: text,
      timestamp: Date.now(),
    };

    // Update session with user message
    const updatedMessages = [...messages, userMessage];

    // Determine session title if this is the first message
    const updatedTitle =
      currentSession.messages.length === 0
        ? text.slice(0, 32) + (text.length > 32 ? "..." : "")
        : currentSession.title;

    setSessions((prev) =>
      prev.map((s) =>
        s.id === currentSessionId
          ? { ...s, title: updatedTitle, messages: updatedMessages }
          : s
      )
    );

    setIsLoading(true);

    try {
      // Build conversation history for multi-turn context
      const historyPayload = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: text,
          history: historyPayload,
        }),
      });

      // Handle non-OK status codes gracefully
      if (!response.ok) {
        let errorData: any = {};
        try {
          errorData = await response.json();
        } catch (jsonErr) {
          // If response is HTML (e.g. Vercel 504 / 404 router fallback)
          errorData = {
            error: `Server returned HTTP ${response.status} (${response.statusText || "Error"})`,
            code: "HTTP_" + response.status,
          };
        }

        const friendlyMessage =
          errorData?.error ||
          `Request failed with status ${response.status}. Please check backend logs or environment variables.`;

        setErrorMessage(friendlyMessage);

        const errorMessageObj: Message = {
          id: "msg-" + Date.now() + "-error",
          role: "assistant",
          content: `⚠️ **Unable to complete request:** ${friendlyMessage}`,
          timestamp: Date.now(),
          error: true,
        };

        setSessions((prev) =>
          prev.map((s) =>
            s.id === currentSessionId
              ? { ...s, messages: [...updatedMessages, errorMessageObj] }
              : s
          )
        );
        return;
      }

      // Parse successful response
      const data = await response.json();

      if (!data.ok || !data.response) {
        throw new Error(data.error || "Invalid response format from server.");
      }

      const assistantMessage: Message = {
        id: "msg-" + Date.now() + "-ai",
        role: "assistant",
        content: data.response,
        timestamp: Date.now(),
        model: data.model || "gemini-3.1-flash-lite",
        durationMs: data.durationMs,
      };

      setSessions((prev) =>
        prev.map((s) =>
          s.id === currentSessionId
            ? { ...s, messages: [...updatedMessages, assistantMessage] }
            : s
        )
      );
    } catch (err: any) {
      console.error("[ZOIR AI Client] Submission error:", err);
      const displayErr =
        err?.message === "Failed to fetch"
          ? "Failed to connect to the ZOIR AI server. Check your network or Vercel deployment status."
          : err?.message || "An unexpected error occurred.";

      setErrorMessage(displayErr);

      const errorMsg: Message = {
        id: "msg-" + Date.now() + "-error",
        role: "assistant",
        content: `⚠️ **Error:** ${displayErr}`,
        timestamp: Date.now(),
        error: true,
      };

      setSessions((prev) =>
        prev.map((s) =>
          s.id === currentSessionId
            ? { ...s, messages: [...updatedMessages, errorMsg] }
            : s
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Retry last failed query
  const handleRetry = () => {
    // Find the last user message
    const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");
    if (lastUserMessage) {
      // Remove any trailing error assistant message
      const cleaned = messages.filter((m) => !m.error);
      setSessions((prev) =>
        prev.map((s) => (s.id === currentSessionId ? { ...s, messages: cleaned } : s))
      );
      handleSendMessage(lastUserMessage.content);
    }
  };

  // Copy text helper
  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Export current chat
  const handleExportChat = () => {
    if (messages.length === 0) return;
    const content = messages
      .map((m) => `### ${m.role === "user" ? "User" : "ZOIR AI"}\n${m.content}\n`)
      .join("\n---\n\n");
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `zoir-chat-${currentSession.title.replace(/\s+/g, "-").toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Handle enter key to send
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Simple Markdown-like renderer for code blocks and bold
  const renderMessageContent = (content: string) => {
    const parts = content.split(/(```[\s\S]*?```)/g);

    return parts.map((part, index) => {
      if (part.startsWith("```") && part.endsWith("```")) {
        const lines = part.slice(3, -3).trim().split("\n");
        const language = lines[0].trim();
        const code = lines.slice(1).join("\n") || lines[0]; // handle single-line snippet
        const snippetId = `code-${index}-${lines.length}`;

        return (
          <div key={index} className="my-3 rounded-lg overflow-hidden border border-slate-700/80 bg-slate-900/95 shadow-md">
            <div className="flex items-center justify-between px-3.5 py-1.5 bg-slate-800/90 text-xs text-slate-300 font-mono border-b border-slate-700/60">
              <span className="text-cyan-400 font-medium">{language || "code"}</span>
              <button
                onClick={() => handleCopy(code, snippetId)}
                className="flex items-center gap-1.5 px-2 py-0.5 rounded hover:bg-slate-700/80 transition-colors text-slate-300 hover:text-white"
                title="Copy code snippet"
              >
                {copiedId === snippetId ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400 font-sans">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span className="font-sans">Copy</span>
                  </>
                )}
              </button>
            </div>
            <pre className="p-3.5 text-sm font-mono overflow-x-auto text-slate-200 leading-relaxed scrollbar-thin scrollbar-thumb-slate-700">
              <code>{code}</code>
            </pre>
          </div>
        );
      }

      // Render bold and inline code
      const paragraphs = part.split("\n\n");
      return (
        <div key={index} className="space-y-2">
          {paragraphs.map((p, pIdx) => {
            if (!p.trim()) return null;
            return (
              <p key={pIdx} className="leading-relaxed break-words whitespace-pre-wrap">
                {p}
              </p>
            );
          })}
        </div>
      );
    });
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-950 text-slate-100 font-sans">
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 w-72 flex flex-col bg-slate-900/90 border-r border-slate-800/80 backdrop-blur-xl transition-transform duration-300 ease-in-out ${
          isSidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        {/* Sidebar Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-base tracking-tight bg-gradient-to-r from-cyan-400 via-indigo-300 to-purple-400 bg-clip-text text-transparent">
                ZOIR AI
              </h1>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Vercel & Cloud Ready
              </div>
            </div>
          </div>
          <button
            onClick={() => setIsSidebarOpen(false)}
            className="lg:hidden p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* New Chat Button */}
        <div className="p-3">
          <button
            onClick={handleNewChat}
            className="w-full flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 text-white font-medium text-sm transition-all shadow-md shadow-cyan-600/20 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Conversation</span>
          </button>
        </div>

        {/* Sessions List */}
        <div className="flex-1 overflow-y-auto px-3 py-1 space-y-1 scrollbar-thin scrollbar-thumb-slate-800">
          <div className="px-2 py-1 text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Conversations
          </div>
          {sessions.map((session) => {
            const isActive = session.id === currentSessionId;
            return (
              <div
                key={session.id}
                onClick={() => {
                  setCurrentSessionId(session.id);
                  setErrorMessage(null);
                  setIsSidebarOpen(false);
                }}
                className={`group flex items-center justify-between px-3 py-2.5 rounded-xl text-sm cursor-pointer transition-all ${
                  isActive
                    ? "bg-slate-800 text-cyan-300 font-medium shadow-inner border border-slate-700/60"
                    : "text-slate-300 hover:bg-slate-800/50 hover:text-slate-100"
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      isActive ? "bg-cyan-400 ring-2 ring-cyan-400/30" : "bg-slate-600"
                    }`}
                  />
                  <span className="truncate">{session.title}</span>
                </div>
                {sessions.length > 1 && (
                  <button
                    onClick={(e) => handleDeleteSession(session.id, e)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-rose-400 rounded transition-opacity"
                    title="Delete chat"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Diagnostics & Status Footer */}
        <div className="p-3 border-t border-slate-800 bg-slate-900/60 text-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-slate-400 font-medium">Deployment Status</span>
            <button
              onClick={() => setShowDiagnostics(!showDiagnostics)}
              className="text-cyan-400 hover:text-cyan-300 text-[11px] font-medium underline"
            >
              {showDiagnostics ? "Hide Details" : "View Diagnostics"}
            </button>
          </div>

          <div className="flex items-center gap-2 bg-slate-800/80 px-2.5 py-1.5 rounded-lg border border-slate-700/50">
            <ShieldCheck
              className={`w-4 h-4 shrink-0 ${
                health?.diagnostics?.geminiConfigured ? "text-emerald-400" : "text-amber-400"
              }`}
            />
            <div className="truncate text-slate-300">
              {health?.diagnostics?.geminiConfigured ? (
                <span>Gemini API: <strong className="text-emerald-400">Connected</strong></span>
              ) : (
                <span>API Key: <strong className="text-amber-400">Needs Env Setup</strong></span>
              )}
            </div>
          </div>

          {showDiagnostics && (
            <div className="mt-2.5 p-2.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1 font-mono text-[11px] text-slate-400">
              <div>API Route: <span className="text-slate-200">/api/chat</span></div>
              <div>Runtime: <span className="text-slate-200">{health?.diagnostics?.runtime || "Node / Serverless"}</span></div>
              <div>Model: <span className="text-slate-200">{health?.diagnostics?.model || "gemini-3.1-flash-lite"}</span></div>
              <div>Vercel Timeout: <span className="text-slate-200">30s Bound</span></div>
              <div>Health: <span className="text-emerald-400">{health?.status || "Checking..."}</span></div>
            </div>
          )}
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col h-full min-w-0 relative">
        {/* Top Navbar */}
        <header className="h-14 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md flex items-center justify-between px-4 z-10 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="lg:hidden p-2 text-slate-300 hover:text-white rounded-lg hover:bg-slate-800"
              title="Open sidebar"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 truncate">
              <span className="font-semibold text-slate-200 text-sm md:text-base truncate">
                {currentSession.title}
              </span>
              <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-mono bg-cyan-950/60 text-cyan-300 border border-cyan-800/50">
                {health?.diagnostics?.model || "gemini-3.1-flash-lite"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {messages.length > 0 && (
              <button
                onClick={handleExportChat}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg border border-slate-700/60 transition-colors"
                title="Download chat as Markdown"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export</span>
              </button>
            )}

            <button
              onClick={handleNewChat}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg border border-slate-700/60 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New</span>
            </button>
          </div>
        </header>

        {/* Message Feed Container */}
        <div
          ref={chatContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-4 py-6 md:px-8 space-y-6 scrollbar-thin scrollbar-thumb-slate-800"
        >
          {messages.length === 0 ? (
            /* Welcome / Starter View */
            <div className="max-w-2xl mx-auto my-auto pt-8 md:pt-16 text-center space-y-6">
              <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-gradient-to-tr from-cyan-500/20 to-purple-500/20 border border-cyan-500/30 shadow-xl shadow-cyan-500/10">
                <Sparkles className="w-8 h-8 text-cyan-400" />
              </div>

              <div className="space-y-2">
                <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                  What can ZOIR AI help you with today?
                </h2>
                <p className="text-sm md:text-base text-slate-400 max-w-lg mx-auto">
                  Powered by Google Gemini on a robust Vercel serverless backend with multi-turn chat memory and structured error handling.
                </p>
              </div>

              {/* Starter Prompt Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left pt-4">
                {STARTER_PROMPTS.map((item, idx) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={idx}
                      onClick={() => handleSendMessage(item.prompt)}
                      className="group p-3.5 rounded-xl bg-slate-900/60 hover:bg-slate-800/80 border border-slate-800 hover:border-cyan-500/40 transition-all text-left space-y-1.5 shadow-sm hover:shadow-cyan-500/5 cursor-pointer"
                    >
                      <div className="flex items-center gap-2 text-cyan-400 group-hover:text-cyan-300">
                        <Icon className="w-4 h-4" />
                        <span className="font-semibold text-xs text-slate-200">{item.title}</span>
                      </div>
                      <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                        {item.prompt}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Active Message List */
            <div className="max-w-3xl mx-auto space-y-6">
              {messages.map((message) => {
                const isUser = message.role === "user";
                return (
                  <div
                    key={message.id}
                    className={`flex gap-3 md:gap-4 ${isUser ? "justify-end" : "justify-start"}`}
                  >
                    {!isUser && (
                      <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center shrink-0 shadow-md shadow-cyan-500/10 mt-1">
                        <Bot className="w-4 h-4 text-white" />
                      </div>
                    )}

                    <div
                      className={`max-w-[85%] md:max-w-[80%] rounded-2xl px-4 py-3 md:px-5 md:py-3.5 shadow-sm text-sm ${
                        isUser
                          ? "bg-cyan-600 text-white rounded-br-xs font-normal"
                          : message.error
                          ? "bg-rose-950/40 border border-rose-800/80 text-rose-200 rounded-bl-xs"
                          : "bg-slate-900 border border-slate-800 text-slate-200 rounded-bl-xs shadow-md"
                      }`}
                    >
                      {/* Message Content */}
                      <div className="prose prose-invert prose-sm max-w-none">
                        {renderMessageContent(message.content)}
                      </div>

                      {/* Assistant Message Metadata & Actions */}
                      {!isUser && !message.error && (
                        <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-800/70 text-[11px] text-slate-400">
                          <div className="flex items-center gap-2 font-mono">
                            {message.model && (
                              <span className="text-cyan-400/90">{message.model}</span>
                            )}
                            {message.durationMs && (
                              <span className="flex items-center gap-1 text-slate-400">
                                <Clock className="w-3 h-3" />
                                {message.durationMs}ms
                              </span>
                            )}
                          </div>
                          <button
                            onClick={() => handleCopy(message.content, message.id)}
                            className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                            title="Copy response"
                          >
                            {copiedId === message.id ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-400" />
                                <span className="text-emerald-400 font-sans">Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span className="font-sans">Copy</span>
                              </>
                            )}
                          </button>
                        </div>
                      )}

                      {/* Error Retry Button */}
                      {message.error && (
                        <div className="mt-3 pt-2 border-t border-rose-800/50 flex items-center justify-between">
                          <span className="text-xs text-rose-300">Request failed</span>
                          <button
                            onClick={handleRetry}
                            className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-rose-900/60 hover:bg-rose-800 text-rose-100 text-xs font-medium transition-colors"
                          >
                            <RefreshCw className="w-3 h-3" />
                            <span>Retry Request</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {isUser && (
                      <div className="w-8 h-8 rounded-xl bg-slate-800 flex items-center justify-center shrink-0 border border-slate-700/80 mt-1">
                        <User className="w-4 h-4 text-slate-300" />
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Thinking / Loading indicator */}
              {isLoading && (
                <div className="flex gap-3 md:gap-4 justify-start">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center shrink-0 shadow-md shadow-cyan-500/10 mt-1">
                    <Bot className="w-4 h-4 text-white animate-pulse" />
                  </div>
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl rounded-bl-xs px-4 py-3 flex items-center gap-2 text-slate-400 text-xs shadow-md">
                    <div className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-cyan-400 animate-bounce [animation-delay:-0.3s]" />
                      <span className="w-2 h-2 rounded-full bg-cyan-400 animate-bounce [animation-delay:-0.15s]" />
                      <span className="w-2 h-2 rounded-full bg-cyan-400 animate-bounce" />
                    </div>
                    <span className="font-mono text-slate-400 pl-1">ZOIR AI is reasoning...</span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Floating Scroll to Bottom button */}
        {showScrollBottom && (
          <button
            onClick={scrollToBottom}
            className="absolute right-6 bottom-24 p-2 rounded-full bg-slate-800/90 text-cyan-400 hover:text-white hover:bg-slate-700 border border-slate-700 shadow-lg backdrop-blur-sm transition-all"
            title="Scroll to latest"
          >
            <ArrowDown className="w-4 h-4" />
          </button>
        )}

        {/* Global Error Banner */}
        {errorMessage && (
          <div className="max-w-3xl mx-auto w-full px-4 mb-2">
            <div className="flex items-center justify-between p-3 rounded-xl bg-rose-950/70 border border-rose-800/80 text-rose-200 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span className="truncate">{errorMessage}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-2">
                <button
                  onClick={handleRetry}
                  className="px-2.5 py-1 bg-rose-800 hover:bg-rose-700 text-white rounded text-xs font-medium transition-colors"
                >
                  Retry
                </button>
                <button
                  onClick={() => setErrorMessage(null)}
                  className="p-1 text-rose-300 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Input Form Bar */}
        <div className="p-4 md:px-8 border-t border-slate-800/80 bg-slate-950/90 backdrop-blur-md shrink-0">
          <div className="max-w-3xl mx-auto">
            <div className="relative flex items-end gap-2 bg-slate-900 rounded-2xl border border-slate-800 focus-within:border-cyan-500/60 focus-within:ring-2 focus-within:ring-cyan-500/20 shadow-lg p-2 transition-all">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask ZOIR AI anything... (Enter to send, Shift+Enter for new line)"
                rows={1}
                disabled={isLoading}
                className="flex-1 bg-transparent text-slate-100 placeholder:text-slate-500 text-sm p-2 resize-none focus:outline-none min-h-[40px] max-h-[180px] leading-relaxed"
              />

              <button
                onClick={() => handleSendMessage()}
                disabled={!input.trim() || isLoading}
                className={`p-2.5 rounded-xl flex items-center justify-center transition-all ${
                  input.trim() && !isLoading
                    ? "bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 text-white shadow-md shadow-cyan-600/30 cursor-pointer"
                    : "bg-slate-800 text-slate-600 cursor-not-allowed"
                }`}
                title="Send message"
              >
                {isLoading ? (
                  <RefreshCw className="w-4 h-4 animate-spin text-slate-400" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </div>

            <div className="flex items-center justify-between mt-2 px-2 text-[11px] text-slate-400">
              <span>ZOIR AI may occasionally produce inaccurate information.</span>
              <span className="hidden sm:inline font-mono">Vercel Serverless & Node.js</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

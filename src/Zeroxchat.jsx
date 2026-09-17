import { useState, useRef, useEffect } from "react";
import { GoogleGenerativeAI } from "@google/generative-ai";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { GEMINI_API_KEY, UNSPLASH_ACCESS_KEY } from "./config";


const SUGGESTIONS = [
  {
    title: "Summarize a document",
    subtitle: "Turn long text into key points",
    prompt: "Summarize a long document into key bullet points",
  },
  {
    title: "Debug my code",
    subtitle: "Find and fix an issue together",
    prompt: "Help me debug an error in my code",
  },
  {
    title: "Draft an email",
    subtitle: "Clear, professional, ready to send",
    prompt: "Draft a professional email replying to a client",
  },
  {
    title: "Explain something",
    subtitle: "Break a tricky topic down",
    prompt: "Explain a complex topic to me simply",
  },
];

const DEMO_REPLIES = [
  "That's a great question. Here's a clear, structured way to think about it: start by breaking the problem into smaller pieces, then tackle each one before combining the results.",
  "I've put together a quick response — let me know if you'd like me to go deeper on any part of this, or adjust the tone and length.",
  "Here's a draft based on what you shared. Feel free to tell me what to change and I'll refine it right away.",
  "Good catch. The most likely cause is a mismatch in how the data is being passed between steps — check that first, then we can narrow it down further.",
];

// getBotResponse will be defined inside the component so it can access `messages` state

export default function NovaChat() {
  const [messages, setMessages] = useState([]); // { role: 'user' | 'assistant', text }
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [theme, setTheme] = useState(null); // null = follow system, 'light' | 'dark' = forced
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [streamingMessageIndex, setStreamingMessageIndex] = useState(null);
  const [copiedMessageIndex, setCopiedMessageIndex] = useState(null);
  const [regeneratingMessageIndex, setRegeneratingMessageIndex] = useState(null);
  const MESSAGES_KEY_PREFIX = "zerox_msgs_";
  const CONVERSATIONS_KEY_PREFIX = "zerox_conversations_";

  const textareaRef = useRef(null);
  const streamWrapRef = useRef(null);

  // Image search helpers
  function isImageRequest(text) {
    if (!text) return false;
    const t = text.toLowerCase();
    // common image request patterns
    const imageTriggers = [
      "generate an image",
      "create an image",
      "show me an image",
      "find an image",
      "generate a picture",
      "show a picture",
      "show picture",
      "image of",
      "picture of",
      "photo of",
      "find a photo",
      "show me a photo",
      "generate photo",
    ];
    for (const trig of imageTriggers) if (t.includes(trig)) return true;
    // also match short patterns like "image" + "of"
    if (/image of|picture of|photo of/.test(t)) return true;
    // verbs + image keyword
    if (/(generate|create|show|find|make) .* (image|picture|photo)/i.test(t)) return true;
    return false;
  }

  function extractImageQuery(text) {
    if (!text) return "";
    let q = text;
    // remove trigger phrases
    q = q.replace(/generate an image of|create an image of|generate an image|create an image|generate a picture of|create a picture of|show me an image of|show me an image|show me a picture of|show me a picture|find an image of|find an image of|find an image|find a photo of|show me a photo of/gi, "");
    q = q.replace(/please|please\.|please\,|could you|please show|please generate/gi, "");
    q = q.replace(/^(?:of|a|an|the)\s+/i, "");
    q = q.trim();
    // Fallback: if query still contains words like 'image' remove them
    q = q.replace(/\b(image|picture|photo|generate|create|show|find)\b/gi, "").trim();
    return q || text;
  }

  async function searchUnsplash(query) {
    try {
      if (!UNSPLASH_ACCESS_KEY) {
        console.warn("Unsplash access key not configured (VITE_UNSPLASH_ACCESS_KEY)");
        return null;
      }
      const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}`,
        },
      });
      if (!res.ok) return null;
      const data = await res.json();
      const result = (data && data.results && data.results[0]) || null;
      if (!result) return null;
      return {
        type: "image",
        query,
        imageUrl: result.urls && (result.urls.regular || result.urls.full || result.urls.small),
        photographer: result.user && (result.user.name || result.user.username),
        photographerUrl: result.user && result.user.links && result.user.links.html,
        unsplashUrl: result.links && result.links.html,
      };
    } catch (err) {
      console.error("Unsplash search error:", err);
      return null;
    }
  }

  // Gemini client for browser usage (configured from src/config.js)
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-3.6-flash" });

  async function getBotResponse(userText, messageIndex) {
    try {
      // Custom response for "who made you" type questions
      const lowerText = userText.toLowerCase();
      if (
        lowerText.includes("who made") ||
        lowerText.includes("who created") ||
        lowerText.includes("who built") ||
        lowerText.includes("your creator") ||
        lowerText.includes("made by") ||
        lowerText.includes("creator") ||
        (lowerText.includes("who") && lowerText.includes("u"))
      ) {
        const customReply = "I am made by Kailas GR";
        
        // Update message with custom reply
        setMessages((prev) => {
          const updated = [...prev];
          if (messageIndex !== undefined) {
            updated[messageIndex] = { ...updated[messageIndex], text: customReply };
          } else {
            if (updated.length === 0 || updated[updated.length - 1].role !== "assistant") {
              updated.push({ role: "assistant", text: customReply });
            } else {
              updated[updated.length - 1] = { ...updated[updated.length - 1], text: customReply };
            }
          }
          return updated;
        });
        
        return customReply;
      }

      // Build conversation for Gemini's expected format
      const history = messages
        .slice(0, messageIndex ? messageIndex - 1 : undefined)
        .filter((m) => m.type !== "image")
        .map((m) => ({
          role: m.role === "user" ? "user" : "model",
          parts: [{ text: m.text }],
        }));

      // Create a chat session with history
      const chat = model.startChat({ history });

      // Use streaming for progressive response
      let fullText = "";
      
      // Update message state with streaming text
      const updateMessage = (text) => {
        setMessages((prev) => {
          const updated = [...prev];
          if (messageIndex !== undefined) {
            // Regenerating: update existing message
            updated[messageIndex] = { ...updated[messageIndex], text };
          } else {
            // New message: ensure assistant message exists
            if (updated.length === 0 || updated[updated.length - 1].role !== "assistant") {
              updated.push({ role: "assistant", text });
            } else {
              updated[updated.length - 1] = { ...updated[updated.length - 1], text };
            }
          }
          return updated;
        });
      };

      const result = await chat.sendMessageStream(userText);
      
      for await (const chunk of result.stream) {
        const chunkText = chunk.text();
        fullText += chunkText;
        updateMessage(fullText);
      }

      if (!fullText) {
        throw new Error("no-output");
      }

      return fullText;
    } catch (err) {
      console.error("Gemini error:", err);
      // fallback to demo replies
      await new Promise((r) => setTimeout(r, 700 + Math.random() * 700));
      const reply = DEMO_REPLIES[Math.floor(Math.random() * DEMO_REPLIES.length)];
      const fullReply = reply + "\n\n(This is a demo reply — configure src/config.js with your Gemini API key.)";
      return fullReply;
    }
  }

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 160) + "px";
    }
  }, [input]);

  useEffect(() => {
    if (streamWrapRef.current) {
      streamWrapRef.current.scrollTop = streamWrapRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("zerox_current_user");
      if (raw) {
        const user = JSON.parse(raw);
        setCurrentUser(user);
      }
    } catch (err) {
      // ignore
    }
  }, []);

  // Generate unique ID for conversations
  function generateConversationId() {
    return `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Truncate title to max 50 chars
  function truncateTitle(text) {
    if (text.length > 50) return text.substring(0, 50) + "...";
    return text;
  }

  // Load conversations from localStorage
  function loadConversations() {
    if (!currentUser) return [];
    try {
      const key = CONVERSATIONS_KEY_PREFIX + (currentUser.email || "").trim().toLowerCase();
      const raw = localStorage.getItem(key);
      const convos = raw ? JSON.parse(raw) : [];
      // Sort by updatedAt, newest first
      return convos.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    } catch (err) {
      return [];
    }
  }

  // Save conversations to localStorage
  function saveConversations(convos) {
    if (!currentUser) return;
    try {
      const key = CONVERSATIONS_KEY_PREFIX + (currentUser.email || "").trim().toLowerCase();
      localStorage.setItem(key, JSON.stringify(convos));
    } catch (err) {
      // ignore
    }
  }

  // Load a specific conversation's messages
  function loadConversation(conversationId) {
    const convo = conversations.find((c) => c.id === conversationId);
    if (convo) {
      setMessages(convo.messages || []);
      setActiveConversationId(conversationId);
    }
  }

  // Update active conversation with current messages
  function updateActiveConversation() {
    if (!activeConversationId) return;
    setConversations((prev) =>
      prev.map((c) =>
        c.id === activeConversationId
          ? { ...c, messages, updatedAt: Date.now() }
          : c
      )
    );
  }

  // Load conversations on mount and when user changes
  useEffect(() => {
    if (!currentUser) return;
    const convos = loadConversations();
    setConversations(convos);
  }, [currentUser]);

  // Save conversations whenever they change
  useEffect(() => {
    if (!currentUser) return;
    saveConversations(conversations);
  }, [conversations, currentUser]);

  // Copy assistant message to clipboard
  function copyMessage(text) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedMessageIndex(Math.random()); // Use random to show feedback
      setTimeout(() => setCopiedMessageIndex(null), 2000);
    }).catch(err => {
      console.error("Failed to copy:", err);
    });
  }

  // Find the user message that corresponds to this assistant message
  function getUserMessageForAssistant(assistantIndex) {
    // Look backwards from assistant message to find the preceding user message
    for (let i = assistantIndex - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        return messages[i].text;
      }
    }
    return null;
  }

  // Regenerate the response for a specific assistant message
  async function regenerateMessage(assistantIndex) {
    const userMessage = getUserMessageForAssistant(assistantIndex);
    if (!userMessage) return;

    setRegeneratingMessageIndex(assistantIndex);
    setSending(true);
    setIsTyping(true);
    setStreamingMessageIndex(assistantIndex);

    try {
      const reply = await getBotResponse(userMessage, assistantIndex);
      // Update the conversation
      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeConversationId
            ? { ...c, messages, updatedAt: Date.now() }
            : c
        )
      );
    } catch (err) {
      console.error("Regeneration error:", err);
      const errorMsg = "Failed to regenerate response. Please try again.";
      setMessages((prev) => {
        const updated = [...prev];
        updated[assistantIndex] = { ...updated[assistantIndex], text: errorMsg };
        return updated;
      });
    } finally {
      setIsTyping(false);
      setSending(false);
      setStreamingMessageIndex(null);
      setRegeneratingMessageIndex(null);
    }
  }

  async function sendMessage(text) {
    const trimmed = (text ?? input).trim();
    if (!trimmed || sending) return;

    if (!currentUser) {
      alert("Please log in to chat.");
      return;
    }

    // IMAGE REQUEST HANDLING: detect and serve from Unsplash (no Gemini call)
    if (isImageRequest(trimmed)) {
      const query = extractImageQuery(trimmed) || trimmed;

      // Ensure a conversation exists (title from first user message)
      let convoId = activeConversationId;
      if (!convoId) {
        convoId = generateConversationId();
        setActiveConversationId(convoId);
        const newConvo = {
          id: convoId,
          title: truncateTitle(trimmed),
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        setConversations((prev) => [newConvo, ...prev]);
      }

      setSending(true);
      setIsTyping(true);

      // Add the user message first
      const afterUser = [...messages, { role: "user", text: trimmed }];
      setMessages(afterUser);
      // Clear the input box so the prompt doesn't remain while image loads
      setInput("");

      // Search Unsplash
      const img = await searchUnsplash(query);
      if (img) {
        const imageMessage = {
          role: "assistant",
          type: "image",
          query: img.query,
          imageUrl: img.imageUrl,
          photographer: img.photographer,
          photographerUrl: img.photographerUrl,
          unsplashUrl: img.unsplashUrl,
        };
        const final = [...afterUser, imageMessage];
        setMessages(final);
        setConversations((prev) =>
          prev.map((c) =>
            c.id === convoId
              ? { ...c, messages: final, updatedAt: Date.now() }
              : c
          )
        );
      } else {
        const errorMsg = {
          role: "assistant",
          text: "I couldn't find a suitable image for that request.",
        };
        const final = [...afterUser, errorMsg];
        setMessages(final);
        setConversations((prev) =>
          prev.map((c) =>
            c.id === convoId
              ? { ...c, messages: final, updatedAt: Date.now() }
              : c
          )
        );
      }

      setIsTyping(false);
      setSending(false);
      return;
    }

    // If no active conversation, create one
    let convoId = activeConversationId;
    if (!convoId) {
      convoId = generateConversationId();
      setActiveConversationId(convoId);
      const newConvo = {
        id: convoId,
        title: truncateTitle(trimmed),
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setConversations((prev) => [newConvo, ...prev]);
    }

    // Add user message to messages state
    const updatedMessages = [...messages, { role: "user", text: trimmed }];
    setMessages(updatedMessages);
    setInput("");
    setSending(true);
    setIsTyping(true);

    // Add empty assistant message placeholder and track its index
    const assistantMessageIndex = updatedMessages.length;
    const messagesWithPlaceholder = [...updatedMessages, { role: "assistant", text: "" }];
    setMessages(messagesWithPlaceholder);
    setStreamingMessageIndex(assistantMessageIndex);

    try {
      await getBotResponse(trimmed, assistantMessageIndex);
      
      // Get final messages state
      setMessages((current) => {
        // Update conversation with final messages
        setConversations((prev) =>
          prev.map((c) =>
            c.id === convoId
              ? { ...c, messages: current, updatedAt: Date.now() }
              : c
          )
        );
        return current;
      });
    } catch (err) {
      const errorMessages = [
        ...updatedMessages,
        {
          role: "assistant",
          text: "Something went wrong reaching the server. Please try again.",
        },
      ];
      setMessages(errorMessages);
      setConversations((prev) =>
        prev.map((c) =>
          c.id === convoId
            ? { ...c, messages: errorMessages, updatedAt: Date.now() }
            : c
        )
      );
    } finally {
      setIsTyping(false);
      setSending(false);
      setStreamingMessageIndex(null);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function handleNewChat() {
    setMessages([]);
    setInput("");
    setActiveConversationId(null);
  }

  function toggleTheme() {
    setTheme((prev) => {
      if (prev === "dark") return "light";
      if (prev === "light") return "dark";
      return "dark"; // first click: force dark regardless of system
    });
  }

  const rootAttrs = theme ? { "data-theme": theme } : {};

  return (
    <div className="nova-app" {...rootAttrs}>
      <style>{CSS}</style>

      <div className="app">
        {/* SIDEBAR */}
        <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
          <div className="brand">
            <div className="brand-mark" />
            <div className="brand-name">ZEROX</div>
          </div>

          <button className="new-chat-btn" onClick={handleNewChat}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New chat
          </button>

          <div className="history-label">Recent</div>
          <input
            type="text"
            className="sidebar-search"
            placeholder="Search chats..."
            value={sidebarSearch}
            onChange={(e) => setSidebarSearch(e.target.value)}
          />
          <div className="history">
            {conversations
              .filter((convo) =>
                convo.title
                  .toLowerCase()
                  .includes(sidebarSearch.toLowerCase())
              )
              .map((convo) => (
              <div
                className={`history-item ${activeConversationId === convo.id ? "active" : ""}`}
                key={convo.id}
                onClick={() => loadConversation(convo.id)}
              >
                {convo.title}
              </div>
            ))}
          </div>

          <div className="sidebar-footer">
            <div className="profile">
              <div className="avatar">{(currentUser && (currentUser.name || currentUser.email) ? (currentUser.name || currentUser.email).charAt(0).toUpperCase() : 'Y')}</div>
              <div className="profile-name">{currentUser && (currentUser.name || currentUser.email) ? (currentUser.name || currentUser.email) : 'You'}</div>
            </div>
            <button className="theme-toggle" onClick={toggleTheme} aria-label="Toggle theme">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
              </svg>
            </button>
          </div>
        </aside>

        {/* MAIN */}
        <main className="main">
          <div className="topbar">
            <div className="topbar-left">
              <button className="menu-btn" onClick={() => setSidebarOpen((v) => !v)} aria-label="Toggle sidebar">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              </button>
              <div className="model-name">ZEROX</div>
            </div>
            <div className="status-pill">
              <span className="status-dot" />
              Online
            </div>
          </div>

          <div className="stream-wrap" ref={streamWrapRef}>
            {messages.length === 0 && (
              <div className="empty-state">
                <p className="empty-headline">
                  What can I help
                  <br />
                  you build today?
                </p>
                <p className="empty-sub">Ask a question, paste some text, or try one of these.</p>
                <div className="suggestions">
                  {SUGGESTIONS.map((s) => (
                    <button
                      className="suggestion-chip"
                      key={s.title}
                      onClick={() => sendMessage(s.prompt)}
                    >
                      <b>{s.title}</b>
                      <span>{s.subtitle}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="stream">
              {messages.map((m, i) => {
                if (m.type === "image") {
                  return (
                    <div className="msg assistant" key={i}>
                      <div className="assistant-block">
                        <div className="rail" />
                        <div className="assistant-content-wrapper">
                          <div className="assistant-label">ZEROX</div>
                          <div className="assistant-content">
                            <div className="code-block-wrapper" style={{ padding: 0, border: 'none', background: 'transparent' }}>
                              <img src={m.imageUrl} alt={m.query || 'Unsplash image'} style={{ width: '100%', maxWidth: 600, borderRadius: 12, display: 'block' }} />
                              <div style={{ padding: '8px 12px', display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
                                <div style={{ display: 'flex', gap: 8 }}>
                                  <a className="action-btn" href={m.imageUrl} target="_blank" rel="noopener noreferrer">Open image</a>
                                  
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                }
                return m.role === "user" ? (
                  <div className="msg user" key={i}>
                    <div className="bubble-user">{m.text}</div>
                  </div>
                ) : (
                  <div className="msg assistant" key={i}>
                    <div className="assistant-block">
                      <div className="rail" />
                      <div className="assistant-content-wrapper">
                        <div className="assistant-label">ZEROX</div>
                        <div className="assistant-content">
                          {m.text ? (
                            <ReactMarkdown 
                              remarkPlugins={[remarkGfm]}
                              components={{
                                code: ({ node, inline, className, children, ...props }) => {
                                  if (inline) {
                                    return <code className="inline-code" {...props}>{children}</code>;
                                  }
                                  return (
                                    <div className="code-block-wrapper">
                                      <pre className="code-block"><code className={className} {...props}>{children}</code></pre>
                                      <button
                                        className="code-copy-btn"
                                        onClick={() => copyMessage(String(children).replace(/\n$/, ''))}
                                        title="Copy code"
                                      >
                                        {copiedMessageIndex === i ? "Copied" : "Copy"}
                                      </button>
                                    </div>
                                  );
                                },
                                p: ({ children }) => <p className="markdown-p">{children}</p>,
                                ul: ({ children }) => <ul className="markdown-ul">{children}</ul>,
                                ol: ({ children }) => <ol className="markdown-ol">{children}</ol>,
                                li: ({ children }) => <li className="markdown-li">{children}</li>,
                                h1: ({ children }) => <h1 className="markdown-h1">{children}</h1>,
                                h2: ({ children }) => <h2 className="markdown-h2">{children}</h2>,
                                h3: ({ children }) => <h3 className="markdown-h3">{children}</h3>,
                                blockquote: ({ children }) => <blockquote className="markdown-blockquote">{children}</blockquote>,
                                a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="markdown-link">{children}</a>,
                              }}
                            >
                              {m.text}
                            </ReactMarkdown>
                          ) : null}
                        </div>
                        {m.text && !isTyping && (
                          <div className="message-actions">
                            <button
                              className="action-btn"
                              onClick={() => copyMessage(m.text)}
                              title="Copy message"
                            >
                              {copiedMessageIndex === i ? "Copied ✓" : "Copy"}
                            </button>
                            <button
                              className="action-btn"
                              onClick={() => regenerateMessage(i)}
                              title="Regenerate response"
                              disabled={sending || regeneratingMessageIndex === i}
                            >
                              {regeneratingMessageIndex === i ? "Regenerating..." : "Regenerate"}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {isTyping && (
                <div className="msg assistant">
                  <div className="assistant-block">
                    <div className="rail" />
                    <div className="assistant-content-wrapper">
                      <div className="assistant-label">Zerox</div>
                      <div className="typing">
                        <span />
                        <span />
                        <span />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="composer-wrap">
            <div className="composer">
              <textarea
                ref={textareaRef}
                rows={1}
                placeholder="Message Zerox…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              <button
                className="send-btn"
                onClick={() => sendMessage()}
                disabled={sending || !input.trim()}
                aria-label="Send message"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="19" x2="12" y2="5" />
                  <polyline points="5 12 12 5 19 12" />
                </svg>
              </button>
            </div>
            <div className="disclaimer">Zerox can make mistakes. Check important information.</div>
          </div>
        </main>
      </div>
    </div>
  );
}

const CSS = `
.nova-app{
  --bg: #F5F3EE;
  --sidebar: #EDE9E0;
  --surface: #FFFFFF;
  --surface-2: #F1EEE7;
  --border: #E1DCD1;
  --text: #22201C;
  --text-muted: #7A756B;
  --accent: #C97A32;
  --accent-strong: #B5691F;
  --accent-soft: rgba(201,122,50,0.12);
  --user-bubble: #22201C;
  --user-bubble-text: #F5F3EE;
  --shadow: 0 1px 2px rgba(30,25,15,0.04), 0 8px 24px rgba(30,25,15,0.05);
  --radius-lg: 20px;
  --radius-md: 14px;
  --radius-sm: 9px;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  height: 100vh;
  width: 100%;
}

@media (prefers-color-scheme: dark){
  .nova-app:not([data-theme="light"]){
    --bg: #0D1117;
    --sidebar: #12161D;
    --surface: #171B22;
    --surface-2: #1C222B;
    --border: #262C36;
    --text: #EDEEF0;
    --text-muted: #868F9C;
    --accent: #E3A44C;
    --accent-strong: #F0B767;
    --accent-soft: rgba(227,164,76,0.14);
    --user-bubble: #E3A44C;
    --user-bubble-text: #14100A;
    --shadow: 0 1px 2px rgba(0,0,0,0.2), 0 12px 32px rgba(0,0,0,0.35);
  }
}
.nova-app[data-theme="dark"]{
  --bg: #0D1117;
  --sidebar: #12161D;
  --surface: #171B22;
  --surface-2: #1C222B;
  --border: #262C36;
  --text: #EDEEF0;
  --text-muted: #868F9C;
  --accent: #E3A44C;
  --accent-strong: #F0B767;
  --accent-soft: rgba(227,164,76,0.14);
  --user-bubble: #E3A44C;
  --user-bubble-text: #14100A;
  --shadow: 0 1px 2px rgba(0,0,0,0.2), 0 12px 32px rgba(0,0,0,0.35);
}

.nova-app *{ box-sizing: border-box; }
.nova-app{ background: var(--bg); color: var(--text); }

.nova-app .app{ display: grid; grid-template-columns: 272px 1fr; height: 100%; width: 100%; overflow: hidden; }

.nova-app .sidebar{
  background: var(--sidebar);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  padding: 20px 14px;
  min-width: 0;
  height: 100vh;
  overflow: hidden;
}

.nova-app .brand{ display: flex; align-items: center; gap: 10px; padding: 4px 8px 22px 8px; flex-shrink: 0; }
.nova-app .brand-mark{
  width: 30px; height: 30px; border-radius: 9px;
  background: linear-gradient(155deg, var(--accent), var(--accent-strong));
  position: relative; flex-shrink: 0;
}
.nova-app .brand-mark::after{
  content: ""; position: absolute; inset: 8px; border-radius: 4px;
  background: var(--sidebar); opacity: .9;
}
.nova-app .brand-name{
  font-family: 'Fraunces', Georgia, serif; font-size: 19px; font-weight: 600; letter-spacing: -0.01em;
}

.nova-app .new-chat-btn{
  display: flex; align-items: center; gap: 9px; width: 100%;
  padding: 10px 12px; border-radius: var(--radius-sm);
  border: 1px solid var(--border); background: var(--surface); color: var(--text);
  font-family: inherit; font-size: 13.5px; font-weight: 500; cursor: pointer;
  transition: border-color .15s ease, transform .1s ease;
  flex-shrink: 0;
}
.nova-app .new-chat-btn:hover{ border-color: var(--accent); }
.nova-app .new-chat-btn:active{ transform: scale(0.98); }

.nova-app .history-label{ font-size: 11.5px; color: var(--text-muted); margin: 22px 10px 8px 10px; font-weight: 500; flex-shrink: 0; }
.nova-app .sidebar-search{
  width: calc(100% - 20px); padding: 8px 10px; margin: 0 10px 8px 10px;
  border-radius: var(--radius-sm); border: 1px solid var(--border);
  background: var(--surface); color: var(--text); font-size: 13px;
  font-family: inherit; outline: none;
  transition: border-color .15s ease;
  flex-shrink: 0;
}
.nova-app .sidebar-search:focus{ border-color: var(--accent); }
.nova-app .sidebar-search::placeholder{ color: var(--text-muted); }
.nova-app .history{ flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; margin: 0 -4px; padding: 0 4px; }
.nova-app .history-item{
  padding: 9px 10px; border-radius: var(--radius-sm); font-size: 13.5px; color: var(--text-muted);
  cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  transition: background .15s ease, color .15s ease;
}
.nova-app .history-item:hover{ background: var(--surface-2); color: var(--text); }
.nova-app .history-item.active{ background: var(--accent-soft); color: var(--text); font-weight: 500; }

.nova-app .sidebar-footer{
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  padding: 12px 10px 4px 10px; border-top: 1px solid var(--border); margin-top: 8px;
  flex-shrink: 0;
}
.nova-app .profile{ display: flex; align-items: center; gap: 9px; min-width: 0; }
.nova-app .avatar{
  width: 28px; height: 28px; border-radius: 50%; background: var(--surface-2);
  border: 1px solid var(--border); display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 600; flex-shrink: 0;
}
.nova-app .profile-name{ font-size: 13px; font-weight: 500; }
.nova-app .theme-toggle{
  width: 30px; height: 30px; border-radius: 50%; border: 1px solid var(--border);
  background: var(--surface); cursor: pointer; display: flex; align-items: center; justify-content: center;
  color: var(--text-muted); flex-shrink: 0;
}
.nova-app .theme-toggle:hover{ color: var(--accent); border-color: var(--accent); }

.nova-app .main{ display: flex; flex-direction: column; min-width: 0; height: 100%; position: relative; overflow: hidden; }

.nova-app .topbar{
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 26px; border-bottom: 1px solid var(--border); flex-shrink: 0;
}
.nova-app .topbar-left{ display: flex; align-items: center; gap: 10px; }
.nova-app .menu-btn{ display: none; background: none; border: none; cursor: pointer; color: var(--text); padding: 4px; }
.nova-app .model-name{ font-weight: 600; font-size: 14.5px; }
.nova-app .status-pill{
  display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-muted);
  padding: 4px 10px 4px 8px; border-radius: 999px; background: var(--surface-2);
}
.nova-app .status-dot{
  width: 6px; height: 6px; border-radius: 50%; background: #4CAF6D;
  box-shadow: 0 0 0 3px rgba(76,175,109,0.18);
}

.nova-app .stream-wrap{ flex: 1; overflow-y: auto; padding: 32px 24px 12px 24px; min-height: 0; }
.nova-app .stream{ max-width: 700px; margin: 0 auto; display: flex; flex-direction: column; gap: 26px; }

.nova-app .empty-state{ max-width: 620px; margin: 8vh auto 0 auto; text-align: left; padding: 0 12px; }
.nova-app .empty-headline{
  font-family: 'Fraunces', Georgia, serif; font-weight: 500; font-style: italic;
  font-size: 34px; line-height: 1.25; letter-spacing: -0.01em; margin: 0 0 6px 0;
}
.nova-app .empty-sub{ color: var(--text-muted); font-size: 14.5px; margin: 0 0 28px 0; }
.nova-app .suggestions{ display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.nova-app .suggestion-chip{
  text-align: left; padding: 14px 16px; border-radius: var(--radius-md);
  border: 1px solid var(--border); background: var(--surface); cursor: pointer;
  font-family: inherit; color: var(--text); font-size: 13.5px; line-height: 1.45;
  transition: border-color .15s ease, transform .1s ease;
}
.nova-app .suggestion-chip:hover{ border-color: var(--accent); }
.nova-app .suggestion-chip:active{ transform: scale(0.99); }
.nova-app .suggestion-chip b{ display:block; font-weight: 600; margin-bottom: 2px; }
.nova-app .suggestion-chip span{ color: var(--text-muted); }

.nova-app .msg{ display: flex; }
.nova-app .msg.user{ justify-content: flex-end; }
.nova-app .msg.assistant{ justify-content: flex-start; animation: messageEnter .3s ease-out; }
@keyframes messageEnter{
  from{ opacity: 0; transform: translateY(8px); }
  to{ opacity: 1; transform: translateY(0); }
}
.nova-app .bubble-user{
  max-width: 78%; background: var(--user-bubble); color: var(--user-bubble-text);
  padding: 11px 16px; border-radius: 18px 18px 4px 18px; font-size: 14.5px;
  line-height: 1.55; white-space: pre-wrap; animation: messageEnter .3s ease-out;
}
.nova-app .assistant-block{ display: flex; gap: 12px; max-width: 92%; }
.nova-app .rail{ width: 2px; border-radius: 2px; background: var(--accent); flex-shrink: 0; margin-top: 3px; }
.nova-app .assistant-content-wrapper{ flex: 1; }
.nova-app .assistant-content{ font-size: 14.5px; line-height: 1.65; word-wrap: break-word; }
.nova-app .assistant-label{ font-size: 11.5px; font-weight: 600; color: var(--accent); margin-bottom: 5px; }
.nova-app .message-actions{
  display: flex; gap: 8px; margin-top: 10px; opacity: 0;
  transition: opacity .15s ease;
}
.nova-app .msg.assistant:hover .message-actions{ opacity: 1; }
.nova-app .action-btn{
  padding: 6px 12px; font-size: 12px; border-radius: 6px;
  border: 1px solid var(--border); background: var(--surface-2);
  color: var(--text-muted); cursor: pointer; font-family: inherit;
  transition: all .15s ease;
}
.nova-app .action-btn:hover:not(:disabled){ color: var(--accent); border-color: var(--accent); }
.nova-app .action-btn:disabled{ opacity: 0.5; cursor: default; }
.nova-app .code-block-wrapper{
  position: relative; margin: 12px 0;
  background: var(--surface-2); border-radius: var(--radius-sm);
  border: 1px solid var(--border); overflow: hidden;
}
.nova-app .code-block{
  margin: 0; padding: 14px 16px; overflow-x: auto;
  font-family: 'Courier New', monospace; font-size: 13px;
  line-height: 1.5; color: var(--text);
}
.nova-app .code-copy-btn{
  position: absolute; top: 8px; right: 8px;
  padding: 6px 10px; font-size: 11px; border-radius: 4px;
  border: 1px solid var(--border); background: var(--surface);
  color: var(--text-muted); cursor: pointer; font-family: inherit;
  transition: all .15s ease;
  z-index: 10;
}
.nova-app .code-copy-btn:hover{ background: var(--surface); color: var(--accent); border-color: var(--accent); }
.nova-app .inline-code{
  background: var(--surface-2); padding: 2px 6px; border-radius: 4px;
  font-family: 'Courier New', monospace; font-size: 0.95em;
  color: var(--accent);
}
.nova-app .markdown-p{ margin: 0 0 12px 0; }
.nova-app .markdown-ul, .nova-app .markdown-ol{
  margin: 12px 0 12px 24px; padding: 0;
}
.nova-app .markdown-li{ margin: 4px 0; }
.nova-app .markdown-h1{ font-size: 1.8em; font-weight: 600; margin: 16px 0 12px 0; }
.nova-app .markdown-h2{ font-size: 1.5em; font-weight: 600; margin: 14px 0 10px 0; }
.nova-app .markdown-h3{ font-size: 1.2em; font-weight: 600; margin: 12px 0 8px 0; }
.nova-app .markdown-blockquote{
  margin: 12px 0; padding: 12px 16px; border-left: 3px solid var(--accent);
  background: var(--surface-2); color: var(--text-muted);
}
.nova-app .markdown-link{
  color: var(--accent); text-decoration: none;
  transition: opacity .15s ease;
}
.nova-app .markdown-link:hover{ opacity: 0.8; text-decoration: underline; }

.nova-app .typing{ display: flex; gap: 4px; padding: 6px 0 0 0; }
.nova-app .typing span{ width: 8px; height: 8px; border-radius: 50%; background: var(--accent); animation: nova-bounce 1.2s infinite ease-in-out; opacity: 0.7; }
.nova-app .typing span:nth-child(2){ animation-delay: .2s; }
.nova-app .typing span:nth-child(3){ animation-delay: .4s; }
@keyframes nova-bounce{
  0%, 60%, 100%{ transform: translateY(0); opacity: 0.6; }
  30%{ transform: translateY(-6px); opacity: 1; }
}

.nova-app .composer-wrap{ padding: 14px 24px 22px 24px; flex-shrink: 0; background: var(--bg); }
.nova-app .composer{
  max-width: 700px; margin: 0 auto; display: flex; align-items: flex-end; gap: 10px;
  background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg);
  padding: 8px 8px 8px 18px; box-shadow: var(--shadow);
  transition: all .2s ease;
}
.nova-app .composer:focus-within{
  border-color: var(--accent); box-shadow: 0 0 0 2px rgba(201,122,50,0.1);
}
.nova-app .composer textarea{
  flex: 1; border: none; outline: none; background: transparent; resize: none;
  font-family: inherit; font-size: 14.5px; color: var(--text); line-height: 1.5;
  max-height: 160px; padding: 8px 0;
  transition: all .15s ease;
}
.nova-app .send-btn{
  width: 38px; height: 38px; border-radius: 50%; border: none; background: var(--accent);
  color: #fff; display: flex; align-items: center; justify-content: center; cursor: pointer;
  flex-shrink: 0; transition: all .15s ease;
}
.nova-app .send-btn:hover{ background: var(--accent-strong); transform: scale(1.05); }
.nova-app .send-btn:active{ transform: scale(0.94); }
.nova-app .send-btn:disabled{ opacity: .4; cursor: not-allowed; transform: scale(1); }
.nova-app .disclaimer{ text-align: center; font-size: 11px; color: var(--text-muted); margin-top: 10px; }

.nova-app .stream-wrap::-webkit-scrollbar, .nova-app .history::-webkit-scrollbar{ width: 8px; }
.nova-app .stream-wrap::-webkit-scrollbar-thumb, .nova-app .history::-webkit-scrollbar-thumb{ background: var(--border); border-radius: 8px; }

@media (max-width: 780px){
  .nova-app .app{ grid-template-columns: 1fr; }
  .nova-app .sidebar{
    position: fixed; z-index: 20; top: 0; left: 0; bottom: 0; width: 272px;
    margin-left: -272px; box-shadow: var(--shadow); transition: margin-left .25s ease;
  }
  .nova-app .sidebar.open{ margin-left: 0; }
  .nova-app .menu-btn{ display: flex; }
  .nova-app .suggestions{ grid-template-columns: 1fr; }
  .nova-app .empty-headline{ font-size: 27px; }
  .nova-app .topbar{ padding: 12px 16px; }
  .nova-app .stream-wrap{ padding: 22px 14px 8px 14px; }
  .nova-app .composer-wrap{ padding: 10px 14px 16px 14px; }
}
`;

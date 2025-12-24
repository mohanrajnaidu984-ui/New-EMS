import React, { useState, useRef, useEffect } from 'react';
import './ChatWidget.css';

const ChatWidget = ({ onOpenEnquiry }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState([
        { role: 'bot', content: 'Hello! I am your EMS Assistant. Ask me anything about enquiries.' }
    ]);
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isOpen]);

    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isOpen]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!inputValue.trim() || isLoading) return;

        const userMessage = inputValue.trim();
        setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
        setInputValue('');
        setIsLoading(true);

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ message: userMessage }),
            });

            const data = await response.json();

            if (data.answer) {
                setMessages(prev => [...prev, {
                    role: 'bot',
                    content: data.answer,
                    sources: data.sources
                }]);
            } else if (data.error) {
                setMessages(prev => [...prev, { role: 'bot', content: `Error: ${data.error}` }]);
            }
        } catch (error) {
            setMessages(prev => [...prev, { role: 'bot', content: 'Sorry, I encountered an error. Please try again.' }]);
            console.error('Chat error:', error);
        } finally {
            setIsLoading(false);
        }
    };

    // Helper to parse text with [Enquiry: XXX] links
    const renderMessageContent = (msg) => {
        if (msg.role === 'user') return msg.content;

        // Split by citation pattern [Source: XXX] or [Enquiry: XXX]
        // The backend returns [Source: RequestNo] or [Enquiry: RequestNo]
        // Let's handle both. regex: /\[(?:Source|Enquiry): ([^\]]+)\]/g

        const parts = msg.content.split(/(\[(?:Source|Enquiry): [^\]]+\])/g);

        return (
            <>
                {parts.map((part, i) => {
                    const match = part.match(/\[(?:Source|Enquiry): ([^\]]+)\]/);
                    if (match) {
                        const reqNo = match[1];
                        return (
                            <span
                                key={i}
                                className="citation-link"
                                onClick={() => onOpenEnquiry && onOpenEnquiry(reqNo)}
                                title="Click to view details"
                            >
                                📄 {reqNo}
                            </span>
                        );
                    }
                    return part;
                })}
                {msg.sources && msg.sources.length > 0 && (
                    <div className="sources-list">
                        <small style={{ display: 'block', width: '100%', color: '#666', marginBottom: '4px' }}>Sources:</small>
                        {msg.sources.map((s, idx) => (
                            <span
                                key={idx}
                                className="citation-link"
                                onClick={() => onOpenEnquiry && onOpenEnquiry(s.id)}
                            >
                                Reference {idx + 1} ({s.id})
                            </span>
                        ))}
                    </div>
                )}
            </>
        );
    };

    return (
        <div className="chat-widget-container">
            <div className={`chat-window ${isOpen ? 'open' : ''}`}>
                <div className="chat-header">
                    <h3>EMS Assistant</h3>
                    <button className="chat-close-btn" onClick={() => setIsOpen(false)}>
                        ✕
                    </button>
                </div>
                <div className="chat-messages">
                    {messages.map((msg, idx) => (
                        <div key={idx} className={`message ${msg.role}`}>
                            {renderMessageContent(msg)}
                        </div>
                    ))}
                    {isLoading && (
                        <div className="typing-indicator">
                            Thinking...
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>
                <form className="chat-input-area" onSubmit={handleSubmit}>
                    <input
                        ref={inputRef}
                        type="text"
                        className="chat-input"
                        placeholder="Ask about enquiries..."
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                    />
                    <button type="submit" className="send-btn" disabled={isLoading || !inputValue.trim()}>
                        ➤
                    </button>
                </form>
            </div>

            <button className="chat-toggle-btn" onClick={() => setIsOpen(!isOpen)}>
                {isOpen ? '✕' : '💬'}
            </button>
        </div>
    );
};

export default ChatWidget;

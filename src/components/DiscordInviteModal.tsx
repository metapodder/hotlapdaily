'use client';

import { useState, useEffect } from 'react';
import { Send } from 'lucide-react';

export default function DiscordInviteModal() {
    const [isOpen, setIsOpen] = useState(false);
    const [message, setMessage] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    useEffect(() => {
        // Small delay to allow fade-in transition via class toggle if needed,
        // though global CSS handles opacity transition on mount if class is preset?
        // Looking at globals.css: .share-modal { opacity: 0; visibility: hidden; } .share-modal.visible { opacity: 1; ... }
        const timer = setTimeout(() => setIsOpen(true), 100);
        return () => clearTimeout(timer);
    }, []);

    const closeModal = () => {
        setIsOpen(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!message.trim()) return;

        setIsSubmitting(true);
        try {
            const response = await fetch('/api/feedback', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ message }),
            });

            if (response.ok) {
                setSubmitted(true);
                setTimeout(() => {
                    setIsOpen(false);
                }, 3000);
            } else {
                console.error('Failed to submit feedback');
            }
        } catch (error) {
            console.error('Error submitting feedback:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen && !submitted) return null;

    return (
        <div
            className={`share-modal ${isOpen ? 'visible' : ''}`}
            style={{ display: 'flex' }}
            onClick={(e) => {
                if (e.target === e.currentTarget) closeModal();
            }}
        >
            <div className="share-card" style={{ maxWidth: '450px', padding: '24px', width: '90%' }}>
                <button
                    onClick={closeModal}
                    className="modal-close pixel-button"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
                        <path d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12L19 6.41Z" fill="white" />
                    </svg>
                </button>

                <div className="flex flex-col items-center text-center w-full gap-4">
                    <div className="space-y-2 w-full">
                        <h2 style={{
                            fontFamily: "'Tiny5', sans-serif",
                            fontSize: '32px',
                            textTransform: 'uppercase',
                            letterSpacing: '2px',
                            margin: '0 0 16px 0',
                            lineHeight: '1.2'
                        }}>
                            Join the Community
                        </h2>
                        <p style={{
                            fontSize: '14px',
                            color: 'var(--text-secondary)',
                            lineHeight: '1.6',
                            maxWidth: '350px',
                            margin: '0 auto 20px auto',
                            fontFamily: "'IBM Plex Mono', monospace"
                        }}>
                            Hi adelocosa, We admire your racing skills! The Hotlap Daily community would love to hear from you or want you to join the Discord community.
                        </p>
                    </div>

                    {!submitted ? (
                        <form onSubmit={handleSubmit} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div className="w-full">
                                <textarea
                                    value={message}
                                    onChange={(e) => setMessage(e.target.value)}
                                    placeholder="SHARE A MESSAGE..."
                                    required
                                    style={{
                                        width: '100%',
                                        minHeight: '120px',
                                        padding: '16px',
                                        backgroundColor: 'var(--bg-secondary)',
                                        border: '2px solid var(--border)',
                                        fontFamily: "'IBM Plex Mono', monospace",
                                        fontSize: '14px',
                                        resize: 'none',
                                        borderRadius: 0,
                                        outline: 'none',
                                        color: 'var(--text-primary)',
                                        boxShadow: 'none',
                                        display: 'block'
                                    }}
                                />
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
                                <button
                                    type="submit"
                                    disabled={isSubmitting || !message.trim()}
                                    className="pixel-button"
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '10px',
                                        backgroundColor: isSubmitting ? 'var(--bg-secondary)' : '#5865F2',
                                        color: isSubmitting ? 'var(--text-secondary)' : 'white',
                                        borderColor: 'var(--border)',
                                        padding: '12px',
                                        fontSize: '14px'
                                    }}
                                    onMouseEnter={(e) => {
                                        if (!isSubmitting) e.currentTarget.style.filter = 'brightness(1.1)';
                                    }}
                                    onMouseLeave={(e) => {
                                        if (!isSubmitting) e.currentTarget.style.filter = 'none';
                                    }}
                                >
                                    {isSubmitting ? 'SENDING...' : 'SEND TO COMMUNITY'}
                                </button>

                                <a
                                    href="https://discord.gg/hSCtAbgcKY"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{
                                        fontSize: '12px',
                                        color: 'var(--text-secondary)',
                                        textDecoration: 'underline',
                                        fontFamily: "'IBM Plex Mono', monospace",
                                        marginTop: '4px',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Just take me to Discord &rarr;
                                </a>
                            </div>
                        </form>
                    ) : (
                        <div style={{ padding: '24px 0', animation: 'modalPopIn 0.3s ease' }}>
                            <h3 style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '20px', fontWeight: 'bold', marginBottom: '12px', color: '#2ecc71', textTransform: 'uppercase' }}>MESSAGE SENT!</h3>
                            <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '14px' }}>Thanks for sharing. See you on the track!</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

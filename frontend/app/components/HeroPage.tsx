"use client";

import React, { useRef, useEffect, useState } from "react";

/* ─── Hover-Border-Gradient Button (Aceternity clone) ─── */
function HoverBorderGradientButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick?: () => void;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [hovered, setHovered] = useState(false);
  const [angle, setAngle] = useState(0);
  const rafRef = useRef<number | null>(null);

  // Continuously rotate the conic gradient when hovered
  useEffect(() => {
    if (hovered) {
      let a = angle;
      const tick = () => {
        a = (a + 2) % 360;
        setAngle(a);
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } else {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hovered]);

  const gradientStyle = hovered
    ? {
        background: `conic-gradient(from ${angle}deg at 50% 50%, #d4af37 0deg, #f59e0b 60deg, #10b981 120deg, #3b82f6 180deg, #8b5cf6 240deg, #ec4899 300deg, #d4af37 360deg)`,
      }
    : { background: "rgba(255,255,255,0.12)" };

  return (
    <button
      ref={btnRef}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="hover-border-btn"
      style={{ "--btn-gradient": hovered ? "1" : "0" } as React.CSSProperties}
    >
      {/* Gradient border shell */}
      <span className="hover-border-shell" style={gradientStyle} />
      {/* Inner content */}
      <span className="hover-border-inner">
        {children}
      </span>
    </button>
  );
}

/* ─── Background Lines (Aceternity clone) ─── */
// 25 horizontal SVG paths that animate with a staggered wave
function BackgroundLines() {
  // We draw lines across the full viewport width as bezier curves
  const lineCount = 30;

  return (
    <svg
      className="bg-lines-svg"
      viewBox="0 0 1440 900"
      preserveAspectRatio="xMidYMid slice"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {Array.from({ length: lineCount }).map((_, i) => {
        const y = (900 / (lineCount + 1)) * (i + 1);
        // Slight vertical variance to make each line unique
        const cp1y = y - 40 + (i % 5) * 12;
        const cp2y = y + 40 - (i % 7) * 10;
        return (
          <path
            key={i}
            d={`M0 ${y} C360 ${cp1y}, 1080 ${cp2y}, 1440 ${y}`}
            fill="none"
            stroke="url(#lineGrad)"
            strokeWidth="0.8"
            strokeOpacity="0.35"
            style={{
              animation: `bgLineWave ${4 + (i % 6) * 0.5}s ease-in-out infinite alternate`,
              animationDelay: `${(i * 0.18).toFixed(2)}s`,
            }}
          />
        );
      })}

      {/* Gradient definition: subtle gold → cyan */}
      <defs>
        <linearGradient id="lineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#d4af37" stopOpacity="0" />
          <stop offset="20%"  stopColor="#d4af37" stopOpacity="1" />
          <stop offset="50%"  stopColor="#38bdf8" stopOpacity="1" />
          <stop offset="80%"  stopColor="#d4af37" stopOpacity="1" />
          <stop offset="100%" stopColor="#d4af37" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/* ─── Badge ─── */
function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="hero-badge">
      {children}
    </span>
  );
}

/* ─── Main Hero export ─── */
export default function HeroPage({ onEnter }: { onEnter: () => void }) {
  return (
    <div className="hero-root">
      {/* Animated lines layer */}
      <BackgroundLines />

      {/* Radial glow overlay — top-center */}
      <div className="hero-glow" />

      {/* Content */}
      <div className="hero-content">
        {/* Gov badge */}
        <Badge>🇮🇳 Government of India Initiative</Badge>

        {/* Title */}
        <h1 className="hero-title">
          <span className="hero-title-main">समर्थ</span>
          <span className="hero-title-sub">Samarth</span>
        </h1>

        {/* Tagline */}
        <p className="hero-tagline">
          National AI-powered Grievance Redressal Portal
        </p>

        {/* Description */}
        <p className="hero-desc">
          Speak your complaint in any Indian language. Upload a photo.
          Let Samarth's LangGraph AI instantly route it to the right
          ministry — from CPGRAMS to GHMC, EPFO to Cyber Crime Portal.
        </p>

        {/* Stats row */}
        <div className="hero-stats">
          <div className="hero-stat">
            <span className="hero-stat-num">26</span>
            <span className="hero-stat-label">Ministry Domains</span>
          </div>
          <div className="hero-stat-divider" />
          <div className="hero-stat">
            <span className="hero-stat-num">7+</span>
            <span className="hero-stat-label">Indian Languages</span>
          </div>
          <div className="hero-stat-divider" />
          <div className="hero-stat">
            <span className="hero-stat-num">AI</span>
            <span className="hero-stat-label">Powered Routing</span>
          </div>
        </div>

        {/* CTA button */}
        <HoverBorderGradientButton onClick={onEnter}>
          Try getting your problem fixed&nbsp;→
        </HoverBorderGradientButton>

        {/* Micro hint */}
        <p className="hero-hint">
          No account needed · Completely free · Powered by LangGraph + Groq
        </p>
      </div>
    </div>
  );
}

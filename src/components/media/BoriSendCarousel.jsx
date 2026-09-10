import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { base44 } from "@/api/base44Client";

function isLive(slide) {
  if (!slide?.is_active) return false;
  const now = Date.now();
  if (slide.starts_at && new Date(slide.starts_at).getTime() > now) return false;
  if (slide.ends_at && new Date(slide.ends_at).getTime() < now) return false;
  return true;
}

export default function BoriSendCarousel({ placement = "dashboard", className = "" }) {
  const [slides, setSlides] = useState([]);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    let active = true;
    base44.entities.DashboardSlide.list("display_order", 50)
      .then(rows => { if (active) setSlides(rows || []); })
      .catch(() => { if (active) setSlides([]); });
    return () => { active = false; };
  }, []);

  const visible = useMemo(() => {
    return slides.filter(s => isLive(s) && (s.placement === placement || s.placement === "both"));
  }, [slides, placement]);

  useEffect(() => {
    if (index >= visible.length) setIndex(0);
  }, [visible.length, index]);

  useEffect(() => {
    if (paused || visible.length <= 1) return;
    const timer = setInterval(() => setIndex(i => (i + 1) % visible.length), 7000);
    return () => clearInterval(timer);
  }, [paused, visible.length]);

  const current = visible[index] || visible[0];
  if (!current) return null;
  const go = (next) => setIndex((next + visible.length) % visible.length);
  const defaultTitle = placement === "web" ? "Stay connected with the people who matter" : "Keep the conversation going";
  const defaultBody = placement === "web"
    ? "BoriSend helps you remember when to reach out, prepare thoughtful messages and stay consistent with the relationships that matter."
    : "Small, consistent moments help important relationships stay close. BoriSend helps you remember when to reach out and keeps communication thoughtful.";
  const displayTitle = current?.title || defaultTitle;
  const displayBody = current?.body || defaultBody;
  const showCopy = displayTitle || displayBody || current?.cta_label;

  return (
    <section
      className={`relative overflow-hidden rounded-3xl border border-border/50 bg-card ${className}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-roledescription="carousel"
      aria-label={placement === "web" ? "BoriSend highlights" : "Dashboard highlights"}
    >
      <div className="relative aspect-[16/10] md:aspect-[16/7] bg-muted">
        <img
          key={current.id || current.image_url}
          src={current.image_url}
          alt={current.alt_text || current.title || "BoriSend highlight"}
          className="h-full w-full object-cover object-center"
          loading={index === 0 ? "eager" : "lazy"}
        />

        {visible.length > 1 && (
          <>
            <button type="button" aria-label="Previous slide" onClick={() => go(index - 1)} className="absolute left-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-background/90 border border-border/50 flex items-center justify-center shadow-sm">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button type="button" aria-label="Next slide" onClick={() => go(index + 1)} className="absolute right-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-background/90 border border-border/50 flex items-center justify-center shadow-sm">
              <ChevronRight className="w-5 h-5" />
            </button>
          </>
        )}
      </div>

      {showCopy && (
        <div className="px-4 py-3 md:px-5 md:py-4 bg-background">
          {displayTitle && <p className="text-sm md:text-base font-semibold text-foreground">{displayTitle}</p>}
          {displayBody && <p className="text-xs md:text-sm text-muted-foreground mt-1 leading-relaxed max-w-3xl">{displayBody}</p>}
          {current.cta_label && current.cta_url && (
            current.cta_url.startsWith("/") ? (
              <Link to={current.cta_url} className="inline-flex mt-3 text-sm font-semibold text-primary">{current.cta_label}</Link>
            ) : (
              <a href={current.cta_url} className="inline-flex mt-3 text-sm font-semibold text-primary">{current.cta_label}</a>
            )
          )}
        </div>
      )}

      {visible.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 py-3 bg-background" aria-label="Choose slide">
          {visible.map((slide, i) => (
            <button key={slide.id || i} type="button" aria-label={`Go to slide ${i + 1}`} aria-current={i === index ? "true" : undefined} onClick={() => setIndex(i)} className={`h-2 rounded-full transition-all ${i === index ? "w-6 bg-primary" : "w-2 bg-muted-foreground/30"}`} />
          ))}
        </div>
      )}
    </section>
  );
}

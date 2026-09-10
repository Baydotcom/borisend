import React, { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";

const AUTOPLAY_MS = 6500;
const SWIPE_THRESHOLD = 45;

export default function RelationshipCarousel({ slides = [], className = "" }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [images, setImages] = useState({});
  const [paused, setPaused] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const touchStartX = useRef(null);

  useEffect(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!media) return;
    const update = () => setReduceMotion(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadImages = async () => {
      const entries = await Promise.all(
        slides.map(async (slide) => {
          try {
            const response = await fetch(slide.imageBase64Path, { cache: "force-cache" });
            if (!response.ok) throw new Error(`Image asset ${response.status}`);
            const base64 = (await response.text()).trim();
            return [slide.imageBase64Path, `data:image/webp;base64,${base64}`];
          } catch {
            return [slide.imageBase64Path, null];
          }
        })
      );
      if (!cancelled) setImages(Object.fromEntries(entries));
    };
    if (slides.length) loadImages();
    return () => { cancelled = true; };
  }, [slides]);

  const goTo = useCallback((index) => {
    if (!slides.length) return;
    setActiveIndex((index + slides.length) % slides.length);
  }, [slides.length]);

  const next = useCallback(() => goTo(activeIndex + 1), [activeIndex, goTo]);
  const previous = useCallback(() => goTo(activeIndex - 1), [activeIndex, goTo]);

  useEffect(() => {
    if (slides.length < 2 || paused || reduceMotion) return;
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % slides.length);
    }, AUTOPLAY_MS);
    return () => window.clearInterval(timer);
  }, [paused, reduceMotion, slides.length]);

  if (!slides.length) return null;

  const slide = slides[activeIndex];
  const src = images[slide.imageBase64Path];

  const handleTouchStart = (event) => {
    touchStartX.current = event.touches?.[0]?.clientX ?? null;
  };

  const handleTouchEnd = (event) => {
    if (touchStartX.current == null) return;
    const endX = event.changedTouches?.[0]?.clientX;
    if (typeof endX !== "number") return;
    const delta = endX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(delta) < SWIPE_THRESHOLD) return;
    if (delta < 0) next();
    else previous();
  };

  return (
    <section
      className={`overflow-hidden rounded-3xl border border-border/60 bg-card shadow-sm ${className}`}
      aria-roledescription="carousel"
      aria-label="BoriSend relationship highlights"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div
        className="relative aspect-[16/10] sm:aspect-[16/9] md:aspect-[2.15/1] bg-muted overflow-hidden"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {src ? (
          <img
            key={slide.imageBase64Path}
            src={src}
            alt={slide.alt}
            className={`absolute inset-0 h-full w-full object-cover ${reduceMotion ? "" : "animate-in fade-in duration-500"}`}
            draggable="false"
          />
        ) : (
          <div className="absolute inset-0 bg-muted" aria-hidden="true" />
        )}

        {slides.length > 1 && (
          <>
            <button
              type="button"
              onClick={previous}
              className="absolute left-3 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full border border-border/70 bg-background/90 text-foreground shadow-sm active:scale-95"
              aria-label="Previous slide"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={next}
              className="absolute right-3 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full border border-border/70 bg-background/90 text-foreground shadow-sm active:scale-95"
              aria-label="Next slide"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}
      </div>

      {/* Keep all copy outside the image so photographs remain unobstructed on mobile. */}
      <div className="px-4 py-3.5 sm:px-5 sm:py-4">
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground sm:text-base">{slide.title}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground sm:text-sm">{slide.body}</p>
            {slide.actionLabel && slide.actionUrl && (
              <Link
                to={slide.actionUrl}
                className="mt-3 inline-flex text-xs font-semibold text-primary sm:text-sm"
              >
                {slide.actionLabel}
              </Link>
            )}
          </div>
          {slides.length > 1 && (
            <div className="flex shrink-0 items-center gap-1.5 pt-1" aria-label="Choose slide">
              {slides.map((item, index) => (
                <button
                  key={`${item.imageBase64Path}-${index}`}
                  type="button"
                  onClick={() => goTo(index)}
                  className={`h-2.5 w-2.5 rounded-full border transition-colors ${index === activeIndex ? "border-primary bg-primary" : "border-border bg-muted"}`}
                  aria-label={`Show slide ${index + 1}: ${item.title}`}
                  aria-current={index === activeIndex ? "true" : undefined}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

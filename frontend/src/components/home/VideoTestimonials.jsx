import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation, A11y } from "swiper/modules";
import { listTestimonials } from "../../services/testimonialService";
import "swiper/css";
import "swiper/css/navigation";

const FALLBACK_TESTIMONIALS = [
  {
    id: "fallback-1",
    name: "Gradus Learner",
    role: "Gradus X",
    thumbnailUrl: "https://dummyimage.com/960x1600/0b1120/ffffff&text=Student+Story",
    playbackUrl: "https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
  },
  {
    id: "fallback-2",
    name: "Gradus Learner",
    role: "Gradus Finlit",
    thumbnailUrl: "https://dummyimage.com/960x1600/0b1120/ffffff&text=Student+Story",
    playbackUrl: "https://storage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
  },
  {
    id: "fallback-3",
    name: "Gradus Learner",
    role: "Gradus Lead",
    thumbnailUrl: "https://dummyimage.com/960x1600/0b1120/ffffff&text=Student+Story",
    playbackUrl: "https://storage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4",
  },
];

const shimmerKeyframes = `
  @keyframes video-testimonial-shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
`;

const VideoTestimonials = () => {
  const [items, setItems] = useState(FALLBACK_TESTIMONIALS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeId, setActiveId] = useState(null);
  // Track all mounted video elements per testimonial id (loop clones included)
  const videoRefs = useRef({});
  const containerRef = useRef(null);

  const normalizeItems = useCallback((list) => {
    if (!Array.isArray(list)) return [];

    // Debug: Log incoming data
    console.log("Found raw testimonials:", list.length, list);

    const valid = list
      .map((item, idx) => {
        if (!item) return null;
        const playbackUrl =
          item.playbackUrl || item.videoUrl || item.video || item.src || item.url || item?.mediaUrl || "";

        if (!playbackUrl) {
          console.warn("Dropping testimonial without video:", item);
          return null;
        }

        const thumbnailUrl =
          item.thumbnailUrl || item.poster || item.imageUrl || item.thumbUrl || item.thumbnail || "";
        return {
          ...item,
          playbackUrl,
          thumbnailUrl,
          id: item.id ?? item._id ?? `testimonial-${idx}`,
        };
      })
      .filter(Boolean);

    console.log("Normalized valid testimonials:", valid.length);
    return valid;
  }, []);

  const registerVideo = useCallback((key, node) => {
    if (!key) return;
    if (!videoRefs.current[key]) {
      videoRefs.current[key] = new Set();
    }
    if (node) {
      videoRefs.current[key].add(node);
    } else {
      videoRefs.current[key].delete(node);
    }
  }, []);

  const stopAll = useCallback(() => {
    Object.values(videoRefs.current).forEach((set) => {
      set.forEach((video) => {
        try {
          video.pause();
          video.currentTime = 0;
        } catch (_) {
          /* ignore */
        }
      });
    });
    setActiveId(null);
  }, []);

  const togglePlayback = useCallback(
    (key, event) => {
      const frame = event?.currentTarget?.closest(".video-testimonial-frame");
      const clickedVideo = frame?.querySelector("video");
      const set = videoRefs.current[key];
      const fallbackVideo = set ? Array.from(set)[0] : null;
      const video = clickedVideo || fallbackVideo;
      if (!video) return;

      if (activeId === key && !video.paused) {
        video.pause();
        setActiveId(null);
        return;
      }
      stopAll();
      // Update state immediately to show controls/remove overlay
      setActiveId(key);

      const playPromise = video.play();
      if (playPromise?.then) {
        playPromise.catch(() => {
          /* autoplay may be blocked */
        });
      }
    },
    [activeId, stopAll]
  );

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await listTestimonials();
        if (!mounted) return;
        const normalized = normalizeItems(data);
        setItems(normalized.length ? normalized : FALLBACK_TESTIMONIALS);
        setError(null);
      } catch (err) {
        if (!mounted) return;
        setItems(FALLBACK_TESTIMONIALS);
        setError(err?.message || "Unable to load testimonials.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [normalizeItems]);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!containerRef.current || containerRef.current.contains(event.target)) return;
      stopAll();
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [stopAll]);

  const skeletonCards = useMemo(() => new Array(4).fill(null), []);
  const skeletonStyle = useMemo(
    () => ({
      width: "100%",
      height: "100%",
      borderRadius: 28,
      background: "linear-gradient(120deg, #eef2f6 0%, #dae2ec 50%, #eef2f6 100%)",
      backgroundSize: "200% 100%",
      animation: "video-testimonial-shimmer 1.5s ease-in-out infinite",
    }),
    []
  );
  const playButtonStyle = {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: 0,
    background: "linear-gradient(180deg, rgba(3,7,18,0) 35%, rgba(3,7,18,0.65) 100%)",
    cursor: "pointer",
    touchAction: "manipulation", // Improves touch responsiveness
    WebkitTapHighlightColor: "transparent",
    zIndex: 2,
  };
  const playIconStyle = {
    width: 64,
    height: 64,
    borderRadius: "50%",
    background: "rgba(0,0,0,0.65)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 8px 22px rgba(0,0,0,0.25)",
  };
  // Floating pause button style - visible, positioned in corner, doesn't block video controls
  const floatingPauseButtonStyle = {
    position: "absolute",
    top: 12,
    right: 12,
    width: 44,
    height: 44,
    borderRadius: "50%",
    background: "rgba(0,0,0,0.6)",
    border: "none",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    zIndex: 10,
    touchAction: "manipulation",
    WebkitTapHighlightColor: "transparent",
    boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
    transition: "opacity 0.2s, transform 0.2s",
  };
  // Only show skeleton while loading and no items are ready to render
  const showSkeleton = loading && !items.length;

  const sliderSettings = useMemo(() => {
    const count = Math.max(1, items.length || FALLBACK_TESTIMONIALS.length);
    const navigationEnabled = count > 1;
    const base = {
      modules: [Navigation, A11y],
      slidesPerView: "auto",
      spaceBetween: 24,
      navigation: navigationEnabled,
      loop: count >= 4, // avoid duplicate-first slide when only a couple of reels
      centeredSlides: false,
      touchStartPreventDefault: false, // let touch gestures bubble so swipes register on mobile
      watchOverflow: true,
      initialSlide: 0,
    };

    const bp = {
      0: { slidesPerView: "auto", spaceBetween: 12, navigation: navigationEnabled, centeredSlides: false },
      576: { slidesPerView: "auto", spaceBetween: 16, navigation: navigationEnabled, centeredSlides: false },
      768: { slidesPerView: "auto", spaceBetween: 18, navigation: navigationEnabled, centeredSlides: false },
      992: { slidesPerView: "auto", spaceBetween: 20, navigation: navigationEnabled, centeredSlides: false },
      1200: { slidesPerView: "auto", spaceBetween: 24, navigation: navigationEnabled, centeredSlides: false },
    };

    return { ...base, breakpoints: bp };
  }, [items.length]);

  return (
    <section className="video-testimonials-section py-64" ref={containerRef}>
      <style>{shimmerKeyframes}</style>
      <div className="container">
        <div className="row justify-content-center text-center mb-24">
          <div className="col-xl-7 col-lg-8">
            <h2 className="mb-0 l1-head text-neutral-900">Hear From Our Students</h2>
          </div>
        </div>

        <div className="video-testimonials-slider-wrap">
          {showSkeleton ? (
            <div className="video-reels-slider" style={{ display: "flex", gap: 24 }}>
              {skeletonCards.map((_, idx) => (
                <div className="px-12 flex-grow-1" key={`testimonial-skeleton-${idx}`}>
                  <div className="video-testimonial-card">
                    <div className="video-testimonial-frame video-testimonial-skeleton" style={skeletonStyle} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Swiper
              {...sliderSettings}
              className="video-reels-slider video-reels-swiper"
              onSlideChange={stopAll}
            >
              {items.map((item, idx) => {
                const key = String(item.id ?? idx);
                const isActive = activeId === key;
                const poster = item.thumbnailUrl || undefined;
                const altText = item.name ? `${item.name}'s testimonial` : "Student testimonial";
                const showPoster = Boolean(poster) && !isActive;
                return (
                  <SwiperSlide key={key} className="video-reel-slide">
                    <div className="px-12">
                      <div className="video-testimonial-card">
                        <div className="video-testimonial-frame">
                          {showPoster ? (
                            <img
                              src={poster}
                              alt={altText}
                              loading="lazy"
                              style={{
                                position: "absolute",
                                inset: 0,
                                width: "100%",
                                height: "100%",
                                objectFit: "cover",
                                zIndex: 0,
                                pointerEvents: "none",
                              }}
                            />
                          ) : null}
                          <video
                            ref={(node) => registerVideo(key, node)}
                            playsInline
                            preload="metadata"
                            poster={poster}
                            controls={isActive}
                            src={item.playbackUrl}
                            onEnded={stopAll}
                            onPause={(event) => {
                              if (event.target.paused && activeId === key) setActiveId(null);
                            }}
                            style={{
                              position: "absolute",
                              inset: 0,
                              width: "100%",
                              height: "100%",
                              objectFit: "cover",
                              backgroundColor: "#0b1120",
                              opacity: isActive ? 1 : 0, // keep video hidden until user plays
                              transition: "opacity 0.2s ease",
                              zIndex: 1,
                              pointerEvents: isActive ? "auto" : "none",
                              touchAction: "pan-x", // Allow horizontal swiping when video is not playing
                            }}
                          />
                          {/* Text Overlay */}
                          <div
                            style={{
                              position: "absolute",
                              bottom: 0,
                              left: 0,
                              right: 0,
                              padding: "24px 20px",
                              background: "linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.85) 100%)",
                              zIndex: 2,
                              pointerEvents: "none",
                              color: "#fff",
                              textAlign: "left",
                              borderBottomLeftRadius: 28, // Matches card radius
                              borderBottomRightRadius: 28,
                            }}
                          >
                            {item.quote && (
                              <p
                                style={{
                                  fontSize: "14px",
                                  lineHeight: "1.4",
                                  marginBottom: "12px",
                                  color: "rgba(255,255,255,0.9)",
                                  display: "-webkit-box",
                                  WebkitLineClamp: 3,
                                  WebkitBoxOrient: "vertical",
                                  overflow: "hidden"
                                }}
                              >
                                "{item.quote}"
                              </p>
                            )}
                            <div style={{ display: "flex", flexDirection: "column" }}>
                              <span style={{ fontSize: "16px", fontWeight: 700, color: "#fff" }}>
                                {item.name}
                              </span>
                              {item.role && (
                                <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.8)" }}>
                                  {item.role}
                                </span>
                              )}
                            </div>
                          </div>

                          {!isActive ? (
                            <button
                              type="button"
                              aria-label={`Play ${altText}`}
                              onClick={(event) => togglePlayback(key, event)}
                              style={playButtonStyle}
                            >
                              <span style={playIconStyle}>
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                  <path d="M9 7L16 12L9 17V7Z" fill="#fff" stroke="#fff" strokeWidth="1.1" strokeLinejoin="round" />
                                </svg>
                              </span>
                            </button>
                          ) : (
                            /* Floating pause button - positioned in corner, doesn't block video controls */
                            <button
                              type="button"
                              aria-label={`Pause ${altText}`}
                              onClick={(event) => togglePlayback(key, event)}
                              style={floatingPauseButtonStyle}
                            >
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <rect x="6" y="5" width="4" height="14" rx="1" fill="#fff" />
                                <rect x="14" y="5" width="4" height="14" rx="1" fill="#fff" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </SwiperSlide>
                );
              })}
            </Swiper>
          )}
        </div>
      </div>
    </section>
  );
};

export default VideoTestimonials;

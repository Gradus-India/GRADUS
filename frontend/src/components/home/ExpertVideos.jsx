import { useEffect, useRef, useState } from "react";
import { useInView } from "react-intersection-observer";
import { listExpertVideos } from "../../services/expertVideoService";

const ExpertVideos = () => {
  const [videos, setVideos] = useState([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [direction, setDirection] = useState("next");
  const videoRef = useRef(null);
  const touchStartX = useRef(null);
  const touchLatestX = useRef(null);
  const touchActive = useRef(false);
  const { ref: viewRef, inView } = useInView({ threshold: 0.35 });
  const panelId = "expert-video-panel";

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const data = await listExpertVideos();
        if (!isMounted) return;
        setVideos(Array.isArray(data) ? data : []);
        setIndex(0);
        setError(null);
      } catch (err) {
        if (!isMounted) return;
        setError(err?.message || "Unable to load expert videos right now.");
        setVideos([]);
      } finally {
        if (isMounted) setLoading(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  const count = videos.length;
  const currentVideo = count ? videos[index] : null;
  const prevVideo = count > 1 ? videos[(index - 1 + count) % count] : null;
  const nextVideo = count > 1 ? videos[(index + 1) % count] : null;
  const canNavigate = count > 1;

  const goPrev = () => {
    if (!canNavigate) return;
    setDirection("prev");
    setIndex((idx) => (idx - 1 + count) % count);
  };

  const goNext = () => {
    if (!canNavigate) return;
    setDirection("next");
    setIndex((idx) => (idx + 1) % count);
  };

  const goToIndex = (targetIdx) => {
    if (!canNavigate || targetIdx === index) return;
    setDirection(targetIdx > index ? "next" : "prev");
    setIndex(targetIdx);
  };

  const handleTouchStart = (event) => {
    touchStartX.current = event.touches?.[0]?.clientX ?? null;
    touchLatestX.current = touchStartX.current;
    touchActive.current = true;
  };

  const handleTouchMove = (event) => {
    if (!touchActive.current) return;
    touchLatestX.current = event.touches?.[0]?.clientX ?? touchLatestX.current;
  };

  const resetTouchTracking = () => {
    touchStartX.current = null;
    touchLatestX.current = null;
    touchActive.current = false;
  };

  const handleTouchEnd = () => {
    if (!touchActive.current || touchStartX.current == null || touchLatestX.current == null) {
      resetTouchTracking();
      return;
    }
    const delta = touchLatestX.current - touchStartX.current;
    if (Math.abs(delta) > 40) {
      if (delta < 0) {
        goNext();
      } else {
        goPrev();
      }
    }
    resetTouchTracking();
  };

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const playSafe = async () => {
      try {
        if (!el.muted) {
          // el.muted = true; // ensure autoplay allowed; user can unmute manually
        }
        el.currentTime = 0; // Force 0:00 as thumbnail
        // Autoplay removed per request
        // if (inView) {
        //   await el.play();
        // } else {
        //   el.pause();
        // }
      } catch (err) {
        // autoplay might be blocked; ignore
      }
    };
    playSafe();
  }, [index, currentVideo?.playbackUrl]); // Removed inView dependency since we don't autoplay anymore

  const showSkeletonCard = loading && !currentVideo;
  const videoSkeletonStyle = {
    position: "absolute",
    inset: 0,
    zIndex: 1,
    borderRadius: 24,
    background: "linear-gradient(120deg, #1e2635, #0f172a, #1e2635)",
    backgroundSize: "200% 100%",
    animation: "expertVideoSkeleton 1.2s ease-in-out infinite",
  };

  return (
    <section className="expert-videos-section py-64" ref={viewRef}>
      <style>{`
        @keyframes expertVideoSkeleton {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
      <div className="container">
        <div className="expert-videos-header text-center mb-32">
          <p className="expert-videos-eyebrow">
            What <span>Experts</span> Say?
          </p>
        </div>

        <div className="expert-videos-stage" aria-live="polite">
          <div className="expert-video-stack">
            {prevVideo ? (
              <div
                className="expert-video-card is-prev"
                style={{
                  backgroundImage: prevVideo.thumbnailUrl ? `url(${prevVideo.thumbnailUrl})` : undefined,
                }}
                aria-hidden="true"
              />
            ) : null}

            <div className="expert-video-card is-current">
              <div
                className="expert-video-current-wrapper"
                id={panelId}
                role="tabpanel"
                aria-live="polite"
                aria-label={currentVideo?.title || "Expert video"}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onTouchCancel={resetTouchTracking}
                style={{ touchAction: "pan-y" }}
              >
                {showSkeletonCard ? (
                  <div className="expert-video-skeleton" aria-hidden="true" style={videoSkeletonStyle} />
                ) : null}
                {!showSkeletonCard && currentVideo ? (
                  <video
                    key={currentVideo.id || index}
                    src={currentVideo.playbackUrl}
                    poster={currentVideo.thumbnailUrl || undefined}
                    controls
                    playsInline
                    muted={false} // Unmuted so user hears sound when they manually play
                    className={`expert-video-player animate-${direction}`}
                    ref={videoRef}
                    style={{ position: "relative", zIndex: 2 }}
                  />
                ) : null}
                {/* When no video is available we leave the skeleton visible */}
              </div>
            </div>

            {nextVideo ? (
              <div
                className="expert-video-card is-next"
                style={{
                  backgroundImage: nextVideo.thumbnailUrl ? `url(${nextVideo.thumbnailUrl})` : undefined,
                }}
                aria-hidden="true"
              />
            ) : null}
            {canNavigate ? (
              <div className="expert-video-nav is-floating">
                <button type="button" onClick={goPrev} aria-label="Previous expert video">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>
                <button type="button" onClick={goNext} aria-label="Next expert video">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="9 6 15 12 9 18" />
                  </svg>
                </button>
              </div>
            ) : null}
          </div>
        </div>

        {canNavigate ? (
          <div className="expert-video-indicators" role="tablist" aria-label="Expert video carousel">
            {videos.map((video, idx) => (
              <button
                key={video.id || idx}
                type="button"
                className={`expert-indicator${idx === index ? " is-active" : ""}`}
                role="tab"
                aria-label={`Show expert video ${video.title || idx + 1}`}
                aria-selected={idx === index}
                aria-pressed={idx === index}
                aria-controls={panelId}
                tabIndex={idx === index ? 0 : -1}
                onClick={() => goToIndex(idx)}
              />
            ))}
          </div>
        ) : null}

        {error && !loading && !videos.length && !showSkeletonCard ? (
          <p className="text-center text-danger mt-16">{error}</p>
        ) : null}
      </div>
    </section>
  );
};

export default ExpertVideos;

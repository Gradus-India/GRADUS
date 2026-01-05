import { useEffect, useRef, useState } from "react";
import { useInView } from "react-intersection-observer";
import { fetchWhyGradusVideo } from "../../services/whyGradusVideoService";

const WhyGradusVideo = () => {
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [videoAspect, setVideoAspect] = useState(null);
  const [hasPlayed, setHasPlayed] = useState(false); // Track if user has started playing
  const [error, setError] = useState(null);
  const videoRef = useRef(null);
  const { ref: viewRef, inView } = useInView({ threshold: 0.35 });
  const videoSrc = item?.secureUrl || "";

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const data = await fetchWhyGradusVideo();
        if (isMounted) {
          setItem(data);
          setError(null);
        }
      } catch (e) {
        if (isMounted) {
          setItem(null);
          setError(e?.message || "Unable to load video.");
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  // Autoplay logic removed per request
  // useEffect(() => {
  //   const el = videoRef.current;
  //   if (!el || loading || !videoSrc) return;
  //   const playSafe = async () => {
  //     try {
  //       el.muted = true;
  //       el.currentTime = 0;
  //       if (inView) {
  //         await el.play();
  //       } else {
  //         el.pause();
  //       }
  //     } catch {
  //       // ignore autoplay block
  //     }
  //   };
  //   playSafe();
  // }, [videoSrc, loading, inView]);

  useEffect(() => {
    if (!videoSrc) {
      return;
    }
    setVideoLoaded(false);
  }, [videoSrc]);

  const handleEnded = () => {
    const el = videoRef.current;
    if (!el) return;
    el.pause();
    el.currentTime = 0;
  };

  const handleMetadata = () => {
    const el = videoRef.current;
    if (!el) return;
    const { videoWidth, videoHeight } = el;
    if (videoWidth > 0 && videoHeight > 0) {
      setVideoAspect(videoWidth / videoHeight);
    }
    // Set thumbnail to 0:46
    if (!hasPlayed) {
      el.currentTime = 46;
    }
    setVideoLoaded(true);
  };

  const handlePlay = () => {
    const el = videoRef.current;
    if (!el) return;

    if (!hasPlayed) {
      // First time playing: reset to start
      el.currentTime = 0;
      setHasPlayed(true);
      // We don't need to call play() again, the event itself comes from a play attempt
      // But adjusting currentTime might pause it depending on browser, so let's ensure it plays
      // However, changing currentTime inside onPlay might be tricky.
      // Better approach: do this in `onClick` or intercept the play intent?
      // Actually, standard behavior for <video> controls:
      // if we change currentTime during play, it just jumps.
    }
  };

  // Revised approach for handlePlay to avoid conflict:
  // Use onPlay to detect start, but since we are using native controls, 
  // we can just rely on the fact that if it hasn't played, we jump to 0.
  // Note: changing currentTime triggers 'seeked' event.

  const onPlayHandler = (e) => {
    const el = e.target;
    if (!hasPlayed) {
      el.currentTime = 0;
      setHasPlayed(true);
    }
  };

  const handleVideoError = () => {
    setError("The video failed to load. Please try again later.");
    setVideoLoaded(false);
  };

  const poster = undefined; // No static poster, using 0:46 frame as thumbnail
  const title = item?.title;
  const subtitle = item?.subtitle;
  const description = item?.description;
  const ctaLabel = item?.ctaLabel;
  const ctaHref = item?.ctaHref;
  const pillLabel = subtitle || "Why Gradus";
  const showSkeleton = (loading || (videoSrc && !videoLoaded)) && !error;
  const contentSkeleton = loading && !item;
  const showEmptyState = (!loading && !videoSrc) || Boolean(error);
  const skeletonKeyframes = `
    @keyframes why-gradus-skel {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
  `;
  const skeletonStyle = {
    background: "linear-gradient(90deg, #f1f4f9 25%, #e6ebf2 50%, #f1f4f9 75%)",
    backgroundSize: "200% 100%",
    animation: "why-gradus-skel 1.3s ease-in-out infinite",
    borderRadius: 12,
  };

  return (
    <section className="why-gradus-video-section py-64" ref={viewRef}>
      <style>{skeletonKeyframes}</style>
      <div className="container">

        <div className="row gy-4 align-items-center" style={{ minHeight: 420 }}>
          <div className="col-lg-5">
            <div className="mb-16">
              <div className="why-gradus-pill">{pillLabel}</div>
            </div>
            {contentSkeleton ? (
              <>
                <div style={{ ...skeletonStyle, height: 24, width: "85%", marginBottom: 12 }} />
                <div style={{ ...skeletonStyle, height: 24, width: "70%", marginBottom: 12 }} />
                <div style={{ ...skeletonStyle, height: 16, width: "95%", marginBottom: 8 }} />
                <div style={{ ...skeletonStyle, height: 16, width: "92%", marginBottom: 8 }} />
                <div style={{ ...skeletonStyle, height: 16, width: "80%", marginBottom: 8 }} />
                <div style={{ ...skeletonStyle, height: 16, width: "65%", marginBottom: 8 }} />
                <div style={{ ...skeletonStyle, height: 16, width: "72%", marginBottom: 8 }} />
              </>
            ) : (
              <>
                {title ? <h3 className="why-gradus-title l1-head mt-12">{title}</h3> : null}
                {description ? <p className="why-gradus-desc mt-12">{description}</p> : null}
                {ctaLabel && ctaHref ? (
                  <a className="why-gradus-cta mt-12 d-inline-flex align-items-center gap-8" href={ctaHref}>
                    {ctaLabel} <i className="ph-bold ph-arrow-up-right" aria-hidden="true" />
                  </a>
                ) : null}
              </>
            )}
          </div>
          <div className="col-lg-7">
            <div className="why-gradus-video-frame">
              <div
                style={{
                  position: "relative",
                  width: "100%",
                  aspectRatio: videoAspect || 16 / 9,
                }}
              >
                {showSkeleton ? (
                  <div
                    className="why-gradus-skeleton"
                    style={{
                      position: "absolute",
                      inset: 0,
                      zIndex: 1,
                      borderRadius: 16,
                      ...skeletonStyle,
                    }}
                  />
                ) : null}
                {videoSrc ? (
                  <video
                    ref={videoRef}
                    src={videoSrc}
                    poster={poster || undefined}
                    controls
                    playsInline
                    muted={false} // Unmuted so user hears sound when they manually play
                    preload="metadata"
                    onEnded={handleEnded}
                    onLoadedMetadata={handleMetadata}
                    onPlay={onPlayHandler}
                    onLoadedData={() => setVideoLoaded(true)}
                    onError={handleVideoError}
                    style={{
                      position: "relative",
                      zIndex: 2,
                      width: "100%",
                      height: "100%",
                      objectFit: "contain",
                      opacity: videoLoaded ? 1 : 0.05,
                      transition: "opacity 0.3s ease",
                      backgroundColor: "#0f172a",
                    }}
                  />
                ) : null}
                {showEmptyState ? (
                  <div
                    className="why-gradus-empty"
                    style={{
                      position: "absolute",
                      inset: 0,
                      zIndex: 1,
                      borderRadius: 16,
                      textAlign: "center",
                      paddingInline: 24,
                      color: "#0f172a",
                      fontWeight: 600,
                      lineHeight: 1.5,
                    }}
                  >
                    {error || "Video not available right now."}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default WhyGradusVideo;

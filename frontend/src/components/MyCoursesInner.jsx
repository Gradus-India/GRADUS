import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { fetchMyEnrollments } from "../services/userService.js";

const formatDate = (value) => {
  if (!value) {
    return "";
  }

  try {
    return new Date(value).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
};

const normalizeText = (value) =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : "";

const getInitials = (value) => {
  const normalized = normalizeText(value);
  if (!normalized) {
    return "GR";
  }

  const parts = normalized.split(" ").filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return (parts[0][0] + parts[1][0]).toUpperCase();
};

const toTitleCase = (value) => {
  const normalized = normalizeText(value);
  if (!normalized) {
    return "";
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1).toLowerCase();
};

const MyCoursesInner = () => {
  const { isAuthenticated, token, user } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const [state, setState] = useState({ loading: true, error: null, items: [] });

  useEffect(() => {
    let isActive = true;

    const loadEnrollments = async () => {
      if (!isAuthenticated || !token) {
        if (isActive) {
          setState({ loading: false, error: null, items: [] });
        }
        return;
      }

      if (isActive) {
        setState((previous) => ({ ...previous, loading: true, error: null }));
      }

      try {
        const response = await fetchMyEnrollments({ token });
        if (!isActive) {
          return;
        }

        const items = Array.isArray(response)
          ? response
          : (Array.isArray(response?.items) ? response.items : []);

        setState({ loading: false, error: null, items });
      } catch (error) {
        if (!isActive) {
          return;
        }

        setState({
          loading: false,
          error:
            error?.message ||
            "We couldn't load your enrolled courses. Please try again shortly.",
          items: [],
        });
      }
    };

    loadEnrollments();

    return () => {
      isActive = false;
    };
  }, [isAuthenticated, token, refreshKey]);

  const greeting = useMemo(() => {
    if (!user) {
      return "Here are the programs you are enrolled in.";
    }

    const firstName = normalizeText(user.firstName);
    if (firstName) {
      return `Hi ${firstName}, here are the programs you are enrolled in.`;
    }

    return "Here are the programs you are enrolled in.";
  }, [user]);

  const visibleItems = state.items; // DEBUG: Show all items
  // const visibleItems = useMemo(
  //   () => state.items.filter((enrollment) => normalizeText(enrollment?.course?.name)),
  //   [state.items]
  // );

  const enrolledCount = visibleItems.length;
  const enrolledLabel = useMemo(
    () => `${enrolledCount} ${enrolledCount === 1 ? 'course' : 'courses'} enrolled`,
    [enrolledCount]
  );

  const formatINR = (n) => {
    try { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(n || 0)); } catch { return `₹${n || 0}`; }
  };

  const normalizeAmount = (enrollment) => {
    const priceTotal = enrollment?.priceTotal || enrollment?.price_total;
    if (typeof priceTotal === 'number' && priceTotal > 0) {
      return priceTotal;
    }
    // Fallback: compute from course hero.priceINR + 18%
    const heroPrice = Number(enrollment?.course?.hero?.priceINR || 0);
    if (heroPrice > 0) return Math.round(heroPrice * 1.18);
    // Fallback: parse course.price string
    const parsed = Number(String(enrollment?.course?.price || '').replace(/[^0-9.]/g, ''));
    if (Number.isFinite(parsed) && parsed > 0) return Math.round(parsed * 1.18);
    return 0;
  };

  const handleRefresh = () => setRefreshKey((previous) => previous + 1);

  // Live Class Integration - Only show classes for enrolled courses
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
  const LIVE_CLASS_API_URL = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/live-class-api` : null;
  const [activeLiveClasses, setActiveLiveClasses] = useState([]);

  useEffect(() => {
    if (LIVE_CLASS_API_URL && isAuthenticated && token) {
      // Use active-classes endpoint which filters by enrollment
      fetch(`${LIVE_CLASS_API_URL}/active-classes`, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(res => res.json())
        .then(data => {
          if (data.success && Array.isArray(data.classes)) {
            setActiveLiveClasses(data.classes);
          } else {
            setActiveLiveClasses([]);
          }
        })
        .catch(err => {
          console.error("Failed to fetch active classes", err);
          setActiveLiveClasses([]);
        });
    } else {
      setActiveLiveClasses([]);
    }
  }, [isAuthenticated, token, LIVE_CLASS_API_URL]);

  const getActiveRoom = (courseSlug, courseName) => {
    if (!Array.isArray(activeLiveClasses) || activeLiveClasses.length === 0) return null;
    // Match by course slug (most reliable) or course name
    return activeLiveClasses.find(cls => {
      // Exact slug match (preferred)
      if (courseSlug && cls.courseSlug === courseSlug) return true;
      // Fallback: name matching
      if (courseName) {
        const normalizedCourse = normalizeText(courseName).toLowerCase().replace(/[^a-z0-9]/g, '');
        const normalizedClass = (cls.courseName || "").toLowerCase().replace(/[^a-z0-9]/g, '');
        return normalizedClass.includes(normalizedCourse) || normalizedCourse.includes(normalizedClass);
      }
      return false;
    });
  };

  return (
    <section className='favorite-course py-120'>
      <div className='container'>
        <div className='d-flex flex-wrap align-items-center justify-content-between gap-12 mb-24'>
          <span className='text-neutral-700'>{greeting}</span>
          <div className='d-flex align-items-center gap-12'>
            {activeLiveClasses.length > 0 && (
              <span className="badge bg-danger bg-opacity-10 text-danger px-3 py-2 rounded-pill d-flex align-items-center animate__animated animate__pulse animate__infinite">
                <span className="spinner-grow spinner-grow-sm me-2" role="status" aria-hidden="true"></span>
                {activeLiveClasses.length} Live Class{activeLiveClasses.length > 1 ? 'es' : ''} Now
              </span>
            )}
            {!state.loading && !state.error && (
              <span className='badge bg-main-25 text-main-600 px-16 py-8 rounded-pill text-sm fw-semibold'>
                {enrolledLabel}
              </span>
            )}
            <button
              type='button'
              className='btn btn-outline-main py-12 px-24 rounded-pill flex-align gap-8 fw-semibold'
              onClick={handleRefresh}
            >
              <i className='ph-bold ph-arrow-clockwise d-flex text-lg' />
              Refresh list
            </button>
          </div>
        </div>
        <div className='row gy-4'>
          {state.loading ? (
            <div className='col-12'>
              <div className='text-center py-80'>
                <p className='text-neutral-600 mb-0'>Loading your courses...</p>
              </div>
            </div>
          ) : state.error ? (
            <div className='col-12'>
              <div className='text-center py-80'>
                <p className='text-danger-600 mb-12'>{state.error}</p>
                <button
                  type='button'
                  className='btn btn-main py-12 px-32 rounded-pill'
                  onClick={handleRefresh}
                >
                  Try again
                </button>
              </div>
            </div>
          ) : visibleItems.length === 0 ? (
            <div className='col-12'>
              <div className='text-center py-80'>
                <p className='text-neutral-600 mb-16'>0 courses enrolled</p>
                <Link
                  to='/our-courses'
                  className='btn btn-main py-12 px-32 rounded-pill text-md fw-semibold'
                  aria-label='Browse Our Courses'
                >
                  Our Courses
                </Link>
              </div>
            </div>
          ) : (
            visibleItems.map((enrollment) => {
              const course = enrollment.course || {};
              const courseName = normalizeText(course.name);
              const courseUrl = enrollment?.course?.slug ? `/${enrollment.course.slug}` : '/our-courses';
              const paymentStatus = toTitleCase(enrollment.paymentStatus || enrollment.payment_status);
              const enrollmentStatus = toTitleCase(enrollment.status);
              const enrolledAt = formatDate(enrollment.enrolledAt || enrollment.enrolled_at);
              const initials = getInitials(courseName);

              // Fix: Handle both string imageUrl and object image.url
              let imageUrl = '';
              if (typeof course.imageUrl === 'string' && course.imageUrl.trim()) {
                imageUrl = course.imageUrl.trim();
              } else if (course.image && typeof course.image.url === 'string') {
                imageUrl = course.image.url.trim();
              }

              const amount = normalizeAmount(enrollment);
              const badgeClass = (type) => {
                if (type === 'PAID' || type === 'Paid') return 'bg-main-25 text-main-600';
                if (type === 'FAILED' || type === 'Failed') return 'bg-danger-50 text-danger-700';
                if (type === 'PENDING' || type === 'Pending' || type === 'Processing') return 'bg-warning-50 text-warning-700';
                if (type === 'ACTIVE' || type === 'Active') return 'bg-success-50 text-success-600';
                if (type === 'CANCELLED' || type === 'Cancelled') return 'bg-neutral-100 text-neutral-700';
                return 'bg-neutral-100 text-neutral-700';
              };

              return (
                <div className='col-xl-4 col-lg-6 col-sm-6' key={enrollment.id}>
                  <div className='rounded-24 border border-neutral-40 bg-white p-24 h-100 box-shadow-md'>
                    <div className='d-flex justify-content-center mb-12'>
                      {imageUrl ? (
                        <Link to={courseUrl} className='rounded-24 overflow-hidden d-inline-block' aria-label={`Open ${courseName}`}>
                          <img
                            src={imageUrl}
                            alt={`${courseName} thumbnail`}
                            style={{ display: 'block', height: 'auto', maxWidth: '100%' }}
                          />
                        </Link>
                      ) : (
                        <Link to={courseUrl} className='px-16 py-8 rounded-pill bg-main-25 text-main-700 fw-semibold text-decoration-none' aria-label={`Open ${courseName}`}>
                          {initials}
                        </Link>
                      )}
                    </div>
                    <h4 className='mb-8 text-neutral-900'>
                      <Link to={courseUrl} className='text-neutral-900 text-decoration-none hover-text-decoration-underline'>
                        {courseName}
                      </Link>
                    </h4>
                    {(() => {
                      const courseSlug = course.slug || enrollment?.course?.slug;
                      const activeClass = getActiveRoom(courseSlug, courseName);
                      if (activeClass && activeClass.joinUrl) {
                        return (
                          <div className="mb-3">
                            <a 
                              href={activeClass.joinUrl} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="btn btn-danger btn-sm w-100 rounded-pill d-flex align-items-center justify-content-center fw-bold animate__animated animate__pulse animate__infinite"
                            >
                              <i className="ph-bold ph-broadcast me-2"></i> Join Live Class
                            </a>
                          </div>
                        );
                      }
                      return null;
                    })()}
                    {enrolledAt ? (
                      <div className='text-neutral-600 d-flex align-items-center gap-8 mb-12'>
                        <i className='ph-bold ph-calendar-blank text-main-600' />
                        <span>Enrolled on {enrolledAt}</span>
                      </div>
                    ) : null}
                    {amount > 0 ? (
                      <div className='d-flex align-items-center gap-8 mb-8'>
                        <i className='ph-bold ph-currency-circle-dollar text-main-600' />
                        <span className='fw-semibold text-neutral-900'>{formatINR(amount)}</span>
                        <span className='text-neutral-600 text-sm'>(incl. GST)</span>
                      </div>
                    ) : null}
                    <div className='d-flex flex-wrap gap-10 mb-8'>
                      <span className={`badge px-16 py-8 rounded-pill text-sm fw-semibold ${badgeClass(paymentStatus)}`}>
                        {paymentStatus || 'Paid'}
                      </span>
                      <span className={`badge px-16 py-8 rounded-pill text-sm fw-semibold ${badgeClass(enrollmentStatus)}`}>
                        {enrollmentStatus || 'Active'}
                      </span>
                    </div>
                    <div className='pt-16 mt-12 border-top border-neutral-100 d-flex align-items-center justify-content-between'>
                      <div className='d-flex flex-column'>
                        <span className='text-sm text-neutral-500'>Need another course?</span>
                        <Link to='/our-courses' className='text-md text-main-600 fw-semibold hover-text-decoration-underline'>
                          Continue learning
                        </Link>
                      </div>
                      {(paymentStatus === 'Paid' || paymentStatus === 'Active') ? (
                        <Link to={(enrollment?.course?.slug ? `/${enrollment.course.slug}` : '/our-courses')} className='text-main-600 fw-semibold d-inline-flex align-items-center gap-6 hover-text-decoration-underline' aria-label={`Go to ${courseName}`}>
                          Go to Course <i className='ph ph-arrow-right' />
                        </Link>
                      ) : (
                        <Link to={(enrollment?.course?.slug ? `/payment?course=${enrollment.course.slug}` : '/our-courses')} className='text-main-600 fw-semibold d-inline-flex align-items-center gap-6 hover-text-decoration-underline' aria-label={`Complete enrollment for ${courseName}`}>
                          Enroll Now <i className='ph ph-arrow-right' />
                        </Link>
                      )}
                    </div>
                    <div className='d-none'>{JSON.stringify(enrollment)}</div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Purchase summary removed as requested */}
      </div>
    </section >
  );
};

export default MyCoursesInner;

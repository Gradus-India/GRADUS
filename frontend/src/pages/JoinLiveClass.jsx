import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import HeaderOne from '../components/HeaderOne';
import FooterOne from '../components/FooterOne';
import Breadcrumb from '../components/Breadcrumb';
import Preloader from '../helper/Preloader';
import { useAuth } from '../context/AuthContext';
import { fetchMyEnrollments } from '../services/userService';

// Supabase Edge Function URL
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const LIVE_CLASS_API_URL = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/live-class-api` : null;

const JoinLiveClass = () => {
    const { roomId } = useParams();
    const { user, token, isAuthenticated } = useAuth();

    // Auth & Joining State
    const [loading, setLoading] = useState(false);
    const [joined, setJoined] = useState(false);
    const [authToken, setAuthToken] = useState(null);
    const [error, setError] = useState('');
    const [userName, setUserName] = useState('');

    // Access Control State
    const [checkingAccess, setCheckingAccess] = useState(true);
    const [accessGranted, setAccessGranted] = useState(false);
    const [roomDetails, setRoomDetails] = useState(null);

    // 1. Verify Enrollment Access on Mount
    useEffect(() => {
        if (!roomId) return;

        const checkAccess = async () => {
            setCheckingAccess(true);
            try {
                // Wait for AuthContext to resolve
                // If unauthenticated, the UI will show login prompt, 
                // but we can't check enrollment without a token.
                if (!isAuthenticated || !token) {
                    setCheckingAccess(false);
                    return;
                }

                // A. Fetch Room Details and verify enrollment via API
                // Use active-classes endpoint which already filters by enrollment
                const activeClassesRes = await fetch(`${LIVE_CLASS_API_URL}/active-classes`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                
                if (!activeClassesRes.ok) {
                    if (activeClassesRes.status === 401) {
                        setError('Please sign in to join live classes.');
                        setCheckingAccess(false);
                        return;
                    }
                    throw new Error('Failed to verify access');
                }

                const activeClassesData = await activeClassesRes.json();
                
                if (!activeClassesData.success) {
                    setError(activeClassesData.error || 'Failed to verify enrollment.');
                    setCheckingAccess(false);
                    return;
                }

                // B. Find the room in active classes (already filtered by enrollment)
                const activeClass = activeClassesData.classes?.find((cls) => cls.roomId === roomId);

                if (!activeClass) {
                    setError('You are not enrolled in this course or the class session has ended.');
                    setCheckingAccess(false);
                    return;
                }

                setRoomDetails({
                    id: activeClass.roomId,
                    name: activeClass.roomName || activeClass.courseName,
                    courseName: activeClass.courseName,
                    courseSlug: activeClass.courseSlug,
                });

                // Access granted - student is enrolled in this course
                setAccessGranted(true);
                
                // Pre-fill name from user profile
                if (user) {
                    const displayName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.name || user.email?.split('@')[0];
                    setUserName(displayName);
                }

            } catch (err) {
                console.error("Access check failed:", err);
                setError('Failed to verify enrollment. Please try again.');
            } finally {
                setCheckingAccess(false);
            }
        };

        checkAccess();
    }, [roomId, isAuthenticated, token, user]);


    const handleJoin = async () => {
        if (!userName.trim()) {
            setError('Please enter your name');
            return;
        }

        if (!LIVE_CLASS_API_URL) {
            setError('Live class service not configured');
            return;
        }

        setLoading(true);
        setError('');

        try {
            // Try to get Room Code first (preferred for 100ms Prebuilt)
            // Use student token for enrollment verification
            try {
                const codeRes = await fetch(`${LIVE_CLASS_API_URL}/get-room-codes/${roomId}`, {
                    method: 'GET',
                    headers: { 'Authorization': `Bearer ${token}` },
                });
                const codeData = await codeRes.json();
                if (codeData.success && codeData.codes) {
                    // Prioritize roles: student > guest > viewer
                    const guestCode = codeData.codes.student || codeData.codes.guest || codeData.codes.viewer;
                    if (guestCode) {
                        setAuthToken(guestCode);
                        setJoined(true);
                        setLoading(false);
                        return;
                    }
                }
            } catch (err) {
                console.warn("Failed to fetch room codes, falling back to token:", err);
            }

            // Fallback: Token Generation (with enrollment verification)
            const res = await fetch(`${LIVE_CLASS_API_URL}/get-token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`, // Use student token for enrollment verification
                },
                body: JSON.stringify({
                    roomId: roomId,
                    userId: `student-${user?.id || Date.now()}`,
                    role: 'student',
                }),
            });

            const data = await res.json();

            if (!data.success) {
                throw new Error(data.error || 'Failed to join class');
            }

            setAuthToken(data.token);
            setJoined(true);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    if (!roomId) {
        return (
            <>
                <Preloader />
                <HeaderOne />
                <section className="py-5 text-center"><div className="container"><h3>Invalid Link</h3><p>Please use a valid link shared by your instructor.</p></div></section>
                <FooterOne />
            </>
        );
    }

    // Access Check Loading State (Only if authenticated, otherwise show login prompt immediately)
    if (checkingAccess && isAuthenticated) {
        return (
            <>
                <Preloader />
                <HeaderOne />
                <Breadcrumb title="Checking Access" />
                <section className="py-5" style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="text-center">
                        <div className="spinner-border text-primary mb-3" role="status"></div>
                        <p className="text-muted fw-medium">Verifying your enrollment...</p>
                    </div>
                </section>
                <FooterOne />
            </>
        );
    }

    return (
        <>
            <Preloader />
            <HeaderOne />
            <Breadcrumb title="Join Live Class" />

            <section className="py-5" style={{ minHeight: '70vh' }}>
                <div className="container">
                    {!joined ? (
                        <div className="row justify-content-center">
                            <div className="col-md-6 col-lg-5">
                                <div className="card shadow border-0" style={{ borderRadius: '16px' }}>
                                    <div className="card-body p-5 text-center">
                                        <div className="mb-4">
                                            {/* Gradus Branding */}
                                            <img src="/assets/images/logo/logo.png" alt="Gradus" style={{ height: '50px' }} />
                                        </div>

                                        {!isAuthenticated ? (
                                            <div>
                                                <h5 className="mb-3">Login Required</h5>
                                                <p className="text-muted mb-4">Please sign in to join this live class.</p>
                                                <Link to="/sign-in" className="btn btn-primary w-100 mb-2">Sign In</Link>
                                            </div>
                                        ) : !accessGranted ? (
                                            <div>
                                                <div className="text-danger mb-3"><i className="ph-bold ph-lock-key display-4"></i></div>
                                                <h5 className="mb-2">Access Denied</h5>
                                                <p className="text-muted mb-4">{error || "You are not enrolled in this course."}</p>
                                                <Link to="/our-courses" className="btn btn-outline-primary w-100">Browse Courses</Link>
                                            </div>
                                        ) : (
                                            <>
                                                <h4 className="fw-bold mb-2">Welcome, {user?.firstName || 'Student'}!</h4>
                                                <p className="text-muted mb-4 small">
                                                    You are about to join <b>{roomDetails?.name ? roomDetails?.name.split('_')[0] : 'Live Class'}</b>.
                                                </p>

                                                {error && <div className="alert alert-danger mb-3 small">{error}</div>}

                                                <div className="mb-4 text-start">
                                                    <label className="form-label small text-muted">Display Name</label>
                                                    <input
                                                        type="text"
                                                        className="form-control form-control-lg bg-light border-0"
                                                        placeholder="Your Name"
                                                        value={userName}
                                                        onChange={(e) => setUserName(e.target.value)}
                                                        onKeyPress={(e) => e.key === 'Enter' && handleJoin()}
                                                    />
                                                </div>

                                                <button
                                                    className="btn btn-primary btn-lg w-100 fw-bold shadow-sm"
                                                    onClick={handleJoin}
                                                    disabled={loading}
                                                    style={{ borderRadius: '10px' }}
                                                >
                                                    {loading ? (
                                                        <>
                                                            <span className="spinner-border spinner-border-sm me-2"></span>
                                                            Connecting...
                                                        </>
                                                    ) : (
                                                        'Join Class Now'
                                                    )}
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div style={{ height: '80vh', background: '#000', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}>
                            {/* Logic to determine 100ms domain */}
                            {(() => {
                                const domainConfig = import.meta.env.VITE_HMS_SYSTEM_SUBDOMAIN || 'gradus.app.100ms.live';
                                const fullDomain = domainConfig.includes('.') ? domainConfig : `${domainConfig}.app.100ms.live`;

                                const isCode = authToken?.length < 20;

                                const srcUrl = isCode
                                    ? `https://${fullDomain}/meeting/${authToken}?name=${encodeURIComponent(userName)}`
                                    : `https://${fullDomain}/meeting/${roomId}?token=${authToken}&name=${encodeURIComponent(userName)}`;

                                return (
                                    <iframe
                                        title="Live Class"
                                        src={srcUrl}
                                        style={{ width: '100%', height: '100%', border: 'none' }}
                                        allow="camera; microphone; fullscreen; display-capture; autoplay; screen-wake-lock"
                                    />
                                );
                            })()}
                        </div>
                    )}
                </div>
            </section>

            <FooterOne />
        </>
    );
};

export default JoinLiveClass;

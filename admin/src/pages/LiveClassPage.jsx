import { useState, useEffect } from 'react';
import MasterLayout from '../masterLayout/MasterLayout';
import useAuth from '../hook/useAuth';
import apiClient from '../services/apiClient';
import { SUPABASE_FUNCTIONS_URL, SUPABASE_ANON_KEY, HMS_SYSTEM_SUBDOMAIN } from '../config/env';

const LIVE_CLASS_API_URL = SUPABASE_FUNCTIONS_URL ? `${SUPABASE_FUNCTIONS_URL}/live-class-api` : null;

const normalizeRole = (role) => (role ? String(role).toLowerCase() : "");

const LiveClassPage = () => {
    const { token, admin } = useAuth();
    const [loading, setLoading] = useState(false);
    const [activeRoom, setActiveRoom] = useState(null);
    const [rooms, setRooms] = useState([]);
    const [error, setError] = useState('');
    const [courses, setCourses] = useState([]);
    const [selectedCourse, setSelectedCourse] = useState('');
    const [loadingCourses, setLoadingCourses] = useState(true);
    const [handRaises, setHandRaises] = useState([]);
    const [attendance, setAttendance] = useState([]);

    // Check if 100ms is configured
    const isConfigured = !!LIVE_CLASS_API_URL;

    // Fetch courses and active rooms on mount
    useEffect(() => {
        fetchCourses();
        if (isConfigured) {
            fetchRooms();
        }
    }, [isConfigured]);

    // Poll recording status and hand raises when room is active
    useEffect(() => {
        if (!activeRoom || !token) return;
        
        const interval = setInterval(async () => {
            try {
                // Get hand raises if we have session ID
                if (activeRoom.sessionId) {
                    const handRaisesRes = await fetch(`${LIVE_CLASS_API_URL}/hand-raises/${activeRoom.sessionId}`, {
                        headers: { Authorization: `Bearer ${token}` },
                    });
                    if (handRaisesRes.ok) {
                        const handRaisesData = await handRaisesRes.json();
                        if (handRaisesData.success) {
                            setHandRaises(handRaisesData.handRaises || []);
                        }
                    }
                    
                    // Get attendance
                    const attendanceRes = await fetch(`${LIVE_CLASS_API_URL}/attendance/${activeRoom.sessionId}`, {
                        headers: { Authorization: `Bearer ${token}` },
                    });
                    if (attendanceRes.ok) {
                        const attendanceData = await attendanceRes.json();
                        if (attendanceData.success) {
                            setAttendance(attendanceData.attendance || []);
                        }
                    }
                }
            } catch (err) {
                console.error('Failed to fetch session data:', err);
            }
        }, 5000); // Poll every 5 seconds
        
        return () => clearInterval(interval);
    }, [activeRoom, token, LIVE_CLASS_API_URL]);

    const fetchCourses = async () => {
        setLoadingCourses(true);
        try {
            const data = await apiClient('/admin/courses', { token });
            let courseList = [];
            if (Array.isArray(data)) {
                courseList = data;
            } else if (data && typeof data === 'object') {
                courseList = data.items || data.courses || data.data || [];
            }
            setCourses(courseList);
        } catch (err) {
            console.error('Failed to fetch courses:', err);
            setCourses([]);
        } finally {
            setLoadingCourses(false);
        }
    };

    const fetchRooms = async () => {
        if (!token) return;
        try {
            const res = await fetch(`${LIVE_CLASS_API_URL}/rooms`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            if (data.success) {
                setRooms(data.rooms || []);
            } else if (data.error && data.error.includes('Access denied')) {
                setError('You do not have permission to access live classes. Only teachers can access this feature.');
            }
        } catch (err) {
            console.error('Failed to fetch rooms:', err);
        }
    };

    const handleStartClass = async () => {
        if (!selectedCourse) {
            setError('Please select a course to start the session.');
            return;
        }

        const course = courses.find(c => (c.id === selectedCourse || c.course_key === selectedCourse || c.slug === selectedCourse));
        if (!course) {
            setError('Course not found');
            return;
        }
        
        const rawCourseName = course?.title || course?.name || 'Live Class';
        const courseName = rawCourseName.replace(/[^a-zA-Z0-9 ]/g, '');
        // Get the actual course slug - prefer slug, fallback to id if slug doesn't exist
        const courseSlug = course.slug || course.id || selectedCourse;

        setLoading(true);
        setError('');

        try {
            // Room Name strict sanitization
            const safeName = rawCourseName.replace(/[^a-zA-Z0-9.\-_]/g, '_');
            const timestamp = new Date().toISOString().replace(/[^a-zA-Z0-9.\-_]/g, '_');
            const roomName = `${safeName}_${timestamp}`.substring(0, 60);

            // 1. Create 100ms Room - Use admin token for authentication
            const createRes = await fetch(`${LIVE_CLASS_API_URL}/create-room`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    name: roomName,
                    description: `Live class for ${courseName} | Course: ${courseSlug}`,
                    courseSlug: courseSlug,
                    courseName: courseName,
                }),
            });

            const createData = await createRes.json();
            console.log("Room Created Response:", createData);

            if (!createData.success) {
                throw new Error(createData.error || 'Failed to create room_');
            }

            // 2. Determine Role - Force teacher role
            const codes = createData.room.codes || {};
            const availableRoles = Object.keys(codes);
            console.log("Available Roles in Template:", availableRoles);

            // Always use teacher role - find teacher role code or fallback to host/broadcaster
            const teacherRole = availableRoles.find(r =>
                ['teacher', 'instructor', 'host', 'broadcaster', 'presenter', 'moderator'].includes(r.toLowerCase())
            ) || availableRoles[0] || 'teacher';
            
            console.log("Teacher Role Selected:", teacherRole);

            // 3. Get Codes - Use teacher role code
            const hostCode = codes[teacherRole] || codes.host || codes.broadcaster || Object.values(codes)[0];
            const guestCode = codes.student || codes.guest || codes.viewer;

            let hmsToken = null;

            // 4. Auth Strategy: Prefer Room Code
            // Only generate token if NO CODE is available. 
            // This prevents "400 Bad Request" if the backend JWT signing keys are invalid.
            if (!hostCode) {
                console.log("No Room Code found. Attempting Token Generation...");
                try {
                    const tokenRes = await fetch(`${LIVE_CLASS_API_URL}/get-token`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${token}`, // Use admin token from useAuth
                        },
                        body: JSON.stringify({
                            roomId: createData.room.id,
                            userId: `instructor-${Date.now()}`,
                            role: teacherRole,
                        }),
                    });
                    const tokenData = await tokenRes.json();
                    if (tokenData.success) {
                        hmsToken = tokenData.token;
                    } else {
                        console.warn(`Token failed for role '${teacherRole}'.`);
                    }
                } catch (err) {
                    console.warn("Token API failed.", err);
                }
            } else {
                console.log("Using Room Code for Auth (Preferred). Skipping Token.");
            }

            // Verify we have at least one way to join
            if (!hmsToken && !hostCode) {
                throw new Error(`Failed to join: Role '${teacherRole}' has no Room Code and Token generation failed.`);
            }

            // Get session ID from database
            let sessionId = null;
            try {
                const sessionRes = await fetch(`${LIVE_CLASS_API_URL}/rooms`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                const sessionData = await sessionRes.json();
                if (sessionData.success) {
                    // Find session by room ID
                    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
                    if (supabaseUrl) {
                        // Session ID will be set when we create the session in the API
                        // For now, we'll use room ID as session identifier
                    }
                }
            } catch (err) {
                console.warn('Failed to get session ID:', err);
            }

            setActiveRoom({
                ...createData.room,
                token: hmsToken,
                hostCode: hostCode,
                guestCode: guestCode,
                instructorRole: teacherRole,
                courseName: courseName,
                sessionId: sessionId,
            });

        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };


    const handleAcknowledgeHandRaise = async (handRaiseId) => {
        if (!activeRoom?.sessionId || !token) return;
        try {
            const res = await fetch(`${LIVE_CLASS_API_URL}/hand-raise/${activeRoom.sessionId}/acknowledge`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ handRaiseId }),
            });
            const data = await res.json();
            if (data.success) {
                setHandRaises(prev => prev.filter((hr) => hr.id !== handRaiseId));
            }
        } catch (err) {
            console.error('Failed to acknowledge hand raise:', err);
        }
    };

    const handleEndClass = async () => {
        if (!activeRoom || !token) return;
        try {
            const res = await fetch(`${LIVE_CLASS_API_URL}/end-room/${activeRoom.id}`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            if (!data.success && data.error && data.error.includes('Access denied')) {
                setError('You do not have permission to end live classes. Only teachers can perform this action.');
                return;
            }
            setActiveRoom(null);
            setHandRaises([]);
            setAttendance([]);
            fetchRooms();
        } catch (err) {
            console.error('Failed to end class:', err);
            setError('Failed to end class session. Please try again.');
        }
    };

    const getStudentJoinLink = () => {
        if (!activeRoom) return '';

        // 1. Try to generate direct 100ms link (Preferred by user)
        // Format: https://<custom-domain>/meeting/<guest-code>
        const domainConfig = HMS_SYSTEM_SUBDOMAIN || 'gradus.app.100ms.live';
        const fullDomain = domainConfig.includes('.') ? domainConfig : `${domainConfig}.app.100ms.live`;

        if (activeRoom.guestCode) {
            return `https://${fullDomain}/meeting/${activeRoom.guestCode}`;
        }

        // 2. Fallback to internal frontend link
        const baseUrl = import.meta.env.VITE_PUBLIC_SITE_URL || window.location.origin.replace(':5174', ':5173');
        return `${baseUrl}/join-class/${activeRoom.id}`;
    };

    const copyJoinLink = () => {
        navigator.clipboard.writeText(getStudentJoinLink());
    };

    const getIframeUrl = () => {
        if (!activeRoom) return '';
        const domainConfig = HMS_SYSTEM_SUBDOMAIN || 'gradus.app.100ms.live';
        const fullDomain = domainConfig.includes('.') ? domainConfig : `${domainConfig}.app.100ms.live`;

        // PRIORITY: Use Room Code if available (safest standard method)
        if (activeRoom.hostCode) {
            return `https://${fullDomain}/meeting/${activeRoom.hostCode}`;
        }

        // Fallback: Use Token
        if (activeRoom.token) {
            return `https://${fullDomain}/meeting/${activeRoom.id}?token=${activeRoom.token}`;
        }

        return '';
    };

    // Check if user has teacher role
    const normalizedRole = normalizeRole(admin?.role);
    const isTeacher = normalizedRole === "teacher" || normalizedRole === "programmer_admin";
    
    // Show access denied if not teacher
    if (!isTeacher) {
        return (
            <MasterLayout>
                <div className="d-flex flex-column align-items-center justify-content-center" style={{ minHeight: '60vh' }}>
                    <div className="text-center">
                        <div className="mb-24 p-24 bg-danger-50 rounded-circle d-inline-flex">
                            <i className="ri-error-warning-line text-6xl text-danger-600" />
                        </div>
                        <h4 className="fw-semibold mb-8 text-neutral-800">Access Denied</h4>
                        <p className="text-secondary-light mb-32" style={{ maxWidth: '400px' }}>
                            Only teachers can access live classes. Please contact an administrator if you need access.
                        </p>
                    </div>
                </div>
            </MasterLayout>
        );
    }

    return (
        <MasterLayout>
            <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-24">
                <div className="d-flex align-items-center gap-3">
                    <span className="w-44-px h-44-px bg-primary-100 text-primary-600 d-flex justify-content-center align-items-center rounded-circle text-2xl">
                        <i className="ri-broadcast-line" />
                    </span>
                    <div>
                        <h6 className="fw-semibold mb-0">Live Studio</h6>
                        <p className="text-secondary-light mb-0 text-sm">Manage sessions and engage with students</p>
                    </div>
                </div>
                {isConfigured && activeRoom && (
                    <span className="text-sm fw-medium text-danger-600 bg-danger-100 px-12 py-4 radius-4 d-flex align-items-center gap-2">
                        <span className="w-8-px h-8-px bg-danger-600 rounded-circle animate-pulse" />
                        Live Now
                    </span>
                )}
            </div>

            {!isConfigured && (
                <div className="alert alert-warning d-flex align-items-center p-16 mb-24 gap-2 radius-8">
                    <i className="ri-error-warning-line text-xl" />
                    <div>
                        <h6 className="fw-semibold mb-0 text-warning-600">Configuration Missing</h6>
                        <p className="text-sm mb-0">100ms credentials are missing. Please add them to your Supabase project secrets.</p>
                    </div>
                </div>
            )}

            {error && (
                <div className="alert alert-danger d-flex align-items-center p-16 mb-24 gap-2 radius-8">
                    <i className="ri-close-circle-line text-xl" />
                    <div>
                        <h6 className="fw-semibold mb-0 text-danger-600">Error Occurred</h6>
                        <p className="text-sm mb-0">{error}</p>
                    </div>
                </div>
            )}

            {/* Main Content */}
            {!activeRoom ? (
                <div className="row gy-4">
                    <div className="col-xxl-8 col-xl-7">
                        <div className="card h-100">
                            <div className="card-body p-24 d-flex flex-column align-items-center justify-content-center text-center">
                                <div className="mb-24 p-24 bg-primary-50 rounded-circle d-inline-flex">
                                    <i className="ri-mic-2-line text-6xl text-primary-600" />
                                </div>

                                <h4 className="fw-semibold mb-8 text-neutral-800">Ready to go live?</h4>
                                <p className="text-secondary-light mb-32" style={{ maxWidth: '400px' }}>
                                    Select a course below to instantly create a secure classroom and invite your students.
                                </p>

                                <div className="w-100" style={{ maxWidth: '400px' }}>
                                    <div className="mb-24 text-start">
                                        <label className="form-label fw-semibold text-primary-light text-sm mb-8">Select Course</label>
                                        <select
                                            className="form-select form-control radius-8"
                                            value={selectedCourse}
                                            onChange={(e) => setSelectedCourse(e.target.value)}
                                            disabled={loadingCourses}
                                        >
                                            <option value="">Start typing or select...</option>
                                            {Array.isArray(courses) && courses.map((course) => (
                                                <option key={course.id || course.slug} value={course.slug || course.id}>
                                                    {course.name || course.title} {course.slug ? `(${course.slug})` : ''}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    <button
                                        className="btn btn-primary-600 w-100 radius-8 py-12 d-flex align-items-center justify-content-center gap-2"
                                        onClick={handleStartClass}
                                        disabled={loading || !isConfigured || !selectedCourse}
                                    >
                                        {loading ? (
                                            <>
                                                <span className="spinner-border spinner-border-sm" />
                                                Setting up...
                                            </>
                                        ) : (
                                            <>
                                                <i className="ri-broadcast-line text-lg" />
                                                Start Streaming
                                            </>
                                        )}
                                    </button>
                                    <p className="mt-16 text-xs text-secondary-light d-flex align-items-center justify-content-center gap-1">
                                        <i className="ri-shield-check-line" />
                                        Secured by 100ms Live Infrastructure
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="col-xxl-4 col-xl-5">
                        <div className="card h-100">
                            <div className="card-header border-bottom bg-base py-16 px-24">
                                <h6 className="text-lg fw-semibold mb-0">Recent Sessions</h6>
                            </div>
                            <div className="card-body p-0">
                                {rooms.length === 0 ? (
                                    <div className="p-24 text-center">
                                        <div className="w-44-px h-44-px bg-base rounded-circle d-inline-flex align-items-center justify-content-center mb-12">
                                            <i className="ri-history-line text-xl text-secondary-light" />
                                        </div>
                                        <p className="text-secondary-light text-sm mb-0">No recent class history found.</p>
                                    </div>
                                ) : (
                                    <div className="d-flex flex-column">
                                        {rooms.slice(0, 5).map((room) => (
                                            <div key={room.id} className="d-flex align-items-center justify-content-between p-16 border-bottom hover-bg-base transition-2">
                                                <div className="d-flex align-items-center gap-3">
                                                    <span className={`w-40-px h-40-px rounded-circle d-flex align-items-center justify-content-center text-xl shrink-0 ${room.enabled ? 'bg-success-100 text-success-600' : 'bg-gray-100 text-gray-400'}`}>
                                                        <i className={`ri-video-${room.enabled ? 'chat' : 'off'}-line`} />
                                                    </span>
                                                    <div className="flex-grow-1">
                                                        <h6 className="text-sm fw-medium mb-1 text-primary-light">{room.name.split('_')[0]}</h6>
                                                        <span className="text-xs text-secondary-light">
                                                            {new Date(room.created_at || room.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                    </div>
                                                </div>
                                                <span className={`text-xs px-8 py-4 radius-4 fw-medium ${room.enabled ? 'bg-success-100 text-success-600' : 'bg-gray-100 text-gray-500'}`}>
                                                    {room.enabled ? 'Live' : 'Ended'}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                // Live Active View
                <div className="card overflow-hidden">
                    <div className="card-header bg-white border-bottom py-16 px-24 d-flex justify-content-between align-items-center">
                        <div className="d-flex align-items-center gap-3">
                            <span className="bg-danger-100 text-danger-600 text-xs fw-bold px-10 py-6 radius-4 d-flex align-items-center gap-2 border border-danger-200">
                                <span className="w-8-px h-8-px bg-danger-600 rounded-circle animate-pulse" />
                                LIVE ON AIR
                            </span>
                            <div className="d-flex flex-column">
                                <h6 className="text-neutral-800 fw-bold mb-0 text-lg">
                                    {activeRoom.courseName || activeRoom.name}
                                </h6>
                            </div>
                        </div>
                        <div className="d-flex align-items-center gap-16 flex-wrap">
                            {/* Link Copy Component */}
                            <div className="d-none d-md-flex align-items-center gap-12 bg-neutral-50 px-16 py-8 radius-8 border border-neutral-200">
                                <span className="text-secondary-light text-xs fw-medium text-uppercase tracking-wider">Student Link:</span>
                                <div className="d-flex align-items-center gap-8 border-start border-neutral-300 ps-12">
                                    <span className="text-primary-600 text-sm fw-semibold text-truncate" style={{ maxWidth: '200px' }}>
                                        {getStudentJoinLink()}
                                    </span>
                                    <button
                                        className="btn btn-icon p-0 w-32-px h-32-px d-flex justify-content-center align-items-center radius-4 hover-bg-primary-50 text-primary-600 transition-2"
                                        onClick={copyJoinLink}
                                        title="Copy Link"
                                    >
                                        <i className="ri-file-copy-line text-lg" />
                                    </button>
                                </div>
                            </div>

                            {/* Hand Raises Badge */}
                            {handRaises.length > 0 && (
                                <div className="d-flex align-items-center gap-8 bg-warning-50 px-12 py-6 radius-8 border border-warning-200">
                                    <i className="ri-hand-raise-line text-warning-600 text-lg" />
                                    <span className="text-warning-700 text-sm fw-semibold">{handRaises.length}</span>
                                </div>
                            )}

                            {/* Attendance Badge */}
                            {attendance.length > 0 && (
                                <div className="d-flex align-items-center gap-8 bg-success-50 px-12 py-6 radius-8 border border-success-200">
                                    <i className="ri-user-line text-success-600 text-lg" />
                                    <span className="text-success-700 text-sm fw-semibold">{attendance.filter((a) => a.is_present).length}</span>
                                </div>
                            )}

                            <div className="w-1-px h-32-px bg-neutral-200 mx-8 d-none d-md-block"></div>

                            <button
                                className="btn btn-danger-600 radius-8 py-10 px-20 text-sm fw-semibold d-flex align-items-center gap-2 shadow-sm hover-shadow-md transition-2"
                                onClick={handleEndClass}
                            >
                                <i className="ri-stop-circle-fill text-lg" />
                                End Session
                            </button>
                        </div>
                    </div>
                    <div className="row g-0">
                        <div className="col-12 col-lg-9">
                    <div className="card-body p-0 bg-black position-relative" style={{ height: '75vh' }}>
                        <iframe
                            title="Live Class"
                            src={getIframeUrl()}
                            style={{ width: '100%', height: '100%', border: 'none' }}
                            allow="camera; microphone; fullscreen; display-capture; autoplay; screen-wake-lock"
                            allowFullScreen
                        />
                    </div>
                        </div>
                        <div className="col-12 col-lg-3 border-start">
                            <div className="card-body p-16" style={{ height: '75vh', overflowY: 'auto' }}>
                                {/* Hand Raises Panel */}
                                {handRaises.length > 0 && (
                                    <div className="mb-24">
                                        <h6 className="fw-semibold mb-12 d-flex align-items-center gap-2">
                                            <i className="ri-hand-raise-line text-warning-600" />
                                            Hand Raises ({handRaises.length})
                                        </h6>
                                        <div className="d-flex flex-column gap-8">
                                            {handRaises.map((hr) => (
                                                <div key={hr.id} className="d-flex align-items-center justify-content-between p-12 bg-warning-50 radius-8 border border-warning-200">
                                                    <div className="flex-grow-1">
                                                        <p className="text-sm fw-medium mb-0">
                                                            {hr.users?.first_name} {hr.users?.last_name}
                                                        </p>
                                                        <p className="text-xs text-secondary-light mb-0">
                                                            {new Date(hr.raised_at).toLocaleTimeString()}
                                                        </p>
                                                    </div>
                                                    <button
                                                        className="btn btn-sm btn-warning-600 radius-4"
                                                        onClick={() => handleAcknowledgeHandRaise(hr.id)}
                                                        title="Acknowledge"
                                                    >
                                                        <i className="ri-check-line" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Attendance Panel */}
                                {attendance.length > 0 && (
                                    <div>
                                        <h6 className="fw-semibold mb-12 d-flex align-items-center gap-2">
                                            <i className="ri-user-line text-success-600" />
                                            Attendance ({attendance.filter((a) => a.is_present).length}/{attendance.length})
                                        </h6>
                                        <div className="d-flex flex-column gap-6">
                                            {attendance.map((a) => (
                                                <div key={a.id} className="d-flex align-items-center gap-8 p-8 bg-base radius-4">
                                                    <span className={`w-8-px h-8-px rounded-circle ${a.is_present ? 'bg-success-600' : 'bg-gray-400'}`} />
                                                    <div className="flex-grow-1">
                                                        <p className="text-xs fw-medium mb-0">
                                                            {a.users?.first_name} {a.users?.last_name}
                                                        </p>
                                                        {a.duration_seconds > 0 && (
                                                            <p className="text-xs text-secondary-light mb-0">
                                                                {Math.floor(a.duration_seconds / 60)} min
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {handRaises.length === 0 && attendance.length === 0 && (
                                    <div className="text-center py-32">
                                        <i className="ri-information-line text-4xl text-secondary-light mb-12 d-block" />
                                        <p className="text-sm text-secondary-light mb-0">No active interactions</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </MasterLayout>
    );
};

export default LiveClassPage;

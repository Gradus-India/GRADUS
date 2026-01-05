import { useState, useEffect } from 'react';
import MasterLayout from '../masterLayout/MasterLayout';
import useAuth from '../hook/useAuth';
import { SUPABASE_FUNCTIONS_URL } from '../config/env';

const LIVE_CLASS_API_URL = SUPABASE_FUNCTIONS_URL ? `${SUPABASE_FUNCTIONS_URL}/live-class-api` : null;

const RecordingsPage = () => {
    const { token } = useAuth();
    const [recordings, setRecordings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedCourse, setSelectedCourse] = useState('');
    const [courses, setCourses] = useState([]);

    useEffect(() => {
        fetchCourses();
    }, []);

    useEffect(() => {
        if (selectedCourse) {
            fetchRecordings(selectedCourse);
        }
    }, [selectedCourse]);

    const fetchCourses = async () => {
        try {
            // Fetch courses from your API
            const res = await fetch('/admin/courses', {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            const courseList = Array.isArray(data) ? data : (data.items || data.courses || []);
            setCourses(courseList);
        } catch (err) {
            console.error('Failed to fetch courses:', err);
        }
    };

    const fetchRecordings = async (courseSlug: string) => {
        if (!LIVE_CLASS_API_URL || !token) return;
        
        setLoading(true);
        try {
            const res = await fetch(`${LIVE_CLASS_API_URL}/recordings/${courseSlug}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            if (data.success) {
                setRecordings(data.recordings || []);
            }
        } catch (err) {
            console.error('Failed to fetch recordings:', err);
        } finally {
            setLoading(false);
        }
    };

    const formatDuration = (ms: number) => {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        
        if (hours > 0) {
            return `${hours}h ${minutes % 60}m`;
        }
        return `${minutes}m ${seconds % 60}s`;
    };

    return (
        <MasterLayout>
            <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-24">
                <div className="d-flex align-items-center gap-3">
                    <span className="w-44-px h-44-px bg-primary-100 text-primary-600 d-flex justify-content-center align-items-center rounded-circle text-2xl">
                        <i className="ri-video-line" />
                    </span>
                    <div>
                        <h6 className="fw-semibold mb-0">Class Recordings</h6>
                        <p className="text-secondary-light mb-0 text-sm">View and manage recorded sessions</p>
                    </div>
                </div>
            </div>

            <div className="card">
                <div className="card-body p-24">
                    <div className="mb-24">
                        <label className="form-label fw-semibold mb-8">Select Course</label>
                        <select
                            className="form-select form-control radius-8"
                            value={selectedCourse}
                            onChange={(e) => setSelectedCourse(e.target.value)}
                        >
                            <option value="">Select a course...</option>
                            {courses.map((course) => (
                                <option key={course.slug || course.id} value={course.slug || course.id}>
                                    {course.name || course.title}
                                </option>
                            ))}
                        </select>
                    </div>

                    {loading ? (
                        <div className="text-center py-32">
                            <div className="spinner-border text-primary mb-3" role="status" />
                            <p className="text-secondary-light">Loading recordings...</p>
                        </div>
                    ) : recordings.length === 0 ? (
                        <div className="text-center py-32">
                            <i className="ri-video-off-line text-4xl text-secondary-light mb-12 d-block" />
                            <p className="text-secondary-light mb-0">
                                {selectedCourse ? 'No recordings found for this course.' : 'Select a course to view recordings.'}
                            </p>
                        </div>
                    ) : (
                        <div className="row gy-16">
                            {recordings.map((recording: any) => (
                                <div key={recording.id} className="col-12 col-md-6 col-lg-4">
                                    <div className="card border h-100">
                                        <div className="card-body p-16">
                                            <div className="d-flex align-items-start justify-content-between mb-12">
                                                <div className="flex-grow-1">
                                                    <h6 className="fw-semibold mb-4 text-truncate">
                                                        {recording.live_sessions?.title || recording.live_sessions?.course_name || 'Recording'}
                                                    </h6>
                                                    <p className="text-xs text-secondary-light mb-0">
                                                        {new Date(recording.created_at).toLocaleDateString()} at{' '}
                                                        {new Date(recording.created_at).toLocaleTimeString()}
                                                    </p>
                                                </div>
                                                <span className={`badge ${recording.status === 'completed' ? 'bg-success' : 'bg-warning'}`}>
                                                    {recording.status}
                                                </span>
                                            </div>
                                            
                                            {recording.duration_ms > 0 && (
                                                <div className="mb-12">
                                                    <span className="text-xs text-secondary-light">
                                                        <i className="ri-time-line" /> {formatDuration(recording.duration_ms)}
                                                    </span>
                                                </div>
                                            )}
                                            
                                            {recording.url && (
                                                <a
                                                    href={recording.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="btn btn-primary-600 btn-sm w-100 radius-8"
                                                >
                                                    <i className="ri-play-line me-2" />
                                                    Watch Recording
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </MasterLayout>
    );
};

export default RecordingsPage;


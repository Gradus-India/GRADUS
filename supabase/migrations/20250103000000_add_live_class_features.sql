-- Migration: Add Live Class Features (Recordings, Chat, Attendance)
-- This migration adds tables for recordings, chat messages, attendance tracking, and hand raising

-- ============================================================================
-- Live Recordings Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.live_recordings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id UUID REFERENCES public.live_sessions(id) ON DELETE CASCADE,
    admin_id UUID REFERENCES public.admin_users(id) ON DELETE SET NULL,
    recording_id TEXT NOT NULL, -- 100ms recording ID
    room_id TEXT NOT NULL, -- 100ms room ID
    url TEXT, -- Recording URL after completion
    duration_ms BIGINT DEFAULT 0,
    status TEXT DEFAULT 'recording' CHECK (status IN ('recording', 'completed', 'failed')),
    resolution_width INTEGER DEFAULT 1280,
    resolution_height INTEGER DEFAULT 720,
    format TEXT DEFAULT 'mp4',
    bytes BIGINT,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_live_recordings_session_id ON public.live_recordings(session_id);
CREATE INDEX IF NOT EXISTS idx_live_recordings_room_id ON public.live_recordings(room_id);
CREATE INDEX IF NOT EXISTS idx_live_recordings_status ON public.live_recordings(status);
CREATE INDEX IF NOT EXISTS idx_live_recordings_admin_id ON public.live_recordings(admin_id);

-- ============================================================================
-- Live Chat Messages Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.live_chat_messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id UUID REFERENCES public.live_sessions(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    admin_id UUID REFERENCES public.admin_users(id) ON DELETE SET NULL,
    participant_id TEXT, -- 100ms participant ID
    message TEXT NOT NULL,
    message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text', 'system', 'reaction')),
    is_teacher BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_live_chat_messages_session_id ON public.live_chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_live_chat_messages_user_id ON public.live_chat_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_live_chat_messages_created_at ON public.live_chat_messages(created_at);

-- ============================================================================
-- Live Attendance Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.live_attendance (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id UUID REFERENCES public.live_sessions(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    participant_id TEXT, -- 100ms participant ID
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    left_at TIMESTAMPTZ,
    duration_seconds INTEGER DEFAULT 0,
    is_present BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(session_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_live_attendance_session_id ON public.live_attendance(session_id);
CREATE INDEX IF NOT EXISTS idx_live_attendance_user_id ON public.live_attendance(user_id);
CREATE INDEX IF NOT EXISTS idx_live_attendance_is_present ON public.live_attendance(is_present);

-- ============================================================================
-- Live Hand Raises Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.live_hand_raises (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id UUID REFERENCES public.live_sessions(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    participant_id TEXT, -- 100ms participant ID
    raised_at TIMESTAMPTZ DEFAULT NOW(),
    acknowledged_at TIMESTAMPTZ,
    is_acknowledged BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_live_hand_raises_session_id ON public.live_hand_raises(session_id);
CREATE INDEX IF NOT EXISTS idx_live_hand_raises_user_id ON public.live_hand_raises(user_id);
CREATE INDEX IF NOT EXISTS idx_live_hand_raises_is_acknowledged ON public.live_hand_raises(is_acknowledged);

-- ============================================================================
-- Live Session Controls Table (for tracking session settings)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.live_session_controls (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id UUID REFERENCES public.live_sessions(id) ON DELETE CASCADE,
    locked BOOLEAN DEFAULT FALSE,
    waiting_room_enabled BOOLEAN DEFAULT FALSE,
    allow_student_audio BOOLEAN DEFAULT TRUE,
    allow_student_video BOOLEAN DEFAULT TRUE,
    allow_student_screen_share BOOLEAN DEFAULT TRUE,
    allow_chat BOOLEAN DEFAULT TRUE,
    allow_hand_raise BOOLEAN DEFAULT TRUE,
    recording_enabled BOOLEAN DEFAULT FALSE,
    recording_status TEXT DEFAULT 'stopped' CHECK (recording_status IN ('stopped', 'recording', 'paused')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(session_id)
);

CREATE INDEX IF NOT EXISTS idx_live_session_controls_session_id ON public.live_session_controls(session_id);

-- ============================================================================
-- Grants
-- ============================================================================
GRANT ALL ON TABLE public.live_recordings TO service_role;
GRANT SELECT ON TABLE public.live_recordings TO authenticated;
GRANT SELECT ON TABLE public.live_recordings TO anon;

GRANT ALL ON TABLE public.live_chat_messages TO service_role;
GRANT SELECT, INSERT ON TABLE public.live_chat_messages TO authenticated;
GRANT SELECT ON TABLE public.live_chat_messages TO anon;

GRANT ALL ON TABLE public.live_attendance TO service_role;
GRANT SELECT ON TABLE public.live_attendance TO authenticated;

GRANT ALL ON TABLE public.live_hand_raises TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.live_hand_raises TO authenticated;

GRANT ALL ON TABLE public.live_session_controls TO service_role;
GRANT SELECT ON TABLE public.live_session_controls TO authenticated;

-- ============================================================================
-- Update live_sessions table if needed (add missing columns)
-- ============================================================================
DO $$ 
BEGIN
    -- Add recording_enabled if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'live_sessions' AND column_name = 'recording_enabled'
    ) THEN
        ALTER TABLE public.live_sessions ADD COLUMN recording_enabled BOOLEAN DEFAULT FALSE;
    END IF;
    
    -- Add recording_status if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'live_sessions' AND column_name = 'recording_status'
    ) THEN
        ALTER TABLE public.live_sessions ADD COLUMN recording_status TEXT DEFAULT 'stopped';
    END IF;
END $$;


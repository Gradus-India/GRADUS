# Enrollment-Based Access Control for Live Classes

## Overview

Only enrolled students can see and join live classes for courses they're enrolled in. Students cannot access live classes for courses they haven't enrolled in.

## Implementation Details

### 1. **Active Classes Endpoint** (`/active-classes`)
- ✅ Filters by user's enrollments
- ✅ Only returns classes for courses where:
  - User has ACTIVE enrollment
  - Payment status is PAID
  - Course has an active live session
- ✅ Students only see their enrolled courses' live classes

### 2. **Join Live Class Page** (`/join-class/:roomId`)
- ✅ Verifies enrollment before allowing access
- ✅ Uses `/active-classes` endpoint to check if student is enrolled
- ✅ Shows "Access Denied" if not enrolled
- ✅ Only enrolled students can proceed to join

### 3. **Get Token Endpoint** (`/get-token`)
- ✅ Verifies enrollment for student roles
- ✅ Checks:
  - User is enrolled in the course
  - Enrollment is ACTIVE
  - Payment status is PAID
- ✅ Returns 403 if enrollment check fails

### 4. **Get Room Codes Endpoint** (`/get-room-codes/:roomId`)
- ✅ Verifies enrollment for students
- ✅ Teachers can access any room codes
- ✅ Students can only access codes for courses they're enrolled in

### 5. **My Courses Page**
- ✅ Uses `/active-classes` endpoint (enrollment-filtered)
- ✅ Only shows "Join Live Class" button for enrolled courses
- ✅ Students only see live classes for their courses

## Security Layers

1. **API Level**: All endpoints verify enrollment before granting access
2. **UI Level**: Frontend only displays classes for enrolled courses
3. **Token Level**: Token generation requires enrollment verification
4. **Database Level**: Queries filter by enrollment status and payment

## Enrollment Requirements

For a student to see/join a live class:
- ✅ Must be enrolled in the course
- ✅ Enrollment status must be `ACTIVE`
- ✅ Payment status must be `PAID`
- ✅ Course must have an active live session

## Access Denied Scenarios

Students will see "Access Denied" if:
- ❌ Not enrolled in the course
- ❌ Enrollment is not ACTIVE
- ❌ Payment status is not PAID
- ❌ Trying to access a different course's live class
- ❌ Session has ended

## Testing

To test enrollment-based access:
1. Create a live class for Course A
2. Student enrolled in Course A → Can see and join ✅
3. Student enrolled in Course B only → Cannot see Course A's class ❌
4. Student not enrolled → Cannot see any classes ❌


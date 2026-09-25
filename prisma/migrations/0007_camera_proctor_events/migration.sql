-- Camera proctoring facts. Additive only: the camera video itself is never
-- stored or uploaded; these values record that it was enabled, denied,
-- unavailable, stopped or restored.
-- AlterEnum


ALTER TYPE "ProctorEventType" ADD VALUE 'CAMERA_PERMISSION_GRANTED';
ALTER TYPE "ProctorEventType" ADD VALUE 'CAMERA_PERMISSION_DENIED';
ALTER TYPE "ProctorEventType" ADD VALUE 'CAMERA_UNAVAILABLE';
ALTER TYPE "ProctorEventType" ADD VALUE 'CAMERA_STREAM_STOPPED';
ALTER TYPE "ProctorEventType" ADD VALUE 'CAMERA_RESTORED';


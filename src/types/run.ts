export interface GpsPoint {
  lat: number;
  lng: number;
  altitude: number | null;
  accuracy: number;
  speed: number | null; // meters per second
  timestamp: number;
}

export interface KmSplit {
  km: number;
  splitTimeSeconds: number; // time taken for this single km
  totalElapsedSeconds: number; // elapsed time at this milestone
  avgPaceSeconds: number;
}

export type VisibilityLevel = 'public' | 'followers' | 'private';

export interface UserPrivacySettings {
  isProfilePublic?: boolean;
  defaultPublicRuns?: boolean;
  protectLocation?: boolean;
}

export interface RunData {
  id: string;
  userId: string;
  userDisplayName: string;
  userPhotoURL?: string | null;
  title: string;
  notes?: string;
  distanceKm: number; // in kilometers (e.g. 3.42)
  durationSeconds: number; // in seconds
  avgPaceSecondsPerKm: number; // seconds per km
  avgSpeedKmh: number; // km/h
  maxSpeedKmh: number; // km/h
  routePoints: GpsPoint[];
  splits: KmSplit[];
  photos?: string[]; // array of base64 photo data URLs
  protectLocation?: boolean;
  startedAt: string; // ISO string
  endedAt: string; // ISO string
  isPublic: boolean;
  visibility?: VisibilityLevel;
  createdAt: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string | null;
  username?: string;
  country?: string;
  city?: string;
  bio?: string;
  photos?: string[]; // gallery of running photos
  privacySettings?: UserPrivacySettings;
  totalRuns: number;
  totalDistanceKm: number;
  totalDurationSec: number;
  bestPaceSecPerKm?: number | null;
  longestDistanceKm?: number | null;
  followersCount?: number;
  followingCount?: number;
  createdAt: string;
  updatedAt?: string;
}

export type RunTrackingStatus = 'idle' | 'searching_gps' | 'running' | 'paused' | 'completed';

export interface AttachedRunSummary {
  runId: string;
  title: string;
  distanceKm: number;
  durationSeconds: number;
  avgPaceSecondsPerKm: number;
}

export interface CommunityPost {
  id: string;
  userId: string;
  authorName: string;
  authorUsername: string;
  authorPhotoURL: string | null;
  text: string;
  photoURL?: string | null;
  location?: string | null;
  runActivity?: AttachedRunSummary | null;
  visibility?: VisibilityLevel;
  likes: string[]; // array of user UIDs who liked
  commentsCount: number;
  savedBy?: string[]; // array of user UIDs who saved
  createdAt: string;
}

export interface PostComment {
  id: string;
  postId: string;
  userId: string;
  authorName: string;
  authorPhotoURL: string | null;
  text: string;
  createdAt: string;
}

export interface Follow {
  id: string;
  followerId: string;
  followingId: string;
  createdAt: string;
}

export interface AppNotification {
  id: string;
  recipientId: string;
  senderId: string;
  senderName: string;
  senderUsername?: string;
  senderPhotoURL: string | null;
  type: 'like' | 'comment' | 'follow' | 'friend_run' | 'achievement';
  postId?: string | null;
  message: string;
  read: boolean;
  createdAt: string;
}

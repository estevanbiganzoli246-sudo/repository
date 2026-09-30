import {
  collection,
  doc,
  setDoc,
  getDocs,
  getDoc,
  deleteDoc,
  query,
  where,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { handleFirestoreError, OperationType } from '../firebase/errorHandler';
import { RunData, UserProfile } from '../types/run';
import { formatDuration } from '../utils/geo';
import { communityService } from './communityService';

const OFFLINE_RUNS_QUEUE_KEY = 'runworld_offline_runs_queue';

export const runService = {
  /**
   * Saves a completed real run and updates aggregated user profile stats.
   * If offline, queues the run in localStorage and returns cleanly.
   */
  async saveRun(run: RunData, currentProfile: UserProfile | null): Promise<void> {
    const visibility = run.visibility || (run.isPublic ? 'public' : 'private');
    const runToSave: RunData = {
      ...run,
      visibility,
      isPublic: visibility === 'public',
    };

    // Check if network is offline
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      console.warn('Network offline: Queuing run in local storage for later sync.');
      this.queueOfflineRun(runToSave);
      return;
    }

    try {
      const runRef = doc(db, 'runs', runToSave.id);
      await setDoc(runRef, runToSave);

      if (currentProfile) {
        const userRef = doc(db, 'users', runToSave.userId);
        const newTotalRuns = (currentProfile.totalRuns || 0) + 1;
        const newTotalDistance = Number(((currentProfile.totalDistanceKm || 0) + runToSave.distanceKm).toFixed(2));
        const newTotalDuration = (currentProfile.totalDurationSec || 0) + runToSave.durationSeconds;

        let bestPace = currentProfile.bestPaceSecPerKm;
        if (runToSave.distanceKm >= 0.5 && runToSave.avgPaceSecondsPerKm > 0) {
          if (!bestPace || runToSave.avgPaceSecondsPerKm < bestPace) {
            bestPace = Math.round(runToSave.avgPaceSecondsPerKm);
          }
        }

        let longestDistance = currentProfile.longestDistanceKm || 0;
        if (runToSave.distanceKm > longestDistance) {
          longestDistance = Number(runToSave.distanceKm.toFixed(2));
        }

        await updateDoc(userRef, {
          totalRuns: newTotalRuns,
          totalDistanceKm: newTotalDistance,
          totalDurationSec: newTotalDuration,
          bestPaceSecPerKm: bestPace,
          longestDistanceKm: longestDistance,
          updatedAt: new Date().toISOString(),
        });

        // Notify followers of friend's completed run if not private
        if (visibility !== 'private') {
          try {
            const followsRef = collection(db, 'follows');
            const q = query(followsRef, where('followingId', '==', runToSave.userId));
            const snap = await getDocs(q);
            const handle = currentProfile.username
              ? (currentProfile.username.startsWith('@') ? currentProfile.username : `@${currentProfile.username}`)
              : `@${currentProfile.displayName.replace(/\s+/g, '').toLowerCase()}`;

            snap.forEach((docSnap) => {
              const followerId = docSnap.data().followerId;
              communityService.createNotification({
                recipientId: followerId,
                senderId: runToSave.userId,
                senderName: currentProfile.displayName,
                senderUsername: handle,
                senderPhotoURL: currentProfile.photoURL || null,
                type: 'friend_run',
                message: `${handle} completó una carrera de ${runToSave.distanceKm} km en ${formatDuration(runToSave.durationSeconds)}`,
              }).catch((e) => console.warn('Could not notify follower:', e));
            });
          } catch (e) {
            console.warn('Followers notify error:', e);
          }
        }
      }
    } catch (error) {
      // If write fails due to connection drop, save offline
      this.queueOfflineRun(runToSave);
      handleFirestoreError(error, OperationType.WRITE, `runs/${runToSave.id}`);
    }
  },

  /**
   * Stores run in offline queue
   */
  queueOfflineRun(run: RunData) {
    try {
      const existing = this.getOfflineQueue();
      existing.push(run);
      localStorage.setItem(OFFLINE_RUNS_QUEUE_KEY, JSON.stringify(existing));
    } catch (err) {
      console.error('Failed to queue offline run:', err);
    }
  },

  getOfflineQueue(): RunData[] {
    try {
      const raw = localStorage.getItem(OFFLINE_RUNS_QUEUE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  /**
   * Syncs any queued offline runs when connection returns
   */
  async syncOfflineRuns(currentProfile: UserProfile | null): Promise<number> {
    const queue = this.getOfflineQueue();
    if (queue.length === 0) return 0;

    let syncedCount = 0;
    const remaining: RunData[] = [];

    for (const run of queue) {
      try {
        const runRef = doc(db, 'runs', run.id);
        await setDoc(runRef, run);
        syncedCount++;
      } catch (e) {
        console.error('Error syncing offline run:', e);
        remaining.push(run);
      }
    }

    localStorage.setItem(OFFLINE_RUNS_QUEUE_KEY, JSON.stringify(remaining));
    return syncedCount;
  },

  /**
   * Retrieves runs for a given user, strictly respecting visibility permissions:
   * - Author sees all their own runs (public, followers, private).
   * - Follower sees public and followers runs.
   * - Non-follower sees ONLY public runs.
   * - Private runs are never visible to non-authors.
   *
   * Database queries are tailored so non-public/unauthorized documents are filtered at the database level.
   */
  async getUserRuns(targetUserId: string, currentUserId?: string): Promise<RunData[]> {
    try {
      const runsRef = collection(db, 'runs');
      const isSelf = Boolean(currentUserId && currentUserId === targetUserId);
      let isFollowing = false;

      if (!isSelf && currentUserId) {
        isFollowing = await communityService.isFollowing(currentUserId, targetUserId);
      }

      // Automatically construct the query based on the requester's relationship:
      // If the requester is not the author and not following, filter explicitly for public activities at query level
      let q;
      if (isSelf) {
        q = query(runsRef, where('userId', '==', targetUserId));
      } else if (!isFollowing) {
        q = query(runsRef, where('userId', '==', targetUserId), where('isPublic', '==', true));
      } else {
        // Follower can access public and followers runs
        q = query(runsRef, where('userId', '==', targetUserId));
      }

      const querySnapshot = await getDocs(q);
      const runs: RunData[] = [];

      querySnapshot.forEach((docSnap) => {
        const run = docSnap.data() as RunData;
        const vis = run.visibility || (run.isPublic ? 'public' : 'private');

        if (isSelf) {
          runs.push(run);
        } else if (isFollowing) {
          // Exclude private runs completely
          if (vis === 'public' || vis === 'followers') {
            runs.push(run);
          }
        } else {
          // Only public runs for strangers/non-followers
          if (vis === 'public' || (run.isPublic && vis !== 'private' && vis !== 'followers')) {
            runs.push(run);
          }
        }
      });

      // Include any queued offline runs that match if viewing own runs
      if (isSelf) {
        const offline = this.getOfflineQueue().filter((r) => r.userId === targetUserId);
        runs.push(...offline);
      }

      // Sort newest first
      runs.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
      return runs;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `runs (user: ${targetUserId})`);
      return currentUserId === targetUserId
        ? this.getOfflineQueue().filter((r) => r.userId === targetUserId)
        : [];
    }
  },

  /**
   * Retrieves public and follower-permitted runs from other runners for explore section.
   * Ensures private runs are never returned and followers-only runs are only returned
   * if the requesting user actually follows the creator.
   */
  async getPublicRuns(currentUserId?: string): Promise<RunData[]> {
    try {
      const runsRef = collection(db, 'runs');
      const runsMap = new Map<string, RunData>();

      // 1. Always query public activities from the database directly
      const publicQuery = query(runsRef, where('isPublic', '==', true));
      const publicSnapshot = await getDocs(publicQuery);

      publicSnapshot.forEach((docSnap) => {
        const run = docSnap.data() as RunData;
        const vis = run.visibility || (run.isPublic ? 'public' : 'private');
        if (vis === 'public' || (run.isPublic && vis !== 'private' && vis !== 'followers')) {
          runsMap.set(run.id, run);
        }
      });

      // 2. If user is signed in, also retrieve follower-allowed runs from runners they follow
      if (currentUserId) {
        try {
          const followingIds = await communityService.getFollowingIds(currentUserId);
          if (followingIds.length > 0) {
            // Retrieve follower-scoped runs for the followed runners
            await Promise.all(
              followingIds.slice(0, 15).map(async (followedId) => {
                try {
                  const followerQuery = query(
                    runsRef,
                    where('userId', '==', followedId),
                    where('visibility', '==', 'followers')
                  );
                  const followerSnap = await getDocs(followerQuery);
                  followerSnap.forEach((docSnap) => {
                    const run = docSnap.data() as RunData;
                    runsMap.set(run.id, run);
                  });
                } catch (e) {
                  console.warn('Could not query follower runs for user:', followedId, e);
                }
              })
            );
          }

          // 3. Include user's own runs
          const ownQuery = query(runsRef, where('userId', '==', currentUserId));
          const ownSnap = await getDocs(ownQuery);
          ownSnap.forEach((docSnap) => {
            const run = docSnap.data() as RunData;
            runsMap.set(run.id, run);
          });
        } catch (authFollowErr) {
          console.warn('Error fetching followed user runs for explore feed:', authFollowErr);
        }
      }

      const visible = Array.from(runsMap.values());
      visible.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
      return visible;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, 'runs');
      return [];
    }
  },

  /**
   * Retrieves all registered real runners for the community leaderboard.
   */
  async getCommunityRunners(): Promise<UserProfile[]> {
    try {
      const usersRef = collection(db, 'users');
      const querySnapshot = await getDocs(usersRef);

      const runners: UserProfile[] = [];
      querySnapshot.forEach((docSnap) => {
        runners.push(docSnap.data() as UserProfile);
      });

      // Sort by total distance descending
      runners.sort((a, b) => (b.totalDistanceKm || 0) - (a.totalDistanceKm || 0));
      return runners;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, 'users');
      return [];
    }
  },

  /**
   * Deletes a user run.
   */
  async deleteRun(runId: string, userId: string): Promise<void> {
    try {
      const runRef = doc(db, 'runs', runId);
      await deleteDoc(runRef);

      // Remove from offline queue if present
      const queue = this.getOfflineQueue().filter((r) => r.id !== runId);
      localStorage.setItem(OFFLINE_RUNS_QUEUE_KEY, JSON.stringify(queue));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `runs/${runId}`);
    }
  },
};

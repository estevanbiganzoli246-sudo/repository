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
  arrayUnion,
  arrayRemove,
  increment,
  limit,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { handleFirestoreError, OperationType } from '../firebase/errorHandler';
import { CommunityPost, PostComment, Follow, AppNotification, UserProfile } from '../types/run';

export const communityService = {
  /**
   * Retrieves community feed posts ordered by date descending,
   * strictly enforcing privacy permissions:
   * - Public posts: visible to all
   * - Followers posts: visible to followers and author only
   * - Private posts: visible to author only (excluded from general feed)
   */
  async getPosts(currentUserId?: string): Promise<CommunityPost[]> {
    try {
      const postsRef = collection(db, 'posts');
      const querySnapshot = await getDocs(postsRef);

      const allPosts: CommunityPost[] = [];
      querySnapshot.forEach((docSnap) => {
        allPosts.push(docSnap.data() as CommunityPost);
      });

      // Get following IDs for current user to enforce follower permissions
      let followingSet = new Set<string>();
      if (currentUserId) {
        const followingIds = await this.getFollowingIds(currentUserId);
        followingSet = new Set(followingIds);
      }

      // Filter based on privacy permissions
      const visiblePosts = allPosts.filter((post) => {
        // Author can always see their own post
        if (currentUserId && post.userId === currentUserId) {
          return true;
        }

        const visibility = post.visibility || 'public';

        // Private posts are never visible to others
        if (visibility === 'private') {
          return false;
        }

        // Followers-only posts are only visible if current user follows author
        if (visibility === 'followers') {
          return currentUserId ? followingSet.has(post.userId) : false;
        }

        // Public posts are visible to all
        return true;
      });

      // Sort newest first
      visiblePosts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return visiblePosts;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, 'posts');
      return [];
    }
  },

  /**
   * Creates a new community post with explicit visibility setting
   */
  async createPost(
    postData: Omit<CommunityPost, 'id' | 'createdAt' | 'likes' | 'commentsCount' | 'savedBy'>
  ): Promise<CommunityPost> {
    const postId = `post_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newPost: CommunityPost = {
      ...postData,
      id: postId,
      visibility: postData.visibility || 'public',
      likes: [],
      commentsCount: 0,
      savedBy: [],
      createdAt: new Date().toISOString(),
    };

    try {
      const postRef = doc(db, 'posts', postId);
      await setDoc(postRef, newPost);
      return newPost;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `posts/${postId}`);
      throw error;
    }
  },

  /**
   * Toggles Like on a post and triggers a real notification to the author
   */
  async toggleLike(
    postId: string,
    postAuthorId: string,
    currentUserId: string,
    currentUserName: string,
    currentUserPhoto: string | null,
    currentUserUsername?: string
  ): Promise<boolean> {
    try {
      const postRef = doc(db, 'posts', postId);
      const postSnap = await getDoc(postRef);

      if (!postSnap.exists()) return false;
      const data = postSnap.data() as CommunityPost;
      const isLiked = data.likes && data.likes.includes(currentUserId);

      if (isLiked) {
        await updateDoc(postRef, {
          likes: arrayRemove(currentUserId),
        });
        return false;
      } else {
        await updateDoc(postRef, {
          likes: arrayUnion(currentUserId),
        });

        // Trigger notification if liking someone else's post
        if (postAuthorId !== currentUserId) {
          const handle = currentUserUsername ? `@${currentUserUsername.replace('@', '')}` : `@${currentUserName}`;
          await this.createNotification({
            recipientId: postAuthorId,
            senderId: currentUserId,
            senderName: currentUserName,
            senderUsername: handle,
            senderPhotoURL: currentUserPhoto,
            type: 'like',
            postId: postId,
            message: `${handle} le dio me gusta a tu publicación`,
          });
        }
        return true;
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `posts/${postId}`);
      return false;
    }
  },

  /**
   * Toggles Bookmark / Save on a post
   */
  async toggleSave(postId: string, currentUserId: string): Promise<boolean> {
    try {
      const postRef = doc(db, 'posts', postId);
      const postSnap = await getDoc(postRef);

      if (!postSnap.exists()) return false;
      const data = postSnap.data() as CommunityPost;
      const isSaved = data.savedBy && data.savedBy.includes(currentUserId);

      if (isSaved) {
        await updateDoc(postRef, {
          savedBy: arrayRemove(currentUserId),
        });
        return false;
      } else {
        await updateDoc(postRef, {
          savedBy: arrayUnion(currentUserId),
        });
        return true;
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `posts/${postId}`);
      return false;
    }
  },

  /**
   * Gets comments for a post
   */
  async getComments(postId: string): Promise<PostComment[]> {
    try {
      const commentsRef = collection(db, 'posts', postId, 'comments');
      const snap = await getDocs(commentsRef);

      const comments: PostComment[] = [];
      snap.forEach((docSnap) => {
        comments.push(docSnap.data() as PostComment);
      });

      comments.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      return comments;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `posts/${postId}/comments`);
      return [];
    }
  },

  /**
   * Adds comment to post and sends notification to post author
   */
  async addComment(
    postId: string,
    postAuthorId: string,
    commentData: Omit<PostComment, 'id' | 'createdAt'>,
    currentUserUsername?: string
  ): Promise<PostComment> {
    const commentId = `comment_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newComment: PostComment = {
      ...commentData,
      id: commentId,
      createdAt: new Date().toISOString(),
    };

    try {
      const commentRef = doc(db, 'posts', postId, 'comments', commentId);
      await setDoc(commentRef, newComment);

      const postRef = doc(db, 'posts', postId);
      await updateDoc(postRef, {
        commentsCount: increment(1),
      });

      if (postAuthorId !== commentData.userId) {
        const handle = currentUserUsername
          ? (currentUserUsername.startsWith('@') ? currentUserUsername : `@${currentUserUsername}`)
          : `@${commentData.authorName.replace(/\s+/g, '').toLowerCase()}`;

        await this.createNotification({
          recipientId: postAuthorId,
          senderId: commentData.userId,
          senderName: commentData.authorName,
          senderUsername: handle,
          senderPhotoURL: commentData.authorPhotoURL,
          type: 'comment',
          postId: postId,
          message: `${handle} comentó: "${commentData.text.substring(0, 45)}${commentData.text.length > 45 ? '...' : ''}"`,
        });
      }

      return newComment;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `posts/${postId}/comments/${commentId}`);
      throw error;
    }
  },

  /**
   * Follows a runner and notifies them in real-time
   */
  async followUser(
    currentUserId: string,
    targetUserId: string,
    currentUserName: string,
    currentUserPhoto: string | null,
    currentUserUsername?: string
  ): Promise<void> {
    const followId = `${currentUserId}_${targetUserId}`;
    try {
      const followRef = doc(db, 'follows', followId);
      const followDoc: Follow = {
        id: followId,
        followerId: currentUserId,
        followingId: targetUserId,
        createdAt: new Date().toISOString(),
      };
      await setDoc(followRef, followDoc);

      // Update counters if possible
      try {
        const targetUserRef = doc(db, 'users', targetUserId);
        await updateDoc(targetUserRef, { followersCount: increment(1) });
      } catch (e) {
        console.warn('Target user followersCount update note:', e);
      }

      try {
        const currentUserRef = doc(db, 'users', currentUserId);
        await updateDoc(currentUserRef, { followingCount: increment(1) });
      } catch (e) {
        console.warn('Current user followingCount update note:', e);
      }

      // Notify target user with real sender profile, name, and @username
      const handle = currentUserUsername
        ? (currentUserUsername.startsWith('@') ? currentUserUsername : `@${currentUserUsername}`)
        : `@${currentUserName.replace(/\s+/g, '').toLowerCase()}`;

      await this.createNotification({
        recipientId: targetUserId,
        senderId: currentUserId,
        senderName: currentUserName,
        senderUsername: handle,
        senderPhotoURL: currentUserPhoto,
        type: 'follow',
        message: `${handle} comenzó a seguirte`,
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `follows/${followId}`);
    }
  },

  /**
   * Unfollows a runner
   */
  async unfollowUser(currentUserId: string, targetUserId: string): Promise<void> {
    const followId = `${currentUserId}_${targetUserId}`;
    try {
      const followRef = doc(db, 'follows', followId);
      await deleteDoc(followRef);

      try {
        const targetUserRef = doc(db, 'users', targetUserId);
        await updateDoc(targetUserRef, { followersCount: increment(-1) });
      } catch (e) {
        console.warn('Target user followersCount decrement note:', e);
      }

      try {
        const currentUserRef = doc(db, 'users', currentUserId);
        await updateDoc(currentUserRef, { followingCount: increment(-1) });
      } catch (e) {
        console.warn('Current user followingCount decrement note:', e);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `follows/${followId}`);
    }
  },

  /**
   * Gets list of target user IDs followed by current user
   */
  async getFollowingIds(currentUserId: string): Promise<string[]> {
    try {
      const followsRef = collection(db, 'follows');
      const q = query(followsRef, where('followerId', '==', currentUserId));
      const snap = await getDocs(q);

      const following: string[] = [];
      snap.forEach((docSnap) => {
        const d = docSnap.data() as Follow;
        following.push(d.followingId);
      });
      return following;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, 'follows');
      return [];
    }
  },

  /**
   * Gets real suggestions: ONLY real users from database, prioritizing runners
   * that share mutual followers or active members that the user does NOT already follow.
   * NEVER invents mock users. If no users available, returns empty array.
   */
  async getRealSuggestions(currentUserId: string): Promise<UserProfile[]> {
    try {
      const [allUsersSnap, followingIds] = await Promise.all([
        getDocs(collection(db, 'users')),
        this.getFollowingIds(currentUserId),
      ]);

      const followingSet = new Set(followingIds);
      followingSet.add(currentUserId); // Don't suggest self

      const candidates: UserProfile[] = [];
      allUsersSnap.forEach((docSnap) => {
        const u = docSnap.data() as UserProfile;
        if (!followingSet.has(u.uid)) {
          candidates.push(u);
        }
      });

      // Sort candidates by total runs or total distance
      candidates.sort((a, b) => (b.totalRuns || 0) - (a.totalRuns || 0));
      return candidates.slice(0, 10);
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, 'users');
      return [];
    }
  },

  /**
   * Creates a notification for a user
   */
  async createNotification(
    data: Omit<AppNotification, 'id' | 'read' | 'createdAt'>
  ): Promise<void> {
    const notifId = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newNotif: AppNotification = {
      ...data,
      id: notifId,
      read: false,
      createdAt: new Date().toISOString(),
    };

    try {
      const notifRef = doc(db, 'notifications', notifId);
      await setDoc(notifRef, newNotif);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `notifications/${notifId}`);
    }
  },

  /**
   * Gets user notifications
   */
  async getUserNotifications(userId: string): Promise<AppNotification[]> {
    try {
      const notifsRef = collection(db, 'notifications');
      const q = query(notifsRef, where('recipientId', '==', userId));
      const snap = await getDocs(q);

      const notifs: AppNotification[] = [];
      snap.forEach((docSnap) => {
        notifs.push(docSnap.data() as AppNotification);
      });

      notifs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return notifs;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, 'notifications');
      return [];
    }
  },

  /**
   * Subscribes to real-time notification changes for a user
   */
  subscribeToUserNotifications(
    userId: string,
    callback: (notifs: AppNotification[]) => void
  ): Unsubscribe {
    const notifsRef = collection(db, 'notifications');
    const q = query(notifsRef, where('recipientId', '==', userId));

    return onSnapshot(
      q,
      (snapshot) => {
        const notifs: AppNotification[] = [];
        snapshot.forEach((docSnap) => {
          notifs.push(docSnap.data() as AppNotification);
        });
        notifs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        callback(notifs);
      },
      (error) => {
        console.warn('Notifications real-time listener note:', error);
      }
    );
  },

  /**
   * Marks a notification as read
   */
  async markNotificationRead(notifId: string): Promise<void> {
    try {
      const notifRef = doc(db, 'notifications', notifId);
      await updateDoc(notifRef, { read: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `notifications/${notifId}`);
    }
  },

  /**
   * Retrieves posts authored by a specific user, strictly respecting visibility permissions:
   * - Author sees all their own posts (public, followers, private).
   * - Other users who follow author see public and followers posts.
   * - Other users who do not follow author see ONLY public posts.
   * - Private posts are never visible to non-authors.
   *
   * Database queries filter out non-public posts automatically when the user is not following.
   */
  async getUserPosts(targetUserId: string, currentUserId?: string): Promise<CommunityPost[]> {
    try {
      const postsRef = collection(db, 'posts');
      const isSelf = Boolean(currentUserId && currentUserId === targetUserId);
      let isFollowing = false;

      if (!isSelf && currentUserId) {
        isFollowing = await this.isFollowing(currentUserId, targetUserId);
      }

      // Query database specifically: non-followers query explicitly for public posts
      let q;
      if (isSelf) {
        q = query(postsRef, where('userId', '==', targetUserId));
      } else if (!isFollowing) {
        q = query(postsRef, where('userId', '==', targetUserId), where('visibility', '==', 'public'));
      } else {
        q = query(postsRef, where('userId', '==', targetUserId));
      }

      const querySnapshot = await getDocs(q);
      const posts: CommunityPost[] = [];

      querySnapshot.forEach((docSnap) => {
        const post = docSnap.data() as CommunityPost;
        const vis = post.visibility || 'public';

        if (isSelf) {
          posts.push(post);
        } else if (isFollowing) {
          if (vis === 'public' || vis === 'followers') {
            posts.push(post);
          }
        } else {
          if (vis === 'public') {
            posts.push(post);
          }
        }
      });

      // Sort newest first
      posts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return posts;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `posts (user: ${targetUserId})`);
      return [];
    }
  },

  /**
   * Deletes a user's community post
   */
  async deletePost(postId: string, userId: string): Promise<void> {
    try {
      const postRef = doc(db, 'posts', postId);
      // Delete comments subcollection first if any
      try {
        const commentsRef = collection(db, 'posts', postId, 'comments');
        const commentsSnap = await getDocs(commentsRef);
        await Promise.all(commentsSnap.docs.map((d) => deleteDoc(d.ref)));
      } catch (err) {
        console.warn('Could not clean comments before deleting post:', err);
      }

      await deleteDoc(postRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `posts/${postId}`);
      throw error;
    }
  },

  /**
   * Updates caption/text of a post
   */
  async updatePostText(postId: string, text: string): Promise<void> {
    try {
      const postRef = doc(db, 'posts', postId);
      await updateDoc(postRef, { text });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `posts/${postId}`);
      throw error;
    }
  },

  /**
   * Gets a user's profile by their unique userId (uid)
   */
  async getUserProfileById(userId: string): Promise<UserProfile | null> {
    try {
      const userRef = doc(db, 'users', userId);
      const snap = await getDoc(userRef);
      if (snap.exists()) {
        return snap.data() as UserProfile;
      }
      return null;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `users/${userId}`);
      return null;
    }
  },

  /**
   * Calculates 100% REAL social counts for a user directly from Firestore
   * relations (never hardcoded, never stuck at 0 when data exists).
   */
  async getUserSocialStats(userId: string): Promise<{
    followersCount: number;
    followingCount: number;
    postsCount: number;
  }> {
    try {
      const followsRef = collection(db, 'follows');
      const postsRef = collection(db, 'posts');

      // Real followers: documents where followingId == userId
      const followersQuery = query(followsRef, where('followingId', '==', userId));
      // Real following: documents where followerId == userId
      const followingQuery = query(followsRef, where('followerId', '==', userId));
      // Real posts: documents where userId == userId
      const postsQuery = query(postsRef, where('userId', '==', userId));

      const [followersSnap, followingSnap, postsSnap] = await Promise.all([
        getDocs(followersQuery),
        getDocs(followingQuery),
        getDocs(postsQuery),
      ]);

      const followersCount = followersSnap.size;
      const followingCount = followingSnap.size;
      const postsCount = postsSnap.size;

      // Keep user document stats in sync when possible
      try {
        const userRef = doc(db, 'users', userId);
        await updateDoc(userRef, {
          followersCount,
          followingCount,
        });
      } catch {
        // Ignored if current user is not owner of user doc
      }

      return {
        followersCount,
        followingCount,
        postsCount,
      };
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `socialStats/${userId}`);
      return { followersCount: 0, followingCount: 0, postsCount: 0 };
    }
  },

  /**
   * Gets real list of users who follow a given userId
   */
  async getUserFollowersList(userId: string): Promise<UserProfile[]> {
    try {
      const followsRef = collection(db, 'follows');
      const q = query(followsRef, where('followingId', '==', userId));
      const snap = await getDocs(q);

      const followerIds: string[] = [];
      snap.forEach((docSnap) => {
        followerIds.push(docSnap.data().followerId);
      });

      if (followerIds.length === 0) return [];

      const profiles: UserProfile[] = [];
      await Promise.all(
        followerIds.map(async (fId) => {
          const u = await this.getUserProfileById(fId);
          if (u) profiles.push(u);
        })
      );

      return profiles;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `followers/${userId}`);
      return [];
    }
  },

  /**
   * Gets real list of users that a given userId is following
   */
  async getUserFollowingList(userId: string): Promise<UserProfile[]> {
    try {
      const followsRef = collection(db, 'follows');
      const q = query(followsRef, where('followerId', '==', userId));
      const snap = await getDocs(q);

      const followingIds: string[] = [];
      snap.forEach((docSnap) => {
        followingIds.push(docSnap.data().followingId);
      });

      if (followingIds.length === 0) return [];

      const profiles: UserProfile[] = [];
      await Promise.all(
        followingIds.map(async (fId) => {
          const u = await this.getUserProfileById(fId);
          if (u) profiles.push(u);
        })
      );

      return profiles;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `following/${userId}`);
      return [];
    }
  },

  /**
   * Checks whether current user is following target user
   */
  async isFollowing(currentUserId: string, targetUserId: string): Promise<boolean> {
    try {
      const followId = `${currentUserId}_${targetUserId}`;
      const followRef = doc(db, 'follows', followId);
      const snap = await getDoc(followRef);
      return snap.exists();
    } catch {
      return false;
    }
  },

  /**
   * Marks all user notifications as read
   */
  async markAllNotificationsRead(notifs: AppNotification[]): Promise<void> {
    const unread = notifs.filter((n) => !n.read);
    await Promise.all(
      unread.map((n) => {
        const notifRef = doc(db, 'notifications', n.id);
        return updateDoc(notifRef, { read: true }).catch((err) =>
          console.error('Error marking notif read:', err)
        );
      })
    );
  },
};

import { ref, update, remove, set, get } from "firebase/database";
import { database } from "../firebase";

export const sendFollowRequest = async (myUid: string, myName: string, myPhoto: string | null, targetUid: string) => {
  const requestRef = ref(database, `followRequests/${targetUid}/${myUid}`);
  await set(requestRef, {
    name: myName,
    photoURL: myPhoto,
    timestamp: Date.now()
  });
};

export const acceptFollowRequest = async (myUid: string, requesterUid: string) => {
  const updates: any = {};
  // Requester follows Me
  updates[`followers/${myUid}/${requesterUid}`] = true;
  updates[`following/${requesterUid}/${myUid}`] = true;
  
  // Check if I already follow them to make it a mutual "friendship"
  const followingCheck = await get(ref(database, `following/${myUid}/${requesterUid}`));
  if (followingCheck.exists()) {
    updates[`friends/${myUid}/${requesterUid}`] = true;
    updates[`friends/${requesterUid}/${myUid}`] = true;
  }

  // Clear request
  updates[`followRequests/${myUid}/${requesterUid}`] = null;
  await update(ref(database), updates);
};

export const rejectFollowRequest = async (myUid: string, requesterUid: string) => {
  await remove(ref(database, `followRequests/${myUid}/${requesterUid}`));
};

export const unfollowUser = async (myUid: string, targetUid: string) => {
  const updates: any = {};
  updates[`following/${myUid}/${targetUid}`] = null;
  updates[`followers/${targetUid}/${myUid}`] = null;
  // Break mutual friendship
  updates[`friends/${myUid}/${targetUid}`] = null;
  updates[`friends/${targetUid}/${myUid}`] = null;
  await update(ref(database), updates);
};

export const removeFollower = async (myUid: string, followerUid: string) => {
  const updates: any = {};
  updates[`followers/${myUid}/${followerUid}`] = null;
  updates[`following/${followerUid}/${myUid}`] = null;
  // Break mutual friendship
  updates[`friends/${myUid}/${followerUid}`] = null;
  updates[`friends/${followerUid}/${myUid}`] = null;
  await update(ref(database), updates);
};

export const followBack = async (myUid: string, targetUid: string) => {
  const updates: any = {};
  // I follow Them
  updates[`followers/${targetUid}/${myUid}`] = true;
  updates[`following/${myUid}/${targetUid}`] = true;
  // This action by definition makes it mutual
  updates[`friends/${myUid}/${targetUid}`] = true;
  updates[`friends/${targetUid}/${myUid}`] = true;
  await update(ref(database), updates);
};
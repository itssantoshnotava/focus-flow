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
  await update(ref(database), updates);
};

export const removeFollower = async (myUid: string, followerUid: string) => {
  const updates: any = {};
  updates[`followers/${myUid}/${followerUid}`] = null;
  updates[`following/${followerUid}/${myUid}`] = null;
  await update(ref(database), updates);
};

export const followBack = async (myUid: string, targetUid: string) => {
  const updates: any = {};
  // I follow Them
  updates[`followers/${targetUid}/${myUid}`] = true;
  updates[`following/${myUid}/${targetUid}`] = true;
  await update(ref(database), updates);
};
